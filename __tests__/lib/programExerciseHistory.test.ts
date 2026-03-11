import type {
  ProgramCalendarExerciseRow,
  ProgramCalendarSetRow,
} from "../../lib/db/schema";
import type { ProgramExerciseHistoryDeps } from "../../lib/programs/programExerciseHistory";

let persistCompletedProgramExercise: typeof import("../../lib/programs/programExerciseHistory").persistCompletedProgramExercise;
let persistProgramSetToWorkoutHistory: typeof import("../../lib/programs/programExerciseHistory").persistProgramSetToWorkoutHistory;

jest.mock("../../lib/db/workouts", () => ({
  addWorkoutExercise: jest.fn(),
  addSet: jest.fn(),
  completeExerciseEntry: jest.fn(),
  getOrCreateActiveWorkout: jest.fn(),
  getWorkoutExerciseById: jest.fn(),
  updateSet: jest.fn(),
}));

jest.mock("../../lib/db/programCalendar", () => ({
  getCalendarExerciseById: jest.fn(),
  getCalendarSetById: jest.fn(),
  linkCalendarExerciseToWorkoutExercise: jest.fn(),
  linkExerciseToDb: jest.fn(),
  updateSetActuals: jest.fn(),
}));

jest.mock("../../lib/db/exercises", () => ({
  createExercise: jest.fn(),
  getExerciseByName: jest.fn(),
}));

type MockExercise = {
  id: number;
  name: string;
};

type MockWorkoutExercise = {
  id: number;
  workoutId: number;
  exerciseId: number;
  completedAt: number | null;
  performedAt: number | null;
  orderIndex: number | null;
};

type MockSet = {
  id: number;
  workoutId: number;
  exerciseId: number;
  workoutExerciseId: number | null;
  setIndex: number | null;
  weightKg: number | null;
  reps: number | null;
  performedAt: number | null;
};

type MockStore = {
  nextExerciseId: number;
  nextWorkoutExerciseId: number;
  nextSetId: number;
  workoutId: number;
  exercises: MockExercise[];
  workoutExercises: MockWorkoutExercise[];
  sets: MockSet[];
  calendarExercise: ProgramCalendarExerciseRow;
  calendarSets: ProgramCalendarSetRow[];
};

function createStore(staleWorkoutExerciseId: number | null = null): MockStore {
  return {
    nextExerciseId: 10,
    nextWorkoutExerciseId: 100,
    nextSetId: 1000,
    workoutId: 1,
    exercises: [{ id: 5, name: "Bench Press" }],
    workoutExercises: [],
    sets: [],
    calendarExercise: {
      id: 1,
      calendarId: 11,
      exerciseName: "Bench Press",
      exerciseId: 5,
      orderIndex: 0,
      prescribedSetsJson: "[]",
      status: "pending",
      workoutExerciseId: staleWorkoutExerciseId,
    },
    calendarSets: [
      {
        id: 1,
        calendarExerciseId: 1,
        setIndex: 0,
        prescribedReps: "8",
        prescribedIntensityJson: null,
        prescribedRole: "work",
        actualWeight: null,
        actualReps: null,
        actualRpe: null,
        isUserAdded: false,
        isLogged: false,
        setId: null,
        loggedAt: null,
      },
    ],
  };
}

function buildHistoryDays(store: MockStore) {
  return store.workoutExercises
    .filter(
      (entry) =>
        entry.completedAt !== null &&
        entry.performedAt !== null &&
        store.sets.some((set) => set.workoutExerciseId === entry.id)
    )
    .map((entry) => ({
      workoutExerciseId: entry.id,
      exerciseId: entry.exerciseId,
      sets: store.sets.filter((set) => set.workoutExerciseId === entry.id),
    }));
}

function buildExerciseHistory(store: MockStore, exerciseId: number) {
  return store.workoutExercises
    .filter(
      (entry) =>
        entry.exerciseId === exerciseId &&
        store.sets.some((set) => set.workoutExerciseId === entry.id)
    )
    .map((entry) => ({
      workoutExerciseId: entry.id,
      exerciseId: entry.exerciseId,
      completedAt: entry.completedAt,
      sets: store.sets.filter((set) => set.workoutExerciseId === entry.id),
    }));
}

function createDeps(store: MockStore): ProgramExerciseHistoryDeps {
  return {
    getExerciseByName: jest.fn(async (name: string) => {
      return store.exercises.find((exercise) => exercise.name === name) ?? null;
    }),
    createExercise: jest.fn(async ({ name }: { name: string }) => {
      const id = store.nextExerciseId++;
      store.exercises.push({ id, name });
      return id;
    }),
    getCalendarExerciseById: jest.fn(async (id: number) => {
      return store.calendarExercise.id === id ? store.calendarExercise : null;
    }),
    getCalendarSetById: jest.fn(async (id: number) => {
      return store.calendarSets.find((set) => set.id === id) ?? null;
    }),
    getWorkoutExerciseById: jest.fn(async (id: number) => {
      return (
        store.workoutExercises.find((entry) => entry.id === id) ?? null
      );
    }),
    getOrCreateActiveWorkout: jest.fn(async () => store.workoutId),
    addWorkoutExercise: jest.fn(async (args: {
      workout_id: number;
      exercise_id: number;
      order_index?: number | null;
      performed_at?: number | null;
    }) => {
      const id = store.nextWorkoutExerciseId++;
      store.workoutExercises.push({
        id,
        workoutId: args.workout_id,
        exerciseId: args.exercise_id,
        completedAt: null,
        performedAt: args.performed_at ?? Date.now(),
        orderIndex: args.order_index ?? null,
      });
      return id;
    }),
    linkExerciseToDb: jest.fn(async (_calendarExerciseId: number, exerciseId: number) => {
      store.calendarExercise = { ...store.calendarExercise, exerciseId };
    }),
    linkCalendarExerciseToWorkoutExercise: jest.fn(async (_calendarExerciseId: number, workoutExerciseId: number | null) => {
      store.calendarExercise = { ...store.calendarExercise, workoutExerciseId };
    }),
    updateSet: jest.fn(async (setId: number, updates: {
      weight_kg?: number | null;
      reps?: number | null;
      set_index?: number | null;
      performed_at?: number | null;
    }) => {
      store.sets = store.sets.map((set) =>
        set.id !== setId
          ? set
          : {
              ...set,
              weightKg: updates.weight_kg !== undefined ? updates.weight_kg : set.weightKg,
              reps: updates.reps !== undefined ? updates.reps : set.reps,
              setIndex: updates.set_index !== undefined ? updates.set_index : set.setIndex,
              performedAt:
                updates.performed_at !== undefined ? updates.performed_at : set.performedAt,
            }
      );
    }),
    addSet: jest.fn(async (args: {
      workout_id: number;
      exercise_id: number;
      workout_exercise_id?: number | null;
      set_index?: number | null;
      weight_kg?: number | null;
      reps?: number | null;
      performed_at?: number | null;
    }) => {
      if (
        args.workout_exercise_id !== null &&
        args.workout_exercise_id !== undefined &&
        !store.workoutExercises.some((entry) => entry.id === args.workout_exercise_id)
      ) {
        throw new Error(`Unknown workout exercise ${args.workout_exercise_id}`);
      }

      const id = store.nextSetId++;
      store.sets.push({
        id,
        workoutId: args.workout_id,
        exerciseId: args.exercise_id,
        workoutExerciseId: args.workout_exercise_id ?? null,
        setIndex: args.set_index ?? null,
        weightKg: args.weight_kg ?? null,
        reps: args.reps ?? null,
        performedAt: args.performed_at ?? Date.now(),
      });
      return id;
    }),
    updateSetActuals: jest.fn(async (setId: number, updates: {
      actualWeight?: number | null;
      actualReps?: number | null;
      isLogged?: boolean;
      setId_fk?: number | null;
    }) => {
      store.calendarSets = store.calendarSets.map((set) =>
        set.id !== setId
          ? set
          : {
              ...set,
              actualWeight:
                updates.actualWeight !== undefined ? updates.actualWeight : set.actualWeight,
              actualReps:
                updates.actualReps !== undefined ? updates.actualReps : set.actualReps,
              isLogged: updates.isLogged !== undefined ? updates.isLogged : set.isLogged,
              setId: updates.setId_fk !== undefined ? updates.setId_fk : set.setId,
              loggedAt:
                updates.isLogged === true ? Date.now() : updates.isLogged === false ? null : set.loggedAt,
            }
      );
    }),
    completeExerciseEntry: jest.fn(async (workoutExerciseId: number, performedAt?: number) => {
      store.workoutExercises = store.workoutExercises.map((entry) =>
        entry.id !== workoutExerciseId
          ? entry
          : {
              ...entry,
              completedAt: performedAt ?? Date.now(),
              performedAt: performedAt ?? entry.performedAt,
            }
      );
    }),
  };
}

describe("persistCompletedProgramExercise", () => {
  beforeEach(async () => {
    ({
      persistCompletedProgramExercise,
      persistProgramSetToWorkoutHistory,
    } = await import(
      "../../lib/programs/programExerciseHistory"
    ));
  });

  it("persists a programmed set into the main workout tables before completion", async () => {
    const store = createStore();
    const deps = createDeps(store);
    const performedAt = new Date("2026-03-09T12:00:00").getTime();

    await persistProgramSetToWorkoutHistory(
      {
        calendarExerciseId: store.calendarExercise.id,
        calendarExercise: store.calendarExercise,
        exerciseName: store.calendarExercise.exerciseName,
        set: store.calendarSets[0],
        weightInput: "100",
        repsInput: "8",
        unitPreference: "kg",
        performedAt,
      },
      deps
    );

    const exerciseHistory = buildExerciseHistory(store, store.calendarExercise.exerciseId!);
    const historyDays = buildHistoryDays(store);

    expect(store.workoutExercises).toHaveLength(1);
    expect(store.workoutExercises[0].completedAt).toBe(performedAt);
    expect(store.sets).toHaveLength(1);
    expect(store.sets[0]).toMatchObject({
      workoutId: store.workoutId,
      exerciseId: store.calendarExercise.exerciseId,
      weightKg: 100,
      reps: 8,
      performedAt,
    });
    expect(store.calendarExercise.workoutExerciseId).toBe(store.workoutExercises[0].id);
    expect(store.calendarSets[0].setId).toBe(store.sets[0].id);
    expect(exerciseHistory).toHaveLength(1);
    expect(exerciseHistory[0].sets).toHaveLength(1);
    expect(historyDays).toHaveLength(1);
  });

  it("does not create a workout session for incomplete program set inputs", async () => {
    const store = createStore();
    const deps = createDeps(store);
    const performedAt = new Date("2026-03-09T12:00:00").getTime();

    const result = await persistProgramSetToWorkoutHistory(
      {
        calendarExerciseId: store.calendarExercise.id,
        calendarExercise: store.calendarExercise,
        exerciseName: store.calendarExercise.exerciseName,
        set: store.calendarSets[0],
        weightInput: "100",
        repsInput: "",
        unitPreference: "kg",
        performedAt,
      },
      deps
    );

    expect(result).toEqual({
      workoutExerciseId: null,
      linkedSetId: null,
    });
    expect(store.workoutExercises).toHaveLength(0);
    expect(store.sets).toHaveLength(0);
  });

  it("refreshes stale calendar links so repeated saves update instead of duplicating", async () => {
    const store = createStore();
    const deps = createDeps(store);
    const performedAt = new Date("2026-03-09T12:00:00").getTime();
    const staleCalendarExercise = { ...store.calendarExercise };
    const staleCalendarSet = { ...store.calendarSets[0] };

    await persistProgramSetToWorkoutHistory(
      {
        calendarExerciseId: staleCalendarExercise.id,
        calendarExercise: staleCalendarExercise,
        exerciseName: staleCalendarExercise.exerciseName,
        set: staleCalendarSet,
        weightInput: "100",
        repsInput: "8",
        unitPreference: "kg",
        performedAt,
      },
      deps
    );

    await persistProgramSetToWorkoutHistory(
      {
        calendarExerciseId: staleCalendarExercise.id,
        calendarExercise: staleCalendarExercise,
        exerciseName: staleCalendarExercise.exerciseName,
        set: staleCalendarSet,
        weightInput: "102",
        repsInput: "8",
        unitPreference: "kg",
        performedAt,
      },
      deps
    );

    expect(store.workoutExercises).toHaveLength(1);
    expect(store.sets).toHaveLength(1);
    expect(store.sets[0]).toMatchObject({
      weightKg: 102,
      reps: 8,
    });
    expect(deps.addWorkoutExercise).toHaveBeenCalledTimes(1);
    expect(deps.addSet).toHaveBeenCalledTimes(1);
    expect(deps.updateSet).toHaveBeenCalledTimes(1);
  });

  it("creates workout history data for a completed programmed exercise", async () => {
    const store = createStore();
    const deps = createDeps(store);
    const performedAt = new Date("2026-03-09T12:00:00").getTime();

    await persistCompletedProgramExercise(
      {
        calendarExerciseId: store.calendarExercise.id,
        calendarExercise: store.calendarExercise,
        exerciseName: store.calendarExercise.exerciseName,
        sets: store.calendarSets,
        weightInputs: { 1: "100" },
        repsInputs: { 1: "8" },
        unitPreference: "kg",
        performedAt,
      },
      deps
    );

    const historyDays = buildHistoryDays(store);

    expect(historyDays).toHaveLength(1);
    expect(historyDays[0].sets).toHaveLength(1);
    expect(historyDays[0].sets[0]).toMatchObject({
      weightKg: 100,
      reps: 8,
    });
    expect(store.calendarSets[0]).toMatchObject({
      actualWeight: 100,
      actualReps: 8,
      isLogged: true,
    });
    expect(deps.completeExerciseEntry).toHaveBeenCalledTimes(1);
  });

  it("recreates a stale linked workout exercise so history still updates", async () => {
    const store = createStore(999);
    const deps = createDeps(store);
    const performedAt = new Date("2026-03-09T12:00:00").getTime();

    await persistCompletedProgramExercise(
      {
        calendarExerciseId: store.calendarExercise.id,
        calendarExercise: store.calendarExercise,
        exerciseName: store.calendarExercise.exerciseName,
        sets: store.calendarSets,
        weightInputs: { 1: "100" },
        repsInputs: { 1: "8" },
        unitPreference: "kg",
        performedAt,
      },
      deps
    );

    const historyDays = buildHistoryDays(store);

    expect(deps.getWorkoutExerciseById).toHaveBeenCalledWith(999);
    expect(deps.addWorkoutExercise).toHaveBeenCalledTimes(1);
    expect(historyDays).toHaveLength(1);
    expect(historyDays[0].workoutExerciseId).not.toBe(999);
    expect(store.calendarExercise.workoutExerciseId).toBe(historyDays[0].workoutExerciseId);
  });
});
