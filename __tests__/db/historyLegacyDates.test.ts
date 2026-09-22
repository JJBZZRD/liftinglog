import {
  createManualLoggingDatabase,
  initializeTestDatabaseBindings,
} from "../helpers/manualLoggingDatabase";

const originalTimezone = process.env.TZ;
process.env.TZ = "Europe/London";

const mockDatabase = createManualLoggingDatabase();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

initializeTestDatabaseBindings(mockDatabase);

const workouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");

const localTimestamp = (
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
) => new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

function execute(sql: string, params: unknown[] = []) {
  const statement = mockDatabase.expoDatabase.prepareSync(sql);
  try {
    statement.executeSync(params);
  } finally {
    statement.finalizeSync();
  }
}

type LegacyEntryFixture = {
  exerciseId: number;
  workoutStartedAt: number;
  performedAt: number | null;
  completedAt: number | null;
  note?: string;
  orderIndex?: number;
  sets?: Array<{ weightKg: number | null; reps: number | null; note?: string }>;
};

async function createLegacyEntry(fixture: LegacyEntryFixture) {
  const workoutId = await workouts.createWorkout({ started_at: fixture.workoutStartedAt });
  const workoutExerciseId = await workouts.addWorkoutExercise({
    workout_id: workoutId,
    exercise_id: fixture.exerciseId,
    performed_at: fixture.performedAt ?? fixture.workoutStartedAt,
    note: fixture.note,
    order_index: fixture.orderIndex,
  });

  execute(
    "UPDATE workout_exercises SET performed_at = ?, completed_at = ? WHERE id = ?",
    [fixture.performedAt, fixture.completedAt, workoutExerciseId]
  );

  const setIds: number[] = [];
  for (const [setIndex, set] of (fixture.sets ?? []).entries()) {
    setIds.push(await workouts.addSet({
      workout_id: workoutId,
      exercise_id: fixture.exerciseId,
      workout_exercise_id: workoutExerciseId,
      set_index: setIndex,
      weight_kg: set.weightKg,
      reps: set.reps,
      note: set.note,
      performed_at: fixture.performedAt ?? fixture.completedAt ?? fixture.workoutStartedAt,
    }));
  }

  return { workoutId, workoutExerciseId, setIds };
}

describe("broad workout history legacy date fallback", () => {
  const newestDay = "2026-10-25";
  const searchDay = "2026-10-24";
  const completedFallback = localTimestamp(2026, 10, 25, 0, 15);
  const openFallback = localTimestamp(2026, 10, 25, 23, 45);
  const searchFallback = localTimestamp(2026, 10, 24, 0, 15);

  let sharedExerciseId: number;
  let completedEntryId: number;
  let openEntryId: number;
  let searchEntryId: number;
  let zeroEntryId: number;

  beforeAll(async () => {
    sharedExerciseId = mockDatabase.insertExercise("Legacy Shared Press");

    completedEntryId = (await createLegacyEntry({
      exerciseId: sharedExerciseId,
      workoutStartedAt: localTimestamp(2026, 10, 23, 8),
      performedAt: null,
      completedAt: completedFallback,
      note: "completed fallback entry",
      orderIndex: 0,
      sets: [
        { weightKg: 100, reps: 5 },
        { weightKg: 0, reps: 12, note: "zero load set" },
      ],
    })).workoutExerciseId;

    openEntryId = (await createLegacyEntry({
      exerciseId: sharedExerciseId,
      workoutStartedAt: openFallback,
      performedAt: null,
      completedAt: null,
      note: "open workout fallback entry",
      orderIndex: 1,
      sets: [{ weightKg: 60, reps: 8 }],
    })).workoutExerciseId;

    const searchExerciseId = mockDatabase.insertExercise("Legacy Alpha Squat");
    searchEntryId = (await createLegacyEntry({
      exerciseId: searchExerciseId,
      workoutStartedAt: searchFallback,
      performedAt: null,
      completedAt: null,
      note: "tempo legacy entry",
      sets: [
        { weightKg: 87.5, reps: 6, note: "paused marker" },
        { weightKg: 50, reps: 0 },
      ],
    })).workoutExerciseId;

    const zeroExerciseId = mockDatabase.insertExercise("Epoch Zero Lift");
    zeroEntryId = (await createLegacyEntry({
      exerciseId: zeroExerciseId,
      workoutStartedAt: localTimestamp(2026, 10, 27, 12),
      performedAt: 0,
      completedAt: localTimestamp(2026, 10, 26, 12),
      note: "explicit zero wins",
      sets: [{ weightKg: 40, reps: 10 }],
    })).workoutExerciseId;

    const negativeExerciseId = mockDatabase.insertExercise("Before Epoch Lift");
    await createLegacyEntry({
      exerciseId: negativeExerciseId,
      workoutStartedAt: localTimestamp(2026, 10, 28, 12),
      performedAt: -86_400_000,
      completedAt: localTimestamp(2026, 10, 28, 13),
      sets: [{ weightKg: 30, reps: 3 }],
    });

    const draftExerciseId = mockDatabase.insertExercise("Newest Empty Draft");
    await createLegacyEntry({
      exerciseId: draftExerciseId,
      workoutStartedAt: localTimestamp(2027, 1, 1, 12),
      performedAt: null,
      completedAt: null,
      note: "newest row has no real sets",
      sets: [],
    });
  });

  afterAll(() => {
    mockDatabase.close();
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  });

  it("groups completed and open null-performed entries by the first usable local timestamp", async () => {
    const days = await workouts.listWorkoutDays({ limit: 10, offset: 0 });
    expect(days.map((day) => day.dayKey)).toEqual([
      newestDay,
      searchDay,
      "1970-01-01",
      "1969-12-31",
    ]);
    expect(days[0]).toEqual(expect.objectContaining({
      displayDate: completedFallback,
      totalExercises: 2,
      totalSets: 3,
      inProgressCount: 1,
    }));

    const details = await workouts.getWorkoutDayDetails(newestDay);
    expect(details.exercises.map((entry) => entry.workoutExerciseId)).toEqual([
      completedEntryId,
      openEntryId,
    ]);
    expect(details.exercises).toEqual(expect.arrayContaining([
      expect.objectContaining({ workoutExerciseId: completedEntryId, completedAt: completedFallback }),
      expect.objectContaining({ workoutExerciseId: openEntryId, completedAt: null }),
    ]));
    expect(details.totalVolumeKg).toBe(980);
    expect(details.bestE1rmKg).toBe(117);

    const page = await workouts.getWorkoutDayPage(newestDay);
    expect(page?.displayDate).toBe(completedFallback);
    expect(page?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ workoutExerciseId: completedEntryId, performedAt: completedFallback }),
      expect.objectContaining({ workoutExerciseId: openEntryId, performedAt: openFallback }),
    ]));
    expect(new Set(page?.entries.map((entry) => entry.workoutExerciseId))).toEqual(
      new Set([completedEntryId, openEntryId])
    );
    expect(page?.totals).toEqual({
      totalExercises: 2,
      totalSets: 3,
      totalReps: 13,
      totalVolumeKg: 980,
      bestE1rmKg: 117,
    });
  });

  it("uses fallback dates throughout search, date bounds, paging, and day counts", async () => {
    const search = await workouts.searchWorkoutDays({
      query: "alpha paused 87.5 6",
      limit: 10,
      offset: 0,
    });
    expect(search).toEqual([
      expect.objectContaining({
        dayKey: searchDay,
        displayDate: searchFallback,
        totalExercises: 1,
        totalSets: 2,
        inProgressCount: 1,
      }),
    ]);

    expect(await workouts.searchWorkoutDays({
      query: "",
      startDate: localTimestamp(2026, 10, 24, 0),
      endDate: localTimestamp(2026, 10, 24, 23, 59) + 59_999,
      limit: 10,
      offset: 0,
    })).toEqual([expect.objectContaining({ dayKey: searchDay, totalSets: 2 })]);

    const epochRows = await workouts.searchWorkoutDays({
      query: "",
      startDate: 0,
      endDate: 0,
      limit: 10,
      offset: 0,
    });
    expect(epochRows).toEqual([
      expect.objectContaining({ dayKey: "1970-01-01", displayDate: 0 }),
    ]);

    expect((await workouts.listWorkoutDays({ limit: 2, offset: 1 })).map((day) => day.dayKey))
      .toEqual([searchDay, "1970-01-01"]);

    const quickStats = await workouts.getQuickStats();
    expect(quickStats.totalWorkoutDays).toBe(4);
    expect(quickStats.totalVolumeKg).toBe(1995);
  });

  it("keeps explicit performed_at precedence and excludes newer empty drafts from the last day", async () => {
    const epochPage = await workouts.getWorkoutDayPage("1970-01-01");
    expect(epochPage?.entries).toEqual([
      expect.objectContaining({ workoutExerciseId: zeroEntryId, performedAt: 0 }),
    ]);

    const lastDay = await workouts.getLastWorkoutDay();
    expect(lastDay?.date).toBe(localTimestamp(2026, 10, 25, 0));
    expect(lastDay?.exercises.map((entry) => entry.workoutExerciseId)).toEqual([
      completedEntryId,
      openEntryId,
    ]);
  });

  it("does not repair or write legacy timestamps while reading them", async () => {
    const before = {
      workouts: mockDatabase.rows("SELECT id, started_at, completed_at FROM workouts ORDER BY id"),
      entries: mockDatabase.rows(
        "SELECT id, workout_id, performed_at, completed_at FROM workout_exercises ORDER BY id"
      ),
      sets: mockDatabase.rows(
        "SELECT id, workout_id, workout_exercise_id, performed_at FROM sets ORDER BY id"
      ),
    };

    await workouts.listWorkoutDays({ limit: 10, offset: 0 });
    await workouts.searchWorkoutDays({ query: "legacy 6", limit: 10, offset: 0 });
    await workouts.getWorkoutDayDetails(searchDay);
    await workouts.getWorkoutDayPage(searchDay);
    await workouts.getLastWorkoutDay();
    await workouts.getQuickStats();

    expect({
      workouts: mockDatabase.rows("SELECT id, started_at, completed_at FROM workouts ORDER BY id"),
      entries: mockDatabase.rows(
        "SELECT id, workout_id, performed_at, completed_at FROM workout_exercises ORDER BY id"
      ),
      sets: mockDatabase.rows(
        "SELECT id, workout_id, workout_exercise_id, performed_at FROM sets ORDER BY id"
      ),
    }).toEqual(before);
    expect(searchEntryId).toBeGreaterThan(0);
  });
});
