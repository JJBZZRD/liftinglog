# In-progress history acceptance

This note records the accepted MVP-002E history behavior and supersedes only the
old broad-history exclusion finding in the intentionally untracked local analysis
file `C:/Users/JJ/Documents/GitHub/WorkoutLog/docs/codebase-analysis-2026-06-21/high-severity-01-program-autosave-history.md`.
It does not claim a program autosave model redesign or a backup/restore replacement
has been completed.

## Accepted read-model rule

An exercise entry is visible in broad workout history when it has at least one
linked real `sets` row. A null `workout_exercises.completed_at` value makes the
entry In Progress and contributes to `inProgressCount`; it does not exclude the
entry. An empty `workout_exercises` draft is excluded before grouping and
pagination. Repeated exercise IDs and entries from multiple workout IDs remain
separate rows within their local calendar day.

The implementation is in [`lib/db/workouts.ts`](../../lib/db/workouts.ts):

- `listWorkoutDays()`
- `searchWorkoutDays()`
- `getWorkoutDayDetails()`
- `getWorkoutDayPage()`
- `getLastWorkoutDay()`
- `getQuickStats()`

These helpers use the same effective entry timestamp:
`COALESCE(workout_exercises.performed_at, workout_exercises.completed_at,
workouts.started_at)`. The fallback is read-only: it does not backfill null
timestamps, and an explicit `0` timestamp remains valid. The date-only search
count behavior for partial-day bounds remains the existing summary behavior; the
current UI supplies whole-day bounds and this acceptance does not expand that
contract.

## Traceable regression coverage

- [`__tests__/db/historyReadModel.test.ts`](../../__tests__/db/historyReadModel.test.ts)
  covers immediate visibility after the first real set, removal after the last set
  is deleted, completed/open summaries, status returned by details and day pages,
  empty-draft exclusion before the 27-entry limit, search intersections, repeated
  entries, and day/stat consumers.
- [`__tests__/db/historyLegacyDates.test.ts`](../../__tests__/db/historyLegacyDates.test.ts)
  covers the performed-at, completed-at, and workout-start fallback across grouping,
  search, bounds, paging, day counts, explicit epoch zero, and the read-only
  no-backfill guarantee.
- [`__tests__/db/inProgressConsumers.test.ts`](../../__tests__/db/inProgressConsumers.test.ts)
  covers the real database path for PBs, analytics, CSV export, exercise history,
  and empty-draft exclusion. The accepted regression proves an open entry with real
  sets reaches those consumers and remains editable/deletable through the normal
  set path.
- [`__tests__/db/manualLoggingLifecycle.test.ts`](../../__tests__/db/manualLoggingLifecycle.test.ts)
  covers draft exclusion, first-set visibility, concurrent open entries, completion
  isolation, same-exercise re-entry, and completion preservation while sets are
  edited or deleted.
- [`__tests__/app/history-status.test.tsx`](../../__tests__/app/history-status.test.tsx)
  covers the UI labels and counts for open entries on the history list, day details,
  day page, and Overview surfaces.

The targeted database tests run against the production `lib/db/workouts.ts` path
through a Node-host SQLite adapter. The app test uses UI and native-boundary mocks.
These tests are host regression evidence; they do not replace Expo/device proof
for native navigation, date pickers, SQLite runtime behavior, or other device-only
surfaces.

## Scope and limits

This documentation reconciles the current history lifecycle and supersedes the
single old finding that broad history excluded incomplete entries. It does not
redesign program autosave, change program-calendar ownership, alter backup/import,
or establish stronger device-level guarantees. The database architecture and
durability rules remain those in
[`docs/database-ground-truth.md`](../database-ground-truth.md).
