# Database Ground Truth

This document is the authoritative reference for how workout history, sets, and programs are stored in the database and how data is expected to flow through the app.

If code changes contradict this document, either the code is wrong or this document must be deliberately updated in the same change.

## 1. Scope

This document covers the behavior of:

- `lib/db/schema.ts`
- `lib/db/connection.ts`
- `lib/db/workouts.ts`
- `lib/db/programCalendar.ts`
- `lib/programs/programExerciseHistory.ts`
- `app/exercise/tabs/RecordTab.tsx`
- `app/exercise/tabs/HistoryTab.tsx`
- `app/workout-history.tsx`
- `app/programs/exercise-log/[id].tsx`
- `lib/db/pbEvents.ts`
- `lib/utils/analytics.ts`
- `lib/utils/exportCsv.ts`
- `lib/db/backup.ts`

## 2. System Model

The app has one real workout-history system and one program-planning system.

The real workout-history system is:

- `workouts`
- `workout_exercises`
- `sets`

The program-planning system is:

- `psl_programs`
- `program_calendar`
- `program_calendar_exercises`
- `program_calendar_sets`

Programs are allowed to mirror, stage, and link into logged history, but they must not become a separate permanent store for completed training history.

## 3. Relationship Map

```text
exercises
  <- exercises.parent_exercise_id (nullable self-reference for variations)
  <- workout_exercises.exercise_id
  <- sets.exercise_id
  <- program_calendar_exercises.exercise_id (nullable)

workouts
  <- workout_exercises.workout_id
  <- sets.workout_id
  <- media.workout_id (nullable)

workout_exercises
  -> workouts
  -> exercises
  <- sets.workout_exercise_id (nullable FK)
  <- program_calendar_exercises.workout_exercise_id (soft link only)

sets
  -> workouts
  -> exercises
  -> workout_exercises (nullable FK)
  <- pr_events.set_id
  <- media.set_id
  <- program_calendar_sets.set_id (nullable FK)

psl_programs
  <- program_calendar.program_id

program_calendar
  -> psl_programs
  <- program_calendar_exercises.calendar_id

program_calendar_exercises
  -> program_calendar
  -> exercises (nullable)
  -> workout_exercises via workout_exercise_id (soft link, not DB-enforced)
  <- program_calendar_sets.calendar_exercise_id

program_calendar_sets
  -> program_calendar_exercises
  -> sets via set_id (nullable FK)
```

## 4. Table Roles

### `exercises`

Canonical exercise catalog.

- One row per concrete exercise entry.
- Parent exercises use `parent_exercise_id = NULL` and `variation_label = NULL`.
- Managed variations are child `exercises` rows with `parent_exercise_id = <parent id>` and `variation_label = <label>`.
- Variation rows keep their concrete display name in `name`, for example `Bench Press (Larson)`.
- Referenced by both manual logging and program logging.
- Programmed exercises may start as name-only rows in `program_calendar_exercises`; they are linked to a real `exercises.id` later when logging resolves the exercise.

Exercise-family consequences:

- Logging a variation still writes a normal concrete `exercise_id` into `workout_exercises` and `sets`.
- Parent exercise history and analytics are family rollups done at query time over the parent row plus all child variation rows.
- Variation screens remain concrete and show only rows logged against that variation's own `exercise_id`.

### `workouts`

Top-level workout container.

- Represents a workout session envelope.
- Can contain many `workout_exercises`.
- Can also be referenced directly by `sets`.
- `started_at` is always present.
- `completed_at` exists, but many user-facing history features key more strongly off `workout_exercises.performed_at` and `workout_exercises.completed_at`.

### `workout_exercises`

Canonical per-exercise session row inside a workout.

- This is the parent row for a logged exercise session.
- One workout can contain multiple exercise entries.
- One exercise can appear more than once across workouts and even within a workout.
- `current_weight` and `current_reps` are draft/current-input helpers, not history.
- `completed_at` is the semantic "exercise entry finished" flag.
- `performed_at` is the timestamp most history views use for date grouping and ordering.

### `sets`

Canonical set history table.

- This is the authoritative storage for logged set performance.
- If a set should count for history, analytics, export, PBs, or media attachment, it must exist here.
- Each row belongs to a `workout_id` and an `exercise_id`.
- New logging code should also set `workout_exercise_id` for all real logged sets.
- `workout_exercise_id` is nullable for legacy/backward-compatibility reasons, but null should be treated as old or incomplete data, not the target design.

### `pr_events`

Derived table from `sets`.

- PB data is not independently authored.
- It is rebuilt when sets are inserted, updated, or deleted.
- If a performance does not exist in `sets`, it cannot produce correct PB behavior.

### `media`

Optional attachments.

- Media can link to a `set_id` and/or `workout_id`.
- Deleting a set cascades to set-linked media.
- Any future design that bypasses `sets` breaks the cleanest media association path.

### `psl_programs`

Program definition table.

- Stores raw PSL source and metadata.
- This is not workout history.
- `is_active`, `start_date`, and `end_date` describe activation state, not logged completion.

### `program_calendar`

Materialized scheduled sessions for active programs.

- One row per scheduled session/date.
- Child of `psl_programs`.
- `status` is schedule status, not workout-history truth.
- No direct `workout_id` exists here.

### `program_calendar_exercises`

Materialized scheduled exercises inside a scheduled session.

- Stores the scheduled exercise order and a JSON snapshot of the prescription.
- `exercise_name` is the original program-side name.
- `exercise_id` is nullable and points to the real `exercises` row once resolved.
- `workout_exercise_id` is nullable and links to the real logged exercise row.
- `workout_exercise_id` is a soft link only. SQLite does not enforce it as a foreign key.

### `program_calendar_sets`

Materialized prescribed/program-side sets.

- Stores prescribed reps/intensity/role.
- Also stores actual values entered while logging the program.
- `is_user_added` distinguishes extra user-added sets from prescribed sets.
- `is_logged` is program-side logging state.
- `set_id` is the link to the real `sets` row in the main history system.

## 5. Hard Rules and Invariants

These rules are mandatory.

### Main history rules

1. Logged training history is authoritative only when it exists in `workouts`, `workout_exercises`, and `sets`.
2. `program_calendar*` tables may cache or mirror logging state, but they are not allowed to replace the main history tables.
3. A set that should appear in workout history, exercise history, analytics, export, or PB logic must be inserted into `sets`.
4. New logged sets should carry `workout_id`, `exercise_id`, and `workout_exercise_id`.
5. A `workout_exercise` with real sets but no meaningful completion state behaves like an in-progress session and can surface as backlog.

### Program-link rules

6. `program_calendar_exercises.workout_exercise_id` must be maintained explicitly in application code because the DB does not enforce it.
7. `program_calendar_sets.set_id` is the canonical bridge from a prescribed/program set to the real `sets` row.
8. If a real set is updated or deleted, the linked `program_calendar_sets` row must be synchronized.
9. If a real `workout_exercise` is deleted, linked `program_calendar_exercises.workout_exercise_id` values must be cleared.
10. Program completion status must not drift from real set linkage.

### UI/history rules

11. Broad workout history is based on completed `workout_exercises`, not on `program_calendar` statuses.
12. Exercise history is built from `workout_exercises` plus real `sets`, not from `program_calendar_sets`.
13. Parent exercise history and analytics are read-time family rollups across the parent exercise plus all of its variation children.
14. Variation exercise history and analytics are concrete-only and must not silently roll back up to the parent row when a variation screen is selected.
15. Workout-day and workout-history views should surface the concrete logged exercise row so variation sessions remain visible as variations.
16. Program UI completion and history visibility are related but not identical concepts.
17. A program can be "scheduled" or "complete" on the calendar side without that alone being enough for workout history.

### Exercise-family lifecycle rules

18. Renaming or deleting a variation must not create a second persistence path. Logged history continues to live in `workouts`, `workout_exercises`, and `sets`.
19. Deleting a variation with "keep data" remaps existing `workout_exercises.exercise_id` and `sets.exercise_id` rows to the parent exercise before the child exercise row is removed.
20. Deleting a variation with "delete data" removes the child row's logged history through the normal history-delete path.
21. Parent exercise deletion is blocked while child variations exist.
22. Parent exercise renaming is blocked while child variations exist.
23. Program references must be rewritten on variation rename/delete so stored PSL source, live `program_calendar_exercises`, and percent-intensity config do not point at stale variation names or ids.

### Durability rules

24. `program_calendar*` rows are materialized schedule rows and can be deleted/rebuilt when a program is rescheduled or reactivated.
25. Because of that, durable logged history must live in the main history tables, not only in `program_calendar*`.
26. Backup/import merges the durable history tables plus `media` and standalone durable user-data tables such as `user_checkins`, then rebuilds `pr_events` from the merged `sets`. Program tables are not merged.

## 6. Foreign Keys vs Soft Links

### Real foreign keys

- `workout_exercises.workout_id -> workouts.id`
- `workout_exercises.exercise_id -> exercises.id`
- `sets.workout_id -> workouts.id`
- `sets.exercise_id -> exercises.id`
- `sets.workout_exercise_id -> workout_exercises.id`
- `program_calendar.program_id -> psl_programs.id`
- `program_calendar_exercises.calendar_id -> program_calendar.id`
- `program_calendar_exercises.exercise_id -> exercises.id`
- `program_calendar_sets.calendar_exercise_id -> program_calendar_exercises.id`
- `program_calendar_sets.set_id -> sets.id`
- `pr_events.set_id -> sets.id`
- `media.set_id -> sets.id`
- `media.workout_id -> workouts.id`

### Soft link only

- `program_calendar_exercises.workout_exercise_id -> workout_exercises.id`

Implication:

- deleting a `workout_exercise` does not automatically clear `program_calendar_exercises.workout_exercise_id`
- application code must clear this link explicitly
- future migrations must account for existing stale soft links

## 7. Canonical Data Flows

### A. Manual logging via `RecordTab`

This is the normal non-program logging flow.

1. `RecordTab` calls `getOrCreateActiveWorkout()`.
2. It tries `getOpenWorkoutExercise(activeWorkoutId, exerciseId)`.
3. If an open row exists, it reuses it.
4. Otherwise it creates a new `workout_exercise`.
5. Each confirmed set is written directly into `sets` with `workout_id`, `exercise_id`, and `workout_exercise_id`.
6. PB events are rebuilt from the real set data.
7. When the user presses Complete, `completeExerciseEntry(workoutExerciseId, performedAt)` sets `completed_at` and `performed_at` on the `workout_exercise`.
8. Only then is the session unambiguously complete in the main history model.

Important consequence:

- open `workout_exercises` are backlog/in-progress state
- completed `workout_exercises` are history state

### B. Manual set edit/delete

When a real set is changed through `lib/db/workouts.ts`:

1. `updateSet()` updates the `sets` row.
2. `syncLinkedProgramSetsByWorkoutSetIds()` mirrors the change back into linked `program_calendar_sets`.
3. PB events are rebuilt if needed.

When a real set is deleted:

1. `deleteSet()` clears the linked `program_calendar_sets` state via `clearLinkedProgramSetsByWorkoutSetIds()`.
2. The real `sets` row is deleted.
3. PB events are rebuilt.
4. Empty completed `workout_exercises` may be removed.

### C. Workout day history

The broad workout history page does not read program tables.

It is built from:

- completed `workout_exercises`
- linked `sets`
- timestamps on `workout_exercises.performed_at`

Current rule:

- if `workout_exercises.completed_at` is null, the session is treated as in progress and is excluded from the main workout-history day listing

### D. Exercise history

The exercise history tab does not use `program_calendar_sets` directly.

It works by:

1. loading all `workout_exercises` for the exercise
2. loading all real `sets` for the exercise
3. grouping those sets by `sets.workout_exercise_id`
4. only returning entries that actually have real sets

Current implication:

- partial or staged program-side data that never materializes into `sets` is invisible here
- old sets with null `workout_exercise_id` are tolerated by some analytics paths, but they are not the target design

### E. Program definition and activation

Program storage is a two-step model.

1. `psl_programs` stores the raw PSL definition and metadata.
2. Activation/materialization writes dated schedule rows into:
   - `program_calendar`
   - `program_calendar_exercises`
   - `program_calendar_sets`

Important rule:

- this materialized calendar is schedule data, not the final log of completed training

### F. Program exercise logging

Program logging must bridge into the main history tables.

Current canonical bridge:

- `persistProgramSetToWorkoutHistory()` in `lib/programs/programExerciseHistory.ts`
- `persistCompletedProgramExercise()` in the same file

Current behavior for each complete programmed set:

1. Refresh the latest `program_calendar_set` row from the DB.
2. Resolve weight/reps from UI input.
3. If the set is incomplete, do not create a real `sets` row.
4. Resolve or create the real `exercises` row.
5. Link `program_calendar_exercises.exercise_id` to that exercise.
6. Resolve or create the linked real `workout_exercise`.
7. If the program exercise already has a linked real set, update that `sets` row.
8. Otherwise create a new real `sets` row.
9. Write the real set ID back into `program_calendar_sets.set_id`.
10. Mirror actual weight/reps into `program_calendar_sets.actual_*`.
11. Mark `program_calendar_sets.is_logged = true`.
12. Complete the linked `workout_exercise` immediately.

That last rule is intentional.

Why:

- leaving a real program-linked `workout_exercise` open caused `RecordTab` backlog/in-progress pollution
- completing it immediately keeps the main history model coherent even before the user presses the program screen's final Complete button

### G. Variation logging and program rewrites

1. Selecting a variation in the exercise library or program picker resolves to the child `exercises.id`.
2. Recording sets for that variation writes the concrete child `exercise_id` into both `workout_exercises` and `sets`.
3. Parent exercise history and analytics query the full family scope at read time; no alternate family-history table exists.
4. Variation history and analytics query only the selected child row.
5. On variation rename, stored PSL source, live `program_calendar_exercises`, and percent-intensity config must be rewritten to the new concrete variation name before active calendars are refreshed.
6. On variation delete, future program references are rewritten to the parent exercise in both delete modes; the delete mode only changes what happens to already logged history rows.

### H. Program UI draft vs real history

The program screen can hold three states for a set:

1. No input: nothing is logged anywhere.
2. Partial input: values may live only in `program_calendar_sets.actual_*`; no real `sets` row is created.
3. Complete input: a real `sets` row is created or updated and linked through `program_calendar_sets.set_id`.

Implication:

- `program_calendar_sets.actual_*` can contain draft or mirrored values
- `sets` is still the only durable real-history table for performance data

### H. Final program completion button

The final Complete action on the program exercise screen no longer acts as the only moment where history is created.

Its current role is:

- ensure all complete program-side sets are persisted into the real history tables
- fail visibly if nothing complete was logged
- sync calendar statuses and return to the previous screen

It should not silently mark a programmed exercise complete without successful persistence.

### I. Startup repair

`lib/db/connection.ts` contains a repair query that closes old open program-linked `workout_exercises` when they already have real sets.

This exists because older behavior could create real program-linked sets under open `workout_exercises`, which made them appear as backlog instead of history.

Rule:

- if future migrations change program-history linkage, keep a repair/backfill story for previously-bad rows

## 8. Downstream Consumers

### PB events

- Derived from `sets`
- Rebuilt on set create, update, and delete
- Any alternate store for logged sets breaks PB correctness

### Analytics

- Built primarily from `sets` and `workout_exercises`
- Some code contains legacy fallback logic for rows with null `workout_exercise_id`
- That fallback is compatibility logic, not the desired future state

### CSV export

- Export reads from real `sets` and joins back to exercises/workout rows
- Program-only rows do not export as training history

### Media

- Media can attach to a set or workout
- Real set rows are the cleanest way to anchor set-level video/media

### Backup/import

Backup export should produce a current whole-database snapshot by checkpointing SQLite WAL state and copying the app database file.

Current import merge order is:

1. `exercises`
2. `workouts`
3. `workout_exercises`
4. `sets`
5. `media`
6. rebuild `pr_events` from merged `sets`

Program tables are not part of this merge.

Implication:

- durable logged training data must not depend on `program_calendar*`
- durable video/media linkage can survive backup/import only if it remains anchored to real `sets`/`workouts` and enough metadata exists to re-discover gallery assets
- if program provenance ever needs to survive backup/import, that provenance must also exist in the durable side of the model

## 9. Deletion and Cleanup Rules

When deleting real history:

- deleting a `set` must clear linked `program_calendar_sets.set_id` and reset program-side actuals/logged state
- deleting a `workout_exercise` must clear linked `program_calendar_exercises.workout_exercise_id`
- deleting all sets for a `workout_exercise` may require deleting the now-empty completed `workout_exercise`

When deleting program-side rows:

- deleting a user-added `program_calendar_set` must also delete the linked real `sets` row first if one exists
- deleting or rebuilding `program_calendar*` rows does not delete the durable logged history rows unless application code explicitly does so

## 10. Known Architectural Constraints

These are real constraints in the current codebase.

1. `program_calendar_exercises.workout_exercise_id` is soft-linked, not FK-enforced.
2. `program_calendar` has no `workout_id`, so scheduled-session-to-workout mapping is indirect.
3. `program_calendar*` rows can be deleted and rebuilt when program schedules are edited or reactivated.
4. Program-side status (`pending`, `partial`, `complete`, `missed`) is not a substitute for real workout-history truth.
5. Compatibility code still exists for older `sets` rows with null `workout_exercise_id`.

## 11. Rules for Future Changes

If you are changing persistence or adding new features, follow these rules.

### Always do this

- Write real logged sets into `sets`.
- Ensure real logged sets point at the correct `workout_exercise_id`.
- Keep `program_calendar_sets.set_id` synchronized with the real set row.
- Keep `program_calendar_exercises.workout_exercise_id` synchronized manually.
- Update PB, analytics, export, and delete flows when set persistence changes.
- Add repair logic if a migration can leave old rows in an invalid mixed state.

### Do not do this

- Do not build a second permanent logging system in `program_calendar_sets`.
- Do not treat `program_calendar.status` or `program_calendar_sets.is_logged` as enough for workout history.
- Do not insert real performance data only into program tables and expect history screens to infer it.
- Do not rely on `workouts.completed_at` alone for per-exercise history visibility.
- Do not forget backup/import implications when introducing new durable relationships.

## 12. Quick Decision Rules

Use these when reasoning about bugs.

- If data should appear in workout history and does not, first check whether there is a real `workout_exercise` with `completed_at` set and real linked rows in `sets`.
- If data should appear in exercise history and does not, first check whether real `sets` exist and whether they point to the expected `workout_exercise_id`.
- If a program exercise looks complete in the program UI but not in history, check whether the program side was updated without creating/updating the real `sets` row.
- If `RecordTab` shows unexpected backlog, check for open `workout_exercises` with program-linked sets.
- If PBs or analytics are wrong, verify the corresponding real `sets` rows before inspecting the derived tables.

## 13. One-Sentence Ground Truth

The backend must treat `workouts` + `workout_exercises` + `sets` as the only authoritative store of logged training history, while `psl_programs` + `program_calendar*` remain program-definition and schedule/mirror tables that must synchronize into, but never replace, the main history model.
