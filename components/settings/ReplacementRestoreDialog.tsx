import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import type {
  ReplacementRestoreAvailability,
  ReplacementRestoreError,
  ReplacementRestoreLifecycleFacade,
  ReplacementRestoreService,
  RestorePreparation,
  RestoreProgress,
} from "../../lib/db/replacementRestoreContract";
import { Button } from "../design-system/button";
import { BaseModal } from "../modals/BaseModal";

export type ReplacementRestoreDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  service: Pick<ReplacementRestoreService, "prepareReplacementRestore" | "discardPreparedRestore">;
  lifecycle: Pick<
    ReplacementRestoreLifecycleFacade,
    "scheduleReplacementRestoreAndBlock" | "getReplacementRestoreAvailability"
  >;
};

type DialogPhase = "choose" | "preparing" | "ready" | "cleanup" | "cleanup_failed" | "scheduling" | "restart_required" | "blocked";
type DiscardPreparedRestore = ReplacementRestoreService["discardPreparedRestore"];
type RestoreFailure = Pick<ReplacementRestoreError, "code" | "stage" | "liveDatabaseChanged" | "transactionState" | "recovery">;

type CleanupOwner = {
  token: string | null;
  state: "idle" | "cleaning" | "failed";
  preparationInFlight: boolean;
  queuedTokens: string[];
  lastCompletedToken: string | null;
  listeners: Set<() => void>;
};

const cleanupOwners = new WeakMap<DiscardPreparedRestore, CleanupOwner>();

function cleanupOwnerFor(discard: DiscardPreparedRestore): CleanupOwner {
  const existing = cleanupOwners.get(discard);
  if (existing) return existing;
  const owner: CleanupOwner = {
    token: null,
    state: "idle",
    preparationInFlight: false,
    queuedTokens: [],
    lastCompletedToken: null,
    listeners: new Set(),
  };
  cleanupOwners.set(discard, owner);
  return owner;
}

function notifyCleanup(owner: CleanupOwner): void {
  owner.listeners.forEach((listener) => listener());
}

function startOwnedCleanup(owner: CleanupOwner, discard: DiscardPreparedRestore, token: string): boolean {
  if (owner.token || owner.state === "cleaning") {
    if (owner.token !== token && !owner.queuedTokens.includes(token)) owner.queuedTokens.push(token);
    notifyCleanup(owner);
    return false;
  }
  owner.token = token;
  owner.state = "cleaning";
  owner.lastCompletedToken = null;
  notifyCleanup(owner);
  void discard(token).then(() => {
    if (owner.token !== token) return;
    owner.token = null;
    owner.state = "idle";
    owner.lastCompletedToken = token;
    const nextToken = owner.queuedTokens.shift();
    if (nextToken) {
      startOwnedCleanup(owner, discard, nextToken);
    } else {
      notifyCleanup(owner);
    }
  }).catch(() => {
    if (owner.token !== token) return;
    owner.state = "failed";
    notifyCleanup(owner);
  });
  return true;
}

function retryOwnedCleanup(owner: CleanupOwner, discard: DiscardPreparedRestore): boolean {
  const token = owner.token;
  if (!token || owner.state === "cleaning") return false;
  owner.state = "idle";
  owner.token = null;
  return startOwnedCleanup(owner, discard, token);
}

const PREPARATION_LABELS: Record<string, string> = {
  selecting: "Choosing backup…",
  staging: "Preparing backup…",
  validating_source: "Checking backup…",
  migrating_candidate: "Preparing compatible backup…",
  validating_candidate: "Validating backup…",
  ready: "Backup ready",
};

function isRestoreFailure(error: unknown): error is RestoreFailure {
  return typeof error === "object" && error !== null && "stage" in error && "liveDatabaseChanged" in error && "transactionState" in error;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && (("name" in error && error.name === "AbortError") || ("code" in error && error.code === "ABORT_ERR"));
}

function isExplicitlySafeScheduleFailure(error: unknown): boolean {
  return isRestoreFailure(error)
    && error.stage === "scheduling"
    && error.liveDatabaseChanged === false
    && (error.transactionState === "not_started" || error.transactionState === "rolled_back")
    && error.recovery === "discard_and_reprepare";
}

function preparationFailureMessage(error: unknown): string {
  if (!isRestoreFailure(error)) return "The backup could not be prepared. Please try again.";
  if (error.liveDatabaseChanged === "unknown") return "The restore state could not be confirmed. Keep the app closed and follow the recovery guidance.";
  if (error.liveDatabaseChanged === true || error.transactionState === "committed") return "The restore may already have changed app data. Keep the app closed and follow the recovery guidance.";
  if (error.code === "restore_busy") return "A restore is already being prepared. Please try again shortly.";
  return "The current app data was not changed. The backup could not be prepared.";
}

function availabilityMessage(availability: ReplacementRestoreAvailability): string | null {
  if (availability.available) return null;
  if (availability.reason === "unsupported_platform") return "Replacement restore is not available on this platform yet.";
  if (availability.reason === "startup_blocked") return "Replacement restore is unavailable while the app is handling a previous restore.";
  return "Replacement restore is unavailable because required native support is not ready.";
}

export default function ReplacementRestoreDialog({ visible, onDismiss, service, lifecycle }: ReplacementRestoreDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>("choose");
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [preparation, setPreparation] = useState<RestorePreparation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [availability, setAvailability] = useState<ReplacementRestoreAvailability>(() => lifecycle.getReplacementRestoreAvailability());
  const [, refreshCleanup] = useState(0);

  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const preparationControllerRef = useRef<AbortController | null>(null);
  const scheduleControllerRef = useRef<AbortController | null>(null);
  const readyTokenRef = useRef<string | null>(null);
  const preparationOwnedRef = useRef(false);
  const scheduleOwnedRef = useRef(false);
  const publishedOrBlockedRef = useRef(false);
  const dismissAfterCleanupRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const serviceRef = useRef(service);
  const lifecycleRef = useRef(lifecycle);
  const cleanupOwnerRef = useRef(cleanupOwnerFor(service.discardPreparedRestore));

  onDismissRef.current = onDismiss;
  serviceRef.current = service;
  lifecycleRef.current = lifecycle;

  const startCleanup = useCallback((token: string, dismissAfterSuccess: boolean) => {
    if (scheduleOwnedRef.current || publishedOrBlockedRef.current) return;
    dismissAfterCleanupRef.current ||= dismissAfterSuccess;
    const owner = cleanupOwnerRef.current;
    const started = startOwnedCleanup(owner, serviceRef.current.discardPreparedRestore, token);
    if (!mountedRef.current) return;
    if (started || owner.state === "cleaning") {
      setMessage(null);
      setPhase("cleanup");
    } else {
      setMessage("Prepared backup cleanup is still required before another restore can begin.");
      setPhase("cleanup_failed");
    }
  }, []);

  const retryCleanup = useCallback(() => {
    const owner = cleanupOwnerRef.current;
    if (retryOwnedCleanup(owner, serviceRef.current.discardPreparedRestore) && mountedRef.current) {
      setMessage(null);
      setPhase("cleanup");
    }
  }, []);

  const hidePreparation = useCallback(() => {
    generationRef.current += 1;
    preparationControllerRef.current?.abort();
    preparationControllerRef.current = null;
    if (!scheduleOwnedRef.current && !publishedOrBlockedRef.current && readyTokenRef.current) {
      startCleanup(readyTokenRef.current, false);
    }
  }, [startCleanup]);

  useEffect(() => {
    const owner = cleanupOwnerRef.current;
    const onOwnerUpdate = () => {
      if (!mountedRef.current) return;
      refreshCleanup((version) => version + 1);
      if (owner.state === "cleaning") {
        setPhase("cleanup");
        return;
      }
      if (owner.state === "failed") {
        setMessage("The prepared backup could not be discarded. Retry cleanup before closing or choosing another backup.");
        setPhase("cleanup_failed");
        return;
      }
      if (owner.lastCompletedToken && !preparationOwnedRef.current) {
        if (readyTokenRef.current === owner.lastCompletedToken) readyTokenRef.current = null;
        setPreparation(null);
        setProgress(null);
        setMessage(null);
        setPhase("choose");
        if (dismissAfterCleanupRef.current) {
          dismissAfterCleanupRef.current = false;
          onDismissRef.current();
        }
      }
    };

    owner.listeners.add(onOwnerUpdate);
    mountedRef.current = true;
    onOwnerUpdate();
    return () => {
      mountedRef.current = false;
      owner.listeners.delete(onOwnerUpdate);
      generationRef.current += 1;
      preparationControllerRef.current?.abort();
      preparationControllerRef.current = null;
      if (!scheduleOwnedRef.current && !publishedOrBlockedRef.current && readyTokenRef.current) {
        startOwnedCleanup(owner, serviceRef.current.discardPreparedRestore, readyTokenRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setAvailability(lifecycleRef.current.getReplacementRestoreAvailability());
      const owner = cleanupOwnerRef.current;
      if (owner.state === "cleaning") setPhase("cleanup");
      else if (owner.state === "failed") setPhase("cleanup_failed");
      else if (readyTokenRef.current && !scheduleOwnedRef.current && !publishedOrBlockedRef.current) setPhase("ready");
      return;
    }

    hidePreparation();
    const owner = cleanupOwnerRef.current;
    if (!scheduleOwnedRef.current && !publishedOrBlockedRef.current && owner.state === "idle" && !readyTokenRef.current) {
      setPhase("choose");
      setProgress(null);
      setPreparation(null);
    }
  }, [hidePreparation, visible]);

  const chooseBackup = useCallback(() => {
    const cleanupOwner = cleanupOwnerRef.current;
    if (
      !availability.available
      || preparationOwnedRef.current
      || cleanupOwner.preparationInFlight
      || readyTokenRef.current
      || cleanupOwner.token
      || scheduleOwnedRef.current
      || publishedOrBlockedRef.current
    ) {
      return;
    }

    preparationOwnedRef.current = true;
    cleanupOwner.preparationInFlight = true;
    cleanupOwner.lastCompletedToken = null;
    notifyCleanup(cleanupOwner);
    const controller = new AbortController();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    preparationControllerRef.current = controller;
    setPhase("preparing");
    setProgress({ phase: "selecting", cancellable: true });
    setPreparation(null);
    setMessage(null);

    void serviceRef.current.prepareReplacementRestore({
      signal: controller.signal,
      onProgress: (nextProgress) => {
        if (mountedRef.current && generationRef.current === generation && !controller.signal.aborted) setProgress(nextProgress);
      },
    }).then((result) => {
      preparationOwnedRef.current = false;
      cleanupOwner.preparationInFlight = false;
      notifyCleanup(cleanupOwner);
      if (preparationControllerRef.current === controller) preparationControllerRef.current = null;
      if (!mountedRef.current || generationRef.current !== generation) {
        if (result.status === "ready") startCleanup(result.token, false);
        else if (mountedRef.current) {
          setPhase("choose");
          setProgress(null);
          setPreparation(null);
          refreshCleanup((version) => version + 1);
        }
        return;
      }
      if (result.status === "cancelled") {
        setPhase("choose");
        setProgress(null);
        return;
      }
      readyTokenRef.current = result.token;
      setPreparation(result);
      setProgress({ phase: "ready", cancellable: true });
      setPhase("ready");
    }).catch((error: unknown) => {
      preparationOwnedRef.current = false;
      cleanupOwner.preparationInFlight = false;
      notifyCleanup(cleanupOwner);
      if (preparationControllerRef.current === controller) preparationControllerRef.current = null;
      if (!mountedRef.current || generationRef.current !== generation) return;
      if (controller.signal.aborted && isAbortError(error)) {
        setPhase("choose");
        setProgress(null);
        setPreparation(null);
        setMessage(null);
        return;
      }
      if (isRestoreFailure(error) && (error.liveDatabaseChanged !== false || error.transactionState === "committed")) {
        publishedOrBlockedRef.current = true;
        setPhase("blocked");
        setProgress(null);
        setMessage(preparationFailureMessage(error));
        return;
      }
      setPhase("choose");
      setProgress(null);
      setMessage(preparationFailureMessage(error));
    });
  }, [availability.available, startCleanup]);

  const dismiss = useCallback(() => {
    if (scheduleOwnedRef.current || publishedOrBlockedRef.current) return;
    const owner = cleanupOwnerRef.current;
    if (owner.token) {
      dismissAfterCleanupRef.current = true;
      retryCleanup();
      return;
    }
    if (readyTokenRef.current) {
      startCleanup(readyTokenRef.current, true);
      return;
    }
    hidePreparation();
    onDismissRef.current();
  }, [hidePreparation, retryCleanup, startCleanup]);

  const scheduleRestore = useCallback(() => {
    const token = readyTokenRef.current;
    const cleanupOwner = cleanupOwnerRef.current;
    if (!availability.available || !token || phase !== "ready" || cleanupOwner.token || scheduleOwnedRef.current || publishedOrBlockedRef.current) return;

    scheduleOwnedRef.current = true;
    const controller = new AbortController();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    scheduleControllerRef.current = controller;
    setMessage(null);
    setPhase("scheduling");
    setProgress({ phase: "scheduling", cancellable: true });

    void lifecycleRef.current.scheduleReplacementRestoreAndBlock({
      token,
      signal: controller.signal,
      onProgress: (nextProgress) => {
        if (mountedRef.current && generationRef.current === generation) setProgress(nextProgress);
      },
    }).then((result) => {
      scheduleOwnedRef.current = false;
      if (scheduleControllerRef.current === controller) scheduleControllerRef.current = null;
      readyTokenRef.current = null;
      if (result.status === "restart_required") publishedOrBlockedRef.current = true;
      if (!mountedRef.current) return;
      if (result.status === "restart_required") {
        setPhase("restart_required");
        setProgress({ phase: "restart_required", cancellable: false });
      } else {
        setPhase("choose");
        setProgress(null);
        setPreparation(null);
        setMessage("Scheduling was cancelled before publication. Timers and app notifications remain stopped.");
      }
    }).catch((error: unknown) => {
      const safelyCancelled = isExplicitlySafeScheduleFailure(error);
      scheduleOwnedRef.current = false;
      if (scheduleControllerRef.current === controller) scheduleControllerRef.current = null;
      readyTokenRef.current = null;
      if (!safelyCancelled) publishedOrBlockedRef.current = true;
      if (!mountedRef.current) return;
      if (safelyCancelled) {
        setPhase("choose");
        setProgress(null);
        setPreparation(null);
        setMessage("The restore was not scheduled. Timers and app notifications remain stopped before you choose another backup.");
      } else {
        setPhase("blocked");
        setProgress(null);
        setMessage("The restore status could not be confirmed. Keep the app closed and follow the recovery guidance. Timers and app notifications remain stopped.");
      }
    });
  }, [availability.available, phase]);

  const cleanupOwner = cleanupOwnerRef.current;
  const unavailableMessage = availabilityMessage(availability);
  const canChoose = availability.available
    && !preparationOwnedRef.current
    && !cleanupOwner.preparationInFlight
    && !readyTokenRef.current
    && !cleanupOwner.token
    && !scheduleOwnedRef.current
    && !publishedOrBlockedRef.current;

  return (
    <BaseModal visible={visible} onClose={dismiss} maxWidth={480}>
      <Text className="text-xl font-bold mb-3 text-foreground">Replace app data from backup</Text>
      {unavailableMessage ? <Notice text={unavailableMessage} /> : null}
      {message ? <Notice text={message} /> : null}
      {phase === "choose" ? <Text className="text-base leading-6 mb-5 text-foreground-secondary">Choose a backup to check before replacing the data currently in this app.</Text> : null}
      {phase === "preparing" ? <Text className="text-base leading-6 mb-5 text-foreground-secondary">{progress ? PREPARATION_LABELS[progress.phase] ?? "Preparing backup…" : "Preparing backup…"}</Text> : null}
      {phase === "ready" && preparation ? <ReadySummary preparation={preparation} /> : null}
      {phase === "cleanup" ? <Text className="text-base leading-6 mb-5 text-foreground-secondary">Discarding the prepared backup…</Text> : null}
      {phase === "cleanup_failed" ? <Text className="text-base leading-6 mb-5 text-foreground-secondary">The prepared backup must be discarded before another restore can begin.</Text> : null}
      {phase === "scheduling" ? <Text className="text-base leading-6 mb-5 text-foreground-secondary">Scheduling replacement…</Text> : null}
      {phase === "restart_required" ? <Text className="text-base leading-6 mb-5 text-foreground-secondary">Restore is scheduled. Fully close the app, then reopen it before using the app again.</Text> : null}
      {phase === "blocked" ? <Text className="text-base leading-6 mb-5 text-foreground-secondary">Do not use the app until recovery guidance has resolved the restore state.</Text> : null}
      {phase === "preparing" ? <ActionButton label="Cancel backup preparation" text="Cancel" secondary onPress={() => preparationControllerRef.current?.abort()} /> : null}
      {phase === "cleanup" ? <ActionButton label="Discarding prepared backup" text="Discarding backup…" secondary disabled onPress={() => undefined} /> : null}
      {phase === "cleanup_failed" ? <ActionButton label="Retry prepared backup cleanup" text="Retry cleanup" secondary onPress={retryCleanup} /> : null}
      {phase === "ready" ? <View className="flex-row gap-3"><ActionButton label="Dismiss restore confirmation" text="Cancel" secondary onPress={dismiss} /><ActionButton label="Schedule replacement restore" text="Replace app data" disabled={!availability.available} onPress={scheduleRestore} /></View> : null}
      {phase === "scheduling" ? <ActionButton label="Cancel restore scheduling" text="Cancel scheduling" secondary onPress={() => scheduleControllerRef.current?.abort()} /> : null}
      {phase === "choose" ? <View className="flex-row gap-3"><ActionButton label="Dismiss replacement restore" text="Cancel" secondary onPress={dismiss} /><ActionButton label="Choose backup for replacement restore" text="Choose backup" disabled={!canChoose} onPress={chooseBackup} /></View> : null}
    </BaseModal>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View className="mb-4 px-3 py-2.5 rounded-lg bg-destructive/10">
      <Text className="text-sm font-medium text-destructive">{text}</Text>
    </View>
  );
}

function ReadySummary({ preparation }: { preparation: RestorePreparation }) {
  return (
    <View className="mb-5">
      <Text className="text-base font-semibold mb-2 text-foreground">Ready to replace app data</Text>
      <Text className="text-sm leading-5 mb-3 text-foreground-secondary">
        Source: {preparation.sourceDisplayName ?? "Selected backup"}
      </Text>
      <View className="rounded-lg p-3 mb-4 bg-surface-secondary">
        <Text className="text-sm text-foreground">Exercises: {preparation.rowsByTable.exercises}</Text>
        <Text className="text-sm text-foreground">Workouts: {preparation.rowsByTable.workouts}</Text>
        <Text className="text-sm text-foreground">Exercise entries: {preparation.rowsByTable.workout_exercises}</Text>
        <Text className="text-sm text-foreground">Sets: {preparation.rowsByTable.sets}</Text>
        <Text className="text-sm text-foreground">Video attachments: {preparation.mediaRows}</Text>
      </View>
      <Text className="text-sm leading-5 text-foreground-secondary">
        Current app data will be replaced. Timers and app notifications will be cleared. After scheduling, fully close and reopen the app before using it. Videos are link-only; missing videos do not remove training records.
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  text,
  disabled = false,
  secondary = false,
  onPress,
}: {
  label: string;
  text: string;
  disabled?: boolean;
  secondary?: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={label}
      label={text}
      variant={secondary ? "secondary" : "primary"}
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1 }}
    />
  );
}
