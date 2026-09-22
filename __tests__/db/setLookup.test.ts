import {
  createManualLoggingDatabase,
  initializeTestDatabaseBindings,
} from "../helpers/manualLoggingDatabase";

const mockDatabase = createManualLoggingDatabase();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

initializeTestDatabaseBindings(mockDatabase);

const workouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");

describe("getSetById", () => {
  afterAll(() => mockDatabase.close());

  it("returns the complete canonical row for its exact ID without changing stored history", async () => {
    const exerciseId = mockDatabase.insertExercise("Lookup Bench");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const firstEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
    const secondEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
    const firstSetId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: firstEntryId,
      set_group_id: "first-group",
      set_index: 0,
      weight_kg: 0,
      reps: 0,
      rpe: 0,
      rir: 0,
      is_warmup: true,
      note: "Durable set note",
      superset_group_id: "superset-a",
      performed_at: Date.UTC(2026, 8, 20, 10),
    });
    const secondSetId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: secondEntryId,
      set_index: 0,
      weight_kg: 100,
      reps: 5,
      note: null,
      performed_at: Date.UTC(2026, 8, 20, 11),
    });
    const storedBefore = mockDatabase.rows<Record<string, unknown>>("SELECT * FROM sets ORDER BY id");

    const firstRead = await workouts.getSetById(firstSetId);
    const secondRead = await workouts.getSetById(firstSetId);

    expect(firstRead).toEqual(secondRead);
    expect(firstRead).toMatchObject({
      id: firstSetId,
      workoutId,
      exerciseId,
      workoutExerciseId: firstEntryId,
      setGroupId: "first-group",
      setIndex: 0,
      weightKg: 0,
      reps: 0,
      rpe: 0,
      rir: 0,
      isWarmup: true,
      note: "Durable set note",
      supersetGroupId: "superset-a",
      performedAt: Date.UTC(2026, 8, 20, 10),
    });
    expect(firstRead?.uid).toEqual(expect.any(String));
    expect(firstRead?.id).not.toBe(secondSetId);
    expect(firstRead?.workoutExerciseId).not.toBe(secondEntryId);
    expect(mockDatabase.rows<Record<string, unknown>>("SELECT * FROM sets ORDER BY id")).toEqual(storedBefore);
  });

  it("returns null for missing and invalid IDs", async () => {
    for (const id of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 999_999]) {
      await expect(workouts.getSetById(id)).resolves.toBeNull();
    }
  });
});
