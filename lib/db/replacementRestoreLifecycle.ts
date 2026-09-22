import { drizzle } from "drizzle-orm/expo-sqlite";
import * as Expo from "expo";
import * as Notifications from "expo-notifications";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

import { getNativeProcessToken } from "../native/appProcessIdentity";
import {
  getRestTimerNavigationGeneration,
  retireRestTimerArtifactsForReplacementRestore,
} from "../native/restTimerNotifications";
import { readRestoreControlRecord } from "../native/restoreControlStore";
import {
  beginRestTimerNavigationQuarantine,
  endRestTimerNavigationQuarantine,
} from "../restTimerNavigationGuard";
import { timerStore } from "../timerStore";
import { initializeDatabase } from "./bootstrap";
import { publishDatabaseBindings } from "./connection";
import {
  type DatabaseLifecycleFailure,
  type DatabaseStartupAction,
  type DatabaseStartupActionKind,
  type DatabaseStartupSnapshot,
  type ReplacementRestoreAvailability,
  ReplacementRestoreError,
  type ReplacementRestoreLifecycleFacade,
  type RestoreCancelled,
  type RestoreScheduled,
  type RestoreScheduleOptions,
  type RestoreStartupResult,
} from "./replacementRestoreContract";
import {
  applyScheduledReplacementRestoreAtStartup,
  cancelScheduledReplacementRestore,
  completeReplacementRestorePostCommit,
  discardPreparedRestore,
  discardSafelyFailedScheduledRestore,
  resumeCommittedStartupFinalization,
  scheduleReplacementRestore,
} from "./replacementRestore";

const STARTING_SNAPSHOT: DatabaseStartupSnapshot = {
  phase: "starting",
  connectionInitialized: false,
  canMountApp: false,
};

const READY_SNAPSHOT: DatabaseStartupSnapshot = {
  phase: "ready",
  connectionInitialized: true,
  canMountApp: true,
};

type ReloadReceipt =
  | { readonly kind: "cancel_and_reload"; readonly restoreId: string }
  | {
      readonly kind: "discard_and_reload";
      readonly restoreId: string;
      readonly recoveryToken: string;
    };

let snapshot: DatabaseStartupSnapshot = STARTING_SNAPSHOT;
let liveSqlite: SQLiteDatabase | undefined;
let bindingsInitialized = false;
let reloadReceipt: ReloadReceipt | undefined;
let actionTail: Promise<void> = Promise.resolve();
let scheduleOperationActive = false;
const listeners = new Set<() => void>();

class SafeScheduleLifecycleError extends Error {
  readonly code = "lifecycle_schedule_precondition_failed";
  readonly stage = "scheduling";
  readonly liveDatabaseChanged = false;
  readonly transactionState = "not_started";
  readonly recovery = "discard_and_reprepare";
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Replacement restore was not scheduled.");
    this.name = "SafeScheduleLifecycleError";
    this.cause = cause;
  }
}

function publish(next: DatabaseStartupSnapshot): void {
  if (snapshot === next) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function lifecycleFailure(options: {
  readonly stage: DatabaseLifecycleFailure["stage"];
  readonly connectionInitialized?: boolean;
  readonly restoreId?: string;
  readonly liveDatabaseChanged: boolean | "unknown";
  readonly recovery?: DatabaseLifecycleFailure["recovery"];
}): void {
  publish({
    phase: "blocked",
    connectionInitialized: options.connectionInitialized ?? bindingsInitialized,
    canMountApp: false,
    blocker: {
      status: "lifecycle_failed",
      stage: options.stage,
      restoreId: options.restoreId,
      liveDatabaseChanged: options.liveDatabaseChanged,
      recovery: options.recovery ?? "close_and_reopen",
    },
    allowedActions: [],
  });
}

function allowedActionsFor(result: RestoreStartupResult): readonly DatabaseStartupActionKind[] {
  if (result.status === "restart_required" && result.liveDatabaseChanged === false) {
    return ["cancel_and_reload"];
  }
  if (
    result.status === "failed" &&
    result.restoreId &&
    result.error.liveDatabaseChanged === false &&
    (result.error.transactionState === "not_started" ||
      result.error.transactionState === "rolled_back") &&
    result.error.recovery === "discard_and_reprepare" &&
    result.error.recoveryToken
  ) {
    return ["discard_and_reload"];
  }
  if (
    result.status === "committed_pending_cleanup" ||
    result.status === "committed_pending_outcome"
  ) {
    return ["retry_control_finalization"];
  }
  return [];
}

function publishBlockedResult(
  result: Extract<
    RestoreStartupResult,
    {
      status:
        | "restart_required"
        | "failed"
        | "committed_pending_cleanup"
        | "committed_pending_outcome";
    }
  >
): void {
  publish({
    phase: "blocked",
    connectionInitialized: bindingsInitialized,
    canMountApp: false,
    blocker: result,
    allowedActions: allowedActionsFor(result),
  });
}

function initializeBindings(
  liveDatabaseChanged: boolean | "unknown",
  restoreId?: string
): boolean {
  if (bindingsInitialized) return true;
  const sqlite = liveSqlite;
  if (!sqlite) {
    lifecycleFailure({
      stage: "open",
      restoreId,
      liveDatabaseChanged,
      recovery: "manual_recovery",
    });
    return false;
  }

  try {
    initializeDatabase(sqlite);
  } catch {
    lifecycleFailure({
      stage: "bootstrap",
      restoreId,
      liveDatabaseChanged: liveDatabaseChanged === true ? true : "unknown",
      recovery: "manual_recovery",
    });
    return false;
  }

  let nextDb: ReturnType<typeof drizzle>;
  try {
    nextDb = drizzle(sqlite);
  } catch {
    lifecycleFailure({
      stage: "bindings",
      restoreId,
      liveDatabaseChanged: liveDatabaseChanged === true ? true : "unknown",
      recovery: "manual_recovery",
    });
    return false;
  }

  try {
    publishDatabaseBindings(sqlite, nextDb);
    bindingsInitialized = true;
    return true;
  } catch {
    lifecycleFailure({
      stage: "bindings",
      restoreId,
      liveDatabaseChanged: liveDatabaseChanged === true ? true : "unknown",
      recovery: "manual_recovery",
    });
    return false;
  }
}

function publishPostCommit(restoreId: string): void {
  publish({
    phase: "postcommit",
    connectionInitialized: true,
    canMountApp: false,
    restoreId,
    requiresExplicitMediaScan: true,
  });
}

function finishStartupResult(result: RestoreStartupResult): void {
  switch (result.status) {
    case "no_pending":
      if (initializeBindings(false)) publish(READY_SNAPSHOT);
      return;
    case "committed":
    case "postcommit_pending":
      if (initializeBindings(true, result.restoreId)) publishPostCommit(result.restoreId);
      return;
    case "restart_required":
    case "failed":
    case "committed_pending_cleanup":
    case "committed_pending_outcome":
      publishBlockedResult(result);
      return;
  }
}

function changeStateBeforeEngine(): false | "unknown" {
  if (Platform.OS !== "android") return false;
  try {
    return readRestoreControlRecord("pending").status === "absent" &&
      readRestoreControlRecord("outcome").status === "absent"
      ? false
      : "unknown";
  } catch {
    return "unknown";
  }
}

function startDatabaseLifecycle(): void {
  try {
    liveSqlite = openDatabaseSync("LiftingLog.db");
  } catch {
    lifecycleFailure({ stage: "open", liveDatabaseChanged: changeStateBeforeEngine() });
    return;
  }

  try {
    liveSqlite.execSync("PRAGMA foreign_keys = ON;");
    liveSqlite.execSync("PRAGMA journal_mode = WAL;");
    liveSqlite.execSync("PRAGMA synchronous = NORMAL;");
  } catch {
    lifecycleFailure({ stage: "pragmas", liveDatabaseChanged: changeStateBeforeEngine() });
    return;
  }

  if (Platform.OS !== "android") {
    if (initializeBindings(false)) publish(READY_SNAPSHOT);
    return;
  }

  let result: RestoreStartupResult;
  try {
    result = applyScheduledReplacementRestoreAtStartup({
      sqlite: liveSqlite,
      nativeProcessToken: getNativeProcessToken(),
    });
  } catch {
    lifecycleFailure({ stage: "startup_engine", liveDatabaseChanged: "unknown" });
    return;
  }
  finishStartupResult(result);
}

function requireMatchingRestoreId(action: DatabaseStartupAction): DatabaseStartupSnapshot {
  const current = snapshot;
  const restoreId =
    current.phase === "blocked"
      ? current.blocker.restoreId
      : current.phase === "postcommit"
        ? current.restoreId
        : current.phase === "restored"
          ? current.result.restoreId
          : undefined;
  if (!restoreId || restoreId !== action.restoreId) {
    throw new Error("The database startup action is stale.");
  }
  return current;
}

function isMatchingReceipt(action: DatabaseStartupAction): boolean {
  if (!reloadReceipt || reloadReceipt.kind !== action.kind) return false;
  if (reloadReceipt.restoreId !== action.restoreId) return false;
  return (
    action.kind !== "discard_and_reload" ||
    (reloadReceipt.kind === "discard_and_reload" &&
      reloadReceipt.recoveryToken === action.recoveryToken)
  );
}

function proveControlAbsence(): boolean {
  return (
    readRestoreControlRecord("pending").status === "absent" &&
    readRestoreControlRecord("outcome").status === "absent"
  );
}

async function reloadBlockedApplication(): Promise<void> {
  if (typeof Expo.reloadAppAsync !== "function") {
    throw new Error("Application reload is unavailable.");
  }
  await Expo.reloadAppAsync("Replacement restore control state changed");
}

async function performReloadAction(
  action: Extract<DatabaseStartupAction, { kind: "cancel_and_reload" | "discard_and_reload" }>
): Promise<void> {
  const current = requireMatchingRestoreId(action);
  if (current.phase !== "blocked" || !current.allowedActions.includes(action.kind)) {
    throw new Error("The database startup action is not allowed.");
  }

  if (!isMatchingReceipt(action)) {
    if (action.kind === "cancel_and_reload") {
      await cancelScheduledReplacementRestore(action.restoreId);
      reloadReceipt = { kind: action.kind, restoreId: action.restoreId };
    } else {
      await discardSafelyFailedScheduledRestore({
        restoreId: action.restoreId,
        recoveryToken: action.recoveryToken,
      });
      reloadReceipt = {
        kind: action.kind,
        restoreId: action.restoreId,
        recoveryToken: action.recoveryToken,
      };
    }

    if (!proveControlAbsence()) {
      reloadReceipt = undefined;
      lifecycleFailure({
        stage: "control_presence",
        restoreId: action.restoreId,
        liveDatabaseChanged: false,
        recovery: "manual_recovery",
      });
      throw new Error("Restore control state could not be proven absent.");
    }
  }

  await reloadBlockedApplication();
}

async function performAction(action: DatabaseStartupAction): Promise<void> {
  const current = requireMatchingRestoreId(action);
  if (current.phase === "blocked" && current.blocker.status === "lifecycle_failed") {
    throw new Error("Startup recovery actions are unavailable after a lifecycle failure.");
  }

  switch (action.kind) {
    case "cancel_and_reload":
    case "discard_and_reload":
      await performReloadAction(action);
      return;
    case "retry_control_finalization": {
      if (
        current.phase !== "blocked" ||
        !current.allowedActions.includes("retry_control_finalization")
      ) {
        throw new Error("Committed restore finalization is not currently allowed.");
      }
      const result = resumeCommittedStartupFinalization({ restoreId: action.restoreId });
      finishStartupResult(result);
      return;
    }
    case "complete_media":
    case "skip_media": {
      if (current.phase !== "postcommit" || !liveSqlite) {
        throw new Error("Post-commit restore completion is not currently allowed.");
      }
      const restoreId = action.restoreId;
      const result = await completeReplacementRestorePostCommit({
        sqlite: liveSqlite,
        restoreId,
        mode: action.kind === "complete_media" ? "scan" : "skip",
        signal: action.kind === "complete_media" ? action.signal : undefined,
        onProgress: (progress) => {
          const latest = snapshot;
          if (latest.phase !== "postcommit" || latest.restoreId !== restoreId) return;
          publish({ ...latest, progress });
        },
      });
      const latest = snapshot;
      if (latest.phase !== "postcommit" || latest.restoreId !== restoreId) {
        throw new Error("Post-commit restore completion was superseded.");
      }
      publish({
        phase: "restored",
        connectionInitialized: true,
        canMountApp: false,
        result,
      });
      return;
    }
    case "acknowledge_completion":
      if (current.phase !== "restored") {
        throw new Error("Restore completion is not ready to acknowledge.");
      }
      publish(READY_SNAPSHOT);
      return;
  }
}

function recoverFromSafeScheduleFailure(): boolean {
  if (!proveControlAbsence()) return false;
  endRestTimerNavigationQuarantine();
  timerStore.activateWhenAppReady();
  return true;
}

async function discardPreparedAfterPreScheduleFailure(token: string): Promise<boolean> {
  try {
    await discardPreparedRestore(token);
    return true;
  } catch {
    return false;
  }
}

async function scheduleAndBlockOwned(
  options: RestoreScheduleOptions
): Promise<RestoreScheduled | RestoreCancelled> {
  beginRestTimerNavigationQuarantine();
  try {
    await timerStore.quiesceForReplacementRestore();
  } catch (error) {
    await discardPreparedAfterPreScheduleFailure(options.token);
    lifecycleFailure({
      stage: "timer_cleanup",
      connectionInitialized: true,
      liveDatabaseChanged: false,
    });
    throw error;
  }

  try {
    await retireRestTimerArtifactsForReplacementRestore();
  } catch (error) {
    const preparationRetired = await discardPreparedAfterPreScheduleFailure(options.token);
    if (preparationRetired && recoverFromSafeScheduleFailure()) {
      throw new SafeScheduleLifecycleError(error);
    } else {
      lifecycleFailure({
        stage: "native_retirement",
        connectionInitialized: true,
        liveDatabaseChanged: false,
      });
    }
    throw error;
  }

  try {
    if (typeof Notifications.clearLastNotificationResponseAsync !== "function") {
      throw new Error("Retained notification response clearing is unavailable.");
    }
    await Notifications.clearLastNotificationResponseAsync();
  } catch (error) {
    const preparationRetired = await discardPreparedAfterPreScheduleFailure(options.token);
    if (preparationRetired && recoverFromSafeScheduleFailure()) {
      throw new SafeScheduleLifecycleError(error);
    } else {
      lifecycleFailure({
        stage: "notification_cleanup",
        connectionInitialized: true,
        liveDatabaseChanged: false,
      });
    }
    throw error;
  }

  try {
    const result = await scheduleReplacementRestore(options);
    if (result.status === "restart_required") {
      publishBlockedResult(result);
      return result;
    }
    if (!recoverFromSafeScheduleFailure()) {
      lifecycleFailure({
        stage: "control_presence",
        connectionInitialized: true,
        liveDatabaseChanged: "unknown",
        recovery: "manual_recovery",
      });
      throw new Error("Restore scheduling cancellation could not prove control absence.");
    }
    return result;
  } catch (error) {
    if (snapshot.phase !== "ready") throw error;
    if (recoverFromSafeScheduleFailure()) throw error;

    if (error instanceof ReplacementRestoreError) {
      publishBlockedResult({ status: "failed", error });
    } else {
      lifecycleFailure({
        stage: "control_presence",
        connectionInitialized: true,
        liveDatabaseChanged: "unknown",
        recovery: "manual_recovery",
      });
    }
    throw error;
  }
}

function scheduleAndBlock(
  options: RestoreScheduleOptions
): Promise<RestoreScheduled | RestoreCancelled> {
  if (Platform.OS !== "android") {
    return Promise.reject(new Error("Replacement restore is unsupported on this platform."));
  }
  if (snapshot.phase !== "ready") {
    return Promise.reject(
      new Error("Replacement restore can only be scheduled while the app is ready.")
    );
  }
  if (scheduleOperationActive) {
    return Promise.reject(new Error("Replacement restore scheduling is already active."));
  }

  scheduleOperationActive = true;
  const operation = scheduleAndBlockOwned(options);
  return operation.finally(() => {
    scheduleOperationActive = false;
  });
}

export const replacementRestoreLifecycle: ReplacementRestoreLifecycleFacade = {
  getDatabaseStartupSnapshot: () => snapshot,
  subscribeDatabaseStartup(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  performDatabaseStartupAction(action) {
    const operation = actionTail.then(() => performAction(action));
    actionTail = operation.catch(() => undefined);
    return operation;
  },
  scheduleReplacementRestoreAndBlock: scheduleAndBlock,
  getReplacementRestoreAvailability(): ReplacementRestoreAvailability {
    if (Platform.OS !== "android") {
      return { available: false, reason: "unsupported_platform" };
    }
    try {
      if (
        !getNativeProcessToken() ||
        getRestTimerNavigationGeneration().status === "unavailable" ||
        readRestoreControlRecord("pending").status === "unavailable" ||
        readRestoreControlRecord("outcome").status === "unavailable"
      ) {
        return { available: false, reason: "native_unavailable" };
      }
    } catch {
      return { available: false, reason: "native_unavailable" };
    }
    if (snapshot.phase !== "ready") {
      return { available: false, reason: "startup_blocked" };
    }
    return { available: true };
  },
};

export const getDatabaseStartupSnapshot =
  replacementRestoreLifecycle.getDatabaseStartupSnapshot;
export const subscribeDatabaseStartup =
  replacementRestoreLifecycle.subscribeDatabaseStartup;
export const performDatabaseStartupAction =
  replacementRestoreLifecycle.performDatabaseStartupAction;
export const scheduleReplacementRestoreAndBlock =
  replacementRestoreLifecycle.scheduleReplacementRestoreAndBlock;
export const getReplacementRestoreAvailability =
  replacementRestoreLifecycle.getReplacementRestoreAvailability;

startDatabaseLifecycle();
