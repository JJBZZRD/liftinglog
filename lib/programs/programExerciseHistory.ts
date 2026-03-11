import {
  addWorkoutExercise,
  addSet,
  completeExerciseEntry,
  getOrCreateActiveWorkout,
  getWorkoutExerciseById,
  updateSet,
} from "../db/workouts";
import {
  getCalendarExerciseById,
  getCalendarSetById,
  linkCalendarExerciseToWorkoutExercise,
  linkExerciseToDb,
  updateSetActuals,
} from "../db/programCalendar";
import { createExercise, getExerciseByName } from "../db/exercises";
import type {
  ProgramCalendarExerciseRow,
  ProgramCalendarSetRow,
} from "../db/schema";
import type { UnitPreference } from "../db/connection";
import { parseWeightInputToKg } from "../utils/units";

type LinkedWorkoutExercise = {
  id: number;
  workoutId: number;
  exerciseId: number;
};

type HistoryExercise = {
  id: number;
};

type ProgramExerciseContext = {
  exerciseId: number;
  linkedWorkoutExercise: LinkedWorkoutExercise;
};

export type CompleteProgramExerciseParams = {
  calendarExerciseId: number;
  calendarExercise: ProgramCalendarExerciseRow | null;
  exerciseName: string;
  sets: ProgramCalendarSetRow[];
  weightInputs: Record<number, string>;
  repsInputs: Record<number, string>;
  unitPreference: UnitPreference;
  performedAt: number;
};

export type PersistProgramSetParams = {
  calendarExerciseId: number;
  calendarExercise: ProgramCalendarExerciseRow | null;
  exerciseName: string;
  set: ProgramCalendarSetRow;
  weightInput?: string | null;
  repsInput?: string | null;
  unitPreference: UnitPreference;
  performedAt: number;
};

export type ProgramExerciseHistoryDeps = {
  getExerciseByName: (name: string) => Promise<HistoryExercise | null>;
  createExercise: (args: { name: string }) => Promise<number>;
  getCalendarExerciseById: (
    calendarExerciseId: number
  ) => Promise<ProgramCalendarExerciseRow | null>;
  getCalendarSetById: (
    calendarSetId: number
  ) => Promise<ProgramCalendarSetRow | null>;
  getWorkoutExerciseById: (id: number) => Promise<{
    id: number;
    workoutId: number;
    exerciseId: number;
  } | null>;
  getOrCreateActiveWorkout: () => Promise<number>;
  addWorkoutExercise: (args: {
    workout_id: number;
    exercise_id: number;
    order_index?: number | null;
    performed_at?: number | null;
  }) => Promise<number>;
  linkExerciseToDb: (calendarExerciseId: number, exerciseId: number) => Promise<void>;
  linkCalendarExerciseToWorkoutExercise: (
    calendarExerciseId: number,
    workoutExerciseId: number | null
  ) => Promise<void>;
  updateSet: (setId: number, updates: {
    weight_kg?: number | null;
    reps?: number | null;
    set_index?: number | null;
    performed_at?: number | null;
  }) => Promise<void>;
  addSet: (args: {
    workout_id: number;
    exercise_id: number;
    workout_exercise_id?: number | null;
    set_index?: number | null;
    weight_kg?: number | null;
    reps?: number | null;
    performed_at?: number | null;
  }) => Promise<number>;
  updateSetActuals: (setId: number, data: {
    actualWeight?: number | null;
    actualReps?: number | null;
    actualRpe?: number | null;
    isLogged?: boolean;
    setId_fk?: number | null;
  }) => Promise<void>;
  completeExerciseEntry: (workoutExerciseId: number, performedAt?: number) => Promise<void>;
};

const defaultDeps: ProgramExerciseHistoryDeps = {
  getExerciseByName,
  createExercise,
  getCalendarExerciseById: async (calendarExerciseId: number) =>
    (await getCalendarExerciseById(calendarExerciseId)) ?? null,
  getCalendarSetById: async (calendarSetId: number) =>
    (await getCalendarSetById(calendarSetId)) ?? null,
  getWorkoutExerciseById,
  getOrCreateActiveWorkout,
  addWorkoutExercise,
  linkExerciseToDb,
  linkCalendarExerciseToWorkoutExercise,
  updateSet,
  addSet,
  updateSetActuals,
  completeExerciseEntry,
};

async function ensureLinkedWorkoutExercise(
  params: {
    calendarExerciseId: number;
    calendarExercise: ProgramCalendarExerciseRow | null;
    exerciseId: number;
    performedAt: number;
  },
  deps: ProgramExerciseHistoryDeps
): Promise<LinkedWorkoutExercise> {
  const existingLinkedId = params.calendarExercise?.workoutExerciseId ?? null;
  if (existingLinkedId) {
    const existingLinked = await deps.getWorkoutExerciseById(existingLinkedId);
    if (existingLinked && existingLinked.exerciseId === params.exerciseId) {
      return {
        id: existingLinked.id,
        workoutId: existingLinked.workoutId,
        exerciseId: existingLinked.exerciseId,
      };
    }
  }

  const workoutId = await deps.getOrCreateActiveWorkout();
  const workoutExerciseId = await deps.addWorkoutExercise({
    workout_id: workoutId,
    exercise_id: params.exerciseId,
    order_index: params.calendarExercise?.orderIndex ?? 0,
    performed_at: params.performedAt,
  });

  await deps.linkCalendarExerciseToWorkoutExercise(
    params.calendarExerciseId,
    workoutExerciseId
  );

  return {
    id: workoutExerciseId,
    workoutId,
    exerciseId: params.exerciseId,
  };
}

function resolveLoggedSetInput(params: {
  set: ProgramCalendarSetRow;
  weightInput?: string | null;
  repsInput?: string | null;
  unitPreference: UnitPreference;
}): {
  weightKg: number | null;
  reps: number | null;
  isComplete: boolean;
} {
  const normalizedWeightInput = params.weightInput?.trim() ?? "";
  const normalizedRepsInput = params.repsInput?.trim() ?? "";
  const weightKg =
    (normalizedWeightInput
      ? parseWeightInputToKg(normalizedWeightInput, params.unitPreference)
      : null) ??
    params.set.actualWeight ??
    null;
  const reps =
    (normalizedRepsInput ? parseInt(normalizedRepsInput, 10) : null) ??
    params.set.actualReps ??
    null;
  const isComplete = weightKg !== null && reps !== null && weightKg > 0 && reps > 0;

  return {
    weightKg,
    reps,
    isComplete,
  };
}

async function resolveProgramExerciseContext(
  params: {
    calendarExerciseId: number;
    calendarExercise: ProgramCalendarExerciseRow | null;
    exerciseName: string;
    performedAt: number;
  },
  deps: ProgramExerciseHistoryDeps
): Promise<ProgramExerciseContext> {
  const latestCalendarExercise =
    (await deps.getCalendarExerciseById(params.calendarExerciseId)) ??
    params.calendarExercise;

  let exerciseId = latestCalendarExercise?.exerciseId ?? null;
  if (!exerciseId) {
    const existingExercise = await deps.getExerciseByName(params.exerciseName);
    exerciseId =
      existingExercise?.id ?? (await deps.createExercise({ name: params.exerciseName }));
    await deps.linkExerciseToDb(params.calendarExerciseId, exerciseId);
  }

  const linkedWorkoutExercise = await ensureLinkedWorkoutExercise(
    {
      calendarExerciseId: params.calendarExerciseId,
      calendarExercise: latestCalendarExercise,
      exerciseId,
      performedAt: params.performedAt,
    },
    deps
  );

  return {
    exerciseId,
    linkedWorkoutExercise,
  };
}

export async function persistProgramSetToWorkoutHistory(
  params: PersistProgramSetParams,
  deps: ProgramExerciseHistoryDeps = defaultDeps
): Promise<{ workoutExerciseId: number | null; linkedSetId: number | null }> {
  const latestCalendarSet =
    (await deps.getCalendarSetById(params.set.id)) ?? params.set;

  const { weightKg, reps, isComplete } = resolveLoggedSetInput({
    set: latestCalendarSet,
    weightInput: params.weightInput,
    repsInput: params.repsInput,
    unitPreference: params.unitPreference,
  });

  if (!isComplete) {
    return {
      workoutExerciseId: null,
      linkedSetId: null,
    };
  }

  const context = await resolveProgramExerciseContext(
    {
      calendarExerciseId: params.calendarExerciseId,
      calendarExercise: params.calendarExercise,
      exerciseName: params.exerciseName,
      performedAt: params.performedAt,
    },
    deps
  );

  if (latestCalendarSet.setId) {
    await deps.updateSet(latestCalendarSet.setId, {
      weight_kg: weightKg,
      reps,
      set_index: latestCalendarSet.setIndex,
      performed_at: params.performedAt,
    });
    await deps.updateSetActuals(latestCalendarSet.id, {
      actualWeight: weightKg,
      actualReps: reps,
      isLogged: true,
      setId_fk: latestCalendarSet.setId,
    });
    await deps.completeExerciseEntry(
      context.linkedWorkoutExercise.id,
      params.performedAt
    );
    return {
      workoutExerciseId: context.linkedWorkoutExercise.id,
      linkedSetId: latestCalendarSet.setId,
    };
  }

  const linkedSetId = await deps.addSet({
    workout_id: context.linkedWorkoutExercise.workoutId,
    exercise_id: context.exerciseId,
    workout_exercise_id: context.linkedWorkoutExercise.id,
    set_index: latestCalendarSet.setIndex,
    weight_kg: weightKg,
    reps,
    performed_at: params.performedAt,
  });

  await deps.updateSetActuals(latestCalendarSet.id, {
    actualWeight: weightKg,
    actualReps: reps,
    isLogged: true,
    setId_fk: linkedSetId,
  });
  await deps.completeExerciseEntry(
    context.linkedWorkoutExercise.id,
    params.performedAt
  );

  return {
    workoutExerciseId: context.linkedWorkoutExercise.id,
    linkedSetId,
  };
}

export async function persistCompletedProgramExercise(
  params: CompleteProgramExerciseParams,
  deps: ProgramExerciseHistoryDeps = defaultDeps
): Promise<{ workoutExerciseId: number; linkedSetIds: number[] }> {
  const linkedSetIds: number[] = [];
  let workoutExerciseId: number | null = null;

  for (const set of params.sets) {
    const result = await persistProgramSetToWorkoutHistory(
      {
        calendarExerciseId: params.calendarExerciseId,
        calendarExercise: params.calendarExercise,
        exerciseName: params.exerciseName,
        set,
        weightInput: params.weightInputs[set.id],
        repsInput: params.repsInputs[set.id],
        unitPreference: params.unitPreference,
        performedAt: params.performedAt,
      },
      deps
    );

    if (result.workoutExerciseId && workoutExerciseId === null) {
      workoutExerciseId = result.workoutExerciseId;
    }
    if (result.linkedSetId) {
      linkedSetIds.push(result.linkedSetId);
    }
  }

  if (workoutExerciseId === null) {
    throw new Error("Log at least one complete set before finishing the exercise.");
  }

  return {
    workoutExerciseId,
    linkedSetIds,
  };
}
