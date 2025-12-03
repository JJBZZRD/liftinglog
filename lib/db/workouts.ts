import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./connection";
import { sets, workoutExercises, workouts, type SetRow as SetRowT, type WorkoutExerciseRow, type WorkoutRow } from "./schema";

export type Workout = WorkoutRow;
export type WorkoutExercise = WorkoutExerciseRow;
export type SetRow = SetRowT;

export async function createWorkout(data?: { started_at?: number; note?: string | null }): Promise<number> {
  const res = await db
    .insert(workouts)
    .values({ startedAt: data?.started_at ?? Date.now(), note: data?.note ?? null })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function completeWorkout(workoutId: number, completedAt?: number): Promise<void> {
  await db.update(workouts).set({ completedAt: completedAt ?? Date.now() }).where(eq(workouts.id, workoutId)).run();
}

export async function getWorkoutById(id: number): Promise<Workout | null> {
  const rows = await db.select().from(workouts).where(eq(workouts.id, id));
  return rows[0] ?? null;
}

export async function listWorkouts(limit = 50, offset = 0): Promise<Workout[]> {
  const rows = await db
    .select()
    .from(workouts)
    .orderBy(desc(workouts.startedAt))
    .limit(limit)
    .offset(offset);
  return rows;
}

export async function getActiveWorkout(): Promise<Workout | null> {
  const rows = await db
    .select()
    .from(workouts)
    .where(isNull(workouts.completedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrCreateActiveWorkout(): Promise<number> {
  const active = await getActiveWorkout();
  if (active) return active.id;
  return await createWorkout();
}

export async function deleteWorkout(id: number): Promise<void> {
  await db.delete(workouts).where(eq(workouts.id, id)).run();
}

export async function addWorkoutExercise(args: {
  workout_id: number;
  exercise_id: number;
  order_index?: number | null;
  note?: string | null;
}): Promise<number> {
  const res = await db
    .insert(workoutExercises)
    .values({
      workoutId: args.workout_id,
      exerciseId: args.exercise_id,
      orderIndex: args.order_index ?? null,
      note: args.note ?? null,
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function listWorkoutExercises(workoutId: number): Promise<WorkoutExercise[]> {
  const rows = await db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(workoutExercises.orderIndex);
  return rows;
}

export async function addSet(args: {
  workout_id: number;
  exercise_id: number;
  workout_exercise_id?: number | null;
  set_group_id?: string | null;
  set_index?: number | null;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  rir?: number | null;
  is_warmup?: boolean;
  note?: string | null;
  superset_group_id?: string | null;
  performed_at?: number | null;
}): Promise<number> {
  const res = await db
    .insert(sets)
    .values({
      workoutId: args.workout_id,
      exerciseId: args.exercise_id,
      workoutExerciseId: args.workout_exercise_id ?? null,
      setGroupId: args.set_group_id ?? null,
      setIndex: args.set_index ?? null,
      weightKg: args.weight_kg ?? null,
      reps: args.reps ?? null,
      rpe: args.rpe ?? null,
      rir: args.rir ?? null,
      isWarmup: !!args.is_warmup,
      note: args.note ?? null,
      supersetGroupId: args.superset_group_id ?? null,
      performedAt: args.performed_at ?? Date.now(),
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function listSetsForWorkout(workoutId: number): Promise<SetRow[]> {
  const rows = await db
    .select()
    .from(sets)
    .where(eq(sets.workoutId, workoutId))
    .orderBy(sets.performedAt, sets.id);
  return rows;
}

export async function listSetsForExercise(workoutId: number, exerciseId: number): Promise<SetRow[]> {
  const rows = await db
    .select()
    .from(sets)
    .where(and(eq(sets.workoutId, workoutId), eq(sets.exerciseId, exerciseId)))
    .orderBy(sets.setIndex, sets.performedAt, sets.id);
  return rows;
}

export async function updateSet(setId: number, updates: {
  weight_kg?: number | null;
  reps?: number | null;
  note?: string | null;
  set_index?: number | null;
}): Promise<void> {
  const mapped: Partial<typeof sets.$inferInsert> = {};
  if (updates.weight_kg !== undefined) mapped.weightKg = updates.weight_kg;
  if (updates.reps !== undefined) mapped.reps = updates.reps;
  if (updates.note !== undefined) mapped.note = updates.note;
  if (updates.set_index !== undefined) mapped.setIndex = updates.set_index;
  if (Object.keys(mapped).length === 0) return;
  await db.update(sets).set(mapped).where(eq(sets.id, setId)).run();
}

export async function deleteSet(setId: number): Promise<void> {
  await db.delete(sets).where(eq(sets.id, setId)).run();
}

export type WorkoutHistoryEntry = {
  workout: Workout;
  sets: SetRow[];
};

export async function getExerciseHistory(exerciseId: number): Promise<WorkoutHistoryEntry[]> {
  // Get all sets for this exercise across all workouts
  const allSets = await db
    .select()
    .from(sets)
    .where(eq(sets.exerciseId, exerciseId))
    .orderBy(desc(sets.performedAt), desc(sets.id));

  // Get unique workout IDs
  const workoutIds = [...new Set(allSets.map((s) => s.workoutId))];

  // Get workout details for each workout ID
  const workoutMap = new Map<number, Workout>();
  for (const workoutId of workoutIds) {
    const workout = await getWorkoutById(workoutId);
    if (workout) {
      workoutMap.set(workoutId, workout);
    }
  }

  // Group sets by workout and create history entries
  const historyMap = new Map<number, SetRow[]>();
  for (const set of allSets) {
    if (!historyMap.has(set.workoutId)) {
      historyMap.set(set.workoutId, []);
    }
    historyMap.get(set.workoutId)!.push(set);
  }

  // Create history entries, sorted by workout date (most recent first)
  const entries: WorkoutHistoryEntry[] = [];
  for (const [workoutId, workoutSets] of historyMap.entries()) {
    const workout = workoutMap.get(workoutId);
    if (workout) {
      // Sort sets within workout by setIndex or performedAt
      workoutSets.sort((a, b) => {
        if (a.setIndex !== null && b.setIndex !== null) {
          return a.setIndex - b.setIndex;
        }
        if (a.performedAt !== null && b.performedAt !== null) {
          return a.performedAt - b.performedAt;
        }
        return a.id - b.id;
      });
      entries.push({ workout, sets: workoutSets });
    }
  }

  // Sort entries by workout date (most recent first)
  entries.sort((a, b) => {
    const aTime = a.workout.completedAt ?? a.workout.startedAt;
    const bTime = b.workout.completedAt ?? b.workout.startedAt;
    return bTime - aTime;
  });

  return entries;
}


