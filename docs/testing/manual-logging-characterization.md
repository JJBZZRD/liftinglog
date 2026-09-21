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

When an existing open entry with confirmed sets from the prior day is returned
after midnight, `UnifiedRecordTab` restores the entry's stored date before the
next set is added. The same regression coverage verifies that a subsequent
explicit date-picker selection remains selected through the focus reload and is
used for the next set.

## Known characterization limits

The UI test does not cover native date-picker interaction or real navigation
transitions. Those need an Expo/device integration environment. The file-backed
SQLite test covers connection shutdown/reopen through the same production
connection/bootstrap boundary used by the app.

## Broad history disposition

The broad workout-history read model now follows the same real-history rule as
exercise history: an entry is included when it has at least one linked real row in
`sets`. `workout_exercises.completed_at` controls the displayed lifecycle status,
not inclusion. Empty drafts remain excluded. See
[`in-progress-history-acceptance.md`](./in-progress-history-acceptance.md) for the
source and regression-test trace.
