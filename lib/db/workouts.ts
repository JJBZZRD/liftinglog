import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { computeE1rm } from "../pr";
import { db, sqlite } from "./connection";
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

// ============================================================================
// Workout History Types and Functions
// ============================================================================

/**
 * dayKey format: "YYYY-MM-DD" (derived from SQLite strftime for DST safety)
 */
export type WorkoutDaySummary = {
  dayKey: string;               // stable identifier, e.g. "2025-01-13"
  displayDate: number;          // timestamp for JS date formatting
  totalExercises: number;       // count of completed exercise entries
  totalSets: number;            // total sets across entries
  notesPreview: string | null;  // merged preview if notes exist
};

export type WorkoutDayExerciseDetail = {
  workoutExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  note: string | null;
  bestSet: { weightKg: number; reps: number; e1rm: number } | null;
};

export type WorkoutDayDetails = {
  dayKey: string;
  exercises: WorkoutDayExerciseDetail[];
  hasMoreExercises: boolean;
  totalVolumeKg: number;
  bestE1rmKg: number | null;
};

/**
 * Convert a dayKey (YYYY-MM-DD) to a local timestamp for display formatting
 */
export function dayKeyToTimestamp(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

/**
 * List workout days with pagination.
 * Groups completed exercise entries by local calendar day using SQLite strftime.
 */
export async function listWorkoutDays(params: {
  limit: number;
  offset: number;
}): Promise<WorkoutDaySummary[]> {
  const { limit, offset } = params;

  const stmt = sqlite.prepareSync(`
    SELECT 
      strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') AS dayKey,
      MIN(we.performed_at) AS displayDate,
      COUNT(DISTINCT we.id) AS totalExercises,
      (SELECT COUNT(*) FROM sets s WHERE s.workout_exercise_id IN (
        SELECT we2.id FROM workout_exercises we2 
        WHERE we2.completed_at IS NOT NULL 
          AND strftime('%Y-%m-%d', we2.performed_at/1000, 'unixepoch', 'localtime') = strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime')
      )) AS totalSets,
      GROUP_CONCAT(DISTINCT SUBSTR(we.note, 1, 50)) AS notesPreview
    FROM workout_exercises we
    WHERE we.completed_at IS NOT NULL
    GROUP BY dayKey
    ORDER BY dayKey DESC
    LIMIT ? OFFSET ?
  `);

  try {
    const result = stmt.executeSync([limit, offset]);
    const rows = result.getAllSync() as Array<{
      dayKey: string;
      displayDate: number;
      totalExercises: number;
      totalSets: number;
      notesPreview: string | null;
    }>;

    return rows.map((row) => ({
      dayKey: row.dayKey,
      displayDate: row.displayDate,
      totalExercises: row.totalExercises,
      totalSets: row.totalSets,
      notesPreview: row.notesPreview,
    }));
  } finally {
    stmt.finalizeSync();
  }
}

/**
 * Get detailed exercise information for a specific workout day.
 * Returns exercises (limited to 26 for A-Z labeling) with best set E1RM computed in JS.
 */
export async function getWorkoutDayDetails(dayKey: string): Promise<WorkoutDayDetails> {
  // Get all completed exercise entries for this dayKey (limit 27 to detect hasMore)
  const stmt = sqlite.prepareSync(`
    SELECT 
      we.id AS workoutExerciseId,
      we.exercise_id AS exerciseId,
      e.name AS exerciseName,
      we.note
    FROM workout_exercises we
    INNER JOIN exercises e ON we.exercise_id = e.id
    WHERE we.completed_at IS NOT NULL
      AND strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') = ?
    ORDER BY we.performed_at
    LIMIT 27
  `);

  let entries: Array<{
    workoutExerciseId: number;
    exerciseId: number;
    exerciseName: string;
    note: string | null;
  }>;

  try {
    const result = stmt.executeSync([dayKey]);
    entries = result.getAllSync() as typeof entries;
  } finally {
    stmt.finalizeSync();
  }

  const hasMoreExercises = entries.length > 26;
  const entriesToProcess = entries.slice(0, 26);

  // Get global E1RM formula
  const formula = getGlobalFormula();

  const exercisesResult: WorkoutDayExerciseDetail[] = [];
  let totalVolumeKg = 0;
  let bestE1rmKg: number | null = null;

  for (const entry of entriesToProcess) {
    // Get all sets for this workout_exercise
    const entrySets = await listSetsForWorkoutExercise(entry.workoutExerciseId);

    let bestSet: WorkoutDayExerciseDetail["bestSet"] = null;
    let maxE1rm = 0;

    for (const set of entrySets) {
      if (set.weightKg !== null && set.reps !== null && set.reps > 0 && set.weightKg > 0) {
        // Accumulate volume
        totalVolumeKg += set.weightKg * set.reps;

        // Compute E1RM
        const e1rm = computeE1rm(formula, set.weightKg, set.reps);

        // Track best E1RM for this exercise
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

        // Track best E1RM for the entire day
        if (bestE1rmKg === null || e1rm > bestE1rmKg) {
          bestE1rmKg = Math.round(e1rm);
        }
      }
    }

    exercisesResult.push({
      workoutExerciseId: entry.workoutExerciseId,
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      note: entry.note,
      bestSet,
    });
  }

  return {
    dayKey,
    exercises: exercisesResult,
    hasMoreExercises,
    totalVolumeKg: Math.round(totalVolumeKg),
    bestE1rmKg,
  };
}

/**
 * Parse search query into alpha and numeric tokens.
 * Handles patterns like "100", "100kg", "100lb", "100.5"
 */
function parseSearchTokens(query: string): { alpha: string[]; numeric: number[] } {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const alpha: string[] = [];
  const numeric: number[] = [];

  for (const token of tokens) {
    // Match "100", "100kg", "100lb", "100.5"
    const numMatch = token.match(/^(\d+(?:\.\d+)?)(kg|lb)?$/i);
    if (numMatch) {
      numeric.push(parseFloat(numMatch[1]));
    } else {
      alpha.push(token);
    }
  }
  return { alpha, numeric };
}

/**
 * Helper to intersect two sets of strings
 */
function intersectSets(setA: Set<string>, setB: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of setA) {
    if (setB.has(item)) {
      result.add(item);
    }
  }
  return result;
}

export interface SearchWorkoutDaysParams {
  query: string;
  startDate?: number | null;  // inclusive, local day start timestamp
  endDate?: number | null;    // inclusive, local day end timestamp
  limit: number;
  offset: number;
}

/**
 * Search workout days based on query string and optional date range.
 * Two-step approach: find matching dayKeys, then fetch summaries.
 */
export async function searchWorkoutDays(params: SearchWorkoutDaysParams): Promise<WorkoutDaySummary[]> {
  const { query, startDate, endDate, limit, offset } = params;

  // If no query and no date filter, just return regular list
  if (!query.trim() && !startDate && !endDate) {
    return listWorkoutDays({ limit, offset });
  }

  const { alpha, numeric } = parseSearchTokens(query);

  // Build date filter clause
  let dateFilterClause = "";
  const dateParams: number[] = [];
  if (startDate) {
    dateFilterClause += " AND we.performed_at >= ?";
    dateParams.push(startDate);
  }
  if (endDate) {
    dateFilterClause += " AND we.performed_at <= ?";
    dateParams.push(endDate);
  }

  // Step A: Find matching dayKeys
  let matchingDayKeys: Set<string> | null = null;

  // Search for alpha tokens (LIKE match on exercise name, notes)
  for (const token of alpha) {
    const likePattern = `%${token}%`;
    const stmt = sqlite.prepareSync(`
      SELECT DISTINCT strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') AS dayKey
      FROM workout_exercises we
      LEFT JOIN exercises e ON we.exercise_id = e.id
      LEFT JOIN sets s ON s.workout_exercise_id = we.id
      WHERE we.completed_at IS NOT NULL
        ${dateFilterClause}
        AND (
          e.name LIKE ?
          OR we.note LIKE ?
          OR s.note LIKE ?
        )
    `);

    try {
      const result = stmt.executeSync([...dateParams, likePattern, likePattern, likePattern]);
      const rows = result.getAllSync() as Array<{ dayKey: string }>;
      const dayKeys = new Set(rows.map((r) => r.dayKey));

      // Intersect with previous results
      if (matchingDayKeys === null) {
        matchingDayKeys = dayKeys;
      } else {
        matchingDayKeys = intersectSets(matchingDayKeys, dayKeys);
      }
    } finally {
      stmt.finalizeSync();
    }
  }

  // Search for numeric tokens (weight or reps)
  for (const num of numeric) {
    const stmt = sqlite.prepareSync(`
      SELECT DISTINCT strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') AS dayKey
      FROM workout_exercises we
      INNER JOIN sets s ON s.workout_exercise_id = we.id
      WHERE we.completed_at IS NOT NULL
        ${dateFilterClause}
        AND (s.reps = ? OR (s.weight_kg >= ? AND s.weight_kg <= ?))
    `);

    try {
      const result = stmt.executeSync([...dateParams, num, num - 0.5, num + 0.5]);
      const rows = result.getAllSync() as Array<{ dayKey: string }>;
      const dayKeys = new Set(rows.map((r) => r.dayKey));

      // Intersect with previous results
      if (matchingDayKeys === null) {
        matchingDayKeys = dayKeys;
      } else {
        matchingDayKeys = intersectSets(matchingDayKeys, dayKeys);
      }
    } finally {
      stmt.finalizeSync();
    }
  }

  // If we have search tokens but no matches, return empty
  if ((alpha.length > 0 || numeric.length > 0) && (matchingDayKeys === null || matchingDayKeys.size === 0)) {
    return [];
  }

  // If only date filter (no search tokens), query all days in range
  if (alpha.length === 0 && numeric.length === 0) {
    const stmt = sqlite.prepareSync(`
      SELECT 
        strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') AS dayKey,
        MIN(we.performed_at) AS displayDate,
        COUNT(DISTINCT we.id) AS totalExercises,
        (SELECT COUNT(*) FROM sets s WHERE s.workout_exercise_id IN (
          SELECT we2.id FROM workout_exercises we2 
          WHERE we2.completed_at IS NOT NULL 
            AND strftime('%Y-%m-%d', we2.performed_at/1000, 'unixepoch', 'localtime') = strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime')
        )) AS totalSets,
        GROUP_CONCAT(DISTINCT SUBSTR(we.note, 1, 50)) AS notesPreview
      FROM workout_exercises we
      WHERE we.completed_at IS NOT NULL
        ${dateFilterClause}
      GROUP BY dayKey
      ORDER BY dayKey DESC
      LIMIT ? OFFSET ?
    `);

    try {
      const result = stmt.executeSync([...dateParams, limit, offset]);
      const rows = result.getAllSync() as Array<{
        dayKey: string;
        displayDate: number;
        totalExercises: number;
        totalSets: number;
        notesPreview: string | null;
      }>;

      return rows.map((row) => ({
        dayKey: row.dayKey,
        displayDate: row.displayDate,
        totalExercises: row.totalExercises,
        totalSets: row.totalSets,
        notesPreview: row.notesPreview,
      }));
    } finally {
      stmt.finalizeSync();
    }
  }

  // Step B: Fetch summaries for matching dayKeys
  const dayKeysArray = Array.from(matchingDayKeys!);
  
  // Sort by dayKey DESC for pagination
  dayKeysArray.sort((a, b) => b.localeCompare(a));
  
  // Apply pagination to dayKeys
  const paginatedDayKeys = dayKeysArray.slice(offset, offset + limit);
  
  if (paginatedDayKeys.length === 0) {
    return [];
  }

  // Build IN clause with placeholders
  const placeholders = paginatedDayKeys.map(() => '?').join(', ');
  const stmt = sqlite.prepareSync(`
    SELECT 
      strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') AS dayKey,
      MIN(we.performed_at) AS displayDate,
      COUNT(DISTINCT we.id) AS totalExercises,
      (SELECT COUNT(*) FROM sets s WHERE s.workout_exercise_id IN (
        SELECT we2.id FROM workout_exercises we2 
        WHERE we2.completed_at IS NOT NULL 
          AND strftime('%Y-%m-%d', we2.performed_at/1000, 'unixepoch', 'localtime') = strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime')
      )) AS totalSets,
      GROUP_CONCAT(DISTINCT SUBSTR(we.note, 1, 50)) AS notesPreview
    FROM workout_exercises we
    WHERE we.completed_at IS NOT NULL
      AND strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') IN (${placeholders})
    GROUP BY dayKey
    ORDER BY dayKey DESC
  `);

  try {
    const result = stmt.executeSync(paginatedDayKeys);
    const rows = result.getAllSync() as Array<{
      dayKey: string;
      displayDate: number;
      totalExercises: number;
      totalSets: number;
      notesPreview: string | null;
    }>;

    return rows.map((row) => ({
      dayKey: row.dayKey,
      displayDate: row.displayDate,
      totalExercises: row.totalExercises,
      totalSets: row.totalSets,
      notesPreview: row.notesPreview,
    }));
  } finally {
    stmt.finalizeSync();
  }
}

