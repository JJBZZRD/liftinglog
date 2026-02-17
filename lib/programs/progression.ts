/**
 * Progression engine (v1)
 *
 * Evaluates progression rules to suggest the next target weight
 * based on the last completed session for that exercise.
 */

import { desc, eq, isNotNull, and } from "drizzle-orm";
import { db, hasColumn } from "../db/connection";
import { sets, workoutExercises } from "../db/schema";
import type { ProgressionRow } from "../db/schema";
import type { ProgramPrescriptionV1 } from "./prescription";

/**
 * Get the last completed session data for an exercise.
 * Returns the sets from the most recent completed workout_exercise entry.
 */
async function getLastCompletedSession(exerciseId: number): Promise<{
  sets: Array<{ weightKg: number; reps: number; rpe: number | null }>;
} | null> {
  const canQuery =
    hasColumn("workout_exercises", "performed_at") &&
    hasColumn("workout_exercises", "completed_at");

  if (!canQuery) return null;

  // Find the most recent completed workout_exercise for this exercise
  const recentEntries = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        isNotNull(workoutExercises.completedAt)
      )
    )
    .orderBy(desc(workoutExercises.performedAt))
    .limit(1);

  if (recentEntries.length === 0) return null;

  const weId = recentEntries[0].id;

  // Get sets for that entry
  const sessionSets = await db
    .select({
      weightKg: sets.weightKg,
      reps: sets.reps,
      rpe: sets.rpe,
    })
    .from(sets)
    .where(eq(sets.workoutExerciseId, weId))
    .orderBy(sets.setIndex, sets.id);

  const validSets = sessionSets.filter(
    (s): s is { weightKg: number; reps: number; rpe: number | null } =>
      s.weightKg !== null && s.reps !== null && s.weightKg > 0 && s.reps > 0
  );

  if (validSets.length === 0) return null;

  return { sets: validSets };
}

/**
 * Evaluate a progression rule and return the suggested weight in kg.
 * Returns null if no suggestion can be made (e.g., no history).
 */
export async function evaluateProgression(
  exerciseId: number,
  progression: ProgressionRow,
  prescription: ProgramPrescriptionV1 | null
): Promise<number | null> {
  const lastSession = await getLastCompletedSession(exerciseId);
  if (!lastSession || lastSession.sets.length === 0) return null;

  const lastMaxWeight = Math.max(...lastSession.sets.map((s) => s.weightKg));
  const lastAvgWeight =
    lastSession.sets.reduce((sum, s) => sum + s.weightKg, 0) / lastSession.sets.length;

  switch (progression.type) {
    case "kg_per_session": {
      const suggested = lastMaxWeight + progression.value;
      if (progression.capKg !== null && suggested > progression.capKg) {
        return progression.capKg;
      }
      return Math.round(suggested * 4) / 4; // Round to nearest 0.25 kg
    }

    case "percent_per_session": {
      const multiplier = 1 + progression.value / 100;
      const suggested = lastMaxWeight * multiplier;
      if (progression.capKg !== null && suggested > progression.capKg) {
        return progression.capKg;
      }
      return Math.round(suggested * 4) / 4;
    }

    case "double_progression": {
      // If all sets met target reps (use max from prescription), increase weight
      // Otherwise keep the same weight
      const targetReps = getTargetMaxReps(prescription);
      if (targetReps === null) return lastMaxWeight;

      const allMet = lastSession.sets.every((s) => s.reps >= targetReps);
      if (allMet) {
        const suggested = lastMaxWeight + progression.value;
        if (progression.capKg !== null && suggested > progression.capKg) {
          return progression.capKg;
        }
        return Math.round(suggested * 4) / 4;
      }
      return lastMaxWeight;
    }

    case "autoreg_rpe": {
      // Basic autoregulation: if average RPE was below target, increase weight
      const rpeReadings = lastSession.sets
        .map((s) => s.rpe)
        .filter((r): r is number => r !== null);

      if (rpeReadings.length === 0) return lastMaxWeight; // No RPE data, no change

      const avgRpe = rpeReadings.reduce((a, b) => a + b, 0) / rpeReadings.length;
      const targetRpe = progression.value;

      if (avgRpe < targetRpe - 0.5) {
        // RPE was too easy, increase
        const bump = Math.max(2.5, lastMaxWeight * 0.025);
        const suggested = lastMaxWeight + bump;
        if (progression.capKg !== null && suggested > progression.capKg) {
          return progression.capKg;
        }
        return Math.round(suggested * 4) / 4;
      } else if (avgRpe > targetRpe + 0.5) {
        // RPE was too hard, decrease
        const drop = Math.max(2.5, lastMaxWeight * 0.025);
        return Math.round((lastMaxWeight - drop) * 4) / 4;
      }

      return lastMaxWeight; // RPE was on target
    }

    default:
      return null;
  }
}

/**
 * Extract the max target reps from a prescription (for double_progression).
 */
function getTargetMaxReps(prescription: ProgramPrescriptionV1 | null): number | null {
  if (!prescription) return null;

  for (const block of prescription.blocks) {
    if (block.kind === "work") {
      if (block.reps.type === "range") return block.reps.max;
      if (block.reps.type === "fixed") return block.reps.value;
    }
  }
  return null;
}
