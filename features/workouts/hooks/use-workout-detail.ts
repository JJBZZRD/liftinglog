import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActiveWorkoutConflictError,
  completeWorkoutSession,
  getWorkoutSessionDetail,
  resumeWorkoutSession,
  updateWorkoutSession,
} from '@/lib/db/workoutSessions';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { errorMessage, type WorkoutDetail, type WorkoutExercise } from '../workout-types';

export function useWorkoutDetail(id: number) {
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<number | null>(null);
  const [unfinished, setUnfinished] = useState<WorkoutExercise[] | null>(null);
  const request = useRef(0);
  const busyRef = useRef(false);
  const validId = Number.isSafeInteger(id) && id > 0;

  const reload = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = validId ? await getWorkoutSessionDetail(id) : null;
      if (current === request.current) setWorkout(result);
    } catch (cause) {
      if (current === request.current) setError(errorMessage(cause));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [id, validId]);

  useFocusEffect(useCallback(() => {
    setWorkout(null);
    setUnfinished(null);
    void reload();
    return () => { request.current += 1; };
  }, [reload]));

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || !validId) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      if (cause instanceof ActiveWorkoutConflictError) setConflictId(cause.activeWorkoutId);
      else setError(errorMessage(cause));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const complete = async () => run(async () => {
    await completeWorkoutSession(id);
    setUnfinished(null);
    setSelectedWorkoutId(null);
    await reload();
  });

  const requestComplete = async () => run(async () => {
    const latest = await getWorkoutSessionDetail(id);
    if (!latest) throw new Error('This workout is no longer available.');
    setWorkout(latest);
    const entries = latest.exercises.filter((entry) => entry.completedAt === null);
    if (entries.length) {
      setUnfinished(entries);
      return;
    }
    await completeWorkoutSession(id);
    setSelectedWorkoutId(null);
    await reload();
  });

  const resume = async () => run(async () => {
    await resumeWorkoutSession(id);
    setSelectedWorkoutId(id);
    await reload();
  });

  const save = async (name: string, note: string) => run(async () => {
    await updateWorkoutSession(id, { name: name.trim(), note: note.trim() || null });
    await reload();
  });

  return {
    workout, loading, busy, error, conflictId, setConflictId, unfinished,
    cancelComplete: () => setUnfinished(null), reload, save, resume, complete, requestComplete,
  };
}
