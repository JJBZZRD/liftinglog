# MVP-006C postcommit media completion

Organiser packet, 2026-09-22. Dispatch is blocked until the independently audited
MVP-006B5 engine is integrated. The worker packet will pin that integration SHA.
The accepted ADR, shared contract and startup contract remain authoritative.

## Objective and ownership

Implement `completeReplacementRestorePostCommit` with its exact existing shared
signature, extending the engine into the complete `ReplacementRestoreService`.
Use the supplied live SQLite handle and fresh current media rows. Finish explicit
scan or skip with a truthful, durably verified result. This ticket does not mount
the startup gate or enable Settings import.

Own `lib/db/replacementRestoreMedia.ts` (new), the existing facade
`replacementRestore.ts`, `replacementRestoreRuntime.ts` and
`replacementRestoreRecords.ts`, new `__tests__/db/replacementRestoreMedia.test.ts`,
new `__tests__/app/replacement-restore-media-load.test.tsx` for the ordinary set-load
integration regression, bounded additions to the engine test/helper, and
`docs/testing/replacement-restore-media.md`. No connection, bootstrap, schema,
transaction, preparation, native, timers, root/router, Settings, shared contract,
dependency or ordinary gallery-path changes. Report any needed expansion.

Read AGENTS.md, database ground truth/access patterns, product facts sections
9-10, the restore ADR's outcome/media/cleanup sections, shared/startup contracts,
engine implementation notes and the media preparation notes. Inspect the exact
engine runtime, records and facade; `lib/utils/videoStorage.ts` permission and
resolver functions; and existing video storage/metadata/ordinary set-load tests.
Use codebase-memory first, then these exact files when the graph is insufficient.

## Frozen behavior

1. Keep imports inert and connection-free, including transitive imports. Reuse
   installed Expo media APIs through the already accepted `videoStorage.ts`
   resolver and permission helper. No new dependencies or replacement matching
   algorithm. Never import `connection.ts`, `db/index.ts`, `media.ts`, `backup.ts`
   or `pbEvents.ts` into this service.
2. Prove physical pending absence and strictly validate a matching outcome before
   any media or permission work. Any pending, malformed/unreadable controls or
   wrong restore ID blocks completion. Serialize completion with the runtime's
   other async operations. Retain the passed-handle ownership; no hidden reopen.
3. Read current `media` rows afresh. Never replay candidate IDs or a durable
   precommit journal. Use explicit columns on the passed handle; preserve row
   IDs, links and metadata. A match changes only `local_uri` to the resolver's
   verified URI. Every unresolved, skipped, errored or aborted row ends with the
   cleared schema-compatible empty URI, including a row repaired during an
   earlier interrupted scan. Missing videos never delete training or media rows.
   If a DB read/write failure prevents proving that unresolved URIs are cleared,
   keep completion blocked with committed training semantics; do not fabricate
   an all-accounted-for result. An already-empty row whose repair fails may stay
   unresolved with a bounded diagnostic.
4. Scan requests gallery permission only after validation and an abort check.
   Denial, missing evidence, an ambiguous/incomplete visible scan and resolver
   failure leave rows unresolved. A stored asset ID cannot break a tie. Skip
   never prompts or invokes the resolver and accounts for every current row.
   Explicit skip is not evidence of permission denial: report its rows unresolved
   without inventing `skippedPermission` counts.
   The existing permission helper returns false for both unavailable permission
   and permission API failure. `skippedPermission` therefore means permission was
   not affirmatively established, not proof that the user denied it. Likewise a
   null resolver result does not identify a specific no-match/provider-error
   cause. Use truthful generic diagnostics without expanding helper APIs.
5. The existing bounded resolver has no AbortSignal. Check cancellation before
   and after each awaited permission/resolution call; drain any active call
   before finalizing, discard its result after cancellation, and start no later
   scan. No stale continuation may write a URI after the result is finalized.
   Cancellation is successful committed training with unresolved attachments,
   never an unchanged/cancelled restore. Ignore throwing progress callbacks.
   Busy/error results during completion must also preserve committed/unknown
   ownership honestly; do not reuse a preparation error that claims unchanged.
6. Preserve same-process commit warnings and the explicitly untrusted precommit
   URI context by restore ID. No physical video deletion is authorized here:
   installed Expo path information cannot establish the canonical target required
   by the ADR. Deduplicate the retained nonempty URI strings and report these as
   `skippedUntrustedPaths`; report zero deleted files. After process recreation,
   absent context means zero known cleanup candidates, never a directory sweep.
   This is a documented conservative cleanup limitation, not a claim of a working
   canonical-path deletion mechanism. No gallery asset may be deleted.
7. Extend the internal outcome union with strict `postCommitStatus: "complete"`
   and the actual final result before producing that format. Validate exact keys,
   restore ID agreement, all fifteen safe nonnegative counts, PB consistency,
   result literal flags, media totals (`resolved + unresolved = total`), permission
   skips as a subset of unresolved, cleanup counts, and bounded diagnostic fields.
   Preserve aggregate counts while capping diagnostic detail arrays with an
   explicit truncation warning. Respect the native control-record byte ceiling.
8. Publish and physically read back the complete result before attempting outcome
   deletion. A failed write acknowledgement may still have published: reread and
   compare the strict record. Inability to establish durable completion keeps the
   gate blocked and reports committed data honestly; never downgrade to unchanged.
   Retain sufficient local finalization context to retry controls without repeating
   permission/scans. A validated same-ID complete record is idempotent completion.
9. Update startup and scheduling consumers together. With proven pending absence,
   a valid leftover complete outcome needs only best-effort cleanup and permits
   `no_pending`; it must not reapply SQL or offer another gallery scan. Invalid or
   unreadable records remain blocked. Any physical pending still wins every
   outcome. Before a new schedule, retire an old complete outcome and prove its
   absence; failed retirement blocks that new schedule, not already completed use.
10. A complete-result deletion failure is harmless cleanup. Return the verified
    final result and retain the complete record for later cleanup. Do not mutate
    that stored result to describe an unpersisted later warning. Do not lose a
    successful result merely because cleanup failed.

## Required evidence and handoff

Test the actual production runtime, record parser and media coordinator with real
SQLite and controlled OS/media adapters. Cover scan success and ambiguity, denial,
skip, empty rows, reused IDs with fresh rows after recreation, mixed outcomes,
abort before permission/during resolver, concurrent/stale requests, resolver and
row-write failure, progress exceptions, warnings/diagnostic bounds, malformed
complete records, write acknowledgement loss, unreadable readback, deletion
failure, controls-only retry, startup with complete leftovers, and later scheduling.
Verify no physical deletion and truthful distinct-candidate skip counts. Prove
ordinary set loading cannot resurrect an unresolved row through a weaker match.

Run the new media suite plus engine/preparation/schema/PB/backup regressions and
existing video storage, metadata and set-detail tests in both release profiles;
TypeScript, scoped lint and diff checks. Exact test paths/commands accompany the
worker packet. Independent specialist audit and organiser review precede merge.
Actual Android media/process-death integration remains a later gate.

Return the commit SHA, files, implemented behavior, exact test results, assumptions,
remaining limitations and scope compliance. Rebase on current main only when
conflict-free; stop and report cross-owner conflicts. Do not merge or push.
