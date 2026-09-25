import type { SetRow } from '@/lib/db/workouts';
import { calculateE1RM } from '@/lib/utils/estimated-one-rep-max';

type WorkoutSetHighlights = {
  bestSetId: number | null;
  highlightedSetIds: ReadonlySet<number>;
};

/** Select one best performance plus every supplied PB, retaining caller order. */
export function selectWorkoutSetHighlights(
  sets: readonly SetRow[],
  pbBadges: ReadonlyMap<number, string>,
): WorkoutSetHighlights {
  const recordedSets = sets.filter((set) => !set.note?.startsWith('[PLANNED]'));
  let weightedBestId: number | null = null;
  let highestEstimate = 0;
  let bodyweightBestId: number | null = null;
  let highestBodyweightReps = 0;

  for (const set of recordedSets) {
    const { weightKg, reps } = set;
    if (weightKg === null || reps === null
      || !Number.isFinite(weightKg) || !Number.isFinite(reps)
      || weightKg < 0 || reps <= 0) continue;

    if (weightKg === 0) {
      if (reps > highestBodyweightReps) {
        highestBodyweightReps = reps;
        bodyweightBestId = set.id;
      }
      continue;
    }

    const estimate = calculateE1RM(weightKg, reps);
    if (Number.isFinite(estimate) && estimate > highestEstimate) {
      highestEstimate = estimate;
      weightedBestId = set.id;
    }
  }

  const bestSetId = weightedBestId ?? bodyweightBestId;
  // Incomplete legacy measurements still deserve a visible row, but no Best label.
  const displaySetId = bestSetId ?? recordedSets[0]?.id;
  const highlightedSetIds = new Set<number>();
  for (const set of recordedSets) {
    if (set.id === displaySetId || pbBadges.has(set.id)) highlightedSetIds.add(set.id);
  }

  return { bestSetId, highlightedSetIds };
}
