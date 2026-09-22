# Replacement restore postcommit media completion

MVP-006C completes the connection-free replacement restore service after the
startup transaction has committed and the physical pending manifest has been
proved absent. The caller supplies the long-lived live SQLite handle and chooses
an explicit fresh gallery scan or skip.

## Implemented boundary

`completeReplacementRestorePostCommit()` strictly validates the matching durable
outcome before permission or media work. It serializes with the other restore
operations, fresh-reads the current `media` rows through the supplied handle, and
updates only `local_uri`. A verified resolver match stores the resolver URI. Every
skipped, unresolved, errored, or aborted row is assigned the schema-compatible
empty URI. A final explicit-column reread verifies the same row IDs and metadata
and the exact expected URI for every row before completion can be published.

Scan mode requests permission once. A false result means permission was not
affirmatively established; it does not claim a proven denial. The existing
bounded resolver remains the only matcher and a null result remains a generic
unresolved reference. Skip mode never calls either adapter. Abort is checked
before permission and before and after each resolver call. An active resolver is
drained, its late result is discarded, and no later row is scanned.

The complete outcome embeds the exact final `ReplacementRestoreResult`. Its
parser accepts exact keys only and validates record version, restore ID, schema
manifest, all restore-table counts, rebuilt PB consistency, result literals,
media arithmetic, permission-skip bounds, cleanup counts, diagnostic bounds, and
the native control-record byte ceiling. Row diagnostics are capped at 64 while
aggregate totals remain exact; truncation is reported by the
`media_diagnostics_truncated` media-reconciliation warning.

The complete record is physically read back before deletion. A lost write
acknowledgement succeeds only when that reread matches. If durable completion
cannot be proved, the runtime retains the computed result and complete record so
a same-process retry touches controls only and does not repeat permission or
gallery scans. A validated complete record is idempotent. Complete-record
deletion is best-effort cleanup and cannot change or lose the verified result.

Startup treats a valid complete leftover with proven pending absence as
`no_pending` after best-effort cleanup. A physical pending manifest still wins.
Scheduling retires and proves absence of an old complete outcome before publishing
a new pending restore; an unretired or unreadable outcome blocks that new schedule.

## Managed-file cleanup limitation

No available Expo API establishes the canonical target containment required for
safe restore cleanup. This implementation performs no physical file deletion and
never deletes a gallery asset. It deduplicates the same-process nonempty precommit
URI strings, reports them as `skippedUntrustedPaths`, and reports zero deleted
managed files. After process recreation that untrusted context is absent, so the
count is zero and no directory sweep or old media-ID replay occurs.

## Host evidence

`__tests__/db/replacementRestoreMedia.test.ts` exercises the production runtime,
strict record parser, real SQLite rows, and media coordinator with controlled
permission and resolver adapters. It covers successful and ambiguous resolution,
permission not established, explicit skip, empty media, abort before permission
and during a resolver, provider and row-write failures, throwing progress
callbacks, diagnostic bounds, write acknowledgement loss, unreadable readback,
controls-only retry, deletion failure, wrong/concurrent requests, process
recreation with a reused row ID, fresh current-row metadata, and the absence of
physical deletion.

`__tests__/app/replacement-restore-media-load.test.tsx` renders the ordinary set
screen with the real shared resolver. Two canonical matches include the stored
reused asset ID; the screen leaves the restored empty URI unresolved and performs
no copy, media-row update, or playback. Engine regressions cover complete-outcome
startup cleanup and retirement before a later schedule.

Android MediaLibrary visibility, permission behavior, process death, content URI
playback, and performance remain native release gates. Host mocks and Node SQLite
do not provide that device evidence.
