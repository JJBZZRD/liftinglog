import { eq } from "drizzle-orm";
import { db } from "./connection";
import { pslPrograms } from "./schema";
import type { PslProgramRow } from "./schema";

export type { PslProgramRow };

export async function createPslProgram(data: {
  name: string;
  description?: string;
  pslSource: string;
  compiledHash?: string;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  units?: string;
}): Promise<PslProgramRow> {
  const now = Date.now();
  const rows = await db
    .insert(pslPrograms)
    .values({
      name: data.name,
      description: data.description ?? null,
      pslSource: data.pslSource,
      compiledHash: data.compiledHash ?? null,
      isActive: data.isActive ?? false,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      units: data.units ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return rows[0];
}

export async function getPslProgramById(id: number): Promise<PslProgramRow | undefined> {
  const rows = await db.select().from(pslPrograms).where(eq(pslPrograms.id, id));
  return rows[0];
}

export async function listPslPrograms(): Promise<PslProgramRow[]> {
  return db.select().from(pslPrograms).orderBy(pslPrograms.name);
}

export async function listActivePslPrograms(): Promise<PslProgramRow[]> {
  return db
    .select()
    .from(pslPrograms)
    .where(eq(pslPrograms.isActive, true))
    .orderBy(pslPrograms.name);
}

export async function updatePslProgram(
  id: number,
  data: Partial<{
    name: string;
    description: string | null;
    pslSource: string;
    compiledHash: string | null;
    isActive: boolean;
    startDate: string | null;
    endDate: string | null;
    units: string | null;
  }>
): Promise<void> {
  await db
    .update(pslPrograms)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(pslPrograms.id, id));
}

export async function deletePslProgram(id: number): Promise<void> {
  await db.delete(pslPrograms).where(eq(pslPrograms.id, id));
}

export async function activatePslProgram(id: number): Promise<void> {
  await updatePslProgram(id, { isActive: true });
}

export async function deactivatePslProgram(id: number): Promise<void> {
  await updatePslProgram(id, { isActive: false });
}
