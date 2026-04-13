# Exercise Variations - 2026-04-13

## Overview

This change adds managed exercise variations as first-class child rows in `exercises` and wires them through exercise history, analytics, workout history, and program selection without introducing a second workout-history system.

## What Changed

### Database and DB access

- Added `exercises.parent_exercise_id` and `exercises.variation_label`.
- Added the `idx_exercises_parent_exercise_id` index.
- Added variation lifecycle helpers in `lib/db/exercises.ts`:
  - `createExerciseVariation`
  - `renameExerciseVariation`
  - `deleteExerciseVariation`
  - family/group lookup helpers for parent rollups
- Added calendar/program rewrite support so variation rename/delete updates:
  - stored PSL source
  - live `program_calendar_exercises`
  - percent-intensity config references
- Kept logged history authoritative in `workouts`, `workout_exercises`, and `sets`.

### Query-time rollups

- Parent exercise history and analytics now aggregate the parent row plus all child variations at read time.
- Variation exercise screens stay concrete and only show that variation's own sessions.
- Workout history and workout-day data now preserve the concrete logged exercise metadata so variation sessions can be labeled as variations in parent views.

### UI

- `app/(tabs)/exercises.tsx` now renders grouped parent cards with expandable variation rows.
- The existing long-press action modal now includes a `Variations` action.
- Added a dedicated variations manager modal for add, rename, and delete flows.
- Variation exercise headers and workout-history surfaces use a shared variation-aware label renderer so the suffix can be visually distinguished from the base exercise name.
- Program exercise selection now uses the same grouped parent/variation model and returns the concrete selected exercise row.

## Impact

- Parent exercise delete and rename are intentionally guarded while managed child variations exist.
- Variation delete supports:
  - keeping logged data under the parent exercise
  - deleting the variation's logged data entirely
- Future program references are rewritten to valid exercise rows during variation rename/delete so deleted variation names are not recreated by active programs.

## Verification

- `npm.cmd run lint -- --no-cache`
- `npm.cmd run test -- --runInBand`
