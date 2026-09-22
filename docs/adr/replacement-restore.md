# ADR: replacement database restore

- Status: Design/proof accepted by the organiser on 2026-09-22 after independent third review of `100a812771a2165553e5bb9ca665297e9108883d`; production acceptance remains gated by the obligations below.
- Ticket: MVP-006A design and host proof only.
- Original ticket inspection base: `5c96af36a9b0da283bb012b2945f83717aea8cc4`.
- Current review base: `8dc8d74742197266934601d9c2190a81cc4bf3dd`.
- Decision owner: organiser.

## Context

The product contract in `docs/mvp-product-facts.md` says that restore replaces current application data. The current `importDatabaseBackup()` path instead merges selected history tables and `media`, does not restore settings, formulas, programs, tags, or their schedules, and matches legacy UID-less rows by mutable field combinations. That behavior cannot implement replacement semantics.

The retained Android evidence contains a concrete ambiguity. The read-only pre-import snapshot has 732 workouts, 733 workout entries, 5,742 sets, and one media row. It has two UID-less workout rows with the same `started_at`, `completed_at`, and note, while their child exercises differ. Importing the exported database into that same live database added workouts 733 and 734, entries 734 and 735, and sets 5,743 and 5,744. The post-import counts are 734, 735, and 5,744 respectively. A merge matcher cannot recover identity when legacy rows have no UID and share its workout match fields.

The app holds one module-level `expo-sqlite` connection and one Drizzle binding for the process lifetime. `ThemeProvider`, `UnitPreferenceProvider`, and the settings screen also retain database-derived values in React state. `lib/db/introspection.ts` retains a column cache. Any restore design must account for those lifetimes.

The installed `expo-sqlite` 57.0.3 package already exposes `backupDatabaseAsync()` and `backupDatabaseSync()`. Its Android and iOS implementations call SQLite's online backup API. SQLite documents that a completed online backup is a consistent snapshot and includes the source database's committed state. This is the existing library to use for export rather than implementing another file-copy protocol:

- [Expo SDK 57 SQLite backup API](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#backupdatabaseasyncoptions)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- installed source: `node_modules/expo-sqlite/src/SQLiteDatabase.ts`, `android/src/main/cpp/NativeDatabaseBinding.cpp`, and `ios/SQLiteModule.swift`

## Decision

Use transactional logical replacement on the existing live connection. Do not swap the live database file.

The restore service will copy the selected document into private staging, validate and migrate that staging copy in isolation, and schedule the accepted candidate. On the next cold process start, before the React tree or any background effect exists, startup attaches the candidate to the existing live connection and replaces all app-owned table rows inside one `BEGIN IMMEDIATE` transaction. It copies explicit IDs and UIDs, never matches candidate rows to live rows, rebuilds `pr_events` from the copied `sets`, validates hard and soft links, and commits once. Gallery reconciliation and managed-file cleanup run after the data commit and cannot invalidate it.

This accepts the design and host proof. Production work proceeds through separate
scoped tickets; it does not accept a production restore implementation.

### Why logical replacement

| Concern | Atomic file swap | Transactional logical replacement |
| --- | --- | --- |
| Existing `sqlite` and Drizzle objects | Must close and replace the module-level handle; every importer still holds the old object | Existing handle remains valid |
| Native connection cache | Requires proven close/reopen behavior for pooled and `useNewConnection` handles | No live reopen |
| WAL/SHM sidecars | Requires a proven same-filesystem rename protocol for the database and sidecars | SQLite owns WAL recovery and transaction atomicity |
| Failure rollback | Needs a multi-file rename journal and crash recovery | SQLite rolls back the transaction |
| Backup schema objects | A swap brings every accepted schema object into live storage | Only explicit table data is copied; triggers and views are never copied |
| Replacement coverage | Exact if swap is correct | Exact for the 15 declared app tables, with an explicit rule for derived PB rows |
| Cache reset | Requires a database-handle restart plus React reset | Cold-start apply occurs before caches or screen state exist; schema and handle stay stable |

File swap remains rejected until native Android and iOS tests prove close/reopen, same-filesystem atomic replacement, sidecar handling, and crash recovery. Those proofs do not exist in this ticket.

## Table policy

After candidate migration, the candidate must contain the current definitions for all 15 app-owned tables. A missing optional legacy-era table is created empty by migration. A missing core history table fails preparation.

| Table | Replacement policy |
| --- | --- |
| `settings` | Copy the singleton row with its ID. If the table was absent in a supported old backup, restore an empty table; existing getters supply defaults. |
| `user_checkins` | Copy every row with explicit ID and UID. Delete all live-only rows. |
| `exercises` | Copy every row with explicit ID and UID after the supported exercise migration. Preserve parent IDs and duplicate display names. |
| `workouts` | Copy every row with explicit ID and UID. UID-less legacy rows are migrated on the isolated candidate and are never merge-matched. |
| `workout_exercises` | Copy every row with explicit ID and UID after `workouts` and `exercises`. Preserve notes, completion fields, dates, and order. |
| `sets` | Copy every row with explicit ID and UID after its parents. Preserve `workout_exercise_id`, notes, group IDs, and dates. |
| `psl_programs` | Copy every program definition, activation field, source, hash, units, and timestamps. Delete live-only programs. |
| `program_calendar` | Copy every row after programs. Preserve IDs, dates, state, completion, sequence, and overrides. |
| `program_calendar_exercises` | Copy every row after calendars. Preserve the application-managed `workout_exercise_id` soft link exactly, then validate that every non-null target exists. |
| `program_calendar_sets` | Copy every row after calendar exercises and real sets. Preserve `set_id`, actuals, logged state, and timestamps; validate the FK. |
| `pr_events` | Do not copy candidate rows. Delete live rows and rebuild from restored `sets` using the canonical PB algorithm. Return the rebuilt count separately. |
| `tags` | Copy every row with explicit ID. Delete live-only tags. |
| `taggings` | Copy every row with explicit ID after tags. Preserve the polymorphic target fields exactly. |
| `media` | Copy every row with explicit ID after workouts and sets, but insert `local_uri = ''`. A backup URI or destination content ID is not portable identity and must never become playable without resolver verification. Preserve the numeric row ID, links, and metadata; copy no video bytes. |
| `exercise_formula_overrides` | Copy every row after exercises. Delete live-only overrides. |

Known obsolete `planned_workouts`, `progressions`, `program_exercises`, `program_days`, and `programs` tables may occur in an old candidate. Candidate migration drops them. They are not copied. Unknown tables fail closed.

## Preparation protocol

Preparation must not touch the live database.

1. The document picker accepts `application/vnd.sqlite3`, `application/x-sqlite3`, `application/octet-stream`, and `*/*`. Filename and extension are hints only. A valid extensionless SQLite document is accepted.
2. Copy the picked document into a new private staging directory. Never open or migrate the provider-owned source document.
3. Check the SQLite header, a bounded nonzero size, and path existence before opening the staging copy so Expo cannot silently create a replacement database for a missing path. Installed Expo 57 exposes no read-only open flag. Validation-only connections must target only the private copy, set `PRAGMA query_only=ON` immediately, and compare the main-file digest before and after validation. This is defense in depth, not a claim that Expo opened read-only.
4. Set defensive connection options on the staging connection, including `PRAGMA trusted_schema=OFF` where supported. Reject triggers and views before migration. Reject unknown tables. Do not execute candidate-supplied schema SQL.
5. Match the pre-migration catalog against a versioned allowlist of evidenced historical table definitions, columns, indexes, foreign keys, and constraints. Required core tables are `exercises`, `workouts`, `workout_exercises`, and `sets`; explicitly listed optional tables may be absent.
6. Run `initializeDatabase()` against only the staging copy. The current bootstrap has operations that are not one encompassing transaction. That is acceptable here because a failed staging candidate is discarded and live data remains untouched.
7. Match the resulting catalog against a versioned allowlist of current-schema manifests. Comparison must cover normalized `sqlite_schema` table definitions, declared indexes, `table_xinfo`, and `foreign_key_list`. The allowlist must include each of the five evidenced `exercises` layouts that `bootstrap.ts` deliberately preserves after removing name uniqueness: `current-canonical`, `uid-era-fresh-then-variations`, `pre-uid-direct-upgrade`, `pre-uid-sequential-upgrade`, and `0923b8d-fresh-direct-upgrade`. These layouts differ in column order and catalog SQL while remaining supported current outputs. An unknown column order, column, index, constraint, table, trigger, or view fails closed. Merely comparing with a newly bootstrapped canonical database is insufficient.
8. Run `integrity_check`, `foreign_key_check`, and explicit soft-link checks. Reject stale non-null `program_calendar_exercises.workout_exercise_id` values. Validate `program_calendar_sets.set_id` through the FK check.
9. Seal the migrated work database into a new single-file candidate using the installed SQLite online-backup API. On the destination connection, checkpoint, switch to `journal_mode=DELETE`, close it, and require that no `-wal` or `-shm` sidecar exists. Reopen the existing private sealed file on a validation-only connection, immediately set `PRAGMA query_only=ON`, and repeat manifest, integrity, FK, and soft-link validation while proving the main-file digest did not change. Do not hash or schedule the migration work file.
10. Compute and retain a SHA-256 hash of the closed sealed file. The schedule and startup calls recheck this exact artifact before attaching it.
11. Return an opaque preparation token and a summary for the destructive confirmation screen. Only one preparation or scheduling operation may be active.

Candidate migration is allowed to assign UIDs to legacy null-UID rows using the existing supported migration. It must preserve every row ID and every existing non-null UID. It does not deduplicate or field-match rows.

The host proof uses Node's `node:crypto` SHA-256 and does not establish a native digest implementation. At design acceptance the installed app had no `expo-crypto`, `@noble/hashes`, or existing SHA-256 helper, and the public FileSystem digest was MD5. The organiser has assigned MVP-006B4 to integrate and verify the maintained `@noble/hashes` 2.4.0 incremental SHA-256 implementation with bounded Expo read-only file handles. Its code and native runtime evidence still require review; selection alone does not accept the production hash gate. The existing Metro `node:crypto` shim is non-cryptographic and must not implement candidate identity. MD5 is not acceptable for candidate identity.

## Scheduling and startup commit protocol

The confirmation action does not mutate live tables. It rechecks the sealed candidate hash and atomically renames a versioned private pending manifest that contains a random restore ID, the private candidate path, its expected hash, the compiled schema-manifest ID, the scheduling native-process token, the validated plan, durable state `scheduled`, and no latest-attempt token. The manifest rename is the scheduling commit point. An abort observed before rename removes staging and returns `cancelled`; an abort observed after a successful rename returns `restart_required`. It must never return `cancelled` while a manifest remains. While state is still `scheduled` in the scheduling native process, explicit cancellation removes the manifest and staging and leaves live data unchanged.

At the next confirmed cold **process** start, `connection.ts` opens the long-lived database, applies only connection PRAGMAs, and invokes the synchronous startup coordinator before ordinary `initializeDatabase()` or construction/export of the Drizzle binding and before Expo Router renders. For a pending restore, the coordinator first requires the manifest's compiled schema ID to equal the running build, strictly verifies that live already has that schema, and then applies the already-migrated candidate. A version mismatch fails closed behind the gate without bootstrapping or mutating live. With no pending restore, `connection.ts` follows its existing `initializeDatabase()` path. No provider, screen, timer, picker continuation, media callback, or background React effect from the previous process can still write. A React/provider remount is insufficient because an old async mutation could resume after commit; that design is rejected. Expo 57 already exports [`reloadAppAsync()`](https://docs.expo.dev/versions/latest/sdk/expo/#reloadappasyncreason), but its contract is a same-bundle app reload, not a guarantee that pending native database work has drained. Production must require a process-level cold start unless a native gate first proves that reload cancels or drains pending native operations.

Startup models physical pending-manifest presence separately from parsed fields. If a pending file exists but is unreadable, corrupt, unsupported-version, or missing/unknown state, the gate blocks as ambiguous; absent parsed fields never mean there is no pending restore. It validates the scheduling token and, for `attempting`/`rolled_back_unchanged`, requires a valid latest-attempt native token. A retry process must differ from both tokens. Thus schedule process A may start attempt B, a JS reload still in native process B remains gated, and only later process C may retry. A missing, malformed, or inconsistent attempt token fails closed.

Before `BEGIN`, startup validates the schema ID, managed private path, sealed hash, catalog, and health. A failure may offer safe discard/reprepare only when durable state is `scheduled` or `rolled_back_unchanged`; those states prove no prior attempt may have committed. When validation succeeds, startup atomically persists `attempting` with a fresh attempt ID, the current validated native process token as `latestAttemptNativeProcessToken`, and whether its baseline was proven unchanged before opening the transaction. Persistence must complete before `BEGIN`. A prior `attempting` state is never downgraded to unchanged. If its sealed candidate remains valid, a later native process may reapply it; if validation now fails, the gate reports unknown state and requires explicit recovery without an unchanged claim.

The startup SQL critical section is synchronous from `BEGIN IMMEDIATE` through `COMMIT` or `ROLLBACK`. It contains no `await`, React state update, progress callback, media call, or other user callback. Because it runs before application code is rendered, ordinary application writes cannot be submitted. `BEGIN IMMEDIATE` also excludes a writer from another SQLite connection. Startup records only coarse durable outcome information outside the live database after the transaction; it does not emit callbacks inside the critical section.

Production PB rebuilding must therefore use a synchronous, transaction-local path on this connection. The test helper's `rebuildDerivedPBEvents()` is proof-only. Before shipping, `lib/db/pbEvents.ts` must expose one pure PB derivation routine used by both the existing canonical rebuild and the synchronous restore insert path, with parity tests over invalid sets, timestamps, ordering, equal weights, and multiple rep targets. Calling the current async `rebuildPBEventsForExercise()` inside the transaction is forbidden because it yields.

1. `BEGIN IMMEDIATE` with foreign keys enabled.
2. Delete all live rows in child-to-parent order.
3. Insert candidate rows with explicit column lists and explicit IDs in parent-to-child order.
4. Leave `pr_events` empty and rebuild it from restored `sets` using the same validity, ordering, and improvement rules as `rebuildPBEventsForExercise()`.
5. Run `foreign_key_check`, the program soft-link check, and table-count/invariant checks against the prepared plan.
6. `COMMIT` once. An exception before invoking commit causes `ROLLBACK`; it reports `liveDatabaseChanged: false` only when rollback succeeds and the attempt baseline was proven unchanged. An uncertain commit or rollback outcome reports `"unknown"` and keeps the gate closed.
7. Treat successful `COMMIT` as the irreversible boundary. A later `DETACH` failure is a warning and must never turn the result into a failed or unchanged restore.
8. After commit, atomically write a committed-outcome record containing the restore ID, candidate hash, schema-manifest ID, counts, and `postCommitStatus: "pending"`, but no candidate media IDs. This record drives only postcommit completion; it never authorizes skipping row replacement.
9. If outcome writing fails, return `committed_pending_outcome` with `liveDatabaseChanged: true` and keep the gate closed. Retry writing in the same process. If the process dies with only the pending manifest, the next verified cold process performs the full replacement again; the closed gate guarantees there were no post-restore user writes to lose.
10. After the matching outcome is durably persisted, delete the pending manifest. If deletion fails, return `committed_pending_cleanup`, keep the gate closed, and retry deletion in the current process. If the process dies while any pending manifest remains, the next verified cold process re-applies the sealed candidate before trying cleanup again, even if an outcome exists. Because normal use remains blocked from scheduling until manifest retirement, this cannot erase post-restore user writes. An outcome for a different restore ID is stale and can never suppress, complete, or alter the pending restore.
11. Only after the pending manifest is gone may the completion gate run reconciliation against a fresh read of current media rows. On completion or abort, atomically replace the outcome with `postCommitStatus: "complete"` and the final result, then delete it. A deletion failure is harmless cleanup: a complete outcome without a matching pending manifest is never used to skip a restore. A pending outcome left by process death offers a user-explicit fresh scan; it never replays stored media IDs.
12. Delete staging only after the pending manifest is gone and the result no longer needs it.

Delete order:

`media`, `pr_events`, `program_calendar_sets`, `program_calendar_exercises`, `program_calendar`, `taggings`, `exercise_formula_overrides`, `sets`, `workout_exercises`, `psl_programs`, `tags`, `workouts`, `exercises`, `user_checkins`, `settings`.

Insert order:

`settings`, `user_checkins`, `exercises`, `workouts`, `workout_exercises`, `sets`, `psl_programs`, `program_calendar`, `program_calendar_exercises`, `program_calendar_sets`, `tags`, `taggings`, `media`, `exercise_formula_overrides`, followed by rebuilt `pr_events`.

SQLite transaction recovery is the crash boundary. Before `BEGIN`, startup atomically advances `scheduled` or `rolled_back_unchanged` to `attempting` with a known-unchanged baseline and binds that attempt to the current native process token. A crash or JS reload after that durable marker is conservative: the prior attempt is unknown even if it stopped before `BEGIN`, and the same native process cannot retry. A later process retry from prior `attempting` records its own token and an unknown baseline. Successful rollback may record `rolled_back_unchanged` only when this exact in-memory attempt began from a proven-unchanged baseline, while retaining that attempt token so a same-process reload remains gated. If a retry began from an unknown baseline, its successful rollback restores that unknown pre-BEGIN database, so durable state remains `attempting`/unknown and no unchanged recovery token is minted. Failure to persist rollback state is also unknown. On every later verified native process, any valid pending manifest re-applies the sealed candidate regardless of an outcome record. After manifest retirement, a matching pending outcome means only that postcommit reconciliation is incomplete. Startup never treats an outcome as proof that row replacement may be skipped.

## Proposed public API

The organiser must freeze this API, or an explicitly documented revision, before production work starts.

```ts
import type { SQLiteDatabase } from "expo-sqlite";

declare const nativeProcessTokenBrand: unique symbol;
type NativeProcessToken = string & {
  readonly [nativeProcessTokenBrand]: true;
};

type RestorePreparePhase =
  | "selecting"
  | "staging"
  | "validating_source"
  | "migrating_candidate"
  | "validating_candidate"
  | "ready";

type RestoreSchedulePhase = "scheduling" | "restart_required";

type RestoreStartupPhase =
  | "checking_pending_restore"
  | "acquiring_lock"
  | "replacing_rows"
  | "rebuilding_pbs"
  | "verifying_commit"
  | "committed"
  | "reconciling_media"
  | "complete";

type RestoreProgress = {
  phase: RestorePreparePhase | RestoreSchedulePhase | RestoreStartupPhase;
  cancellable: boolean;
  completed?: number;
  total?: number;
};

type RestoreSource = {
  uri: string;
  displayName?: string | null;
  mimeType?: string | null;
};

type RestorePreparation = {
  status: "ready";
  token: string; // opaque, process-local, single use
  sourceDisplayName: string | null;
  candidateSha256: string;
  rowsByTable: Record<AppTable, number>;
  pbEventsInSource: number; // informational; they will be rebuilt
  mediaRows: number;
};

type RestoreCancelled = {
  status: "cancelled";
  liveDatabaseChanged: false;
};

function prepareReplacementRestore(options: {
  source?: RestoreSource; // absent means open the picker
  signal?: AbortSignal;
  onProgress?: (progress: RestoreProgress) => void;
}): Promise<RestorePreparation | RestoreCancelled>;

type RestoreScheduled = {
  status: "restart_required";
  restoreId: string;
  liveDatabaseChanged: false;
  restartRequired: true;
};

function scheduleReplacementRestore(options: {
  token: string;
  signal?: AbortSignal;
  onProgress?: (progress: RestoreProgress) => void;
}): Promise<RestoreScheduled | RestoreCancelled>;

function discardPreparedRestore(token: string): Promise<void>;
function cancelScheduledReplacementRestore(restoreId: string): Promise<void>;
function discardSafelyFailedScheduledRestore(options: {
  restoreId: string;
  recoveryToken: string;
}): Promise<{ status: "discarded"; liveDatabaseChanged: false }>;

// Internal synchronous startup seam, called only by connection.ts.
function applyScheduledReplacementRestoreAtStartup(options: {
  sqlite: SQLiteDatabase; // the just-opened long-lived connection
  nativeProcessToken: NativeProcessToken | null;
}):
  | RestoreCommitResult
  | RestoreCommittedPendingOutcome
  | RestoreCommittedPendingCleanup
  | RestorePendingColdStart
  | RestoreStartupFailure
  | null;

type RestorePendingColdStart = {
  status: "restart_required";
  restoreId: string;
  liveDatabaseChanged: false;
  restartRequired: true;
};

type RestoreCommitResult = {
  status: "committed";
  restoreId: string;
  liveDatabaseChanged: true;
  rowsByTable: Record<AppTable, number>;
  pbEventsRebuilt: number;
  postCommitPending: true;
  warnings: Array<{
    stage: "detach_candidate" | "staging_cleanup";
    code: string;
  }>;
};

type RestoreCommittedPendingCleanup = {
  status: "committed_pending_cleanup";
  restoreId: string;
  liveDatabaseChanged: true;
  normalUseBlocked: true;
  retryable: true;
  warning: { stage: "pending_manifest_cleanup"; code: string };
};

type RestoreCommittedPendingOutcome = {
  status: "committed_pending_outcome";
  restoreId: string;
  liveDatabaseChanged: true;
  normalUseBlocked: true;
  retryable: true;
  warning: { stage: "committed_outcome_write"; code: string };
};

type RestoreStartupFailure = {
  status: "failed";
  error: ReplacementRestoreError;
};

function completeReplacementRestorePostCommit(options: {
  restoreId: string;
  signal?: AbortSignal;
  onProgress?: (progress: RestoreProgress) => void;
}): Promise<ReplacementRestoreResult>;

type ReplacementRestoreResult = {
  status: "restored";
  restoreId: string;
  liveDatabaseChanged: true;
  rowsByTable: Record<AppTable, number>;
  pbEventsRebuilt: number;
  media: {
    total: number;
    resolved: number;
    unresolved: number;
    skippedPermission: number;
    errors: Array<{ mediaId: number | null; code: string }>;
  };
  cleanup: {
    deletedManagedFiles: number;
    skippedUntrustedPaths: number;
    errors: number;
  };
  warnings: Array<{
    stage: "detach_candidate" | "staging_cleanup" | "media_reconciliation";
    code: string;
  }>;
};
```

Progress events are ordered phases. They are not a guessed percentage. `completed` and `total` are emitted only for real bounded work such as validation or media rows. The schedule call ends at `restart_required`; startup table replacement is synchronous and exposes no callback. After the restored tree mounts, the gate calls `completeReplacementRestorePostCommit()` and may report reconciliation progress. Exceptions thrown by `onProgress` are ignored and logged; a UI callback cannot change restore correctness.

Picker dismissal and an aborted preparation resolve to `RestoreCancelled`. For scheduling, abort before manifest rename returns `RestoreCancelled`; abort after rename returns `RestoreScheduled`. `cancelScheduledReplacementRestore()` may claim unchanged only while the durable state is the original `scheduled` state in the scheduling process. After a verified rollback from a proven-unchanged baseline, a recovery token may authorize safe discard/reprepare. Once state is `attempting`, ordinary cancellation is unavailable even if the current failure occurred before `BEGIN`, because a prior attempt may have committed. A successful rollback during a retry from unknown state does not restore this privilege. Once startup enters `BEGIN IMMEDIATE`, there is no cancellation or callback; it runs through commit or rollback. After commit or an unknown commit/rollback state, cancellation and any result claiming unchanged are forbidden. During post-commit media reconciliation, an abort may stop further gallery scans; remaining rows are reported unresolved and the committed database remains successful.

The confirmation screen is shown only after preparation returns `ready`. It states that current app data will be replaced, displays the source name and table summary, and explains that the app becomes unavailable until a full close and reopen. Dismissing confirmation calls `discardPreparedRestore()`.

## Error contract and fault matrix

Preparation and scheduling failures reject with a typed `ReplacementRestoreError`. A startup failure is stored as the same typed outcome and rendered by the root gate; startup must not surface it as an unhandled module-import exception:

```ts
type ReplacementRestoreErrorCode =
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

class ReplacementRestoreError extends Error {
  code: ReplacementRestoreErrorCode;
  stage: RestorePreparePhase | RestoreSchedulePhase | RestoreStartupPhase;
  liveDatabaseChanged: boolean | "unknown";
  transactionState: "not_started" | "rolled_back" | "committed" | "unknown";
  recovery:
    | "discard_and_reprepare"
    | "retry_cold_start"
    | "retry_committed_cleanup"
    | "manual_recovery";
  recoveryToken?: string; // present only when unchanged is proven
  retryable: boolean;
}
```

| Fault or user action | Required result |
| --- | --- |
| Picker cancelled | `RestoreCancelled`; no staging residue; live unchanged |
| Abort during copy or validation | `RestoreCancelled`; staging deleted; live unchanged |
| Abort before pending-manifest rename | `RestoreCancelled`; staging deleted; live unchanged |
| Abort after pending-manifest rename | `RestoreScheduled`; gate remains closed; never report cancelled while the manifest exists |
| Invalid header or SQLite open | typed error; live unchanged |
| Unknown schema, constraint, trigger, or view | `unsupported_schema`; live unchanged |
| Candidate migration fails halfway | staging discarded; live unchanged |
| Candidate integrity, FK, or soft-link validation fails | typed error; live unchanged |
| Pending file exists but version/state/fields cannot be parsed | ambiguous state; do not initialize, apply, discard, or open normal UI |
| Missing, empty, malformed, or unavailable native process token | `invalid_process_identity`; do not apply; gate remains closed |
| Cold-start schema ID, sealed path, hash, or pre-BEGIN validation fails from durable `scheduled`/`rolled_back_unchanged` | typed `not_started` failure with `liveDatabaseChanged: false` and recovery token; gate offers discard and reprepare |
| The same validation fails while durable state is `attempting` | prior attempt is unknown; block and offer retry/recovery without any unchanged claim |
| Same-process JS/dev reload after scheduling | token matches; do not attach or mutate; render only the restart-required gate |
| Same-native-process reload after an attempt marker | current token matches latest-attempt token; do not reapply; wait for a token different from both schedule and latest attempt |
| Fault after delete/insert/PB validation on a proven-unchanged baseline | successful rollback records `rolled_back_unchanged`; live unchanged; recovery token permits discard and reprepare |
| The same retry fault and successful rollback after prior `attempting` uncertainty | rollback restores the uncertain retry baseline; keep unknown state, block normal use, and do not mint an unchanged token |
| Rollback or commit state cannot be proven | `liveDatabaseChanged: "unknown"`; block normal use and all unchanged/cancel claims pending manual recovery |
| Process death after durable `attempting` but before commit | SQLite recovery leaves old data, but durable state is conservative; next cold start re-applies a valid sealed candidate and no unchanged cancellation is offered |
| Process death after commit before outcome write | gate stayed closed; pending-only next cold start repeats full replacement from the sealed candidate |
| Process death after outcome write but before pending-manifest deletion | pending manifest still wins; next cold start repeats full replacement before cleanup |
| Process death after pending manifest is retired | restored data remains; committed-outcome record offers only a fresh, explicit scan of current media rows |
| Permission denied or gallery reconciliation throws | restore succeeds; affected media rows are unresolved |
| Managed-file cleanup throws | restore succeeds; cleanup error count increases |
| Committed-outcome write fails | `committed_pending_outcome`; live changed; gate remains closed and cancellation is forbidden |
| Pending-manifest deletion fails after commit | `committed_pending_cleanup`; live changed; normal use remains blocked and cancellation cannot claim unchanged |
| Detach or staging deletion fails after commit | committed outcome remains successful; append a cleanup warning and never report `liveDatabaseChanged: false` |

`rollback_failed` and any unknown commit or baseline state use `liveDatabaseChanged: "unknown"`. The UI must block normal use and require recovery inspection. Verified pre-BEGIN and `rolled_back_unchanged` failures are different: the error carries a single-use recovery token so the user can safely discard and reprepare instead of becoming trapped behind the gate. A successful `COMMIT` is a one-way result boundary: detach, outcome writing, staging deletion, reconciliation, and cleanup faults after it must never be rethrown as a failed or unchanged restore. Pending outcome or manifest cleanup failures keep the gate closed.

## Process proof, navigation gate, and cache invalidation

Logical replacement does not close or replace `sqlite`, so the existing Drizzle object remains valid. Candidate databases must use a separate `useNewConnection: true` handle and must be closed before deletion.

Executing `connection.ts` again is not proof of a native process restart. A bounded prerequisite module must expose a synchronous, branded, nonempty opaque token created once by the native application process and stable across React Native/JS reloads. The pending manifest records the validated scheduling token and, before every `BEGIN`, the validated current token as the latest attempt. Startup applies the candidate only when the current token passes validation and differs from both stored tokens. A missing, empty, malformed, or unavailable required token fails closed behind the gate; it is never treated as a different process. On Android, this belongs to an application-process singleton created from `MainApplication` and exposed through a small native module; a versioned random UUID is safer than a reusable PID. iOS restore remains disabled until the equivalent native process token exists and its lifecycle is proven.

As soon as the pending manifest rename succeeds, a root `ReplacementRestoreGate` switches synchronously to a restart-only surface. It wraps the entire provider and router subtree, blocks back/navigation and all normal screens, and offers only full-close instructions or cancellation while the scheduling process is still current. The gate also reads the manifest on every startup. Therefore a same-process dev/JS reload cannot return to logging, and users cannot add rows after scheduling that would silently disappear at the later replacement. Existing work completed before destructive confirmation is deliberately replaced, as the confirmation states.

On a different native process, `connection.ts` passes its just-opened long-lived `SQLiteDatabase` object into the synchronous startup coordinator after connection PRAGMAs and before ordinary bootstrap or `drizzle(sqlite)` construction/export. `replacementRestore.ts` must not import `connection.ts`, import the Drizzle `db`, call `openDatabase*()` for live storage, or create a second live handle. The accepted candidate already passed isolated `initializeDatabase()` and supported current-manifest validation. `app/_layout.tsx` mounts `ReplacementRestoreGate` outside `ThemeProvider`, `UnitPreferenceProvider`, notification hooks, and Expo Router. On success those providers mount for the first time against restored rows; there is no old navigation stack, settings-local state, screen draft, timer effect, or introspection cache to invalidate.

A pending-restore failure intentionally skips ordinary bootstrap. After a safely authorized discard/reprepare action, the gate must not release providers against that uninitialized connection path. It must start a fresh no-pending initialization cycle, normally by a controlled reload, or call an explicitly reviewed bootstrap-and-Drizzle construction seam before opening normal UI.

The introspection cache does not require invalidation under this decision because live schema never changes. Candidate migration uses a different connection and only data crosses into live. A future implementation that permits live schema mutation must first add and call an explicit `clearIntrospectionCache()`.

This prerequisite is deliberately bounded. Proposed ownership is:

- `lib/db/replacementRestore.ts`: preparation, hash-verified pending manifest, synchronous startup replacement, durable outcome state, and post-commit orchestration;
- `lib/native/appProcessIdentity.ts`: typed synchronous token facade;
- `android/app/src/main/java/com/anonymous/LiftingLog/process/AppProcessIdentityModule.kt`, its package registration, and `MainApplication.kt`: Android process-lifetime token;
- an iOS local-module equivalent before enabling restore on iOS, because no iOS native project is checked in today;
- `components/ReplacementRestoreGate.tsx` and `app/_layout.tsx`: restart-only and completion gates around all providers/routes;
- `app/(tabs)/settings.tsx`: prepare, confirmation, schedule, cancel, and result entry point;
- `lib/db/pbEvents.ts`: extracted pure canonical PB derivation plus production parity tests.

No mutation-wide write coordinator or provider epoch is required by this design. `reloadAppAsync()` must not be used as the cold-start proof. A later platform test may authorize it only if the native process token changes and pending native database work is proven drained, which its documented JS-reload contract does not promise.

## Export protocol

Export must use `backupDatabaseAsync()` from the live connection into a new temporary destination database opened with `useNewConnection: true`. It must not depend on `wal_checkpoint(TRUNCATE)` succeeding and must not copy only `LiftingLog.db`. A busy checkpoint is normal when another reader pins a WAL snapshot; committed WAL rows still belong in the backup.

After backup completes:

1. On the destination connection, checkpoint, switch to `journal_mode=DELETE`, and verify the returned mode.
2. Close the destination connection and require that neither `-wal` nor `-shm` exists.
3. Confirm the main file still exists, open it through a separate validation-only connection, and immediately set `PRAGMA query_only=ON`; Expo 57 has no read-only open option.
4. Run `integrity_check`, verify one supported current app-table manifest, and record table counts.
5. Close validation, prove the main-file digest is unchanged, and save or share only that sealed file.

The host proof holds a read transaction on a second connection, commits a new row through the writer, observes `wal_checkpoint(TRUNCATE)` return busy, then verifies that SQLite's online backup contains both committed rows and passes `integrity_check`. A separate sealing proof backs up a WAL-mode candidate into a new destination, converts the destination to rollback-journal mode, closes it, and verifies the sealed main file has no required sidecars. These prove the SQLite mechanism used by Expo; they are not substitutes for a physical Android SDK 57 export test.

### Filename and MIME

The proposed artifact descriptor is:

```ts
{
  displayName: "LiftingLog-backup-YYYYMMDD-HHMMSS.db",
  mimeType: "application/vnd.sqlite3"
}
```

Android SAF must receive the complete display name including `.db`; do not strip the suffix before `createFileAsync()`. Android treats document display name and MIME type as separate fields, and a provider may alter a requested display name, so exact preservation remains a physical-device release check. The returned document metadata must be inspected where the platform API permits it. The current retained Android export is extensionless, which demonstrates why this check is necessary. Android documents `ACTION_CREATE_DOCUMENT` filename and MIME behavior in [Access documents and other files](https://developer.android.com/training/data-storage/shared/documents-files).

Restore accepts that retained extensionless file because it validates content and schema rather than its name.

## Media reconciliation

No video bytes are in the database backup. The committed `media` rows and their numeric IDs survive replacement. Reconciliation reads rows by that preserved `media.id`; it never searches for a database row by filename. During the replacement transaction every restored row receives the schema-compatible cleared value `local_uri = ''` (`local_uri` is currently `NOT NULL`). A backup URI may name an unrelated file or content ID on the destination device, so it is never retained as a fallback.

The matching policy is deliberately conservative:

1. Treat a non-null `asset_id` only as a lookup hint. An asset ID may identify unrelated media on another device and cannot break a metadata tie.
2. Require a canonical original filename plus at least one positive discriminator: creation time or duration. A zero/null creation time is unavailable evidence. Every other available discriminator must agree within its documented tolerance. Album may bound/enrich a query but is not identity and cannot break a tie.
3. Complete a bounded scan of all assets visible under the current permission scope and require exactly one compound match. Limited permission does not automatically reject a match when the complete visible scan is unique; an incomplete/erroring scan stays unresolved.
4. If the asset ID is absent, stale, or contradicted but that compound scan has exactly one result, accept the uniquely corroborated result.
5. If canonical filename is absent, neither positive time nor duration exists, candidates tie, or the visible scan cannot complete, keep the row and report it unresolved. Do not overwrite its metadata with a guess.

Filename-only, duration-only, album-only, URI-basename-only, and first-best scoring are forbidden. A numeric picker-cache basename is not a gallery identity.

The supplementary Android emulator evidence in `docs/testing/mvp-android-media-review.md` and `docs/testing/gallery-native-api-review.md` supplies the limiting case and API shape; it is not a physical-device/performance acceptance claim. Picker selection returned `assetId: null`, cache `fileName: "50.mp4"`, unavailable creation time, no album, and the correct 2,000 ms duration. MediaLibrary reports canonical IDs and filenames for fixtures A/B, but creation time is `0` because `datetaken` is null; both fixtures share duration/time. The original retained backup also has a null asset ID. The existing backup row remains unresolved because its cache filename is not canonical. Newly recorded canonical filename plus positive duration can be enough only when a complete visible scan yields one match.

The production follow-up may add bounded metadata acquisition at selection time, for example a native/provider query that records the canonical media-store ID, display name, creation time, duration, and album before the row is saved. That is outside this design ticket. The current `resolveVideoLibraryReference()` scoring path can accept filename-only or creation-time-only matches and must not be reused unchanged for replacement restore.

Reconciliation is post-commit and idempotent. A resolved row receives only the resolver-verified usable device URI. Unresolved, skipped, errored, and unprocessed-on-abort rows keep `local_uri = ''` while preserving their IDs, set/workout links, and metadata. The completion gate must finish or explicitly mark all rows unresolved before releasing normal UI, so no rejected stored URI can play. Ordinary set-load validation of a preexisting managed copy is a separate media-lifecycle context and does not authorize fallback during restore.

Final restore acceptance depends on the MVP-004E3 ordinary set-load conservative resolver. A restored row with `local_uri = ''` must never re-enter an older blind asset-ID lookup, first filename match, or rejected stored-URI fallback when its set is opened later. The production integration suite must restore an unresolved media row, release the completion gate, open that set through the ordinary load path, and prove the row remains unavailable unless the shared resolver establishes the same complete-visible-scan unique compound match. MVP-006A does not duplicate the MVP-004E3 implementation.

There is no automatic reconciliation journal written before commit: such a file cannot prove whether `COMMIT` happened, and replay after rollback could reconcile old live rows whose numeric IDs happen to equal candidate media IDs. The startup completion gate reconciles only the rows it reads from the successfully committed current `media` table. If the process dies after commit, the next launch reports that reconciliation may be incomplete and offers a user-explicit fresh scan of all current media rows. It never replays candidate IDs. A missing video never removes or invalidates its set, workout, or media row.

## Managed-file cleanup boundary

Replacement deletes live-only media rows from the database transaction, but physical file cleanup is a later best-effort step. It may delete only an orphaned app-managed copy that was referenced before commit and is not referenced after commit. It must never delete a gallery asset.

`isManagedVideoUri()` currently uses a string `startsWith()` check. That is insufficient for restore-triggered cleanup. Before production cleanup is added, the path validator must:

- accept only `file:` URIs;
- parse and percent-decode safely;
- reject query/fragment ambiguity, encoded separators, NULs, and `.` or `..` path segments;
- normalize separators and compare complete path segments against the exact app document `set-videos` root, including the directory boundary;
- reject paths outside that root and paths whose canonical target cannot be established;
- recheck that the path is unreferenced in the post-commit `media` table immediately before deletion.

Validation failure increments `skippedUntrustedPaths`. Cleanup failure is nonfatal.

## Evidence in this ticket

`__tests__/db/replacementRestoreProof.test.ts` and its helper/fixtures provide a deterministic host proof of the proposed mechanism:

- an online backup includes a committed WAL row while a second connection makes a truncate checkpoint busy;
- a WAL-mode candidate is backed up into a sealed DELETE-mode main file which requires no WAL/SHM sidecars and whose SHA-256 is unchanged after close/reopen validation;
- an extensionless valid SQLite input is accepted;
- isolated migration precedes live mutation;
- the host's strict post-migration comparison rejects an injected unknown column, index/constraint, and trigger;
- the current-manifest policy recognizes all five bootstrap-preserved `exercises` column orders and rejects unknown order drift;
- optional old tables may be absent and become empty current tables;
- all 15 app tables follow an explicit replacement policy;
- IDs, existing UIDs, program soft links, notes, settings, program data, health data, tags, formulas, and stable media row ID are copied;
- UID-less ambiguous rows are preserved as separate IDs without merge matching;
- live-only and merge-duplicate rows disappear;
- `pr_events` is rebuilt from sets rather than copied;
- cancellation and injected faults after deletes, after inserts, and before commit leave live rows unchanged;
- post-commit media failure returns an unresolved count without rolling back training data;
- a pure gate decision rejects corrupt physical manifests and invalid schedule/attempt tokens, proves schedule A → attempt B → reload B stays blocked → process C may reapply, distinguishes safely discardable `scheduled`/`rolled_back_unchanged` failures from ambiguous `attempting`, preserves uncertainty after a retry rollback, and keeps committed cleanup blocked;
- schedule abort resolves as cancelled before manifest rename and restart-required after rename;
- a detach fault after commit is reported as a warning while committed data remains in place;
- the proposed SAF descriptor retains `.db` and uses a concrete SQLite MIME type.

The proof uses Node's `node:sqlite` binding and the repository's real `initializeDatabase()` code. Its pre-migration check covers known table names plus trigger/view rejection. Post-migration it compares all non-`exercises` schema objects with a fresh bootstrap and relies on the real bootstrap classifier plus an explicit five-order check for `exercises`. The fixture begins at the current schema with legacy null UIDs; it is not a historical-DDL compatibility fixture. A frozen, reviewed, versioned historical allowlist and complete set of current manifests, including exact SQL for all five exercise outputs, indexes, constraints, `table_xinfo`, and foreign keys, are mandatory production obligations for the follow-up implementation. The host test proves the comparison mechanism can reject mutations; it does not prove that those production manifests are complete.

The host proof also proves SQL ordering, transaction rollback, conservative metadata matching, post-commit cleanup warning behavior, and Node SQLite online-backup/sealing behavior. Its Node read-only open and `node:crypto` hash do not establish Expo read-only or native SHA-256 capabilities. Its `rebuildDerivedPBEvents()` is proof-only and is not evidence of canonical production PB parity. It does not prove Expo native ATTACH behavior, Android SAF filename preservation, limited photo-picker permissions, native connection caching, native process identity, pre-render startup ordering, process-death recovery, or gallery metadata acquisition. Those remain explicit native gates.

## Required native gates before shipping

1. Android SDK 57: online backup from the real long-lived Expo connection while a second connection holds a WAL reader; exported counts include committed WAL writes.
2. Android SDK 57: seal a WAL-mode migrated candidate and export destination through a new online-backup artifact, verify `journal_mode=DELETE`, close every handle, and prove the main file needs no `-wal`/`-shm` sidecars.
3. Select and prove a maintained native SHA-256 implementation, including bounded-memory behavior for the maximum accepted backup size; prove validation-only Expo opens with `query_only` do not change the sealed main-file digest.
4. Android SAF: requested and observed display name ends in exactly `.db`, MIME is readable as SQLite, and the exported file opens without sidecars.
5. Android: pass the just-opened production `SQLiteDatabase` into restore, attach the isolated sealed candidate, and run the full replacement transaction without another live handle.
6. Android: prove the native process token stays stable across Fast Refresh and `reloadAppAsync()`, changes after a real process restart, and missing/malformed schedule or latest-attempt values fail closed; exercise A → B → reload B → C ordering.
7. Android: schedule while a write-capable async screen operation is pending; verify the root gate prevents further normal interaction, cold-start apply occurs before providers/effects, and no old-runtime continuation writes afterward.
8. Android: kill the process around durable attempt-state writes, before/after commit, outcome write, and manifest deletion; verify always-reapply pending behavior and that uncertain retry rollback never claims unchanged.
9. Android limited photo access: complete-visible-scan uniqueness, unresolved counts, cleared unresolved URIs, and training data remain correct on success, abort, error, and process death; opening an unresolved restored set must use the MVP-004E3 resolver and never a legacy blind fallback.
10. Verify first mounts after restore read theme, color, unit, global formula, settings state, and navigation from restored data only after every media row has a verified URI or cleared unresolved state.

The user has explicitly deferred iOS. Before restore is enabled there, add and prove the native process-token module, online backup, logical replacement, startup ordering, and post-commit reconciliation. This later platform gate does not block acceptance of the Android-oriented design proof in MVP-006A.

## Out of scope

This ADR does not implement production restore, settings UI, native code, schema changes, dependencies, cloud sync, video binary backup, gallery metadata acquisition, or media cleanup. It does not modify the existing merge importer.

## Organiser implementation clarifications

- The native facade returns only a canonical lowercase `process-v1:` UUID-v4 token
  or `null`. Unsupported or old binaries may start normally when no restore state
  exists; missing identity blocks scheduling and any pending restore. Production
  validation is stricter than the host proof's case-insensitive token regex.
- Atomic control-state persistence is a production prerequisite. Installed Expo
  FileSystem's new local-file overwrite path deletes the destination before moving
  the new file (`fsops/CopyMoveStrategy.kt`), while its legacy same-filesystem
  rename API is asynchronous. Do not use either as an unproven synchronous atomic
  replacement seam. A bounded Android native control-store implementation must
  prove durable pending/outcome replacement and recovery before engine acceptance.
- MVP-004E3 is integrated as `e8caf44`; its host regressions cover empty restored
  URIs and rejected stored-ID fallbacks. Combined native restore/media acceptance
  remains mandatory.
