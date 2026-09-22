import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../../lib/db/bootstrap";
import {
  NodeSqliteAdapter,
  PRODUCTION_EXERCISE_FIXTURES,
  type ProductionExerciseFixture,
} from "./exerciseNameMigrationDatabase";

const EXERCISE_FIXTURE_DIRECTORY = join(
  __dirname,
  "..",
  "fixtures",
  "exercise-name-migration"
);
const RESTORE_FIXTURE_DIRECTORY = join(
  __dirname,
  "..",
  "fixtures",
  "replacement-restore-schema"
);

export type RestoreManifestFixture = {
  adapter: NodeSqliteAdapter;
  connection: ReadonlyNodeSqliteConnection;
  database: DatabaseSync;
  directory: string;
  path: string;
};

function plainRows<T>(rows: T[]): T[] {
  return JSON.parse(JSON.stringify(rows)) as T[];
}

export class ReadonlyNodeSqliteConnection {
  readonly queries: string[] = [];

  constructor(private readonly database: DatabaseSync) {}

  getAllSync<T>(sql: string): T[] {
    if (!/^\s*(?:SELECT|PRAGMA)\b/i.test(sql)) {
      throw new Error(`Schema validator attempted a non-read-only statement: ${sql}`);
    }
    this.queries.push(sql);
    return plainRows(this.database.prepare(sql).all() as T[]);
  }
}

function openSql(sql: string, prefix: string): RestoreManifestFixture {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const path = join(directory, "workoutlog.sqlite");
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(sql);
  return {
    adapter: new NodeSqliteAdapter(database),
    connection: new ReadonlyNodeSqliteConnection(database),
    database,
    directory,
    path,
  };
}

export function openHistoricalRestoreFixture(): RestoreManifestFixture {
  return openSql(
    readFileSync(join(RESTORE_FIXTURE_DIRECTORY, "e9ee8ed-fresh.sql"), "utf8"),
    "workoutlog-restore-schema-historical-"
  );
}

export function openExerciseRestoreFixture(
  fixture: ProductionExerciseFixture
): RestoreManifestFixture {
  const populated = readFileSync(join(EXERCISE_FIXTURE_DIRECTORY, "legacy-populated.sql"), "utf8");
  const exercise = readFileSync(join(EXERCISE_FIXTURE_DIRECTORY, fixture.file), "utf8");
  const opened = openSql(`${populated}\n${exercise}`, "workoutlog-restore-schema-exercise-");
  if (fixture === PRODUCTION_EXERCISE_FIXTURES[0]) {
    opened.database.exec("DROP TRIGGER trg_exercises_nonblank_name;");
    opened.database.exec("DROP VIEW fixture_completed_workouts;");
    opened.database.exec("DROP INDEX idx_exercises_name_lookup;");
  }
  return opened;
}

export function initializeRestoreFixture(fixture: RestoreManifestFixture): void {
  initializeDatabase(fixture.adapter as never);
  fixture.connection = new ReadonlyNodeSqliteConnection(fixture.database);
}

export function dropRestoreTables(
  fixture: RestoreManifestFixture,
  tables: readonly string[]
): void {
  fixture.database.exec("PRAGMA foreign_keys = OFF;");
  for (const table of tables) {
    const quotedTable = `"${table.replace(/"/g, '""')}"`;
    fixture.database.exec(`DROP TABLE ${quotedTable};`);
  }
}

export function closeRestoreFixture(fixture: RestoreManifestFixture): void {
  fixture.database.close();
  rmSync(fixture.directory, { force: true, recursive: true });
}

export function databaseDigest(fixture: RestoreManifestFixture): string {
  return createHash("sha256").update(readFileSync(fixture.path)).digest("hex");
}

export function appIdentityRows(fixture: RestoreManifestFixture): unknown {
  return plainRows(
    fixture.database
      .prepare(
        `SELECT 'exercises' AS table_name, id, uid FROM exercises
         UNION ALL SELECT 'workouts', id, uid FROM workouts
         UNION ALL SELECT 'workout_exercises', id, uid FROM workout_exercises
         UNION ALL SELECT 'sets', id, uid FROM sets
         ORDER BY table_name, id;`
      )
      .all()
  );
}

export { PRODUCTION_EXERCISE_FIXTURES };
