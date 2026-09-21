# Manual logging lifecycle characterization

`__tests__/db/manualLoggingLifecycle.test.ts` exercises the production
`lib/db/workouts.ts` API through Drizzle against Node 22's in-memory SQLite. The
adapter in `__tests__/helpers/manualLoggingDatabase.ts` only implements the Expo
SQLite synchronous boundary required by Drizzle; it does not mock workout or set
operations.

The characterization confirms the current manual lifecycle:

- An empty `workout_exercises` draft can be resumed, but is excluded from
  `listInProgressExercises()` and `getExerciseHistory()`.
- The first linked real `sets` row immediately makes an open entry visible in
  both the in-progress list and exercise-specific history.
- Two exercises can remain open in one active workout and both are found again
  after switching away and reopening. A separate file-backed test closes the
  SQLite connection, reboots the production connection/bootstrap module, and
  verifies both open entries, their real sets, and independent completion state.
- Completing one entry closes only that entry. A completed entry is not returned
  by `getOpenWorkoutExercise()`, so the normal flow creates a separate entry for
  the next selection of the same exercise.
- Updating a set or deleting one of several sets under a completed entry leaves
  its completion timestamp intact.

`__tests__/app/manual-logging-lifecycle.test.tsx` renders the actual
`UnifiedRecordTab` and drives its Add Set handler. Its navigation, native UI, and
database boundaries are mocked because Jest runs without an Expo device runtime.
With the system clock moved across midnight, the handler still passes the
component's original selected date to `addSet()` when the screen remains mounted.

The same test file has an explicit expected-failure characterization for a
different restart path: an existing open entry with confirmed sets from the prior
day is returned by the database, then `UnifiedRecordTab` is mounted after
midnight. Its next set is currently assigned the new day's selected date instead
of the stored entry date. The test is intentionally failing because this violates
MVP product facts section 4; no production fix is included in MVP-002A.

## Known characterization limits

The UI test does not cover native date-picker interaction or real navigation
transitions. Those need an Expo/device integration environment. The file-backed
SQLite test covers connection shutdown/reopen through the same production
connection/bootstrap boundary used by the app.

## Existing defect outside MVP-002A

`getExerciseHistory()` already includes an in-progress entry when it has a real
linked set. Broad workout-day history still filters for completed exercise entries
(`workout_exercises.completed_at IS NOT NULL`), which conflicts with MVP product
facts section 5.1. That query change belongs to MVP-002B and is intentionally not
implemented or hidden by these tests.
