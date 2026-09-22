import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";

import type {
  DatabaseStartupAction,
  DatabaseStartupActionKind,
  DatabaseStartupBlock,
  DatabaseStartupSnapshot,
  RestoreStartupBlock,
} from "../lib/db/replacementRestoreContract";

export type ReplacementRestoreGateProps = {
  snapshot: DatabaseStartupSnapshot;
  performAction: (action: DatabaseStartupAction) => Promise<void>;
  children: ReactNode;
};

type Operation = {
  readonly kind: DatabaseStartupActionKind;
  readonly snapshotKey: string;
  readonly controller?: AbortController;
};

type GateError = {
  readonly snapshotKey: string;
  readonly message: string;
};

function hasTrustedValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function restoreIdFor(snapshot: DatabaseStartupSnapshot): string | undefined {
  if (snapshot.phase === "blocked") return snapshot.blocker.restoreId;
  if (snapshot.phase === "postcommit") return snapshot.restoreId;
  if (snapshot.phase === "restored") return snapshot.result.restoreId;
  return undefined;
}

function snapshotKey(snapshot: DatabaseStartupSnapshot): string {
  if (snapshot.phase === "blocked") {
    const { blocker } = snapshot;
    if (blocker.status === "lifecycle_failed") {
      return `blocked:${blocker.status}:${blocker.stage}:${blocker.restoreId ?? "none"}:${blocker.liveDatabaseChanged}:${blocker.recovery}:${snapshot.connectionInitialized}`;
    }
    if (blocker.status === "failed") {
      return `blocked:${blocker.status}:${blocker.restoreId ?? "none"}:${blocker.error.liveDatabaseChanged}:${blocker.error.transactionState}:${blocker.error.recovery}:${blocker.error.recoveryToken ?? "none"}`;
    }
    if (blocker.status === "restart_required") return `blocked:${blocker.status}:${blocker.restoreId}:${blocker.liveDatabaseChanged}`;
    return `blocked:${blocker.status}:${blocker.restoreId}:${blocker.warning.code}`;
  }
  return `${snapshot.phase}:${restoreIdFor(snapshot) ?? "none"}`;
}

function outcomeCopy(blocker: RestoreStartupBlock): string {
  if (blocker.status === "restart_required") {
    if (blocker.liveDatabaseChanged === false) return "Your current app data was not changed.";
    if (blocker.liveDatabaseChanged === true) return "Restore changes were committed. The app remains blocked while recovery finishes.";
    return "The data outcome could not be confirmed. Use manual recovery before using the app.";
  }

  if (blocker.status === "failed") {
    if (blocker.error.liveDatabaseChanged === false) return "Your current app data was not changed.";
    if (blocker.error.liveDatabaseChanged === true) return "Restore changes were committed. The app remains blocked while recovery finishes.";
    return "The data outcome could not be confirmed. Use manual recovery before using the app.";
  }

  return "Restore data was committed. The app remains blocked while completion records are finalised.";
}

function lifecycleOutcomeCopy(blocker: Extract<DatabaseStartupBlock, { status: "lifecycle_failed" }>): string {
  if (blocker.liveDatabaseChanged === false) return "Your current app data was not changed.";
  if (blocker.liveDatabaseChanged === true) return "App data changed before startup could finish. The app remains blocked until startup recovery finishes.";
  return "The data outcome could not be confirmed. Do not use the app until recovery is complete.";
}

function isAllowed(
  snapshot: Extract<DatabaseStartupSnapshot, { phase: "blocked" }>,
  kind: DatabaseStartupActionKind
): boolean {
  return snapshot.allowedActions.includes(kind);
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className={primary ? "flex-1 items-center justify-center p-3.5 rounded-lg bg-primary" : "flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={primary ? "text-base font-semibold text-primary-foreground" : "text-base font-semibold text-foreground-secondary"}>{label}</Text>
    </Pressable>
  );
}

export default function ReplacementRestoreGate({ snapshot, performAction, children }: ReplacementRestoreGateProps) {
  const mountedRef = useRef(true);
  const snapshotRef = useRef(snapshot);
  const operationsRef = useRef(new Map<string, Operation>());
  const [operationVersion, setOperationVersion] = useState(0);
  const [error, setError] = useState<GateError | null>(null);
  const [stoppedMediaRestoreId, setStoppedMediaRestoreId] = useState<string | null>(null);

  snapshotRef.current = snapshot;
  const currentRestoreId = restoreIdFor(snapshot);
  const currentKey = snapshotKey(snapshot);
  const pending = currentRestoreId ? operationsRef.current.get(currentRestoreId) : undefined;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (snapshot.phase === "ready") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [snapshot.phase]);

  const perform = useCallback((action: DatabaseStartupAction, controller?: AbortController) => {
    const restoreId = action.restoreId;
    if (!hasTrustedValue(restoreId) || (action.kind === "discard_and_reload" && !hasTrustedValue(action.recoveryToken))) return;
    const keyAtStart = snapshotKey(snapshotRef.current);
    if (operationsRef.current.has(restoreId)) return;

    const operation: Operation = { kind: action.kind, snapshotKey: keyAtStart, controller };
    operationsRef.current.set(restoreId, operation);
    setError(null);
    setOperationVersion((version) => version + 1);

    void Promise.resolve()
      .then(() => performAction(action))
      .catch((reason: unknown) => {
        const isAbort = typeof reason === "object" && reason !== null && "name" in reason && reason.name === "AbortError";
        const current = snapshotRef.current;
        if (!mountedRef.current || snapshotKey(current) !== keyAtStart) return;
        if (isAbort && action.kind === "complete_media") {
          setStoppedMediaRestoreId(restoreId);
          return;
        }
        setError({
          snapshotKey: keyAtStart,
          message: "The requested recovery action could not be completed. The app remains blocked.",
        });
      })
      .finally(() => {
        if (operationsRef.current.get(restoreId) !== operation) return;
        operationsRef.current.delete(restoreId);
        if (mountedRef.current) setOperationVersion((version) => version + 1);
      });
  }, [performAction]);

  const stopMediaScan = useCallback(() => {
    if (!currentRestoreId) return;
    const operation = operationsRef.current.get(currentRestoreId);
    if (operation?.kind !== "complete_media") return;
    operation.controller?.abort();
    setStoppedMediaRestoreId(currentRestoreId);
  }, [currentRestoreId]);

  if (snapshot.phase === "ready") return <>{children}</>;

  const visibleError = error?.snapshotKey === currentKey ? error.message : null;
  const busy = Boolean(pending);
  const mediaScanStopped = snapshot.phase === "postcommit" && stoppedMediaRestoreId === snapshot.restoreId;

  let content: ReactNode;
  if (snapshot.phase === "starting") {
    content = (
      <>
        <Text className="text-xl font-bold mb-3 text-foreground">Checking restore status</Text>
        <Text className="text-base text-foreground-secondary">Please wait while the app checks whether a replacement restore needs attention.</Text>
      </>
    );
  } else if (snapshot.phase === "blocked") {
    const { blocker } = snapshot;
    const blockerRestoreId = restoreIdFor(snapshot);
    const actions: ReactNode[] = [];

    if (blocker.status === "restart_required" && blocker.liveDatabaseChanged === false && hasTrustedValue(blockerRestoreId) && isAllowed(snapshot, "cancel_and_reload")) {
      actions.push(
        <ActionButton
          key="cancel"
          label="Cancel scheduled restore"
          disabled={busy}
          onPress={() => perform({ kind: "cancel_and_reload", restoreId: blockerRestoreId })}
        />
      );
    }
    if (
      blocker.status === "failed" &&
      hasTrustedValue(blockerRestoreId) &&
      blocker.error.liveDatabaseChanged === false &&
      (blocker.error.transactionState === "not_started" || blocker.error.transactionState === "rolled_back") &&
      blocker.error.recovery === "discard_and_reprepare" &&
      hasTrustedValue(blocker.error.recoveryToken) &&
      isAllowed(snapshot, "discard_and_reload")
    ) {
      actions.push(
        <ActionButton
          key="discard"
          label="Discard failed restore safely"
          disabled={busy}
          onPress={() => perform({ kind: "discard_and_reload", restoreId: blockerRestoreId, recoveryToken: blocker.error.recoveryToken! })}
        />
      );
    }
    if (
      (blocker.status === "committed_pending_cleanup" || blocker.status === "committed_pending_outcome") &&
      blocker.retryable &&
      hasTrustedValue(blocker.restoreId) &&
      isAllowed(snapshot, "retry_control_finalization")
    ) {
      actions.push(
        <ActionButton
          key="retry"
          label="Retry restore completion"
          disabled={busy}
          primary
          onPress={() => perform({ kind: "retry_control_finalization", restoreId: blocker.restoreId })}
        />
      );
    }

    if (blocker.status === "lifecycle_failed") {
      content = (
        <>
          <Text className="text-xl font-bold mb-3 text-foreground">The app could not start safely</Text>
          <Text className="text-base mb-3 text-foreground-secondary">{lifecycleOutcomeCopy(blocker)}</Text>
          <Text className="text-base mb-4 text-foreground-secondary">
            {blocker.recovery === "close_and_reopen"
              ? "Close the app completely, then reopen it before using it again."
              : "Manual recovery is required before using the app again."}
          </Text>
        </>
      );
    } else {
      content = (
        <>
          <Text className="text-xl font-bold mb-3 text-foreground">
            {blocker.status === "restart_required" ? "Restore needs a full close and reopen" : blocker.status === "failed" ? "Restore needs recovery" : "Restore completion is pending"}
          </Text>
          {blocker.status === "restart_required" ? <Text className="text-base mb-3 text-foreground-secondary">Close the app completely, then reopen it before using it again.</Text> : null}
          <Text className="text-base mb-4 text-foreground-secondary">{outcomeCopy(blocker)}</Text>
          {blocker.status === "failed" && blocker.error.liveDatabaseChanged === "unknown" ? <Text className="text-base mb-4 text-destructive">Manual recovery is required. Do not use the app until the data outcome is confirmed.</Text> : null}
          {actions.length > 0 ? <View className="flex-row gap-3">{actions}</View> : null}
        </>
      );
    }
  } else if (snapshot.phase === "postcommit") {
    const progress = snapshot.progress;
    content = (
      <>
        <Text className="text-xl font-bold mb-3 text-foreground">Training data restored</Text>
        <Text className="text-base mb-3 text-foreground-secondary">Training data has been restored. Choose whether to scan the gallery for video attachments or skip that scan.</Text>
        {progress ? <Text className="text-sm mb-3 text-foreground-secondary">Scanning video attachments{progress.total ? ` (${progress.completed ?? 0} of ${progress.total})` : ""}.</Text> : null}
        {mediaScanStopped ? <Text className="text-sm mb-3 text-foreground-secondary">Video scanning was stopped. Restored training data remains committed.</Text> : null}
        {busy && pending?.kind === "complete_media" ? (
          <View className="flex-row gap-3"><ActionButton label="Stop video scan" onPress={stopMediaScan} /></View>
        ) : hasTrustedValue(snapshot.restoreId) ? (
          <View className="flex-row gap-3">
            <ActionButton
              label="Skip video scan"
              disabled={busy}
              onPress={() => perform({ kind: "skip_media", restoreId: snapshot.restoreId })}
            />
            <ActionButton
              label="Scan gallery videos"
              primary
              disabled={busy}
              onPress={() => {
                const controller = new AbortController();
                setStoppedMediaRestoreId(null);
                perform({ kind: "complete_media", restoreId: snapshot.restoreId, signal: controller.signal }, controller);
              }}
            />
          </View>
        ) : null}
      </>
    );
  } else {
    const { result } = snapshot;
    content = (
      <>
        <Text className="text-xl font-bold mb-3 text-foreground">Restore complete</Text>
        <Text className="text-base mb-2 text-foreground-secondary">Your restored training data is ready.</Text>
        <Text className="text-base mb-2 text-foreground-secondary">Video attachments resolved: {result.media.resolved} of {result.media.total}. Unresolved attachments: {result.media.unresolved}.</Text>
        {result.warnings.length > 0 ? <Text className="text-sm mb-3 text-foreground-secondary">Restore warnings: {result.warnings.length}.</Text> : null}
        {hasTrustedValue(result.restoreId) ? <View className="flex-row gap-3">
          <ActionButton
            label="Continue"
            primary
            disabled={busy}
            onPress={() => perform({ kind: "acknowledge_completion", restoreId: result.restoreId })}
          />
        </View> : null}
      </>
    );
  }

  // Reading operationVersion makes completion and synchronous locks visible to React without deriving permission from snapshot identity.
  void operationVersion;
  return (
    <View className="flex-1 items-center justify-center p-6 bg-background">
      <ScrollView contentContainerClassName="w-full max-w-lg p-6 rounded-xl bg-surface" contentContainerStyle={{ width: "100%" }}>
        {content}
        {visibleError ? <Text className="text-sm mt-4 text-destructive">{visibleError}</Text> : null}
      </ScrollView>
    </View>
  );
}
