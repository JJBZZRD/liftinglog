# EPIC-MVP-01 execution register

Updated 2026-09-22. The product contract and delivery order are defined in
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
Merged ticket branches 001A, 002A, 002A-R1, 001B, 003A, 001D, 002B, 004A,
001D-R1, 001C, 004B, 001E, 000B-R1, 002C, 004B-R1, 003C, 003B, 004C, 003D,
002B-R2, 003E, 004D, 002D, 007B, 002E, 005A, 005B, 005C, 005D1, 005D2 and 004E1 have been deleted after
integration. Their clean worktrees remain detached at reviewed commits to retain
local evidence; no worktree files or shared dependency junctions were deleted.

| Ticket | Worker | Exclusive write scope | State |
| --- | --- | --- | --- |
| MVP-001A | Terra / medium | `lib/config/releaseProfile.ts`, `__tests__/config/releaseProfile.test.ts` | Reviewed and merged as `b7d1a51` |
| MVP-002A | Terra / medium | `__tests__/db/manualLoggingLifecycle.test.ts`, `__tests__/app/manual-logging-lifecycle.test.tsx`, `__tests__/helpers/manualLoggingDatabase.ts`, `docs/testing/manual-logging-characterization.md` | Reviewed characterization merged as `e7cf5e8`; one reproduced defect tracked below |
| MVP-002A-R1 | Terra / high | Manual date/resume seam in `components/exercise/UnifiedRecordTab.tsx`, `__tests__/app/manual-logging-lifecycle.test.tsx`, `docs/testing/manual-logging-characterization.md` | Reviewed and merged as `aa6b671` |
| MVP-003A | Sol / xhigh | `__tests__/db/exerciseNameMigrationProof.test.ts`, `__tests__/helpers/exerciseNameMigrationProof.ts`, `__tests__/fixtures/exercise-name-migration/**`, `docs/adr/exercise-name-migration-proof.md` | Corrected proof independently accepted, organiser reran 12/12 after rebase; merged `ff89170` |
| MVP-004A | Luna / medium; Terra / high review repair | `__tests__/app/set-detail-characterization.test.tsx`, `__tests__/utils/setVideoCharacterization.test.ts`, `__tests__/db/setMediaCharacterization.test.ts`, `__tests__/helpers/setDetailCharacterization.ts`, `docs/testing/set-detail-characterization.md` | Corrected real-screen tests reviewed and independently passed 12/12; merged `c162637` |
| MVP-001B | Terra / high | `app/_layout.tsx`, `lib/routing/capabilityAccess.ts`, `components/routing/CapabilityGuard.tsx`, focused routing tests/helper and `docs/testing/profile-route-guards.md`; bounded Jest configuration exception below | Reviewed and merged `aa762bc`; 32 suites / 401 tests pass including real-root direct URL tests |
| MVP-002B | Sol / high | `lib/db/workouts.ts`, `__tests__/db/historyReadModel.test.ts`, optional isolated history DB adapter | Independently accepted; organiser reran 76/76 after rebase, merged `01dbffd` with ground-truth update |
| MVP-001D | Terra / high | `app/(tabs)/index.tsx`, `components/exercise/UnifiedRecordTab.tsx`, focused capability/manual UI tests and findings | Reviewed; organiser targeted 29/29 pass, merged `3a3a6c3`; file ownership released |
| MVP-003C | Sol / high | `lib/db/exercises.ts`, bounded calendar reference rewrite helper, shared runtime/template unit-sync identity guard, focused identity tests | Independently accepted with 150/150 relevant tests and guard-disabled regression proof; merged `bba025d` |
| MVP-004B | Terra / high | `lib/db/media.ts`, `lib/utils/videoStorage.ts`, focused DB/storage tests | Drizzle correction reviewed; organiser 22/22 targeted pass, merged `e03e6a7` |
| MVP-001C | Terra / medium | Programs tab wrapper/extracted components and focused profile UI tests | Reviewed unchanged full-screen extraction and real route gate; 16/16 targeted pass, merged `bad6930` |
| MVP-001D-R1 | Luna / medium | `__tests__/setup.ts` | Reviewed shared Expo environment mock; full/MVP 38 suites / 437 tests pass, merged `215e75b` |
| MVP-001E | Luna / medium | `eas.json`, configuration tests and profile documentation | Reviewed and independently passed 53 tests across five configuration/route/UI suites; merged `9fb149d` |
| MVP-001R | Organiser | Read-only profile/route review | Accepted automated capability boundary after 001B-001E; release device matrix remains 007 scope |
| MVP-003B | Sol / xhigh | `lib/db/bootstrap.ts`, `lib/db/schema.ts`, production migration tests/fixtures and historical-shape ADR | Independently accepted with 40/40 targeted tests and typecheck; merged after 003C as `d243673` |
| MVP-002C | Terra / high | Workout history/day screens, Overview status, focused UI tests | Reviewed status rendering and foreground correction; 18/18 targeted tests pass, merged `90554d9` |
| MVP-000B-R1 | Luna / medium | `.github/workflows/quality.yml`, release-profile testing notes | Reviewed both-profile matrix and clean-checkout Expo types; merged `87b0fba`; remote run/protections unverified |
| MVP-004B-R1 | Terra / medium | `lib/db/workouts.ts` set lookup only, `__tests__/db/setLookup.test.ts` | Reviewed and independently passed 9/9 lookup/lifecycle tests; merged `ea56f4e`; file ownership released |
| MVP-004C | Terra / high | `app/set/[id].tsx`, focused set-detail UI/characterization tests/helper | Corrected candidate `2366824` reviewed; organiser 31/31 targeted tests pass; merged `a1925ec` |
| MVP-002B-R2 | Sol / high | Six broad-history read helpers in `lib/db/workouts.ts`, focused legacy-date/history tests | Independent audit accepted `bae156e`, 22/22 tests pass; merged `2c0da70` |
| MVP-003D | Terra / high | Focused exercise identity UI tests; production correction only if necessary | No production defect found; organiser 9/9 targeted tests pass; merged `fd6ab92` |
| MVP-004D | Terra / medium | New DB/media cleanup tests, direct storage deletion tests, bounded repaired-media state synchronization in set route | Corrected state and strengthened shared/unmanaged-file proof reviewed; organiser 40/40 targeted tests pass; merged `5c96af3` |
| MVP-003E | Terra / medium | New real-DB exercise data-isolation tests only | Strengthened same-name restart and mutation proof reviewed; organiser 21/21 targeted tests pass; merged `0287330` |
| MVP-002D | Sol / high | New real-DB in-progress PB/analytics/CSV tests only | Organiser reviewed and independently passed 38/38 targeted tests; merged `4a561d0` |
| MVP-007B | Luna / medium | Calculator math/catalog/UI tests and verification notes | Both-profile worker checks pass; organiser MVP 13/13 pass; merged `7ba1493`; production unchanged |
| MVP-002E | Luna / medium | Manual characterization notes and new history acceptance/disposition document | Reviewed and merged `3b7921d`; old untracked analysis preserved |
| MVP-002R | Organiser and independent Sol audits | Read-only SQL/lifecycle/consumer review | Accepted host implementation after 002A-E and legacy-date correction; partial-day limitation explicit; physical release matrix remains separate |
| MVP-003R | Independent Sol cross-reviews and organiser | Migration/identity read-only review | Accepted migration/identity host gate with 003D/E integration; native upgrade/fresh-install release proof remains pending |
| MVP-005A | Luna / medium | Notes source audit only | Path/scope and evidence wording corrected, reviewed and merged `06fc4cf` |
| MVP-005B | Sol / high | `workouts.ts` workout-note updater and day-page note fields, new real-DB tests | Reviewed and independently passed 26/26 targeted tests; merged `bbd325e` |
| MVP-005C | Terra / high | UnifiedRecordTab entry-note save/error seam and new focused UI tests | Corrected candidate `aab8c84` reviewed; organiser 19/19 targeted tests pass; merged `98ac655` |
| MVP-005D1 | Terra / high | `app/edit-workout.tsx` canonical workout/entry note editor and new focused UI tests | Corrected candidate `962dd98` reviewed; organiser 30/30 targeted tests pass; merged `a550a8a`; emulator integration reviewed |
| MVP-005D2 | Terra / medium | Exercise HistoryTab and workout day route note display, new focused tests | Reviewed, organiser 16/16 targeted tests pass; merged `77c5f0b`; filters/grouping unchanged |
| MVP-005R | Organiser | Read-only integration and controlled emulator notes checks | Host and emulator notes gate accepted; [evidence](testing/mvp-android-notes-review.md); replacement-restore and physical release proof remain pending |
| MVP-004E1 | Sol / high | Gallery metadata acquisition ADR and isolated proof only | Research reviewed and merged `7ca6e9b`; content-URI hashing and latency remain native proof gates, not accepted production behavior |
| MVP-004E2 | Sol / high; organiser native execution | Isolated development-only diagnostic route and usage notes | Candidate `5bbbb34` reviewed and executed; [API proof](testing/gallery-native-api-review.md) accepted for small fixtures/full and limited access; diagnostic route not merged |
| MVP-004E2P | Luna / medium; organiser native execution | Separate non-shipping diagnostic extension | Reviewed `e0ce3a0`; emulator eight 64 MiB reads pass in 1,577 ms, max heartbeat gap 267 ms; fixture removed and all 15 tables unchanged; physical performance remains pending |
| MVP-004E3 | Sol / high | Video storage acquisition/resolution helper, set gallery/repair integration, focused tests | Corrected `f4ab9cb` reviewed; organiser 57/57 targeted checks pass; both profiles 59 suites / 594 tests pass; merged `e8caf44`; [emulator integration accepted](testing/mvp-gallery-resolution-review.md), including ambiguity rejection and unique repair |
| MVP-006A | Sol / xhigh; separate Sol / xhigh audit | Restore ADR and isolated proof/fixtures only | Third review accepts `100a812`; organiser independently passes 15/15; clean rebase integrated `f045adb`; design accepted, production obligations remain |
| MVP-006B1 | Sol / high; independent Sol / high audit | Pure PB derivation, existing PB rebuild seam, focused parity tests | Independently accepted `f990f11`; clean rebase `9c0da86`; organiser 6/6 targeted tests pass; merged `288001e` without metric or persistence changes |
| MVP-006B2 | Sol / xhigh; independent Sol / high audit | Android process token and atomic control store, isolated plugin/templates/facades/tests | Corrected `2e56151` independently accepted and merged `f6b045b`; organiser 23/23 tests pass; actual Kotlin parser suite 4/4 passes; corrected APK builds but is not installed; runtime proof pending |
| MVP-006B2P | Terra / medium; organiser review | Separate non-shipping native-control diagnostic route and usage notes | Corrected `3f6acf1` reviewed; organiser typecheck/scoped lint pass; runtime unrun |
| MVP-006B2C | Sol / high | Native timer registry/retirement, existing adapter, manager/module/receivers and template parity, focused tests | SharedPreferences candidate rejected; AtomicFile repair `f80a3e1` also requires verified backup-recovery postconditions; repair in progress, runtime proof pending |
| MVP-006B2R | Sol / xhigh | Native control-store recovery verification and narrow tests | In implementation from `a86d17a` after actual API 36 backup-rename failure returned non-authoritative base bytes; independent review and corrected runtime proof required |
| MVP-006B2D | Terra / high; independent Sol / high audit | TimerStore lazy readiness/quiescence, notification continuation cleanup, narrow root activation, focused tests | Corrected `e88aefb` independently accepted and merged `9401261`; separate native completion ownership survives failed ordinary/strict cleanup retries; 25 focused tests pass in each profile |
| MVP-006B3 | Sol / xhigh; independent Sol / xhigh audit | Read-only historical/current schema manifests and disposable validation fixtures | Corrected `043347c` independently accepted and merged `f435567`; organiser 143/143 targeted tests pass; exact historical provenance and migration/future-source closure verified |
| MVP-006B4 | Sol / high; independent Sol / high audit | Maintained streaming SHA-256 helper, exact dependency/lockfile change, focused tests | Independently accepted `1b20d42`; clean rebase `63c9f1d`; merged `ab99216`; organiser 24/24 targeted tests pass; 256 MiB default ceiling, 64 KiB reads; native proof remains required |
| MVP-006B4P | Luna / medium; organiser review | Separate non-shipping hash diagnostic route and usage notes | Corrected `7cc330e` reviewed; organiser typecheck/scoped lint pass; synthetic cache fixtures prepared, but diagnostic has not run |
| MVP-006B5C | Luna / medium | One dependency-free shared restore contract module | Corrected `9c3c2f2` reviewed and integrated as `72d5fd4`; organiser typecheck/scoped lint pass; no engine implementation |
| MVP-006D1 | Terra / high; independent Sol / high audit | Standalone restore dialog, mocked-contract component tests and usage notes | Corrected `4f14086` accepted and merged `a86d17a`; 17 focused tests pass in each profile; service-scoped cleanup/preparation ownership survives remount; no Settings hookup or engine acceptance |
| MVP-006A2 | Sol / high | Export-only backup helpers, isolated snapshot helper and focused tests | In implementation from `9401261`; online backup, standalone sealing, validation and complete SAF filename/MIME; legacy import untouched |

At integrated note-editor source `a550a8a` (subsequent `7ca6e9b` is docs only),
both full and MVP profiles pass 58 suites / 578 tests. Typecheck passes; lint has
zero errors and 19 retained warnings. Logs are retained under
`.codex-artifacts/mvp-notes-editor-{full,mvp}-tests.log`.

After gallery and restore-proof integration at `f045adb`, the organiser reran the
complete suite independently: **60 suites / 609 tests pass in each profile**.
Logs: `.codex-artifacts/mvp-gallery-restore-design-integrated-{full,mvp}.log`.
The two older cleanup test mocks exposed by the initial full-suite run were
corrected within 004E3 before merge; production assertions were retained.

The 006A audit requires a single post-commit manifest/outcome recovery protocol,
an explicit SQLite handle parameter at startup, fail-closed native-token validation,
a safe recovery action after cold-start pre-commit failure, and schema manifests
that account for supported historical exercise column orders. These are design
corrections, not a waiver or acceptance of production restore. Candidate `c847902`
addresses those initial findings. The second audit additionally requires persisting
the native token for every attempt: a JS reload in the latest attempting process
must remain gated, and only a different verified process may retry. Final restore
integration also depends on 004E3 removing permissive ordinary set-load repair, so
an unresolved restored video cannot bypass the conservative resolver after the
restore gate opens. The third independent audit accepts all corrections in
`100a812`; the organiser accepted the design and host proof, then merged after a
clean rebase. Atomic synchronous control-state storage, canonical PB parity,
schema catalogs, SHA-256, and native lifecycle tests remain production prerequisites.

The organiser split the first production prerequisites into 006B1 (PB derivation),
006B2 (native identity/control storage), and 006B3 (schema validation). Each has a
fresh no-context worker and its own sibling branch/worktree with exclusive paths.
Maintained streaming SHA-256 (006B4) now runs as a separate dependency owner; core engine,
root gate, Settings UI, and final replacement/media tests follow the frozen ADR.
The existing file-system overwrite path deletes its destination before moving,
so it is not accepted as atomic synchronous restore-control persistence.

006B1 exposes one pure ordered-set PB derivation for the ordinary rebuild and the
future synchronous restore path. Its independent review found no changes to
validity rules, strict per-rep progression, timestamp handling, SQL ordering, or
UID ownership. After integration, the organiser reran both profiles at `0acf77e`:
**61 suites / 612 tests pass in each profile**. Logs are retained at
`.codex-artifacts/mvp-pb-integrated-{full,mvp}.log`. All seven originally preserved
file hashes still match the preservation baseline.

006B4 selects the maintained `@noble/hashes` 2.4.0 incremental SHA-256 implementation
with an exact pin and explicit Expo `FileMode.ReadOnly` handles. The existing
`node:crypto` Metro shim implements a deterministic non-cryptographic hash and is
not suitable for restore identity. The worker used an isolated dependency
installation. After independent acceptance, the organiser installed the single
reviewed dependency on integrated main. No unrelated dependency changes occurred.

At `ab99216`, both integrated profiles pass **62 suites / 636 tests**. Typecheck
passes; the reviewed candidate's uncached lint has zero errors and 19 retained
warnings. Logs are retained at `.codex-artifacts/mvp-sha-integrated-{full,mvp}.log`.
The hash diagnostic remains on its own branch and will not ship. Its maximum
fixture is a sparse logical 256 MiB zero-filled file; any timing must disclose that
limitation and must not be described as physical-device or cold-cache evidence.

The populated-emulator preservation check is awaiting explicit approval: automatic
approval review rejected both copying its private workout database/sidecars and
the narrower hash-only read, classifying them as sensitive data or metadata
transfers without specific authorization. Neither rejected command ran. Only
hash-only permission has been requested; a reply would not authorize a raw database
copy. Code review and host verification continue independently. Test-owned hash
fixtures remain under app cache `mvp006b4-sha256-20260922`; no diagnostic app launch
or native APK installation has occurred for this prerequisite.

The organiser's [restore review matrix](testing/replacement-restore-review-matrix.md)
records the remaining native prerequisite, process-recovery, exact-replacement,
media and export checks. Unrun scenarios are explicitly pending; diagnostic
branches must remain separate from shipping code.

Native checks now have a separate synthetic-only Android API 36 emulator,
`WorkoutLogRestoreSynthetic`, created from the installed SDK system image with
fresh configuration and writable data under
`.codex-artifacts/restore-synthetic-avd-20260922/`. No existing AVD data image or
workout database was copied. Its ADB endpoint is `127.0.0.1:5557` on a separate
server port 5038; every diagnostic command must specify that endpoint and verify
the AVD name. The original populated emulator remains outside this diagnostic.
The reviewed native-control APK was installed only on this fresh emulator.
[Runtime evidence](testing/android-restore-native-runtime.md) records successful
process identity, both-record kill-before/after-publication and first-write
checks, malformed/inaccessible controls and deletion failure/retry. It also
records a reproduced backup-recovery failure which blocks native acceptance
until 006B2R is independently reviewed and rerun. The existing
private-data approval request remains unresolved and neither denied read has
been retried.

The first 006B2 independent audit found that Android `JSONTokener` accepts malformed
JSON syntax. Corrected `2e56151` uses Gson 2.13.2 strict structural parsing plus a
narrow lexical guard for demonstrated raw-control/BOM gaps. The actual Kotlin
helper suite passes 4 tests; the independent reviewer accepted the correction and
the original process/atomic guarantees. The organiser built the corrected APK
(SHA-256 `8C1FFEC9AE94076B7347528B6DECD589431121938BBEE1FF789F353A56A0D550`)
and integrated the exact reviewed tree as `f6b045b`. It has not been installed.
Build evidence is retained under `.codex-artifacts/mvp-restore-native-review-20260922/`.

Both integrated profiles at `f6b045b` pass **65 suites / 659 tests**; typecheck and
the native integration verifier pass. Logs are retained at
`.codex-artifacts/mvp-native-controls-integrated-{full,mvp}.log`. Six untouched
preservation-baseline files still match their original hashes. `MainApplication.kt`
was verified byte-identical to HEAD before integration; its original LF format is
retained and only the four reviewed native registration/initialization lines were
added. The original copy remains in the native-review artifact directory.

006B3's audit found later columns/indexes incorrectly attributed to the pinned
historical revision. It also found accepted migrated current catalogs rejected as
new restore sources, and permitted missing old tables recreated by bootstrap but
then rejected by the current catalog. The worker must correct provenance and prove
source-to-bootstrap-to-current-to-source closure, including the permitted optional
table cases, before another independent review. These are supported-backup
compatibility failures; no live database was written. Corrected `043347c` passed
the second independent audit: DDL extracted directly from `e9ee8ed7` passes source,
real bootstrap, current and future-source validation. All eight evidenced optional
settings/PR/media combinations pass, while other catalog shapes remain fixed.
The organiser integrated it as `f435567`.

At `f435567`, both profiles pass **66 suites / 763 tests**. Typecheck passes and
uncached lint has zero errors and the 19 retained warnings. Logs are retained at
`.codex-artifacts/mvp-restore-prerequisites-integrated-{full,mvp}.log`.

At `9401261`, the organiser reran both integrated profiles: **68 suites / 778
tests pass**. Typecheck passes; the project `expo lint --no-cache` command reports
zero errors and 19 retained warnings. Logs are retained at
`.codex-artifacts/mvp-timer-lifecycle-integrated-{full,mvp}.log` and the matching
lint log. An initial direct `eslint .` attempt traversed unrelated retained
artifacts and failed on an inaccessible tooling directory; the repository's
actual lint command passes. The timer worker's branch was deleted after the exact
reviewed squash; its detached worktree and evidence remain.

An independent startup/import review prompted the
[frozen startup contract](testing/replacement-restore-startup-contract.md), committed
as `2f4acfc`. It makes physical absence, uncertain live state, outcome-only recovery,
controls-only finalization and safe post-discard initialization explicit. It also
found import-time timer effects and native alarms which can outlive a process and
refer to reused exercise IDs after restore. The organiser split bounded native
retirement (006B2C) from JS lifecycle/navigation cleanup (006B2D), with exact shared
interfaces and disjoint scopes. A third mechanical worker prepares the shared
types (006B5C). All three have separate branches/worktrees, no inherited context,
and must return for review rather than merge. Engine/gate/Settings implementation
remains subsequent; physical and emulator restore acceptance is not claimed.

The 006B4 handoff's unresolved-PSL lint error was not reproduced without cache.
The organiser verified both installed PSL entry files and resolution, then ran
`npm.cmd run lint -- --no-cache` in the isolated candidate worktree: zero errors,
19 retained warnings. No production workaround or dependency rewrite was needed.

MVP-001A merges first. Migration and lifecycle proof work cannot silently change
production behavior. Findings return to the organiser for a narrowly scoped repair
or the dependent implementation ticket. Production migrations and restore code
require an independent specialist review and failure-injection evidence before merge.

The corrected 003B and 003C candidates receive separate read-only cross-reviews:
the identity implementer audits the migration, and the migration implementer audits
identity. Neither reviews their own implementation. The organiser also reviews
both diffs and retains merge authority; 003C must integrate before 003B.
The migration reviewer accepted the stateless retry/file-backed evidence while
noting that fault cases retry on the open connection and reopen after successful
recovery, rather than reopening immediately after each injected failure. The ADR
does not claim otherwise.

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

Integrated verification at `c162637`: both full and MVP profiles pass all 36 suites /
425 tests; typecheck passes and lint retains zero errors / 20 baseline warnings.
Subsequent 001D and 002B changes passed their targeted gates; another integrated
wave check is required before accepting their complete stories. The 002B review
also hardened pagination coverage so empty drafts sort before real entries,
demonstrating that filtering occurs before LIMIT.

The next integrated run exposed an Expo virtual-environment parse error in the
calculator UI harness after Overview began importing the capability module.
MVP-001D-R1 fixes this in shared unit-test setup without mocking the capability
module or forcing a profile. Both profiles then passed 38 suites / 437 tests;
the organiser independently reran MVP before merging. Following 001C/004B
integration at `e03e6a7`, full and MVP each pass 40 suites / 449 tests, typecheck
passes, and lint remains zero errors / 20 baseline warnings.

MVP-004B initially used raw SQL CRUD and was returned for correction against the
DB access policy. The accepted implementation uses a synchronous Drizzle
transaction and real SQLite tests prove rollback after an AFTER UPDATE failure,
failed first insert recovery, deterministic legacy-row selection, nullable metadata
replacement, and same-connection call serialization. Cross-connection contention
and native gallery behavior are not established by these host tests.

The post-integration codebase-memory refresh was attempted in both fast and full
modes, but the service still reports the original 3,026 nodes and cannot find the
new capability symbols. Continue graph-first discovery and verify current source
directly where graph results are absent/stale. The existing graph artifact was
preserved; a successful tool response alone is not evidence of a fresh index.

### Next-ticket review notes

The organiser accepted the history documentation and notes source audit, then
froze two separate note contracts. MVP-005B adds
`updateWorkoutNote(workoutId, note): Promise<void>` using Drizzle, rejecting invalid
or absent IDs, preserving payload exactly and changing only `workouts.note`.
The day-page entry gains required `workoutId` and `workoutNote` fields from its
existing canonical workout join; entry `note` remains distinct. This narrow read
extension supports later history display without treating a date as identity.
MVP-005C owns only record-screen entry-note saving: reproduce pending-write races,
serialize/coalesce overlapping flushes, retain newer drafts and surface failures.
The organiser selects the existing `/edit-workout` route as the sole historical
workout/entry-note editor; a later separate display ticket will consume the frozen
read fields in history cards without changing search/filter semantics.

The [supplementary Android media review](testing/mvp-android-media-review.md)
passes populated MVP startup, set-note save/edit/clear and initial-note cold restart,
gallery replacement, fullscreen playback, stable media-row identity and unshared
managed-copy cleanup. All non-media database rows match after the test note is
cleared. It also exposes insufficient system-picker metadata (`50.mp4` differs
from the real gallery filename with no asset ID). This remains an open
metadata/restore design input; physical MVP-004R and release acceptance are not
closed. The isolated MVP Metro uses port 8082; the original 8081 server is preserved.

Integrated gate at `7ba1493`: full and MVP each pass 54 suites / 537 tests,
typecheck passes, and lint has zero errors / 20 existing warnings. The graph
refresh again reports the original 3,026 nodes / 6,918 edges; current-source
fallback remains necessary. No native/EAS build or remote CI run is implied.

After MVP-005B integration, at `e725a32`, both profiles pass 55 suites / 548 tests.
Typecheck passes and lint remains zero errors / 20 baseline warnings. Logs are
retained locally as `.codex-artifacts/mvp-notes-db-{full,mvp}-tests.log`.
All seven preserved-file hashes still match. MVP-005C's revised queue also needs
a regression proving an older queued snapshot cannot overwrite a newer draft
already saved by the first writer, plus route invalidation before deferred loading
finishes. These are review findings, not accepted behavior.

MVP-003E now reopens while both duplicate names exist, compares both IDs/UIDs and
their history/analytics/media, and exercises set edit/delete and exercise deletion
while names still match. The other exercise's complete API rows remain equal.
MVP-004D adds actual SQLite cascade/soft-link checks and direct managed-file
deletion guards, including shared references and gallery/sibling paths. Its
13-line production correction updates state only after repair persistence succeeds.
MVP-002D proves immediate open-entry PB/analytics/CSV inclusion and recalculation,
with existing formulas and completed-entry state retained. These accepted host
checks do not substitute for physical Android media or populated-upgrade release
verification; MVP-004R remains pending.

MVP-005B's reviewed setter changes only the canonical workout note and preserves
the supplied payload exactly; UI callers own whitespace normalization. Independent
checks passed 26 tests across the new real-SQLite note suite and existing history
read/status suites. The file-backed test preserves all three note levels after
close/reopen. Its ticket branch was retired after squash integration as `bbd325e`.
MVP-005C passed after four review iterations. Deferred tests reproduce newer text
typed while Complete awaits a save, stale entry creation, queued saves with no
entry, and an old queued snapshot overwriting a newer old-context save after
navigation. The last failing sequence was A → C → B; the accepted queue records
saved versions per captured context and leaves C durable. Route invalidation
precedes async hydration. Organiser execution passes 19 targeted UI/lifecycle/
capability tests; the worker's integrated suite passes 56 suites / 560 tests.
Native note navigation/restart acceptance remains MVP-005R.

MVP-005D2 adds distinct, untruncated workout/entry note displays to existing cards,
omits whitespace-only notes and preserves SetItem notes. IDs and existing filters
remain unchanged. Refresh/native presentation is included in the pending 005R
matrix. At `77c5f0b`, full and MVP each pass 57 suites / 562 tests; typecheck passes.
Logs are `.codex-artifacts/mvp-entry-history-notes-{full,mvp}-tests.log`.
MVP-005D1's revised `41499de` still needs navigation removal/hardware Back
protection, pending-save leave behavior and route round-trip guards before merge.

The current parallel queue contains exercise-note lifecycle corrections, the
canonical workout/entry-note editor, and restore design/proof. History note display
will use a separate ticket with disjoint history-screen ownership. MVP-006A follows
the plan's allowance for design work
and the merged identity/media contracts. Do not dispatch production restore or
its Settings integration until the ADR is reviewed and the organiser freezes its
interface. Paired original device backups remain read-only local evidence;
committed fixtures must be minimal deterministic reproductions, not raw user data.

At `267ce85`, full and MVP each passed 48 suites / 515 tests; typecheck passed and
lint retained zero errors / 20 existing warnings. Original preserved-file hashes
still had zero mismatches. Subsequent MVP-002B-R2 passed its independent specialist
audit with 22 targeted tests: timestamp precedence, local-day/DST grouping,
correlated counts, zero bounds, pagination and read-only behavior are accepted.
The partial-day summary-count limitation remains documented; no history backfill
or formula change was introduced. Ground truth now records the legacy fallback.

MVP-004D reproduced a cleanup defect after successful rediscovery: the DB stores
the recovered managed URI while `videoMedia` still stores the old missing URI, so
the next replacement cleans the wrong path. The organiser authorized only the
post-success repair/state seam in `app/set/[id].tsx`: publish the repaired row
fields after successful persistence and a current-request check; failed repairs
must retain the old persisted row. Keep the failing regression and verify its
before/after result. Rediscovery matching and picker transaction policy remain
outside this correction.

The next continuation reread the delivery and implementation rules, reconfirmed
`main` at `e5233bb`, and preserved the original dirty/untracked paths. MVP-004C
required additional review iterations before acceptance: canonical rediscovery
repairs remain persisted, cleanup errors after a successful link do not undo the
result, stale route callbacks cannot invalidate the next route's media load, and
failed link/unlink writes recover the stored attachment instead of leaving a
loading spinner. A deferred-read/failed-upsert regression was proved failing
before the recovery fix. The worker passed 35 focused tests; the organiser
independently passed 31 route/storage/lookup tests before integration.

MVP-003D adds actual-component tests with mocked native/database boundaries for
same-name creation, search, navigation, editing, deletion, variation guards and
pin/unpin. Existing production UI already uses IDs. These tests do not establish
database isolation; that is the separate real-SQLite MVP-003E ticket. MVP-004D
likewise checks actual deletion relationships and managed-file cleanup before the
later physical gallery review. No new device verification is claimed here.

The organiser reread plan sections 2-4 and 7-10 before this continuation, reconfirmed
`main` at `9a8ecc1`, and inspected all active worktrees before further mutations.
Original uncommitted/untracked paths remain excluded.

Integrated verification at `90554d9`: full and MVP each pass 42 suites / 456 tests;
typecheck passes, lint has zero errors and the same 20 baseline warnings. CI now
defines the two profile checks; no remote execution or native build is claimed.

After identity and migration integration at `d243673`, full and MVP each pass all
46 suites / 497 tests. Typecheck passes; lint remains zero errors / 20 baseline
warnings. These are host checks; Android populated-upgrade/fresh-install release
verification remains outstanding. Duplicate-exercise UI and cross-feature data
isolation fixtures remain 003D/003E before story acceptance.

- The second identity review found Settings' included Weight Unit action calls
  `syncBundledTemplateProgramsToUnit`, whose active-template path independently
  deletes/recreates pristine calendar rows. The runtime guard alone is insufficient.
  Any correction must check identity before program metadata or calendar writes,
  preserve unsafe programs unchanged, and retain ordinary unique-name unit sync.
  The organiser authorised a shared guard used by runtime refresh and
  `templateUnitSync.ts`; skipped programs must not be reported as successfully
  converted. No Settings UI or global unit-preference behavior is added to scope.
- The migration review identified a fifth real historical input: a database from
  `0923b8d` with `last_rest_seconds` and `is_pinned`, but no UID, jumping directly to
  the current bootstrap. Its appended order is parent, variation, then UID. The
  four-shape allowlist rejects this valid upgrade; it needs its own proven fixture
  and supported fingerprint before migration acceptance.
- Independent migration fault injection also showed `backfillUids` swallowing an
  exercise UID update failure and allowing the name-uniqueness rebuild to proceed
  with NULL UIDs. Exercise UID completion must be mandatory before the rebuild.
  The correction must prove visible failure, no destructive rebuild, and safe retry
  preserving assigned UIDs; prior compatibility ALTER/backfill work is outside the
  rebuild transaction and must not be described as wholly rolled back.
- MVP-004B-R1 supplies `getSetById(setId): Promise<SetRow | null>` using Drizzle.
  Invalid/nonexistent IDs return null, real rows retain all canonical values, and
  reads have no side effects. The set route can then display/edit notes without
  requiring an existing attachment. No new persistence path or dependency is needed.
- MVP-004C review rejected removal of successful rediscovery repair persistence:
  `upsertVideoForSet` is mandatory for picker add/replacement, while bounded
  `updateMedia` repair of the existing row remains valid. Preserve recovered metadata
  without inventing an album. The complete post-commit cleanup (reference lookup
  as well as file removal) must be isolated from attachment-save success. Deferred
  callbacks also need route/in-flight guards and regression tests so a prior set's
  note or picker result cannot overwrite the currently displayed set.

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
- MVP-004A initially failed review because add/cancel reused an unloaded callback
  and rediscovery did not deliberately return a valid empty scan. Terra's review
  repair now executes the loaded Edit/Change action, cancellation and no-match
  scan with explicit assertions. Those corrections are accepted in `c162637`.
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
- Integrate MVP-003C's identity safeguards before MVP-003B exposes nonunique names:
  current `rewriteCalendarExerciseReferences` matches exercise ID **or name**, so
  renaming/deleting one same-named variation could rewrite another exercise's
  retained program references. The organiser will include that exact helper in
  003C's bounded write scope. Explicit IDs must win; ambiguous name-only references
  must not be silently retargeted. Stored PSL/config name rewrites also need that
  audit. This protects retained data and does not redesign the Programs experience.
  The first 003C independent audit rejected `35e34d9`: real active-program refresh
  deletes/recreates pristine future rows from PSL, undoing ID-safe direct rewrites
  and resolving ambiguous names to another exercise. Mocked refresh/inactive
  fixtures missed this. Acceptance requires preserving explicit bindings through
  the real refresh boundary and regression coverage of active dated programs.
  The organiser approved a narrow extension to
  `lib/programs/psl/programRuntime.ts::refreshUpcomingCalendarForProgram` because
  ordinary set edits also call it. Before destructive rematerialization, prove
  that replacement occurrence/order mappings preserve every existing explicit
  exercise ID; otherwise retain the current calendar. Variation mutations also
  retain pre-mutation ambiguity checks. This safety guard requires a second
  independent review, including effects on intentional program-editor changes.
- MVP-001D owns `app/(tabs)/index.tsx` while removing the health entry and suppressing
  its snapshot query. MVP-002C's later Overview status rendering must wait for that
  ownership to be released; the history/day screens remain a separate UI scope.
  Ownership was released after `3a3a6c3`; 002C can now consume the Overview status.
- MVP-002B audit found a pre-existing legacy-date gap: a real-set entry with NULL
  `performed_at` has no usable local day. Current write APIs supply a date, but
  historical rows need explicit disposition before MVP-002 acceptance. This is an
  open follow-up, not a waiver of the all-real-sets inclusion contract. Date-only
  search also retains its existing partial-range count semantics; current UI uses
  whole-day bounds. Keep both findings visible in 002R.
  The organiser freezes MVP-002B-R2's effective read timestamp as
  `COALESCE(workout_exercises.performed_at, workout_exercises.completed_at, workouts.started_at)`,
  matching existing exercise-history sorting/display. Apply it consistently to all
  six broad helpers, including search subqueries, grouping, pagination and returned
  dates. Preserve zero timestamps and never write a fabricated date or completion.
  `getWorkoutExercisesForDate` and `resetWorkoutForDate` have no callers in the
  current app/components/lib source; their write semantics are outside this read
  correction. Ownership waits for the small 004B-R1 lookup ticket to release
  `workouts.ts`.
- The existing `.github/workflows/quality.yml` runs one default-profile job.
  Local full/MVP checks are passing, but a narrow follow-up must put both profiles
  into CI before release. Remote branch-protection configuration has not been
  verified in this execution; local reviewed integration is not evidence of
  server-side protections or a remote CI run. No commits have been pushed.

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

### Frozen MVP-003C compatibility boundary

`getExerciseByName` resolves an exact name to its lowest numeric exercise ID.
`listExercisesByNames` remains a compatibility resolver and returns one lowest-ID
row per trimmed, distinct exact name, ordered deterministically. Catalog and MVP
logging APIs retain all exercises and use IDs. Remove the global variation display
name collision check while retaining existing within-parent label and family rules.

Explicit IDs take precedence in calendar/config rewrites. Name fallback applies
only to references with no ID and only when the old name was unambiguous before
mutation. Ambiguous stored PSL names are left unchanged; a different explicit ID
is never changed because its display name happens to match. This requires the
bounded `rewriteCalendarExerciseReferences` scope extension recorded above.

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
