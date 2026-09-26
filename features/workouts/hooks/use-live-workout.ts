import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getWorkoutSessionDetail } from '@/lib/db/workoutSessions';
import { getActiveWorkout } from '@/lib/db/workouts';
import type { WorkoutSummary } from '../workout-types';

/**
 * The in-progress workout for UI outside the Workouts screens, such as the live
 * strip above the tab bar. Reads while `enabled`, again when the surrounding screen
 * regains focus (returning from workout detail), and when the app returns to the
 * foreground. Resolves to null when there is no active workout or the read fails.
 */
export function useLiveWorkout(enabled: boolean) {
  const [workout, setWorkout] = useState<WorkoutSummary | null>(null);
  const request = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;
    const current = ++request.current;
    try {
      const active = await getActiveWorkout();
      const detail = active ? await getWorkoutSessionDetail(active.id) : null;
      if (current === request.current) setWorkout(detail && detail.completedAt === null ? detail : null);
    } catch {
      // Optional chrome: stay hidden when the current state is unknown.
      if (current === request.current) setWorkout(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      request.current += 1;
      setWorkout(null);
      return;
    }
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => subscription.remove();
  }, [enabled, refresh]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return workout;
}
