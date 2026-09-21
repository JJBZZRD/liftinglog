import { createManualLoggingDatabase } from "../helpers/manualLoggingDatabase";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockDatabase = createManualLoggingDatabase();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

const workouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");

describe("manual logging lifecycle", () => {
  afterAll(() => mockDatabase.close());

  it("keeps empty drafts out of the in-progress overlay and exercise history", async () => {
    const exerciseId = mockDatabase.insertExercise("Draft Bench");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const draftId = await workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: exerciseId,
      performed_at: Date.UTC(2026, 8, 20),
    });

    expect((await workouts.getOpenWorkoutExercise(workoutId, exerciseId))?.id).toBe(draftId);
    expect(await workouts.listInProgressExercises(workoutId)).toEqual([]);
    expect(await workouts.getExerciseHistory(exerciseId)).toEqual([]);
  });

  it("makes the first real set visible immediately without completing its entry", async () => {
    const exerciseId = mockDatabase.insertExercise("Visible Bench");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const entryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
    const setId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: entryId,
      weight_kg: 100,
      reps: 5,
      performed_at: Date.UTC(2026, 8, 20, 10),
    });

    expect(await workouts.listInProgressExercises(workoutId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ workoutExerciseId: entryId, exerciseId })])
    );
    expect(await workouts.getExerciseHistory(exerciseId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workoutExercise: expect.objectContaining({ id: entryId, completedAt: null }), sets: [expect.objectContaining({ id: setId })] }),
      ])
    );
  });

  it("preserves two open exercises across switching and reopening", async () => {
    const firstExerciseId = mockDatabase.insertExercise("Concurrent Squat");
    const secondExerciseId = mockDatabase.insertExercise("Concurrent Row");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const firstEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: firstExerciseId });
    const secondEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: secondExerciseId });
    await workouts.addSet({ workout_id: workoutId, exercise_id: firstExerciseId, workout_exercise_id: firstEntryId, weight_kg: 120, reps: 5 });
    await workouts.addSet({ workout_id: workoutId, exercise_id: secondExerciseId, workout_exercise_id: secondEntryId, weight_kg: 80, reps: 8 });

    expect((await workouts.getOpenWorkoutExercise(workoutId, firstExerciseId))?.id).toBe(firstEntryId);
    expect((await workouts.getOpenWorkoutExercise(workoutId, secondExerciseId))?.id).toBe(secondEntryId);
    expect((await workouts.listInProgressExercises(workoutId)).map((entry) => entry.workoutExerciseId)).toEqual(
      expect.arrayContaining([firstEntryId, secondEntryId])
    );
  });

  it("completes only the selected entry and does not resume it", async () => {
    const completedExerciseId = mockDatabase.insertExercise("Completed Press");
    const openExerciseId = mockDatabase.insertExercise("Open Curl");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const completedEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: completedExerciseId });
    const openEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: openExerciseId });
    await workouts.addSet({ workout_id: workoutId, exercise_id: completedExerciseId, workout_exercise_id: completedEntryId, weight_kg: 60, reps: 10 });
    await workouts.addSet({ workout_id: workoutId, exercise_id: openExerciseId, workout_exercise_id: openEntryId, weight_kg: 20, reps: 12 });

    await workouts.completeExerciseEntry(completedEntryId, Date.UTC(2026, 8, 20, 11));

    expect(await workouts.getOpenWorkoutExercise(workoutId, completedExerciseId)).toBeNull();
    expect((await workouts.getOpenWorkoutExercise(workoutId, openExerciseId))?.id).toBe(openEntryId);
    expect((await workouts.listInProgressExercises(workoutId)).map((entry) => entry.workoutExerciseId)).not.toContain(completedEntryId);
  });

  it("creates a new entry after completion when the same exercise is selected again", async () => {
    const exerciseId = mockDatabase.insertExercise("Repeat Deadlift");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const completedEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
    await workouts.addSet({ workout_id: workoutId, exercise_id: exerciseId, workout_exercise_id: completedEntryId, weight_kg: 150, reps: 3 });
    await workouts.completeExerciseEntry(completedEntryId);

    expect(await workouts.getOpenWorkoutExercise(workoutId, exerciseId)).toBeNull();
    const nextEntryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
    await workouts.addSet({ workout_id: workoutId, exercise_id: exerciseId, workout_exercise_id: nextEntryId, weight_kg: 140, reps: 5 });

    expect(nextEntryId).not.toBe(completedEntryId);
    expect((await workouts.getOpenWorkoutExercise(workoutId, exerciseId))?.id).toBe(nextEntryId);
  });

  it("keeps a completed entry closed when a set is edited or one of several sets is deleted", async () => {
    const exerciseId = mockDatabase.insertExercise("Stable Completion");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const entryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
    const firstSetId = await workouts.addSet({ workout_id: workoutId, exercise_id: exerciseId, workout_exercise_id: entryId, weight_kg: 90, reps: 8 });
    const secondSetId = await workouts.addSet({ workout_id: workoutId, exercise_id: exerciseId, workout_exercise_id: entryId, weight_kg: 95, reps: 6 });
    await workouts.completeExerciseEntry(entryId);

    await workouts.updateSet(firstSetId, { weight_kg: 92, reps: 7 });
    await workouts.deleteSet(secondSetId);

    const [entry] = mockDatabase.rows<{ completed_at: number | null }>(
      "SELECT completed_at FROM workout_exercises WHERE id = ?", entryId
    );
    expect(entry.completed_at).not.toBeNull();
    expect(await workouts.getOpenWorkoutExercise(workoutId, exerciseId)).toBeNull();
  });

  it("survives a file-backed connection restart with concurrent open entries", async () => {
    const databaseDirectory = mkdtempSync(join(tmpdir(), "manual-logging-lifecycle-"));
    const databasePath = join(databaseDirectory, "lifecycle.sqlite");
    const firstDatabase = createManualLoggingDatabase(databasePath);
    let restartedDatabase: ReturnType<typeof createManualLoggingDatabase> | null = null;

    try {
      jest.resetModules();
      jest.doMock("expo-sqlite", () => ({
        openDatabaseSync: () => firstDatabase.expoDatabase,
        addDatabaseChangeListener: () => ({ remove: jest.fn() }),
      }));
      const firstWorkouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");
      const firstExerciseId = firstDatabase.insertExercise("Restart Squat");
      const secondExerciseId = firstDatabase.insertExercise("Restart Pull-up");
      const workoutId = await firstWorkouts.getOrCreateActiveWorkout();
      const firstEntryId = await firstWorkouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: firstExerciseId });
      const secondEntryId = await firstWorkouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: secondExerciseId });
      await firstWorkouts.addSet({ workout_id: workoutId, exercise_id: firstExerciseId, workout_exercise_id: firstEntryId, weight_kg: 125, reps: 5 });
      await firstWorkouts.addSet({ workout_id: workoutId, exercise_id: secondExerciseId, workout_exercise_id: secondEntryId, weight_kg: 70, reps: 10 });
      firstDatabase.close();

      jest.resetModules();
      restartedDatabase = createManualLoggingDatabase(databasePath);
      jest.doMock("expo-sqlite", () => ({
        openDatabaseSync: () => restartedDatabase!.expoDatabase,
        addDatabaseChangeListener: () => ({ remove: jest.fn() }),
      }));
      const restartedWorkouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");

      expect(await restartedWorkouts.getOrCreateActiveWorkout()).toBe(workoutId);
      expect((await restartedWorkouts.getOpenWorkoutExercise(workoutId, firstExerciseId))?.id).toBe(firstEntryId);
      expect((await restartedWorkouts.getOpenWorkoutExercise(workoutId, secondExerciseId))?.id).toBe(secondEntryId);
      expect((await restartedWorkouts.listInProgressExercises(workoutId)).map((entry) => entry.workoutExerciseId)).toEqual(
        expect.arrayContaining([firstEntryId, secondEntryId])
      );

      await restartedWorkouts.completeExerciseEntry(firstEntryId);
      expect(await restartedWorkouts.getOpenWorkoutExercise(workoutId, firstExerciseId)).toBeNull();
      expect((await restartedWorkouts.getOpenWorkoutExercise(workoutId, secondExerciseId))?.id).toBe(secondEntryId);
    } finally {
      restartedDatabase?.close();
      for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
        if (existsSync(path)) rmSync(path);
      }
      rmSync(databaseDirectory, { recursive: true, force: true });
    }
  });
});
