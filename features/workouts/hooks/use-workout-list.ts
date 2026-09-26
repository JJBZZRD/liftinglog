import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActiveWorkoutConflictError, createWorkoutSession, deleteWorkoutSession, getWorkoutSessionDetail, listWorkoutSessionsForDate } from '@/lib/db/workoutSessions';
import { getActiveWorkout } from '@/lib/db/workouts';
import { clearSelectedWorkoutIf, setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { errorMessage, type WorkoutSummary } from '../workout-types';

export function useWorkoutList(date: Date) {
  const day = date.getTime();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [activeElsewhere, setActiveElsewhere] = useState<WorkoutSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<number | null>(null);
  const request = useRef(0);
  const creatingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);

  const reload = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [result, activeWorkout] = await Promise.all([listWorkoutSessionsForDate(day), getActiveWorkout()]);
      if (current !== request.current) return;
      const elsewhere = activeWorkout && !result.some((workout) => workout.id === activeWorkout.id)
        ? await getWorkoutSessionDetail(activeWorkout.id) : null;
      if (current === request.current) { setWorkouts(result); setActiveElsewhere(elsewhere); }
    } catch (cause) {
      if (current === request.current) setError(errorMessage(cause));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [day]);

  useFocusEffect(useCallback(() => {
    setWorkouts([]);
    setActiveElsewhere(null);
    void reload();
    return () => { request.current += 1; };
  }, [reload]));

  const create = async () => {
    if (creatingRef.current) return null;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const now = new Date();
      const startedAt = new Date(day);
      startedAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      const id = await createWorkoutSession(startedAt.getTime());
      setSelectedWorkoutId(id);
      return id;
    } catch (cause) {
      if (cause instanceof ActiveWorkoutConflictError) setConflictId(cause.activeWorkoutId);
      else setError(errorMessage(cause));
      return null;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  /** Resolves true once the workout is deleted and the list reloaded. */
  const remove = async (id: number) => {
    if (deletingRef.current) return false;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWorkoutSession(id);
      clearSelectedWorkoutIf(id);
      setWorkouts((current) => current.filter((workout) => workout.id !== id));
      setActiveElsewhere((current) => current?.id === id ? null : current);
      void reload();
      return true;
    } catch (cause) {
      setDeleteError(errorMessage(cause));
      return false;
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return {
    workouts, activeElsewhere, loading, creating, error, conflictId, setConflictId, reload, create,
    deleting, deleteError, clearDeleteError: () => setDeleteError(null), remove,
  };
}
