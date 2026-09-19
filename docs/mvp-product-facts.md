# WorkoutLog MVP Product Facts

Status: Product decisions agreed on 2026-09-19 and grounded against the current codebase.

This document defines the product boundary and required behavior for the first
releasable MVP. It distinguishes intended behavior from current implementation so
that existing code is not mistaken for the product specification.

For MVP product scope and UX, this document takes precedence over older assumptions
in analysis documents. `docs/database-ground-truth.md` remains authoritative for the
current persistence architecture, but its history-visibility rules must be updated
alongside the MVP implementation where this document deliberately changes them.

## 1. MVP Product Promise

The MVP lets a user:

1. Create exercises.
2. Log several exercises concurrently.
3. Preserve and resume in-progress exercise entries.
4. Review completed and in-progress training history.
5. See existing progress visualisations and personal bests.
6. Use the existing offline lifting calculators.
7. Attach one gallery video to a set and view it in the app.
8. Export and restore a rigorous local backup.

The core product promise is:

> Log training quickly, preserve an accurate history, and make progress visible.

## 2. MVP Terminology

The UI and implementation should use these concepts consistently:

- **Workout:** A session envelope identified by `workouts.id`. A date is an
  attribute or grouping dimension, not the workout's identity.
- **Exercise entry:** One performance instance of an exercise inside a workout,
  represented by `workout_exercises.id`.
- **Set:** One logged weight-and-reps performance, represented by `sets.id`.
- **In progress:** An exercise entry with at least one real set and no
  `workout_exercises.completed_at` value.
- **Completed:** An exercise entry whose `completed_at` value was set by the user
  pressing Complete Exercise.

"Completed" is a lifecycle status, not an immutability rule. Completed entries and
their sets remain editable and deletable.

## 3. Exercise Logging Lifecycle

### 3.1 Concurrent logging

- Several different exercises may be in progress at the same time.
- The user can move between those exercises in any order.
- Closing the app must not discard in-progress exercise entries or their logged
  sets.
- Returning to an exercise with an unfinished entry resumes that entry.

### 3.2 Creation and visibility

- Merely opening an exercise is not logged training.
- The first confirmed set makes the exercise entry meaningfully in progress.
- An internal empty `workout_exercises` row may exist as draft state, but it must
  not appear in history or the in-progress UI until it has a real set.
- An exercise cannot be completed without at least one confirmed set.
- MVP set logging is weight and reps. Duration, distance, and other logging modes
  are deferred.

### 3.3 Completion

- Complete Exercise closes only the current exercise entry.
- Completion does not close other exercises that are in progress.
- Completion sets `workout_exercises.completed_at` and leaves the real sets intact.
- Editing or deleting sets on a completed exercise does not reopen it.
- Adding or changing historical data on a completed exercise does not automatically
  clear its completed status.

### 3.4 Selecting the same exercise again

- If an unfinished entry exists for that exercise in the active workout, selecting
  the exercise resumes it.
- A completed entry is never resumed by the normal logging flow.
- Selecting that exercise after its previous entry was completed creates a new
  in-progress exercise entry when the first new set is logged.
- A workout may therefore contain multiple separate entries for the same exercise.

## 4. Dates and Workout Sessions

- For the MVP, the main history UX remains grouped into local calendar days.
- The user may choose another calendar date and log an exercise against that date.
- An exercise that is already in progress at midnight stays attached to the date on
  which it began.
- The MVP does not need UI for naming or selecting several distinct workouts on the
  same day.
- The data model and new queries must not assume that a date uniquely identifies a
  workout. A later release must be able to create, select, and display multiple
  `workouts` on one date.

## 5. History, Analytics, and Personal Bests

### 5.1 Real-time history

- A confirmed set is real training history immediately. It must be written to
  `sets` while its exercise entry may still be in progress.
- Both broad workout history and exercise-specific history must include in-progress
  exercise entries that have real sets.
- In-progress entries must be visibly labelled In Progress.
- Existing history filtering and date-range behavior should otherwise remain as it
  is for the MVP.

### 5.2 Visualisations

- Keep the existing visualisations and their current definitions.
- Do not add new charts or metrics for the MVP.
- Visualisations that consume real sets should include valid in-progress sets in the
  same way they include completed sets.

### 5.3 Personal bests

- Keep the existing PB definitions.
- PB calculation happens as soon as a valid set is logged, including while its
  exercise entry is in progress.
- Updating or deleting a set must rebuild PB state.
- A PB may therefore disappear or change when the set that produced it is edited or
  deleted.

## 6. Exercises and Identity

- Exercise creation is part of the MVP.
- Every exercise is identified by its stable unique ID.
- Display names are not identity and do not need to be unique.
- A user may deliberately create two exercises with the same display name.
- Workout entries and sets must continue to reference exercise IDs, not infer
  identity from names.

## 7. Notes

The MVP supports notes at all three logging levels:

- Workout note on `workouts`.
- Exercise-entry note on `workout_exercises`.
- Set note on `sets`.

Notes follow the lifecycle of the row they belong to and must survive backup and
restore.

## 8. Calculators

All calculators currently present in the catalog remain in the MVP:

- 1RM Toolkit
- Powerlifting Total
- Power Score
- Sinclair
- Plate Loader

They remain offline. Sending calculator results directly into a workout is deferred.

## 9. Set Video Attachments

- A set may have one user-facing video attachment in the MVP.
- The user can select a video from the device gallery.
- The user can view the linked video from the app.
- Selecting a replacement updates the existing set attachment rather than creating
  a second user-facing attachment.
- In-app video recording is excluded from the MVP and its entry points must be
  unavailable.
- Deleting a set must continue to remove its set-media relationship.

## 10. Offline Backup and Restore

- The MVP remains local and offline. Account creation and cloud sync are not
  required.
- Export produces a current, valid database snapshot.
- Video binaries are not embedded in the MVP backup. The backup contains the media
  links and reconciliation metadata stored in the `media` rows.
- Restore replaces the current application data rather than merging it.
- Restore must attempt to rediscover gallery videos using durable identifiers and
  metadata such as asset ID, filename, media creation time, duration, and album.
- A missing video must not invalidate the workout, exercise entry, or set that
  referenced it.
- Importing data from other fitness applications is post-MVP work.

Because gallery files can be deleted, moved, or made inaccessible by the operating
system, link-only backup cannot guarantee that every video is recoverable. The
restore flow must treat reconciliation failure as an unresolved attachment, not as
loss of the underlying training record.

## 11. Feature Segmentation

The project remains one codebase. Deferred features are retained in source control
and excluded through a centralized MVP capability profile.

The capability boundary must cover navigation, direct routes, deep links, and
feature-specific background or bootstrap behavior. Hiding a button alone is not a
sufficient boundary.

### Included and accessible

- Exercise catalog and custom exercise creation
- Manual exercise and set logging
- In-progress and completed history
- Existing history filters
- Existing analytics and visualisations
- Existing PB behavior
- Existing calculators
- Gallery video attachment and playback
- Database backup and replacement restore
- Settings required by those features

### Visible placeholder

- Programs remains in the main tab bar.
- In the MVP profile, the Programs tab displays a Coming Soon screen.
- Program creation, scheduling, and program logging routes are not accessible from
  the MVP profile.

### Excluded but retained in the codebase

- Program authoring, scheduling, activation, and logging
- Health metrics and user check-ins
- In-app video recording
- Imports from third-party fitness applications
- Multiple named or selectable workouts on the same day
- Additional set types such as duration and distance
- Sending calculator results into a workout

## 12. Codebase-Grounded Current State

The following observations were verified against the codebase-memory graph and
targeted source reads on 2026-09-19.

| Area | Current implementation evidence | MVP status |
| --- | --- | --- |
| Resume unfinished exercise | `getOpenWorkoutExercise()` selects the latest row for a workout and exercise where `completedAt` is null. `UnifiedRecordTab` uses it before creating another entry. | Aligned |
| New entry after completion | Completed rows do not match `getOpenWorkoutExercise()`, so the normal logging flow creates another `workout_exercises` row. | Aligned |
| Completion validation | `handleCompleteManualExercise()` returns without completing when there are no confirmed sets. | Aligned |
| Completed edits stay completed | `updateSet()` changes set fields and rebuilds PBs but does not clear the parent `workout_exercises.completedAt`. | Aligned |
| Exercise history | `getExerciseHistory()` does not filter by completion and only emits entries that have real linked sets. `HistoryTab` renders an In Progress badge. | Aligned |
| In-progress overlay | `listInProgressExercises()` selects open entries and inner-joins `sets`, excluding empty draft rows. | Aligned |
| Broad workout history | `listWorkoutDays()` and related day-history queries filter on `workout_exercises.completed_at IS NOT NULL`. | Required change: include real in-progress entries |
| Immediate PB calculation | `addSet()`, `updateSet()`, and `deleteSet()` rebuild PB events. `rebuildPBEventsForExercise()` reads sets without requiring a completed parent entry. | Aligned |
| Notes storage | The schema has `note` columns on `workouts`, `workout_exercises`, and `sets`; update functions exist for exercise-entry and set notes. | Storage aligned; UX must be acceptance-tested |
| Multiple workouts per date | `workouts` uses an ID and has no unique date constraint. | Data model aligned |
| Current active workout | `getOrCreateActiveWorkout()` reuses one globally active unfinished workout. | Acceptable for MVP; later UI/service change needed for multiple same-day workouts |
| Duplicate exercise names | `exercises.name` is currently declared `.unique()`. `createExercise()` creates a unique row ID but does not provide duplicate-name identity semantics. | Required schema and UX change |
| Calculators | `CALCULATORS` contains the five calculators listed in section 8 and the calculator screen renders the catalog. | Aligned |
| Gallery video selection | `SetInfoScreen` uses a video-only gallery picker with multiple selection disabled and updates an existing media row when replacing a video. | Aligned |
| Video recording | `RecordVideoScreen` and recording entry points still exist. | Gate out of MVP |
| Video reconciliation | `repairImportedVideoLinks()` attempts resolution from asset and media metadata; `attemptVideoRediscovery()` also exists on the set screen. | Useful foundation; retain for replacement restore |
| Backup export | `exportDatabaseBackup()` checkpoints and exports a SQLite snapshot containing media metadata, not external gallery files. | Aligned with link-only export |
| Backup import | `importDatabaseBackup()` currently performs a merge in foreign-key order. | Required change: replacement restore |
| Feature segmentation | Main tabs are hard-coded in `TabsLayout`; no centralized release capability was found in the graph search. | Required change |
| Programs | The Programs tab currently exposes the implemented program experience. | Required change: Coming Soon in MVP profile |

## 13. Disposition of the Program Autosave Finding

The analysis in
`docs/codebase-analysis-2026-06-21/high-severity-01-program-autosave-history.md`
must not be applied wholesale to manual MVP logging.

For manual logging, a real set under an unfinished `workout_exercises` row is
intentional. It is how concurrent exercise logging, in-progress history, immediate
analytics, and immediate PB feedback work. Automatically completing the exercise
when a set is persisted would violate the MVP lifecycle.

Programs are outside the MVP and are replaced by a Coming Soon screen. The current
program persistence disagreement therefore is not an MVP release blocker, provided
all program logging entry points are actually gated. It remains deferred work for
the later Programs release.

There is also a current documentation/code disagreement to resolve at that time:

- `docs/database-ground-truth.md` says a complete programmed set immediately
  completes its linked exercise entry.
- `persistProgramSetToWorkoutHistory()` currently creates or updates the real set
  without completing the linked exercise entry; final program completion performs
  the completion later.

That deferred program decision must be made deliberately. It must not alter the
manual logging rules in this document.

## 14. Planning Consequences

The MVP implementation plan must include, at minimum:

1. A centralized MVP capability profile and guarded navigation/routes.
2. A Programs Coming Soon tab while retaining all program source code.
3. Removal of health-metric and video-recording access in the MVP profile.
4. Broad history support for exercise entries that are in progress and have sets.
5. Duplicate exercise-name support while preserving ID-based relationships.
6. Replacement-based restore with media-link reconciliation.
7. Regression coverage for concurrent logging, completion, history visibility,
   PB recalculation, backup/restore, and gallery video attachment.

No further product decision is required before producing the first implementation
plan. Implementation-level choices should preserve these facts rather than redefine
them.
