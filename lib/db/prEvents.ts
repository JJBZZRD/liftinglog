import { desc, eq, inArray } from "drizzle-orm";
import { db } from "./connection";
import { prEvents, sets, type PREventRow } from "./schema";
import { newUid } from "../utils/uid";

export type PREvent = PREventRow;

function isValidSetForPR(set: { weightKg: number | null; reps: number | null; performedAt: number | null }): set is {
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
 * Record a PR event when a new personal record is achieved
 */
export async function recordPREvent(
  setId: number,
  exerciseId: number,
  type: string,
  metricValue: number,
  occurredAt: number
): Promise<number> {
  const res = await db
    .insert(prEvents)
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
 * Rebuild all PR events for an exercise based on the current sets table.
 *
 * This is used to keep PR badges accurate when sets are edited, deleted,
 * or inserted out-of-order (e.g., historical edits).
 */
export async function rebuildPREventsForExercise(exerciseId: number): Promise<void> {
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
  const nextEvents: Array<typeof prEvents.$inferInsert> = [];

  for (const set of allSets) {
    if (!isValidSetForPR(set)) continue;

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

  // Replace-by-exercise (treat pr_events as derived data from sets).
  await db.delete(prEvents).where(eq(prEvents.exerciseId, exerciseId)).run();
  if (nextEvents.length > 0) {
    await db.insert(prEvents).values(nextEvents).run();
  }
}

/**
 * Get all PR events for a specific exercise
 */
export async function getPREventsForExercise(exerciseId: number): Promise<PREvent[]> {
  const rows = await db
    .select()
    .from(prEvents)
    .where(eq(prEvents.exerciseId, exerciseId))
    .orderBy(prEvents.occurredAt);
  return rows;
}

/**
 * Get PR events for specific sets (used for history badge display)
 * Returns a map of setId -> PREvent
 */
export async function getPREventsBySetIds(setIds: number[]): Promise<Map<number, PREvent>> {
  if (setIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(prEvents)
    .where(inArray(prEvents.setId, setIds));

  const map = new Map<number, PREvent>();
  for (const row of rows) {
    map.set(row.setId, row);
  }
  return map;
}

/**
 * Get only the "current" PR events for an exercise (one per PR type, e.g. one 5RM).
 *
 * Note: "current" is defined as the latest recorded PR event for that type. We keep historical PR events
 * in the table for future features, but most UI surfaces should show only these current PR badges.
 */
export async function getCurrentPREventsForExercise(exerciseId: number): Promise<Map<number, PREvent>> {
  const rows = await db
    .select()
    .from(prEvents)
    .where(eq(prEvents.exerciseId, exerciseId))
    .orderBy(desc(prEvents.occurredAt), desc(prEvents.id));

  const seenTypes = new Set<string>();
  const map = new Map<number, PREvent>();

  for (const row of rows) {
    if (seenTypes.has(row.type)) continue;
    seenTypes.add(row.type);
    map.set(row.setId, row);
  }

  return map;
}

/**
 * Delete PR events associated with a set (when set is deleted)
 */
export async function deletePREventsForSet(setId: number): Promise<void> {
  await db.delete(prEvents).where(eq(prEvents.setId, setId)).run();
}

/**
 * Get total count of all PR events
 */
export async function getTotalPRCount(): Promise<number> {
  const rows = await db.select().from(prEvents);
  return rows.length;
}
