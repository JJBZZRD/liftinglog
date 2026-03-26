import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/connection";
import { sets } from "../db/schema";
import { recordPBEvent } from "../db/pbEvents";

/**
 * Get the best weight achieved for a specific rep count for an exercise.
 * Excludes the current setId from the comparison.
 * Returns null if no sets exist for that rep count.
 */
export async function getBestWeightForReps(
  exerciseId: number,
  reps: number,
  excludeSetId?: number
): Promise<number | null> {
  const conditions = [eq(sets.exerciseId, exerciseId), eq(sets.reps, reps)];

  if (excludeSetId !== undefined) {
    conditions.push(sql`${sets.id} != ${excludeSetId}`);
  }

  const result = await db
    .select({
      maxWeight: sql<number>`MAX(${sets.weightKg})`.as("max_weight"),
    })
    .from(sets)
    .where(and(...conditions));

  const maxWeight = result[0]?.maxWeight ?? null;
  return maxWeight;
}

/**
 * Check if a weight/reps combination represents a new PB.
 * Returns true if this is a new best weight for this rep count.
 * Excludes the current setId from comparison.
 */
export async function checkForRepMaxPB(
  exerciseId: number,
  weightKg: number,
  reps: number,
  excludeSetId?: number
): Promise<boolean> {
  if (!weightKg || !reps || weightKg <= 0 || reps <= 0) {
    return false;
  }

  const currentBest = await getBestWeightForReps(exerciseId, reps, excludeSetId);
  return currentBest === null || weightKg > currentBest;
}

/**
 * Detect and record PB events for a newly added set.
 * Checks if this set represents a new rep-max PB and records it if so.
 */
export async function detectAndRecordPBs(
  setId: number,
  exerciseId: number,
  weightKg: number | null,
  reps: number | null,
  performedAt: number
): Promise<void> {
  if (!weightKg || !reps || weightKg <= 0 || reps <= 0) {
    return;
  }

  const isPB = await checkForRepMaxPB(exerciseId, weightKg, reps, setId);
  if (isPB) {
    await recordPBEvent(setId, exerciseId, `${reps}rm`, weightKg, performedAt);
  }
}
