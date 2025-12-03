import { desc, eq } from "drizzle-orm";
import { db } from "./connection";
import { exercises, type ExerciseRow, sets } from "./schema";

export type Exercise = ExerciseRow;

export async function createExercise(data: {
  name: string;
  description?: string | null;
  muscle_group?: string | null;
  equipment?: string | null;
  is_bodyweight?: boolean;
}): Promise<number> {
  const res = await db
    .insert(exercises)
    .values({
      name: data.name,
      description: data.description ?? null,
      muscleGroup: data.muscle_group ?? null,
      equipment: data.equipment ?? null,
      isBodyweight: !!data.is_bodyweight,
      createdAt: Date.now(),
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function getExerciseById(id: number): Promise<Exercise | null> {
  const rows = await db.select().from(exercises).where(eq(exercises.id, id));
  return rows[0] ?? null;
}

export async function listExercises(): Promise<Exercise[]> {
  // order by name asc
  const rows = await db.select().from(exercises).orderBy(exercises.name);
  return rows;
}

export async function updateExercise(
  id: number,
  updates: Partial<{
    name: string;
    description: string | null;
    muscle_group: string | null;
    equipment: string | null;
    is_bodyweight: boolean;
  }>
): Promise<void> {
  const mapped: Partial<ExerciseRow> = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.muscle_group !== undefined) mapped.muscleGroup = updates.muscle_group;
  if (updates.equipment !== undefined) mapped.equipment = updates.equipment;
  if (updates.is_bodyweight !== undefined) mapped.isBodyweight = !!updates.is_bodyweight;
  if (Object.keys(mapped).length === 0) return;
  await db.update(exercises).set(mapped).where(eq(exercises.id, id)).run();
}

export async function deleteExercise(id: number): Promise<void> {
  await db.delete(exercises).where(eq(exercises.id, id)).run();
}

export async function lastPerformedAt(exerciseId: number): Promise<number | null> {
  const rows = await db.select().from(sets).where(eq(sets.exerciseId, exerciseId)).orderBy(desc(sets.performedAt)).limit(1);
  return rows[0]?.performedAt ?? null;
}

