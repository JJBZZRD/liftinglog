import {
  createManualLoggingDatabase,
  initializeTestDatabaseBindings,
} from "../helpers/manualLoggingDatabase";
import {
  derivePBEventsForExercise,
  type DerivedPBEvent,
  type PBSourceSet,
} from "../../lib/db/pbDerivation";

const mockDatabase = createManualLoggingDatabase();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
}));

initializeTestDatabaseBindings(mockDatabase);

const pbEvents = require("../../lib/db/pbEvents") as typeof import("../../lib/db/pbEvents");

function orderedSets(exerciseId: number): PBSourceSet[] {
  return mockDatabase.rows<PBSourceSet>(
    `SELECT id, weight_kg AS weightKg, reps, performed_at AS performedAt
     FROM sets
     WHERE exercise_id = ?
     ORDER BY performed_at, id`,
    exerciseId
  );
}

function storedEvents(exerciseId: number): DerivedPBEvent[] {
  return mockDatabase.rows<DerivedPBEvent>(
    `SELECT set_id AS setId,
            exercise_id AS exerciseId,
            type,
            metric_value AS metricValue,
            occurred_at AS occurredAt
     FROM pr_events
     WHERE exercise_id = ?
     ORDER BY occurred_at, id`,
    exerciseId
  );
}

async function expectProductionParity(exerciseId: number): Promise<void> {
  const expected = derivePBEventsForExercise(exerciseId, orderedSets(exerciseId));
  await pbEvents.rebuildPBEventsForExercise(exerciseId);
  expect(storedEvents(exerciseId)).toEqual(expected);
}

describe("derivePBEventsForExercise", () => {
  afterAll(() => {
    mockDatabase.close();
  });

  it("preserves the existing validity and strict per-rep progression rules", () => {
    const orderedSets: readonly PBSourceSet[] = Object.freeze([
      Object.freeze({ id: 1, weightKg: null, reps: 5, performedAt: -3 }),
      Object.freeze({ id: 2, weightKg: 80, reps: null, performedAt: -2 }),
      Object.freeze({ id: 3, weightKg: 80, reps: 5, performedAt: null }),
      Object.freeze({ id: 4, weightKg: 0, reps: 5, performedAt: -1 }),
      Object.freeze({ id: 5, weightKg: -1, reps: 5, performedAt: -1 }),
      Object.freeze({ id: 6, weightKg: 80, reps: 0, performedAt: -1 }),
      Object.freeze({ id: 7, weightKg: 80, reps: -1, performedAt: -1 }),
      Object.freeze({ id: 8, weightKg: 100, reps: 5, performedAt: -1 }),
      Object.freeze({ id: 9, weightKg: 100, reps: 5, performedAt: 0 }),
      Object.freeze({ id: 10, weightKg: 105, reps: 5, performedAt: 0 }),
      Object.freeze({ id: 11, weightKg: 90, reps: 8, performedAt: 0 }),
      Object.freeze({ id: 12, weightKg: 110, reps: 5, performedAt: 0 }),
      Object.freeze({ id: 13, weightKg: 70, reps: 2.5, performedAt: 1 }),
      Object.freeze({ id: 14, weightKg: Number.POSITIVE_INFINITY, reps: 2.5, performedAt: 2 }),
      Object.freeze({ id: 15, weightKg: 10, reps: Number.POSITIVE_INFINITY, performedAt: 3 }),
    ]);

    expect(derivePBEventsForExercise(42, orderedSets)).toEqual([
      { setId: 8, exerciseId: 42, type: "5rm", metricValue: 100, occurredAt: -1 },
      { setId: 10, exerciseId: 42, type: "5rm", metricValue: 105, occurredAt: 0 },
      { setId: 11, exerciseId: 42, type: "8rm", metricValue: 90, occurredAt: 0 },
      { setId: 12, exerciseId: 42, type: "5rm", metricValue: 110, occurredAt: 0 },
      { setId: 13, exerciseId: 42, type: "2.5rm", metricValue: 70, occurredAt: 1 },
      {
        setId: 14,
        exerciseId: 42,
        type: "2.5rm",
        metricValue: Number.POSITIVE_INFINITY,
        occurredAt: 2,
      },
      {
        setId: 15,
        exerciseId: 42,
        type: "Infinityrm",
        metricValue: 10,
        occurredAt: 3,
      },
    ]);
  });

  it("imports without loading the database connection", () => {
    jest.isolateModules(() => {
      jest.doMock("../../lib/db/connection", () => {
        throw new Error("pure PB derivation loaded the database connection");
      });

      expect(() => require("../../lib/db/pbDerivation")).not.toThrow();
    });
    jest.dontMock("../../lib/db/connection");
  });

  it("matches the production rebuild for open-entry sets after historical edits and deletes", async () => {
    const exerciseId = mockDatabase.insertExercise("PB Derivation Parity");
    const workoutId = 7001;
    const workoutExerciseId = 8001;

    mockDatabase.expoDatabase.execSync(`
      INSERT INTO workouts (id, uid, started_at) VALUES (${workoutId}, 'pb-workout', 0);
      INSERT INTO workout_exercises (
        id, uid, workout_id, exercise_id, performed_at, completed_at
      ) VALUES (
        ${workoutExerciseId}, 'pb-open-entry', ${workoutId}, ${exerciseId}, 0, NULL
      );
      INSERT INTO sets (
        id, uid, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, performed_at
      ) VALUES
        (9001, 'pb-null-weight', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, NULL, 5, -2),
        (9002, 'pb-null-reps', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 90, NULL, -2),
        (9003, 'pb-null-time', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 90, 5, NULL),
        (9004, 'pb-zero-weight', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 0, 5, -1),
        (9005, 'pb-negative-weight', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, -1, 5, -1),
        (9006, 'pb-zero-reps', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 90, 0, -1),
        (9007, 'pb-negative-reps', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 90, -1, -1),
        (9008, 'pb-first-five', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 100, 5, 0),
        (9009, 'pb-equal-five', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 100, 5, 0),
        (9010, 'pb-better-five', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 110, 5, 0),
        (9011, 'pb-eight', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 90, 8, 0),
        (9012, 'pb-fractional', ${workoutId}, ${exerciseId}, ${workoutExerciseId}, 70, 2.5, 1);
    `);

    await expectProductionParity(exerciseId);
    expect(storedEvents(exerciseId)).toEqual([
      { setId: 9008, exerciseId, type: "5rm", metricValue: 100, occurredAt: 0 },
      { setId: 9010, exerciseId, type: "5rm", metricValue: 110, occurredAt: 0 },
      { setId: 9011, exerciseId, type: "8rm", metricValue: 90, occurredAt: 0 },
      { setId: 9012, exerciseId, type: "2.5rm", metricValue: 70, occurredAt: 1 },
    ]);

    mockDatabase.expoDatabase.execSync("UPDATE sets SET weight_kg = 95 WHERE id = 9010;");
    await expectProductionParity(exerciseId);
    expect(storedEvents(exerciseId).map((event) => event.setId)).toEqual([9008, 9011, 9012]);

    mockDatabase.expoDatabase.execSync("DELETE FROM sets WHERE id = 9008;");
    await expectProductionParity(exerciseId);
    expect(storedEvents(exerciseId).map((event) => event.setId)).toEqual([
      9009,
      9011,
      9012,
    ]);
  });
});
