# MVP-006D3 Settings replacement restore hookup

Organiser preparation, 2026-09-22. Media is accepted. The real lifecycle facade now
exists in source-review checkpoint `1d82389801b16ae04ae631f2343602bab91c0c0d`.
Per plan section 3.1, D3 may use one short-lived stacked branch from that exact
checkpoint while B6 is under review; do not add a stub lifecycle module. B6
acceptance/integration remains a hard dependency for D3 integration. After B6
merges, the organiser transplants only D3's own commits onto new main and pins
final checks there. The worker must not replay the parent's implementation or
resolve cross-ticket conflicts. The final worker message pins branch/worktree.

## Objective and scope

Replace Settings' reachable merge-import action with the accepted replacement
restore dialog, using the real service and lifecycle scheduling wrapper. Keep
existing export, calculators and appearance/unit settings behavior intact.

Allowed files: `app/(tabs)/settings.tsx`, new
`__tests__/app/settings-replacement-restore.test.tsx`, and
`docs/testing/replacement-restore-dialog.md`. Reuse the existing
`components/settings/ReplacementRestoreDialog.tsx` without changing it. No engine,
lifecycle, shared contract, root, timer, database, schema, dependency or native
edits. Stop and report a necessary cross-owner change.

Read AGENTS.md, DB truth/access patterns (legacy import removal touches a backup
consumer), product facts sections 9-11, the shared restore/startup contract and
dialog notes. Graph discovery identified `SettingsScreen` in
`app/(tabs)/settings.tsx`; inspect exact source, its `onImportBackup` handler and
import button, and the accepted dialog props/ownership behavior. Installed React
Native and the accepted dialog satisfy the UI need; no extra package is needed.

## Contract and acceptance

- Supply the real `prepareReplacementRestore` and `discardPreparedRestore`
  singleton functions from `lib/db/replacementRestore.ts` to the dialog's service
  props. Supply `scheduleReplacementRestoreAndBlock` and
  `getReplacementRestoreAvailability` from the accepted lifecycle module. Keep
  function identity stable across renders/remounts; do not wrap discard in a new
  render-created function that loses preparation/cleanup ownership.
- Remove the Settings call/import of `importDatabaseBackup`, merge-result
  calculation and merge-success wording. Retain the legacy module implementation
  for its separate source/tests; do not delete deferred code or call both flows.
- Clearly label the Settings action as replacement restore and use the dialog's
  existing confirmation/preparation/progress/cancellation/restart behavior. Never
  report restored success merely because scheduling returned restart-required.
- Availability comes from the lifecycle, not a second guessed platform check.
  Unsupported/native-unavailable restore must be visibly unavailable; no picker
  or raw scheduler call through a disabled action. The dialog already handles its
  own availability and cleanup failure states.
- Prevent conflicting backup export/import actions while the dialog is open.
  Preserve export cancellation, sharing and existing save behavior. The startup
  gate owns unmounting Settings on durable scheduling and displaying final
  committed/media results; Settings must not independently reload or release it.
- Reuse existing class-based action styles. No raw SQL or new persistence path.

## Proof and handoff

Render the actual Settings screen in focused tests with controlled service,
lifecycle, picker and export boundaries. Prove the reachable action opens the
real dialog, preparation/confirmation schedules only through the lifecycle,
legacy merge is never called, disabled availability never prepares, cancellation
cleans its token, and export remains usable after dismissal. Preserve existing
dialog remount/cleanup and double-tap coverage rather than duplicating it.

Run the new Settings suite and existing
`__tests__/app/replacement-restore-dialog.test.tsx` in both profiles, TypeScript,
scoped ESLint and diff checks. Root reviews the exact diff and integrates it.
Return SHA, exact files/behavior/checks, assumptions, outstanding native proof and
scope confirmation. No worker merge, push, stash or scope expansion.
