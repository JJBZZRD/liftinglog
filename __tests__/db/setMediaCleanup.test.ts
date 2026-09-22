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
const media = require("../../lib/db/media") as typeof import("../../lib/db/media");

type CalendarSet = {
  id: number;
  set_id: number | null;
  actual_weight: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  is_logged: number;
  logged_at: number | null;
};

async function insertLinkedProgramSet(setId: number) {
  const [{ workout_id: workoutId, exercise_id: exerciseId }] = mockDatabase.rows<{
    workout_id: number;
    exercise_id: number;
  }>("SELECT workout_id, exercise_id FROM sets WHERE id = ?", setId);
  const programId = mockDatabase.rows<{ id: number }>(
    "INSERT INTO psl_programs (name, psl_source, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id",
    `Cleanup program ${setId}`,
    "program cleanup",
    1,
    1
  )[0].id;
  const calendarId = mockDatabase.rows<{ id: number }>(
    "INSERT INTO program_calendar (program_id, psl_session_id, session_name, date_iso, sequence, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    programId,
    `cleanup-session-${setId}`,
    "Cleanup session",
    "2026-09-21",
    0,
    "partial"
  )[0].id;
  const calendarExerciseId = mockDatabase.rows<{ id: number }>(
    "INSERT INTO program_calendar_exercises (calendar_id, exercise_name, exercise_id, order_index, prescribed_sets_json, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    calendarId,
    "Cleanup press",
    exerciseId,
    0,
    "[]",
    "partial"
  )[0].id;
  const calendarSetId = mockDatabase.rows<{ id: number }>(
    "INSERT INTO program_calendar_sets (calendar_exercise_id, set_index, actual_weight, actual_reps, actual_rpe, is_logged, set_id, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    calendarExerciseId,
    0,
    100,
    5,
    8,
    1,
    setId,
    123
  )[0].id;
  return { calendarSetId, workoutId };
}

describe("set media cleanup", () => {
  afterAll(() => mockDatabase.close());

  it("deletes every linked media row and clears the program soft link without affecting another set", async () => {
    const exerciseId = mockDatabase.insertExercise("Cleanup press");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const entryId = await workouts.addWorkoutExercise({ workout_id: workoutId, exercise_id: exerciseId });
    const deletedSetId = await workouts.addSet({ workout_id: workoutId, exercise_id: exerciseId, workout_exercise_id: entryId, weight_kg: 100, reps: 5 });
    const preservedSetId = await workouts.addSet({ workout_id: workoutId, exercise_id: exerciseId, workout_exercise_id: entryId, weight_kg: 90, reps: 8 });
    const { calendarSetId } = await insertLinkedProgramSet(deletedSetId);

    await media.addMedia({ local_uri: "file:///set-videos/delete-one.mp4", set_id: deletedSetId });
    await media.addMedia({ local_uri: "file:///set-videos/delete-two.mp4", set_id: deletedSetId });
    const preservedMediaId = await media.addMedia({ local_uri: "file:///set-videos/preserve.mp4", set_id: preservedSetId });

    await workouts.deleteSet(deletedSetId);

    expect(mockDatabase.rows("SELECT id FROM sets WHERE id = ?", deletedSetId)).toEqual([]);
    expect(mockDatabase.rows("SELECT id FROM media WHERE set_id = ?", deletedSetId)).toEqual([]);
    expect(mockDatabase.rows("SELECT id, set_id FROM media WHERE id = ?", preservedMediaId)).toEqual([{ id: preservedMediaId, set_id: preservedSetId }]);
    expect(mockDatabase.rows<CalendarSet>(
      "SELECT id, set_id, actual_weight, actual_reps, actual_rpe, is_logged, logged_at FROM program_calendar_sets WHERE id = ?",
      calendarSetId
    )).toEqual([{
      id: calendarSetId,
      set_id: null,
      actual_weight: null,
      actual_reps: null,
      actual_rpe: null,
      is_logged: 0,
      logged_at: null,
    }]);
    expect(mockDatabase.rows("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("unlinking removes media links only and leaves the canonical set intact", async () => {
    const exerciseId = mockDatabase.insertExercise("Unlink press");
    const workoutId = await workouts.getOrCreateActiveWorkout();
    const setId = await workouts.addSet({ workout_id: workoutId, exercise_id: exerciseId, weight_kg: 60, reps: 10 });
    const mediaId = await media.addMedia({ local_uri: "file:///gallery/original.mp4", set_id: setId });

    await media.unlinkMediaForSet(setId);

    expect(mockDatabase.rows("SELECT id FROM sets WHERE id = ?", setId)).toEqual([{ id: setId }]);
    expect(mockDatabase.rows("SELECT id FROM media WHERE id = ?", mediaId)).toEqual([]);
    expect(mockDatabase.rows("PRAGMA foreign_key_check")).toEqual([]);
  });
});
