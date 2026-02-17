import { eq } from "drizzle-orm";
import { db } from "./connection";
import { programDays, type ProgramDayRow } from "./schema";

export type ProgramDay = ProgramDayRow;

export async function createProgramDay(data: {
  program_id: number;
  schedule: string;
  day_of_week?: number | null;
  interval_days?: number | null;
  note?: string | null;
}): Promise<number> {
  const res = await db
    .insert(programDays)
    .values({
      programId: data.program_id,
      schedule: data.schedule,
      dayOfWeek: data.day_of_week ?? null,
      intervalDays: data.interval_days ?? null,
      note: data.note ?? null,
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function getProgramDayById(id: number): Promise<ProgramDay | null> {
  const rows = await db.select().from(programDays).where(eq(programDays.id, id));
  return rows[0] ?? null;
}

export async function listProgramDays(programId: number): Promise<ProgramDay[]> {
  return db
    .select()
    .from(programDays)
    .where(eq(programDays.programId, programId))
    .orderBy(programDays.id);
}

export async function updateProgramDay(
  id: number,
  updates: Partial<{
    schedule: string;
    day_of_week: number | null;
    interval_days: number | null;
    note: string | null;
  }>
): Promise<void> {
  const mapped: Partial<typeof programDays.$inferInsert> = {};
  if (updates.schedule !== undefined) mapped.schedule = updates.schedule;
  if (updates.day_of_week !== undefined) mapped.dayOfWeek = updates.day_of_week;
  if (updates.interval_days !== undefined) mapped.intervalDays = updates.interval_days;
  if (updates.note !== undefined) mapped.note = updates.note;
  if (Object.keys(mapped).length === 0) return;
  await db.update(programDays).set(mapped).where(eq(programDays.id, id)).run();
}

export async function deleteProgramDay(id: number): Promise<void> {
  await db.delete(programDays).where(eq(programDays.id, id)).run();
}
