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

type EntryFixture = {
  exerciseName: string;
  performedAt: number;
  completedAt?: number | null;
  note?: string | null;
  set?: {
    weightKg?: number | null;
    reps?: number | null;
    note?: string | null;
  } | null;
  orderIndex?: number;
  workoutId?: number;
};

async function createEntry(fixture: EntryFixture) {
  const exerciseId = mockDatabase.insertExercise(fixture.exerciseName);
  const workoutId = fixture.workoutId ?? await workouts.createWorkout({
    started_at: fixture.performedAt,
  });
  const workoutExerciseId = await workouts.addWorkoutExercise({
    workout_id: workoutId,
    exercise_id: exerciseId,
    performed_at: fixture.performedAt,
    order_index: fixture.orderIndex,
    note: fixture.note,
  });

  let setId: number | null = null;
  if (fixture.set !== null) {
    setId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: workoutExerciseId,
      weight_kg: fixture.set?.weightKg ?? 50,
      reps: fixture.set?.reps ?? 5,
      note: fixture.set?.note,
      performed_at: fixture.performedAt,
    });
  }

  if (fixture.completedAt !== undefined && fixture.completedAt !== null) {
    await workouts.completeExerciseEntry(workoutExerciseId, fixture.completedAt);
  }

  return { exerciseId, workoutId, workoutExerciseId, setId };
}

describe("broad workout history read model", () => {
  const recentDay = "2026-09-22";
  const summaryDay = "2026-09-20";
  const overflowDay = "2026-09-19";
  const searchDay = "2026-09-18";
  const secondSearchDay = "2026-09-17";
  const recentCompletedAt = localTimestamp(2026, 9, 22, 9, 30);
  const summaryCompletedAt = localTimestamp(2026, 9, 20, 8, 30);

  let recentCompletedEntryId: number;
  let recentOpenEntryId: number;
  let summaryCompletedEntryId: number;
  let summaryOpenEntryId: number;

  beforeAll(async () => {
    const recentWorkoutA = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 22, 8),
    });
    const recentWorkoutB = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 22, 10),
    });
    recentCompletedEntryId = (await createEntry({
      exerciseName: "Recent Completed Press",
      performedAt: recentCompletedAt,
      completedAt: recentCompletedAt,
      orderIndex: 0,
      workoutId: recentWorkoutA,
      set: { weightKg: 80, reps: 6 },
    })).workoutExerciseId;
    recentOpenEntryId = (await createEntry({
      exerciseName: "Recent Open Pull",
      performedAt: localTimestamp(2026, 9, 22, 10, 15),
      completedAt: null,
      orderIndex: 1,
      workoutId: recentWorkoutB,
      set: { weightKg: 60, reps: 8 },
    })).workoutExerciseId;

    await createEntry({
      exerciseName: "Newest Empty Draft",
      performedAt: localTimestamp(2026, 9, 23, 18),
      completedAt: null,
      note: "must never create a history day",
      set: null,
    });
    await createEntry({
      exerciseName: "Newest Empty Legacy Completion",
      performedAt: localTimestamp(2026, 9, 23, 19),
      completedAt: localTimestamp(2026, 9, 23, 19),
      note: "must also stay invisible",
      set: null,
    });

    const summaryWorkoutA = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 20, 8),
    });
    const summaryWorkoutB = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 20, 9),
    });
    summaryCompletedEntryId = (await createEntry({
      exerciseName: "Summary Completed Bench",
      performedAt: summaryCompletedAt,
      completedAt: summaryCompletedAt,
      note: "finished note preview",
      orderIndex: 0,
      workoutId: summaryWorkoutA,
      set: { weightKg: 100, reps: 5, note: "heavy completed set" },
    })).workoutExerciseId;
    summaryOpenEntryId = (await createEntry({
      exerciseName: "Summary Open Bodyweight Row",
      performedAt: localTimestamp(2026, 9, 20, 9, 45),
      completedAt: null,
      note: "open note preview",
      orderIndex: 1,
      workoutId: summaryWorkoutB,
      set: { weightKg: 0, reps: 12, note: "bodyweight marker" },
    })).workoutExerciseId;
    await createEntry({
      exerciseName: "Summary Empty Draft",
      performedAt: localTimestamp(2026, 9, 20, 10),
      note: "draft note must be absent",
      set: null,
    });
    await createEntry({
      exerciseName: "Summary Empty Completed Legacy",
      performedAt: localTimestamp(2026, 9, 20, 11),
      completedAt: localTimestamp(2026, 9, 20, 11),
      note: "legacy note must be absent",
      set: null,
    });

    const overflowWorkout = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 19, 7),
    });
    for (let index = 0; index < 27; index += 1) {
      await createEntry({
        exerciseName: `Overflow Exercise ${String(index + 1).padStart(2, "0")}`,
        performedAt: localTimestamp(2026, 9, 19, 7, index),
        completedAt: index % 2 === 0 ? localTimestamp(2026, 9, 19, 7, index) : null,
        orderIndex: index,
        workoutId: overflowWorkout,
        set: { weightKg: 20 + index, reps: 5 },
      });
    }
    for (let index = 0; index < 4; index += 1) {
      await createEntry({
        exerciseName: `Overflow Excluded Draft ${index + 1}`,
        performedAt: localTimestamp(2026, 9, 19, 8, index),
        completedAt: index % 2 === 0 ? localTimestamp(2026, 9, 19, 8, index) : null,
        orderIndex: index - 4,
        workoutId: overflowWorkout,
        set: null,
      });
    }

    await createEntry({
      exerciseName: "Search Squat",
      performedAt: localTimestamp(2026, 9, 18, 13),
      completedAt: null,
      note: "tempo focus",
      set: { weightKg: 142.5, reps: 5, note: "five clean reps" },
    });
    await createEntry({
      exerciseName: "Search Curl",
      performedAt: localTimestamp(2026, 9, 17, 13),
      completedAt: localTimestamp(2026, 9, 17, 13),
      note: "tempo arms",
      set: { weightKg: 30, reps: 12, note: "strict reps" },
    });
    await createEntry({
      exerciseName: "Phantom Squat Draft",
      performedAt: localTimestamp(2026, 9, 16, 13),
      note: "tempo phantom 999",
      set: null,
    });

    await createEntry({
      exerciseName: "DST Start Entry",
      performedAt: localTimestamp(2026, 3, 29, 0, 15),
      completedAt: null,
      set: { weightKg: 40, reps: 10 },
    });
    await createEntry({
      exerciseName: "After DST Midnight Entry",
      performedAt: localTimestamp(2026, 3, 30, 0, 15),
      completedAt: localTimestamp(2026, 3, 30, 0, 15),
      set: { weightKg: 45, reps: 10 },
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

  it("shows the first real set immediately and hides the entry after its last set is deleted", async () => {
    const performedAt = localTimestamp(2026, 9, 21, 15);
    const exerciseId = mockDatabase.insertExercise("Transient First Set Exercise");
    const workoutId = await workouts.createWorkout({ started_at: performedAt });
    const workoutExerciseId = await workouts.addWorkoutExercise({
      workout_id: workoutId,
      exercise_id: exerciseId,
      performed_at: performedAt,
      note: "first set visibility marker",
    });

    expect((await workouts.listWorkoutDays({ limit: 20, offset: 0 })).map((day) => day.dayKey))
      .not.toContain("2026-09-21");

    const setId = await workouts.addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: workoutExerciseId,
      weight_kg: 55,
      reps: 7,
      performed_at: performedAt,
    });

    expect(await workouts.listWorkoutDays({ limit: 20, offset: 0 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dayKey: "2026-09-21", totalExercises: 1, totalSets: 1, inProgressCount: 1 }),
      ])
    );

    await workouts.deleteSet(setId);

    expect((await workouts.listWorkoutDays({ limit: 20, offset: 0 })).map((day) => day.dayKey))
      .not.toContain("2026-09-21");
    expect(await workouts.searchWorkoutDays({
      query: "Transient",
      limit: 20,
      offset: 0,
    })).toEqual([]);
    expect(await workouts.getWorkoutDayPage("2026-09-21")).toBeNull();
  });

  it("summarizes completed and in-progress entries from multiple workout envelopes", async () => {
    const [summary] = await workouts.searchWorkoutDays({
      query: "",
      startDate: localTimestamp(2026, 9, 20, 0),
      endDate: localTimestamp(2026, 9, 20, 23, 59),
      limit: 10,
      offset: 0,
    });

    expect(summary).toEqual(expect.objectContaining({
      dayKey: summaryDay,
      totalExercises: 2,
      totalSets: 2,
      inProgressCount: 1,
    }));
    expect(summary.notesPreview).toContain("finished note preview");
    expect(summary.notesPreview).toContain("open note preview");
    expect(summary.notesPreview).not.toContain("draft note");
    expect(summary.notesPreview).not.toContain("legacy note");
  });

  it("returns exact completion state through details and the full day page", async () => {
    const details = await workouts.getWorkoutDayDetails(summaryDay);
    expect(details.exercises).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workoutExerciseId: summaryCompletedEntryId,
        completedAt: summaryCompletedAt,
      }),
      expect.objectContaining({
        workoutExerciseId: summaryOpenEntryId,
        completedAt: null,
      }),
    ]));

    const page = await workouts.getWorkoutDayPage(summaryDay);
    expect(page).not.toBeNull();
    expect(page?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workoutExerciseId: summaryCompletedEntryId,
        completedAt: summaryCompletedAt,
        totalSets: 1,
      }),
      expect.objectContaining({
        workoutExerciseId: summaryOpenEntryId,
        completedAt: null,
        totalSets: 1,
        bestSet: null,
      }),
    ]));
    expect(page?.totals.totalExercises).toBe(2);
    expect(page?.totals.totalSets).toBe(2);
    expect(page?.totals.totalVolumeKg).toBe(500);
    expect(page?.totals.bestE1rmKg).toBe(117);
    expect(details.totalVolumeKg).toBe(500);
    expect(details.bestE1rmKg).toBe(117);
  });

  it("uses the newest day containing real sets and returns completion state", async () => {
    const lastDay = await workouts.getLastWorkoutDay();

    expect(lastDay?.date).toBe(localTimestamp(2026, 9, 22, 0));
    expect(lastDay?.exercises).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workoutExerciseId: recentCompletedEntryId,
        completedAt: recentCompletedAt,
      }),
      expect.objectContaining({
        workoutExerciseId: recentOpenEntryId,
        completedAt: null,
      }),
    ]));
  });

  it("limits a 27-entry day after excluding empty drafts", async () => {
    const details = await workouts.getWorkoutDayDetails(overflowDay);
    const page = await workouts.getWorkoutDayPage(overflowDay);

    expect(details.exercises).toHaveLength(26);
    expect(details.hasMoreExercises).toBe(true);
    expect(details.exercises.every((entry) => !entry.exerciseName.includes("Draft"))).toBe(true);
    expect(page?.entries).toHaveLength(26);
    expect(page?.hasMore).toBe(true);
    expect(page?.entries.every((entry) => !entry.exerciseName.includes("Draft"))).toBe(true);
    expect(page?.entries.every((entry) => entry.sets.length >= 1)).toBe(true);
  });

  it("preserves alpha, numeric, and mixed-token search intersections for visible entries", async () => {
    const searchRows = async (query: string) => workouts.searchWorkoutDays({
      query,
      limit: 20,
      offset: 0,
    });
    const search = async (query: string) => (await searchRows(query)).map((day) => day.dayKey);

    expect(await search("squat")).toEqual([searchDay]);
    expect(await searchRows("squat")).toEqual([
      expect.objectContaining({ dayKey: searchDay, inProgressCount: 1 }),
    ]);
    expect(await search("clean")).toEqual([searchDay]);
    expect(await search("142.5")).toEqual([searchDay]);
    expect(await search("squat clean 142.5 5")).toEqual([searchDay]);
    expect(await search("tempo 12")).toEqual([secondSearchDay]);
    expect(await search("phantom 999")).toEqual([]);
  });

  it("keeps date-only filters, day pagination, and day counts based on entries with sets", async () => {
    expect(await workouts.searchWorkoutDays({
      query: "",
      startDate: localTimestamp(2026, 9, 18, 0),
      endDate: localTimestamp(2026, 9, 18, 23, 59),
      limit: 20,
      offset: 0,
    })).toEqual([
      expect.objectContaining({ dayKey: searchDay, inProgressCount: 1 }),
    ]);

    const allDays = await workouts.listWorkoutDays({ limit: 20, offset: 0 });
    expect(allDays.map((day) => day.dayKey)).toEqual([
      recentDay,
      summaryDay,
      overflowDay,
      searchDay,
      secondSearchDay,
      "2026-03-30",
      "2026-03-29",
    ]);
    expect((await workouts.listWorkoutDays({ limit: 2, offset: 1 })).map((day) => day.dayKey))
      .toEqual([summaryDay, overflowDay]);
    expect(await workouts.searchWorkoutDays({ query: "", limit: 2, offset: 1 }))
      .toEqual(await workouts.listWorkoutDays({ limit: 2, offset: 1 }));

    const quickStats = await workouts.getQuickStats();
    expect(quickStats.totalWorkoutDays).toBe(7);
    expect(quickStats.totalVolumeKg).toBe(7838);
  });

  it("groups fixed local-midnight and DST-transition timestamps into their local dates", async () => {
    const days = await workouts.searchWorkoutDays({
      query: "DST",
      startDate: localTimestamp(2026, 3, 29, 0),
      endDate: localTimestamp(2026, 3, 30, 23, 59),
      limit: 10,
      offset: 0,
    });

    expect(days.map((day) => day.dayKey)).toEqual(["2026-03-30", "2026-03-29"]);
  });
});
