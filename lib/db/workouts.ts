import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { computeE1rm } from "../pr";
import { db } from "./connection";
import { exercises, sets, workoutExercises, workouts, type SetRow as SetRowT, type WorkoutExerciseRow, type WorkoutRow } from "./schema";
import { getGlobalFormula } from "./settings";

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

export async function updateWorkoutDate(workoutId: number, date: number): Promise<void> {
  await db.update(workouts).set({ startedAt: date }).where(eq(workouts.id, workoutId)).run();
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
  performed_at?: number | null;
}): Promise<number> {
  const res = await db
    .insert(workoutExercises)
    .values({
      workoutId: args.workout_id,
      exerciseId: args.exercise_id,
      orderIndex: args.order_index ?? null,
      note: args.note ?? null,
      performedAt: args.performed_at ?? Date.now(),
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

/**
 * Get an open (not completed) workout_exercise entry for an exercise.
 * Returns null if no open entry exists.
 */
export async function getOpenWorkoutExercise(workoutId: number, exerciseId: number): Promise<WorkoutExercise | null> {
  const rows = await db
    .select()
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.workoutId, workoutId),
        eq(workoutExercises.exerciseId, exerciseId),
        isNull(workoutExercises.completedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
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

/**
 * List sets for a specific workout_exercise entry (by workoutExerciseId).
 * This is the correct way to get sets for the current exercise entry only.
 */
export async function listSetsForWorkoutExercise(workoutExerciseId: number): Promise<SetRow[]> {
  const rows = await db
    .select()
    .from(sets)
    .where(eq(sets.workoutExerciseId, workoutExerciseId))
    .orderBy(sets.setIndex, sets.performedAt, sets.id);
  return rows;
}

export async function updateSet(setId: number, updates: {
  weight_kg?: number | null;
  reps?: number | null;
  note?: string | null;
  set_index?: number | null;
  performed_at?: number | null;
}): Promise<void> {
  const mapped: Partial<typeof sets.$inferInsert> = {};
  if (updates.weight_kg !== undefined) mapped.weightKg = updates.weight_kg;
  if (updates.reps !== undefined) mapped.reps = updates.reps;
  if (updates.note !== undefined) mapped.note = updates.note;
  if (updates.set_index !== undefined) mapped.setIndex = updates.set_index;
  if (updates.performed_at !== undefined) mapped.performedAt = updates.performed_at;
  if (Object.keys(mapped).length === 0) return;
  await db.update(sets).set(mapped).where(eq(sets.id, setId)).run();
}

export async function deleteSet(setId: number): Promise<void> {
  await db.delete(sets).where(eq(sets.id, setId)).run();
}

export type WorkoutHistoryEntry = {
  workout: Workout;
  workoutExercise: WorkoutExercise | null;
  sets: SetRow[];
};

export async function getExerciseHistory(exerciseId: number): Promise<WorkoutHistoryEntry[]> {
  // Get all workout_exercises for this exercise
  const allWorkoutExercises = await db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.exerciseId, exerciseId))
    .orderBy(desc(workoutExercises.performedAt));

  if (allWorkoutExercises.length === 0) {
    return [];
  }

  // Get unique workout IDs
  const workoutIds = [...new Set(allWorkoutExercises.map((we) => we.workoutId))];

  // Get workout details for each workout ID
  const workoutMap = new Map<number, Workout>();
  for (const workoutId of workoutIds) {
    const workout = await getWorkoutById(workoutId);
    if (workout) {
      workoutMap.set(workoutId, workout);
    }
  }

  // Get all sets for this exercise grouped by workout_exercise_id
  const allSets = await db
    .select()
    .from(sets)
    .where(eq(sets.exerciseId, exerciseId))
    .orderBy(sets.setIndex, sets.performedAt, sets.id);

  // Group sets by workout_exercise_id
  const setsByWorkoutExercise = new Map<number, SetRow[]>();
  for (const set of allSets) {
    if (set.workoutExerciseId !== null) {
      if (!setsByWorkoutExercise.has(set.workoutExerciseId)) {
        setsByWorkoutExercise.set(set.workoutExerciseId, []);
      }
      setsByWorkoutExercise.get(set.workoutExerciseId)!.push(set);
    }
  }

  // Create history entries for each workout_exercise
  const entries: WorkoutHistoryEntry[] = [];
  for (const we of allWorkoutExercises) {
    const workout = workoutMap.get(we.workoutId);
    if (workout) {
      const weSets = setsByWorkoutExercise.get(we.id) ?? [];
      // Only include entries that have sets
      if (weSets.length > 0) {
        entries.push({
          workout,
          workoutExercise: we,
          sets: weSets,
        });
      }
    }
  }

  // Sort entries by performed date (most recent first)
  entries.sort((a, b) => {
    const aTime = a.workoutExercise?.performedAt ?? a.workoutExercise?.completedAt ?? a.workout.startedAt;
    const bTime = b.workoutExercise?.performedAt ?? b.workoutExercise?.completedAt ?? b.workout.startedAt;
    return bTime - aTime;
  });

  return entries;
}

export async function getWorkoutExerciseById(id: number): Promise<WorkoutExercise | null> {
  const rows = await db.select().from(workoutExercises).where(eq(workoutExercises.id, id));
  return rows[0] ?? null;
}

export async function updateWorkoutExerciseInputs(
  workoutExerciseId: number,
  updates: { currentWeight?: number | null; currentReps?: number | null }
): Promise<void> {
  const mapped: Partial<typeof workoutExercises.$inferInsert> = {};
  if (updates.currentWeight !== undefined) mapped.currentWeight = updates.currentWeight;
  if (updates.currentReps !== undefined) mapped.currentReps = updates.currentReps;
  if (Object.keys(mapped).length === 0) return;
  await db.update(workoutExercises).set(mapped).where(eq(workoutExercises.id, workoutExerciseId)).run();
}

/**
 * Complete an exercise entry by setting its completed_at timestamp.
 * This is the semantic "Complete Exercise" action.
 */
export async function completeExerciseEntry(workoutExerciseId: number, performedAt?: number): Promise<void> {
  const timestamp = performedAt ?? Date.now();
  
  if (__DEV__) {
    console.log("[completeExerciseEntry] Completing entry:", { workoutExerciseId, timestamp });
  }
  
  const result = await db
    .update(workoutExercises)
    .set({ 
      completedAt: timestamp,
      performedAt: timestamp,
    })
    .where(eq(workoutExercises.id, workoutExerciseId))
    .run();
  
  if (__DEV__) {
    console.log("[completeExerciseEntry] Update result:", { rowsAffected: result.changes });
    
    // Re-read to verify
    const updated = await db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.id, workoutExerciseId))
      .limit(1);
    
    console.log("[completeExerciseEntry] Verified row:", {
      id: updated[0]?.id,
      completedAt: updated[0]?.completedAt,
      performedAt: updated[0]?.performedAt,
    });
  }
}

/**
 * Update the performed_at date for an exercise entry.
 * This is the user-editable date shown in the UI.
 */
export async function updateExerciseEntryDate(workoutExerciseId: number, performedAt: number): Promise<void> {
  await db
    .update(workoutExercises)
    .set({ performedAt })
    .where(eq(workoutExercises.id, workoutExerciseId))
    .run();
}

/**
 * Result type for the last workout day query
 */
export type LastWorkoutDayExercise = {
  exerciseId: number;
  exerciseName: string;
  workoutExerciseId: number;
  bestSet: {
    weightKg: number;
    reps: number;
    e1rm: number;
  } | null;
};

export type LastWorkoutDayResult = {
  date: number;
  exercises: LastWorkoutDayExercise[];
  hasMore: boolean;
};

/**
 * Get the most recent workout day with completed exercise entries.
 * Groups by day (using performed_at), returns exercise list with best E1RM sets.
 */
export async function getLastWorkoutDay(): Promise<LastWorkoutDayResult | null> {
  // Find the most recent day with completed exercise entries
  const recentEntry = await db
    .select({
      performedAt: workoutExercises.performedAt,
    })
    .from(workoutExercises)
    .where(isNotNull(workoutExercises.completedAt))
    .orderBy(desc(workoutExercises.performedAt))
    .limit(1);

  if (recentEntry.length === 0 || recentEntry[0].performedAt === null) {
    return null;
  }

  // Get the day start/end for grouping
  const mostRecentDate = recentEntry[0].performedAt;
  const dayStart = new Date(mostRecentDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(mostRecentDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Get all completed exercise entries for that day
  const completedEntries = await db
    .select({
      workoutExerciseId: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      exerciseName: exercises.name,
      performedAt: workoutExercises.performedAt,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(
      and(
        isNotNull(workoutExercises.completedAt),
        sql`${workoutExercises.performedAt} >= ${dayStart.getTime()}`,
        sql`${workoutExercises.performedAt} <= ${dayEnd.getTime()}`
      )
    )
    .orderBy(workoutExercises.performedAt);

  if (completedEntries.length === 0) {
    return null;
  }

  // Check if there are more than 26 exercises
  const hasMore = completedEntries.length > 26;
  const entriesToProcess = completedEntries.slice(0, 26);

  // Get global E1RM formula
  const formula = getGlobalFormula();

  // For each exercise entry, compute best set by E1RM
  const exercisesResult: LastWorkoutDayExercise[] = [];

  for (const entry of entriesToProcess) {
    // Get all sets for this workout_exercise
    const entrySets = await db
      .select({
        weightKg: sets.weightKg,
        reps: sets.reps,
      })
      .from(sets)
      .where(eq(sets.workoutExerciseId, entry.workoutExerciseId));

    let bestSet: LastWorkoutDayExercise["bestSet"] = null;
    let maxE1rm = 0;

    for (const set of entrySets) {
      if (set.weightKg !== null && set.reps !== null && set.reps > 0 && set.weightKg > 0) {
        const e1rm = computeE1rm(formula, set.weightKg, set.reps);
        // Tie-breaker: higher weight, then higher reps
        if (
          e1rm > maxE1rm ||
          (e1rm === maxE1rm && bestSet && set.weightKg > bestSet.weightKg) ||
          (e1rm === maxE1rm && bestSet && set.weightKg === bestSet.weightKg && set.reps > bestSet.reps)
        ) {
          maxE1rm = e1rm;
          bestSet = {
            weightKg: set.weightKg,
            reps: set.reps,
            e1rm: Math.round(e1rm),
          };
        }
      }
    }

    exercisesResult.push({
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      workoutExerciseId: entry.workoutExerciseId,
      bestSet,
    });
  }

  return {
    date: dayStart.getTime(),
    exercises: exercisesResult,
    hasMore,
  };
}


