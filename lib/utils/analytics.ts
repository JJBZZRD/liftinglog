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
  workoutExerciseId: number | null;
};

export type DateRange = {
  startDate: Date | null;
  endDate: Date;
};

export type SessionSetDetail = {
  id: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  note: string | null;
};

export type SessionDetails = {
  date: number;
  workoutId: number;
  workoutExerciseId: number | null;
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
      id: sets.id,
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

  const uniqueWorkoutExerciseIds = [
    ...new Set(
      sessionSets
        .map((s) => s.workoutExerciseId)
        .filter((id): id is number => typeof id === "number")
    ),
  ];
  const workoutExerciseIdForSession = uniqueWorkoutExerciseIds.length === 1 ? uniqueWorkoutExerciseIds[0] : null;

  // Build individual set details
  const setDetails: SessionSetDetail[] = sessionSets.map((set, index) => ({
    id: set.id,
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
    workoutExerciseId: workoutExerciseIdForSession,
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
 * Get detailed session information for a specific workout_exercise entry.
 * This is the canonical "session" identifier when multiple sessions occur on the same day/workout.
 */
export async function getSessionDetailsByWorkoutExerciseId(
  workoutExerciseId: number
): Promise<SessionDetails | null> {
  const canQueryWorkoutExercises =
    hasColumn("workout_exercises", "performed_at") && hasColumn("workout_exercises", "completed_at");

  const workoutExerciseRows = await db
    .select({
      workoutId: workoutExercises.workoutId,
      performedAt: canQueryWorkoutExercises ? workoutExercises.performedAt : sql<number | null>`NULL`.as("performed_at"),
      completedAt: canQueryWorkoutExercises ? workoutExercises.completedAt : sql<number | null>`NULL`.as("completed_at"),
      workoutStartedAt: workouts.startedAt,
      workoutCompletedAt: workouts.completedAt,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutExercises.id, workoutExerciseId))
    .limit(1);

  const workoutExercise = workoutExerciseRows[0];
  if (!workoutExercise) return null;

  const sessionSets = await db
    .select({
      id: sets.id,
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
      performedAt: sets.performedAt,
    })
    .from(sets)
    .where(eq(sets.workoutExerciseId, workoutExerciseId))
    .orderBy(sets.setIndex, sets.performedAt, sets.id);

  if (sessionSets.length === 0) return null;

  const workoutDate =
    workoutExercise.performedAt ??
    workoutExercise.completedAt ??
    sessionSets.map((s) => s.performedAt).filter((t): t is number => typeof t === "number").sort((a, b) => b - a)[0] ??
    workoutExercise.workoutCompletedAt ??
    workoutExercise.workoutStartedAt ??
    Date.now();

  const setDetails: SessionSetDetail[] = sessionSets.map((set, index) => ({
    id: set.id,
    setIndex: set.setIndex ?? index + 1,
    weightKg: set.weightKg,
    reps: set.reps,
    note: set.note,
  }));

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
    workoutId: workoutExercise.workoutId,
    workoutExerciseId,
    performedAt: workoutExercise.performedAt ?? null,
    completedAt: workoutExercise.completedAt ?? null,
    sets: setDetails,
    totalSets: sessionSets.length,
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
  const canQueryWorkoutExercises =
    hasColumn("workout_exercises", "performed_at") && hasColumn("workout_exercises", "completed_at");

  // Canonical path: one point per workout_exercise (session)
  const result = await db
    .select({
      maxWeight: sql<number>`MAX(${sets.weightKg})`.as("max_weight"),
      workoutId: workoutExercises.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
      sessionDate: sql<number>`COALESCE(${canQueryWorkoutExercises ? workoutExercises.performedAt : sql`NULL`}, ${canQueryWorkoutExercises ? workoutExercises.completedAt : sql`NULL`}, ${workouts.completedAt}, ${workouts.startedAt})`.as("session_date"),
    })
    .from(sets)
    .innerJoin(
      workoutExercises,
      and(eq(sets.workoutExerciseId, workoutExercises.id), eq(sets.workoutId, workoutExercises.workoutId))
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(sets.exerciseId, exerciseId))
    .groupBy(sets.workoutExerciseId, workoutExercises.workoutId, workoutExercises.performedAt, workoutExercises.completedAt, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`session_date`));

  // Legacy fallback: sets without workout_exercise_id get grouped by workout
  const legacy = await db
    .select({
      workoutId: sets.workoutId,
      maxWeight: sql<number>`MAX(${sets.weightKg})`.as("max_weight"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(eq(sets.exerciseId, exerciseId), sql`${sets.workoutExerciseId} IS NULL`))
    .groupBy(sets.workoutId, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`workout_date`));

  const points: SessionDataPoint[] = [
    ...result
      .filter((row) => row.maxWeight !== null && row.sessionDate !== null)
      .map((row) => ({
        date: row.sessionDate,
        value: row.maxWeight,
        workoutId: row.workoutId,
        workoutExerciseId: row.workoutExerciseId ?? null,
      })),
    ...legacy
      .filter((row) => row.maxWeight !== null && row.workoutDate !== null)
      .map((row) => ({
        date: row.workoutDate,
        value: row.maxWeight,
        workoutId: row.workoutId,
        workoutExerciseId: null,
      })),
  ];

  return points.sort((a, b) => b.date - a.date);
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

  const canQueryWorkoutExercises =
    hasColumn("workout_exercises", "performed_at") && hasColumn("workout_exercises", "completed_at");

  // Canonical path: group by workout_exercise (session)
  const allSets = await db
    .select({
      workoutId: workoutExercises.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
      performedAt: canQueryWorkoutExercises ? workoutExercises.performedAt : sql<number | null>`NULL`.as("performed_at"),
      completedAt: canQueryWorkoutExercises ? workoutExercises.completedAt : sql<number | null>`NULL`.as("completed_at"),
      workoutStartedAt: workouts.startedAt,
      workoutCompletedAt: workouts.completedAt,
      weightKg: sets.weightKg,
      reps: sets.reps,
    })
    .from(sets)
    .innerJoin(
      workoutExercises,
      and(eq(sets.workoutExerciseId, workoutExercises.id), eq(sets.workoutId, workoutExercises.workoutId))
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(
      eq(sets.exerciseId, exerciseId),
      sql`${sets.weightKg} IS NOT NULL`,
      sql`${sets.reps} IS NOT NULL`,
      sql`${sets.reps} > 0`
    ));

  const sessionMap = new Map<number, { date: number; maxE1RM: number; workoutId: number; workoutExerciseId: number }>();

  for (const set of allSets) {
    if (set.workoutExerciseId === null || set.weightKg === null || set.reps === null) continue;

    const e1rm = computeE1rm(formulaToUse, set.weightKg, set.reps);
    const date =
      set.performedAt ??
      set.completedAt ??
      set.workoutCompletedAt ??
      set.workoutStartedAt ??
      Date.now();

    const existing = sessionMap.get(set.workoutExerciseId);

    if (!existing || e1rm > existing.maxE1RM) {
      sessionMap.set(set.workoutExerciseId, {
        date,
        maxE1RM: e1rm,
        workoutId: set.workoutId,
        workoutExerciseId: set.workoutExerciseId,
      });
    }
  }

  // Legacy fallback: sets without workout_exercise_id get grouped by workout
  const legacySets = await db
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
      sql`${sets.workoutExerciseId} IS NULL`,
      sql`${sets.weightKg} IS NOT NULL`,
      sql`${sets.reps} IS NOT NULL`,
      sql`${sets.reps} > 0`
    ));

  const legacyMap = new Map<number, { date: number; maxE1RM: number; workoutId: number }>();
  for (const set of legacySets) {
    if (set.weightKg === null || set.reps === null) continue;
    const e1rm = computeE1rm(formulaToUse, set.weightKg, set.reps);
    const existing = legacyMap.get(set.workoutId);
    if (!existing || e1rm > existing.maxE1RM) {
      legacyMap.set(set.workoutId, {
        date: set.workoutDate,
        maxE1RM: e1rm,
        workoutId: set.workoutId,
      });
    }
  }

  const points: SessionDataPoint[] = [
    ...Array.from(sessionMap.values()).map((item) => ({
      date: item.date,
      value: item.maxE1RM,
      workoutId: item.workoutId,
      workoutExerciseId: item.workoutExerciseId,
    })),
    ...Array.from(legacyMap.values()).map((item) => ({
      date: item.date,
      value: item.maxE1RM,
      workoutId: item.workoutId,
      workoutExerciseId: null,
    })),
  ];

  return points.sort((a, b) => b.date - a.date);
}

/**
 * Get total volume (weight × reps) per session for an exercise
 */
export async function getTotalVolumePerSession(exerciseId: number): Promise<SessionDataPoint[]> {
  const canQueryWorkoutExercises =
    hasColumn("workout_exercises", "performed_at") && hasColumn("workout_exercises", "completed_at");

  const result = await db
    .select({
      totalVolume: sql<number>`SUM(${sets.weightKg} * ${sets.reps})`.as("total_volume"),
      workoutId: workoutExercises.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
      sessionDate: sql<number>`COALESCE(${canQueryWorkoutExercises ? workoutExercises.performedAt : sql`NULL`}, ${canQueryWorkoutExercises ? workoutExercises.completedAt : sql`NULL`}, ${workouts.completedAt}, ${workouts.startedAt})`.as("session_date"),
    })
    .from(sets)
    .innerJoin(
      workoutExercises,
      and(eq(sets.workoutExerciseId, workoutExercises.id), eq(sets.workoutId, workoutExercises.workoutId))
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(
      eq(sets.exerciseId, exerciseId),
      sql`${sets.weightKg} IS NOT NULL`,
      sql`${sets.reps} IS NOT NULL`
    ))
    .groupBy(sets.workoutExerciseId, workoutExercises.workoutId, workoutExercises.performedAt, workoutExercises.completedAt, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`session_date`));

  const legacy = await db
    .select({
      workoutId: sets.workoutId,
      totalVolume: sql<number>`SUM(${sets.weightKg} * ${sets.reps})`.as("total_volume"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(
      eq(sets.exerciseId, exerciseId),
      sql`${sets.workoutExerciseId} IS NULL`,
      sql`${sets.weightKg} IS NOT NULL`,
      sql`${sets.reps} IS NOT NULL`
    ))
    .groupBy(sets.workoutId, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`workout_date`));

  const points: SessionDataPoint[] = [
    ...result
      .filter((row) => row.totalVolume !== null && row.sessionDate !== null)
      .map((row) => ({
        date: row.sessionDate,
        value: row.totalVolume,
        workoutId: row.workoutId,
        workoutExerciseId: row.workoutExerciseId ?? null,
      })),
    ...legacy
      .filter((row) => row.totalVolume !== null && row.workoutDate !== null)
      .map((row) => ({
        date: row.workoutDate,
        value: row.totalVolume,
        workoutId: row.workoutId,
        workoutExerciseId: null,
      })),
  ];

  return points.sort((a, b) => b.date - a.date);
}

/**
 * Get maximum reps per session for an exercise
 */
export async function getMaxRepsPerSession(exerciseId: number): Promise<SessionDataPoint[]> {
  const canQueryWorkoutExercises =
    hasColumn("workout_exercises", "performed_at") && hasColumn("workout_exercises", "completed_at");

  const result = await db
    .select({
      maxReps: sql<number>`MAX(${sets.reps})`.as("max_reps"),
      workoutId: workoutExercises.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
      sessionDate: sql<number>`COALESCE(${canQueryWorkoutExercises ? workoutExercises.performedAt : sql`NULL`}, ${canQueryWorkoutExercises ? workoutExercises.completedAt : sql`NULL`}, ${workouts.completedAt}, ${workouts.startedAt})`.as("session_date"),
    })
    .from(sets)
    .innerJoin(
      workoutExercises,
      and(eq(sets.workoutExerciseId, workoutExercises.id), eq(sets.workoutId, workoutExercises.workoutId))
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(
      eq(sets.exerciseId, exerciseId),
      sql`${sets.reps} IS NOT NULL`
    ))
    .groupBy(sets.workoutExerciseId, workoutExercises.workoutId, workoutExercises.performedAt, workoutExercises.completedAt, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`session_date`));

  const legacy = await db
    .select({
      workoutId: sets.workoutId,
      maxReps: sql<number>`MAX(${sets.reps})`.as("max_reps"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(eq(sets.exerciseId, exerciseId), sql`${sets.workoutExerciseId} IS NULL`, sql`${sets.reps} IS NOT NULL`))
    .groupBy(sets.workoutId, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`workout_date`));

  const points: SessionDataPoint[] = [
    ...result
      .filter((row) => row.maxReps !== null && row.sessionDate !== null)
      .map((row) => ({
        date: row.sessionDate,
        value: row.maxReps,
        workoutId: row.workoutId,
        workoutExerciseId: row.workoutExerciseId ?? null,
      })),
    ...legacy
      .filter((row) => row.maxReps !== null && row.workoutDate !== null)
      .map((row) => ({
        date: row.workoutDate,
        value: row.maxReps,
        workoutId: row.workoutId,
        workoutExerciseId: null,
      })),
  ];

  return points.sort((a, b) => b.date - a.date);
}

/**
 * Get number of sets per session for an exercise
 */
export async function getNumberOfSetsPerSession(exerciseId: number): Promise<SessionDataPoint[]> {
  const canQueryWorkoutExercises =
    hasColumn("workout_exercises", "performed_at") && hasColumn("workout_exercises", "completed_at");

  const result = await db
    .select({
      setCount: sql<number>`COUNT(*)`.as("set_count"),
      workoutId: workoutExercises.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
      sessionDate: sql<number>`COALESCE(${canQueryWorkoutExercises ? workoutExercises.performedAt : sql`NULL`}, ${canQueryWorkoutExercises ? workoutExercises.completedAt : sql`NULL`}, ${workouts.completedAt}, ${workouts.startedAt})`.as("session_date"),
    })
    .from(sets)
    .innerJoin(
      workoutExercises,
      and(eq(sets.workoutExerciseId, workoutExercises.id), eq(sets.workoutId, workoutExercises.workoutId))
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(sets.exerciseId, exerciseId))
    .groupBy(sets.workoutExerciseId, workoutExercises.workoutId, workoutExercises.performedAt, workoutExercises.completedAt, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`session_date`));

  const legacy = await db
    .select({
      workoutId: sets.workoutId,
      setCount: sql<number>`COUNT(*)`.as("set_count"),
      workoutDate: sql<number>`COALESCE(${workouts.completedAt}, ${workouts.startedAt})`.as("workout_date"),
    })
    .from(sets)
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(and(eq(sets.exerciseId, exerciseId), sql`${sets.workoutExerciseId} IS NULL`))
    .groupBy(sets.workoutId, workouts.startedAt, workouts.completedAt)
    .orderBy(desc(sql`workout_date`));

  const points: SessionDataPoint[] = [
    ...result.map((row) => ({
      date: row.sessionDate,
      value: row.setCount,
      workoutId: row.workoutId,
      workoutExerciseId: row.workoutExerciseId ?? null,
    })),
    ...legacy.map((row) => ({
      date: row.workoutDate,
      value: row.setCount,
      workoutId: row.workoutId,
      workoutExerciseId: null,
    })),
  ];

  return points.sort((a, b) => b.date - a.date);
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
      workoutExerciseId: point.workoutExerciseId,
    };
  });
}
