import type { NativeProcessToken } from "../native/appProcessIdentity";
import type { RESTORE_APP_TABLES } from "./restoreSchemaManifest";
import type { SQLiteDatabase } from "expo-sqlite";

export type AppTable = (typeof RESTORE_APP_TABLES)[number];

export type RestorePreparePhase =
  | "selecting"
  | "staging"
  | "validating_source"
  | "migrating_candidate"
  | "validating_candidate"
  | "ready";

export type RestoreSchedulePhase = "scheduling" | "restart_required";

export type RestoreStartupPhase =
  | "checking_pending_restore"
  | "acquiring_lock"
  | "replacing_rows"
  | "rebuilding_pbs"
  | "verifying_commit"
  | "committed"
  | "reconciling_media"
  | "complete";

export type RestoreProgress = {
  readonly phase: RestorePreparePhase | RestoreSchedulePhase | RestoreStartupPhase;
  readonly cancellable: boolean;
  readonly completed?: number;
  readonly total?: number;
};

export type RestoreSource = {
  readonly uri: string;
  readonly displayName?: string | null;
  readonly mimeType?: string | null;
};

export type RestorePreparation = {
  readonly status: "ready";
  readonly token: string;
  readonly sourceDisplayName: string | null;
  readonly candidateSha256: string;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsInSource: number;
  readonly mediaRows: number;
};

export type RestoreCancelled = {
  readonly status: "cancelled";
  readonly liveDatabaseChanged: false;
};

export type RestoreScheduled = {
  readonly status: "restart_required";
  readonly restoreId: string;
  readonly liveDatabaseChanged: false;
  readonly restartRequired: true;
};

export type RestorePrepareOptions = {
  readonly source?: RestoreSource;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RestoreProgress) => void;
};

export type RestoreScheduleOptions = {
  readonly token: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RestoreProgress) => void;
};

export type DiscardSafelyFailedScheduledRestoreOptions = {
  readonly restoreId: string;
  readonly recoveryToken: string;
};

export type RestoreDiscarded = {
  readonly status: "discarded";
  readonly liveDatabaseChanged: false;
  readonly reinitializeRequired: true;
};

export type RestoreStartupOptions = {
  readonly sqlite: SQLiteDatabase;
  readonly nativeProcessToken: NativeProcessToken | null;
};

export type RestoreNoPending = {
  readonly status: "no_pending";
  readonly pendingPresence: "absent";
};

export type RestorePendingColdStart = {
  readonly status: "restart_required";
  readonly restoreId: string;
  readonly liveDatabaseChanged: boolean | "unknown";
  readonly restartRequired: true;
};

export type RestorePostCommitPending = {
  readonly status: "postcommit_pending";
  readonly restoreId: string;
  readonly liveDatabaseChanged: true;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsRebuilt: number;
  readonly requiresExplicitMediaScan: true;
};

export type RestoreCommitResult = {
  readonly status: "committed";
  readonly restoreId: string;
  readonly liveDatabaseChanged: true;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsRebuilt: number;
  readonly postCommitPending: true;
  readonly warnings: readonly {
    readonly stage: "detach_candidate" | "staging_cleanup";
    readonly code: string;
  }[];
};

export type RestoreCommittedPendingCleanup = {
  readonly status: "committed_pending_cleanup";
  readonly restoreId: string;
  readonly liveDatabaseChanged: true;
  readonly normalUseBlocked: true;
  readonly retryable: true;
  readonly warning: { readonly stage: "pending_manifest_cleanup"; readonly code: string };
};

export type RestoreCommittedPendingOutcome = {
  readonly status: "committed_pending_outcome";
  readonly restoreId: string;
  readonly liveDatabaseChanged: true;
  readonly normalUseBlocked: true;
  readonly retryable: true;
  readonly warning: { readonly stage: "committed_outcome_write"; readonly code: string };
};

export type ReplacementRestoreErrorCode =
  | "restore_busy"
  | "source_unreadable"
  | "invalid_sqlite"
  | "unsupported_schema"
  | "candidate_migration_failed"
  | "integrity_failed"
  | "foreign_key_failed"
  | "soft_link_failed"
  | "invalid_process_identity"
  | "candidate_path_invalid"
  | "manifest_version_mismatch"
  | "candidate_changed"
  | "commit_failed"
  | "rollback_failed"
  | "outcome_ambiguous";

export type RestoreTransactionState = "not_started" | "rolled_back" | "committed" | "unknown";
export type RestoreRecovery =
  | "discard_and_reprepare"
  | "retry_cold_start"
  | "retry_committed_cleanup"
  | "manual_recovery";
export type RestoreErrorStage = RestorePreparePhase | RestoreSchedulePhase | RestoreStartupPhase;

export type ReplacementRestoreErrorContext = {
  readonly stage: RestoreErrorStage;
  readonly liveDatabaseChanged: boolean | "unknown";
  readonly transactionState: RestoreTransactionState;
  readonly recovery: RestoreRecovery;
  readonly recoveryToken?: string;
  readonly retryable: boolean;
};

export class ReplacementRestoreError extends Error {
  readonly code: ReplacementRestoreErrorCode;
  readonly stage: RestoreErrorStage;
  readonly liveDatabaseChanged: boolean | "unknown";
  readonly transactionState: RestoreTransactionState;
  readonly recovery: RestoreRecovery;
  readonly recoveryToken?: string;
  readonly retryable: boolean;

  constructor(
    code: ReplacementRestoreErrorCode,
    message: string,
    context: ReplacementRestoreErrorContext
  ) {
    super(message);
    this.name = "ReplacementRestoreError";
    this.code = code;
    this.stage = context.stage;
    this.liveDatabaseChanged = context.liveDatabaseChanged;
    this.transactionState = context.transactionState;
    this.recovery = context.recovery;
    this.recoveryToken = context.recoveryToken;
    this.retryable = context.retryable;
  }
}

export type RestoreStartupFailure = {
  readonly status: "failed";
  readonly restoreId?: string;
  readonly error: ReplacementRestoreError;
};

export type RestoreStartupResult =
  | RestoreCommitResult
  | RestoreCommittedPendingOutcome
  | RestoreCommittedPendingCleanup
  | RestorePendingColdStart
  | RestoreStartupFailure
  | RestoreNoPending
  | RestorePostCommitPending;

export type RestoreStartupBlock =
  | RestorePendingColdStart
  | RestoreStartupFailure
  | RestoreCommittedPendingOutcome
  | RestoreCommittedPendingCleanup;

export type ResumeCommittedStartupFinalizationOptions = {
  readonly restoreId: string;
};

export type ReplacementRestoreResult = {
  readonly status: "restored";
  readonly restoreId: string;
  readonly liveDatabaseChanged: true;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsRebuilt: number;
  readonly media: {
    readonly total: number;
    readonly resolved: number;
    readonly unresolved: number;
    readonly skippedPermission: number;
    readonly errors: readonly { readonly mediaId: number | null; readonly code: string }[];
  };
  readonly cleanup: {
    readonly deletedManagedFiles: number;
    readonly skippedUntrustedPaths: number;
    readonly errors: number;
  };
  readonly warnings: readonly {
    readonly stage: "detach_candidate" | "staging_cleanup" | "media_reconciliation";
    readonly code: string;
  }[];
};

export type CompleteReplacementRestorePostCommitOptions = {
  readonly sqlite: SQLiteDatabase;
  readonly restoreId: string;
  readonly mode: "scan" | "skip";
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RestoreProgress) => void;
};

export type DatabaseStartupSnapshot =
  | { readonly phase: "starting"; readonly connectionInitialized: false; readonly canMountApp: false }
  | {
      readonly phase: "blocked";
      readonly connectionInitialized: boolean;
      readonly canMountApp: false;
      readonly blocker: RestoreStartupBlock;
      readonly allowedActions: readonly DatabaseStartupActionKind[];
    }
  | {
      readonly phase: "postcommit";
      readonly connectionInitialized: true;
      readonly canMountApp: false;
      readonly restoreId: string;
      readonly requiresExplicitMediaScan: boolean;
      readonly progress?: RestoreProgress;
    }
  | {
      readonly phase: "restored";
      readonly connectionInitialized: true;
      readonly canMountApp: false;
      readonly result: ReplacementRestoreResult;
    }
  | { readonly phase: "ready"; readonly connectionInitialized: true; readonly canMountApp: true };

export type DatabaseStartupActionKind =
  | "cancel_and_reload"
  | "discard_and_reload"
  | "retry_control_finalization"
  | "complete_media"
  | "skip_media"
  | "acknowledge_completion";

export type DatabaseStartupAction =
  | { readonly kind: "cancel_and_reload"; readonly restoreId: string }
  | { readonly kind: "discard_and_reload"; readonly restoreId: string; readonly recoveryToken: string }
  | { readonly kind: "retry_control_finalization"; readonly restoreId: string }
  | { readonly kind: "complete_media"; readonly restoreId: string; readonly signal?: AbortSignal }
  | { readonly kind: "skip_media"; readonly restoreId: string }
  | { readonly kind: "acknowledge_completion"; readonly restoreId: string };

export type ReplacementRestoreAvailability =
  | { readonly available: true }
  | {
      readonly available: false;
      readonly reason: "unsupported_platform" | "native_unavailable" | "startup_blocked";
    };

export type ReplacementRestoreService = {
  prepareReplacementRestore(
    options: RestorePrepareOptions
  ): Promise<RestorePreparation | RestoreCancelled>;
  scheduleReplacementRestore(
    options: RestoreScheduleOptions
  ): Promise<RestoreScheduled | RestoreCancelled>;
  discardPreparedRestore(token: string): Promise<void>;
  cancelScheduledReplacementRestore(restoreId: string): Promise<void>;
  discardSafelyFailedScheduledRestore(
    options: DiscardSafelyFailedScheduledRestoreOptions
  ): Promise<RestoreDiscarded>;
  applyScheduledReplacementRestoreAtStartup(options: RestoreStartupOptions): RestoreStartupResult;
  resumeCommittedStartupFinalization(
    options: ResumeCommittedStartupFinalizationOptions
  ): RestoreCommitResult | RestoreCommittedPendingOutcome | RestoreCommittedPendingCleanup;
  completeReplacementRestorePostCommit(
    options: CompleteReplacementRestorePostCommitOptions
  ): Promise<ReplacementRestoreResult>;
};

export type ReplacementRestoreLifecycleFacade = {
  getDatabaseStartupSnapshot(): DatabaseStartupSnapshot;
  subscribeDatabaseStartup(listener: () => void): () => void;
  performDatabaseStartupAction(action: DatabaseStartupAction): Promise<void>;
  scheduleReplacementRestoreAndBlock(
    options: RestoreScheduleOptions
  ): Promise<RestoreScheduled | RestoreCancelled>;
  getReplacementRestoreAvailability(): ReplacementRestoreAvailability;
};
