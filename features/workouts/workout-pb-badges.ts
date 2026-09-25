import { getPBEventsBySetIds } from '@/lib/db/pbEvents';
import type { WorkoutDetail } from './workout-types';

export type WorkoutPBBadges = ReadonlyMap<number, string>;

/** Keep every record achieved in this workout, including subsequently beaten PBs. */
export async function loadWorkoutPBBadges(
  workout: Pick<WorkoutDetail, 'exercises' | 'unassignedSets'>,
): Promise<WorkoutPBBadges> {
  const displayedSets = [...workout.exercises.flatMap((entry) => entry.sets), ...workout.unassignedSets]
    .filter((set) => !set.note?.startsWith('[PLANNED]'));
  const ids = [...new Set(displayedSets.map((set) => set.id))];
  if (!ids.length) return new Map();
  const events = await getPBEventsBySetIds(ids);
  const badges = new Map<number, string>();
  for (const id of ids) {
    const type = events.get(id)?.type;
    if (type) badges.set(id, type.toUpperCase());
  }
  return badges;
}
