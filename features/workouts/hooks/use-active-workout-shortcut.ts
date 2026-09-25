import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getWorkoutSessionDetail } from '@/lib/db/workoutSessions';
import { getActiveWorkout } from '@/lib/db/workouts';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import type { WorkoutSummary } from '../workout-types';

/** The library shortcut follows the active container, not the logging selection. */
export function useActiveWorkoutShortcut() {
  const [workout, setWorkout] = useState<WorkoutSummary | null>(null);
  const focused = useRef(false);
  const foreground = useRef(true);
  const request = useRef(0);

  const refresh = useCallback(async (open = false) => {
    if (!focused.current || !foreground.current) return;
    const current = ++request.current;
    const isCurrent = () => current === request.current && focused.current && foreground.current;
    // Hide the old destination until this focus/foreground/press read is verified.
    setWorkout(null);
    try {
      const active = await getActiveWorkout();
      if (!isCurrent() || !active || active.completedAt !== null) return;
      const detail = await getWorkoutSessionDetail(active.id);
      if (!isCurrent() || !detail || detail.id !== active.id || detail.completedAt !== null) return;

      if (open) {
        // The active session may have changed while its detail was being read.
        const latest = await getActiveWorkout();
        if (!isCurrent() || latest?.id !== detail.id || latest.completedAt !== null) return;
      }
      setWorkout(detail);
      if (open) {
        setSelectedWorkoutId(detail.id);
        router.push({ pathname: '/workout-session/[id]', params: { id: String(detail.id) } });
      }
    } catch {
      // An optional shortcut stays hidden when the current DB state is unknown.
      if (isCurrent()) setWorkout(null);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    foreground.current = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (foreground.current) void refresh();
      else {
        request.current += 1;
        setWorkout(null);
      }
    });
    return () => {
      focused.current = false;
      request.current += 1;
      subscription.remove();
      setWorkout(null);
    };
  }, [refresh]));

  const openWorkout = useCallback(() => { void refresh(true); }, [refresh]);
  return { workout, openWorkout };
}
