import {
  isNativeProcessToken,
  type NativeProcessToken,
} from "../native/appProcessIdentity";
import type {
  RestoreControlRecordName,
  RestoreControlRecordReadResult,
} from "../native/restoreControlStore";
import { newUid } from "../utils/uid";
import type {
  AppTable,
  ReplacementRestoreErrorCode,
  ReplacementRestoreService,
  RestoreCommitResult,
  RestoreCommittedPendingCleanup,
  RestoreCommittedPendingOutcome,
  RestoreErrorStage,
  RestoreProgress,
  RestoreStartupFailure,
  RestoreStartupResult,
} from "./replacementRestoreContract";
import {
  ReplacementRestoreError,
} from "./replacementRestoreContract";
import type {
  PreparedReplacementCandidate,
} from "./replacementRestorePreparation";
import {
  REPLACEMENT_RESTORE_RECORD_VERSION,
  RestoreRecordValidationError,
  readCommittedRestoreOutcome,
  readPendingRestoreRecord,
  sameCommittedRestoreOutcome,
  samePendingRestoreRecord,
  serializeCommittedRestoreOutcome,
  serializePendingRestoreRecord,
  type AttemptedPendingRestoreRecord,
  type CommittedRestoreOutcomeRecord,
  type PendingRestoreRecord,
  type ScheduledPendingRestoreRecord,
} from "./replacementRestoreRecords";
import {
  ReplacementCandidateDetachFailure,
  ReplacementTransactionFailure,
  type ReplacementTransactionResult,
  type ValidatedReplacementSession,
} from "./replacementRestoreTransaction";
import {
  RESTORE_SCHEMA_MANIFEST_ID,
  RestoreSchemaValidationError,
} from "./restoreSchemaManifest";

export type ReplacementRestoreEngine = Pick<
  ReplacementRestoreService,
  | "prepareReplacementRestore"
  | "scheduleReplacementRestore"
  | "discardPreparedRestore"
  | "cancelScheduledReplacementRestore"
  | "discardSafelyFailedScheduledRestore"
  | "applyScheduledReplacementRestoreAtStartup"
  | "resumeCommittedStartupFinalization"
>;

export interface ReplacementRestoreRuntimeDependencies {
  readonly stagingRootUri: string;
  prepareCandidate(options: {
    source?: Parameters<ReplacementRestoreService["prepareReplacementRestore"]>[0]["source"];
    signal?: AbortSignal;
    onProgress?: (progress: RestoreProgress) => void;
  }): Promise<PreparedReplacementCandidate | null>;
  discardCandidate(candidatePath: string): void;
  candidateExists(candidatePath: string): boolean;
  hashCandidate(candidatePath: string, signal?: AbortSignal): Promise<string>;
  hashCandidateSync(candidatePath: string): string;
  getNativeProcessToken(): NativeProcessToken | null;
  readControlRecord(name: RestoreControlRecordName): RestoreControlRecordReadResult;
  writeControlRecord(name: RestoreControlRecordName, json: string): void;
  deleteControlRecord(name: RestoreControlRecordName): void;
  openValidatedSession(options: {
    sqlite: Parameters<ReplacementRestoreService["applyScheduledReplacementRestoreAtStartup"]>[0]["sqlite"];
    candidatePath: string;
    candidateExists: () => boolean;
    expectedRowsByTable: Record<AppTable, number>;
  }): ValidatedReplacementSession;
  createOpaqueId(kind: "attempt" | "preparation" | "recovery" | "restore"): string;
}

type PreparedContext = {
  readonly token: string;
  readonly candidate: PreparedReplacementCandidate;
};

type RecoveryContext = {
  readonly restoreId: string;
  readonly recoveryToken: string;
  readonly expectedPending: PendingRestoreRecord;
};

type CommittedContext = {
  readonly restoreId: string;
  readonly candidatePath: string;
  readonly expectedPending: AttemptedPendingRestoreRecord;
  readonly outcome: CommittedRestoreOutcomeRecord;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsRebuilt: number;
  readonly untrustedPreCommitMediaUris: readonly string[];
  readonly candidateMayBeAttached: boolean;
  readonly warnings: {
    stage: "detach_candidate" | "staging_cleanup";
    code: string;
  }[];
};

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return error instanceof Error && error.name ? error.name : "unknown_error";
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isPreparationError(error: unknown): error is {
  readonly code: ReplacementRestoreErrorCode;
  readonly stage: RestoreErrorStage;
  readonly message: string;
} {
  return (
    error instanceof Error &&
    error.name === "ReplacementPreparationError" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { stage?: unknown }).stage === "string"
  );
}

function makeError(
  code: ReplacementRestoreErrorCode,
  errorMessage: string,
  options: {
    stage: RestoreErrorStage;
    liveDatabaseChanged: boolean | "unknown";
    transactionState: "not_started" | "rolled_back" | "committed" | "unknown";
    recovery:
      | "discard_and_reprepare"
      | "retry_cold_start"
      | "retry_committed_cleanup"
      | "manual_recovery";
    recoveryToken?: string;
    retryable: boolean;
  }
): ReplacementRestoreError {
  return new ReplacementRestoreError(code, errorMessage, options);
}

function startupFailure(
  error: ReplacementRestoreError,
  restoreId?: string
): RestoreStartupFailure {
  return restoreId ? { status: "failed", restoreId, error } : { status: "failed", error };
}

function emitProgress(
  callback: ((progress: RestoreProgress) => void) | undefined,
  progress: RestoreProgress
): void {
  if (!callback) return;
  try {
    callback(progress);
  } catch (error) {
    if (__DEV__) console.warn("[replacement-restore] Progress callback failed.", error);
  }
}

function isAbort(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function defaultOpaqueId(
  kind: "attempt" | "preparation" | "recovery" | "restore"
): string {
  return `${kind}-v1:${newUid()}`;
}

export function createReplacementRestoreRuntime(
  dependencies: Omit<ReplacementRestoreRuntimeDependencies, "createOpaqueId"> & {
    createOpaqueId?: ReplacementRestoreRuntimeDependencies["createOpaqueId"];
  }
): ReplacementRestoreEngine {
  const deps: ReplacementRestoreRuntimeDependencies = {
    ...dependencies,
    createOpaqueId: dependencies.createOpaqueId ?? defaultOpaqueId,
  };
  let asyncOperation = false;
  let prepared: PreparedContext | undefined;
  let scheduledInThisProcess: PendingRestoreRecord | undefined;
  let recovery: RecoveryContext | undefined;
  let committed: CommittedContext | undefined;
  // Retained only in this process for the later media owner. It is never
  // serialized and never authorizes candidate replay after process death.
  let postCommitMediaContext:
    | {
        readonly restoreId: string;
        readonly untrustedPreCommitMediaUris: readonly string[];
      }
    | undefined;

  const busyError = () =>
    makeError("restore_busy", "Another replacement restore operation is active.", {
      stage: "selecting",
      liveDatabaseChanged: false,
      transactionState: "not_started",
      recovery: "discard_and_reprepare",
      retryable: true,
    });

  const readPending = () =>
    readPendingRestoreRecord(deps.readControlRecord, deps.stagingRootUri);

  const readOutcome = () => readCommittedRestoreOutcome(deps.readControlRecord);

  function verifyPending(expected: PendingRestoreRecord):
    | { readonly status: "expected" }
    | { readonly status: "absent" }
    | { readonly status: "other"; readonly record: PendingRestoreRecord } {
    const physical = readPending();
    if (physical.status === "absent") return physical;
    return samePendingRestoreRecord(physical.record, expected)
      ? { status: "expected" }
      : { status: "other", record: physical.record };
  }

  function writePendingAndInspect(expected: PendingRestoreRecord): ReturnType<typeof verifyPending> {
    try {
      deps.writeControlRecord("pending", serializePendingRestoreRecord(expected));
    } catch {
      // A failed acknowledgement can still mean the native atomic rename won.
    }
    return verifyPending(expected);
  }

  function retirePendingAndVerify(
    expected: PendingRestoreRecord,
    requireExpectedAtEntry = false
  ): boolean {
    const before = verifyPending(expected);
    if (before.status === "absent") return !requireExpectedAtEntry;
    if (before.status !== "expected") return false;
    try {
      deps.deleteControlRecord("pending");
    } catch {
      // Physical absence below is the authority, not the acknowledgement.
    }
    return readPending().status === "absent";
  }

  function publishOutcomeAndVerify(expected: CommittedRestoreOutcomeRecord): boolean {
    let before;
    try {
      before = readOutcome();
    } catch {
      return false;
    }
    if (before.status === "present") {
      if (sameCommittedRestoreOutcome(before.record, expected)) return true;
      // A valid stale outcome cannot override the physical pending record. The
      // native atomic write publishes this pending restore's committed outcome.
    }
    try {
      deps.writeControlRecord("outcome", serializeCommittedRestoreOutcome(expected));
    } catch {
      // Reread: failed acknowledgement may still have published the record.
    }
    try {
      const after = readOutcome();
      return (
        after.status === "present" &&
        sameCommittedRestoreOutcome(after.record, expected)
      );
    } catch {
      return false;
    }
  }

  function cleanupCandidate(candidatePath: string): void {
    deps.discardCandidate(candidatePath);
  }

  function preparedFailure(error: unknown): ReplacementRestoreError {
    if (error instanceof ReplacementRestoreError) return error;
    if (isPreparationError(error)) {
      return makeError(error.code, error.message, {
        stage: error.stage,
        liveDatabaseChanged: false,
        transactionState: "not_started",
        recovery: "discard_and_reprepare",
        retryable: true,
      });
    }
    return makeError(
      "source_unreadable",
      message(error, "Replacement restore preparation failed."),
      {
        stage: "staging",
        liveDatabaseChanged: false,
        transactionState: "not_started",
        recovery: "discard_and_reprepare",
        retryable: true,
      }
    );
  }

  function recordFailure(error: unknown, stage: RestoreErrorStage): ReplacementRestoreError {
    if (error instanceof ReplacementRestoreError) return error;
    if (error instanceof RestoreRecordValidationError) {
      return makeError(error.code, error.message, {
        stage,
        liveDatabaseChanged: "unknown",
        transactionState: "unknown",
        recovery: "manual_recovery",
        retryable: false,
      });
    }
    return makeError("outcome_ambiguous", message(error, "Restore control state is ambiguous."), {
      stage,
      liveDatabaseChanged: "unknown",
      transactionState: "unknown",
      recovery: "manual_recovery",
      retryable: false,
    });
  }

  function retainRecovery(
    restoreId: string,
    expectedPending: PendingRestoreRecord
  ): string {
    const recoveryToken = deps.createOpaqueId("recovery");
    recovery = { restoreId, recoveryToken, expectedPending };
    return recoveryToken;
  }

  function preTransactionFailure(options: {
    record: PendingRestoreRecord;
    error: unknown;
    code?: ReplacementRestoreErrorCode;
  }): RestoreStartupFailure {
    const unchanged = options.record.state !== "attempting";
    const candidateMayBeAttached =
      options.error instanceof ReplacementCandidateDetachFailure;
    const validationError = options.error instanceof ReplacementCandidateDetachFailure
      ? options.error.primaryCause
      : options.error;
    const recoveryToken = unchanged && !candidateMayBeAttached
      ? retainRecovery(options.record.restoreId, options.record)
      : undefined;
    return startupFailure(
      makeError(
        options.code ??
          (validationError instanceof RestoreRecordValidationError
            ? validationError.code
            : validationError instanceof RestoreSchemaValidationError
              ? "unsupported_schema"
            : "integrity_failed"),
        message(validationError, "Restore candidate validation failed before transaction."),
        {
          stage: "checking_pending_restore",
          liveDatabaseChanged: unchanged ? false : "unknown",
          transactionState: "not_started",
          recovery:
            unchanged && !candidateMayBeAttached
              ? "discard_and_reprepare"
              : "retry_cold_start",
          recoveryToken,
          retryable: true,
        }
      ),
      options.record.restoreId
    );
  }

  function committedPendingOutcome(context: CommittedContext): RestoreCommittedPendingOutcome {
    return {
      status: "committed_pending_outcome",
      restoreId: context.restoreId,
      liveDatabaseChanged: true,
      normalUseBlocked: true,
      retryable: true,
      warning: {
        stage: "committed_outcome_write",
        code: "control_write_or_verification_failed",
      },
    };
  }

  function committedPendingCleanup(context: CommittedContext): RestoreCommittedPendingCleanup {
    return {
      status: "committed_pending_cleanup",
      restoreId: context.restoreId,
      liveDatabaseChanged: true,
      normalUseBlocked: true,
      retryable: true,
      warning: {
        stage: "pending_manifest_cleanup",
        code: "control_delete_or_verification_failed",
      },
    };
  }

  function finalizeCommitted(context: CommittedContext):
    | RestoreCommitResult
    | RestoreCommittedPendingOutcome
    | RestoreCommittedPendingCleanup {
    if (!publishOutcomeAndVerify(context.outcome)) {
      committed = context;
      return committedPendingOutcome(context);
    }
    let retired = false;
    try {
      retired = retirePendingAndVerify(context.expectedPending);
    } catch {
      retired = false;
    }
    if (!retired) {
      committed = context;
      return committedPendingCleanup(context);
    }
    if (!context.candidateMayBeAttached) {
      try {
        cleanupCandidate(context.candidatePath);
      } catch (error) {
        context.warnings.push({
          stage: "staging_cleanup",
          code: errorCode(error),
        });
      }
    }
    postCommitMediaContext = {
      restoreId: context.restoreId,
      untrustedPreCommitMediaUris: context.untrustedPreCommitMediaUris,
    };
    void postCommitMediaContext;
    committed = undefined;
    scheduledInThisProcess = undefined;
    return {
      status: "committed",
      restoreId: context.restoreId,
      liveDatabaseChanged: true,
      rowsByTable: context.rowsByTable,
      pbEventsRebuilt: context.pbEventsRebuilt,
      postCommitPending: true,
      warnings: context.warnings,
    };
  }

  return {
    async prepareReplacementRestore(options) {
      if (asyncOperation || prepared || scheduledInThisProcess) throw busyError();
      asyncOperation = true;
      try {
        const candidate = await deps.prepareCandidate(options);
        if (!candidate) {
          return { status: "cancelled", liveDatabaseChanged: false };
        }
        const token = deps.createOpaqueId("preparation");
        prepared = { token, candidate };
        return {
          status: "ready",
          token,
          sourceDisplayName: candidate.sourceDisplayName,
          candidateSha256: candidate.candidateSha256,
          rowsByTable: candidate.rowsByTable,
          pbEventsInSource: candidate.pbEventsInSource,
          mediaRows: candidate.mediaRows,
        };
      } catch (error) {
        throw preparedFailure(error);
      } finally {
        asyncOperation = false;
      }
    },

    async scheduleReplacementRestore(options) {
      if (asyncOperation) throw busyError();
      const context = prepared;
      if (!context || context.token !== options.token) {
        throw makeError("restore_busy", "Preparation token is stale or already consumed.", {
          stage: "scheduling",
          liveDatabaseChanged: false,
          transactionState: "not_started",
          recovery: "discard_and_reprepare",
          retryable: false,
        });
      }
      prepared = undefined;
      asyncOperation = true;
      let mustRetainCandidate = false;
      try {
        if (isAbort(options.signal)) {
          cleanupCandidate(context.candidate.candidatePath);
          return { status: "cancelled", liveDatabaseChanged: false };
        }
        emitProgress(options.onProgress, { phase: "scheduling", cancellable: true });
        const nativeProcessToken = deps.getNativeProcessToken();
        if (!isNativeProcessToken(nativeProcessToken)) {
          throw makeError(
            "invalid_process_identity",
            "A valid native process identity is required to schedule restore.",
            {
              stage: "scheduling",
              liveDatabaseChanged: false,
              transactionState: "not_started",
              recovery: "discard_and_reprepare",
              retryable: false,
            }
          );
        }
        if (!deps.candidateExists(context.candidate.candidatePath)) {
          throw makeError("candidate_path_invalid", "Prepared candidate is missing.", {
            stage: "scheduling",
            liveDatabaseChanged: false,
            transactionState: "not_started",
            recovery: "discard_and_reprepare",
            retryable: false,
          });
        }
        const digest = await deps.hashCandidate(
          context.candidate.candidatePath,
          options.signal
        );
        if (digest !== context.candidate.candidateSha256) {
          throw makeError("candidate_changed", "Prepared candidate changed before scheduling.", {
            stage: "scheduling",
            liveDatabaseChanged: false,
            transactionState: "not_started",
            recovery: "discard_and_reprepare",
            retryable: false,
          });
        }
        if (isAbort(options.signal)) {
          cleanupCandidate(context.candidate.candidatePath);
          return { status: "cancelled", liveDatabaseChanged: false };
        }
        if (readPending().status !== "absent" || readOutcome().status !== "absent") {
          throw busyError();
        }
        const record: ScheduledPendingRestoreRecord = {
          version: REPLACEMENT_RESTORE_RECORD_VERSION,
          restoreId: deps.createOpaqueId("restore"),
          candidatePath: context.candidate.candidatePath,
          candidateSha256: context.candidate.candidateSha256,
          schemaManifestId: RESTORE_SCHEMA_MANIFEST_ID,
          scheduledFromNativeProcessToken: nativeProcessToken,
          rowsByTable: context.candidate.rowsByTable,
          pbEventsInSource: context.candidate.pbEventsInSource,
          state: "scheduled",
        };
        if (isAbort(options.signal)) {
          cleanupCandidate(context.candidate.candidatePath);
          return { status: "cancelled", liveDatabaseChanged: false };
        }
        // From the first native publication call onward, the candidate is
        // retained unless physical absence is positively established.
        mustRetainCandidate = true;
        const publication = writePendingAndInspect(record);
        if (publication.status === "expected") {
          mustRetainCandidate = true;
          scheduledInThisProcess = record;
          emitProgress(options.onProgress, {
            phase: "restart_required",
            cancellable: false,
          });
          return {
            status: "restart_required",
            restoreId: record.restoreId,
            liveDatabaseChanged: false,
            restartRequired: true,
          };
        }
        if (publication.status === "absent") mustRetainCandidate = false;
        if (publication.status === "other") {
          scheduledInThisProcess = record;
        }
        throw makeError(
          "outcome_ambiguous",
          publication.status === "absent"
            ? "Pending restore publication was not persisted."
            : "Pending restore publication is ambiguous.",
          {
            stage: "scheduling",
            liveDatabaseChanged: false,
            transactionState: "not_started",
            recovery: publication.status === "absent" ? "discard_and_reprepare" : "manual_recovery",
            retryable: publication.status === "absent",
          }
        );
      } catch (error) {
        if (!mustRetainCandidate) {
          try {
            cleanupCandidate(context.candidate.candidatePath);
          } catch {
            // Preserve the scheduling failure.
          }
        }
        if (!mustRetainCandidate && isAbort(options.signal)) {
          return { status: "cancelled", liveDatabaseChanged: false };
        }
        if (error instanceof ReplacementRestoreError) throw error;
        if (error instanceof RestoreRecordValidationError) {
          throw recordFailure(error, "scheduling");
        }
        throw makeError("outcome_ambiguous", message(error, "Restore scheduling failed."), {
          stage: "scheduling",
          liveDatabaseChanged: false,
          transactionState: "not_started",
          recovery: mustRetainCandidate ? "manual_recovery" : "discard_and_reprepare",
          retryable: !mustRetainCandidate,
        });
      } finally {
        asyncOperation = false;
      }
    },

    async discardPreparedRestore(token) {
      if (asyncOperation) throw busyError();
      const context = prepared;
      if (!context || context.token !== token) {
        throw makeError("restore_busy", "Preparation token is stale or already consumed.", {
          stage: "scheduling",
          liveDatabaseChanged: false,
          transactionState: "not_started",
          recovery: "discard_and_reprepare",
          retryable: false,
        });
      }
      prepared = undefined;
      cleanupCandidate(context.candidate.candidatePath);
    },

    async cancelScheduledReplacementRestore(restoreId) {
      if (asyncOperation) throw busyError();
      asyncOperation = true;
      try {
        const pending = readPending();
        if (pending.status !== "present" || pending.record.restoreId !== restoreId) {
          throw makeError("outcome_ambiguous", "Scheduled restore is absent or does not match.", {
            stage: "checking_pending_restore",
            liveDatabaseChanged: "unknown",
            transactionState: "unknown",
            recovery: "manual_recovery",
            retryable: false,
          });
        }
        const currentToken = deps.getNativeProcessToken();
        if (
          !currentToken ||
          pending.record.state !== "scheduled" ||
          currentToken !== pending.record.scheduledFromNativeProcessToken
        ) {
          throw makeError(
            "invalid_process_identity",
            "Only the original scheduling process may cancel this restore.",
            {
              stage: "checking_pending_restore",
              liveDatabaseChanged:
                pending.record.state === "attempting" ? "unknown" : false,
              transactionState: "not_started",
              recovery: "manual_recovery",
              retryable: false,
            }
          );
        }
        if (!retirePendingAndVerify(pending.record)) {
          throw makeError("outcome_ambiguous", "Scheduled restore cancellation is ambiguous.", {
            stage: "checking_pending_restore",
            liveDatabaseChanged: false,
            transactionState: "not_started",
            recovery: "manual_recovery",
            retryable: false,
          });
        }
        cleanupCandidate(pending.record.candidatePath);
        scheduledInThisProcess = undefined;
      } catch (error) {
        if (error instanceof ReplacementRestoreError) throw error;
        throw recordFailure(error, "checking_pending_restore");
      } finally {
        asyncOperation = false;
      }
    },

    async discardSafelyFailedScheduledRestore(options) {
      if (asyncOperation) throw busyError();
      const authorization = recovery;
      recovery = undefined;
      if (
        !authorization ||
        authorization.restoreId !== options.restoreId ||
        authorization.recoveryToken !== options.recoveryToken
      ) {
        throw makeError("outcome_ambiguous", "Safe-discard authorization is stale or invalid.", {
          stage: "checking_pending_restore",
          liveDatabaseChanged: "unknown",
          transactionState: "unknown",
          recovery: "manual_recovery",
          retryable: false,
        });
      }
      if (!retirePendingAndVerify(authorization.expectedPending, true)) {
        throw makeError("outcome_ambiguous", "Safe discard could not prove pending retirement.", {
          stage: "checking_pending_restore",
          liveDatabaseChanged: "unknown",
          transactionState: "unknown",
          recovery: "manual_recovery",
          retryable: false,
        });
      }
      cleanupCandidate(authorization.expectedPending.candidatePath);
      return {
        status: "discarded",
        liveDatabaseChanged: false,
        reinitializeRequired: true,
      };
    },

    applyScheduledReplacementRestoreAtStartup(options): RestoreStartupResult {
      // A safe-discard authorization describes one observed failure state. Any
      // later startup apply supersedes that observation, even before it reads
      // or attempts the physical pending record.
      recovery = undefined;
      let pending;
      try {
        pending = readPending();
      } catch (error) {
        const restoreId =
          error instanceof RestoreRecordValidationError
            ? error.trustedRestoreId
            : undefined;
        return startupFailure(recordFailure(error, "checking_pending_restore"), restoreId);
      }
      if (pending.status === "absent") {
        try {
          const outcome = readOutcome();
          if (outcome.status === "absent") {
            return { status: "no_pending", pendingPresence: "absent" };
          }
          return {
            status: "postcommit_pending",
            restoreId: outcome.record.restoreId,
            liveDatabaseChanged: true,
            rowsByTable: outcome.record.rowsByTable,
            pbEventsRebuilt: outcome.record.pbEventsRebuilt,
            requiresExplicitMediaScan: true,
          };
        } catch (error) {
          const restoreId =
            error instanceof RestoreRecordValidationError
              ? error.trustedRestoreId
              : undefined;
          return startupFailure(recordFailure(error, "checking_pending_restore"), restoreId);
        }
      }

      const record = pending.record;
      const nativeProcessToken = options.nativeProcessToken;
      if (!isNativeProcessToken(nativeProcessToken)) {
        return startupFailure(
          makeError("invalid_process_identity", "Pending restore requires native process identity.", {
            stage: "checking_pending_restore",
            liveDatabaseChanged: record.state === "attempting" ? "unknown" : false,
            transactionState: "not_started",
            recovery: "retry_cold_start",
            retryable: true,
          }),
          record.restoreId
        );
      }
      const latestToken =
        record.state === "scheduled"
          ? undefined
          : record.latestAttemptNativeProcessToken;
      if (
        nativeProcessToken === record.scheduledFromNativeProcessToken ||
        nativeProcessToken === latestToken
      ) {
        return {
          status: "restart_required",
          restoreId: record.restoreId,
          liveDatabaseChanged: record.state === "attempting" ? "unknown" : false,
          restartRequired: true,
        };
      }

      const baselineProvenUnchanged = record.state !== "attempting";
      let session: ValidatedReplacementSession | undefined;
      try {
        if (!deps.candidateExists(record.candidatePath)) {
          throw new RestoreRecordValidationError(
            "candidate_path_invalid",
            "The sealed restore candidate is missing.",
            record.restoreId
          );
        }
        const digest = deps.hashCandidateSync(record.candidatePath);
        if (digest !== record.candidateSha256) {
          throw new RestoreRecordValidationError(
            "candidate_changed",
            "The sealed restore candidate digest changed.",
            record.restoreId
          );
        }
        session = deps.openValidatedSession({
          sqlite: options.sqlite,
          candidatePath: record.candidatePath,
          candidateExists: () => deps.candidateExists(record.candidatePath),
          expectedRowsByTable: record.rowsByTable,
        });
      } catch (error) {
        return preTransactionFailure({ record, error });
      }

      const attempting: AttemptedPendingRestoreRecord = {
        ...record,
        state: "attempting",
        latestAttemptId: deps.createOpaqueId("attempt"),
        latestAttemptNativeProcessToken: nativeProcessToken,
        baselineWasProvenUnchanged: baselineProvenUnchanged,
      };
      try {
        const before = verifyPending(record);
        if (before.status !== "expected") {
          throw new Error("Pending restore changed before attempt publication.");
        }
        const publication = writePendingAndInspect(attempting);
        if (publication.status !== "expected") {
          if (
            baselineProvenUnchanged &&
            publication.status === "other" &&
            samePendingRestoreRecord(publication.record, record)
          ) {
            let detachError: unknown;
            try {
              session.detach();
            } catch (error) {
              detachError = error;
            }
            return preTransactionFailure({
              record,
              error:
                detachError === undefined
                  ? new Error("Restore attempt marker was not published.")
                  : new ReplacementCandidateDetachFailure(
                      new Error("Restore attempt marker was not published."),
                      detachError
                    ),
              code: "outcome_ambiguous",
            });
          }
          throw new Error("Restore attempt publication is ambiguous.");
        }
      } catch (error) {
        try {
          session.detach();
        } catch {
          // The startup gate remains closed.
        }
        return startupFailure(
          makeError("outcome_ambiguous", message(error, "Attempt publication failed."), {
            stage: "acquiring_lock",
            liveDatabaseChanged: baselineProvenUnchanged ? false : "unknown",
            transactionState: "not_started",
            recovery: "retry_cold_start",
            retryable: true,
          }),
          record.restoreId
        );
      }

      let transaction: ReplacementTransactionResult;
      try {
        transaction = session.replace();
      } catch (error) {
        let detachError: unknown;
        try {
          session.detach();
        } catch (detachFailure) {
          detachError = detachFailure;
        }
        if (error instanceof ReplacementTransactionFailure) {
          if (
            error.kind === "rolled_back" &&
            baselineProvenUnchanged &&
            detachError === undefined
          ) {
            const rolledBack: AttemptedPendingRestoreRecord = {
              ...attempting,
              state: "rolled_back_unchanged",
              baselineWasProvenUnchanged: true,
            };
            let persisted = false;
            try {
              persisted = writePendingAndInspect(rolledBack).status === "expected";
            } catch {
              persisted = false;
            }
            if (persisted) {
              const recoveryToken = retainRecovery(record.restoreId, rolledBack);
              return startupFailure(
                makeError("commit_failed", error.message, {
                  stage: "verifying_commit",
                  liveDatabaseChanged: false,
                  transactionState: "rolled_back",
                  recovery: "discard_and_reprepare",
                  recoveryToken,
                  retryable: true,
                }),
                record.restoreId
              );
            }
          }
          const rollbackUnknown = error.kind === "rollback_unknown";
          return startupFailure(
            makeError(rollbackUnknown ? "rollback_failed" : "commit_failed", error.message, {
              stage: "verifying_commit",
              liveDatabaseChanged:
                error.kind === "rolled_back" && baselineProvenUnchanged
                  ? false
                  : "unknown",
              transactionState:
                error.kind === "rolled_back" && baselineProvenUnchanged
                  ? "rolled_back"
                  : "unknown",
              recovery: "retry_cold_start",
              retryable: true,
            }),
            record.restoreId
          );
        }
        return startupFailure(
          makeError("commit_failed", message(error, "Replacement transaction failed."), {
            stage: "verifying_commit",
            liveDatabaseChanged: "unknown",
            transactionState: "unknown",
            recovery: "retry_cold_start",
            retryable: true,
          }),
          record.restoreId
        );
      }

      const warnings: CommittedContext["warnings"] = [];
      let candidateMayBeAttached = false;
      try {
        session.detach();
      } catch (error) {
        candidateMayBeAttached = true;
        warnings.push({ stage: "detach_candidate", code: errorCode(error) });
      }
      const outcome: CommittedRestoreOutcomeRecord = {
        version: REPLACEMENT_RESTORE_RECORD_VERSION,
        restoreId: record.restoreId,
        candidateSha256: record.candidateSha256,
        schemaManifestId: RESTORE_SCHEMA_MANIFEST_ID,
        rowsByTable: transaction.rowsByTable,
        pbEventsRebuilt: transaction.pbEventsRebuilt,
        postCommitStatus: "pending",
      };
      const context: CommittedContext = {
        restoreId: record.restoreId,
        candidatePath: record.candidatePath,
        expectedPending: attempting,
        outcome,
        rowsByTable: transaction.rowsByTable,
        pbEventsRebuilt: transaction.pbEventsRebuilt,
        untrustedPreCommitMediaUris: transaction.untrustedPreCommitMediaUris,
        candidateMayBeAttached,
        warnings,
      };
      committed = context;
      return finalizeCommitted(context);
    },

    resumeCommittedStartupFinalization(options) {
      const context = committed;
      if (!context || context.restoreId !== options.restoreId) {
        throw makeError(
          "outcome_ambiguous",
          "No matching same-process committed restore can be finalized.",
          {
            stage: "committed",
            liveDatabaseChanged: "unknown",
            transactionState: "unknown",
            recovery: "retry_cold_start",
            retryable: true,
          }
        );
      }
      return finalizeCommitted(context);
    },
  };
}
