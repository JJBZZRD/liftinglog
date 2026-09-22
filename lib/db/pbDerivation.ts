export type PBSourceSet = {
  id: number;
  weightKg: number | null;
  reps: number | null;
  performedAt: number | null;
};

export type DerivedPBEvent = {
  setId: number;
  exerciseId: number;
  type: string;
  metricValue: number;
  occurredAt: number;
};

function isValidSetForPB(set: PBSourceSet): set is PBSourceSet & {
  weightKg: number;
  reps: number;
  performedAt: number;
} {
  return (
    set.weightKg !== null &&
    set.reps !== null &&
    set.performedAt !== null &&
    set.weightKg > 0 &&
    set.reps > 0
  );
}

/**
 * Derive PB events from sets ordered by performedAt and then id.
 */
export function derivePBEventsForExercise(
  exerciseId: number,
  orderedSets: readonly PBSourceSet[]
): DerivedPBEvent[] {
  const bestByReps = new Map<number, number>();
  const events: DerivedPBEvent[] = [];

  for (const set of orderedSets) {
    if (!isValidSetForPB(set)) continue;

    const bestSoFar = bestByReps.get(set.reps);
    if (bestSoFar === undefined || set.weightKg > bestSoFar) {
      bestByReps.set(set.reps, set.weightKg);
      events.push({
        setId: set.id,
        exerciseId,
        type: `${set.reps}rm`,
        metricValue: set.weightKg,
        occurredAt: set.performedAt,
      });
    }
  }

  return events;
}
