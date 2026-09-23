type SqlStatement = {
  all: (...params: unknown[]) => Record<string, unknown>[];
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
};

type NodeDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqlStatement;
  close: () => void;
};

function paramsFrom(values: unknown): unknown[] {
  if (Array.isArray(values)) return values;
  if (values === undefined || values === null) return [];
  return Object.values(values as Record<string, unknown>);
}

/**
 * Explicitly installs a real SQLite/Drizzle pair for legacy integration suites.
 * Call this only after the suite has installed its SQLite mock and prepared any
 * deliberate pre-migration schema shape.
 */
export function initializeTestDatabaseBindings(database: { expoDatabase: unknown }): void {
  // Keep these requires inside the call so a suite that resets Jest modules
  // publishes into its current isolated registry.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeDatabase } = require("../../lib/db/bootstrap") as typeof import("../../lib/db/bootstrap");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/expo-sqlite") as typeof import("drizzle-orm/expo-sqlite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { publishDatabaseBindings } = require("../../lib/db/connection") as typeof import("../../lib/db/connection");

  const sqlite = database.expoDatabase as {
    execSync: (sql: string) => void;
  };
  sqlite.execSync("PRAGMA foreign_keys = ON;");
  sqlite.execSync("PRAGMA journal_mode = WAL;");
  sqlite.execSync("PRAGMA synchronous = NORMAL;");
  initializeDatabase(database.expoDatabase as never);
  publishDatabaseBindings(
    database.expoDatabase as never,
    drizzle(database.expoDatabase as never)
  );
}

/**
 * Minimal Expo SQLite synchronous boundary backed by Node's built-in SQLite.
 * Production Drizzle queries execute unchanged against this adapter.
 */
export function createManualLoggingDatabase(path = ":memory:") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (path: string) => NodeDatabase;
  };
  const database = new DatabaseSync(path);

  const expoDatabase = {
    execSync(sql: string) {
      database.exec(sql);
    },
    prepareSync(sql: string) {
      const statement = database.prepare(sql);
      const isReadQuery = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql);
      return {
        executeSync(values: unknown) {
          const params = paramsFrom(values);
          const result = isReadQuery ? null : statement.run(...params);
          return {
            changes: result?.changes ?? 0,
            lastInsertRowId: Number(result?.lastInsertRowid ?? 0),
            getAllSync: () => statement.all(...params),
            getFirstSync: () => statement.get(...params),
          };
        },
        executeForRawResultSync(values: unknown) {
          const params = paramsFrom(values);
          return {
            getAllSync: () =>
              statement.all(...params).map((row) => Object.values(row)),
          };
        },
        finalizeSync() {},
      };
    },
  };

  return {
    expoDatabase,
    insertExercise(name: string, muscleGroup = "Chest") {
      const result = database
        .prepare(
          "INSERT INTO exercises (uid, name, muscle_group, is_bodyweight, is_pinned) VALUES (?, ?, ?, 0, 0)"
        )
        .run(`test-${name}`, name, muscleGroup);
      return Number(result.lastInsertRowid);
    },
    rows<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
      return database.prepare(sql).all(...params) as T[];
    },
    close() {
      database.close();
    },
  };
}

/** Historical fixtures may contain unfinished entries in reconciled, archived envelopes. */
export function createArchivedWorkoutFixture(
  database: { expoDatabase: { prepareSync: (sql: string) => { executeSync: (params: unknown) => { lastInsertRowId: number }; finalizeSync: () => void } } },
  data: { started_at: number; completed_at?: number; note?: string | null }
): number {
  const statement = database.expoDatabase.prepareSync(
    "INSERT INTO workouts(started_at, completed_at, note) VALUES (?, ?, ?)"
  );
  try {
    return statement.executeSync([data.started_at, data.completed_at ?? data.started_at, data.note ?? null]).lastInsertRowId;
  } finally {
    statement.finalizeSync();
  }
}
