/**
 * useWorkoutSets Hook
 * 
 * A custom hook that encapsulates workout set CRUD operations and state.
 * This consolidates the workout/set loading logic used in:
 * - RecordTab.tsx
 * - edit-workout.tsx
 */
import { useCallback, useEffect, useState } from 'react';
import {
  addSet,
  addWorkoutExercise,
  deleteSet,
  getOrCreateActiveWorkout,
  listSetsForExercise,
  listWorkoutExercises,
  updateSet,
  updateWorkoutExerciseInputs,
  type SetRow,
} from '../db/workouts';
import { getLastRestSeconds, setLastRestSeconds } from '../db/exercises';

interface UseWorkoutSetsOptions {
  /** Exercise ID to load sets for */
  exerciseId: number | null;
  /** Optional workout ID (for editing historical workouts) */
  workoutId?: number | null;
  /** Whether to create active workout if none exists (default: true for RecordTab) */
  createActiveWorkout?: boolean;
}

interface WorkoutSetsState {
  /** Current workout ID */
  workoutId: number | null;
  /** Current workout exercise ID */
  workoutExerciseId: number | null;
  /** List of sets for this exercise */
  sets: SetRow[];
  /** Whether data is loading */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current weight input value (persisted) */
  currentWeight: string;
  /** Current reps input value (persisted) */
  currentReps: string;
  /** Last rest time in seconds for this exercise */
  lastRestSeconds: number | null;
}

interface WorkoutSetsActions {
  /** Reload workout and sets data */
  reload: () => Promise<void>;
  /** Add a new set */
  addNewSet: (params: {
    weight: string;
    reps: string;
    note?: string;
    performedAt?: number;
  }) => Promise<boolean>;
  /** Update an existing set */
  updateExistingSet: (
    setId: number,
    updates: {
      weight_kg?: number | null;
      reps?: number | null;
      note?: string | null;
      performed_at?: number | null;
    }
  ) => Promise<void>;
  /** Delete a set */
  deleteExistingSet: (setId: number) => Promise<void>;
  /** Update persisted weight input */
  setWeight: (value: string) => void;
  /** Update persisted reps input */
  setReps: (value: string) => void;
  /** Save last rest time for this exercise */
  saveRestTime: (seconds: number) => Promise<void>;
}

export type UseWorkoutSetsReturn = WorkoutSetsState & WorkoutSetsActions;

/**
 * Custom hook for managing workout sets
 * 
 * Provides:
 * - Automatic loading of workout and sets on mount
 * - CRUD operations for sets
 * - Persisted weight/reps inputs in workout_exercises
 * - Last rest time management
 */
export function useWorkoutSets({
  exerciseId,
  workoutId: providedWorkoutId,
  createActiveWorkout = true,
}: UseWorkoutSetsOptions): UseWorkoutSetsReturn {
  const [state, setState] = useState<WorkoutSetsState>({
    workoutId: providedWorkoutId ?? null,
    workoutExerciseId: null,
    sets: [],
    loading: true,
    error: null,
    currentWeight: '',
    currentReps: '',
    lastRestSeconds: null,
  });

  // Load workout and sets
  const reload = useCallback(async () => {
    if (!exerciseId) {
      setState((prev) => ({ ...prev, loading: false, error: 'Invalid exercise ID' }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Get or create workout ID
      let activeWorkoutId = providedWorkoutId;
      if (!activeWorkoutId && createActiveWorkout) {
        activeWorkoutId = await getOrCreateActiveWorkout();
      }

      if (!activeWorkoutId) {
        setState((prev) => ({ ...prev, loading: false, error: 'No workout available' }));
        return;
      }

      // Get or create workout exercise
      const workoutExercises = await listWorkoutExercises(activeWorkoutId);
      let existingWorkoutExercise = workoutExercises.find(
        (we) => we.exerciseId === exerciseId
      );

      let weId: number;
      let currentWeight = '';
      let currentReps = '';

      if (existingWorkoutExercise) {
        weId = existingWorkoutExercise.id;
        if (existingWorkoutExercise.currentWeight !== null) {
          currentWeight = String(existingWorkoutExercise.currentWeight);
        }
        if (existingWorkoutExercise.currentReps !== null) {
          currentReps = String(existingWorkoutExercise.currentReps);
        }
      } else {
        weId = await addWorkoutExercise({
          workout_id: activeWorkoutId,
          exercise_id: exerciseId,
        });
      }

      // Load sets
      const exerciseSets = await listSetsForExercise(activeWorkoutId, exerciseId);

      // Load last rest time
      const lastRest = await getLastRestSeconds(exerciseId);

      setState({
        workoutId: activeWorkoutId,
        workoutExerciseId: weId,
        sets: exerciseSets,
        loading: false,
        error: null,
        currentWeight,
        currentReps,
        lastRestSeconds: lastRest,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [exerciseId, providedWorkoutId, createActiveWorkout]);

  // Load on mount and when dependencies change
  useEffect(() => {
    reload();
  }, [reload]);

  // Add a new set
  const addNewSet = useCallback(
    async (params: {
      weight: string;
      reps: string;
      note?: string;
      performedAt?: number;
    }): Promise<boolean> => {
      const { workoutId, workoutExerciseId, sets } = state;

      if (!workoutId || !exerciseId || !workoutExerciseId) {
        return false;
      }

      const weightValue = params.weight.trim() ? parseFloat(params.weight) : null;
      const repsValue = params.reps.trim() ? parseInt(params.reps, 10) : null;
      const noteValue = params.note?.trim() || null;

      if (!weightValue || weightValue === 0 || !repsValue || repsValue === 0) {
        return false;
      }

      await addSet({
        workout_id: workoutId,
        exercise_id: exerciseId,
        workout_exercise_id: workoutExerciseId,
        weight_kg: weightValue,
        reps: repsValue,
        note: noteValue,
        set_index: sets.length + 1,
        performed_at: params.performedAt ?? Date.now(),
      });

      await reload();
      return true;
    },
    [state, exerciseId, reload]
  );

  // Update an existing set
  const updateExistingSet = useCallback(
    async (
      setId: number,
      updates: {
        weight_kg?: number | null;
        reps?: number | null;
        note?: string | null;
        performed_at?: number | null;
      }
    ): Promise<void> => {
      await updateSet(setId, updates);
      await reload();
    },
    [reload]
  );

  // Delete a set
  const deleteExistingSet = useCallback(
    async (setId: number): Promise<void> => {
      await deleteSet(setId);
      await reload();
    },
    [reload]
  );

  // Update weight with persistence
  const setWeight = useCallback(
    (value: string) => {
      setState((prev) => ({ ...prev, currentWeight: value }));
      if (state.workoutExerciseId) {
        const numValue = value.trim() ? parseFloat(value) : null;
        updateWorkoutExerciseInputs(state.workoutExerciseId, { currentWeight: numValue });
      }
    },
    [state.workoutExerciseId]
  );

  // Update reps with persistence
  const setReps = useCallback(
    (value: string) => {
      setState((prev) => ({ ...prev, currentReps: value }));
      if (state.workoutExerciseId) {
        const numValue = value.trim() ? parseInt(value, 10) : null;
        updateWorkoutExerciseInputs(state.workoutExerciseId, { currentReps: numValue });
      }
    },
    [state.workoutExerciseId]
  );

  // Save rest time
  const saveRestTime = useCallback(
    async (seconds: number): Promise<void> => {
      if (!exerciseId) return;
      await setLastRestSeconds(exerciseId, seconds);
      setState((prev) => ({ ...prev, lastRestSeconds: seconds }));
    },
    [exerciseId]
  );

  return {
    ...state,
    reload,
    addNewSet,
    updateExistingSet,
    deleteExistingSet,
    setWeight,
    setReps,
    saveRestTime,
  };
}








