# MVP-006B5 replacement restore engine

Organiser ticket contract, 2026-09-22. Prerequisites through native digest
`81b1b76` and runtime checkpoint `87a8603` are accepted. The accepted ADR and
startup contract remain authoritative. An independent read-only boundary review
confirmed the engine-only split below; media completion is deliberately later.

## Objective and interface

Implement the actual connection-free service behind these seven existing methods
from `ReplacementRestoreService`, with their exact shared signatures:

- `prepareReplacementRestore`
- `scheduleReplacementRestore`
- `discardPreparedRestore`
- `cancelScheduledReplacementRestore`
- `discardSafelyFailedScheduledRestore`
- `applyScheduledReplacementRestoreAtStartup`
- `resumeCommittedStartupFinalization`

Export named functions or a precisely typed `Pick` of those seven methods. Do not
export a full service with an unimplemented or fake-success postcommit method.
No app consumer is wired in this ticket. The engine owns pending/outcome formats,
validation, staging and preparation ownership, SQL replacement, and committed
control finalization. Preserve an internal seam for later media completion to
read/complete a validated matching outcome only after physical pending absence.
Do not expose a generic unchecked control-record write API.

The later media ticket will implement `completeReplacementRestorePostCommit`
against a passed live handle and a fresh read of current rows. Before that ticket,
the organiser will extend its shared options with explicit `mode: "scan" | "skip"`.
Skip must account for every current row and durably finalize a real result. This
is not a prerequisite for implementing the seven engine methods. Root lifecycle,
timer quiescence, native retirement, Settings and media resolution are non-goals.

## Scope and reuse

Allowed production files: new `lib/db/replacementRestore.ts`,
`lib/db/replacementRestorePreparation.ts`, `lib/db/replacementRestoreRecords.ts`,
`lib/db/replacementRestoreTransaction.ts`, and
`lib/db/replacementRestoreRuntime.ts` as needed. Tests:
`__tests__/db/replacementRestore.test.ts`,
`__tests__/db/replacementRestorePreparation.test.ts`,
`__tests__/helpers/replacementRestoreDatabase.ts`, and new owned fixtures under
`__tests__/fixtures/replacement-restore-engine/`. Implementation notes:
`docs/testing/replacement-restore-engine.md`.

Do not edit shared contracts, bootstrap/schema/catalog/PB helpers, connection,
backup/export, timers/native, UI, package/config or existing unrelated tests.
Return any necessary scope change to the organiser. Required reads: AGENTS.md,
database ground truth/access patterns, product facts sections 6/9/10, accepted
restore ADR, startup contract, shared contract, schema manifest, PB derivation,
backupSnapshot, native token/control facades and file digest helper. The host
proof and fixtures are reference material, never a substitute implementation.

Reuse installed Expo SQLite online backup, FileSystem and DocumentPicker,
reviewed `backupSnapshot.ts`, strict `restoreSchemaManifest.ts`, pure
`pbDerivation.ts`, `uid.ts`, `fileSha256.ts`, `appProcessIdentity.ts` and
`restoreControlStore.ts`. Their reuse decisions are already recorded in the ADR
and digest contract. No new dependencies. Imports must not reach `connection.ts`,
`db/index.ts`, `backup.ts`, `media.ts`, or `pbEvents.ts`, including transitively.
Importing the service performs no I/O. Only the caller supplies the live handle.

## Required acceptance

1. Preparation never obtains a live handle. Pick/copy into a unique owned private
   directory; reject absent/empty/oversize/non-SQLite sources before opening;
   accept valid extensionless SQLite. Never open/migrate the provider original.
   Validate source catalog before migration, migrate only work copy, then validate
   current catalog/health, seal with online backup into a separate closed file,
   and repeat query-only validation, integrity/FKs/soft links/counts and digest
   checks on the sealed artifact. `backupSnapshot` alone does not validate every
   restore invariant. Close all owned handles before removal; preserve primary
   failures over close errors. Default limit 256 MiB; no whole-file JS buffer.
2. Strictly validate versioned JSON fields, all fifteen count keys, bounded
   identifiers/digests/schema ID, safe private paths and canonical process tokens.
   No supplied SQL or identifiers execute. Candidate file must exist immediately
   before open/attach; no silent empty-file creation. Do not treat a raw prefix
   match as path containment. Owned staging cleanup must not follow untrusted
   control paths or delete arbitrary files.
3. One active preparation/scheduling operation, opaque process-local single-use
   tokens, stale-token and duplicate-call rejection. Successful publication wins
   a later abort. Failed native write acknowledgement may mean publication occurred:
   reread physical state, never clean a possibly scheduled candidate or claim
   unchanged cancellation unless absence is established. Unavailable/unreadable
   controls are ambiguity, never absence. Scheduling does no live mutation.
4. Physical pending state wins any outcome. Token A schedules; reload A blocks;
   cold B may attempt; reload B blocks; only a token different from both A and B
   may retry. Persist `attempting` and latest token before BEGIN. Strictly validate
   existing live schema without bootstrap. `no_pending` requires proven absence
   plus no pending/ambiguous outcome; missing identity never permits pending apply.
5. Synchronous `BEGIN IMMEDIATE` through COMMIT/ROLLBACK on passed connection,
   with no await, progress callback or arbitrary user callback. Use compiled
   explicit columns and ADR delete/insert order for all fifteen tables. Preserve
   IDs/non-null UIDs, delete live-only rows, clear every copied media URI, rebuild
   PBs from canonical ordered-set derivation, check FKs/soft links and counts.
   Do not copy source schema or derived PB rows. Rollback testing uses real SQL.
6. A COMMIT invocation that throws is uncertain even if subsequent rollback
   succeeds. Unknown prior attempts never become unchanged merely because the
   current transaction rolled back. Safe discard tokens require this proven
   unchanged baseline and verified rollback/pre-BEGIN state, and are single-use.
   Failed persistence of rollback proof remains unknown. Never claim cancellation
   after commit or ambiguity. Detach/cleanup after proven commit are warnings.
7. Persist matching committed outcome before deleting pending; outcome/pending
   failures return the corresponding committed-blocked result. Retain enough
   process-local committed-attempt ownership to retry controls only; finalization
   must never hash/attach/reapply SQL or accept an unrelated ID/reloaded instance.
   If any pending survives process death, a later cold process reapplies the
   candidate even with matching outcome. Outcome-only pending means explicit
   fresh-current-media completion, never replay stored candidate media IDs.
8. Keep staging until pending is verifiably retired. Do not physically delete
   old managed videos in this ticket. Capture precommit managed-URI candidates
   only in process-local committed context for the later media owner; do not add
   a durable precommit cleanup journal or replay candidate IDs after death.
9. Production-engine tests cover populated exact replacement and empty source,
   supported historical layouts/UID preservation, unknown/corrupt/changed/missing
   artifacts, source immutability, count/link failures, cancellation publication
   races, every process transition, faults after deletes/inserts/PB rebuild and
   uncertain COMMIT/ROLLBACK, control write/delete failure and controls-only retry.
   Mock OS adapters where necessary, not the service/transaction under test.

Required checks: focused engine/preparation Jest plus schema/PB/snapshot/proof
regressions in both profiles; TypeScript; scoped lint; diff check. Independent
specialist review follows worker handoff and precedes integration. Actual Android
replacement/process-death testing is a later integration gate, not supplied by
host tests. Handoff includes commit, exact changed files, behavior, exact results,
assumptions, remaining risks and confirmation of scope compliance.
