import { useCallback } from 'react';
import { Keyboard } from 'react-native';
import { getWorkoutById, getWorkoutExerciseById, listSetsForWorkoutExercise } from '@/lib/db/workouts';
import { moveWorkoutExerciseToWorkout, type WorkoutSessionSummary } from '@/lib/db/workoutSessions';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { normalizeDate } from './recording-utils';
import type { RecordingContextController } from './use-recording-context';
import type { ProgramInputsController } from './use-program-inputs';

type Context = RecordingContextController & Pick<ProgramInputsController, 'flushDirtyProgramSetCommits'>;

export function useWorkoutAssignment(context: Pick<Context,
  "recordIdentityRef" | "setEntryPerformedAt" |
  "workoutExerciseId" |
  "entryIdRef" |
  "workoutOverrideRef" |
  "setWorkout" |
  "setWorkoutId" |
  "setSelectedDate" |
  "setSets" |
  "onHistoryRefresh" |
  "inProgramMode" |
  "flushDirtyProgramSetCommits"
>) {
  const {
    recordIdentityRef, setEntryPerformedAt,
    workoutExerciseId,
    entryIdRef,
    workoutOverrideRef,
    setWorkout,
    setWorkoutId,
    setSelectedDate,
    setSets,
    onHistoryRefresh,
    inProgramMode,
    flushDirtyProgramSetCommits,
  } = context;

  const selectWorkout = useCallback(async (choice: WorkoutSessionSummary) => {
    const entryId = entryIdRef.current ?? workoutExerciseId;
    const identity = ++recordIdentityRef.current;
    const assertCurrent = () => { if (recordIdentityRef.current !== identity) throw new Error("The exercise changed. Choose the workout again."); };
    Keyboard.dismiss();
    if (inProgramMode) await flushDirtyProgramSetCommits();
    const target = await getWorkoutById(choice.id);
    if (!target) throw new Error('This workout is no longer available.');
    assertCurrent();
    if (entryId) {
      await moveWorkoutExerciseToWorkout(entryId, target.id);
      const [nextSets, movedEntry] = await Promise.all([
        listSetsForWorkoutExercise(entryId), getWorkoutExerciseById(entryId),
      ]);
      assertCurrent();
      setSets(nextSets);
      setEntryPerformedAt(movedEntry?.performedAt ?? normalizeDate(new Date(target.startedAt)).getTime());
    }
    assertCurrent();
    workoutOverrideRef.current = target.id;
    setWorkout({ ...target, name: choice.name });
    setWorkoutId(target.id);
    setSelectedDate(normalizeDate(new Date(target.startedAt)));
    setSelectedWorkoutId(target.id);
    onHistoryRefresh?.();
  }, [
    entryIdRef,
    workoutExerciseId,
    recordIdentityRef,
    inProgramMode,
    flushDirtyProgramSetCommits,
    workoutOverrideRef,
    setWorkout,
    setWorkoutId,
    setSelectedDate,
    onHistoryRefresh,
    setSets,
    setEntryPerformedAt,
  ]);

  return {
    selectWorkout,
  };
}
