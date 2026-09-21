# MVP-005A notes audit

Audit scope: workout and exercise-entry note UI against MVP product facts sections 2, 3, 4, and 7. This is a source audit and characterization pass only; no production code or schema was changed.

## Source evidence

### Exercise-entry note (`workout_exercises.note`)

- `components/exercise/UnifiedRecordTab.tsx` owns `sessionNote` plus refs for the dirty flag and current `workoutExerciseId` context.
- `loadManualWorkout()` and `loadProgramWorkout()` call `applyLoadedSessionNote(...)`, which hydrates the note from the loaded `workout_exercises` row. The context guard prevents a dirty draft from being overwritten while the same entry remains active.
- `handleSessionNoteChange()` marks the draft dirty and keeps a ref copy. `handleSessionNoteBlur()` calls `flushSessionNoteDraft()`.
- `flushSessionNoteDraft()` trims whitespace, maps an empty value to `null`, creates the entry only when a non-empty note needs an entry, and calls `updateWorkoutExerciseNote(workoutExerciseId, noteValue)`. It invokes `onHistoryRefresh` after a successful update.
- Focus cleanup invokes `flushSessionNoteDraftRef.current()` on blur/unfocus, and the Complete, date-change, exercise-selection, set-add, and set-edit paths flush before changing context or completing. This is the strongest evidence for switching and completion durability within the mounted UI lifecycle.
- The rendered input is labelled `Session Note (Optional)` and is bound to `sessionNote`, with `onBlur` persistence.
- Empty note drafts do not create an entry: the no-entry branch clears dirty state and returns when the trimmed value is empty. Completion still requires `hasConfirmedSets`; an empty draft cannot become visible logged training through the note path.

There is a narrow source-level race for MVP-005C: `flushSessionNoteDraft()` captures `noteValue`, awaits `updateWorkoutExerciseNote(...)`, then unconditionally clears `sessionNoteDirtyRef` and records the context. If the user types a newer value while that write is pending, the completion path can clear the newer dirty flag even though only the older value was written; a subsequent reload/switch can therefore discard the newer draft. This was identified by control-flow inspection, not reproduced by the existing mocks. `handleSessionNoteBlur()` also invokes the async flush with `void` and no local rejection handler, so a write failure is not surfaced by that handler. Preserve these as focused follow-up evidence rather than fixing them in the audit ticket.

### DB ownership and set-note separation

- `lib/db/workouts.ts` exports `updateWorkoutExerciseNote(workoutExerciseId, note)` and updates only `workout_exercises.note`.
- `getWorkoutExerciseById()` returns the row, including its note, and `getExerciseHistory()` / `getWorkoutDayPage()` carry the entry note in their read models.
- `sets.note` remains a separate field. `UnifiedRecordTab` uses the `Set Note (Optional)` input and `addSet`/`updateSet` with `note`; the session-note updater never writes to a set.

### Workout note (`workouts.note`)

- `workouts.note` is present in the schema and `createWorkout({ note })` accepts it. `getWorkoutById()` reads the canonical workout envelope.
- No `updateWorkoutNote`/`setWorkoutNote` operation exists in `lib/db/workouts.ts`.
- `UnifiedRecordTab` resolves and persists the current exercise-entry note through `workoutExerciseId`; it does not expose a workout-note input or call a workout-note setter.
- `app/edit-workout.tsx` resolves `workoutId` from a supplied `workoutExerciseId`, but its `Note (optional)` input is the draft/current set note and is saved into `sets.note`. It is not a workout-note editor.

### Existing history surfaces

- `app/exercise/tabs/HistoryTab.tsx` loads `getExerciseHistory()` and renders each set through `SetItem(note={set.note})`. Its search parser/filter also searches `set.note`. The entry-level `note` carried by the history read model is not rendered.
- `app/workout/[dayKey].tsx` receives `entry.note` from `getWorkoutDayPage()`, but the visible exercise card renders the exercise metadata and each set note; there is no workout-note or entry-note display.
- The day route sends `workoutExerciseId` to `/edit-workout`. That editor's note control remains set-scoped, so this route cannot edit the canonical workout note.

## Acceptance matrix

| Acceptance criterion | Status | Evidence / gap |
| --- | --- | --- |
| Add, edit, clear exercise-entry note | Supported in current record UI | `UnifiedRecordTab` flushes trimmed text and maps empty to `null`; DB updater is present. Focused automated coverage is partial; see tests below. |
| Exercise-entry note survives switching open exercises | Supported by source path; untested for real navigation | Selection/date/context handlers flush before loading another entry. Jest mocks do not prove native focus/unfocus or router behavior. |
| Exercise-entry note survives completion | Supported by source path; targeted test coverage absent | Complete handler flushes before `completeExerciseEntry`; no native completion test was added in this audit. |
| Exercise-entry note survives app restart | Untested | No native restart or persistence harness claim is made here. DB read/write primitives are present, but restart requires a follow-up integration/manual check. |
| Existing entry note is preserved by history set edits | Supported by DB ownership; editor/display gap remains | `updateSet()` does not write `workout_exercises.note`. Separately, `HistoryTab`/day page do not render the entry note and `/edit-workout` edits `sets.note` only, so a completed-entry note still lacks an editor/display path. |
| Add, edit, clear workout note on canonical `workouts.id` | Gap | `createWorkout` and `getWorkoutById` exist; no workout-note setter or current canonical UI surface exists. |
| History shows existing workout/exercise-entry notes | Gap | History read models include entry notes, but both named history surfaces omit them from rendering. Set notes are shown. |
| Set note remains distinct from entry/workout note | Supported | Separate DB columns and separate UI/write paths are present; characterization should keep these IDs/fields distinct. |
| Empty draft cannot become visible logged training | Supported by source path | Empty note alone does not create an entry; history queries require real linked sets. Existing lifecycle tests cover the set/history gate, not native UI restart. |
| No new filtering/session model | Supported | Audit identifies existing search/filter behavior only; no new model or filter is proposed. |

## Follow-up boundaries

### Entry-note follow-up (MVP-005C)

Keep the existing `UnifiedRecordTab` draft/flush lifecycle and add focused behavioral tests for add/edit/clear, context switching, completion flush, the pending-write race, and separation from `sets.note`. Extend the existing history/edit surface only as needed to display and edit `workout_exercises.note`; do not route the value through the set-note input. Any restart proof should use a real database reopen/integration harness or an explicitly labelled manual/native check.

### Workout-note follow-up (MVP-005B + MVP-005D)

Add one narrow `updateWorkoutNote(workoutId, note)` DB operation beside `getWorkoutById()`, with DB characterization for add/edit/clear and null clearing. MVP-005D should choose one existing canonical workout/history surface (organizer decision) for the workout-note editor and display, resolving `workoutId` from the current entry where needed. Keep the route tied to `workouts.id`; do not infer identity from date or introduce a session-selection model. Preserve `app/edit-workout.tsx`'s set-note control as set-scoped unless the organizer deliberately places the workout-note editor on that existing surface.

## Tests and limits

Source evidence and executed tests are separate. No new test file was added in this audit; the pending-write race is testable with a deferred mocked write and is explicitly assigned to MVP-005C, while this ticket records source evidence only. Existing mocks cannot establish restart or native focus semantics.

Required targeted command:

```text
npx.cmd jest --runInBand --watch=false --runTestsByPath __tests__/app/manual-logging-lifecycle.test.tsx __tests__/db/manualLoggingLifecycle.test.ts
```

Executed on the audit branch: 2 suites passed and 12 tests passed; `npm.cmd run typecheck` passed; `npm.cmd run lint -- --no-cache` passed with 0 errors and 20 pre-existing warnings; `git diff --check` passed. The default cached lint invocation hit an EPERM while creating `.expo/cache/eslint`, so the no-cache invocation was used. Do not describe these mocked tests as proof of native restart, app unmount, or router navigation.
