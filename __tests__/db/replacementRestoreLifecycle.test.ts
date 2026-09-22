/* eslint-disable @typescript-eslint/no-require-imports */

import type {
  ReplacementRestoreResult,
  RestoreStartupResult,
} from "../../lib/db/replacementRestoreContract";

const events: string[] = [];
let mockPlatformOs = "android";
let mockStartupResult: RestoreStartupResult;
let mockPendingStatus: "absent" | "present" | "unreadable" | "unavailable" = "absent";
let mockOutcomeStatus: "absent" | "present" | "unreadable" | "unavailable" = "absent";
let mockReloadExport: jest.Mock | undefined;
let mockClearResponseExport: jest.Mock | undefined;

const mockSqlite = { execSync: jest.fn() };
const mockDb = { select: jest.fn() };
const mockOpenDatabaseSync = jest.fn();
const mockDrizzle = jest.fn();
const mockInitializeDatabase = jest.fn();
const mockPublishBindings = jest.fn();
const mockApplyStartup = jest.fn();
const mockSchedule = jest.fn();
const mockCancel = jest.fn();
const mockDiscardPrepared = jest.fn();
const mockDiscardFailed = jest.fn();
const mockResume = jest.fn();
const mockComplete = jest.fn();
const mockReload = jest.fn();
const mockClearResponse = jest.fn();
const mockQuiesce = jest.fn();
const mockActivate = jest.fn();
const mockRetire = jest.fn();
const mockGetGeneration = jest.fn();
const mockGetProcessToken = jest.fn();
const mockReadControl = jest.fn();
const mockBeginQuarantine = jest.fn();
const mockEndQuarantine = jest.fn();

jest.mock("expo-sqlite", () => ({ openDatabaseSync: mockOpenDatabaseSync }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: mockDrizzle }));
jest.mock("expo", () => ({ get reloadAppAsync() { return mockReloadExport; } }));
jest.mock("expo-notifications", () => ({
  get clearLastNotificationResponseAsync() { return mockClearResponseExport; },
}));
jest.mock("react-native", () => ({
  Platform: { get OS() { return mockPlatformOs; } },
}));
jest.mock("../../lib/db/bootstrap", () => ({ initializeDatabase: mockInitializeDatabase }));
jest.mock("../../lib/db/connection", () => ({ publishDatabaseBindings: mockPublishBindings }));
jest.mock("../../lib/native/appProcessIdentity", () => ({
  getNativeProcessToken: mockGetProcessToken,
}));
jest.mock("../../lib/native/restTimerNotifications", () => ({
  getRestTimerNavigationGeneration: mockGetGeneration,
  retireRestTimerArtifactsForReplacementRestore: mockRetire,
}));
jest.mock("../../lib/native/restoreControlStore", () => ({
  readRestoreControlRecord: mockReadControl,
}));
jest.mock("../../lib/restTimerNavigationGuard", () => ({
  beginRestTimerNavigationQuarantine: mockBeginQuarantine,
  endRestTimerNavigationQuarantine: mockEndQuarantine,
}));
jest.mock("../../lib/timerStore", () => ({
  timerStore: {
    quiesceForReplacementRestore: mockQuiesce,
    activateWhenAppReady: mockActivate,
  },
}));
jest.mock("../../lib/db/replacementRestore", () => ({
  applyScheduledReplacementRestoreAtStartup: mockApplyStartup,
  scheduleReplacementRestore: mockSchedule,
  cancelScheduledReplacementRestore: mockCancel,
  discardPreparedRestore: mockDiscardPrepared,
  discardSafelyFailedScheduledRestore: mockDiscardFailed,
  resumeCommittedStartupFinalization: mockResume,
  completeReplacementRestorePostCommit: mockComplete,
}));

const processToken = "process-v1:123e4567-e89b-42d3-a456-426614174000";
const navigationGeneration = "timer-nav-v1:123e4567-e89b-42d3-a456-426614174000";

function resetHarness(result: RestoreStartupResult = { status: "no_pending", pendingPresence: "absent" }) {
  jest.resetModules();
  jest.clearAllMocks();
  events.length = 0;
  mockPlatformOs = "android";
  mockStartupResult = result;
  mockPendingStatus = "absent";
  mockOutcomeStatus = "absent";
  mockReloadExport = mockReload;
  mockClearResponseExport = mockClearResponse;

  mockOpenDatabaseSync.mockImplementation(() => {
    events.push("open");
    return mockSqlite;
  });
  mockSqlite.execSync.mockImplementation((sql: string) => events.push(`pragma:${sql}`));
  mockApplyStartup.mockImplementation(() => {
    events.push("engine");
    return mockStartupResult;
  });
  mockInitializeDatabase.mockImplementation(() => events.push("bootstrap"));
  mockDrizzle.mockImplementation(() => {
    events.push("drizzle");
    return mockDb;
  });
  mockPublishBindings.mockImplementation(() => events.push("publish-bindings"));
  mockGetProcessToken.mockReturnValue(processToken);
  mockGetGeneration.mockReturnValue({ status: "available", generation: navigationGeneration });
  mockReadControl.mockImplementation((name: "pending" | "outcome") => {
    const status = name === "pending" ? mockPendingStatus : mockOutcomeStatus;
    if (status === "present") return { status, json: "{}" };
    if (status === "unreadable") return { status, code: "bad_state" };
    return { status };
  });
  mockQuiesce.mockResolvedValue(undefined);
  mockRetire.mockResolvedValue({
    status: "retired",
    registeredTimersRetired: 0,
    displayedNotificationsCleared: true,
  });
  mockClearResponse.mockResolvedValue(undefined);
  mockDiscardPrepared.mockResolvedValue(undefined);
  mockCancel.mockResolvedValue(undefined);
  mockDiscardFailed.mockResolvedValue({
    status: "discarded",
    liveDatabaseChanged: false,
    reinitializeRequired: true,
  });
  mockReload.mockResolvedValue(undefined);
}

function loadLifecycle() {
  return require("../../lib/db/replacementRestoreLifecycle") as typeof import("../../lib/db/replacementRestoreLifecycle");
}

function restoredResult(restoreId: string): ReplacementRestoreResult {
  return {
    status: "restored",
    restoreId,
    liveDatabaseChanged: true,
    rowsByTable: {} as ReplacementRestoreResult["rowsByTable"],
    pbEventsRebuilt: 2,
    media: { total: 0, resolved: 0, unresolved: 0, skippedPermission: 0, errors: [] },
    cleanup: { deletedManagedFiles: 0, skippedUntrustedPaths: 0, errors: 0 },
    warnings: [],
  };
}

describe("replacement restore database lifecycle", () => {
  it("opens one private handle and publishes bindings only after engine and bootstrap", () => {
    resetHarness();
    const lifecycle = loadLifecycle();

    expect(events).toEqual([
      "open",
      "pragma:PRAGMA foreign_keys = ON;",
      "pragma:PRAGMA journal_mode = WAL;",
      "pragma:PRAGMA synchronous = NORMAL;",
      "engine",
      "bootstrap",
      "drizzle",
      "publish-bindings",
    ]);
    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(1);
    expect(mockApplyStartup).toHaveBeenCalledWith({
      sqlite: mockSqlite,
      nativeProcessToken: processToken,
    });
    expect(mockPublishBindings).toHaveBeenCalledWith(mockSqlite, mockDb);
    const first = lifecycle.getDatabaseStartupSnapshot();
    expect(first).toEqual({ phase: "ready", connectionInitialized: true, canMountApp: true });
    expect(lifecycle.getDatabaseStartupSnapshot()).toBe(first);
  });

  it.each([
    ["open", () => mockOpenDatabaseSync.mockImplementation(() => { throw new Error("open"); })],
    ["pragmas", () => mockSqlite.execSync.mockImplementation(() => { throw new Error("pragma"); })],
    ["startup_engine", () => mockApplyStartup.mockImplementation(() => { throw new Error("engine"); })],
    ["bootstrap", () => mockInitializeDatabase.mockImplementation(() => { throw new Error("bootstrap"); })],
    ["bindings", () => mockDrizzle.mockImplementation(() => { throw new Error("drizzle"); })],
  ] as const)("catches %s failures without partial binding publication", (stage, inject) => {
    resetHarness();
    inject();
    const lifecycle = loadLifecycle();
    expect(lifecycle.getDatabaseStartupSnapshot()).toMatchObject({
      phase: "blocked",
      canMountApp: false,
      blocker: { status: "lifecycle_failed", stage },
      allowedActions: [],
    });
    expect(mockPublishBindings).not.toHaveBeenCalled();
  });

  it("does not claim unchanged on open failure without proven durable-control absence", () => {
    resetHarness();
    mockPendingStatus = "unavailable";
    mockOpenDatabaseSync.mockImplementation(() => { throw new Error("open"); });
    const snapshot = loadLifecycle().getDatabaseStartupSnapshot();
    expect(snapshot).toMatchObject({
      phase: "blocked",
      blocker: { status: "lifecycle_failed", stage: "open", liveDatabaseChanged: "unknown" },
    });
  });

  it("keeps committed startup blocked until media completion and matching acknowledgement", async () => {
    resetHarness({
      status: "committed",
      restoreId: "restore-1",
      liveDatabaseChanged: true,
      rowsByTable: {} as never,
      pbEventsRebuilt: 2,
      postCommitPending: true,
      warnings: [],
    });
    const lifecycle = loadLifecycle();
    expect(lifecycle.getDatabaseStartupSnapshot()).toMatchObject({
      phase: "postcommit",
      restoreId: "restore-1",
      connectionInitialized: true,
    });

    const result = restoredResult("restore-1");
    mockComplete.mockResolvedValue(result);
    await lifecycle.performDatabaseStartupAction({ kind: "skip_media", restoreId: "restore-1" });
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
      sqlite: mockSqlite,
      restoreId: "restore-1",
      mode: "skip",
    }));
    expect(lifecycle.getDatabaseStartupSnapshot()).toEqual({
      phase: "restored",
      connectionInitialized: true,
      canMountApp: false,
      result,
    });
    await expect(
      lifecycle.performDatabaseStartupAction({
        kind: "acknowledge_completion",
        restoreId: "other",
      })
    ).rejects.toThrow("stale");
    await lifecycle.performDatabaseStartupAction({
      kind: "acknowledge_completion",
      restoreId: "restore-1",
    });
    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("ready");
  });

  it("retries committed control finalization without replaying startup replacement", async () => {
    resetHarness({
      status: "committed_pending_cleanup",
      restoreId: "restore-2",
      liveDatabaseChanged: true,
      normalUseBlocked: true,
      retryable: true,
      warning: { stage: "pending_manifest_cleanup", code: "delete_failed" },
    });
    mockResume.mockReturnValue({
      status: "committed",
      restoreId: "restore-2",
      liveDatabaseChanged: true,
      rowsByTable: {},
      pbEventsRebuilt: 0,
      postCommitPending: true,
      warnings: [],
    });
    const lifecycle = loadLifecycle();
    expect(mockInitializeDatabase).not.toHaveBeenCalled();
    await lifecycle.performDatabaseStartupAction({
      kind: "retry_control_finalization",
      restoreId: "restore-2",
    });
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockApplyStartup).toHaveBeenCalledTimes(1);
    expect(mockInitializeDatabase).toHaveBeenCalledTimes(1);
    expect(lifecycle.getDatabaseStartupSnapshot()).toMatchObject({
      phase: "postcommit",
      restoreId: "restore-2",
    });
  });

  it("retains reload-only cancellation authority after reload failure or no-op resolution", async () => {
    resetHarness({
      status: "restart_required",
      restoreId: "restore-3",
      liveDatabaseChanged: false,
      restartRequired: true,
    });
    mockReload.mockRejectedValueOnce(new Error("reload failed")).mockResolvedValueOnce(undefined);
    const lifecycle = loadLifecycle();
    const action = { kind: "cancel_and_reload" as const, restoreId: "restore-3" };
    await expect(lifecycle.performDatabaseStartupAction(action)).rejects.toThrow("reload failed");
    await lifecycle.performDatabaseStartupAction(action);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("blocked");
  });

  it("does not consume cancellation twice when the reload export is missing", async () => {
    resetHarness({
      status: "restart_required",
      restoreId: "restore-4",
      liveDatabaseChanged: false,
      restartRequired: true,
    });
    mockReloadExport = undefined;
    const lifecycle = loadLifecycle();
    const action = { kind: "cancel_and_reload" as const, restoreId: "restore-4" };
    await expect(lifecycle.performDatabaseStartupAction(action)).rejects.toThrow("unavailable");
    await expect(lifecycle.performDatabaseStartupAction(action)).rejects.toThrow("unavailable");
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("blocked");
  });

  it("quarantines synchronously, serializes scheduling, and blocks before resolving", async () => {
    resetHarness();
    let releaseQuiesce!: () => void;
    mockQuiesce.mockReturnValue(new Promise<void>((resolve) => { releaseQuiesce = resolve; }));
    mockSchedule.mockResolvedValue({
      status: "restart_required",
      restoreId: "restore-5",
      liveDatabaseChanged: false,
      restartRequired: true,
    });
    const lifecycle = loadLifecycle();
    const first = lifecycle.scheduleReplacementRestoreAndBlock({ token: "prepared-1" });
    expect(mockBeginQuarantine).toHaveBeenCalledTimes(1);
    await expect(
      lifecycle.scheduleReplacementRestoreAndBlock({ token: "prepared-1" })
    ).rejects.toThrow("already active");
    releaseQuiesce();
    const result = await first;
    expect(result.status).toBe("restart_required");
    expect(mockRetire).toHaveBeenCalledTimes(1);
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(lifecycle.getDatabaseStartupSnapshot()).toMatchObject({
      phase: "blocked",
      blocker: { status: "restart_required", restoreId: "restore-5" },
    });
  });

  it("reactivates after safe native-retirement failure and releases prepared ownership", async () => {
    resetHarness();
    mockRetire.mockRejectedValue(new Error("retirement failed"));
    const lifecycle = loadLifecycle();
    await expect(
      lifecycle.scheduleReplacementRestoreAndBlock({ token: "prepared-2" })
    ).rejects.toMatchObject({
      stage: "scheduling",
      liveDatabaseChanged: false,
      transactionState: "not_started",
      recovery: "discard_and_reprepare",
    });
    expect(mockDiscardPrepared).toHaveBeenCalledWith("prepared-2");
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockEndQuarantine).toHaveBeenCalledTimes(1);
    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("ready");
  });

  it("keeps a cleanup failure blocked even with physically absent controls", async () => {
    resetHarness();
    mockQuiesce.mockRejectedValue(new Error("cleanup failed"));
    const lifecycle = loadLifecycle();
    await expect(
      lifecycle.scheduleReplacementRestoreAndBlock({ token: "prepared-3" })
    ).rejects.toThrow("cleanup failed");
    expect(mockDiscardPrepared).toHaveBeenCalledWith("prepared-3");
    expect(mockRetire).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    expect(lifecycle.getDatabaseStartupSnapshot()).toMatchObject({
      phase: "blocked",
      blocker: { status: "lifecycle_failed", stage: "timer_cleanup" },
      allowedActions: [],
    });
  });

  it("fails closed when scheduling may have published pending state", async () => {
    resetHarness();
    const { ReplacementRestoreError } =
      require("../../lib/db/replacementRestoreContract") as typeof import("../../lib/db/replacementRestoreContract");
    const error = new ReplacementRestoreError("outcome_ambiguous", "ambiguous", {
      stage: "scheduling",
      liveDatabaseChanged: false,
      transactionState: "not_started",
      recovery: "manual_recovery",
      retryable: false,
    });
    mockSchedule.mockImplementation(() => {
      mockPendingStatus = "present";
      return Promise.reject(error);
    });
    const lifecycle = loadLifecycle();
    await expect(
      lifecycle.scheduleReplacementRestoreAndBlock({ token: "prepared-4" })
    ).rejects.toBe(error);
    expect(mockActivate).not.toHaveBeenCalled();
    expect(lifecycle.getDatabaseStartupSnapshot()).toMatchObject({
      phase: "blocked",
      blocker: { status: "failed", error },
    });
  });

  it("reports native_unavailable ahead of a startup blocker when controls are missing", () => {
    resetHarness();
    mockPendingStatus = "unavailable";
    mockApplyStartup.mockImplementation(() => {
      throw new Error("native controls unavailable");
    });
    const lifecycle = loadLifecycle();

    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("blocked");
    expect(lifecycle.getReplacementRestoreAvailability()).toEqual({
      available: false,
      reason: "native_unavailable",
    });
  });

  it("keeps non-Android startup usable while exposing unsupported availability", () => {
    resetHarness();
    mockPlatformOs = "ios";
    const lifecycle = loadLifecycle();
    expect(mockApplyStartup).not.toHaveBeenCalled();
    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("ready");
    expect(lifecycle.getReplacementRestoreAvailability()).toEqual({
      available: false,
      reason: "unsupported_platform",
    });
    expect(mockQuiesce).not.toHaveBeenCalled();
  });
});
