import { createManualLoggingDatabase, initializeTestDatabaseBindings } from "../helpers/manualLoggingDatabase";

const mockDatabase = createManualLoggingDatabase();
jest.mock("expo-sqlite", () => ({ openDatabaseSync: () => mockDatabase.expoDatabase }));
initializeTestDatabaseBindings(mockDatabase);
const sessions = require("../../lib/db/workoutSessions") as typeof import("../../lib/db/workoutSessions");
const workouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");
const timestamp = new Date(2026, 8, 24, 12).getTime();
const nextDay = new Date(2026, 8, 25, 12).getTime();
const exec = (statement: string) => mockDatabase.expoDatabase.execSync(statement);

describe("recorded sets define added and in-progress exercises", () => {
  beforeEach(() => {
    exec(`DELETE FROM workouts; DELETE FROM exercises;
      INSERT INTO workouts(id, started_at) VALUES (1, ${timestamp});
      INSERT INTO exercises(id, name) VALUES (1, 'Bodyweight row'), (2, 'Empty draft'), (3, 'Unconfirmed plan');`);
  });
  afterAll(() => mockDatabase.close());

  it("hides empty and planned-only entries from workout details/counts without deleting any stored rows", async () => {
    exec(`INSERT INTO workout_exercises(id, workout_id, exercise_id, performed_at, completed_at, note) VALUES
      (1, 1, 1, ${timestamp}, NULL, 'Open empty note'),
      (2, 1, 2, ${timestamp}, ${timestamp}, 'Completed empty note'),
      (3, 1, 3, ${nextDay}, NULL, 'Plan entry note');
      INSERT INTO sets(id, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, note) VALUES
      (1, 1, 3, 3, 100, 5, '[PLANNED] next workout');`);
    const entriesBefore = mockDatabase.rows("SELECT * FROM workout_exercises ORDER BY id");
    const setsBefore = mockDatabase.rows("SELECT * FROM sets ORDER BY id");

    expect(await sessions.getWorkoutSessionDetail(1)).toMatchObject({ exerciseCount: 0, inProgressCount: 0, setCount: 0, volumeKg: 0, exercises: [], unassignedSets: [] });
    expect(await sessions.listWorkoutSessionsForDate(timestamp)).toEqual([expect.objectContaining({ exerciseCount: 0, inProgressCount: 0, setCount: 0 })]);
    expect(await sessions.listWorkoutSessionsForDate(nextDay)).toEqual([]);
    expect(await workouts.listInProgressExercises(1)).toEqual([]);
    expect(await workouts.getWorkoutExercisesForDate(timestamp)).toEqual([]);
    expect(await workouts.listSetsForWorkoutExercise(3)).toEqual([expect.objectContaining({ id: 1, note: '[PLANNED] next workout' })]);
    expect(mockDatabase.rows("SELECT * FROM workout_exercises ORDER BY id")).toEqual(entriesBefore);
    expect(mockDatabase.rows("SELECT * FROM sets ORDER BY id")).toEqual(setsBefore);

    await sessions.completeWorkoutSession(1);
    expect(mockDatabase.rows("SELECT id FROM workout_exercises WHERE completed_at IS NULL")).toEqual([]);
    expect((await sessions.getWorkoutSessionDetail(1))?.exercises).toEqual([]);
  });

  it("counts zero-load records and repeated entries, and ends progress only on explicit completion or last-set removal", async () => {
    exec(`INSERT INTO workout_exercises(id, workout_id, exercise_id, performed_at) VALUES (1, 1, 1, ${timestamp}), (2, 1, 1, ${timestamp});
      INSERT INTO sets(id, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, note) VALUES
        (1, 1, 1, 1, 0, 12, NULL), (2, 1, 1, 1, 80, 5, '[PLANNED] unconfirmed'),
        (3, 1, 1, 2, 0, 0, 'Recorded zero values');`);
    let detail = (await sessions.getWorkoutSessionDetail(1))!;
    expect(detail).toMatchObject({ exerciseCount: 2, setCount: 2, volumeKg: 0, inProgressCount: 2 });
    expect(detail.exercises.map((entry) => entry.sets.map((set) => set.id))).toEqual([[1], [3]]);
    expect((await workouts.listInProgressExercises(1)).map((entry) => entry.exerciseId)).toEqual([1]);

    await workouts.completeExerciseEntry(1);
    detail = (await sessions.getWorkoutSessionDetail(1))!;
    expect(detail).toMatchObject({ exerciseCount: 2, setCount: 2, inProgressCount: 1 });
    expect((await workouts.listInProgressExercises(1)).map((entry) => entry.workoutExerciseId)).toEqual([2]);

    await workouts.deleteSet(3);
    expect(await sessions.getWorkoutSessionDetail(1)).toMatchObject({ exerciseCount: 1, setCount: 1, inProgressCount: 0 });
    expect(await workouts.listInProgressExercises(1)).toEqual([]);
    expect(mockDatabase.rows("SELECT id, completed_at FROM workout_exercises WHERE id = 2")).toEqual([{ id: 2, completed_at: null }]);
  });

  it("does not expose unconfirmed-only entries as in-progress history, then exposes zero-load sets when confirmed", async () => {
    exec(`INSERT INTO workout_exercises(id, workout_id, exercise_id, performed_at) VALUES (1, 1, 1, ${timestamp});
      INSERT INTO sets(id, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, note) VALUES (1, 1, 1, 1, 0, 8, '[PLANNED] bodyweight');`);
    expect(await workouts.getExerciseHistory(1)).toEqual([]);
    expect(await workouts.getLastWorkoutDay()).toBeNull();
    expect(await workouts.listWorkoutDays({ limit: 10, offset: 0 })).toEqual([]);
    expect(await workouts.getWorkoutDayPage("2026-09-24")).toBeNull();
    expect((await workouts.getWorkoutDayDetails("2026-09-24")).exercises).toEqual([]);
    expect(await workouts.searchWorkoutDays({ query: "bodyweight", limit: 10, offset: 0 })).toEqual([]);
    expect(await workouts.searchWorkoutDays({ query: "8", limit: 10, offset: 0 })).toEqual([]);
    expect(await workouts.searchWorkoutDays({ query: "", startDate: timestamp - 1000, endDate: timestamp + 1000, limit: 10, offset: 0 })).toEqual([]);

    await workouts.updateSet(1, { note: "bodyweight" });
    expect(await sessions.getWorkoutSessionDetail(1)).toMatchObject({ exerciseCount: 1, inProgressCount: 1, setCount: 1 });
    expect((await workouts.getExerciseHistory(1))[0].workoutExercise?.completedAt).toBeNull();
    expect(await workouts.listWorkoutDays({ limit: 10, offset: 0 })).toEqual([expect.objectContaining({ inProgressCount: 1, totalExercises: 1, totalSets: 1 })]);
    expect((await workouts.getLastWorkoutDay())?.exercises).toEqual([expect.objectContaining({ workoutExerciseId: 1, completedAt: null })]);
    expect((await workouts.getWorkoutExercisesForDate(timestamp)).map((entry) => entry.workoutExerciseId)).toEqual([1]);
    await workouts.completeExerciseEntry(1);
    expect((await workouts.getExerciseHistory(1))[0].workoutExercise?.completedAt).not.toBeNull();
    expect((await workouts.listWorkoutDays({ limit: 10, offset: 0 }))[0].inProgressCount).toBe(0);
  });

  it("preserves existing completed-history visibility for legacy planned rows without calling them in progress", async () => {
    exec(`INSERT INTO workout_exercises(id, workout_id, exercise_id, performed_at, completed_at) VALUES (1, 1, 1, ${timestamp}, ${timestamp});
      INSERT INTO sets(id, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, note) VALUES (1, 1, 1, 1, 0, 8, '[PLANNED] legacy completed row');`);
    expect(await workouts.listInProgressExercises(1)).toEqual([]);
    expect((await workouts.getExerciseHistory(1))[0].sets).toEqual([expect.objectContaining({ id: 1 })]);
    expect((await workouts.listWorkoutDays({ limit: 10, offset: 0 }))[0]).toMatchObject({ inProgressCount: 0, totalExercises: 1 });
    expect((await workouts.getLastWorkoutDay())?.exercises).toEqual([expect.objectContaining({ workoutExerciseId: 1, completedAt: timestamp })]);
    expect((await workouts.getWorkoutDayPage("2026-09-24"))?.entries).toEqual([expect.objectContaining({ workoutExerciseId: 1, completedAt: timestamp })]);
    expect(await sessions.getWorkoutSessionDetail(1)).toMatchObject({ exerciseCount: 0, inProgressCount: 0, setCount: 0, exercises: [] });
  });
});
