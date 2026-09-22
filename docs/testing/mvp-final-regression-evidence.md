# MVP-007 regression evidence map

Read-only organiser/Luna inventory at `be53dad94d693fb502678282ccc350e2e821e3d4`,
2026-09-22. This maps existing evidence for the final integrated check; it does
not claim completion of MVP-007 or replace the Android release matrix. iOS is
explicitly deferred by the user.

The final integrated host run at `ab281ef1646a1cedcbc23b7b01ee346042f29560`
now passes **86 suites / 1020 tests per profile**, TypeScript and prescribed
uncached lint (zero errors / 19 baseline warnings). A read-only Luna worker used
the clean detached integration worktree; the organiser inspected the results.
Logs are `.codex-artifacts/mvp007-integrated-{full,mvp,typecheck,lint}.log`.
This accepts the host portions of 007A/007C and retains the already accepted 007B
calculator evidence. Native 007D and release acceptance remain open; see the
[integrated Android checkpoint](replacement-restore-integrated-android.md).

| Requirement | Existing tests | Remaining integration evidence |
| --- | --- | --- |
| In-progress history, analytics, PB and CSV agree through create/edit/delete/completion | `__tests__/db/inProgressConsumers.test.ts`, `pbDerivation.test.ts` | Run on the final integrated source; no duplicate consumer implementation needed |
| Real history state, empty-draft exclusion, local dates and legacy timestamps | `__tests__/db/historyReadModel.test.ts`, `historyLegacyDates.test.ts`, `__tests__/app/history-status.test.tsx` | Android navigation/presentation checks |
| Durable and distinct workout, entry and set notes | `__tests__/db/workoutNotes.test.ts`, `__tests__/app/history-notes.test.tsx` and entry/set suites | Android refresh/restart interaction |
| One gallery video, safe replacement/removal and canonical set links | `__tests__/db/setVideoContract.test.ts`, `setMediaCleanup.test.ts`, `__tests__/app/set-media-cleanup.test.tsx`, `__tests__/lib/videoStorage.test.ts` | Gallery permissions, playback and restore rediscovery on Android |
| Valid sealed database export and filename/MIME behavior | `__tests__/backupExport.test.ts`, `__tests__/db/backupSnapshot.test.ts` | Actual SAF provider save/reopen |
| MVP blocks deferred program, health and camera routes while preserving core routes | `__tests__/routing/profile-route-guards.test.tsx`, `capabilityAccess.test.ts`, `__tests__/app/capability-entry-points.test.tsx` | Android route/back behavior and release-binary cold links |
| Programs remains Coming Soon in MVP and retains full behavior in development | `__tests__/app/programs-capability.test.tsx`, real-root route suite | Native tab position/presentation; synthetic ordinary-startup smoke already confirms the third tab |
| Five calculators and immutable release capabilities remain available | `__tests__/lib/calculators.test.ts`, `__tests__/app/calculators-ui.test.tsx`, `__tests__/config/releaseProfile.test.ts` | Final both-profile suites and compilation |

The consumer suites use real canonical `workouts`, `workout_exercises` and `sets`;
program/calendar tables are not a second history store. Media and backup coverage
is deliberately separate from the four-consumer mutation test. Their remaining
native integration obligations do not justify duplicating the accepted PB/history
tests into one oversized scenario.

MVP-006's lifecycle change requires explicit connection initialization in legacy
DB test fixtures. The approved fixture repair preserves real SQLite/Drizzle,
connection PRAGMAs, deliberate pre-migration shapes and every existing assertion.
Final profile evidence must reference the repaired integrated source.

Use the [restore evidence inventory](replacement-restore-evidence-inventory.md)
for the separate 006E/R obligations. Add tests only for a demonstrated uncovered
behavior; route/device evidence and physical Android acceptance remain distinct
from host test success.
