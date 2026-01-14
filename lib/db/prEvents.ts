import { eq, inArray } from "drizzle-orm";
import { db } from "./connection";
import { prEvents, type PREventRow } from "./schema";

export type PREvent = PREventRow;

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
