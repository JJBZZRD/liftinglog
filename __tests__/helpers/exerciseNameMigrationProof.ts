import { DatabaseSync } from "node:sqlite";

const LEGACY_EXERCISES_DEFINITION = `(
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
)`;

const TARGET_EXERCISES_DEFINITION = `(
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
)`;

const EXERCISE_COLUMNS = [
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
] as const;

const TEMP_TABLE = "__mvp003a_exercises_new";
const EXPECTED_UID_INDEX_SQL =
  "CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid)";

export const EXERCISE_NAME_MIGRATION_FAILURE_STAGES = [
  "after-create",
  "after-copy",
  "after-drop",
  "after-rename",
  "after-index-recreation",
  "after-foreign-key-check",
] as const;

export type ExerciseNameMigrationFailureStage =
  (typeof EXERCISE_NAME_MIGRATION_FAILURE_STAGES)[number];

type MigrationOptions = {
  failAt?: ExerciseNameMigrationFailureStage;
};

type SchemaObject = {
  name: string;
  sql: string;
  type: "index" | "trigger";
};

type IndexListRow = {
  name: string;
  origin: string;
  partial: number;
  unique: number;
};

type NamedColumn = {
  name: string;
};

function normalizeDefinition(sql: string): string {
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

function getForeignKeysEnabled(database: DatabaseSync): boolean {
  const row = database.prepare("PRAGMA foreign_keys;").get() as
    | { foreign_keys: number }
    | undefined;
  return row?.foreign_keys === 1;
}

function getExercisesSql(database: DatabaseSync): string {
  const row = database
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'exercises';"
    )
    .get() as { sql: string | null } | undefined;

  if (!row?.sql) {
    throw new Error("Unsupported exercises schema: exercises table is missing");
  }

  return row.sql;
}

function assertNoTemporaryTable(database: DatabaseSync): void {
  const row = database
    .prepare("SELECT 1 AS present FROM sqlite_schema WHERE name = ?;")
    .get(TEMP_TABLE) as { present: number } | undefined;

  if (row) {
    throw new Error(`Unsupported schema drift: ${TEMP_TABLE} already exists`);
  }
}

function getIndexColumns(database: DatabaseSync, indexName: string): string[] {
  return (
    database.prepare(`PRAGMA index_info(${quoteIdentifier(indexName)});`).all() as NamedColumn[]
  ).map((row) => row.name);
}

function getIndexSql(database: DatabaseSync, indexName: string): string | null {
  const row = database
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?;")
    .get(indexName) as { sql: string | null } | undefined;
  return row?.sql ?? null;
}

function assertNameUniquenessState(database: DatabaseSync, expectedLegacy: boolean): void {
  const indexes = database.prepare("PRAGMA index_list('exercises');").all() as IndexListRow[];
  const implicitNameConstraints = indexes.filter(
    (index) =>
      index.unique === 1 &&
      index.origin === "u" &&
      getIndexColumns(database, index.name).join("\0") === "name"
  );

  for (const index of indexes.filter((candidate) => candidate.unique === 1 && candidate.origin === "c")) {
    const indexSql = getIndexSql(database, index.name);
    const isKnownUidIndex =
      index.name === "idx_exercises_uid" &&
      index.partial === 0 &&
      indexSql !== null &&
      normalizeSchemaStatement(indexSql) === normalizeSchemaStatement(EXPECTED_UID_INDEX_SQL);
    if (!isKnownUidIndex) {
      throw new Error(
        `Unsupported schema drift: unique index ${index.name} is outside the proven exercises index set`
      );
    }
  }

  const expectedImplicitCount = expectedLegacy ? 1 : 0;
  if (implicitNameConstraints.length !== expectedImplicitCount) {
    throw new Error(
      `Unsupported exercises schema: expected ${expectedImplicitCount} implicit name uniqueness constraint(s), found ${implicitNameConstraints.length}`
    );
  }
}

function classifySchema(database: DatabaseSync): "legacy" | "target" {
  const actualDefinition = normalizeDefinition(getExercisesSql(database));
  const legacyDefinition = normalizeDefinition(LEGACY_EXERCISES_DEFINITION);
  const targetDefinition = normalizeDefinition(TARGET_EXERCISES_DEFINITION);

  if (actualDefinition === legacyDefinition) {
    assertNameUniquenessState(database, true);
    return "legacy";
  }

  if (actualDefinition === targetDefinition) {
    assertNameUniquenessState(database, false);
    return "target";
  }

  throw new Error(
    "Unsupported exercises schema: expected the post-bootstrap MVP legacy or target definition"
  );
}

function loadSchemaObjects(database: DatabaseSync): SchemaObject[] {
  return database
    .prepare(
      `SELECT type, name, sql
       FROM sqlite_schema
       WHERE tbl_name = 'exercises'
         AND type IN ('index', 'trigger')
         AND sql IS NOT NULL
       ORDER BY type, name;`
    )
    .all() as SchemaObject[];
}

function assertForeignKeysValid(database: DatabaseSync): void {
  const violations = database.prepare("PRAGMA foreign_key_check;").all();
  if (violations.length > 0) {
    throw new Error(
      `Foreign key check failed after exercises rebuild: ${JSON.stringify(violations)}`
    );
  }
}

function getRowCount(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table};`).get() as {
    count: number;
  };
  return row.count;
}

function failIfRequested(
  options: MigrationOptions,
  stage: ExerciseNameMigrationFailureStage
): void {
  if (options.failAt === stage) {
    throw new Error(`Injected exercise-name migration failure at ${stage}`);
  }
}

/**
 * Test-only executable proof of the recommended SQLite table rebuild.
 * Production integration deliberately remains outside MVP-003A.
 */
export function proveExerciseNameUniquenessRemoval(
  database: DatabaseSync,
  options: MigrationOptions = {}
): { applied: boolean } {
  const schemaKind = classifySchema(database);
  if (schemaKind === "target") {
    return { applied: false };
  }

  assertNoTemporaryTable(database);
  const schemaObjects = loadSchemaObjects(database);
  const foreignKeysWereEnabled = getForeignKeysEnabled(database);
  let transactionStarted = false;

  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    if (getForeignKeysEnabled(database)) {
      throw new Error("Could not disable foreign key enforcement before table rebuild");
    }

    database.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;

    database.exec(`CREATE TABLE ${TEMP_TABLE} ${TARGET_EXERCISES_DEFINITION};`);
    failIfRequested(options, "after-create");

    const sourceRowCount = getRowCount(database, "exercises");
    const columns = EXERCISE_COLUMNS.join(", ");
    database.exec(
      `INSERT INTO ${TEMP_TABLE} (${columns}) SELECT ${columns} FROM exercises;`
    );
    const copiedRowCount = getRowCount(database, TEMP_TABLE);
    if (copiedRowCount !== sourceRowCount) {
      throw new Error(
        `Exercise row-count mismatch during rebuild: expected ${sourceRowCount}, copied ${copiedRowCount}`
      );
    }
    failIfRequested(options, "after-copy");

    database.exec("DROP TABLE exercises;");
    failIfRequested(options, "after-drop");

    database.exec(`ALTER TABLE ${TEMP_TABLE} RENAME TO exercises;`);
    failIfRequested(options, "after-rename");

    for (const schemaObject of schemaObjects) {
      database.exec(schemaObject.sql);
    }
    failIfRequested(options, "after-index-recreation");

    assertForeignKeysValid(database);
    failIfRequested(options, "after-foreign-key-check");

    database.exec("COMMIT;");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        database.exec("ROLLBACK;");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Exercise-name migration failed and rollback also failed"
        );
      }
    }
    throw error;
  } finally {
    database.exec(`PRAGMA foreign_keys = ${foreignKeysWereEnabled ? "ON" : "OFF"};`);
  }

  if (getForeignKeysEnabled(database) !== foreignKeysWereEnabled) {
    throw new Error("Could not restore the original foreign_keys setting");
  }

  classifySchema(database);
  return { applied: true };
}
