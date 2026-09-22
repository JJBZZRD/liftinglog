import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

type DatabaseSnapshot = {
  workouts: Record<string, unknown>[];
  workoutExercises: Record<string, unknown>[];
  sets: Record<string, unknown>[];
  pbEvents: Record<string, unknown>[];
  programCalendarExercises: Record<string, unknown>[];
  programCalendarSets: Record<string, unknown>[];
};

function snapshotDatabase(): DatabaseSnapshot {
  return {
    workouts: mockDatabase.rows("SELECT * FROM workouts ORDER BY id"),
    workoutExercises: mockDatabase.rows("SELECT * FROM workout_exercises ORDER BY id"),
    sets: mockDatabase.rows("SELECT * FROM sets ORDER BY id"),
    pbEvents: mockDatabase.rows("SELECT * FROM pr_events ORDER BY id"),
    programCalendarExercises: mockDatabase.rows(
      "SELECT * FROM program_calendar_exercises ORDER BY id"
    ),
    programCalendarSets: mockDatabase.rows("SELECT * FROM program_calendar_sets ORDER BY id"),
  };
}

async function createLoggedEntry(args: {
  workoutId: number;
  exerciseName: string;
  performedAt: number;
  entryNote: string;
  setNote: string;
}) {
  const exerciseId = mockDatabase.insertExercise(args.exerciseName);
  const workoutExerciseId = await workouts.addWorkoutExercise({
    workout_id: args.workoutId,
    exercise_id: exerciseId,
    performed_at: args.performedAt,
    note: args.entryNote,
  });
  const setId = await workouts.addSet({
    workout_id: args.workoutId,
    exercise_id: exerciseId,
    workout_exercise_id: workoutExerciseId,
    weight_kg: 75,
    reps: 5,
    performed_at: args.performedAt,
    note: args.setNote,
  });

  return { workoutExerciseId, setId };
}

describe("canonical workout note persistence", () => {
  afterAll(() => {
    mockDatabase.close();
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  });

  it("adds, edits, preserves exact payloads, and clears notes without changing workout status or child rows", async () => {
    const openWorkoutId = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 21, 8),
    });
    const completedWorkoutId = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 21, 9),
      note: "completed original",
    });
    const otherWorkoutId = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 21, 10),
      note: "other envelope",
    });
    const completedAt = localTimestamp(2026, 9, 21, 11);
    await workouts.completeWorkout(completedWorkoutId, completedAt);

    const { workoutExerciseId, setId } = await createLoggedEntry({
      workoutId: openWorkoutId,
      exerciseName: "Workout Note Isolation Press",
      performedAt: localTimestamp(2026, 9, 21, 8, 15),
      entryNote: "entry note stays separate",
      setNote: "set note stays separate",
    });
    const openBefore = await workouts.getWorkoutById(openWorkoutId);
    const completedBefore = await workouts.getWorkoutById(completedWorkoutId);
    const childRowsBefore = {
      entry: await workouts.getWorkoutExerciseById(workoutExerciseId),
      set: await workouts.getSetById(setId),
      pbEvents: mockDatabase.rows("SELECT * FROM pr_events ORDER BY id"),
      programCalendarExercises: mockDatabase.rows(
        "SELECT * FROM program_calendar_exercises ORDER BY id"
      ),
      programCalendarSets: mockDatabase.rows("SELECT * FROM program_calendar_sets ORDER BY id"),
    };

    await workouts.updateWorkoutNote(openWorkoutId, "  exact workout note\n");
    expect((await workouts.getWorkoutById(openWorkoutId))?.note).toBe("  exact workout note\n");

    await workouts.updateWorkoutNote(openWorkoutId, "");
    expect((await workouts.getWorkoutById(openWorkoutId))?.note).toBe("");

    await workouts.updateWorkoutNote(completedWorkoutId, "completed edited");
    await workouts.updateWorkoutNote(openWorkoutId, null);

    expect(await workouts.getWorkoutById(openWorkoutId)).toEqual({
      ...openBefore,
      note: null,
    });
    expect(await workouts.getWorkoutById(completedWorkoutId)).toEqual({
      ...completedBefore,
      completedAt,
      note: "completed edited",
    });
    expect((await workouts.getWorkoutById(otherWorkoutId))?.note).toBe("other envelope");
    expect({
      entry: await workouts.getWorkoutExerciseById(workoutExerciseId),
      set: await workouts.getSetById(setId),
      pbEvents: mockDatabase.rows("SELECT * FROM pr_events ORDER BY id"),
      programCalendarExercises: mockDatabase.rows(
        "SELECT * FROM program_calendar_exercises ORDER BY id"
      ),
      programCalendarSets: mockDatabase.rows("SELECT * FROM program_calendar_sets ORDER BY id"),
    }).toEqual(childRowsBefore);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid workout id %p without mutating the database",
    async (workoutId) => {
      const before = snapshotDatabase();

      await expect(workouts.updateWorkoutNote(workoutId, "invalid id note")).rejects.toThrow(
        "workoutId must be a positive safe integer"
      );
      expect(snapshotDatabase()).toEqual(before);
    }
  );

  it("rejects an unknown workout id without creating a row or mutating existing data", async () => {
    const before = snapshotDatabase();

    await expect(workouts.updateWorkoutNote(987_654_321, "orphan note")).rejects.toThrow(
      "Workout 987654321 does not exist"
    );
    expect(snapshotDatabase()).toEqual(before);
  });

  it("surfaces a SQLite write failure and leaves all data unchanged", async () => {
    const workoutId = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 22, 8),
      note: "before forced failure",
    });
    mockDatabase.expoDatabase.execSync(`
      CREATE TRIGGER fail_workout_note_update
      BEFORE UPDATE OF note ON workouts
      WHEN NEW.note = 'blocked workout note'
      BEGIN
        SELECT RAISE(ABORT, 'forced workout note failure');
      END;
    `);
    const before = snapshotDatabase();

    try {
      await expect(
        workouts.updateWorkoutNote(workoutId, "blocked workout note")
      ).rejects.toThrow("forced workout note failure");
      expect(snapshotDatabase()).toEqual(before);
    } finally {
      mockDatabase.expoDatabase.execSync("DROP TRIGGER fail_workout_note_update;");
    }
  });

  it("returns workout identity and workout notes separately for two envelopes on one local day", async () => {
    const dayKey = "2026-09-23";
    const firstWorkoutId = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 23, 8),
      note: "first workout note",
    });
    const secondWorkoutId = await workouts.createWorkout({
      started_at: localTimestamp(2026, 9, 23, 18),
      note: "second workout note",
    });
    const first = await createLoggedEntry({
      workoutId: firstWorkoutId,
      exerciseName: "Morning Workout Note Squat",
      performedAt: localTimestamp(2026, 9, 23, 8, 15),
      entryNote: "first entry note",
      setNote: "first set note",
    });
    const second = await createLoggedEntry({
      workoutId: secondWorkoutId,
      exerciseName: "Evening Workout Note Row",
      performedAt: localTimestamp(2026, 9, 23, 18, 15),
      entryNote: "second entry note",
      setNote: "second set note",
    });

    const page = await workouts.getWorkoutDayPage(dayKey);
    const entriesByWorkoutId = new Map(page?.entries.map((entry) => [entry.workoutId, entry]));

    expect(page?.entries).toHaveLength(2);
    expect(entriesByWorkoutId.get(firstWorkoutId)).toEqual(
      expect.objectContaining({
        workoutId: firstWorkoutId,
        workoutNote: "first workout note",
        workoutExerciseId: first.workoutExerciseId,
        note: "first entry note",
        sets: [expect.objectContaining({ id: first.setId, note: "first set note" })],
      })
    );
    expect(entriesByWorkoutId.get(secondWorkoutId)).toEqual(
      expect.objectContaining({
        workoutId: secondWorkoutId,
        workoutNote: "second workout note",
        workoutExerciseId: second.workoutExerciseId,
        note: "second entry note",
        sets: [expect.objectContaining({ id: second.setId, note: "second set note" })],
      })
    );
  });

  it("persists workout, exercise-entry, and set notes across a file-backed reopen", async () => {
    const databaseDirectory = mkdtempSync(join(tmpdir(), "workout-notes-"));
    const databasePath = join(databaseDirectory, "notes.sqlite");
    const firstDatabase = createManualLoggingDatabase(databasePath);
    let firstDatabaseOpen = true;
    let reopenedDatabase: ReturnType<typeof createManualLoggingDatabase> | null = null;

    try {
      jest.resetModules();
      jest.doMock("expo-sqlite", () => ({
        openDatabaseSync: () => firstDatabase.expoDatabase,
        addDatabaseChangeListener: () => ({ remove: jest.fn() }),
      }));
      initializeTestDatabaseBindings(firstDatabase);
      const firstWorkouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");
      const exerciseId = firstDatabase.insertExercise("Reopened Notes Deadlift");
      const workoutId = await firstWorkouts.createWorkout({
        started_at: localTimestamp(2026, 9, 24, 8),
      });
      const workoutExerciseId = await firstWorkouts.addWorkoutExercise({
        workout_id: workoutId,
        exercise_id: exerciseId,
      });
      const setId = await firstWorkouts.addSet({
        workout_id: workoutId,
        exercise_id: exerciseId,
        workout_exercise_id: workoutExerciseId,
        weight_kg: 140,
        reps: 4,
      });

      await firstWorkouts.updateWorkoutNote(workoutId, "reopened workout note");
      await firstWorkouts.updateWorkoutExerciseNote(
        workoutExerciseId,
        "reopened exercise-entry note"
      );
      await firstWorkouts.updateSet(setId, { note: "reopened set note" });
      firstDatabase.close();
      firstDatabaseOpen = false;

      jest.resetModules();
      reopenedDatabase = createManualLoggingDatabase(databasePath);
      jest.doMock("expo-sqlite", () => ({
        openDatabaseSync: () => reopenedDatabase!.expoDatabase,
        addDatabaseChangeListener: () => ({ remove: jest.fn() }),
      }));
      initializeTestDatabaseBindings(reopenedDatabase);
      const reopenedWorkouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");

      expect((await reopenedWorkouts.getWorkoutById(workoutId))?.note).toBe(
        "reopened workout note"
      );
      expect((await reopenedWorkouts.getWorkoutExerciseById(workoutExerciseId))?.note).toBe(
        "reopened exercise-entry note"
      );
      expect((await reopenedWorkouts.getSetById(setId))?.note).toBe("reopened set note");
    } finally {
      if (firstDatabaseOpen) firstDatabase.close();
      reopenedDatabase?.close();
      for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
        if (existsSync(path)) rmSync(path);
      }
      rmSync(databaseDirectory, { recursive: true, force: true });
    }
  });
});
