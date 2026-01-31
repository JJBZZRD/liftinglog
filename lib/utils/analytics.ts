import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { E1RMFormulaId } from "../db/connection";
import { db, hasColumn } from "../db/connection";
import { sets, workoutExercises, workouts } from "../db/schema";
import { getGlobalFormula } from "../db/settings";
import { computeE1rm } from "../pr";

export type SessionDataPoint = {
  date: number; // timestamp
  value: number;
  workoutId: number;
};

export type DateRange = {
  startDate: Date | null;
  endDate: Date;
};

export type SessionSetDetail = {
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  note: string | null;
};

export type SessionDetails = {
  date: number;
  workoutId: number;
  performedAt: number | null;
  completedAt: number | null;
  sets: SessionSetDetail[];
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  maxWeight: number;
  maxReps: number;
  bestSet: { weight: number; reps: number } | null;
  estimatedE1RM: number | null;
};

/**
 * Filter data points by date range
 */
export function filterByDateRange(
  data: SessionDataPoint[],
  range: DateRange
): SessionDataPoint[] {
  const { startDate, endDate } = range;
  return data.filter(point => {
    if (startDate && point.date < startDate.getTime()) return false;
    if (point.date > endDate.getTime()) return false;
    return true;
  });
}

/**
 * Get detailed session information for a specific workout
 * Includes individual sets for display in modal
 */
export async function getSessionDetails(
  exerciseId: number,
  workoutId: number
): Promise<SessionDetails | null> {
  if (__DEV__) {
    console.log("[getSessionDetails] Querying sets for:", { exerciseId, workoutId });
  }

  const sessionSets = await db
    .select({
      workoutExerciseId: sets.workoutExerciseId,
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
    })
    .from(sets)
    .where(and(
      eq(sets.exerciseId, exerciseId),
      eq(sets.workoutId, workoutId)
    ))
    .orderBy(sets.setIndex);

  if (__DEV__) {
    console.log("[getSessionDetails] Query returned:", {
      exerciseId,
      workoutId,
      setsFound: sessionSets.length,
      firstSet: sessionSets[0] ?? null,
    });
  }

  if (sessionSets.length === 0) return null;

  const workout = await db
    .select({
      startedAt: workouts.startedAt,
      completedAt: workouts.completedAt,
    })
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .limit(1);

  const workoutStartedAt = workout[0]?.startedAt ?? Date.now();
  const workoutCompletedAt = workout[0]?.completedAt ?? null;

  let performedAt: number | null = null;
  let completedAt: number | null = null;

  const canQueryWorkoutExercises = hasColumn("workout_exercises", "performed_at") && hasColumn("workout_exercises", "completed_at");
  if (canQueryWorkoutExercises) {
    const workoutExerciseIds = [
      ...new Set(
        sessionSets
          .map((s) => s.workoutExerciseId)
          .filter((id): id is number => typeof id === "number")
      ),
    ];

    if (workoutExerciseIds.length > 0) {
      const rows = await db
        .select({
          performedAt: workoutExercises.performedAt,
          completedAt: workoutExercises.completedAt,
        })
        .from(workoutExercises)
        .where(inArray(workoutExercises.id, workoutExerciseIds));

      // If ANY related workout_exercise is incomplete, treat the session as in-progress.
      const anyInProgress = rows.some((r) => r.completedAt === null);
      completedAt = anyInProgress ? null : (rows.map((r) => r.completedAt).filter((t): t is number => typeof t === "number").sort((a, b) => b - a)[0] ?? null);

      performedAt = rows
        .map((r) => r.performedAt)
        .filter((t): t is number => typeof t === "number")
        .sort((a, b) => b - a)[0] ?? null;
    } else {
      // Older data may have sets without workout_exercise_id; fall back to the latest entry for this exercise in the workout.
      const rows = await db
        .select({
          performedAt: workoutExercises.performedAt,
          completedAt: workoutExercises.completedAt,
        })
        .from(workoutExercises)
        .where(and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.exerciseId, exerciseId)))
        .orderBy(desc(workoutExercises.performedAt), desc(workoutExercises.id))
        .limit(1);

      performedAt = rows[0]?.performedAt ?? null;
      completedAt = rows[0]?.completedAt ?? null;
    }
  } else {
    // Best-effort fallback for "in progress" detection when workout_exercises columns are missing.
    completedAt = workoutCompletedAt;
  }

  const workoutDate = performedAt ?? completedAt ?? workoutCompletedAt ?? workoutStartedAt ?? Date.now();

  // Build individual set details
  const setDetails: SessionSetDetail[] = sessionSets.map((set, index) => ({
    setIndex: set.setIndex ?? index + 1,
    weightKg: set.weightKg,
    reps: set.reps,
    note: set.note,
  }));

  let totalSets = sessionSets.length;
  let totalReps = 0;
  let totalVolume = 0;
  let maxWeight = 0;
  let maxReps = 0;
  let bestSet: { weight: number; reps: number } | null = null;
  let maxE1RM = 0;

  const formula = getGlobalFormula();

  for (const set of sessionSets) {
    const weight = set.weightKg ?? 0;
    const reps = set.reps ?? 0;

    totalReps += reps;
    totalVolume += weight * reps;

    if (weight > maxWeight) maxWeight = weight;
    if (reps > maxReps) maxReps = reps;

    if (weight > 0 && reps > 0) {
      const e1rm = computeE1rm(formula, weight, reps);
      if (e1rm > maxE1RM) {
        maxE1RM = e1rm;
        bestSet = { weight, reps };
      }
    }
  }

  return {
    date: workoutDate,
    workoutId,
    performedAt,
    completedAt,
    sets: setDetails,
    totalSets,
    totalReps,
    totalVolume,
    maxWeight,
    maxReps,
    bestSet,
    estimatedE1RM: maxE1RM > 0 ? maxE1RM : null,
  };
}

/**
 * Get the maximum weight lifted per session for an exercise
 * Returns data points with workout date and max weight in that session
 */
export async function getMaxWeightPerSession(exerciseId: number): Promise<SessionDataPoint[]> {
  // Get all sets for this exercise grouped by workout
  const result = await db
    .select({
      workoutId: sets.workoutId,
      maxWeight: sql<number>`MAX(${sets.weightKg})`.as("max_weight"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(eq(sets.exerciseId, exerciseId))
    .groupBy(sets.workoutId)
    .orderBy(desc(sql`workout_date`));

  return result
    .filter(row => row.maxWeight !== null)
    .map(row => ({
      date: row.workoutDate,
      value: row.maxWeight,
      workoutId: row.workoutId,
    }));
}

/**
 * Get the best estimated 1RM per session for an exercise
 * Uses the global formula preference
 */
export async function getEstimated1RMPerSession(
  exerciseId: number,
  formula?: E1RMFormulaId
): Promise<SessionDataPoint[]> {
  const formulaToUse = formula ?? getGlobalFormula();

  // Get all sets with weight and reps
  const allSets = await db
    .select({
      workoutId: sets.workoutId,
      weightKg: sets.weightKg,
      reps: sets.reps,
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(
      eq(sets.exerciseId, exerciseId),
      sql`${sets.weightKg} IS NOT NULL`,
      sql`${sets.reps} IS NOT NULL`,
      sql`${sets.reps} > 0`
    ));

  // Group by workout and calculate max e1RM per session
  const workoutMap = new Map<number, { date: number; maxE1RM: number; workoutId: number }>();

  for (const set of allSets) {
    if (set.weightKg === null || set.reps === null) continue;

    const e1rm = computeE1rm(formulaToUse, set.weightKg, set.reps);
    const existing = workoutMap.get(set.workoutId);

    if (!existing || e1rm > existing.maxE1RM) {
      workoutMap.set(set.workoutId, {
        date: set.workoutDate,
        maxE1RM: e1rm,
        workoutId: set.workoutId,
      });
    }
  }

  return Array.from(workoutMap.values())
    .sort((a, b) => b.date - a.date)
    .map(item => ({
      date: item.date,
      value: item.maxE1RM,
      workoutId: item.workoutId,
    }));
}

/**
 * Get total volume (weight × reps) per session for an exercise
 */
export async function getTotalVolumePerSession(exerciseId: number): Promise<SessionDataPoint[]> {
  const result = await db
    .select({
      workoutId: sets.workoutId,
      totalVolume: sql<number>`SUM(${sets.weightKg} * ${sets.reps})`.as("total_volume"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(
      eq(sets.exerciseId, exerciseId),
      sql`${sets.weightKg} IS NOT NULL`,
      sql`${sets.reps} IS NOT NULL`
    ))
    .groupBy(sets.workoutId)
    .orderBy(desc(sql`workout_date`));

  return result
    .filter(row => row.totalVolume !== null)
    .map(row => ({
      date: row.workoutDate,
      value: row.totalVolume,
      workoutId: row.workoutId,
    }));
}

/**
 * Get maximum reps per session for an exercise
 */
export async function getMaxRepsPerSession(exerciseId: number): Promise<SessionDataPoint[]> {
  const result = await db
    .select({
      workoutId: sets.workoutId,
      maxReps: sql<number>`MAX(${sets.reps})`.as("max_reps"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(
      eq(sets.exerciseId, exerciseId),
      sql`${sets.reps} IS NOT NULL`
    ))
    .groupBy(sets.workoutId)
    .orderBy(desc(sql`workout_date`));

  return result
    .filter(row => row.maxReps !== null)
    .map(row => ({
      date: row.workoutDate,
      value: row.maxReps,
      workoutId: row.workoutId,
    }));
}

/**
 * Get number of sets per session for an exercise
 */
export async function getNumberOfSetsPerSession(exerciseId: number): Promise<SessionDataPoint[]> {
  const result = await db
    .select({
      workoutId: sets.workoutId,
      setCount: sql<number>`COUNT(*)`.as("set_count"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(eq(sets.exerciseId, exerciseId))
    .groupBy(sets.workoutId)
    .orderBy(desc(sql`workout_date`));

  return result.map(row => ({
    date: row.workoutDate,
    value: row.setCount,
    workoutId: row.workoutId,
  }));
}

/**
 * Compute a simple moving average trend line from session data
 * 
 * @param data - Array of session data points (should be sorted chronologically)
 * @param windowSize - Number of sessions to include in moving average (default: 5)
 * @returns Array of smoothed data points at the same dates as input
 */
export function computeTrendLine(
  data: SessionDataPoint[],
  windowSize: number = 5
): SessionDataPoint[] {
  if (data.length === 0) return [];
  
  // Ensure data is sorted chronologically
  const sorted = [...data].sort((a, b) => a.date - b.date);
  
  return sorted.map((point, index) => {
    // Calculate average of this point and previous (windowSize - 1) points
    const startIdx = Math.max(0, index - windowSize + 1);
    const windowPoints = sorted.slice(startIdx, index + 1);
    const sum = windowPoints.reduce((acc, p) => acc + p.value, 0);
    const avg = sum / windowPoints.length;
    
    return {
      date: point.date,
      value: avg,
      workoutId: point.workoutId,
    };
  });
}
