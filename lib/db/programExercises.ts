import { eq } from "drizzle-orm";
import { db } from "./connection";
import { programExercises, type ProgramExerciseRow } from "./schema";

export type ProgramExercise = ProgramExerciseRow;

export async function createProgramExercise(data: {
  program_day_id: number;
  exercise_id: number;
  order_index?: number | null;
  prescription_json?: string | null;
}): Promise<number> {
  const res = await db
    .insert(programExercises)
    .values({
      programDayId: data.program_day_id,
      exerciseId: data.exercise_id,
      orderIndex: data.order_index ?? null,
      prescriptionJson: data.prescription_json ?? null,
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function getProgramExerciseById(id: number): Promise<ProgramExercise | null> {
  const rows = await db
    .select()
    .from(programExercises)
    .where(eq(programExercises.id, id));
  return rows[0] ?? null;
}

export async function listProgramExercises(programDayId: number): Promise<ProgramExercise[]> {
  return db
    .select()
    .from(programExercises)
    .where(eq(programExercises.programDayId, programDayId))
    .orderBy(programExercises.orderIndex, programExercises.id);
}

export async function updateProgramExercise(
  id: number,
  updates: Partial<{
    exercise_id: number;
    order_index: number | null;
    prescription_json: string | null;
  }>
): Promise<void> {
  const mapped: Partial<typeof programExercises.$inferInsert> = {};
  if (updates.exercise_id !== undefined) mapped.exerciseId = updates.exercise_id;
  if (updates.order_index !== undefined) mapped.orderIndex = updates.order_index;
  if (updates.prescription_json !== undefined) mapped.prescriptionJson = updates.prescription_json;
  if (Object.keys(mapped).length === 0) return;
  await db
    .update(programExercises)
    .set(mapped)
    .where(eq(programExercises.id, id))
    .run();
}

export async function deleteProgramExercise(id: number): Promise<void> {
  await db.delete(programExercises).where(eq(programExercises.id, id)).run();
}
