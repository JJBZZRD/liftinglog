import { getExerciseScopeIdsForView } from '@/lib/db/exercises';
import { getCurrentPBEventsForExercise } from '@/lib/db/pbEvents';
import type { SetRow } from '@/lib/db/workouts';
import type { WorkoutDetail } from './workout-types';

export type WorkoutPBBadges = ReadonlyMap<number, string>;

/** Match HistoryTab's current-PB scope while retaining concrete workout rows. */
export async function loadWorkoutCurrentPBBadges(
  workout: Pick<WorkoutDetail, 'exercises' | 'unassignedSets'>,
): Promise<WorkoutPBBadges> {
  const setsByExercise = new Map<number, SetRow[]>();
  const displayedSets = [...workout.exercises.flatMap((entry) => entry.sets), ...workout.unassignedSets];
  for (const set of displayedSets) {
    if (set.note?.startsWith('[PLANNED]')) continue;
    const exerciseSets = setsByExercise.get(set.exerciseId) ?? [];
    exerciseSets.push(set);
    setsByExercise.set(set.exerciseId, exerciseSets);
  }

  const badges = new Map<number, string>();
  await Promise.all([...setsByExercise].map(async ([exerciseId, exerciseSets]) => {
    const scopeIds = await getExerciseScopeIdsForView(exerciseId);
    if (scopeIds.length === 0) return;
    // A list passed to this API is one family scope, never all workout exercises.
    const currentPBs = await getCurrentPBEventsForExercise(scopeIds);
    for (const set of exerciseSets) {
      const type = currentPBs.get(set.id)?.type;
      if (type) badges.set(set.id, type.toUpperCase());
    }
  }));
  return badges;
}
