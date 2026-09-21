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
