import { createExerciseIdentityDatabase } from "../helpers/exerciseIdentityDatabase";

const mockDatabase = createExerciseIdentityDatabase();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

const exerciseApi = require("../../lib/db/exercises") as typeof import("../../lib/db/exercises");
const programRuntime = require("../../lib/programs/psl/programRuntime") as typeof import("../../lib/programs/psl/programRuntime");

const FUTURE_DATE_ISO = "2099-09-21";

function insertProgram(params: {
  exerciseName: string;
  percentIntensityConfigJson?: string | null;
  active?: boolean;
}): number {
  const source = `
language_version: "0.1"
metadata:
  id: identity-test
  name: Identity Test
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - exercise: ${JSON.stringify(params.exerciseName)}
        sets:
          - count: 3
            reps: 5
`;
  return mockDatabase.run(
    `INSERT INTO psl_programs
       (name, psl_source, percent_intensity_config_json, is_active, start_date,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1)`,
    "Identity program",
    source,
    params.percentIntensityConfigJson ?? null,
    params.active ? 1 : 0,
    params.active ? FUTURE_DATE_ISO : null
  ).lastInsertRowId;
}

function insertCalendarExercise(params: {
  programId: number;
  exerciseName: string;
  exerciseId: number | null;
  workoutExerciseId?: number | null;
  pslSessionId?: string;
  sequence?: number;
}): number {
  const calendarId = mockDatabase.run(
    `INSERT INTO program_calendar
       (program_id, psl_session_id, session_name, date_iso, sequence, status)
     VALUES (?, ?, 'Day 1', ?, ?, 'pending')`,
    params.programId,
    params.pslSessionId ?? "day-1",
    FUTURE_DATE_ISO,
    params.sequence ?? 1
  ).lastInsertRowId;
  return mockDatabase.run(
    `INSERT INTO program_calendar_exercises
       (calendar_id, exercise_name, exercise_id, order_index, prescribed_sets_json, status,
        workout_exercise_id)
     VALUES (?, ?, ?, 0, '[]', 'pending', ?)`,
    calendarId,
    params.exerciseName,
    params.exerciseId,
    params.workoutExerciseId ?? null
  ).lastInsertRowId;
}

function configEntry(params: {
  key: string;
  exerciseName: string;
  sourceExerciseId: number | null;
  sourceExerciseName: string | null;
}) {
  return {
    ...params,
    mode: "history_e1rm",
    baselineKg: 100,
  };
}

describe("exercise identity with non-unique display names", () => {
  beforeEach(() => mockDatabase.reset());
  afterAll(() => mockDatabase.close());

  it("creates, renames, lists, pins, and deletes duplicate base exercises by ID and UID", async () => {
    const firstId = await exerciseApi.createExercise({ name: "Shared Press" });
    const secondId = await exerciseApi.createExercise({ name: "Temporary Press" });
    await exerciseApi.updateExercise(secondId, { name: "Shared Press" });

    const rows = mockDatabase.rows<{ id: number; uid: string; name: string; is_pinned: number }>(
      "SELECT id, uid, name, is_pinned FROM exercises ORDER BY id"
    );
    expect(rows.map((row) => row.id)).toEqual([firstId, secondId]);
    expect(new Set(rows.map((row) => row.uid)).size).toBe(2);
    expect(rows.map((row) => row.name)).toEqual(["Shared Press", "Shared Press"]);

    expect(await exerciseApi.togglePinExercise(secondId)).toBe(true);
    expect(mockDatabase.rows<{ id: number }>(
      "SELECT id FROM exercises WHERE is_pinned = 1"
    )).toEqual([{ id: secondId }]);

    await exerciseApi.deleteExercise(secondId);
    expect(mockDatabase.rows<{ id: number; uid: string }>(
      "SELECT id, uid FROM exercises"
    )).toEqual([{ id: firstId, uid: rows[0].uid }]);
  });

  it("resolves name compatibility helpers to one lowest-ID row per exact trimmed name", async () => {
    const firstSharedId = await exerciseApi.createExercise({ name: "Shared Row" });
    await exerciseApi.createExercise({ name: "Shared Row" });
    const curlId = await exerciseApi.createExercise({ name: "Curl" });

    expect((await exerciseApi.getExerciseByName("Shared Row"))?.id).toBe(firstSharedId);
    expect(await exerciseApi.getExerciseByName(" Shared Row ")).toBeNull();
    expect(
      (await exerciseApi.listExercisesByNames([
        " Shared Row ",
        "Curl",
        "Shared Row",
        "",
      ])).map((exercise) => [exercise.name, exercise.id])
    ).toEqual([
      ["Curl", curlId],
      ["Shared Row", firstSharedId],
    ]);
    expect((await exerciseApi.listExercises()).filter((row) => row.name === "Shared Row")).toHaveLength(2);
  });

  it("allows the same constructed variation display name in separate families", async () => {
    const firstParentId = await exerciseApi.createExercise({ name: "Family Press" });
    const secondParentId = await exerciseApi.createExercise({ name: "Family Press" });

    const firstVariationId = await exerciseApi.createExerciseVariation(firstParentId, "Tempo");
    const secondVariationId = await exerciseApi.createExerciseVariation(secondParentId, "Tempo");

    await expect(
      exerciseApi.createExerciseVariation(firstParentId, " tempo ")
    ).rejects.toThrow("A variation with this label already exists for the selected exercise.");

    expect(firstVariationId).not.toBe(secondVariationId);
    expect(mockDatabase.rows<{ id: number; parent_exercise_id: number; variation_label: string }>(
      "SELECT id, parent_exercise_id, variation_label FROM exercises WHERE variation_label = 'Tempo' ORDER BY id"
    )).toEqual([
      { id: firstVariationId, parent_exercise_id: firstParentId, variation_label: "Tempo" },
      { id: secondVariationId, parent_exercise_id: secondParentId, variation_label: "Tempo" },
    ]);
  });

  it("renames only explicit references when the old variation name is ambiguous", async () => {
    const firstParentId = await exerciseApi.createExercise({ name: "Ambiguous Bench" });
    const secondParentId = await exerciseApi.createExercise({ name: "Ambiguous Bench" });
    const targetId = await exerciseApi.createExerciseVariation(firstParentId, "Tempo");
    const otherId = await exerciseApi.createExerciseVariation(secondParentId, "Tempo");
    const oldName = "Ambiguous Bench (Tempo)";
    const nextName = "Ambiguous Bench (Paused)";
    const config = JSON.stringify({
      version: 1,
      entries: [
        configEntry({ key: "target", exerciseName: oldName, sourceExerciseId: targetId, sourceExerciseName: oldName }),
        configEntry({ key: "other", exerciseName: oldName, sourceExerciseId: otherId, sourceExerciseName: oldName }),
        configEntry({ key: "legacy", exerciseName: oldName, sourceExerciseId: null, sourceExerciseName: oldName }),
      ],
    });
    const programId = insertProgram({
      exerciseName: oldName,
      percentIntensityConfigJson: config,
      active: true,
    });
    const targetCalendarId = insertCalendarExercise({ programId, exerciseName: oldName, exerciseId: targetId });
    const otherCalendarId = insertCalendarExercise({ programId, exerciseName: oldName, exerciseId: otherId });
    const legacyCalendarId = insertCalendarExercise({ programId, exerciseName: oldName, exerciseId: null });

    await exerciseApi.renameExerciseVariation(targetId, "Paused");

    expect(mockDatabase.rows<{ id: number; exercise_id: number | null; exercise_name: string }>(
      "SELECT id, exercise_id, exercise_name FROM program_calendar_exercises ORDER BY id"
    )).toEqual([
      { id: targetCalendarId, exercise_id: targetId, exercise_name: nextName },
      { id: otherCalendarId, exercise_id: otherId, exercise_name: oldName },
      { id: legacyCalendarId, exercise_id: null, exercise_name: oldName },
    ]);

    const [program] = mockDatabase.rows<{ psl_source: string; percent_intensity_config_json: string }>(
      "SELECT psl_source, percent_intensity_config_json FROM psl_programs WHERE id = ?",
      programId
    );
    expect(program.psl_source).toContain(`exercise: ${JSON.stringify(oldName)}`);
    const entries = JSON.parse(program.percent_intensity_config_json).entries;
    expect(entries[0]).toEqual(expect.objectContaining({
      exerciseName: oldName,
      sourceExerciseId: targetId,
      sourceExerciseName: nextName,
    }));
    expect(entries[1]).toEqual(expect.objectContaining({
      exerciseName: oldName,
      sourceExerciseId: otherId,
      sourceExerciseName: oldName,
    }));
    expect(entries[2]).toEqual(expect.objectContaining({
      exerciseName: oldName,
      sourceExerciseId: null,
      sourceExerciseName: oldName,
    }));
  });

  it("does not rematerialize an ambiguous program that only has a name-only calendar row", async () => {
    const firstParentId = await exerciseApi.createExercise({ name: "Name Only Bench" });
    const secondParentId = await exerciseApi.createExercise({ name: "Name Only Bench" });
    const targetId = await exerciseApi.createExerciseVariation(firstParentId, "Tempo");
    await exerciseApi.createExerciseVariation(secondParentId, "Tempo");
    const oldName = "Name Only Bench (Tempo)";
    const programId = insertProgram({ exerciseName: oldName, active: true });
    const calendarExerciseId = insertCalendarExercise({
      programId,
      exerciseName: oldName,
      exerciseId: null,
    });

    await exerciseApi.renameExerciseVariation(targetId, "Paused");

    expect(mockDatabase.rows<{ id: number; exercise_id: null; exercise_name: string }>(
      "SELECT id, exercise_id, exercise_name FROM program_calendar_exercises"
    )).toEqual([
      { id: calendarExerciseId, exercise_id: null, exercise_name: oldName },
    ]);
    expect(mockDatabase.rows<{ count: number }>(
      "SELECT COUNT(*) AS count FROM program_calendar_sets"
    )).toEqual([{ count: 0 }]);
  });

  it("retains name-only fallback and rematerializes an ordinary unique-name program", async () => {
    const parentId = await exerciseApi.createExercise({ name: "Unique Squat" });
    const variationId = await exerciseApi.createExerciseVariation(parentId, "Tempo");
    const oldName = "Unique Squat (Tempo)";
    const nextName = "Unique Squat (Paused)";
    const config = JSON.stringify({
      version: 1,
      entries: [
        configEntry({ key: oldName, exerciseName: oldName, sourceExerciseId: null, sourceExerciseName: oldName }),
      ],
    });
    const programId = insertProgram({
      exerciseName: oldName,
      percentIntensityConfigJson: config,
      active: true,
    });
    const explicitCalendarId = insertCalendarExercise({ programId, exerciseName: oldName, exerciseId: variationId });

    await exerciseApi.renameExerciseVariation(variationId, "Paused");

    expect(mockDatabase.rows<{ exercise_id: number | null; exercise_name: string }>(
      "SELECT exercise_id, exercise_name FROM program_calendar_exercises ORDER BY id"
    )).toEqual([
      { exercise_id: variationId, exercise_name: nextName },
    ]);
    expect(explicitCalendarId).toBeGreaterThan(0);
    expect(mockDatabase.rows<{ count: number }>(
      "SELECT COUNT(*) AS count FROM program_calendar_sets"
    )).toEqual([{ count: 3 }]);
    const [program] = mockDatabase.rows<{ psl_source: string; percent_intensity_config_json: string }>(
      "SELECT psl_source, percent_intensity_config_json FROM psl_programs WHERE id = ?",
      programId
    );
    expect(program.psl_source).toContain(`exercise: ${JSON.stringify(nextName)}`);
    expect(JSON.parse(program.percent_intensity_config_json).entries[0]).toEqual(expect.objectContaining({
      key: nextName,
      exerciseName: nextName,
      sourceExerciseId: null,
      sourceExerciseName: nextName,
    }));
  });

  it("blocks a direct refresh before any write when a duplicate name would reassign an explicit ID", async () => {
    await exerciseApi.createExercise({ name: "Runtime Duplicate" });
    const explicitlyBoundId = await exerciseApi.createExercise({ name: "Runtime Duplicate" });
    const programId = insertProgram({ exerciseName: "Runtime Duplicate", active: true });
    insertCalendarExercise({
      programId,
      exerciseName: "Runtime Duplicate",
      exerciseId: explicitlyBoundId,
    });
    const before = {
      calendars: mockDatabase.rows<Record<string, unknown>>(
        "SELECT * FROM program_calendar ORDER BY id"
      ),
      exercises: mockDatabase.rows<Record<string, unknown>>(
        "SELECT * FROM program_calendar_exercises ORDER BY id"
      ),
      sets: mockDatabase.rows<Record<string, unknown>>(
        "SELECT * FROM program_calendar_sets ORDER BY id"
      ),
    };

    await programRuntime.refreshUpcomingCalendarForProgram(programId);

    expect({
      calendars: mockDatabase.rows<Record<string, unknown>>(
        "SELECT * FROM program_calendar ORDER BY id"
      ),
      exercises: mockDatabase.rows<Record<string, unknown>>(
        "SELECT * FROM program_calendar_exercises ORDER BY id"
      ),
      sets: mockDatabase.rows<Record<string, unknown>>(
        "SELECT * FROM program_calendar_sets ORDER BY id"
      ),
    }).toEqual(before);
  });

  it("blocks a direct refresh when an explicit binding has no replacement occurrence", async () => {
    const exerciseId = await exerciseApi.createExercise({ name: "Missing Occurrence Press" });
    const programId = insertProgram({ exerciseName: "Missing Occurrence Press", active: true });
    const calendarExerciseId = insertCalendarExercise({
      programId,
      exerciseName: "Missing Occurrence Press",
      exerciseId,
      pslSessionId: "removed-session",
    });

    await programRuntime.refreshUpcomingCalendarForProgram(programId);

    expect(mockDatabase.rows<{ id: number; exercise_id: number; exercise_name: string }>(
      "SELECT id, exercise_id, exercise_name FROM program_calendar_exercises"
    )).toEqual([
      {
        id: calendarExerciseId,
        exercise_id: exerciseId,
        exercise_name: "Missing Occurrence Press",
      },
    ]);
    expect(mockDatabase.rows<{ count: number }>(
      "SELECT COUNT(*) AS count FROM program_calendar_sets"
    )).toEqual([{ count: 0 }]);
  });

  it("preserves a conflicting explicit binding elsewhere in a unique-name program", async () => {
    const parentId = await exerciseApi.createExercise({ name: "Unique Conflict Parent" });
    const targetId = await exerciseApi.createExerciseVariation(parentId, "Tempo");
    const otherId = await exerciseApi.createExercise({ name: "Different Catalog Exercise" });
    const oldName = "Unique Conflict Parent (Tempo)";
    const nextName = "Unique Conflict Parent (Paused)";
    const programId = insertProgram({ exerciseName: oldName, active: true });
    const targetCalendarId = insertCalendarExercise({
      programId,
      exerciseName: oldName,
      exerciseId: targetId,
    });
    const conflictingCalendarId = insertCalendarExercise({
      programId,
      exerciseName: oldName,
      exerciseId: otherId,
    });

    await exerciseApi.renameExerciseVariation(targetId, "Paused");

    expect(mockDatabase.rows<{ id: number; exercise_id: number; exercise_name: string }>(
      "SELECT id, exercise_id, exercise_name FROM program_calendar_exercises ORDER BY id"
    )).toEqual([
      { id: targetCalendarId, exercise_id: targetId, exercise_name: nextName },
      { id: conflictingCalendarId, exercise_id: otherId, exercise_name: oldName },
    ]);
    expect(mockDatabase.rows<{ count: number }>(
      "SELECT COUNT(*) AS count FROM program_calendar_sets"
    )).toEqual([{ count: 0 }]);
  });

  it.each(["keep_data", "delete_data"] as const)(
    "deletes an ambiguous-name variation in %s mode without rematerializing another identity",
    async (mode) => {
    const firstParentId = await exerciseApi.createExercise({ name: "Duplicate Pull" });
    const secondParentId = await exerciseApi.createExercise({ name: "Duplicate Pull" });
    const targetId = await exerciseApi.createExerciseVariation(firstParentId, "Wide");
    const otherId = await exerciseApi.createExerciseVariation(secondParentId, "Wide");
    const oldName = "Duplicate Pull (Wide)";
    const config = JSON.stringify({
      version: 1,
      entries: [
        configEntry({ key: "target", exerciseName: oldName, sourceExerciseId: targetId, sourceExerciseName: oldName }),
        configEntry({ key: "other", exerciseName: oldName, sourceExerciseId: otherId, sourceExerciseName: oldName }),
        configEntry({ key: "legacy", exerciseName: oldName, sourceExerciseId: null, sourceExerciseName: oldName }),
      ],
    });
    const programId = insertProgram({
      exerciseName: oldName,
      percentIntensityConfigJson: config,
      active: true,
    });
    const targetCalendarId = insertCalendarExercise({ programId, exerciseName: oldName, exerciseId: targetId });
    const otherCalendarId = insertCalendarExercise({ programId, exerciseName: oldName, exerciseId: otherId });
    const legacyCalendarId = insertCalendarExercise({ programId, exerciseName: oldName, exerciseId: null });
    const workoutId = mockDatabase.run(
      "INSERT INTO workouts (uid, started_at) VALUES ('variation-workout', 1)"
    ).lastInsertRowId;
    const targetWorkoutExerciseId = mockDatabase.run(
      "INSERT INTO workout_exercises (uid, workout_id, exercise_id) VALUES ('variation-target-we', ?, ?)",
      workoutId,
      targetId
    ).lastInsertRowId;
    mockDatabase.run(
      "INSERT INTO workout_exercises (uid, workout_id, exercise_id) VALUES ('variation-other-we', ?, ?)",
      workoutId,
      otherId
    );
    const targetSetId = mockDatabase.run(
      `INSERT INTO sets
         (uid, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, performed_at)
       VALUES ('variation-target-set', ?, ?, ?, 80, 8, 1)`,
      workoutId,
      targetId,
      targetWorkoutExerciseId
    ).lastInsertRowId;
    mockDatabase.run(
      "INSERT INTO sets (uid, workout_id, exercise_id, weight_kg, reps, performed_at) VALUES ('variation-other-set', ?, ?, 90, 8, 1)",
      workoutId,
      otherId
    );
    const linkedCalendarId = insertCalendarExercise({
      programId,
      exerciseName: oldName,
      exerciseId: targetId,
      workoutExerciseId: targetWorkoutExerciseId,
    });
    mockDatabase.run(
      `INSERT INTO program_calendar_sets
         (calendar_exercise_id, set_index, actual_weight, actual_reps, is_logged, set_id)
       VALUES (?, 1, 80, 8, 1, ?)`,
      linkedCalendarId,
      targetSetId
    );

    await exerciseApi.deleteExerciseVariation(targetId, mode);

    expect(mockDatabase.rows<{ id: number }>(
      "SELECT id FROM exercises WHERE id IN (?, ?) ORDER BY id",
      targetId,
      otherId
    )).toEqual([{ id: otherId }]);
    expect(mockDatabase.rows<{ exercise_id: number }>(
      "SELECT exercise_id FROM workout_exercises ORDER BY id"
    )).toEqual(
      mode === "keep_data"
        ? [{ exercise_id: firstParentId }, { exercise_id: otherId }]
        : [{ exercise_id: otherId }]
    );
    expect(mockDatabase.rows<{ exercise_id: number }>(
      "SELECT exercise_id FROM sets ORDER BY id"
    )).toEqual(
      mode === "keep_data"
        ? [{ exercise_id: firstParentId }, { exercise_id: otherId }]
        : [{ exercise_id: otherId }]
    );
    expect(mockDatabase.rows<{
      id: number;
      exercise_id: number | null;
      exercise_name: string;
      workout_exercise_id: number | null;
    }>(
      `SELECT id, exercise_id, exercise_name, workout_exercise_id
       FROM program_calendar_exercises ORDER BY id`
    )).toEqual([
      { id: targetCalendarId, exercise_id: firstParentId, exercise_name: "Duplicate Pull", workout_exercise_id: null },
      { id: otherCalendarId, exercise_id: otherId, exercise_name: oldName, workout_exercise_id: null },
      { id: legacyCalendarId, exercise_id: null, exercise_name: oldName, workout_exercise_id: null },
      {
        id: linkedCalendarId,
        exercise_id: firstParentId,
        exercise_name: "Duplicate Pull",
        workout_exercise_id: mode === "keep_data" ? targetWorkoutExerciseId : null,
      },
    ]);
    expect(mockDatabase.rows<{
      actual_weight: number | null;
      actual_reps: number | null;
      is_logged: number;
      set_id: number | null;
    }>(
      "SELECT actual_weight, actual_reps, is_logged, set_id FROM program_calendar_sets"
    )).toEqual([
      mode === "keep_data"
        ? { actual_weight: 80, actual_reps: 8, is_logged: 1, set_id: targetSetId }
        : { actual_weight: null, actual_reps: null, is_logged: 0, set_id: null },
    ]);
    const [program] = mockDatabase.rows<{ psl_source: string; percent_intensity_config_json: string }>(
      "SELECT psl_source, percent_intensity_config_json FROM psl_programs WHERE id = ?",
      programId
    );
    expect(program.psl_source).toContain(`exercise: ${JSON.stringify(oldName)}`);
    expect(JSON.parse(program.percent_intensity_config_json).entries).toEqual([
      expect.objectContaining({
        exerciseName: oldName,
        sourceExerciseId: firstParentId,
        sourceExerciseName: "Duplicate Pull",
      }),
      expect.objectContaining({
        exerciseName: oldName,
        sourceExerciseId: otherId,
        sourceExerciseName: oldName,
      }),
      expect.objectContaining({
        exerciseName: oldName,
        sourceExerciseId: null,
        sourceExerciseName: oldName,
      }),
    ]);
    }
  );

  it("deletes only the selected duplicate and clears its history, media, PB, and soft links", async () => {
    const targetId = await exerciseApi.createExercise({ name: "Duplicate Deadlift" });
    const otherId = await exerciseApi.createExercise({ name: "Duplicate Deadlift" });
    const programId = insertProgram({ exerciseName: "Unrelated Program Exercise" });
    const workoutId = mockDatabase.run(
      "INSERT INTO workouts (uid, started_at) VALUES ('workout-1', 1)"
    ).lastInsertRowId;
    const targetWorkoutExerciseId = mockDatabase.run(
      "INSERT INTO workout_exercises (uid, workout_id, exercise_id) VALUES ('we-target', ?, ?)",
      workoutId,
      targetId
    ).lastInsertRowId;
    const otherWorkoutExerciseId = mockDatabase.run(
      "INSERT INTO workout_exercises (uid, workout_id, exercise_id) VALUES ('we-other', ?, ?)",
      workoutId,
      otherId
    ).lastInsertRowId;
    const targetSetId = mockDatabase.run(
      `INSERT INTO sets
         (uid, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, performed_at)
       VALUES ('set-target', ?, ?, ?, 100, 5, 1)`,
      workoutId,
      targetId,
      targetWorkoutExerciseId
    ).lastInsertRowId;
    const otherSetId = mockDatabase.run(
      `INSERT INTO sets
         (uid, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, performed_at)
       VALUES ('set-other', ?, ?, ?, 120, 5, 1)`,
      workoutId,
      otherId,
      otherWorkoutExerciseId
    ).lastInsertRowId;
    mockDatabase.run(
      "INSERT INTO media (local_uri, set_id, workout_id) VALUES ('target.mp4', ?, ?)",
      targetSetId,
      workoutId
    );
    mockDatabase.run(
      "INSERT INTO media (local_uri, set_id, workout_id) VALUES ('other.mp4', ?, ?)",
      otherSetId,
      workoutId
    );
    mockDatabase.run(
      "INSERT INTO pr_events (uid, set_id, exercise_id, type, metric_value, occurred_at) VALUES ('pb-target', ?, ?, '5rm', 100, 1)",
      targetSetId,
      targetId
    );
    mockDatabase.run(
      "INSERT INTO pr_events (uid, set_id, exercise_id, type, metric_value, occurred_at) VALUES ('pb-other', ?, ?, '5rm', 120, 1)",
      otherSetId,
      otherId
    );
    const targetCalendarId = insertCalendarExercise({
      programId,
      exerciseName: "Duplicate Deadlift",
      exerciseId: targetId,
      workoutExerciseId: targetWorkoutExerciseId,
    });
    const otherCalendarId = insertCalendarExercise({
      programId,
      exerciseName: "Duplicate Deadlift",
      exerciseId: otherId,
      workoutExerciseId: otherWorkoutExerciseId,
    });
    mockDatabase.run(
      `INSERT INTO program_calendar_sets
         (calendar_exercise_id, set_index, actual_weight, actual_reps, is_logged, set_id)
       VALUES (?, 1, 100, 5, 1, ?)`,
      targetCalendarId,
      targetSetId
    );
    mockDatabase.run(
      `INSERT INTO program_calendar_sets
         (calendar_exercise_id, set_index, actual_weight, actual_reps, is_logged, set_id)
       VALUES (?, 1, 120, 5, 1, ?)`,
      otherCalendarId,
      otherSetId
    );

    await exerciseApi.deleteExercise(targetId);

    expect(mockDatabase.rows<{ id: number }>("SELECT id FROM exercises")).toEqual([{ id: otherId }]);
    expect(mockDatabase.rows<{ exercise_id: number }>("SELECT exercise_id FROM workout_exercises")).toEqual([{ exercise_id: otherId }]);
    expect(mockDatabase.rows<{ exercise_id: number }>("SELECT exercise_id FROM sets")).toEqual([{ exercise_id: otherId }]);
    expect(mockDatabase.rows<{ exercise_id: number }>("SELECT exercise_id FROM pr_events")).toEqual([{ exercise_id: otherId }]);
    expect(mockDatabase.rows<{ local_uri: string }>("SELECT local_uri FROM media ORDER BY local_uri")).toEqual([{ local_uri: "other.mp4" }]);
    expect(mockDatabase.rows<{ id: number; exercise_id: number | null; workout_exercise_id: number | null }>(
      "SELECT id, exercise_id, workout_exercise_id FROM program_calendar_exercises ORDER BY id"
    )).toEqual([
      { id: targetCalendarId, exercise_id: null, workout_exercise_id: null },
      { id: otherCalendarId, exercise_id: otherId, workout_exercise_id: otherWorkoutExerciseId },
    ]);
    expect(mockDatabase.rows<{
      calendar_exercise_id: number;
      actual_weight: number | null;
      actual_reps: number | null;
      is_logged: number;
      set_id: number | null;
    }>(
      `SELECT calendar_exercise_id, actual_weight, actual_reps, is_logged, set_id
       FROM program_calendar_sets ORDER BY calendar_exercise_id`
    )).toEqual([
      { calendar_exercise_id: targetCalendarId, actual_weight: null, actual_reps: null, is_logged: 0, set_id: null },
      { calendar_exercise_id: otherCalendarId, actual_weight: 120, actual_reps: 5, is_logged: 1, set_id: otherSetId },
    ]);
  });
});
