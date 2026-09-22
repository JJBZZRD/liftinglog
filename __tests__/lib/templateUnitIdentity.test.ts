import { createExerciseIdentityDatabase } from "../helpers/exerciseIdentityDatabase";
import { initializeTestDatabaseBindings } from "../helpers/manualLoggingDatabase";

const mockDatabase = createExerciseIdentityDatabase();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

initializeTestDatabaseBindings(mockDatabase);

const exerciseApi = require("../../lib/db/exercises") as typeof import("../../lib/db/exercises");
const programCalendar = require("../../lib/db/programCalendar") as typeof import("../../lib/db/programCalendar");
const pslPrograms = require("../../lib/db/pslPrograms") as typeof import("../../lib/db/pslPrograms");
const pslService = require("../../lib/programs/psl/pslService") as typeof import("../../lib/programs/psl/pslService");
const templates = require("../../lib/programs/psl/pslTemplates") as typeof import("../../lib/programs/psl/pslTemplates");
const templateUnitSync = require("../../lib/programs/psl/templateUnitSync") as typeof import("../../lib/programs/psl/templateUnitSync");

const FUTURE_DATE_ISO = "2099-09-21";
const FUTURE_END_DATE_ISO = "2099-09-30";

async function createActiveBundledProgram(exerciseName: string) {
  const source = templates.buildPersonalizedTemplateSource(
    "linear-progression",
    { target_exercise: exerciseName },
    `Linear Progression (${exerciseName})`,
    { targetUnit: "kg" }
  );
  const program = await pslPrograms.createPslProgram({
    name: `Linear Progression (${exerciseName})`,
    pslSource: source,
    isActive: true,
    startDate: FUTURE_DATE_ISO,
    endDate: FUTURE_END_DATE_ISO,
    units: "kg",
  });
  const compiled = pslService.compilePslSource(source, {
    calendarOverride: {
      start_date: FUTURE_DATE_ISO,
      end_date: FUTURE_END_DATE_ISO,
    },
  });
  if (!compiled.valid || !compiled.materialized) {
    throw new Error(
      `Expected bundled template fixture to materialize: ${JSON.stringify(compiled.diagnostics)}`
    );
  }

  const entries = pslService.extractCalendarEntries(compiled.materialized);
  if (entries.length < 2) {
    throw new Error("Expected at least two bundled template occurrences.");
  }
  await programCalendar.insertCalendarEntries(program.id, entries.slice(0, 2));
  return program;
}

function calendarExerciseRows(programId: number) {
  return mockDatabase.rows<{
    id: number;
    calendar_id: number;
    exercise_id: number | null;
    exercise_name: string;
    order_index: number;
    workout_exercise_id: number | null;
  }>(
    `SELECT pce.id, pce.calendar_id, pce.exercise_id, pce.exercise_name,
            pce.order_index, pce.workout_exercise_id
       FROM program_calendar_exercises pce
       JOIN program_calendar pc ON pc.id = pce.calendar_id
      WHERE pc.program_id = ?
      ORDER BY pc.date_iso, pc.sequence, pce.order_index`,
    programId
  );
}

function snapshotProgram(programId: number) {
  return {
    program: mockDatabase.rows<Record<string, unknown>>(
      "SELECT * FROM psl_programs WHERE id = ?",
      programId
    ),
    calendar: mockDatabase.rows<Record<string, unknown>>(
      "SELECT * FROM program_calendar WHERE program_id = ? ORDER BY id",
      programId
    ),
    exercises: mockDatabase.rows<Record<string, unknown>>(
      `SELECT pce.*
         FROM program_calendar_exercises pce
         JOIN program_calendar pc ON pc.id = pce.calendar_id
        WHERE pc.program_id = ?
        ORDER BY pce.id`,
      programId
    ),
    sets: mockDatabase.rows<Record<string, unknown>>(
      `SELECT pcs.*
         FROM program_calendar_sets pcs
         JOIN program_calendar_exercises pce ON pce.id = pcs.calendar_exercise_id
         JOIN program_calendar pc ON pc.id = pce.calendar_id
        WHERE pc.program_id = ?
        ORDER BY pcs.id`,
      programId
    ),
  };
}

function linkLoggedHistory(params: {
  calendarExerciseId: number;
  calendarId: number;
  exerciseId: number;
}) {
  const [calendarSet] = mockDatabase.rows<{ id: number }>(
    `SELECT id FROM program_calendar_sets
      WHERE calendar_exercise_id = ?
      ORDER BY set_index
      LIMIT 1`,
    params.calendarExerciseId
  );
  if (!calendarSet) {
    throw new Error("Expected a prescribed calendar set for logged history.");
  }
  const workoutId = mockDatabase.run(
    "INSERT INTO workouts (uid, started_at, completed_at) VALUES ('template-unit-workout', 1, 2)"
  ).lastInsertRowId;
  const workoutExerciseId = mockDatabase.run(
    `INSERT INTO workout_exercises
       (uid, workout_id, exercise_id, order_index, completed_at, performed_at)
     VALUES ('template-unit-workout-exercise', ?, ?, 0, 2, 1)`,
    workoutId,
    params.exerciseId
  ).lastInsertRowId;
  const setId = mockDatabase.run(
    `INSERT INTO sets
       (uid, workout_id, exercise_id, workout_exercise_id, set_index, weight_kg, reps, performed_at)
     VALUES ('template-unit-set', ?, ?, ?, 0, 60, 5, 1)`,
    workoutId,
    params.exerciseId,
    workoutExerciseId
  ).lastInsertRowId;

  mockDatabase.run(
    "UPDATE program_calendar SET status = 'complete', completed_at = 2 WHERE id = ?",
    params.calendarId
  );
  mockDatabase.run(
    `UPDATE program_calendar_exercises
        SET exercise_id = ?, status = 'complete', workout_exercise_id = ?
      WHERE id = ?`,
    params.exerciseId,
    workoutExerciseId,
    params.calendarExerciseId
  );
  mockDatabase.run(
    `UPDATE program_calendar_sets
        SET actual_weight = 60, actual_reps = 5, is_logged = 1,
            set_id = ?, logged_at = 2
      WHERE id = ?`,
    setId,
    calendarSet.id
  );

  return { workoutId, workoutExerciseId, setId, calendarSetId: calendarSet.id };
}

describe("bundled template unit sync exercise identity", () => {
  beforeEach(() => mockDatabase.reset());
  afterAll(() => mockDatabase.close());

  it("skips an ambiguous non-lowest explicit binding before changing program or calendar rows", async () => {
    await exerciseApi.createExercise({ name: "Template Duplicate" });
    const explicitlyBoundId = await exerciseApi.createExercise({
      name: "Template Duplicate",
    });
    const program = await createActiveBundledProgram("Template Duplicate");
    const [preserved, replaceable] = calendarExerciseRows(program.id);
    const history = linkLoggedHistory({
      calendarExerciseId: preserved.id,
      calendarId: preserved.calendar_id,
      exerciseId: explicitlyBoundId,
    });
    mockDatabase.run(
      "UPDATE program_calendar_exercises SET exercise_id = ? WHERE id = ?",
      explicitlyBoundId,
      replaceable.id
    );
    await exerciseApi.createExercise({ name: "Continuing Template Lift" });
    const continuingProgram = await createActiveBundledProgram(
      "Continuing Template Lift"
    );
    const before = snapshotProgram(program.id);

    await expect(
      templateUnitSync.syncBundledTemplateProgramsToUnit("lb")
    ).resolves.toEqual([continuingProgram.id]);

    expect(snapshotProgram(program.id)).toEqual(before);
    expect(
      mockDatabase.rows<{ units: string }>(
        "SELECT units FROM psl_programs WHERE id = ?",
        continuingProgram.id
      )
    ).toEqual([{ units: "lb" }]);
    expect(
      mockDatabase.rows<Record<string, unknown>>(
        "SELECT id, exercise_id FROM workout_exercises WHERE id = ?",
        history.workoutExerciseId
      )
    ).toEqual([{ id: history.workoutExerciseId, exercise_id: explicitlyBoundId }]);
    expect(
      mockDatabase.rows<Record<string, unknown>>(
        "SELECT id, exercise_id, workout_exercise_id FROM sets WHERE id = ?",
        history.setId
      )
    ).toEqual([
      {
        id: history.setId,
        exercise_id: explicitlyBoundId,
        workout_exercise_id: history.workoutExerciseId,
      },
    ]);
  });

  it("skips a unique-name program whose persisted explicit binding conflicts with the replacement", async () => {
    await exerciseApi.createExercise({ name: "Unique Template Lift" });
    const conflictingId = await exerciseApi.createExercise({
      name: "Different Explicit Lift",
    });
    const program = await createActiveBundledProgram("Unique Template Lift");
    const [replaceable] = calendarExerciseRows(program.id);
    mockDatabase.run(
      "UPDATE program_calendar_exercises SET exercise_id = ? WHERE id = ?",
      conflictingId,
      replaceable.id
    );
    const before = snapshotProgram(program.id);

    await expect(
      templateUnitSync.syncBundledTemplateProgramsToUnit("lb")
    ).resolves.toEqual([]);

    expect(snapshotProgram(program.id)).toEqual(before);
  });

  it("converts an ordinary unique program while preserving its linked logged occurrence", async () => {
    const exerciseId = await exerciseApi.createExercise({
      name: "Ordinary Template Lift",
    });
    const program = await createActiveBundledProgram("Ordinary Template Lift");
    const [preserved] = calendarExerciseRows(program.id);
    const history = linkLoggedHistory({
      calendarExerciseId: preserved.id,
      calendarId: preserved.calendar_id,
      exerciseId,
    });

    await expect(
      templateUnitSync.syncBundledTemplateProgramsToUnit("lb")
    ).resolves.toEqual([program.id]);

    const [updatedProgram] = mockDatabase.rows<{
      psl_source: string;
      units: string;
    }>("SELECT psl_source, units FROM psl_programs WHERE id = ?", program.id);
    expect(updatedProgram.units).toBe("lb");
    expect(updatedProgram.psl_source).toContain("units: lb");

    const [preservedAfter] = calendarExerciseRows(program.id).filter(
      (row) => row.id === preserved.id
    );
    expect(preservedAfter).toEqual(
      expect.objectContaining({
        id: preserved.id,
        exercise_id: exerciseId,
        workout_exercise_id: history.workoutExerciseId,
      })
    );
    const [linkedSet] = mockDatabase.rows<{
      id: number;
      exercise_id: number;
      workout_exercise_id: number;
    }>("SELECT id, exercise_id, workout_exercise_id FROM sets WHERE id = ?", history.setId);
    expect(linkedSet).toEqual({
      id: history.setId,
      exercise_id: exerciseId,
      workout_exercise_id: history.workoutExerciseId,
    });
    expect(
      calendarExerciseRows(program.id).every(
        (row) => row.exercise_id === exerciseId
      )
    ).toBe(true);

    const [preservedSet] = mockDatabase.rows<{
      prescribed_intensity_json: string;
      set_id: number;
    }>(
      `SELECT prescribed_intensity_json, set_id
         FROM program_calendar_sets
        WHERE id = ?`,
      history.calendarSetId
    );
    expect(JSON.parse(preservedSet.prescribed_intensity_json)).toEqual(
      expect.objectContaining({ unit: "lb" })
    );
    expect(preservedSet.set_id).toBe(history.setId);
  });
});
