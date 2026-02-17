import { eq } from "drizzle-orm";
import { db } from "./connection";
import { progressions, type ProgressionRow } from "./schema";

export type Progression = ProgressionRow;

export async function createProgression(data: {
  program_exercise_id: number;
  type: string;
  value: number;
  cadence: string;
  cap_kg?: number | null;
}): Promise<number> {
  const res = await db
    .insert(progressions)
    .values({
      programExerciseId: data.program_exercise_id,
      type: data.type,
      value: data.value,
      cadence: data.cadence,
      capKg: data.cap_kg ?? null,
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function getProgressionById(id: number): Promise<Progression | null> {
  const rows = await db
    .select()
    .from(progressions)
    .where(eq(progressions.id, id));
  return rows[0] ?? null;
}

export async function listProgressionsForExercise(
  programExerciseId: number
): Promise<Progression[]> {
  return db
    .select()
    .from(progressions)
    .where(eq(progressions.programExerciseId, programExerciseId))
    .orderBy(progressions.id);
}

export async function updateProgression(
  id: number,
  updates: Partial<{
    type: string;
    value: number;
    cadence: string;
    cap_kg: number | null;
  }>
): Promise<void> {
  const mapped: Partial<typeof progressions.$inferInsert> = {};
  if (updates.type !== undefined) mapped.type = updates.type;
  if (updates.value !== undefined) mapped.value = updates.value;
  if (updates.cadence !== undefined) mapped.cadence = updates.cadence;
  if (updates.cap_kg !== undefined) mapped.capKg = updates.cap_kg;
  if (Object.keys(mapped).length === 0) return;
  await db
    .update(progressions)
    .set(mapped)
    .where(eq(progressions.id, id))
    .run();
}

export async function deleteProgression(id: number): Promise<void> {
  await db.delete(progressions).where(eq(progressions.id, id)).run();
}
