# EPIC-MVP-01 execution register

Updated 2026-09-21. The product contract and delivery order are defined in
[product facts](mvp-product-facts.md) and the [implementation plan](mvp-implementation-plan.md).

## Prerequisites

- PRE-001A through PRE-001F: completed in the documented SDK checkpoints.
- PRE-001G: Android accepted; iOS and camera runtime explicitly deferred.
- PRE-001H: accepted at `287e55ff9c31542e450d7603783f578e20572b9f`.
- PRE-001R: independent Sol/high read-only review passed on that SHA with no
  findings. The organiser accepted it after reviewing source and evidence.

These gates authorise implementation ordering, not a release. iOS remains outside
the current execution queue. In-app camera will be unavailable in MVP; gallery
attachment/playback remains included. Retained full-profile source must compile.

## Wave 1 contract and ownership

All initial tickets use `5892c323797a85d86a60ae09c9058b37f0808ab5`
as their common base (source identical to audited `287e55f`); exact SHA is supplied
in each worker packet. The organiser reread the plan after checks and refreshed
codebase-memory before dispatch. Workers
receive no inherited conversation, only their section 4.3 packet. Worktrees are
siblings of this repository, never nested under the app or its test discovery tree.
No worker merges or expands its scope. The organiser independently reviews every
diff and owns integration. Existing dirty/untracked work is excluded throughout.
Merged ticket branches 001A, 002A, 002A-R1, 001B and 003A have been deleted after
integration. Their clean worktrees remain detached at reviewed commits to retain
local evidence; no worktree files or shared dependency junctions were deleted.

| Ticket | Worker | Exclusive write scope | State |
| --- | --- | --- | --- |
| MVP-001A | Terra / medium | `lib/config/releaseProfile.ts`, `__tests__/config/releaseProfile.test.ts` | Reviewed and merged as `b7d1a51` |
| MVP-002A | Terra / medium | `__tests__/db/manualLoggingLifecycle.test.ts`, `__tests__/app/manual-logging-lifecycle.test.tsx`, `__tests__/helpers/manualLoggingDatabase.ts`, `docs/testing/manual-logging-characterization.md` | Reviewed characterization merged as `e7cf5e8`; one reproduced defect tracked below |
| MVP-002A-R1 | Terra / high | Manual date/resume seam in `components/exercise/UnifiedRecordTab.tsx`, `__tests__/app/manual-logging-lifecycle.test.tsx`, `docs/testing/manual-logging-characterization.md` | Reviewed and merged as `aa6b671` |
| MVP-003A | Sol / xhigh | `__tests__/db/exerciseNameMigrationProof.test.ts`, `__tests__/helpers/exerciseNameMigrationProof.ts`, `__tests__/fixtures/exercise-name-migration/**`, `docs/adr/exercise-name-migration-proof.md` | Corrected proof independently accepted, organiser reran 12/12 after rebase; merged `ff89170` |
| MVP-004A | Luna / medium | `__tests__/app/set-detail-characterization.test.tsx`, `__tests__/utils/setVideoCharacterization.test.ts`, `__tests__/db/setMediaCharacterization.test.ts`, `__tests__/helpers/setDetailCharacterization.ts`, `docs/testing/set-detail-characterization.md` | Review requested stronger selection/replacement and exact DB assertions |
| MVP-001B | Terra / high | `app/_layout.tsx`, `lib/routing/capabilityAccess.ts`, `components/routing/CapabilityGuard.tsx`, focused routing tests/helper and `docs/testing/profile-route-guards.md`; bounded Jest configuration exception below | Reviewed and merged `aa762bc`; 32 suites / 401 tests pass including real-root direct URL tests |
| MVP-002B | Sol / high | `lib/db/workouts.ts`, `__tests__/db/historyReadModel.test.ts`, optional isolated history DB adapter | Running in `mvp/MVP-002B-history-read-model`, base `aa6b6715ffea28ba0094ffed6ed7aa184cd6610c` |
| MVP-001D | Terra / high | `app/(tabs)/index.tsx`, `components/exercise/UnifiedRecordTab.tsx`, optional recording-route wrapper; focused capability/manual UI tests and findings | Running in `mvp/MVP-001D-entry-points`, base `aa762bc096c0979300b27ca2f80fdbfdffbe29ea` |

MVP-001A merges first. Migration and lifecycle proof work cannot silently change
production behavior. Findings return to the organiser for a narrowly scoped repair
or the dependent implementation ticket. Production migrations and restore code
require an independent specialist review and failure-injection evidence before merge.

MVP-001A review corrected a test's ambient-full-profile assumption before acceptance.
Both profile test runs pass (14 tests). The organiser reran the MVP-profile focused
test independently and the integrated full suite: 28 suites / 358 tests pass;
typecheck passes. Worker lint reports only the 20 baseline warnings. Isolated
worktrees reuse the locked dependencies read-only and the existing ignored Expo
generated `expo-env.d.ts` for the same ambient types as main. The capability module
is implemented; UI/route consumers remain subsequent tickets, so this is not yet
acceptance of the complete MVP feature boundary.

MVP-002A independently passes 9 characterization tests using production APIs over
real SQLite, including closing/reopening a file-backed database through production
bootstrap. One of those is an explicitly expected failure: reopening an unfinished
exercise after midnight restores its entry ID but not its selected date; the next
set receives the new day. The ordinary assertion was verified to fail with Sep 20
noon expected and Sep 21 noon received. MVP-002A-R1 must fix this and convert it to
an ordinary passing regression. The expected-failure test does not waive the product
requirement or establish MVP-002 acceptance. The organiser owns this separate repair
ticket; broad-history SQL remains subsequent MVP-002B scope.

MVP-002A-R1 subsequently fixed the reproduced issue. The once-per-entry date
hydration preserves explicit date-picker changes, and the expected-failure marker
is removed. Organiser review checked the resume path and in-progress overlay route;
independent targeted execution under MVP passes 10 tests across 2 suites. Full
worker typecheck/lint pass with baseline warnings only. No persistence path or
program-mode behavior changed. The component lock is released for later capability
work, subject to sequential integration.

Integrated verification at `aa6b671` (and documentation-only `9321398`): both full
and MVP profiles pass the full Jest suite, 30 suites / 368 tests each; typecheck
passes; lint has zero errors and the same 20 baseline warnings.

The organiser authorised MVP-001B to change `jest.config.js` and add
`jest.router.config.js` / `__tests__/helpers/profileRouteSetup.ts` as needed for an
automatically executed real Expo Router project. Existing unit-test behavior and
discovery must remain intact; no dependency/lockfile changes, opt-in skips, or
duplicate test execution. This is a test-harness scope adjustment, not a waived
route acceptance criterion.

MVP-001B now runs 22 navigation tests against the actual root layout, with dummy
leaf screens only. All 13 deferred URLs reject MVP access without mounting their
screen; core routes remain accessible. The integrated routing configuration and
typecheck pass. MVP-003A's specialist initially rejected incomplete unique-index
validation, then accepted correction `5cc3f56`; the organiser inspected the change,
rebased onto `aa762bc`, reran all 12 tests, and integrated the proof as `ff89170`.
Historical schema coverage and production migration remain separate MVP-003B work.

The post-integration codebase-memory refresh was attempted in both fast and full
modes, but the service still reports the original 3,026 nodes and cannot find the
new capability symbols. Continue graph-first discovery and verify current source
directly where graph results are absent/stale. The existing graph artifact was
preserved; a successful tool response alone is not evidence of a fresh index.

### Next-ticket review notes

- MVP-001B must inventory automatically discovered routes, including
  `programs/create/editor`, not only existing explicit Stack screens. Direct URL
  coverage must exercise the real route boundary.
- MVP-001D must also contain the program mode embedded in `UnifiedRecordTab`:
  program parameters, scheduled-session loading and autosave are deferred behavior
  even when reached through the otherwise included exercise route. That component
  remains exclusively assigned to the capability worker until this is reviewed;
  later notes work must wait. Preserve manual resume, timers and gallery access.
- Root startup currently invokes development seeding that includes health metrics.
  The capability routing/bootstrap ticket must prevent deferred startup work in MVP.
  The notification handler currently navigates only to manual exercise routes;
  retain and test timer return rather than disabling notifications wholesale.
- MVP-002B must audit `getLastWorkoutDay` and the day count in `getQuickStats` as
  well as `listWorkoutDays`, `searchWorkoutDays`, `getWorkoutDayDetails` and
  `getWorkoutDayPage`. Empty drafts must not consume counts or pagination slots.
  Keep existing volume/PB formulas and ID-based session relationships.
- MVP-004A remains unaccepted: the add/cancel test reuses an unloaded callback and
  does not prove cancellation against an existing attachment; screen replacement
  and deliberate no-match rediscovery need stronger assertions. Its 10 tests pass,
  but passing alone does not satisfy the review contract.
- MVP-004C must correct the picker duration boundary: installed
  `expo-image-picker/build/ImagePicker.types.d.ts` defines duration in milliseconds,
  consistent with [Expo ImagePicker documentation](https://docs.expo.dev/versions/latest/sdk/imagepicker/).
  The current set route multiplies it by 1000. MediaLibrary legacy duration is a
  separate seconds-based boundary; do not globally remove conversions. The
  characterization must record this existing defect without endorsing the value.
- Before MVP-003B production migration, prove historical column layouts as well as
  the current bootstrap layout. Repository history includes a pre-variation shape
  at `39cc234` (parent/variation columns later appended by ALTER), and pre-UID
  connection bootstrap history before `3223ce9`. The proof's exact DDL matcher
  cannot simply become the production migration. Unknown constraints/indexes must
  fail closed; supported shapes must preserve every existing value and reference.
- MVP-001D owns `app/(tabs)/index.tsx` while removing the health entry and suppressing
  its snapshot query. MVP-002C's later Overview status rendering must wait for that
  ownership to be released; the history/day screens remain a separate UI scope.

### Frozen MVP-001A interface

`lib/config/releaseProfile.ts` is the sole capability source:

- Export `ReleaseProfile = "full" | "mvp"`.
- Export readonly `AppCapabilities`: `programsExperience: "enabled" | "coming-soon"`,
  and boolean `healthMetrics`, `videoRecording`, `thirdPartyImport`,
  `multipleWorkoutSessions`.
- Export `parseReleaseProfile(value: string | undefined): ReleaseProfile`.
  Only absent input defaults to `full`; exact `full` and `mvp` are accepted.
  Empty, padded, misspelled and otherwise invalid values throw visibly.
- Export `getCapabilities(profile): Readonly<AppCapabilities>` using frozen shared
  capability objects and a frozen map.
- Export `releaseProfile` from direct `process.env.EXPO_PUBLIC_RELEASE_PROFILE`
  access, and `appCapabilities = getCapabilities(releaseProfile)`.
- Full enables Programs and every boolean. MVP uses Coming Soon and disables all
  four booleans. Core logging, calculators and gallery remain included without flags.

Installed TypeScript and Jest cover this static local configuration; no external
feature-flag service or new dependency is needed. Route, EAS, bootstrap and UI
consumers follow in their own tickets after this interface is reviewed.
The direct environment access follows Expo's documented
[environment variable support](https://docs.expo.dev/guides/environment-variables/),
reviewed before dispatch; bracket access/destructuring is not an equivalent
build-time contract.

### Frozen MVP-002B read contract

Broad history includes an exercise entry exactly when a linked real set exists,
regardless of completion. Empty entries cannot consume a day or entry pagination
slot, affect search matches, or contribute to counts. All six broad read helpers
listed above use this rule, including the Overview helpers. Exercise/workout IDs
remain identity; several entries and workout envelopes may share one local day.

`LastWorkoutDayExercise`, `WorkoutDayExerciseDetail`, and
`WorkoutDayExerciseEntry` gain required `completedAt: number | null`.
`WorkoutDaySummary` gains required `inProgressCount: number`, counting included
entries with null completion. Existing fields remain available. UI consumption
belongs to MVP-002C, including the Overview last-workout surface identified by the
graph. Set counts count linked rows, including zero-load sets; volume and E1RM
definitions remain unchanged. Existing search token intersection and date-range
behavior are retained. Tests use production queries over real SQLite and cover
empty drafts, mixed lifecycle states, multiple envelopes, filtering, pagination,
local-day boundaries, and deletion of the last set.

## Retained evidence and follow-ups

The [Android audit](android-console-audit-2026-09-20.md) records final route checks,
console classifications and the exact APK identities. Local binary/screenshots/log
evidence remains untracked under `.codex-artifacts/`.

MVP-006 must use the preserved paired backup/live states for UID-less seed merge
ambiguity. The current merge's successful SQLite integrity checks do not establish
replacement semantics. The final resumed import added two seeded workout/set pairs;
this is explicitly recorded, not reported as an identical round-trip.

Read-only export review also found that `checkpointDatabaseForBackup` executes
`PRAGMA wal_checkpoint(TRUNCATE)` without inspecting its busy/result row before
copying the database file. MVP-006A must consider a busy/WAL export fixture and a
consistent SQLite snapshot API; the installed Expo SQLite types expose
`backupDatabaseAsync` / `backupDatabaseSync`. This is a design input, not a completed
export correction or a claim that the inspected successful Android export was bad.

The phone is not required for these implementation tickets. Later physical gallery
and release verification will require a device and may require USB reauthorization.
