import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";

const SCHEMA_BOOTSTRAP_SQL = `
  -- Core tables
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY NOT NULL,
    e1rm_formula TEXT NOT NULL DEFAULT 'epley',
    unit_preference TEXT NOT NULL DEFAULT 'kg',
    theme_preference TEXT NOT NULL DEFAULT 'system',
    color_theme TEXT NOT NULL DEFAULT 'default',
    show_all_tab_body_part_grouping INTEGER NOT NULL DEFAULT 1
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
    fatigue_score INTEGER,
    soreness_score INTEGER,
    stress_score INTEGER,
    steps INTEGER,
    note TEXT,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS exercises (
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

type ExerciseSchemaShape = {
  name: string;
  columns: readonly string[];
  legacyDefinition: string;
  targetDefinition: string;
};

type ExerciseSchemaState = {
  kind: "legacy" | "target";
  shape: ExerciseSchemaShape;
};

type ExerciseIndexRow = {
  name: string;
  origin: string;
  partial: number;
  unique: number;
};

type ExerciseIndexColumnRow = {
  coll: string;
  desc: number;
  key: number;
  name: string | null;
};

type ExerciseSchemaObject = {
  name: string;
  sql: string;
  type: "index" | "trigger";
};

type CatalogEntry = {
  name: string;
  sql: string | null;
  tbl_name: string;
  type: string;
};

const EXERCISE_NAME_MIGRATION_TABLE = "__mvp003b_exercises_new";
const EXERCISE_UID_INDEX_SQL = "CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid)";
const EXERCISE_PARENT_INDEX_SQL =
  "CREATE INDEX idx_exercises_parent_exercise_id ON exercises(parent_exercise_id)";

function exerciseShape(
  name: string,
  columns: readonly string[],
  legacyDefinition: string
): ExerciseSchemaShape {
  const targetDefinition = legacyDefinition.replace(
    "name TEXT NOT NULL UNIQUE",
    "name TEXT NOT NULL"
  );
  if (targetDefinition === legacyDefinition) {
    throw new Error(`Invalid exercises migration shape ${name}: legacy name constraint is missing`);
  }
  return { name, columns, legacyDefinition, targetDefinition };
}

// These are the five post-column-migration layouts evidenced by Git history.
// They deliberately preserve column order instead of canonicalizing upgraded databases.
const EXERCISE_SCHEMA_SHAPES: readonly ExerciseSchemaShape[] = [
  exerciseShape(
    "current-canonical",
    [
      "id",
      "uid",
      "name",
      "parent_exercise_id",
      "variation_label",
      "description",
      "muscle_group",
      "equipment",
      "is_bodyweight",
      "created_at",
      "last_rest_seconds",
      "is_pinned",
    ],
    `(
      id INTEGER PRIMARY KEY NOT NULL,
      uid TEXT,
      name TEXT NOT NULL UNIQUE,
      parent_exercise_id INTEGER,
      variation_label TEXT,
      description TEXT,
      muscle_group TEXT,
      equipment TEXT,
      is_bodyweight INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      last_rest_seconds INTEGER,
      is_pinned INTEGER NOT NULL DEFAULT 0
    )`
  ),
  exerciseShape(
    "uid-era-fresh-then-variations",
    [
      "id",
      "uid",
      "name",
      "description",
      "muscle_group",
      "equipment",
      "is_bodyweight",
      "created_at",
      "last_rest_seconds",
      "is_pinned",
      "parent_exercise_id",
      "variation_label",
    ],
    `(
      id INTEGER PRIMARY KEY NOT NULL,
      uid TEXT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      muscle_group TEXT,
      equipment TEXT,
      is_bodyweight INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      last_rest_seconds INTEGER,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      parent_exercise_id INTEGER,
      variation_label TEXT
    )`
  ),
  exerciseShape(
    "pre-uid-direct-upgrade",
    [
      "id",
      "name",
      "description",
      "muscle_group",
      "equipment",
      "is_bodyweight",
      "created_at",
      "last_rest_seconds",
      "parent_exercise_id",
      "variation_label",
      "is_pinned",
      "uid",
    ],
    `(
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      muscle_group TEXT,
      equipment TEXT,
      is_bodyweight INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      last_rest_seconds INTEGER,
      parent_exercise_id INTEGER,
      variation_label TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      uid TEXT
    )`
  ),
  exerciseShape(
    "pre-uid-sequential-upgrade",
    [
      "id",
      "name",
      "description",
      "muscle_group",
      "equipment",
      "is_bodyweight",
      "created_at",
      "last_rest_seconds",
      "is_pinned",
      "uid",
      "parent_exercise_id",
      "variation_label",
    ],
    `(
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      muscle_group TEXT,
      equipment TEXT,
      is_bodyweight INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      last_rest_seconds INTEGER,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      uid TEXT,
      parent_exercise_id INTEGER,
      variation_label TEXT
    )`
  ),
  exerciseShape(
    "0923b8d-fresh-direct-upgrade",
    [
      "id",
      "name",
      "description",
      "muscle_group",
      "equipment",
      "is_bodyweight",
      "created_at",
      "last_rest_seconds",
      "is_pinned",
      "parent_exercise_id",
      "variation_label",
      "uid",
    ],
    `(
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      muscle_group TEXT,
      equipment TEXT,
      is_bodyweight INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      last_rest_seconds INTEGER,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      parent_exercise_id INTEGER,
      variation_label TEXT,
      uid TEXT
    )`
  ),
];

export function initializeDatabase(sqlite: SQLiteDatabase): void {
  sqlite.execSync(SCHEMA_BOOTSTRAP_SQL);

  repairUserCheckinsFatigueSchema(sqlite);
  runColumnMigrations(sqlite);
  dropLegacyProgramTables(sqlite);
  ensureUidColumns(sqlite);
  backfillUids(sqlite);
  assertExerciseUidsBackfilled(sqlite);
  migrateExerciseNameUniqueness(sqlite);
  createIndexes(sqlite);
  assertExerciseIndexes(sqlite, false, true);
  logWorkoutExerciseColumnStatus(sqlite);
  repairProgramLinkedWorkoutExercises(sqlite);
}

function queryRows<T>(sqlite: SQLiteDatabase, sql: string, params: SQLiteBindParams = []): T[] {
  const statement = sqlite.prepareSync(sql);
  try {
    return statement.executeSync(params).getAllSync() as T[];
  } finally {
    statement.finalizeSync();
  }
}

function normalizeExerciseDefinition(sql: string): string {
  const openingParenthesis = sql.indexOf("(");
  if (openingParenthesis === -1) {
    return "";
  }
  return sql
    .slice(openingParenthesis)
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .replace(/;$/, "")
    .trim()
    .toLowerCase();
}

function normalizeSchemaStatement(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .replace(/;$/, "")
    .trim()
    .toLowerCase();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getForeignKeysEnabled(sqlite: SQLiteDatabase): boolean {
  const row = queryRows<{ foreign_keys: number }>(sqlite, "PRAGMA foreign_keys;")[0];
  return row?.foreign_keys === 1;
}

function getExercisesDefinition(sqlite: SQLiteDatabase): string {
  const row = queryRows<{ sql: string | null }>(
    sqlite,
    "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'exercises';"
  )[0];
  if (!row?.sql) {
    throw new Error("Unsupported exercises schema: exercises table is missing");
  }
  return row.sql;
}

function getIndexSql(sqlite: SQLiteDatabase, indexName: string): string | null {
  return (
    queryRows<{ sql: string | null }>(
      sqlite,
      "SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?;",
      [indexName]
    )[0]?.sql ?? null
  );
}

function assertKnownExerciseIndex(
  sqlite: SQLiteDatabase,
  index: ExerciseIndexRow,
  expected: { column: string; sql: string; unique: number }
): void {
  const indexSql = getIndexSql(sqlite, index.name);
  const keyColumns = queryRows<ExerciseIndexColumnRow>(
    sqlite,
    `PRAGMA index_xinfo(${quoteIdentifier(index.name)});`
  ).filter((column) => column.key === 1);
  const validKey =
    keyColumns.length === 1 &&
    keyColumns[0].name === expected.column &&
    keyColumns[0].coll === "BINARY" &&
    keyColumns[0].desc === 0;
  if (
    index.origin !== "c" ||
    index.partial !== 0 ||
    index.unique !== expected.unique ||
    indexSql === null ||
    normalizeSchemaStatement(indexSql) !== normalizeSchemaStatement(expected.sql) ||
    !validKey
  ) {
    throw new Error(`Unsupported exercises index drift: ${index.name}`);
  }
}

function assertExerciseIndexes(
  sqlite: SQLiteDatabase,
  expectedLegacyNameConstraint: boolean,
  requireBootstrapIndexes = false
): void {
  const indexes = queryRows<ExerciseIndexRow>(sqlite, "PRAGMA index_list('exercises');");
  const implicitUniqueIndexes = indexes.filter((index) => index.origin === "u");
  const nameConstraintIndexes = implicitUniqueIndexes.filter((index) => {
    const keyColumns = queryRows<ExerciseIndexColumnRow>(
      sqlite,
      `PRAGMA index_xinfo(${quoteIdentifier(index.name)});`
    ).filter((column) => column.key === 1);
    return keyColumns.length === 1 && keyColumns[0].name === "name";
  });
  const expectedNameConstraintCount = expectedLegacyNameConstraint ? 1 : 0;
  if (
    implicitUniqueIndexes.length !== expectedNameConstraintCount ||
    nameConstraintIndexes.length !== expectedNameConstraintCount
  ) {
    throw new Error(
      `Unsupported exercises schema: expected ${expectedNameConstraintCount} implicit name uniqueness constraint(s), found ${nameConstraintIndexes.length}`
    );
  }

  if (
    requireBootstrapIndexes &&
    (!indexes.some((index) => index.name === "idx_exercises_uid") ||
      !indexes.some((index) => index.name === "idx_exercises_parent_exercise_id"))
  ) {
    throw new Error("Required exercises UID or parent index is missing after bootstrap");
  }

  for (const index of indexes.filter((candidate) => candidate.origin === "c")) {
    if (index.name === "idx_exercises_uid") {
      assertKnownExerciseIndex(sqlite, index, {
        column: "uid",
        sql: EXERCISE_UID_INDEX_SQL,
        unique: 1,
      });
      continue;
    }
    if (index.name === "idx_exercises_parent_exercise_id") {
      assertKnownExerciseIndex(sqlite, index, {
        column: "parent_exercise_id",
        sql: EXERCISE_PARENT_INDEX_SQL,
        unique: 0,
      });
      continue;
    }
    if (index.unique === 1) {
      throw new Error(
        `Unsupported exercises index drift: unique index ${index.name} is outside the supported set`
      );
    }
  }
}

function assertNoDuplicateExerciseUids(sqlite: SQLiteDatabase): void {
  const duplicate = queryRows<{ count: number; uid: string }>(
    sqlite,
    `SELECT uid, COUNT(*) AS count
     FROM exercises
     WHERE uid IS NOT NULL
     GROUP BY uid
     HAVING COUNT(*) > 1
     LIMIT 1;`
  )[0];
  if (duplicate) {
    throw new Error(`Unsupported exercises UID drift: duplicate uid ${duplicate.uid}`);
  }
}

function classifyExerciseSchema(sqlite: SQLiteDatabase): ExerciseSchemaState {
  const actualDefinition = normalizeExerciseDefinition(getExercisesDefinition(sqlite));
  for (const shape of EXERCISE_SCHEMA_SHAPES) {
    if (actualDefinition === normalizeExerciseDefinition(shape.legacyDefinition)) {
      assertExerciseIndexes(sqlite, true);
      return { kind: "legacy", shape };
    }
    if (actualDefinition === normalizeExerciseDefinition(shape.targetDefinition)) {
      assertExerciseIndexes(sqlite, false);
      return { kind: "target", shape };
    }
  }
  throw new Error(
    "Unsupported exercises schema: expected an evidenced MVP-003B legacy or target definition"
  );
}

function assertNoExerciseMigrationTable(sqlite: SQLiteDatabase): void {
  const row = queryRows<{ present: number }>(
    sqlite,
    "SELECT 1 AS present FROM sqlite_schema WHERE name = ?;",
    [EXERCISE_NAME_MIGRATION_TABLE]
  )[0];
  if (row) {
    throw new Error(
      `Unsupported exercises schema: temporary table ${EXERCISE_NAME_MIGRATION_TABLE} already exists`
    );
  }
}

function assertNoDependentExerciseViews(sqlite: SQLiteDatabase): void {
  const dependentViews = queryRows<{ name: string; sql: string | null }>(
    sqlite,
    "SELECT name, sql FROM sqlite_schema WHERE type = 'view' ORDER BY name;"
  ).filter((view) => view.sql !== null && /\bexercises\b/i.test(view.sql));
  if (dependentViews.length > 0) {
    throw new Error(
      `Unsupported exercises schema: dependent view(s) require a separate proven migration: ${dependentViews
        .map((view) => view.name)
        .join(", ")}`
    );
  }
}

function loadExerciseSchemaObjects(sqlite: SQLiteDatabase): ExerciseSchemaObject[] {
  return queryRows<ExerciseSchemaObject>(
    sqlite,
    `SELECT type, name, sql
     FROM sqlite_schema
     WHERE tbl_name = 'exercises'
       AND type IN ('index', 'trigger')
       AND sql IS NOT NULL
     ORDER BY type, name;`
  );
}

function loadCatalogForExerciseMigration(sqlite: SQLiteDatabase): CatalogEntry[] {
  return queryRows<CatalogEntry>(
    sqlite,
    `SELECT type, name, tbl_name, sql
     FROM sqlite_schema
     WHERE NOT (type = 'table' AND name = 'exercises')
       AND NOT (type = 'index' AND tbl_name = 'exercises' AND sql IS NULL)
     ORDER BY type, name;`
  );
}

function getTableRowCount(sqlite: SQLiteDatabase, table: string): number {
  return queryRows<{ count: number }>(sqlite, `SELECT COUNT(*) AS count FROM ${table};`)[0].count;
}

function assertExerciseForeignKeysValid(sqlite: SQLiteDatabase): void {
  const violations = queryRows<Record<string, unknown>>(sqlite, "PRAGMA foreign_key_check;");
  if (violations.length > 0) {
    throw new Error(
      `Foreign key check failed after exercises rebuild: ${JSON.stringify(violations)}`
    );
  }
}

function restoreForeignKeySetting(sqlite: SQLiteDatabase, enabled: boolean): void {
  sqlite.execSync(`PRAGMA foreign_keys = ${enabled ? "ON" : "OFF"};`);
  if (getForeignKeysEnabled(sqlite) !== enabled) {
    throw new Error("Could not restore the original foreign_keys setting");
  }
}

function migrateExerciseNameUniqueness(sqlite: SQLiteDatabase): void {
  const state = classifyExerciseSchema(sqlite);
  if (state.kind === "target") {
    return;
  }

  assertNoExerciseMigrationTable(sqlite);
  assertNoDependentExerciseViews(sqlite);
  assertNoDuplicateExerciseUids(sqlite);
  const schemaObjects = loadExerciseSchemaObjects(sqlite);
  const catalogBefore = loadCatalogForExerciseMigration(sqlite);
  const foreignKeysWereEnabled = getForeignKeysEnabled(sqlite);
  let transactionStarted = false;
  let migrationError: unknown;

  try {
    sqlite.execSync("PRAGMA foreign_keys = OFF;");
    if (getForeignKeysEnabled(sqlite)) {
      throw new Error("Could not disable foreign key enforcement before exercises rebuild");
    }

    sqlite.execSync("BEGIN IMMEDIATE;");
    transactionStarted = true;
    sqlite.execSync(
      `CREATE TABLE ${EXERCISE_NAME_MIGRATION_TABLE} ${state.shape.targetDefinition};`
    );

    const sourceRowCount = getTableRowCount(sqlite, "exercises");
    const columns = state.shape.columns.join(", ");
    sqlite.execSync(
      `INSERT INTO ${EXERCISE_NAME_MIGRATION_TABLE} (${columns}) SELECT ${columns} FROM exercises;`
    );
    const copiedRowCount = getTableRowCount(sqlite, EXERCISE_NAME_MIGRATION_TABLE);
    if (copiedRowCount !== sourceRowCount) {
      throw new Error(
        `Exercise row-count mismatch during rebuild: expected ${sourceRowCount}, copied ${copiedRowCount}`
      );
    }

    sqlite.execSync("DROP TABLE exercises;");
    sqlite.execSync(`ALTER TABLE ${EXERCISE_NAME_MIGRATION_TABLE} RENAME TO exercises;`);
    for (const schemaObject of schemaObjects) {
      sqlite.execSync(schemaObject.sql);
    }

    const catalogAfter = loadCatalogForExerciseMigration(sqlite);
    if (JSON.stringify(catalogAfter) !== JSON.stringify(catalogBefore)) {
      throw new Error("Unexpected sqlite_schema change while rebuilding exercises");
    }
    assertExerciseForeignKeysValid(sqlite);
    sqlite.execSync("COMMIT;");
    transactionStarted = false;
  } catch (error) {
    migrationError = error;
    if (transactionStarted) {
      try {
        sqlite.execSync("ROLLBACK;");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Exercise-name migration failed and rollback also failed"
        );
      }
    }
    throw error;
  } finally {
    try {
      restoreForeignKeySetting(sqlite, foreignKeysWereEnabled);
    } catch (restoreError) {
      if (migrationError) {
        throw new AggregateError(
          [migrationError, restoreError],
          "Exercise-name migration failed and foreign-key restoration also failed"
        );
      }
      throw restoreError;
    }
  }

  classifyExerciseSchema(sqlite);
}

function runColumnMigrations(sqlite: SQLiteDatabase): void {
  addColumnIfMissing(sqlite, "exercises", "last_rest_seconds INTEGER");
  addColumnIfMissing(sqlite, "exercises", "parent_exercise_id INTEGER");
  addColumnIfMissing(sqlite, "exercises", "variation_label TEXT");
  addColumnIfMissing(sqlite, "workout_exercises", "current_weight REAL");
  addColumnIfMissing(sqlite, "workout_exercises", "current_reps INTEGER");
  addColumnIfMissing(sqlite, "exercises", "is_pinned INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "settings", "theme_preference TEXT NOT NULL DEFAULT 'system'");
  addColumnIfMissing(sqlite, "settings", "color_theme TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(
    sqlite,
    "settings",
    "show_all_tab_body_part_grouping INTEGER NOT NULL DEFAULT 1"
  );
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
  addColumnIfMissing(sqlite, "user_checkins", "fatigue_score INTEGER");
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

function repairUserCheckinsFatigueSchema(sqlite: SQLiteDatabase): void {
  const columns = loadTableColumns(sqlite, "user_checkins");
  if (!columns) {
    return;
  }

  const hasReadinessScore = columns.has("readiness_score");
  const hasFatigueScore = columns.has("fatigue_score");

  if (hasFatigueScore && !hasReadinessScore) {
    return;
  }

  if (!hasReadinessScore && !hasFatigueScore) {
    addColumnIfMissing(sqlite, "user_checkins", "fatigue_score INTEGER");
    return;
  }

  const fatigueSourceExpression = hasFatigueScore ? "fatigue_score" : "NULL";

  try {
    sqlite.execSync("BEGIN TRANSACTION;");
    sqlite.execSync("DROP TABLE IF EXISTS user_checkins_legacy_fatigue_repair;");
    sqlite.execSync("ALTER TABLE user_checkins RENAME TO user_checkins_legacy_fatigue_repair;");
    sqlite.execSync(`
      CREATE TABLE user_checkins (
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
        fatigue_score INTEGER,
        soreness_score INTEGER,
        stress_score INTEGER,
        steps INTEGER,
        note TEXT,
        source TEXT
      );
    `);
    sqlite.execSync(`
      INSERT INTO user_checkins (
        id,
        uid,
        recorded_at,
        context,
        bodyweight_kg,
        waist_cm,
        sleep_start_at,
        sleep_end_at,
        sleep_hours,
        resting_hr_bpm,
        fatigue_score,
        soreness_score,
        stress_score,
        steps,
        note,
        source
      )
      SELECT
        id,
        uid,
        recorded_at,
        context,
        bodyweight_kg,
        waist_cm,
        sleep_start_at,
        sleep_end_at,
        sleep_hours,
        resting_hr_bpm,
        ${fatigueSourceExpression},
        soreness_score,
        stress_score,
        steps,
        note,
        source
      FROM user_checkins_legacy_fatigue_repair;
    `);
    sqlite.execSync("DROP TABLE user_checkins_legacy_fatigue_repair;");
    sqlite.execSync(
      "CREATE INDEX IF NOT EXISTS idx_user_checkins_recorded_at ON user_checkins(recorded_at);"
    );
    sqlite.execSync("COMMIT;");
  } catch (error) {
    try {
      sqlite.execSync("ROLLBACK;");
    } catch {
      // Ignore rollback failures after a partial transaction error.
    }

    if (__DEV__) {
      console.warn("[db] Failed to repair user_checkins fatigue schema:", error);
    }
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
      if (table === "exercises") {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        throw new Error(`Failed to backfill required exercise UIDs${detail}`);
      }
      if (__DEV__) {
        console.warn(`[db] Failed to backfill uid for ${table}:`, error);
      }
    }
  }
}

function assertExerciseUidsBackfilled(sqlite: SQLiteDatabase): void {
  const missingUid = queryRows<{ id: number }>(
    sqlite,
    "SELECT id FROM exercises WHERE uid IS NULL LIMIT 1;"
  )[0];
  if (missingUid) {
    throw new Error(
      `Failed to backfill required exercise UIDs: exercise ${missingUid.id} still has a null uid`
    );
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
  ensureIndex(
    sqlite,
    "idx_exercises_parent_exercise_id",
    "CREATE INDEX IF NOT EXISTS idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);"
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
