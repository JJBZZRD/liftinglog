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

/** A synchronous Expo SQLite boundary backed by Node SQLite for media contracts. */
export function createSetVideoDatabase() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (path: string) => NodeDatabase;
  };
  const database = new DatabaseSync(":memory:");

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
            getAllSync: () => statement.all(...params).map((row) => Object.values(row)),
          };
        },
        finalizeSync() {},
      };
    },
    getFirstSync<T>(sql: string, values?: unknown): T | null {
      return (database.prepare(sql).get(...paramsFrom(values)) as T | undefined) ?? null;
    },
    runSync(sql: string, values?: unknown) {
      const result = database.prepare(sql).run(...paramsFrom(values));
      return {
        changes: result.changes,
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    withTransactionSync(task: () => void) {
      database.exec("BEGIN TRANSACTION;");
      try {
        task();
        database.exec("COMMIT;");
      } catch (error) {
        database.exec("ROLLBACK;");
        throw error;
      }
    },
  };

  return {
    expoDatabase,
    insertSet() {
      const exercise = database
        .prepare("INSERT INTO exercises (name, is_bodyweight, is_pinned) VALUES (?, 0, 0)")
        .run(`Video exercise ${Date.now()}-${Math.random()}`);
      const workout = database
        .prepare("INSERT INTO workouts (started_at) VALUES (?)")
        .run(Date.now());
      const set = database
        .prepare("INSERT INTO sets (workout_id, exercise_id, is_warmup) VALUES (?, ?, 0)")
        .run(Number(workout.lastInsertRowid), Number(exercise.lastInsertRowid));
      return Number(set.lastInsertRowid);
    },
    rows<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
      return database.prepare(sql).all(...params) as T[];
    },
    exec(sql: string) {
      database.exec(sql);
    },
    close() {
      database.close();
    },
  };
}
