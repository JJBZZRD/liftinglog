import { desc, eq } from "drizzle-orm";
import { db } from "./connection";
import { programs, type ProgramRow } from "./schema";

export type Program = ProgramRow;

export async function createProgram(data: {
  name: string;
  description?: string | null;
  is_active?: boolean;
}): Promise<number> {
  const res = await db
    .insert(programs)
    .values({
      name: data.name,
      description: data.description ?? null,
      isActive: !!data.is_active,
      createdAt: Date.now(),
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function getProgramById(id: number): Promise<Program | null> {
  const rows = await db.select().from(programs).where(eq(programs.id, id));
  return rows[0] ?? null;
}

export async function listPrograms(): Promise<Program[]> {
  return db
    .select()
    .from(programs)
    .orderBy(desc(programs.isActive), desc(programs.createdAt));
}

export async function getActiveProgram(): Promise<Program | null> {
  const rows = await db
    .select()
    .from(programs)
    .where(eq(programs.isActive, true))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Activate a program (and deactivate all others).
 */
export async function activateProgram(programId: number): Promise<void> {
  // Deactivate all
  await db.update(programs).set({ isActive: false }).run();
  // Activate the target
  await db
    .update(programs)
    .set({ isActive: true })
    .where(eq(programs.id, programId))
    .run();
}

export async function deactivateProgram(programId: number): Promise<void> {
  await db
    .update(programs)
    .set({ isActive: false })
    .where(eq(programs.id, programId))
    .run();
}

export async function updateProgram(
  id: number,
  updates: Partial<{ name: string; description: string | null }>
): Promise<void> {
  const mapped: Partial<typeof programs.$inferInsert> = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.description !== undefined) mapped.description = updates.description;
  if (Object.keys(mapped).length === 0) return;
  await db.update(programs).set(mapped).where(eq(programs.id, id)).run();
}

export async function deleteProgram(id: number): Promise<void> {
  await db.delete(programs).where(eq(programs.id, id)).run();
}
