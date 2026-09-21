import { createManualLoggingDatabase } from "./manualLoggingDatabase";

/**
 * Real SQLite test boundary with the approved target exercises shape: display
 * names may repeat while UID remains the durable external identity.
 */
export function createExerciseIdentityDatabase() {
  const database = createManualLoggingDatabase();

  database.expoDatabase.execSync(`
    CREATE TABLE exercises (
      id INTEGER PRIMARY KEY NOT NULL,
      uid TEXT,
      name TEXT NOT NULL,
      parent_exercise_id INTEGER,
      variation_label TEXT,
      description TEXT,
      muscle_group TEXT,
      equipment TEXT,
      is_bodyweight INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      last_rest_seconds INTEGER,
      is_pinned INTEGER NOT NULL DEFAULT 0
    );
  `);

  return {
    ...database,
    run(sql: string, ...params: unknown[]) {
      const statement = database.expoDatabase.prepareSync(sql);
      try {
        return statement.executeSync(params);
      } finally {
        statement.finalizeSync();
      }
    },
    reset() {
      database.expoDatabase.execSync(`
        DELETE FROM program_calendar_sets;
        DELETE FROM program_calendar_exercises;
        DELETE FROM program_calendar;
        DELETE FROM psl_programs;
        DELETE FROM media;
        DELETE FROM pr_events;
        DELETE FROM sets;
        DELETE FROM workout_exercises;
        DELETE FROM workouts;
        DELETE FROM exercise_formula_overrides;
        DELETE FROM exercises;
      `);
    },
  };
}
