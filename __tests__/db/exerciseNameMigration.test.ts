import { initializeDatabase } from "../../lib/db/bootstrap";
import {
  DATA_TABLES,
  EXERCISE_MIGRATION_FAILURE_STAGES,
  EXERCISE_UID_BACKFILL_FAILURE_STAGES,
  PRODUCTION_EXERCISE_FIXTURES,
  closeProductionFixture,
  dataSnapshot,
  databaseSnapshot,
  foreignKeysEnabled,
  openFreshDatabase,
  openProductionFixture,
  reopenFixture,
  type DatabaseSnapshot,
} from "../helpers/exerciseNameMigrationDatabase";

const EXPECTED_COLUMNS: Record<string, string[]> = {
  "current-canonical": [
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
  "uid-era-fresh-then-variations": [
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
  "pre-uid-direct-upgrade": [
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
  "pre-uid-sequential-upgrade": [
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
  "0923b8d-fresh-direct-upgrade": [
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
};

function withoutExerciseTable(catalog: unknown[]): unknown[] {
  return catalog.filter((entry) => {
    const row = entry as { name: string; type: string };
    return !(row.type === "table" && row.name === "exercises");
  });
}

function exerciseColumnNames(snapshot: DatabaseSnapshot): string[] {
  return (snapshot.exerciseColumns as Array<{ name: string }>).map((column) => column.name);
}

function projectToOriginalData(
  original: Record<string, unknown[]>,
  current: Record<string, unknown[]>
): Record<string, unknown[]> {
  const exerciseKeys = Object.keys(original.exercises[0] as Record<string, unknown>);
  return {
    ...current,
    exercises: current.exercises.map((value) =>
      Object.fromEntries(
        exerciseKeys.map((key) => [key, (value as Record<string, unknown>)[key]])
      )
    ),
  };
}

function expectHealthyDatabase(database: import("node:sqlite").DatabaseSync): void {
  expect(database.prepare("PRAGMA foreign_key_check;").all()).toEqual([]);
  expect(database.prepare("PRAGMA integrity_check;").get()).toEqual({ integrity_check: "ok" });
}

function expectDuplicateDisplayNames(database: import("node:sqlite").DatabaseSync): void {
  let nextId =
    ((database.prepare("SELECT MAX(id) AS id FROM exercises;").get() as { id: number | null }).id ??
      0) + 1;
  const existingCount = (
    database.prepare("SELECT COUNT(*) AS count FROM exercises WHERE name = ?;").get("Bench Press") as {
      count: number;
    }
  ).count;
  if (existingCount === 0) {
    database
      .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
      .run(nextId, `duplicate-display-seed-${nextId}`, "Bench Press");
    nextId += 1;
  }
  database
    .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
    .run(nextId, `duplicate-display-${nextId}`, "Bench Press");

  expect(
    database.prepare("SELECT id FROM exercises WHERE name = ? ORDER BY id;").all("Bench Press")
  ).toHaveLength(2);
  expect(() =>
    database
      .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
      .run(nextId + 1, `duplicate-display-${nextId}`, "Different Name")
  ).toThrow(/UNIQUE constraint failed: exercises\.uid/);
  expect(() =>
    database
      .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
      .run(nextId + 1, `null-name-${nextId}`, null)
  ).toThrow(/NOT NULL constraint failed: exercises\.name/);
}

function expectTargetIndexes(database: import("node:sqlite").DatabaseSync): void {
  const indexes = database.prepare("PRAGMA index_list('exercises');").all() as Array<{
    name: string;
    origin: string;
    unique: number;
  }>;
  expect(indexes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "idx_exercises_uid", origin: "c", unique: 1 }),
      expect.objectContaining({
        name: "idx_exercises_parent_exercise_id",
        origin: "c",
        unique: 0,
      }),
    ])
  );
  expect(indexes.filter((index) => index.origin === "u")).toEqual([]);
}

function expectLegacyNameUniqueness(database: import("node:sqlite").DatabaseSync): void {
  expect(() =>
    database
      .prepare("INSERT INTO exercises (id, name) VALUES (?, ?);")
      .run(99, "Bench Press")
  ).toThrow(/UNIQUE constraint failed: exercises\.name/);
}

describe("MVP-003B production exercise-name migration", () => {
  it.each(PRODUCTION_EXERCISE_FIXTURES)(
    "migrates and preserves the populated $name fingerprint",
    (fixtureDefinition) => {
      const fixture = openProductionFixture(fixtureDefinition);
      const initialExerciseUids =
        fixtureDefinition.initialExerciseUids === "missing"
          ? null
          : fixture.database.prepare("SELECT id, uid FROM exercises ORDER BY id;").all();

      try {
        expectLegacyNameUniqueness(fixture.database);
        initializeDatabase(fixture.adapter as never);

        const beforeMigration = fixture.adapter.beforeMigration;
        const afterMigration = fixture.adapter.afterMigration;
        expect(beforeMigration).not.toBeNull();
        expect(afterMigration).not.toBeNull();
        if (!beforeMigration || !afterMigration) {
          throw new Error("Expected production migration snapshots");
        }

        expect(exerciseColumnNames(beforeMigration)).toEqual(
          EXPECTED_COLUMNS[fixtureDefinition.shape]
        );
        expect(afterMigration.data).toEqual(beforeMigration.data);
        expect(afterMigration.exerciseColumns).toEqual(beforeMigration.exerciseColumns);
        expect(afterMigration.foreignKeys).toEqual(beforeMigration.foreignKeys);
        expect(withoutExerciseTable(afterMigration.catalog)).toEqual(
          withoutExerciseTable(beforeMigration.catalog)
        );
        expect(dataSnapshot(fixture.database)).toEqual(afterMigration.data);

        const migratedExerciseUids = fixture.database
          .prepare("SELECT id, uid FROM exercises ORDER BY id;")
          .all();
        if (fixtureDefinition.initialExerciseUids === "stable") {
          expect(migratedExerciseUids).toEqual(initialExerciseUids);
        } else {
          if (fixtureDefinition.initialExerciseUids === "null") {
            expect(initialExerciseUids).toEqual([
              { id: 10, uid: null },
              { id: 11, uid: null },
              { id: 20, uid: null },
            ]);
          } else {
            expect(initialExerciseUids).toBeNull();
          }
          expect(migratedExerciseUids).toEqual([
            expect.objectContaining({ id: 10, uid: expect.any(String) }),
            expect.objectContaining({ id: 11, uid: expect.any(String) }),
            expect.objectContaining({ id: 20, uid: expect.any(String) }),
          ]);
          expect(new Set(migratedExerciseUids.map((row) => (row as { uid: string }).uid)).size).toBe(
            3
          );
        }

        expect(
          fixture.database.prepare("SELECT parent_exercise_id FROM exercises WHERE id = 11;").get()
        ).toEqual({
          parent_exercise_id:
            fixtureDefinition.shape === "0923b8d-fresh-direct-upgrade" ? null : 10,
        });
        expectTargetIndexes(fixture.database);
        expect(foreignKeysEnabled(fixture.database)).toBe(1);
        expectHealthyDatabase(fixture.database);
        expectDuplicateDisplayNames(fixture.database);
        expect(() => fixture.database.prepare("DELETE FROM exercises WHERE id = 11;").run()).toThrow(
          /FOREIGN KEY constraint failed/
        );
        expect(() =>
          fixture.database.prepare("INSERT INTO tags (id, name) VALUES (?, ?);").run(2, "strength")
        ).toThrow(/UNIQUE constraint failed: tags\.name/);
        expect(
          fixture.database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table';").get()
        ).toEqual({ count: DATA_TABLES.length });
      } finally {
        closeProductionFixture(fixture);
      }
    }
  );

  it("creates the target definition on a fresh database", () => {
    const fixture = openFreshDatabase();
    try {
      initializeDatabase(fixture.adapter as never);
      expect(fixture.adapter.beforeMigration).toBeNull();
      expectTargetIndexes(fixture.database);
      expectHealthyDatabase(fixture.database);
      expectDuplicateDisplayNames(fixture.database);
      const tableNames = fixture.database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tableNames).toEqual(expect.arrayContaining([...DATA_TABLES]));
    } finally {
      closeProductionFixture(fixture);
    }
  });

  it("is an idempotent no-op after a close and reopen", () => {
    const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[4]);
    try {
      initializeDatabase(fixture.adapter as never);
      expectDuplicateDisplayNames(fixture.database);
      const beforeReopen = databaseSnapshot(fixture.database);

      reopenFixture(fixture);
      initializeDatabase(fixture.adapter as never);

      expect(fixture.adapter.beforeMigration).toBeNull();
      expect(databaseSnapshot(fixture.database)).toEqual(beforeReopen);
      expect(foreignKeysEnabled(fixture.database)).toBe(1);
      fixture.database
        .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
        .run(100, "post-reopen-write", "Bench Press");
      expectHealthyDatabase(fixture.database);
    } finally {
      closeProductionFixture(fixture);
    }
  });

  it.each(EXERCISE_UID_BACKFILL_FAILURE_STAGES)(
    "fails visibly on an exercise UID %s fault, then retries and reopens safely",
    (stage) => {
      const fixture = openProductionFixture(
        PRODUCTION_EXERCISE_FIXTURES[4],
        undefined,
        stage
      );
      const before = databaseSnapshot(fixture.database);

      try {
        expect(() => initializeDatabase(fixture.adapter as never)).toThrow(
          /Failed to backfill required exercise UIDs/
        );
        expect(fixture.adapter.beforeMigration).toBeNull();
        expect(fixture.adapter.execLog.join("\n")).not.toContain("__mvp003b_exercises_new");
        expectLegacyNameUniqueness(fixture.database);
        expect(foreignKeysEnabled(fixture.database)).toBe(1);
        expectHealthyDatabase(fixture.database);

        const afterFailure = databaseSnapshot(fixture.database);
        expect(projectToOriginalData(before.data, afterFailure.data)).toEqual(before.data);
        expect(afterFailure.foreignKeys).toEqual(before.foreignKeys);
        const assignedAfterFailure = fixture.database
          .prepare("SELECT id, uid FROM exercises WHERE uid IS NOT NULL ORDER BY id;")
          .all() as Array<{ id: number; uid: string }>;
        expect(assignedAfterFailure).toHaveLength(stage === "partial-batch" ? 1 : 0);

        initializeDatabase(fixture.adapter as never);
        const assignedAfterRetry = fixture.database
          .prepare("SELECT id, uid FROM exercises ORDER BY id;")
          .all() as Array<{ id: number; uid: string }>;
        expect(assignedAfterRetry).toHaveLength(3);
        expect(assignedAfterRetry.every((row) => typeof row.uid === "string")).toBe(true);
        expect(new Set(assignedAfterRetry.map((row) => row.uid))).toHaveProperty("size", 3);
        for (const assigned of assignedAfterFailure) {
          expect(assignedAfterRetry).toContainEqual(assigned);
        }
        expect(projectToOriginalData(before.data, dataSnapshot(fixture.database))).toEqual(
          before.data
        );
        expectTargetIndexes(fixture.database);
        expectHealthyDatabase(fixture.database);

        const beforeReopen = databaseSnapshot(fixture.database);
        reopenFixture(fixture);
        initializeDatabase(fixture.adapter as never);
        expect(databaseSnapshot(fixture.database)).toEqual(beforeReopen);
        expectDuplicateDisplayNames(fixture.database);
        expectHealthyDatabase(fixture.database);
      } finally {
        closeProductionFixture(fixture);
      }
    }
  );

  it.each(EXERCISE_MIGRATION_FAILURE_STAGES)(
    "rolls back an injected %s failure to the exact pre-rebuild state",
    (stage) => {
      const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[0], stage);
      try {
        expect(() => initializeDatabase(fixture.adapter as never)).toThrow(
          `Injected production exercise migration failure at ${stage}`
        );
        expect(fixture.adapter.beforeMigration).not.toBeNull();
        expect(databaseSnapshot(fixture.database)).toEqual(fixture.adapter.beforeMigration);
        expect(fixture.adapter.afterMigration).toBeNull();
        expect(foreignKeysEnabled(fixture.database)).toBe(1);
        expectLegacyNameUniqueness(fixture.database);
        expectHealthyDatabase(fixture.database);
        fixture.database
          .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
          .run(98, `post-rollback-${stage}`, `Post rollback ${stage}`);
        fixture.database.prepare("DELETE FROM exercises WHERE id = 98;").run();
      } finally {
        closeProductionFixture(fixture);
      }
    }
  );

  it("rejects unknown exercise columns before destructive migration SQL", () => {
    const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[0]);
    try {
      fixture.database.exec("ALTER TABLE exercises ADD COLUMN unsupported_metric REAL;");
      const before = databaseSnapshot(fixture.database);
      expect(() => initializeDatabase(fixture.adapter as never)).toThrow(
        "Unsupported exercises schema: expected an evidenced MVP-003B legacy or target definition"
      );
      expect(databaseSnapshot(fixture.database)).toEqual(before);
      expect(fixture.adapter.execLog.join("\n")).not.toContain("__mvp003b_exercises_new");
    } finally {
      closeProductionFixture(fixture);
    }
  });

  it("rejects unknown table constraints before destructive migration SQL", () => {
    const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[1]);
    try {
      fixture.database.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN IMMEDIATE;
        CREATE TABLE __constraint_drift (
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
          is_pinned INTEGER NOT NULL DEFAULT 0,
          CHECK(length(name) > 0)
        );
        INSERT INTO __constraint_drift
        SELECT id, uid, name, parent_exercise_id, variation_label, description,
               muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned
        FROM exercises;
        DROP TABLE exercises;
        ALTER TABLE __constraint_drift RENAME TO exercises;
        CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid);
        CREATE INDEX idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);
        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
      const before = databaseSnapshot(fixture.database);
      expect(() => initializeDatabase(fixture.adapter as never)).toThrow(
        "Unsupported exercises schema: expected an evidenced MVP-003B legacy or target definition"
      );
      expect(databaseSnapshot(fixture.database)).toEqual(before);
      expect(fixture.adapter.execLog.join("\n")).not.toContain("__mvp003b_exercises_new");
    } finally {
      closeProductionFixture(fixture);
    }
  });

  it.each([
    [
      "partial UID index",
      "DROP INDEX idx_exercises_uid; CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid) WHERE uid IS NOT NULL;",
    ],
    [
      "collated descending UID index",
      "DROP INDEX idx_exercises_uid; CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid COLLATE NOCASE DESC);",
    ],
    [
      "descending parent index",
      "DROP INDEX idx_exercises_parent_exercise_id; CREATE INDEX idx_exercises_parent_exercise_id ON exercises(parent_exercise_id DESC);",
    ],
    [
      "unknown unique expression index",
      "CREATE UNIQUE INDEX idx_exercises_lower_name ON exercises(lower(name));",
    ],
  ])("rejects %s drift without changing data or schema", (_label, driftSql) => {
    const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[1]);
    try {
      fixture.database.exec(driftSql);
      const before = databaseSnapshot(fixture.database);
      expect(() => initializeDatabase(fixture.adapter as never)).toThrow(
        /Unsupported exercises index drift/
      );
      expect(databaseSnapshot(fixture.database)).toEqual(before);
      expect(fixture.adapter.execLog.join("\n")).not.toContain("__mvp003b_exercises_new");
      expect(foreignKeysEnabled(fixture.database)).toBe(1);
    } finally {
      closeProductionFixture(fixture);
    }
  });

  it("rejects duplicate UID drift before rebuilding when the historical index is absent", () => {
    const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[2]);
    try {
      fixture.database.exec(`
        UPDATE exercises
        SET uid = CASE WHEN id IN (10, 11) THEN 'duplicate-uid' ELSE 'stable-third-uid' END;
      `);
      const before = databaseSnapshot(fixture.database);
      expect(() => initializeDatabase(fixture.adapter as never)).toThrow(
        "Unsupported exercises UID drift: duplicate uid duplicate-uid"
      );
      expect(databaseSnapshot(fixture.database)).toEqual(before);
      expect(fixture.adapter.execLog.join("\n")).not.toContain("__mvp003b_exercises_new");
    } finally {
      closeProductionFixture(fixture);
    }
  });

  it("fails closed for a dependent view before disabling foreign keys", () => {
    const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[0]);
    try {
      fixture.database.exec(
        "CREATE VIEW dependent_exercise_names AS SELECT id, name FROM exercises;"
      );
      const before = databaseSnapshot(fixture.database);
      expect(() => initializeDatabase(fixture.adapter as never)).toThrow(
        "Unsupported exercises schema: dependent view(s) require a separate proven migration: dependent_exercise_names"
      );
      expect(databaseSnapshot(fixture.database)).toEqual(before);
      expect(fixture.adapter.beforeMigration).toBeNull();
      expect(fixture.adapter.execLog.join("\n")).not.toContain("__mvp003b_exercises_new");
      expect(foreignKeysEnabled(fixture.database)).toBe(1);
    } finally {
      closeProductionFixture(fixture);
    }
  });

  it("restores a caller's disabled foreign-key setting after a successful rebuild", () => {
    const fixture = openProductionFixture(PRODUCTION_EXERCISE_FIXTURES[0]);
    try {
      fixture.database.exec("PRAGMA foreign_keys = OFF;");
      initializeDatabase(fixture.adapter as never);
      expect(foreignKeysEnabled(fixture.database)).toBe(0);
      expectTargetIndexes(fixture.database);
      expectHealthyDatabase(fixture.database);
    } finally {
      closeProductionFixture(fixture);
    }
  });
});
