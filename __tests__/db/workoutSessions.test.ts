import { createManualLoggingDatabase, initializeTestDatabaseBindings } from "../helpers/manualLoggingDatabase";

const mockDatabase = createManualLoggingDatabase();
jest.mock("expo-sqlite", () => ({ openDatabaseSync: () => mockDatabase.expoDatabase }));
initializeTestDatabaseBindings(mockDatabase);
const sessions = require("../../lib/db/workoutSessions") as typeof import("../../lib/db/workoutSessions");
const workouts = require("../../lib/db/workouts") as typeof import("../../lib/db/workouts");
const { initializeDatabase } = require("../../lib/db/bootstrap") as typeof import("../../lib/db/bootstrap");
const day = (d: number, hour = 10) => new Date(2026, 9, d, hour, 15).getTime();

function exec(sql: string) { mockDatabase.expoDatabase.execSync(sql); }
function entry(workoutId: number, completedAt: number | null = null) {
  const exerciseId = mockDatabase.insertExercise(`Lift ${workoutId}`);
  exec(`INSERT INTO workout_exercises (id, workout_id, exercise_id, performed_at, completed_at, note) VALUES (${workoutId}, ${workoutId}, ${exerciseId}, ${day(23)}, ${completedAt ?? "NULL"}, 'Entry note');`);
  exec(`INSERT INTO sets (id, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, performed_at, note) VALUES (${workoutId}, ${workoutId}, ${exerciseId}, ${workoutId}, 100, 5, ${day(23, 11)}, 'Set note');`);
  return exerciseId;
}

describe("named workout sessions on SQLite", () => {
  beforeEach(() => exec("DELETE FROM program_calendar_sets; DELETE FROM program_calendar_exercises; DELETE FROM program_calendar; DELETE FROM psl_programs; DELETE FROM workouts; DELETE FROM exercises;"));
  afterAll(() => mockDatabase.close());

  it("lists same-day sessions newest first with stable names and separate aggregate counts", async () => {
    const first = await sessions.createWorkoutSession(day(23, 8));
    entry(first);
    await sessions.completeWorkoutSession(first);
    const second = await sessions.createWorkoutSession(day(23, 18));
    await sessions.updateWorkoutSession(second, { name: "  Evening lift  ", note: "  exact note  " });
    const list = await sessions.listWorkoutSessionsForDate(day(23));
    expect(list).toEqual([
      expect.objectContaining({ id: second, name: "Evening lift", note: "  exact note  ", exerciseCount: 0, setCount: 0, volumeKg: 0 }),
      expect.objectContaining({ id: first, name: "Workout 1 Fri 23 Oct", exerciseCount: 1, setCount: 1, volumeKg: 500, inProgressCount: 0 }),
    ]);
    await sessions.updateWorkoutSession(second, { name: "", note: null });
    expect((await sessions.getWorkoutSessionDetail(second))?.name).toBe("Workout 2 Fri 23 Oct");
    expect(await sessions.listWorkoutSessionsForDate(day(24))).toEqual([]);
  });

  it("rejects new/resume conflicts through new and legacy APIs without completing entries", async () => {
    const first = await sessions.createWorkoutSession(day(23));
    const exerciseId = entry(first);
    await expect(sessions.createWorkoutSession(day(24))).rejects.toMatchObject({ name: "ActiveWorkoutConflictError", activeWorkoutId: first });
    await expect(workouts.createWorkout()).rejects.toMatchObject({ activeWorkoutId: first });
    expect(await workouts.getOrCreateActiveWorkout()).toBe(first);
    expect(await workouts.getOpenWorkoutExercise(first, exerciseId)).not.toBeNull();
    expect(() => exec(`INSERT INTO workouts(started_at) VALUES (${day(24)});`)).toThrow(/UNIQUE/);
    await sessions.completeWorkoutSession(first);
    const second = await sessions.createWorkoutSession(day(24));
    await expect(sessions.resumeWorkoutSession(first)).rejects.toMatchObject({ activeWorkoutId: second });
    await sessions.completeWorkoutSession(second);
    await sessions.resumeWorkoutSession(first);
    expect((await workouts.getActiveWorkout())?.id).toBe(first);
    // Resuming the container does not silently reopen completed exercise entries.
    expect(await workouts.getOpenWorkoutExercise(first, exerciseId)).toBeNull();
  });

  it("completes every open entry atomically while retaining performed dates and notes", async () => {
    const id = await sessions.createWorkoutSession(day(23));
    const exerciseId = entry(id);
    exec(`INSERT INTO workout_exercises (id, workout_id, exercise_id, completed_at, performed_at) VALUES (900, ${id}, ${exerciseId}, NULL, NULL);`);
    exec(`CREATE TRIGGER fail_workout_completion BEFORE UPDATE OF completed_at ON workouts BEGIN SELECT RAISE(ABORT, 'injected completion failure'); END;`);
    await expect(sessions.completeWorkoutSession(id)).rejects.toThrow("injected completion failure");
    expect(mockDatabase.rows("SELECT completed_at FROM workout_exercises")).toEqual([{ completed_at: null }, { completed_at: null }]);
    exec("DROP TRIGGER fail_workout_completion;");
    await sessions.completeWorkoutSession(id);
    const detail = (await sessions.getWorkoutSessionDetail(id))!;
    expect(detail.inProgressCount).toBe(0);
    expect(detail.exercises[0]).toMatchObject({ performedAt: day(23), note: "Entry note", sets: [expect.objectContaining({ note: "Set note", performedAt: day(23, 11) })] });
    expect(detail.exercises).toHaveLength(1);
    expect(mockDatabase.rows("SELECT performed_at, completed_at FROM workout_exercises WHERE id = 900")).toEqual([
      { performed_at: day(23), completed_at: detail.completedAt },
    ]);
    expect(detail.exercises.every((item) => item.completedAt !== null)).toBe(true);
  });

  it("keeps legacy unassigned sets visible and counted", async () => {
    const id = await sessions.createWorkoutSession(day(23));
    const exerciseId = mockDatabase.insertExercise("Legacy lift");
    exec(`INSERT INTO sets(workout_id, exercise_id, reps, weight_kg) VALUES (${id}, ${exerciseId}, 10, 0);`);
    expect(await sessions.getWorkoutSessionDetail(id)).toMatchObject({ setCount: 1, volumeKg: 0, exercises: [], unassignedSets: [expect.objectContaining({ exerciseName: "Legacy lift", reps: 10 })] });
  });

  it("finds legacy cross-day envelopes on each real training day without splitting data or renumbering names", async () => {
    const first = await sessions.createWorkoutSession(day(21, 8));
    await sessions.completeWorkoutSession(first);
    const legacy = await sessions.createWorkoutSession(day(21, 10));
    const exerciseId = entry(legacy);
    // The legacy logger reused this October 21 container for later days.
    exec(`INSERT INTO sets(workout_id, exercise_id, performed_at, weight_kg, reps) VALUES (${legacy}, ${exerciseId}, ${day(24)}, 20, 10);
      INSERT INTO workout_exercises(workout_id, exercise_id, performed_at) VALUES (${legacy}, ${exerciseId}, ${day(25)});`);
    expect((await sessions.listWorkoutSessionsForDate(day(23))).map((item) => item.id)).toEqual([legacy]);
    expect((await sessions.listWorkoutSessionsForDate(day(24))).map((item) => item.id)).toEqual([legacy]);
    expect(await sessions.listWorkoutSessionsForDate(day(25))).toEqual([]);
    const summary = (await sessions.listWorkoutSessionsForDate(day(23)))[0];
    expect(summary).toMatchObject({ name: "Workout 2 Wed 21 Oct", startedAt: day(21), setCount: 2, volumeKg: 700 });
    expect((await sessions.getWorkoutSessionDetail(legacy))?.exercises[0].performedAt).toBe(day(23));
    expect(mockDatabase.rows("SELECT id FROM workouts")).toHaveLength(2);
  });

  it("moves an entry, all its sets and attached media, retimes PB/program dates, and preserves IDs and notes", async () => {
    const source = await sessions.createWorkoutSession(day(23));
    const exerciseId = entry(source, day(23, 12));
    await workouts.updateSet(source, { weight_kg: 100 });
    await sessions.completeWorkoutSession(source);
    const target = await sessions.createWorkoutSession(day(24));
    exec(`INSERT INTO media(id, local_uri, set_id, workout_id, note) VALUES (1, 'set-video', ${source}, ${source}, 'video note'), (2, 'workout-video', NULL, ${source}, 'whole workout');`);
    exec(`INSERT INTO psl_programs(id, name, psl_source) VALUES (1, 'Plan', '');
      INSERT INTO program_calendar(id, program_id, psl_session_id, session_name, date_iso, sequence) VALUES (1, 1, 'one', 'Session', '2026-10-23', 1);
      INSERT INTO program_calendar_exercises(id, calendar_id, exercise_name, exercise_id, order_index, prescribed_sets_json, workout_exercise_id) VALUES (1, 1, 'Lift', ${exerciseId}, 1, '[]', ${source});
      INSERT INTO program_calendar_sets(id, calendar_exercise_id, set_index, set_id, is_logged, logged_at, actual_weight, actual_reps) VALUES (1, 1, 1, ${source}, 1, ${day(23, 11)}, 100, 5);`);
    await sessions.moveWorkoutExerciseToWorkout(source, target);
    expect(mockDatabase.rows("SELECT id, workout_id, performed_at, note FROM workout_exercises")).toEqual([{ id: source, workout_id: target, performed_at: day(24), note: "Entry note" }]);
    expect(mockDatabase.rows("SELECT id, workout_id, workout_exercise_id, performed_at, note FROM sets")).toEqual([{ id: source, workout_id: target, workout_exercise_id: source, performed_at: day(24, 11), note: "Set note" }]);
    expect(mockDatabase.rows("SELECT id, workout_id FROM media ORDER BY id")).toEqual([{ id: 1, workout_id: target }, { id: 2, workout_id: source }]);
    expect(mockDatabase.rows("SELECT workout_exercise_id FROM program_calendar_exercises")).toEqual([{ workout_exercise_id: source }]);
    expect(mockDatabase.rows("SELECT set_id, logged_at, actual_weight, actual_reps FROM program_calendar_sets")).toEqual([{ set_id: source, logged_at: day(24, 11), actual_weight: 100, actual_reps: 5 }]);
    expect(mockDatabase.rows("SELECT date_iso FROM program_calendar")).toEqual([{ date_iso: "2026-10-23" }]);
    expect(mockDatabase.rows("SELECT DISTINCT set_id, occurred_at FROM pr_events")).toEqual([{ set_id: source, occurred_at: day(24, 11) }]);
    expect(mockDatabase.rows("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("rolls back the entire move on a failed write and validates the target", async () => {
    const source = await sessions.createWorkoutSession(day(23));
    entry(source, day(23));
    await sessions.completeWorkoutSession(source);
    const target = await sessions.createWorkoutSession(day(24));
    exec(`INSERT INTO media(local_uri, set_id, workout_id) VALUES ('video', ${source}, ${source});
      CREATE TRIGGER fail_move BEFORE UPDATE OF workout_id ON workout_exercises BEGIN SELECT RAISE(ABORT, 'injected move failure'); END;`);
    await expect(sessions.moveWorkoutExerciseToWorkout(source, target)).rejects.toThrow("injected move failure");
    expect(mockDatabase.rows("SELECT workout_id, performed_at FROM sets")).toEqual([{ workout_id: source, performed_at: day(23, 11) }]);
    expect(mockDatabase.rows("SELECT workout_id FROM media")).toEqual([{ workout_id: source }]);
    exec("DROP TRIGGER fail_move;");
    await expect(sessions.moveWorkoutExerciseToWorkout(source, 9999)).rejects.toThrow("does not exist");
  });

  it("recomputes PBs by performed date instead of insertion order after a move", async () => {
    const source = await sessions.createWorkoutSession(day(23));
    const exerciseId = entry(source, day(23));
    // This lower set was inserted later but happened earlier than the moved set.
    exec(`INSERT INTO sets(id, workout_id, exercise_id, performed_at, weight_kg, reps) VALUES (900, ${source}, ${exerciseId}, ${day(22)}, 90, 5);`);
    await sessions.completeWorkoutSession(source);
    const target = await sessions.createWorkoutSession(day(24));
    await sessions.moveWorkoutExerciseToWorkout(source, target);
    expect(mockDatabase.rows("SELECT set_id, metric_value, occurred_at FROM pr_events ORDER BY occurred_at")).toEqual([
      { set_id: 900, metric_value: 90, occurred_at: day(22) },
      { set_id: source, metric_value: 100, occurred_at: day(24, 11) },
    ]);
  });

  it("rejects moving an unfinished entry into a completed destination without changing either workout", async () => {
    const target = await sessions.createWorkoutSession(day(22));
    await sessions.completeWorkoutSession(target);
    const source = await sessions.createWorkoutSession(day(23));
    entry(source);
    await expect(sessions.moveWorkoutExerciseToWorkout(source, target)).rejects.toThrow("Resume the destination workout");
    expect((await sessions.getWorkoutSessionDetail(source))?.inProgressCount).toBe(1);
    expect((await workouts.getActiveWorkout())?.id).toBe(source);
  });

  it("migrates legacy duplicate active envelopes without changing notes, history or open entries", () => {
    const legacy = createManualLoggingDatabase();
    try {
      initializeDatabase(legacy.expoDatabase as never);
      legacy.expoDatabase.execSync(`DROP INDEX idx_workouts_single_active; ALTER TABLE workouts DROP COLUMN name;
        INSERT INTO workouts(id, uid, started_at, note) VALUES (1, 'first', ${day(23)}, 'older note'), (2, 'second', ${day(24)}, 'newer note');
        INSERT INTO exercises(id, uid, name) VALUES (1, 'lift', 'Lift');
        INSERT INTO workout_exercises(id, workout_id, exercise_id, performed_at, note) VALUES (1, 1, 1, ${day(23, 12)}, 'entry preserved');
        INSERT INTO sets(id, workout_id, exercise_id, workout_exercise_id, performed_at, note) VALUES (1, 1, 1, 1, ${day(23, 13)}, 'set preserved');`);
      initializeDatabase(legacy.expoDatabase as never);
      initializeDatabase(legacy.expoDatabase as never);
      expect(legacy.rows("SELECT id, uid, note, name, completed_at FROM workouts ORDER BY id")).toEqual([
        { id: 1, uid: "first", note: "older note", name: null, completed_at: day(23, 13) },
        { id: 2, uid: "second", note: "newer note", name: null, completed_at: null },
      ]);
      expect(legacy.rows("SELECT completed_at, performed_at, note FROM workout_exercises")).toEqual([{ completed_at: null, performed_at: day(23, 12), note: "entry preserved" }]);
      expect(legacy.rows("SELECT id, workout_exercise_id, note FROM sets")).toEqual([{ id: 1, workout_exercise_id: 1, note: "set preserved" }]);
      expect(legacy.rows("PRAGMA foreign_key_check")).toEqual([]);
    } finally { legacy.close(); }
  });
});
