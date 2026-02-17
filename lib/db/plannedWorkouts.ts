import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { db, sqlite } from "./connection";
import {
  plannedWorkouts,
  programDays,
  programExercises,
  exercises,
  type PlannedWorkoutRow,
  type ProgramExerciseRow,
} from "./schema";
import { getOrCreateActiveWorkout, addWorkoutExercise, addSet } from "./workouts";
import { getActiveProgram } from "./programs";
import { listProgramDays } from "./programDays";
import { listProgramExercises } from "./programExercises";
import { listProgressionsForExercise } from "./progressions";
import { parseProgramPrescription, type ProgramPrescriptionV1 } from "../programs/prescription";
import { evaluateProgression } from "../programs/progression";

export type PlannedWorkout = PlannedWorkoutRow;

// ============================================================================
// CRUD
// ============================================================================

export async function createPlannedWorkout(data: {
  program_id: number;
  program_day_id: number;
  planned_for: number;
  note?: string | null;
}): Promise<number> {
  const res = await db
    .insert(plannedWorkouts)
    .values({
      programId: data.program_id,
      programDayId: data.program_day_id,
      plannedFor: data.planned_for,
      note: data.note ?? null,
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function getPlannedWorkoutById(id: number): Promise<PlannedWorkout | null> {
  const rows = await db
    .select()
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.id, id));
  return rows[0] ?? null;
}

export async function listPlannedWorkoutsInRange(
  programId: number,
  startMs: number,
  endMs: number
): Promise<PlannedWorkout[]> {
  return db
    .select()
    .from(plannedWorkouts)
    .where(
      and(
        eq(plannedWorkouts.programId, programId),
        gte(plannedWorkouts.plannedFor, startMs),
        lte(plannedWorkouts.plannedFor, endMs)
      )
    )
    .orderBy(plannedWorkouts.plannedFor);
}

export async function getNextPlannedWorkout(programId: number): Promise<PlannedWorkout | null> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const rows = await db
    .select()
    .from(plannedWorkouts)
    .where(
      and(
        eq(plannedWorkouts.programId, programId),
        gte(plannedWorkouts.plannedFor, todayStart.getTime())
      )
    )
    .orderBy(plannedWorkouts.plannedFor)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Reschedule a planned workout to a new date.
 */
export async function reschedulePlannedWorkout(
  id: number,
  newPlannedFor: number
): Promise<void> {
  await db
    .update(plannedWorkouts)
    .set({ plannedFor: newPlannedFor })
    .where(eq(plannedWorkouts.id, id))
    .run();
}

/**
 * Skip a planned workout (delete the row).
 */
export async function skipPlannedWorkout(id: number): Promise<void> {
  await db.delete(plannedWorkouts).where(eq(plannedWorkouts.id, id)).run();
}

// ============================================================================
// Rolling 8-week window generation
// ============================================================================

function dayKeyFromTimestamp(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDayStartMs(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Generate planned_workouts rows for the active program for the next ~8 weeks.
 * Called on ProgramsHome focus and after activating/importing a program.
 *
 * Supports two modes:
 * 1. Calendar-based days: day_of_week is null, note contains a dayKey (YYYY-MM-DD).
 *    These are created directly as planned_workouts for that specific date.
 * 2. Legacy weekly/interval: day_of_week is set (weekly) or schedule='interval'.
 *    These repeat on matching days of the week or in rotation.
 */
export async function generatePlannedWorkoutsWindow(programId: number): Promise<number> {
  const days = await listProgramDays(programId);
  if (days.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 56); // 8 weeks

  // Fetch existing planned_workouts in range to avoid duplicates
  const existing = await listPlannedWorkoutsInRange(
    programId,
    today.getTime(),
    windowEnd.getTime()
  );
  const existingDayKeys = new Set<string>();
  for (const pw of existing) {
    existingDayKeys.add(dayKeyFromTimestamp(pw.plannedFor));
  }

  // Separate days by type:
  // Calendar-based: note is a dayKey (YYYY-MM-DD) and dayOfWeek is null
  const calendarDays = days.filter(
    (d) => d.dayOfWeek === null && d.note && /^\d{4}-\d{2}-\d{2}$/.test(d.note)
  );
  // Legacy weekly: dayOfWeek is set
  const weeklyDays = days.filter((d) => d.schedule === "weekly" && d.dayOfWeek !== null);
  // Legacy interval
  const intervalDays = days.filter(
    (d) => d.schedule === "interval" && d.dayOfWeek === null && !(d.note && /^\d{4}-\d{2}-\d{2}$/.test(d.note))
  );

  let inserted = 0;

  // Generate calendar-based days (specific dates)
  for (const day of calendarDays) {
    const dk = day.note!;
    if (existingDayKeys.has(dk)) continue;

    const dateMs = new Date(dk + "T00:00:00").getTime();
    // Only create if the date is within the window
    if (dateMs >= today.getTime() && dateMs <= windowEnd.getTime()) {
      await createPlannedWorkout({
        program_id: programId,
        program_day_id: day.id,
        planned_for: dateMs,
        note: dk,
      });
      existingDayKeys.add(dk);
      inserted++;
    }
  }

  // Generate weekly schedule (legacy)
  for (let offset = 0; offset <= 56; offset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const jsDay = date.getDay(); // 0=Sun .. 6=Sat
    const dk = dayKeyFromTimestamp(date.getTime());

    if (existingDayKeys.has(dk)) continue;

    // Find matching weekly day (at most one per date for v1 dedupe)
    const match = weeklyDays.find((d) => d.dayOfWeek === jsDay);
    if (match) {
      await createPlannedWorkout({
        program_id: programId,
        program_day_id: match.id,
        planned_for: localDayStartMs(date),
        note: match.note,
      });
      existingDayKeys.add(dk);
      inserted++;
    }
  }

  // Generate interval schedule (rotation)
  if (intervalDays.length > 0) {
    // Find the last planned_workouts entry to determine rotation position
    const lastPlanned = await db
      .select()
      .from(plannedWorkouts)
      .where(eq(plannedWorkouts.programId, programId))
      .orderBy(desc(plannedWorkouts.plannedFor))
      .limit(1);

    let rotationIndex = 0;
    let nextDate = new Date(today);

    if (lastPlanned.length > 0) {
      // Find what day_id was last used and advance rotation
      const lastDayId = lastPlanned[0].programDayId;
      const lastIdx = intervalDays.findIndex((d) => d.id === lastDayId);
      if (lastIdx >= 0) {
        rotationIndex = (lastIdx + 1) % intervalDays.length;
      }
      // Start from day after the last planned entry if it's in the future
      const lastDate = new Date(lastPlanned[0].plannedFor);
      const intervalForLastDay = intervalDays[lastIdx >= 0 ? lastIdx : 0]?.intervalDays ?? 1;
      lastDate.setDate(lastDate.getDate() + intervalForLastDay);
      if (lastDate > nextDate) {
        nextDate = lastDate;
      }
    }

    // Generate interval entries
    while (nextDate <= windowEnd) {
      const dk = dayKeyFromTimestamp(nextDate.getTime());
      if (!existingDayKeys.has(dk)) {
        const currentDay = intervalDays[rotationIndex];
        await createPlannedWorkout({
          program_id: programId,
          program_day_id: currentDay.id,
          planned_for: localDayStartMs(nextDate),
          note: currentDay.note,
        });
        existingDayKeys.add(dk);
        inserted++;
      }

      const currentDay = intervalDays[rotationIndex];
      const gap = currentDay.intervalDays ?? 1;
      nextDate.setDate(nextDate.getDate() + gap);
      rotationIndex = (rotationIndex + 1) % intervalDays.length;
    }
  }

  return inserted;
}

// ============================================================================
// Calendar status helpers
// ============================================================================

/**
 * Get completed dayKeys between start and end timestamps.
 * A dayKey is considered completed if there exists at least one
 * completed workout_exercise with performed_at on that calendar day.
 */
export function getCompletedDayKeysInRange(startMs: number, endMs: number): string[] {
  const stmt = sqlite.prepareSync(`
    SELECT DISTINCT strftime('%Y-%m-%d', we.performed_at/1000, 'unixepoch', 'localtime') AS dayKey
    FROM workout_exercises we
    WHERE we.completed_at IS NOT NULL
      AND we.performed_at >= ?
      AND we.performed_at <= ?
  `);
  try {
    const result = stmt.executeSync([startMs, endMs]);
    const rows = result.getAllSync() as Array<{ dayKey: string }>;
    return rows.map((r) => r.dayKey);
  } finally {
    stmt.finalizeSync();
  }
}

// ============================================================================
// Apply/Start a planned day
// ============================================================================

export type AppliedExercise = {
  workoutExerciseId: number;
  exerciseId: number;
  exerciseName: string;
};

/**
 * Apply a planned workout to the active workout container.
 * Creates workout_exercises + placeholder sets for each program_exercise
 * in the planned day.
 */
export async function applyPlannedWorkout(
  plannedWorkoutId: number
): Promise<AppliedExercise[]> {
  const pw = await getPlannedWorkoutById(plannedWorkoutId);
  if (!pw) throw new Error("Planned workout not found");

  const programExercisesList = await listProgramExercises(pw.programDayId);
  if (programExercisesList.length === 0) return [];

  const workoutId = await getOrCreateActiveWorkout();
  const plannedFor = pw.plannedFor;

  // Determine starting order_index (append after existing entries)
  const maxOrderStmt = sqlite.prepareSync(
    `SELECT MAX(order_index) AS maxIdx FROM workout_exercises WHERE workout_id = ?`
  );
  let startOrderIndex = 0;
  try {
    const result = maxOrderStmt.executeSync([workoutId]);
    const row = result.getFirstSync() as { maxIdx: number | null } | null;
    startOrderIndex = (row?.maxIdx ?? -1) + 1;
  } finally {
    maxOrderStmt.finalizeSync();
  }

  const appliedExercises: AppliedExercise[] = [];

  for (let i = 0; i < programExercisesList.length; i++) {
    const pe = programExercisesList[i];

    // Get exercise name for navigation
    const exerciseRows = await db
      .select({ name: exercises.name })
      .from(exercises)
      .where(eq(exercises.id, pe.exerciseId))
      .limit(1);
    const exerciseName = exerciseRows[0]?.name ?? "Exercise";

    // Evaluate progression to get suggested weight
    const progressionsList = await listProgressionsForExercise(pe.id);
    const prescription = parseProgramPrescription(pe.prescriptionJson);
    let suggestedWeight: number | null = null;

    if (progressionsList.length > 0) {
      suggestedWeight = await evaluateProgression(
        pe.exerciseId,
        progressionsList[0],
        prescription
      );
    }

    // Create workout_exercise
    const weId = await addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: pe.exerciseId,
      order_index: startOrderIndex + i,
      note: prescription?.notes ?? null,
      performed_at: plannedFor,
    });

    // Generate planned sets from prescription with weight pre-filled
    // Sets are marked with [PLANNED] prefix in the note so the UI can distinguish them
    if (prescription) {
      let setIdx = 1;
      for (const block of prescription.blocks) {
        if (block.kind === "warmup") {
          for (let s = 0; s < block.sets; s++) {
            await addSet({
              workout_id: workoutId,
              exercise_id: pe.exerciseId,
              workout_exercise_id: weId,
              set_index: setIdx++,
              is_warmup: true,
              weight_kg: null,
              reps: block.reps ?? null,
              note: `[PLANNED] Warmup ${s + 1}/${block.sets}`,
              performed_at: plannedFor,
            });
          }
        } else if (block.kind === "work") {
          const targetReps =
            block.reps.type === "fixed"
              ? block.reps.value
              : block.reps.type === "range"
              ? block.reps.min
              : null;

          let noteStr = "";
          if (block.reps.type === "range") {
            noteStr = `Target: ${block.reps.min}-${block.reps.max} reps`;
          }

          // Resolve the weight for this block
          let blockWeight: number | null = null;
          if (block.target) {
            if (block.target.type === "fixed_weight_kg") {
              blockWeight = block.target.value;
              if (suggestedWeight === null) suggestedWeight = block.target.value;
            } else if (block.target.type === "rpe") {
              noteStr += `${noteStr ? ", " : "Target: "}RPE ${block.target.value}`;
            } else if (block.target.type === "rir") {
              noteStr += `${noteStr ? ", " : "Target: "}RIR ${block.target.value}`;
            } else if (block.target.type === "percent_e1rm") {
              noteStr += `${noteStr ? ", " : "Target: "}${block.target.value}% e1RM`;
            }
          }

          // Use the resolved weight: blockWeight > suggestedWeight (from progression) > null
          const setWeight = blockWeight ?? suggestedWeight ?? null;

          for (let s = 0; s < block.sets; s++) {
            await addSet({
              workout_id: workoutId,
              exercise_id: pe.exerciseId,
              workout_exercise_id: weId,
              set_index: setIdx++,
              is_warmup: false,
              weight_kg: setWeight,
              reps: targetReps,
              rpe: block.target?.type === "rpe" ? block.target.value : null,
              rir: block.target?.type === "rir" ? block.target.value : null,
              note: `[PLANNED]${noteStr ? " " + noteStr : ""}`,
              performed_at: plannedFor,
            });
          }
        }
      }
    }

    appliedExercises.push({
      workoutExerciseId: weId,
      exerciseId: pe.exerciseId,
      exerciseName,
    });
  }

  return appliedExercises;
}
