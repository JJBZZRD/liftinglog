import { desc, eq, inArray } from "drizzle-orm";
import { db } from "./connection";
import { pbEvents, sets, type PBEventRow } from "./schema";
import { newUid } from "../utils/uid";

export type PBEvent = PBEventRow;

function toSessionKey(workoutId: number, workoutExerciseId: number | null): string {
  return `${workoutId}:${workoutExerciseId ?? "null"}`;
}

function normalizeExerciseIds(exerciseIdOrIds: number | number[]): number[] {
  const exerciseIds = Array.isArray(exerciseIdOrIds)
    ? exerciseIdOrIds
    : [exerciseIdOrIds];

  return [
    ...new Set(
      exerciseIds.filter(
        (exerciseId): exerciseId is number =>
          typeof exerciseId === "number" &&
          Number.isInteger(exerciseId) &&
          exerciseId > 0
      )
    ),
  ];
}

function isValidSetForPB(set: {
  weightKg: number | null;
  reps: number | null;
  performedAt: number | null;
}): set is {
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
 * Record a PB event when a new personal best is achieved.
 */
export async function recordPBEvent(
  setId: number,
  exerciseId: number,
  type: string,
  metricValue: number,
  occurredAt: number
): Promise<number> {
  const res = await db
    .insert(pbEvents)
    .values({
      uid: newUid(),
      setId,
      exerciseId,
      type,
      metricValue,
      occurredAt,
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

/**
 * Rebuild all PB events for an exercise based on the current sets table.
 *
 * This is used to keep PB badges accurate when sets are edited, deleted,
 * or inserted out-of-order (for example historical edits).
 */
export async function rebuildPBEventsForExercise(exerciseId: number): Promise<void> {
  const allSets = await db
    .select({
      id: sets.id,
      weightKg: sets.weightKg,
      reps: sets.reps,
      performedAt: sets.performedAt,
    })
    .from(sets)
    .where(eq(sets.exerciseId, exerciseId))
    .orderBy(sets.performedAt, sets.id);

  const bestByReps = new Map<number, number>();
  const nextEvents: typeof pbEvents.$inferInsert[] = [];

  for (const set of allSets) {
    if (!isValidSetForPB(set)) continue;

    const bestSoFar = bestByReps.get(set.reps);
    if (bestSoFar === undefined || set.weightKg > bestSoFar) {
      bestByReps.set(set.reps, set.weightKg);
      nextEvents.push({
        uid: newUid(),
        setId: set.id,
        exerciseId,
        type: `${set.reps}rm`,
        metricValue: set.weightKg,
        occurredAt: set.performedAt,
      });
    }
  }

  // Keep the legacy pr_events table as derived data from sets.
  await db.delete(pbEvents).where(eq(pbEvents.exerciseId, exerciseId)).run();
  if (nextEvents.length > 0) {
    await db.insert(pbEvents).values(nextEvents).run();
  }
}

/**
 * Get all PB events for a specific exercise.
 */
export async function getPBEventsForExercise(
  exerciseIdOrIds: number | number[]
): Promise<PBEvent[]> {
  const exerciseIds = normalizeExerciseIds(exerciseIdOrIds);
  if (exerciseIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(pbEvents)
    .where(
      exerciseIds.length === 1
        ? eq(pbEvents.exerciseId, exerciseIds[0])
        : inArray(pbEvents.exerciseId, exerciseIds)
    )
    .orderBy(pbEvents.occurredAt, pbEvents.id);
  return rows;
}

/**
 * Get PB events for specific sets used for history badge display.
 * Returns a map of setId -> PBEvent.
 */
export async function getPBEventsBySetIds(setIds: number[]): Promise<Map<number, PBEvent>> {
  if (setIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(pbEvents)
    .where(inArray(pbEvents.setId, setIds));

  const map = new Map<number, PBEvent>();
  for (const row of rows) {
    map.set(row.setId, row);
  }
  return map;
}

/**
 * Get only the current PB events for an exercise, one per PB type.
 *
 * "Current" is defined as the latest recorded PB event for that type.
 */
export async function getCurrentPBEventsForExercise(
  exerciseIdOrIds: number | number[]
): Promise<Map<number, PBEvent>> {
  const exerciseIds = normalizeExerciseIds(exerciseIdOrIds);
  if (exerciseIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(pbEvents)
    .where(
      exerciseIds.length === 1
        ? eq(pbEvents.exerciseId, exerciseIds[0])
        : inArray(pbEvents.exerciseId, exerciseIds)
    )
    .orderBy(desc(pbEvents.occurredAt), desc(pbEvents.id));

  const seenTypes = new Set<string>();
  const map = new Map<number, PBEvent>();

  for (const row of rows) {
    if (seenTypes.has(row.type)) continue;
    seenTypes.add(row.type);
    map.set(row.setId, row);
  }

  return map;
}

/**
 * Get session keys for sessions that contain the current PB sets for an exercise.
 *
 * Session keys match chart grouping:
 * - modern sessions: `${workoutId}:${workoutExerciseId}`
 * - legacy sessions: `${workoutId}:null`
 */
export async function getCurrentPBSessionKeysForExercise(
  exerciseIdOrIds: number | number[]
): Promise<Set<string>> {
  const current = await getCurrentPBEventsForExercise(exerciseIdOrIds);
  const setIds = [...current.keys()];
  if (setIds.length === 0) return new Set();

  const rows = await db
    .select({
      workoutId: sets.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
    })
    .from(sets)
    .where(inArray(sets.id, setIds));

  const keys = new Set<string>();
  for (const row of rows) {
    keys.add(toSessionKey(row.workoutId, row.workoutExerciseId ?? null));
  }
  return keys;
}

/**
 * Delete PB events associated with a set.
 */
export async function deletePBEventsForSet(setId: number): Promise<void> {
  await db.delete(pbEvents).where(eq(pbEvents.setId, setId)).run();
}

/**
 * Get total count of all PB events.
 */
export async function getTotalPBCount(): Promise<number> {
  const rows = await db.select().from(pbEvents);
  return rows.length;
}
