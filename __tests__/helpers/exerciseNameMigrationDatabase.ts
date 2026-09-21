import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

export const PRODUCTION_EXERCISE_FIXTURES = [
  {
    file: "production-current-canonical.sql",
    name: "current canonical (76c70e2/0f25ee6 fresh)",
    shape: "current-canonical",
    initialExerciseUids: "stable",
  },
  {
    file: "production-uid-era-fresh.sql",
    name: "39cc234 fresh then variation ALTERs",
    shape: "uid-era-fresh-then-variations",
    initialExerciseUids: "stable",
  },
  {
    file: "production-preuid-direct.sql",
    name: "a97acf7 direct current upgrade",
    shape: "pre-uid-direct-upgrade",
    initialExerciseUids: "null",
  },
  {
    file: "production-preuid-sequential.sql",
    name: "pre-UID sequential 3223ce9/76c70e2 upgrade",
    shape: "pre-uid-sequential-upgrade",
    initialExerciseUids: "stable",
  },
  {
    file: "production-0923b8d-direct.sql",
    name: "0923b8d fresh direct current upgrade",
    shape: "0923b8d-fresh-direct-upgrade",
    initialExerciseUids: "missing",
  },
] as const;

export type ProductionExerciseFixture = (typeof PRODUCTION_EXERCISE_FIXTURES)[number];

export const EXERCISE_MIGRATION_FAILURE_STAGES = [
  "create",
  "copy",
  "drop",
  "rename",
  "index",
  "foreign-key-check",
] as const;

export type ExerciseMigrationFailureStage =
  (typeof EXERCISE_MIGRATION_FAILURE_STAGES)[number];

export const EXERCISE_UID_BACKFILL_FAILURE_STAGES = [
  "before-first-update",
  "partial-batch",
] as const;

export type ExerciseUidBackfillFailureStage =
  (typeof EXERCISE_UID_BACKFILL_FAILURE_STAGES)[number];

export const DATA_TABLES = [
  "settings",
  "user_checkins",
  "exercises",
  "workouts",
  "workout_exercises",
  "sets",
  "psl_programs",
  "program_calendar",
  "program_calendar_exercises",
  "program_calendar_sets",
  "pr_events",
  "tags",
  "taggings",
  "media",
  "exercise_formula_overrides",
] as const;

export type DatabaseSnapshot = {
  catalog: unknown[];
  data: Record<string, unknown[]>;
  exerciseColumns: unknown[];
  foreignKeys: Record<string, unknown[]>;
};

export type ProductionFixtureDatabase = {
  adapter: NodeSqliteAdapter;
  database: DatabaseSync;
  directory: string;
  path: string;
};

const FIXTURE_DIRECTORY = join(
  __dirname,
  "..",
  "fixtures",
  "exercise-name-migration"
);
const POPULATED_FIXTURE_SQL = readFileSync(
  join(FIXTURE_DIRECTORY, "legacy-populated.sql"),
  "utf8"
);

function plainRows(rows: unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(rows)) as unknown[];
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function dataSnapshot(database: DatabaseSync): Record<string, unknown[]> {
  return Object.fromEntries(
    DATA_TABLES.map((table) => [
      table,
      plainRows(database.prepare(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY rowid;`).all()),
    ])
  );
}

export function schemaSnapshot(database: DatabaseSync): unknown[] {
  return plainRows(
    database
      .prepare(
        `SELECT type, name, tbl_name, sql
         FROM sqlite_schema
         WHERE sql IS NOT NULL
         ORDER BY type, name;`
      )
      .all()
  );
}

export function schemaExceptExerciseDefinition(database: DatabaseSync): unknown[] {
  return plainRows(
    database
      .prepare(
        `SELECT type, name, tbl_name, sql
         FROM sqlite_schema
         WHERE sql IS NOT NULL
           AND NOT (type = 'table' AND name = 'exercises')
         ORDER BY type, name;`
      )
      .all()
  );
}

export function foreignKeySnapshot(database: DatabaseSync): Record<string, unknown[]> {
  return Object.fromEntries(
    DATA_TABLES.map((table) => [
      table,
      plainRows(database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)});`).all()),
    ])
  );
}

export function databaseSnapshot(database: DatabaseSync): DatabaseSnapshot {
  return {
    catalog: schemaSnapshot(database),
    data: dataSnapshot(database),
    exerciseColumns: plainRows(database.prepare("PRAGMA table_xinfo('exercises');").all()),
    foreignKeys: foreignKeySnapshot(database),
  };
}

export function foreignKeysEnabled(database: DatabaseSync): number {
  return (database.prepare("PRAGMA foreign_keys;").get() as { foreign_keys: number }).foreign_keys;
}

function isQuery(sql: string): boolean {
  return /^\s*(?:SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(sql);
}

function runStatement(statement: StatementSync, params: unknown): unknown[] {
  if (Array.isArray(params)) {
    return plainRows(statement.all(...params));
  }
  return plainRows(statement.all(params as never));
}

function executeStatement(statement: StatementSync, params: unknown): void {
  if (Array.isArray(params)) {
    statement.run(...params);
    return;
  }
  statement.run(params as never);
}

export class NodeSqliteAdapter {
  readonly execLog: string[] = [];
  beforeMigration: DatabaseSnapshot | null = null;
  afterMigration: DatabaseSnapshot | null = null;
  private migrationActive = false;
  private injectedFailure = false;
  private exerciseUidUpdates = 0;
  private uidBackfillFailureInjected = false;

  constructor(
    readonly database: DatabaseSync,
    private readonly failAt?: ExerciseMigrationFailureStage,
    private readonly uidBackfillFailAt?: ExerciseUidBackfillFailureStage
  ) {}

  execSync(sql: string): void {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized === "PRAGMA foreign_keys = OFF;" && !this.migrationActive) {
      this.beforeMigration = databaseSnapshot(this.database);
      this.migrationActive = true;
    }

    this.database.exec(sql);
    this.execLog.push(sql);

    if (this.migrationActive && normalized === "COMMIT;") {
      this.afterMigration = databaseSnapshot(this.database);
      this.migrationActive = false;
      return;
    }

    if (!this.migrationActive || this.injectedFailure || !this.failAt) {
      return;
    }

    const stageMatches =
      (this.failAt === "create" &&
        normalized.startsWith("CREATE TABLE __mvp003b_exercises_new")) ||
      (this.failAt === "copy" &&
        normalized.startsWith("INSERT INTO __mvp003b_exercises_new")) ||
      (this.failAt === "drop" && normalized === "DROP TABLE exercises;") ||
      (this.failAt === "rename" &&
        normalized === "ALTER TABLE __mvp003b_exercises_new RENAME TO exercises;") ||
      (this.failAt === "index" && /^CREATE (?:UNIQUE )?INDEX /i.test(normalized));
    if (stageMatches) {
      this.injectedFailure = true;
      throw new Error(`Injected production exercise migration failure at ${this.failAt}`);
    }
  }

  prepareSync(sql: string) {
    const statement = this.database.prepare(sql);
    return {
      executeSync: (params: unknown = []) => {
        const isExerciseUidUpdate = /^\s*UPDATE\s+exercises\s+SET\s+uid\s*=\s*\?/i.test(sql);
        if (isExerciseUidUpdate && !this.uidBackfillFailureInjected) {
          const shouldFailBeforeFirst =
            this.uidBackfillFailAt === "before-first-update" && this.exerciseUidUpdates === 0;
          const shouldFailPartially =
            this.uidBackfillFailAt === "partial-batch" && this.exerciseUidUpdates === 1;
          if (shouldFailBeforeFirst || shouldFailPartially) {
            this.uidBackfillFailureInjected = true;
            throw new Error(
              `Injected exercise UID backfill failure at ${this.uidBackfillFailAt}`
            );
          }
        }
        const rows = isQuery(sql) ? runStatement(statement, params) : [];
        if (!isQuery(sql)) {
          executeStatement(statement, params);
        }
        if (isExerciseUidUpdate) {
          this.exerciseUidUpdates += 1;
        }
        if (
          this.migrationActive &&
          !this.injectedFailure &&
          this.failAt === "foreign-key-check" &&
          /^\s*PRAGMA\s+foreign_key_check\s*;/i.test(sql)
        ) {
          this.injectedFailure = true;
          throw new Error("Injected production exercise migration failure at foreign-key-check");
        }
        return { getAllSync: () => rows };
      },
      finalizeSync: () => undefined,
    };
  }
}

export function openProductionFixture(
  fixture: ProductionExerciseFixture,
  failAt?: ExerciseMigrationFailureStage,
  uidBackfillFailAt?: ExerciseUidBackfillFailureStage
): ProductionFixtureDatabase {
  const directory = mkdtempSync(join(tmpdir(), "workoutlog-mvp003b-"));
  const path = join(directory, "workoutlog.sqlite");
  const database = new DatabaseSync(path);
  database.exec(POPULATED_FIXTURE_SQL);
  database.exec(readFileSync(join(FIXTURE_DIRECTORY, fixture.file), "utf8"));
  const adapter = new NodeSqliteAdapter(database, failAt, uidBackfillFailAt);
  return { adapter, database, directory, path };
}

export function openFreshDatabase(): ProductionFixtureDatabase {
  const directory = mkdtempSync(join(tmpdir(), "workoutlog-mvp003b-fresh-"));
  const path = join(directory, "workoutlog.sqlite");
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON;");
  const adapter = new NodeSqliteAdapter(database);
  return { adapter, database, directory, path };
}

export function closeProductionFixture(fixture: ProductionFixtureDatabase): void {
  fixture.database.close();
  rmSync(fixture.directory, { recursive: true, force: true });
}

export function reopenFixture(fixture: ProductionFixtureDatabase): ProductionFixtureDatabase {
  fixture.database.close();
  fixture.database = new DatabaseSync(fixture.path);
  fixture.database.exec("PRAGMA foreign_keys = ON;");
  fixture.adapter = new NodeSqliteAdapter(fixture.database);
  return fixture;
}
