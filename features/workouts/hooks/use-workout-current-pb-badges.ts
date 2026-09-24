import { useEffect, useState } from 'react';
import { loadWorkoutCurrentPBBadges, type WorkoutPBBadges } from '../workout-pb-badges';
import type { WorkoutDetail } from '../workout-types';

const EMPTY_BADGES: WorkoutPBBadges = new Map();
type PBResult = { workout: WorkoutDetail; badges: WorkoutPBBadges; error: string | null };

export function useWorkoutCurrentPBBadges(workout: WorkoutDetail | null) {
  const [result, setResult] = useState<PBResult | null>(null);

  useEffect(() => {
    if (!workout) return;
    let cancelled = false;
    void loadWorkoutCurrentPBBadges(workout).then(
      (badges) => { if (!cancelled) setResult({ workout, badges, error: null }); },
      () => {
        if (!cancelled) setResult({ workout, badges: EMPTY_BADGES, error: 'Personal bests could not be loaded.' });
      },
    );
    return () => { cancelled = true; };
  }, [workout]);

  // Clear old badges immediately when details change, before the effect runs.
  const currentResult = result?.workout === workout ? result : null;
  return {
    pbBadges: currentResult?.badges ?? EMPTY_BADGES,
    pbError: currentResult?.error ?? null,
  };
}
