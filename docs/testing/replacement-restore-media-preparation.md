# Media completion preparation notes

Organiser source review, 2026-09-22. These are findings for the later MVP-006C
packet, not an implementation or accepted cleanup path. Dispatch waits for the
engine's passed-handle and validated outcome ownership seam to be reviewed.

## Existing reusable behavior

`lib/utils/videoStorage.ts` is connection-free. Its accepted
`resolveVideoLibraryReference()` requires a canonical filename plus positive time
or duration, completes the visible bounded scan, and accepts exactly one compound
match. It never lets a stored asset ID break a tie. Android uses the corroborated
asset's content URI. Preserve that behavior for both restore and ordinary set load.
Do not import `lib/db/media.ts` in the engine: it imports the singleton connection.
Postcommit DB reads and writes must use the explicit current handle instead.

`ensureVideoLibraryPermission()` can request permission; the resolver itself only
checks existing permission. Explicit skip or an already aborted scan must not
prompt. The current resolver takes no AbortSignal. Its bounded scan may still
have many awaited provider calls, so the media packet must define cancellation
between those calls or explicitly account for waiting for the active bounded
resolver before settling. Never finalize an outcome while a stale continuation
can later change a media URI.

## Contract decisions required before dispatch

- Explicit `mode: "scan" | "skip"` on
  `CompleteReplacementRestorePostCommitOptions` is now integrated as `508c103`.
  The lifecycle owner never writes outcome records directly.
- Scan and skip both fresh-read current rows after proven physical pending
  absence, account every row, and persist a real final result. A cancelled scan
  stops further matching and leaves committed training records successful.
- Media result totals must make unresolved/skipped rows clear. No stored candidate
  row-ID replay is permitted after process death. Existing resolver rejection
  keeps URI empty and metadata intact.
- Engine-owned precommit URI candidates are process-local only. Missing that
  context after a process restart is not permission to sweep the managed directory.

## File cleanup finding

The existing `isManagedVideoUri()` is a lexical prefix check, and
`deleteManagedVideoUri()` calls the legacy FileSystem deletion helper. Neither
meets the ADR's restore-cleanup canonical-path requirement. Installed Expo
FileSystem 57.0.7 `FileInfo.uri` preserves input spelling; `PathInfo` exposes only
existence/directory state, not a canonical target. Android canonical containment
checks in `FileSystemDirectory.validateChildTarget()` apply to creation, not to
arbitrary deletion. `FileSystemPath.delete()` and legacy `forceDelete()` can
recurse for directory targets. Do not infer a safe restore delete API from them.

Before permitting any physical cleanup, use a reviewed mechanism that establishes
the exact canonical app document `set-videos` root and target, rejects ambiguous
URIs, traversal, encoded separators, symlink escape and non-file targets, and
rechecks current DB references immediately before deleting a single owned orphan.
No recursive deletion or gallery deletion is allowed. A path whose canonical
target cannot be established must count as skipped; cleanup failure is nonfatal.
Any needed native addition requires its own bounded owner and independent review,
not silent expansion of the media worker's scope.

## Completed-outcome boundary to freeze in the media packet

ADR startup step 11 requires a strict `postCommitStatus: "complete"` record with
the actual final result before deletion. The engine's current pending-only parser
is an intentional intermediate subset. The media ticket must extend the internal
record union and its startup/scheduling consumers together; merely adding a writer
would strand the next startup behind an unknown-record error.

With physical pending absence and a strictly validated complete result, leftover
outcome deletion is harmless cleanup: it must not replay SQL or media IDs or
require another gallery scan. Unreadable/malformed outcome storage still fails
closed. Before publishing a later restore, retire a previous complete record and
prove absence so a stale completed record cannot prevent the new committed
outcome from being written. A failed cleanup can prevent that new scheduling
attempt while leaving the already completed training data usable.

The final-result validator must check all fifteen counts, PB consistency,
`resolved + unresolved = total`, permission-skipped rows as a subset of unresolved
rows, bounded error/warning fields, and the native control-record byte ceiling.
Bound diagnostic detail arrays without losing aggregate counts; otherwise a large
number of unresolved media rows could make durable completion impossible. A
failed completion publication/readback must preserve committed-data semantics and
keep the completion gate closed until a valid result can be established.

These are organiser preparation decisions, not dispatched implementation. The
engine audit and ownership seam still precede the final media packet.
