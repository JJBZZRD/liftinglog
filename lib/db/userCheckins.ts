import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "./connection";
import { userCheckins, type UserCheckinRow } from "./schema";
import { newUid } from "../utils/uid";

export type UserCheckin = UserCheckinRow;

export type UserCheckinInput = {
  recorded_at?: number | null;
  context?: string | null;
  bodyweight_kg?: number | null;
  waist_cm?: number | null;
  sleep_hours?: number | null;
  resting_hr_bpm?: number | null;
  readiness_score?: number | null;
  soreness_score?: number | null;
  stress_score?: number | null;
  steps?: number | null;
  note?: string | null;
  source?: string | null;
};

export async function createUserCheckin(data: UserCheckinInput): Promise<number> {
  const res = await db
    .insert(userCheckins)
    .values({
      uid: newUid(),
      recordedAt: data.recorded_at ?? Date.now(),
      context: data.context ?? null,
      bodyweightKg: data.bodyweight_kg ?? null,
      waistCm: data.waist_cm ?? null,
      sleepHours: data.sleep_hours ?? null,
      restingHrBpm: data.resting_hr_bpm ?? null,
      readinessScore: data.readiness_score ?? null,
      sorenessScore: data.soreness_score ?? null,
      stressScore: data.stress_score ?? null,
      steps: data.steps ?? null,
      note: data.note ?? null,
      source: data.source ?? null,
    })
    .run();

  return (res.lastInsertRowId as number) ?? 0;
}

export async function getUserCheckinById(id: number): Promise<UserCheckin | null> {
  const rows = await db.select().from(userCheckins).where(eq(userCheckins.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getLatestUserCheckin(): Promise<UserCheckin | null> {
  const rows = await db
    .select()
    .from(userCheckins)
    .orderBy(desc(userCheckins.recordedAt), desc(userCheckins.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestBodyweightKg(): Promise<number | null> {
  const rows = await db
    .select({ bodyweightKg: userCheckins.bodyweightKg })
    .from(userCheckins)
    .where(isNotNull(userCheckins.bodyweightKg))
    .orderBy(desc(userCheckins.recordedAt), desc(userCheckins.id))
    .limit(1);
  return rows[0]?.bodyweightKg ?? null;
}

export async function listUserCheckins(limit = 50, offset = 0): Promise<UserCheckin[]> {
  return db
    .select()
    .from(userCheckins)
    .orderBy(desc(userCheckins.recordedAt), desc(userCheckins.id))
    .limit(limit)
    .offset(offset);
}

export async function listUserCheckinsInRange(
  startAt: number,
  endAt: number
): Promise<UserCheckin[]> {
  return db
    .select()
    .from(userCheckins)
    .where(and(gte(userCheckins.recordedAt, startAt), lte(userCheckins.recordedAt, endAt)))
    .orderBy(desc(userCheckins.recordedAt), desc(userCheckins.id));
}

export async function updateUserCheckin(
  id: number,
  updates: Partial<UserCheckinInput>
): Promise<void> {
  const mapped: Partial<UserCheckinRow> = {};

  if (updates.recorded_at !== undefined && updates.recorded_at !== null) {
    mapped.recordedAt = updates.recorded_at;
  }
  if (updates.context !== undefined) mapped.context = updates.context;
  if (updates.bodyweight_kg !== undefined) mapped.bodyweightKg = updates.bodyweight_kg;
  if (updates.waist_cm !== undefined) mapped.waistCm = updates.waist_cm;
  if (updates.sleep_hours !== undefined) mapped.sleepHours = updates.sleep_hours;
  if (updates.resting_hr_bpm !== undefined) mapped.restingHrBpm = updates.resting_hr_bpm;
  if (updates.readiness_score !== undefined) mapped.readinessScore = updates.readiness_score;
  if (updates.soreness_score !== undefined) mapped.sorenessScore = updates.soreness_score;
  if (updates.stress_score !== undefined) mapped.stressScore = updates.stress_score;
  if (updates.steps !== undefined) mapped.steps = updates.steps;
  if (updates.note !== undefined) mapped.note = updates.note;
  if (updates.source !== undefined) mapped.source = updates.source;

  if (Object.keys(mapped).length === 0) return;

  await db.update(userCheckins).set(mapped).where(eq(userCheckins.id, id)).run();
}

export async function deleteUserCheckin(id: number): Promise<void> {
  await db.delete(userCheckins).where(eq(userCheckins.id, id)).run();
}
