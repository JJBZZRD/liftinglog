import { createManualLoggingDatabase } from "../helpers/manualLoggingDatabase";

const mockDatabase = createManualLoggingDatabase();
const mockCsvWrites: string[] = [];

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

jest.mock("expo-file-system", () => ({
  Paths: {
    cache: { uri: "memory://cache" },
    document: null,
    bundle: null,
  },
  File: class MockFile {
    uri: string;

    constructor(_directory: { uri: string }, name: string) {
      this.uri = `memory://cache/${name}`;
    }

    create() {}

    write(content: string) {
      mockCsvWrites.push(content);
    }

    info() {
      return { exists: true, uri: this.uri };
    }
  },
}));

jest.mock("expo-file-system/legacy", () => ({}));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const workouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");
const pbEvents = require("../../lib/db/pbEvents") as typeof import("../../lib/db/pbEvents");
const analytics = require("../../lib/utils/analytics") as typeof import("../../lib/utils/analytics");
const exportCsv = require("../../lib/utils/exportCsv") as typeof import("../../lib/utils/exportCsv");

function latestCsv(): string {
  const csv = mockCsvWrites.at(-1);
  if (csv === undefined) {
    throw new Error("Expected exportTrainingCsv to write CSV content");
  }
  return csv;
}

function csvLines(csv: string): string[] {
  return csv.split("\r\n");
}

function csvDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day},${hours}:${minutes}`;
}

function metricByEntry(
  points: Awaited<ReturnType<typeof analytics.getTotalVolumePerSession>>
): Map<number | null, number> {
  return new Map(points.map((point) => [point.workoutExerciseId, point.value]));
}

function currentPBByType(
  current: Awaited<ReturnType<typeof pbEvents.getCurrentPBEventsForExercise>>,
  type: string
) {
  return [...current.values()].find((event) => event.type === type);
}

describe("in-progress history consumers", () => {
  afterAll(() => {
    mockDatabase.close();
  });

  beforeEach(() => {
    mockCsvWrites.length = 0;
  });

  it("keeps an empty draft out of PBs, analytics, history, and CSV", async () => {
    const exerciseId = mockDatabase.insertExercise("Invisible Draft Consumer");
    const workoutId = await workouts.createWorkout({
      started_at: Date.UTC(2026, 8, 20, 7),
    });
    await workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: exerciseId,
      performed_at: Date.UTC(2026, 8, 20, 7, 15),
    });

    expect(await workouts.getExerciseHistory(exerciseId)).toEqual([]);
    expect(await pbEvents.getPBEventsForExercise(exerciseId)).toEqual([]);
    expect((await analytics.getExerciseAnalyticsDataset(exerciseId)).sessions).toEqual([]);

    await exportCsv.exportTrainingCsv();
    expect(latestCsv()).not.toContain("Invisible Draft Consumer");
  });

  it("recomputes open-entry PBs, analytics, and CSV through create, edit, delete, and completion", async () => {
    const exerciseName = 'Press, "Consumer"';
    const exerciseId = mockDatabase.insertExercise(exerciseName);
    const workoutId = await workouts.createWorkout({
      started_at: Date.UTC(2026, 8, 20, 8),
    });

    const completedEntryId = await workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: exerciseId,
      performed_at: Date.UTC(2026, 8, 20, 8, 5),
      note: "completed entry fallback",
    });
    const completedSetId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: completedEntryId,
      set_index: 1,
      weight_kg: 100,
      reps: 5,
      performed_at: Date.UTC(2026, 8, 20, 8, 10),
    });
    const completedAt = Date.UTC(2026, 8, 20, 8, 20);
    await workouts.completeExerciseEntry(completedEntryId, completedAt);

    const openEntryId = await workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: exerciseId,
      performed_at: Date.UTC(2026, 8, 20, 9),
      note: "open entry fallback",
    });
    const openSetId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: openEntryId,
      set_index: 1,
      weight_kg: 120,
      reps: 5,
      note: 'set, "preferred"',
      performed_at: Date.UTC(2026, 8, 20, 9, 5),
    });

    const initialHistory = await workouts.getExerciseHistory(exerciseId);
    expect(initialHistory).toHaveLength(2);
    expect(initialHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workoutExercise: expect.objectContaining({
            id: completedEntryId,
            completedAt,
          }),
          sets: [expect.objectContaining({ id: completedSetId })],
        }),
        expect.objectContaining({
          workoutExercise: expect.objectContaining({
            id: openEntryId,
            completedAt: null,
          }),
          sets: [expect.objectContaining({ id: openSetId })],
        }),
      ])
    );

    expect(await pbEvents.getPBEventsForExercise(exerciseId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ setId: completedSetId, type: "5rm", metricValue: 100 }),
        expect.objectContaining({ setId: openSetId, type: "5rm", metricValue: 120 }),
      ])
    );
    expect(
      currentPBByType(await pbEvents.getCurrentPBEventsForExercise(exerciseId), "5rm")
    ).toEqual(expect.objectContaining({ setId: openSetId, metricValue: 120 }));

    const initialDataset = await analytics.getExerciseAnalyticsDataset(exerciseId, "epley");
    expect(initialDataset.sessions).toHaveLength(2);
    expect(new Set(initialDataset.sessions.map((session) => session.workoutId))).toEqual(
      new Set([workoutId])
    );
    expect(new Set(initialDataset.sessions.map((session) => session.workoutExerciseId))).toEqual(
      new Set([completedEntryId, openEntryId])
    );
    expect(metricByEntry(await analytics.getTotalVolumePerSession(exerciseId))).toEqual(
      new Map([
        [completedEntryId, 500],
        [openEntryId, 600],
      ])
    );
    expect(
      metricByEntry(await analytics.getEstimated1RMPerSession(exerciseId, "epley")).get(
        openEntryId
      )
    ).toBeCloseTo(140);

    expect(await exportCsv.exportTrainingCsv()).toEqual({
      path: "memory://cache/LiftingLog-export.csv",
      rowCount: 2,
    });
    expect(csvLines(latestCsv())[0]).toBe(
      "\uFEFFDate,Time,Exercise,# of Reps,Weight,Notes"
    );
    expect(latestCsv()).toContain(
      `${csvDateTime(Date.UTC(2026, 8, 20, 8, 10))},"Press, ""Consumer""",5,100,completed entry fallback`
    );
    expect(latestCsv()).toContain(
      `${csvDateTime(Date.UTC(2026, 8, 20, 9, 5))},"Press, ""Consumer""",5,120,"set, ""preferred"""`
    );

    await workouts.updateSet(openSetId, {
      weight_kg: 90,
      reps: 5,
      note: "   ",
    });

    expect(
      currentPBByType(await pbEvents.getCurrentPBEventsForExercise(exerciseId), "5rm")
    ).toEqual(expect.objectContaining({ setId: completedSetId, metricValue: 100 }));
    expect(metricByEntry(await analytics.getTotalVolumePerSession(exerciseId)).get(openEntryId)).toBe(
      450
    );
    expect(
      metricByEntry(await analytics.getEstimated1RMPerSession(exerciseId, "epley")).get(
        openEntryId
      )
    ).toBeCloseTo(105);
    await exportCsv.exportTrainingCsv();
    expect(latestCsv()).toContain(
      `${csvDateTime(Date.UTC(2026, 8, 20, 9, 5))},"Press, ""Consumer""",5,90,open entry fallback`
    );
    expect(latestCsv()).not.toContain(",5,120,");

    await workouts.updateSet(openSetId, {
      weight_kg: 130,
      note: "new\nPB",
    });

    expect(
      currentPBByType(await pbEvents.getCurrentPBEventsForExercise(exerciseId), "5rm")
    ).toEqual(expect.objectContaining({ setId: openSetId, metricValue: 130 }));
    expect(metricByEntry(await analytics.getTotalVolumePerSession(exerciseId)).get(openEntryId)).toBe(
      650
    );
    expect(
      metricByEntry(await analytics.getEstimated1RMPerSession(exerciseId, "epley")).get(
        openEntryId
      )
    ).toBeCloseTo(151.6666667);
    await exportCsv.exportTrainingCsv();
    expect(latestCsv()).toContain(',5,130,"new\nPB"');
    expect(latestCsv()).not.toContain(",5,90,");

    await workouts.deleteSet(openSetId);

    expect(
      currentPBByType(await pbEvents.getCurrentPBEventsForExercise(exerciseId), "5rm")
    ).toEqual(expect.objectContaining({ setId: completedSetId, metricValue: 100 }));
    expect((await workouts.getExerciseHistory(exerciseId)).map((entry) => entry.workoutExercise?.id)).toEqual([
      completedEntryId,
    ]);
    expect(metricByEntry(await analytics.getTotalVolumePerSession(exerciseId))).toEqual(
      new Map([[completedEntryId, 500]])
    );
    expect(metricByEntry(await analytics.getEstimated1RMPerSession(exerciseId, "epley"))).toEqual(
      new Map([[completedEntryId, 116.66666666666667]])
    );
    expect(await exportCsv.exportTrainingCsv()).toEqual({
      path: "memory://cache/LiftingLog-export.csv",
      rowCount: 1,
    });
    expect(latestCsv()).not.toContain(",5,130,");

    const replacementSetId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: openEntryId,
      set_index: 1,
      weight_kg: 110,
      reps: 8,
      performed_at: Date.UTC(2026, 8, 20, 9, 15),
    });
    const openCompletedAt = Date.UTC(2026, 8, 20, 9, 30);
    await workouts.completeExerciseEntry(openEntryId, openCompletedAt);

    const finalHistory = await workouts.getExerciseHistory(exerciseId);
    expect(finalHistory).toHaveLength(2);
    expect(finalHistory.find((entry) => entry.workoutExercise?.id === openEntryId)).toEqual(
      expect.objectContaining({
        workoutExercise: expect.objectContaining({ completedAt: openCompletedAt }),
        sets: [expect.objectContaining({ id: replacementSetId, weightKg: 110, reps: 8 })],
      })
    );
    expect(
      mockDatabase.rows<{ id: number; completed_at: number | null }>(
        "SELECT id, completed_at FROM workout_exercises WHERE id IN (?, ?) ORDER BY id",
        completedEntryId,
        openEntryId
      )
    ).toEqual([
      { id: completedEntryId, completed_at: completedAt },
      { id: openEntryId, completed_at: openCompletedAt },
    ]);
    expect(
      mockDatabase.rows<{ count: number }>(
        "SELECT COUNT(*) AS count FROM sets WHERE workout_exercise_id = ?",
        openEntryId
      )[0]?.count
    ).toBe(1);
  });

  it("preserves zero weight and reps in real history and CSV without treating them as valid metrics", async () => {
    const exerciseId = mockDatabase.insertExercise("Zero Value Consumer");
    const workoutId = await workouts.createWorkout({
      started_at: Date.UTC(2026, 8, 21, 10),
    });
    const entryId = await workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: exerciseId,
      performed_at: Date.UTC(2026, 8, 21, 10, 5),
    });
    const setId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: entryId,
      weight_kg: 0,
      reps: 0,
      note: "zeroes stay real",
      performed_at: Date.UTC(2026, 8, 21, 10, 10),
    });

    expect(await workouts.getExerciseHistory(exerciseId)).toEqual([
      expect.objectContaining({
        workoutExercise: expect.objectContaining({ id: entryId, completedAt: null }),
        sets: [expect.objectContaining({ id: setId, weightKg: 0, reps: 0 })],
      }),
    ]);
    expect((await analytics.getExerciseAnalyticsDataset(exerciseId)).sessions).toEqual([
      expect.objectContaining({
        workoutExerciseId: entryId,
        sets: [expect.objectContaining({ id: setId, weightKg: 0, reps: 0 })],
      }),
    ]);
    expect(await pbEvents.getPBEventsForExercise(exerciseId)).toEqual([]);
    expect(await pbEvents.getCurrentPBEventsForExercise(exerciseId)).toEqual(new Map());
    expect(await analytics.getTotalVolumePerSession(exerciseId)).toEqual([]);
    expect(await analytics.getEstimated1RMPerSession(exerciseId, "epley")).toEqual([]);

    await exportCsv.exportTrainingCsv();
    expect(latestCsv()).toContain(
      `${csvDateTime(Date.UTC(2026, 8, 21, 10, 10))},Zero Value Consumer,0,0,zeroes stay real`
    );
  });
});
