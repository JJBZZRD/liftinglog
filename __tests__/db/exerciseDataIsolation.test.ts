import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManualLoggingDatabase } from "../helpers/manualLoggingDatabase";

let mockActiveDatabase: ReturnType<typeof createManualLoggingDatabase> | null = null;

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => {
    if (!mockActiveDatabase) throw new Error("Test database has not been opened.");
    return mockActiveDatabase.expoDatabase;
  },
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

type ProductionApis = {
  exercises: typeof import("../../lib/db/exercises");
  workouts: typeof import("../../lib/db/workouts");
  pbEvents: typeof import("../../lib/db/pbEvents");
  analytics: typeof import("../../lib/utils/analytics");
  media: typeof import("../../lib/db/media");
};

function loadProductionApis(): ProductionApis {
  return {
    exercises: require("../../lib/db/exercises") as typeof import("../../lib/db/exercises"),
    workouts: require("../../lib/db/workouts") as typeof import("../../lib/db/workouts"),
    pbEvents: require("../../lib/db/pbEvents") as typeof import("../../lib/db/pbEvents"),
    analytics: require("../../lib/utils/analytics") as typeof import("../../lib/utils/analytics"),
    media: require("../../lib/db/media") as typeof import("../../lib/db/media"),
  };
}

describe("same-name exercise data isolation", () => {
  const databaseDirectory = mkdtempSync(join(tmpdir(), "exercise-data-isolation-"));
  const databasePath = join(databaseDirectory, "exercise-data-isolation.sqlite");

  afterAll(() => {
    mockActiveDatabase?.close();
    for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
      if (existsSync(path)) rmSync(path);
    }
    rmSync(databaseDirectory, { recursive: true, force: true });
  });

  it("keeps unrelated duplicate display names isolated through history, analytics, PBs, media, mutation, and bootstrap restart", async () => {
    mockActiveDatabase = createManualLoggingDatabase(databasePath);
    let api = loadProductionApis();

    const firstExerciseId = await api.exercises.createExercise({ name: "Shared Press", muscle_group: "Chest" });
    const secondExerciseId = await api.exercises.createExercise({ name: "Shared Press", muscle_group: "Back" });
    expect(firstExerciseId).not.toBe(secondExerciseId);

    const createdExercises = mockActiveDatabase.rows<{ id: number; uid: string; name: string; parent_exercise_id: number | null }>(
      "SELECT id, uid, name, parent_exercise_id FROM exercises WHERE id IN (?, ?) ORDER BY id",
      firstExerciseId,
      secondExerciseId
    );
    expect(createdExercises).toEqual([
      { id: firstExerciseId, uid: expect.any(String), name: "Shared Press", parent_exercise_id: null },
      { id: secondExerciseId, uid: expect.any(String), name: "Shared Press", parent_exercise_id: null },
    ]);
    expect(createdExercises[0].uid).not.toBe(createdExercises[1].uid);
    const firstExercise = await api.exercises.getExerciseById(firstExerciseId);
    const secondExercise = await api.exercises.getExerciseById(secondExerciseId);
    expect(firstExercise).not.toBeNull();
    expect(secondExercise).not.toBeNull();

    const workoutId = await api.workouts.getOrCreateActiveWorkout();
    const firstEntryId = await api.workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: firstExerciseId,
      note: "first entry note",
      performed_at: Date.UTC(2026, 8, 20, 9),
    });
    const secondEntryId = await api.workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: secondExerciseId,
      note: "second entry note",
      performed_at: Date.UTC(2026, 8, 20, 10),
    });
    const firstSetId = await api.workouts.addSet({
      workout_id: workoutId,
      exercise_id: firstExerciseId,
      workout_exercise_id: firstEntryId,
      weight_kg: 101,
      reps: 5,
      note: "first set note",
      performed_at: Date.UTC(2026, 8, 20, 9),
    });
    const secondSetId = await api.workouts.addSet({
      workout_id: workoutId,
      exercise_id: secondExerciseId,
      workout_exercise_id: secondEntryId,
      weight_kg: 67,
      reps: 11,
      note: "second set note",
      performed_at: Date.UTC(2026, 8, 20, 10),
    });

    await api.media.upsertVideoForSet(firstSetId, {
      localUri: "file:///first-shared-press.mp4", assetId: "first-asset", mime: "video/mp4",
      originalFilename: "first.mp4", mediaCreatedAt: 1, durationMs: 1_001, albumName: "LiftingLog",
    });
    await api.media.upsertVideoForSet(secondSetId, {
      localUri: "file:///second-shared-press.mp4", assetId: "second-asset", mime: "video/mp4",
      originalFilename: "second.mp4", mediaCreatedAt: 2, durationMs: 2_002, albumName: "LiftingLog",
    });

    const firstHistory = await api.workouts.getExerciseHistory(firstExerciseId);
    const secondHistory = await api.workouts.getExerciseHistory(secondExerciseId);
    expect(firstHistory).toEqual([expect.objectContaining({
      loggedExerciseId: firstExerciseId,
      sets: [expect.objectContaining({ id: firstSetId, exerciseId: firstExerciseId, weightKg: 101, reps: 5, note: "first set note" })],
      workoutExercise: expect.objectContaining({ id: firstEntryId, exerciseId: firstExerciseId, note: "first entry note" }),
    })]);
    expect(secondHistory).toEqual([expect.objectContaining({
      loggedExerciseId: secondExerciseId,
      sets: [expect.objectContaining({ id: secondSetId, exerciseId: secondExerciseId, weightKg: 67, reps: 11, note: "second set note" })],
      workoutExercise: expect.objectContaining({ id: secondEntryId, exerciseId: secondExerciseId, note: "second entry note" }),
    })]);

    const [firstAnalytics, secondAnalytics] = await Promise.all([
      api.analytics.getExerciseAnalyticsDataset(firstExerciseId),
      api.analytics.getExerciseAnalyticsDataset(secondExerciseId),
    ]);
    expect(firstAnalytics.sessions).toEqual([expect.objectContaining({ loggedExerciseId: firstExerciseId, sets: [expect.objectContaining({ id: firstSetId, weightKg: 101, reps: 5, note: "first set note" })] })]);
    expect(secondAnalytics.sessions).toEqual([expect.objectContaining({ loggedExerciseId: secondExerciseId, sets: [expect.objectContaining({ id: secondSetId, weightKg: 67, reps: 11, note: "second set note" })] })]);

    const [firstCurrentPbs, secondCurrentPbs, firstMedia, secondMedia] = await Promise.all([
      api.pbEvents.getCurrentPBEventsForExercise(firstExerciseId),
      api.pbEvents.getCurrentPBEventsForExercise(secondExerciseId),
      api.media.getLatestMediaForSet(firstSetId),
      api.media.getLatestMediaForSet(secondSetId),
    ]);
    expect([...firstCurrentPbs.values()]).toEqual(expect.arrayContaining([expect.objectContaining({ setId: firstSetId, exerciseId: firstExerciseId })]));
    expect([...secondCurrentPbs.values()]).toEqual(expect.arrayContaining([expect.objectContaining({ setId: secondSetId, exerciseId: secondExerciseId })]));
    expect(firstMedia).toEqual(expect.objectContaining({ setId: firstSetId, localUri: "file:///first-shared-press.mp4" }));
    expect(secondMedia).toEqual(expect.objectContaining({ setId: secondSetId, localUri: "file:///second-shared-press.mp4" }));
    const secondCurrentPbEntries = [...secondCurrentPbs.entries()];

    mockActiveDatabase.close();
    mockActiveDatabase = null;
    jest.resetModules();
    mockActiveDatabase = createManualLoggingDatabase(databasePath);
    api = loadProductionApis();

    // Both display names remain identical through the production connection bootstrap.
    expect(await api.exercises.getExerciseById(firstExerciseId)).toEqual(firstExercise);
    expect(await api.exercises.getExerciseById(secondExerciseId)).toEqual(secondExercise);
    expect(await api.workouts.getExerciseHistory(firstExerciseId)).toEqual(firstHistory);
    expect(await api.workouts.getExerciseHistory(secondExerciseId)).toEqual(secondHistory);
    expect(await api.analytics.getExerciseAnalyticsDataset(firstExerciseId)).toEqual(firstAnalytics);
    expect(await api.analytics.getExerciseAnalyticsDataset(secondExerciseId)).toEqual(secondAnalytics);
    expect([...await api.pbEvents.getCurrentPBEventsForExercise(secondExerciseId)]).toEqual(secondCurrentPbEntries);
    expect(await api.media.getLatestMediaForSet(firstSetId)).toEqual(firstMedia);
    expect(await api.media.getLatestMediaForSet(secondSetId)).toEqual(secondMedia);

    // Set mutation stays on the first ID while both rows still share their display name.
    await api.workouts.updateSet(firstSetId, { weight_kg: 111, reps: 4, note: "first set edited" });
    expect((await api.workouts.getExerciseHistory(firstExerciseId))[0].sets[0]).toEqual(
      expect.objectContaining({ id: firstSetId, weightKg: 111, reps: 4, note: "first set edited" })
    );
    expect(await api.exercises.getExerciseById(secondExerciseId)).toEqual(secondExercise);
    expect(await api.workouts.getExerciseHistory(secondExerciseId)).toEqual(secondHistory);
    expect(await api.analytics.getExerciseAnalyticsDataset(secondExerciseId)).toEqual(secondAnalytics);
    expect([...await api.pbEvents.getCurrentPBEventsForExercise(secondExerciseId)]).toEqual(secondCurrentPbEntries);
    expect(await api.media.getLatestMediaForSet(secondSetId)).toEqual(secondMedia);

    await api.workouts.deleteSet(firstSetId);
    expect(await api.workouts.getExerciseHistory(firstExerciseId)).toEqual([]);
    expect(await api.exercises.getExerciseById(secondExerciseId)).toEqual(secondExercise);
    expect(await api.workouts.getExerciseHistory(secondExerciseId)).toEqual(secondHistory);
    expect(await api.analytics.getExerciseAnalyticsDataset(secondExerciseId)).toEqual(secondAnalytics);
    expect([...await api.pbEvents.getCurrentPBEventsForExercise(secondExerciseId)]).toEqual(secondCurrentPbEntries);
    expect(await api.media.getLatestMediaForSet(secondSetId)).toEqual(secondMedia);

    await api.exercises.updateExercise(firstExerciseId, { name: "Renamed First Press" });
    expect(await api.exercises.getExerciseById(secondExerciseId)).toEqual(secondExercise);
    expect(await api.workouts.getExerciseHistory(secondExerciseId)).toEqual(secondHistory);
    expect(await api.media.getLatestMediaForSet(secondSetId)).toEqual(secondMedia);
    await api.exercises.updateExercise(firstExerciseId, { name: "Shared Press" });
    expect(await api.exercises.getExerciseById(firstExerciseId)).toEqual(firstExercise);
    expect(await api.exercises.getExerciseById(secondExerciseId)).toEqual(secondExercise);

    await api.exercises.deleteExercise(firstExerciseId);

    expect(await api.workouts.getExerciseHistory(firstExerciseId)).toEqual([]);
    expect(await api.analytics.getExerciseAnalyticsDataset(firstExerciseId)).toEqual(expect.objectContaining({ sessions: [], pbEvents: [] }));
    expect(await api.pbEvents.getPBEventsForExercise(firstExerciseId)).toEqual([]);
    expect(await api.media.getLatestMediaForSet(firstSetId)).toBeNull();
    expect(mockActiveDatabase.rows<{ id: number }>("SELECT id FROM exercises WHERE id = ?", firstExerciseId)).toEqual([]);

    expect(await api.exercises.getExerciseById(secondExerciseId)).toEqual(secondExercise);
    expect(await api.workouts.getExerciseHistory(secondExerciseId)).toEqual(secondHistory);
    expect(await api.analytics.getExerciseAnalyticsDataset(secondExerciseId)).toEqual(secondAnalytics);
    expect([...await api.pbEvents.getCurrentPBEventsForExercise(secondExerciseId)]).toEqual(secondCurrentPbEntries);
    expect(await api.media.getLatestMediaForSet(secondSetId)).toEqual(secondMedia);
    expect(mockActiveDatabase.rows<{ exercise_id: number; workout_exercise_id: number }>(
      "SELECT exercise_id, workout_exercise_id FROM sets WHERE id = ?", secondSetId
    )).toEqual([{ exercise_id: secondExerciseId, workout_exercise_id: secondEntryId }]);
  });
});
