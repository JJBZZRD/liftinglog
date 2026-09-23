import { and, asc, eq, exists, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { newUid } from "../utils/uid";
import { db } from "./connection";
import { exercises, media, pbEvents, programCalendarSets, sets, workoutExercises, workouts, type SetRow, type WorkoutRow } from "./schema";
import { derivePBEventsForExercise } from "./pbDerivation";

export type WorkoutSessionSummary = {
  id: number;
  name: string;
  startedAt: number;
  completedAt: number | null;
  note: string | null;
  exerciseCount: number;
  setCount: number;
  volumeKg: number;
  inProgressCount: number;
};

export type WorkoutSessionExercise = {
  id: number;
  exerciseId: number;
  exerciseName: string;
  completedAt: number | null;
  performedAt: number | null;
  note: string | null;
  sets: SetRow[];
};

export type WorkoutSessionDetail = WorkoutSessionSummary & {
  exercises: WorkoutSessionExercise[];
  /** Legacy sets without an exercise-entry link remain visible and count in totals. */
  unassignedSets: (SetRow & { exerciseName: string })[];
};

export class ActiveWorkoutConflictError extends Error {
  constructor(readonly activeWorkoutId: number) {
    super("Another workout is active. Complete it before starting or resuming this workout.");
    this.name = "ActiveWorkoutConflictError";
  }
}

function assertId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError("Workout and entry IDs must be positive safe integers.");
}

function dayBounds(timestamp: number): [number, number] {
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw new RangeError("Workout date must be a valid timestamp.");
  }
  const start = new Date(timestamp);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()];
}

export function formatWorkoutSessionName(startedAt: number, ordinal: number): string {
  const date = new Date(startedAt);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
  return `Workout ${ordinal} ${weekday} ${date.getDate()} ${month}`;
}

function rowsStartingOnDay(timestamp: number): WorkoutRow[] {
  const [start, end] = dayBounds(timestamp);
  return db.select().from(workouts)
    .where(and(gte(workouts.startedAt, start), lt(workouts.startedAt, end)))
    .orderBy(asc(workouts.startedAt), asc(workouts.id)).all();
}

// A canonical set row records activity unless it is an unconfirmed legacy plan.
// Do not require positive load/reps: zero-load/bodyweight history is still real.
const recordedSetCondition = sql`coalesce(substr(${sets.note}, 1, 9), '') != '[PLANNED]'`;

function entryHasRecordedSets() {
  return exists(db.select({ id: sets.id }).from(sets).where(and(
    eq(sets.workoutExerciseId, workoutExercises.id), recordedSetCondition
  )));
}

function rowsForDay(timestamp: number): WorkoutRow[] {
  const [start, end] = dayBounds(timestamp);
  // Older loggers reused an active envelope across calendar days. Preserve that
  // identity while surfacing its real training on every day it contains.
  const entryDate = sql<number>`coalesce(${workoutExercises.performedAt}, ${workoutExercises.completedAt}, ${workouts.startedAt})`;
  const legacySetDate = sql<number>`coalesce(${sets.performedAt}, ${workouts.startedAt})`;
  const dayEntries = db.select({ id: workoutExercises.id }).from(workoutExercises)
    .innerJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workoutExercises.workoutId, workouts.id), recordedSetCondition, gte(entryDate, start), lt(entryDate, end)));
  const dayLegacySets = db.select({ id: sets.id }).from(sets)
    .where(and(eq(sets.workoutId, workouts.id), recordedSetCondition, isNull(sets.workoutExerciseId), gte(legacySetDate, start), lt(legacySetDate, end)));
  return db.select().from(workouts)
    .where(or(and(gte(workouts.startedAt, start), lt(workouts.startedAt, end)), exists(dayEntries), exists(dayLegacySets)))
    .orderBy(asc(workouts.startedAt), asc(workouts.id)).all();
}

function summarize(rows: WorkoutRow[]): WorkoutSessionSummary[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const entries = db.select({
    workoutId: workoutExercises.workoutId,
    count: sql<number>`count(*)`,
    open: sql<number>`sum(case when ${workoutExercises.completedAt} is null then 1 else 0 end)`,
  }).from(workoutExercises).where(and(inArray(workoutExercises.workoutId, ids), entryHasRecordedSets())).groupBy(workoutExercises.workoutId).all();
  const totals = db.select({
    workoutId: sets.workoutId,
    count: sql<number>`count(*)`,
    volume: sql<number>`coalesce(sum(${sets.weightKg} * ${sets.reps}), 0)`,
  }).from(sets).where(and(inArray(sets.workoutId, ids), recordedSetCondition)).groupBy(sets.workoutId).all();
  const entryByWorkout = new Map(entries.map((entry) => [entry.workoutId, entry]));
  const totalsByWorkout = new Map(totals.map((total) => [total.workoutId, total]));
  const ordinals = new Map<number, number>();
  for (const row of rows) {
    if (row.name?.trim() || ordinals.has(row.id)) continue;
    rowsStartingOnDay(row.startedAt).forEach((workout, index) => ordinals.set(workout.id, index + 1));
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() || formatWorkoutSessionName(row.startedAt, ordinals.get(row.id) ?? 1),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    note: row.note,
    exerciseCount: entryByWorkout.get(row.id)?.count ?? 0,
    setCount: totalsByWorkout.get(row.id)?.count ?? 0,
    volumeKg: totalsByWorkout.get(row.id)?.volume ?? 0,
    inProgressCount: entryByWorkout.get(row.id)?.open ?? 0,
  }));
}

export async function listWorkoutSessionsForDate(timestamp: number): Promise<WorkoutSessionSummary[]> {
  return summarize(rowsForDay(timestamp));
}

export async function getWorkoutSessionDetail(id: number): Promise<WorkoutSessionDetail | null> {
  assertId(id);
  const workout = db.select().from(workouts).where(eq(workouts.id, id)).get();
  if (!workout) return null;
  const summary = summarize([workout])[0];
  const entries = db.select({
    id: workoutExercises.id,
    exerciseId: workoutExercises.exerciseId,
    exerciseName: exercises.name,
    completedAt: workoutExercises.completedAt,
    performedAt: workoutExercises.performedAt,
    note: workoutExercises.note,
  }).from(workoutExercises).innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(and(eq(workoutExercises.workoutId, id), entryHasRecordedSets()))
    .orderBy(asc(workoutExercises.orderIndex), asc(workoutExercises.id)).all();
  const loggedSets = db.select().from(sets).where(and(eq(sets.workoutId, id), recordedSetCondition))
    .orderBy(asc(sets.setIndex), asc(sets.id)).all();
  const setsByEntry = new Map<number, SetRow[]>();
  const entryIds = new Set(entries.map((entry) => entry.id));
  const unassignedSets: (SetRow & { exerciseName: string })[] = [];
  const exerciseNames = new Map(db.select({ id: exercises.id, name: exercises.name }).from(exercises)
    .where(inArray(exercises.id, db.select({ id: sets.exerciseId }).from(sets).where(eq(sets.workoutId, id)))).all()
    .map((exercise) => [exercise.id, exercise.name]));
  for (const set of loggedSets) {
    if (set.workoutExerciseId === null || !entryIds.has(set.workoutExerciseId)) {
      unassignedSets.push({ ...set, exerciseName: exerciseNames.get(set.exerciseId) ?? "Unknown exercise" });
      continue;
    }
    const entrySets = setsByEntry.get(set.workoutExerciseId) ?? [];
    entrySets.push(set);
    setsByEntry.set(set.workoutExerciseId, entrySets);
  }
  return { ...summary, exercises: entries.map((entry) => ({ ...entry, sets: setsByEntry.get(entry.id) ?? [] })), unassignedSets };
}

/** Synchronous Drizzle transactions prevent interleaving between the check and write. */
export async function createWorkoutSession(date: number): Promise<number> {
  return createWorkoutSessionWithMetadata({ startedAt: date });
}

export function createWorkoutSessionWithMetadata(data: { startedAt: number; note?: string | null; name?: string }): number {
  dayBounds(data.startedAt);
  return db.transaction((tx) => {
    const active = tx.select({ id: workouts.id }).from(workouts).where(isNull(workouts.completedAt)).get();
    if (active) throw new ActiveWorkoutConflictError(active.id);
    return tx.insert(workouts).values({ uid: newUid(), startedAt: data.startedAt, note: data.note ?? null, name: data.name?.trim() || null }).run().lastInsertRowId;
  }, { behavior: "immediate" });
}

export async function resumeWorkoutSession(id: number): Promise<void> {
  assertId(id);
  db.transaction((tx) => {
    const workout = tx.select({ id: workouts.id }).from(workouts).where(eq(workouts.id, id)).get();
    if (!workout) throw new Error(`Workout ${id} does not exist.`);
    const active = tx.select({ id: workouts.id }).from(workouts).where(isNull(workouts.completedAt)).get();
    if (active && active.id !== id) throw new ActiveWorkoutConflictError(active.id);
    tx.update(workouts).set({ completedAt: null }).where(eq(workouts.id, id)).run();
  }, { behavior: "immediate" });
}

export async function completeWorkoutSession(id: number): Promise<void> {
  completeWorkoutSessionAt(id, Date.now());
}

export function completeWorkoutSessionAt(id: number, completedAt: number): void {
  assertId(id);
  dayBounds(completedAt);
  db.transaction((tx) => {
    const workout = tx.select().from(workouts).where(eq(workouts.id, id)).get();
    if (!workout) throw new Error(`Workout ${id} does not exist.`);
    // Preserve the effective history date even for legacy null performed_at rows;
    // otherwise history's completion-time fallback would shift them to today.
    tx.update(workoutExercises).set({ completedAt, performedAt: sql`coalesce(${workoutExercises.performedAt}, ${workout.startedAt})` })
      .where(and(eq(workoutExercises.workoutId, id), isNull(workoutExercises.completedAt))).run();
    tx.update(workouts).set({ completedAt: workout.completedAt ?? completedAt }).where(eq(workouts.id, id)).run();
  }, { behavior: "immediate" });
}

export async function updateWorkoutSession(id: number, updates: { name?: string; note?: string | null }): Promise<void> {
  assertId(id);
  if (!db.select({ id: workouts.id }).from(workouts).where(eq(workouts.id, id)).get()) {
    throw new Error(`Workout ${id} does not exist.`);
  }
  const values: { name?: string | null; note?: string | null } = {};
  if (updates.name !== undefined) values.name = updates.name.trim() || null;
  if (updates.note !== undefined) values.note = updates.note;
  if (Object.keys(values).length) db.update(workouts).set(values).where(eq(workouts.id, id)).run();
}

export async function moveWorkoutExerciseToWorkout(entryId: number, targetWorkoutId: number): Promise<void> {
  assertId(entryId);
  assertId(targetWorkoutId);
  db.transaction((tx) => {
    const entry = tx.select().from(workoutExercises).where(eq(workoutExercises.id, entryId)).get();
    if (!entry) throw new Error(`Exercise entry ${entryId} does not exist.`);
    const target = tx.select().from(workouts).where(eq(workouts.id, targetWorkoutId)).get();
    if (!target) throw new Error(`Workout ${targetWorkoutId} does not exist.`);
    if (entry.workoutId === targetWorkoutId) return;
    if (entry.completedAt === null && target.completedAt !== null) {
      throw new Error("Resume the destination workout before moving an in-progress exercise into it.");
    }
    const source = tx.select().from(workouts).where(eq(workouts.id, entry.workoutId)).get()!;
    const onTargetDay = (timestamp: number) => {
      const result = new Date(timestamp);
      const date = new Date(target.startedAt);
      result.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      return result.getTime();
    };
    const nextOrder = tx.select({ value: sql<number>`coalesce(max(${workoutExercises.orderIndex}), -1) + 1` })
      .from(workoutExercises).where(eq(workoutExercises.workoutId, targetWorkoutId)).get()!.value;
    const linkedSets = tx.select().from(sets).where(eq(sets.workoutExerciseId, entryId)).all();
    // Stable entry/set IDs retain program links. Set-attached media follows
    // its set; workout-only attachments remain with the original workout.
    const entryPerformedAt = onTargetDay(entry.performedAt ?? source.startedAt);
    for (const set of linkedSets) {
      const performedAt = onTargetDay(set.performedAt ?? entry.performedAt ?? source.startedAt);
      tx.update(media).set({ workoutId: targetWorkoutId }).where(eq(media.setId, set.id)).run();
      tx.update(sets).set({ workoutId: targetWorkoutId, performedAt }).where(eq(sets.id, set.id)).run();
      tx.update(programCalendarSets).set({ loggedAt: performedAt }).where(eq(programCalendarSets.setId, set.id)).run();
    }
    tx.update(workoutExercises).set({ workoutId: targetWorkoutId, orderIndex: nextOrder, performedAt: entryPerformedAt })
      .where(eq(workoutExercises.id, entryId)).run();
    // Dates affect PB chronology, so rebuild within the same transaction as the move.
    for (const exerciseId of new Set(linkedSets.map((set) => set.exerciseId))) {
      const allSets = tx.select().from(sets).where(eq(sets.exerciseId, exerciseId))
        .orderBy(asc(sets.performedAt), asc(sets.id)).all();
      const events = derivePBEventsForExercise(exerciseId, allSets).map((event) => ({ ...event, uid: newUid() }));
      tx.delete(pbEvents).where(eq(pbEvents.exerciseId, exerciseId)).run();
      if (events.length) tx.insert(pbEvents).values(events).run();
    }
  }, { behavior: "immediate" });
}
