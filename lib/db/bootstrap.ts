import type { SQLiteDatabase } from "expo-sqlite";

const SCHEMA_BOOTSTRAP_SQL = `
  -- Core tables
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY NOT NULL,
    e1rm_formula TEXT NOT NULL DEFAULT 'epley',
    unit_preference TEXT NOT NULL DEFAULT 'kg',
    theme_preference TEXT NOT NULL DEFAULT 'system',
    color_theme TEXT NOT NULL DEFAULT 'default'
  );

  CREATE TABLE IF NOT EXISTS user_checkins (
    id INTEGER PRIMARY KEY NOT NULL,
    uid TEXT,
    recorded_at INTEGER NOT NULL,
    context TEXT,
    bodyweight_kg REAL,
    waist_cm REAL,
    sleep_start_at INTEGER,
    sleep_end_at INTEGER,
    sleep_hours REAL,
    resting_hr_bpm INTEGER,
    readiness_score INTEGER,
    soreness_score INTEGER,
    stress_score INTEGER,
    steps INTEGER,
    note TEXT,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY NOT NULL,
    uid TEXT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    muscle_group TEXT,
    equipment TEXT,
    is_bodyweight INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER,
    last_rest_seconds INTEGER,
    is_pinned INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY NOT NULL,
    uid TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS workout_exercises (
    id INTEGER PRIMARY KEY NOT NULL,
    uid TEXT,
    workout_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    order_index INTEGER,
    note TEXT,
    current_weight REAL,
    current_reps INTEGER,
    completed_at INTEGER,
    performed_at INTEGER,
    FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY NOT NULL,
    uid TEXT,
    workout_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    workout_exercise_id INTEGER,
    set_group_id TEXT,
    set_index INTEGER,
    weight_kg REAL,
    reps INTEGER,
    rpe REAL,
    rir REAL,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    superset_group_id TEXT,
    performed_at INTEGER,
    FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT,
    FOREIGN KEY(workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE SET NULL
  );

  -- PSL Programs
  CREATE TABLE IF NOT EXISTS psl_programs (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    psl_source TEXT NOT NULL,
    compiled_hash TEXT,
    percent_intensity_config_json TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    units TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS program_calendar (
    id INTEGER PRIMARY KEY NOT NULL,
    program_id INTEGER NOT NULL,
    psl_session_id TEXT NOT NULL,
    session_name TEXT NOT NULL,
    date_iso TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at INTEGER,
    completion_override_exercise_ids_json TEXT,
    FOREIGN KEY(program_id) REFERENCES psl_programs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS program_calendar_exercises (
    id INTEGER PRIMARY KEY NOT NULL,
    calendar_id INTEGER NOT NULL,
    exercise_name TEXT NOT NULL,
    exercise_id INTEGER,
    order_index INTEGER NOT NULL,
    prescribed_sets_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    workout_exercise_id INTEGER,
    FOREIGN KEY(calendar_id) REFERENCES program_calendar(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS program_calendar_sets (
    id INTEGER PRIMARY KEY NOT NULL,
    calendar_exercise_id INTEGER NOT NULL,
    set_index INTEGER NOT NULL,
    prescribed_reps TEXT,
    prescribed_intensity_json TEXT,
    prescribed_role TEXT,
    actual_weight REAL,
    actual_reps INTEGER,
    actual_rpe REAL,
    is_user_added INTEGER NOT NULL DEFAULT 0,
    is_logged INTEGER NOT NULL DEFAULT 0,
    set_id INTEGER,
    logged_at INTEGER,
    FOREIGN KEY(calendar_exercise_id) REFERENCES program_calendar_exercises(id) ON DELETE CASCADE,
    FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE SET NULL
  );

  -- Analytics
  CREATE TABLE IF NOT EXISTS pr_events (
    id INTEGER PRIMARY KEY NOT NULL,
    uid TEXT,
    set_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    metric_value REAL NOT NULL,
    occurred_at INTEGER NOT NULL,
    FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
  );

  -- Reserved for future optimization if needed:
  -- CREATE TABLE IF NOT EXISTS best_lifts (
  --   exercise_id INTEGER PRIMARY KEY NOT NULL,
  --   best_1rm_kg REAL,
  --   best_volume_in_session_kg REAL,
  --   best_reps INTEGER,
  --   updated_at INTEGER,
  --   FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  -- );

  -- Tags & media (optional)
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS taggings (
    id INTEGER PRIMARY KEY NOT NULL,
    tag_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY NOT NULL,
    local_uri TEXT NOT NULL,
    asset_id TEXT,
    mime TEXT,
    set_id INTEGER,
    workout_id INTEGER,
    note TEXT,
    created_at INTEGER,
    original_filename TEXT,
    media_created_at INTEGER,
    duration_ms INTEGER,
    album_name TEXT,
    FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE CASCADE,
    FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE
  );

  -- Per-exercise formula overrides
  CREATE TABLE IF NOT EXISTS exercise_formula_overrides (
    exercise_id INTEGER PRIMARY KEY NOT NULL,
    e1rm_formula TEXT NOT NULL,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_sets_workout_id ON sets(workout_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise_id ON sets(exercise_id);
  CREATE INDEX IF NOT EXISTS idx_sets_performed_at ON sets(performed_at);
  CREATE INDEX IF NOT EXISTS idx_sets_group ON sets(set_group_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise_reps ON sets(exercise_id, reps);
  CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise_id ON sets(workout_exercise_id);
  CREATE INDEX IF NOT EXISTS idx_user_checkins_recorded_at ON user_checkins(recorded_at);
  CREATE INDEX IF NOT EXISTS idx_workout_exercises_order ON workout_exercises(workout_id, order_index);
  CREATE INDEX IF NOT EXISTS idx_pr_events_exercise_time ON pr_events(exercise_id, occurred_at);
  CREATE INDEX IF NOT EXISTS idx_program_calendar_date ON program_calendar(date_iso);
  CREATE INDEX IF NOT EXISTS idx_program_calendar_program ON program_calendar(program_id);
  CREATE INDEX IF NOT EXISTS idx_program_calendar_exercises_cal ON program_calendar_exercises(calendar_id);
  CREATE INDEX IF NOT EXISTS idx_program_calendar_sets_exercise ON program_calendar_sets(calendar_exercise_id);
`;

const LEGACY_PROGRAM_TABLES = [
  "planned_workouts",
  "progressions",
  "program_exercises",
  "program_days",
  "programs",
] as const;

const UID_TABLES = [
  "user_checkins",
  "exercises",
  "workouts",
  "workout_exercises",
  "sets",
  "pr_events",
] as const;

export function initializeDatabase(sqlite: SQLiteDatabase): void {
  sqlite.execSync(SCHEMA_BOOTSTRAP_SQL);

  runColumnMigrations(sqlite);
  dropLegacyProgramTables(sqlite);
  ensureUidColumns(sqlite);
  backfillUids(sqlite);
  createIndexes(sqlite);
  logWorkoutExerciseColumnStatus(sqlite);
  repairProgramLinkedWorkoutExercises(sqlite);
}

function runColumnMigrations(sqlite: SQLiteDatabase): void {
  addColumnIfMissing(sqlite, "exercises", "last_rest_seconds INTEGER");
  addColumnIfMissing(sqlite, "workout_exercises", "current_weight REAL");
  addColumnIfMissing(sqlite, "workout_exercises", "current_reps INTEGER");
  addColumnIfMissing(sqlite, "exercises", "is_pinned INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "settings", "theme_preference TEXT NOT NULL DEFAULT 'system'");
  addColumnIfMissing(sqlite, "settings", "color_theme TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(sqlite, "workout_exercises", "completed_at INTEGER");
  addColumnIfMissing(sqlite, "workout_exercises", "performed_at INTEGER");
  addColumnIfMissing(sqlite, "program_calendar_exercises", "workout_exercise_id INTEGER");
  addColumnIfMissing(sqlite, "program_calendar_sets", "set_id INTEGER");
  addColumnIfMissing(sqlite, "program_calendar", "completion_override_exercise_ids_json TEXT");
  addColumnIfMissing(sqlite, "psl_programs", "percent_intensity_config_json TEXT");
  addColumnIfMissing(sqlite, "media", "asset_id TEXT");
  addColumnIfMissing(sqlite, "media", "original_filename TEXT");
  addColumnIfMissing(sqlite, "media", "media_created_at INTEGER");
  addColumnIfMissing(sqlite, "media", "duration_ms INTEGER");
  addColumnIfMissing(sqlite, "media", "album_name TEXT");
  addColumnIfMissing(sqlite, "user_checkins", "sleep_start_at INTEGER");
  addColumnIfMissing(sqlite, "user_checkins", "sleep_end_at INTEGER");
}

function addColumnIfMissing(
  sqlite: SQLiteDatabase,
  table: string,
  columnDefinition: string
): void {
  try {
    sqlite.execSync(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition};`);
  } catch {
    // Column already exists, ignore.
  }
}

function dropLegacyProgramTables(sqlite: SQLiteDatabase): void {
  for (const table of LEGACY_PROGRAM_TABLES) {
    try {
      sqlite.execSync(`DROP TABLE IF EXISTS ${table};`);
    } catch {
      // Table may not exist, ignore.
    }
  }
}

function ensureUidColumns(sqlite: SQLiteDatabase): void {
  for (const table of UID_TABLES) {
    addColumnIfMissing(sqlite, table, "uid TEXT");
  }
}

function backfillUids(sqlite: SQLiteDatabase): void {
  const batchSize = 300;

  for (const table of UID_TABLES) {
    try {
      const countStmt = sqlite.prepareSync(`SELECT COUNT(*) as cnt FROM ${table} WHERE uid IS NULL;`);
      let totalNull = 0;
      try {
        const result = countStmt.executeSync([]);
        const rows = result.getAllSync() as Array<{ cnt: number }>;
        totalNull = rows[0]?.cnt ?? 0;
      } finally {
        countStmt.finalizeSync();
      }

      if (totalNull === 0) {
        continue;
      }

      if (__DEV__) {
        console.log(`[db] Backfilling ${totalNull} uid values for ${table}`);
      }

      const updateStmt = sqlite.prepareSync(`UPDATE ${table} SET uid = ? WHERE id = ?;`);
      let processed = 0;

      try {
        while (processed < totalNull) {
          const selectStmt = sqlite.prepareSync(
            `SELECT id FROM ${table} WHERE uid IS NULL LIMIT ${batchSize};`
          );
          let ids: number[] = [];

          try {
            const result = selectStmt.executeSync([]);
            const rows = result.getAllSync() as Array<{ id: number }>;
            ids = rows.map((row) => row.id);
          } finally {
            selectStmt.finalizeSync();
          }

          if (ids.length === 0) {
            break;
          }

          for (const id of ids) {
            updateStmt.executeSync([generateUid(), id]);
          }

          processed += ids.length;
        }
      } finally {
        updateStmt.finalizeSync();
      }

      if (__DEV__) {
        console.log(`[db] Backfilled ${processed} uid values for ${table}`);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn(`[db] Failed to backfill uid for ${table}:`, error);
      }
    }
  }
}

function generateUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const randomPart2 = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${randomPart}-${randomPart2}`;
}

function createIndexes(sqlite: SQLiteDatabase): void {
  for (const table of UID_TABLES) {
    ensureIndex(
      sqlite,
      `idx_${table}_uid`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uid ON ${table}(uid);`
    );
  }

  ensureIndex(
    sqlite,
    "idx_workout_exercises_performed_at",
    "CREATE INDEX IF NOT EXISTS idx_workout_exercises_performed_at ON workout_exercises(performed_at);"
  );
  ensureIndex(
    sqlite,
    "idx_workout_exercises_completed_at",
    "CREATE INDEX IF NOT EXISTS idx_workout_exercises_completed_at ON workout_exercises(completed_at);"
  );
  ensureIndex(
    sqlite,
    "idx_program_calendar_exercises_workout_exercise_id",
    "CREATE INDEX IF NOT EXISTS idx_program_calendar_exercises_workout_exercise_id ON program_calendar_exercises(workout_exercise_id);"
  );
  ensureIndex(
    sqlite,
    "idx_program_calendar_sets_set_id",
    "CREATE INDEX IF NOT EXISTS idx_program_calendar_sets_set_id ON program_calendar_sets(set_id);"
  );
}

function ensureIndex(sqlite: SQLiteDatabase, name: string, statement: string): void {
  try {
    sqlite.execSync(statement);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[db] Failed to create ${name}:`, error);
    }
  }
}

function logWorkoutExerciseColumnStatus(sqlite: SQLiteDatabase): void {
  const columns = loadTableColumns(sqlite, "workout_exercises");
  const hasPerformedAt = columns?.has("performed_at") ?? false;
  const hasCompletedAt = columns?.has("completed_at") ?? false;

  if (!__DEV__) {
    return;
  }

  if (hasPerformedAt) {
    console.log("Migration OK: workout_exercises.performed_at exists");
  } else {
    console.warn("Migration missing: workout_exercises.performed_at not found");
  }

  if (hasCompletedAt) {
    console.log("Migration OK: workout_exercises.completed_at exists");
  } else {
    console.warn("Migration missing: workout_exercises.completed_at not found");
  }
}

function repairProgramLinkedWorkoutExercises(sqlite: SQLiteDatabase): void {
  try {
    sqlite.execSync(`
      UPDATE workout_exercises
      SET completed_at = COALESCE(
        performed_at,
        (
          SELECT MAX(s.performed_at)
          FROM sets s
          WHERE s.workout_exercise_id = workout_exercises.id
        ),
        strftime('%s','now') * 1000
      )
      WHERE completed_at IS NULL
        AND id IN (
          SELECT DISTINCT workout_exercise_id
          FROM program_calendar_exercises
          WHERE workout_exercise_id IS NOT NULL
        )
        AND EXISTS (
          SELECT 1
          FROM sets s
          WHERE s.workout_exercise_id = workout_exercises.id
        );
    `);
  } catch (error) {
    if (__DEV__) {
      console.warn("[db] Failed to repair open program-linked workout_exercises:", error);
    }
  }
}

function loadTableColumns(sqlite: SQLiteDatabase, table: string): Set<string> | null {
  try {
    const stmt = sqlite.prepareSync(`PRAGMA table_info(${table});`);
    try {
      const result = stmt.executeSync([]);
      const rows = result.getAllSync() as Array<{ name: string }>;
      return new Set(rows.map((row) => row.name));
    } finally {
      stmt.finalizeSync();
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(`[db] Failed to read schema for ${table}:`, error);
    }
    return null;
  }
}
