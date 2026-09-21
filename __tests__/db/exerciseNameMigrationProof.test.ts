import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  EXERCISE_NAME_MIGRATION_FAILURE_STAGES,
  proveExerciseNameUniquenessRemoval,
  type ExerciseNameMigrationFailureStage,
} from "../helpers/exerciseNameMigrationProof";

const FIXTURE_SQL = readFileSync(
  join(__dirname, "..", "fixtures", "exercise-name-migration", "legacy-populated.sql"),
  "utf8"
);

const DATA_TABLES = [
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

const EXERCISE_REFERENCE_TABLES = [
  "workout_exercises",
  "sets",
  "program_calendar_exercises",
  "pr_events",
  "exercise_formula_overrides",
] as const;

type FixtureDatabase = {
  database: DatabaseSync;
  directory: string;
};

function openFixture(): FixtureDatabase {
  const directory = mkdtempSync(join(tmpdir(), "workoutlog-mvp003a-"));
  const database = new DatabaseSync(join(directory, "legacy.sqlite"));
  database.exec(FIXTURE_SQL);
  return { database, directory };
}

function closeFixture(fixture: FixtureDatabase): void {
  fixture.database.close();
  rmSync(fixture.directory, { recursive: true, force: true });
}

function normalizedRows(rows: unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(rows)) as unknown[];
}

function dataSnapshot(database: DatabaseSync): Record<string, unknown[]> {
  return Object.fromEntries(
    DATA_TABLES.map((table) => [
      table,
      normalizedRows(database.prepare(`SELECT * FROM ${table} ORDER BY rowid;`).all()),
    ])
  );
}

function schemaSnapshot(database: DatabaseSync): unknown[] {
  return normalizedRows(
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

function schemaExceptExercisesTable(database: DatabaseSync): unknown[] {
  return normalizedRows(
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

function exerciseColumnSnapshot(database: DatabaseSync): unknown[] {
  return normalizedRows(database.prepare("PRAGMA table_xinfo('exercises');").all());
}

function foreignKeySnapshot(database: DatabaseSync): Record<string, unknown[]> {
  return Object.fromEntries(
    EXERCISE_REFERENCE_TABLES.map((table) => [
      table,
      normalizedRows(database.prepare(`PRAGMA foreign_key_list('${table}');`).all()),
    ])
  );
}

function foreignKeysEnabled(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA foreign_keys;").get() as { foreign_keys: number };
  return row.foreign_keys;
}

function expectHealthyDatabase(database: DatabaseSync): void {
  expect(database.prepare("PRAGMA foreign_key_check;").all()).toEqual([]);
  expect(database.prepare("PRAGMA integrity_check;").get()).toEqual({ integrity_check: "ok" });
}

function expectLegacyNameUniqueness(database: DatabaseSync): void {
  expect(() =>
    database
      .prepare(
        `INSERT INTO exercises
           (id, uid, name, is_bodyweight, is_pinned)
         VALUES (?, ?, ?, ?, ?);`
      )
      .run(99, "duplicate-name-before-migration", "Bench Press", 0, 0)
  ).toThrow(/UNIQUE constraint failed: exercises\.name/);
}

describe("exercise name uniqueness migration proof", () => {
  it("rebuilds a populated legacy database and preserves every stored relationship", () => {
    const fixture = openFixture();
    const { database } = fixture;

    try {
      expectLegacyNameUniqueness(database);
      const beforeData = dataSnapshot(database);
      const beforeOtherSchema = schemaExceptExercisesTable(database);
      const beforeExerciseColumns = exerciseColumnSnapshot(database);
      const beforeForeignKeys = foreignKeySnapshot(database);

      expect(proveExerciseNameUniquenessRemoval(database)).toEqual({ applied: true });

      expect(dataSnapshot(database)).toEqual(beforeData);
      expect(schemaExceptExercisesTable(database)).toEqual(beforeOtherSchema);
      expect(exerciseColumnSnapshot(database)).toEqual(beforeExerciseColumns);
      expect(foreignKeySnapshot(database)).toEqual(beforeForeignKeys);
      expect(foreignKeysEnabled(database)).toBe(1);
      expectHealthyDatabase(database);

      expect(database.prepare("PRAGMA index_list('exercises');").all()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_exercises_uid", unique: 1, origin: "c" }),
          expect.objectContaining({
            name: "idx_exercises_parent_exercise_id",
            unique: 0,
            origin: "c",
          }),
        ])
      );
      expect(
        (database.prepare("PRAGMA index_list('exercises');").all() as Array<{ origin: string }>).filter(
          (index) => index.origin === "u"
        )
      ).toEqual([]);

      database
        .prepare(
          `INSERT INTO exercises (
             id, uid, name, parent_exercise_id, variation_label, description,
             muscle_group, equipment, is_bodyweight, created_at,
             last_rest_seconds, is_pinned
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
        .run(
          21,
          "exercise-duplicate-display-name-uid",
          "Bench Press",
          null,
          null,
          "same display name, independent identity",
          "chest",
          "machine",
          0,
          1700000000021,
          90,
          0
        );

      expect(
        database.prepare("SELECT id, uid FROM exercises WHERE name = ? ORDER BY id;").all("Bench Press")
      ).toEqual([
        { id: 10, uid: "exercise-parent-uid" },
        { id: 21, uid: "exercise-duplicate-display-name-uid" },
      ]);

      expect(() =>
        database
          .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
          .run(22, "exercise-parent-uid", "Different Name")
      ).toThrow(/UNIQUE constraint failed: exercises\.uid/);
      expect(() =>
        database.prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);").run(
          22,
          "exercise-null-name-uid",
          null
        )
      ).toThrow(/NOT NULL constraint failed: exercises\.name/);
      expect(() => database.prepare("DELETE FROM exercises WHERE id = 11;").run()).toThrow(
        /FOREIGN KEY constraint failed/
      );
      expect(() => database.prepare("INSERT INTO tags (id, name) VALUES (?, ?);").run(2, "strength"))
        .toThrow(/UNIQUE constraint failed: tags\.name/);

      const beforeSecondRunData = dataSnapshot(database);
      const beforeSecondRunSchema = schemaSnapshot(database);
      expect(proveExerciseNameUniquenessRemoval(database)).toEqual({ applied: false });
      expect(dataSnapshot(database)).toEqual(beforeSecondRunData);
      expect(schemaSnapshot(database)).toEqual(beforeSecondRunSchema);
      expectHealthyDatabase(database);
    } finally {
      closeFixture(fixture);
    }
  });

  it.each(EXERCISE_NAME_MIGRATION_FAILURE_STAGES)(
    "rolls back an injected %s failure and restores the usable legacy database",
    (stage: ExerciseNameMigrationFailureStage) => {
      const fixture = openFixture();
      const { database } = fixture;

      try {
        const beforeData = dataSnapshot(database);
        const beforeSchema = schemaSnapshot(database);
        const beforeForeignKeys = foreignKeySnapshot(database);

        expect(() => proveExerciseNameUniquenessRemoval(database, { failAt: stage })).toThrow(
          `Injected exercise-name migration failure at ${stage}`
        );

        expect(dataSnapshot(database)).toEqual(beforeData);
        expect(schemaSnapshot(database)).toEqual(beforeSchema);
        expect(foreignKeySnapshot(database)).toEqual(beforeForeignKeys);
        expect(foreignKeysEnabled(database)).toBe(1);
        expectHealthyDatabase(database);
        expectLegacyNameUniqueness(database);

        database
          .prepare("INSERT INTO exercises (id, uid, name) VALUES (?, ?, ?);")
          .run(30, `post-rollback-${stage}`, `Post rollback ${stage}`);
        expect(database.prepare("SELECT name FROM exercises WHERE id = 30;").get()).toEqual({
          name: `Post rollback ${stage}`,
        });
        database.prepare("DELETE FROM exercises WHERE id = 30;").run();
      } finally {
        closeFixture(fixture);
      }
    }
  );

  it("restores a caller's disabled foreign-key setting after success", () => {
    const fixture = openFixture();
    const { database } = fixture;

    try {
      database.exec("PRAGMA foreign_keys = OFF;");
      expect(foreignKeysEnabled(database)).toBe(0);
      expect(proveExerciseNameUniquenessRemoval(database)).toEqual({ applied: true });
      expect(foreignKeysEnabled(database)).toBe(0);
      expectHealthyDatabase(database);
    } finally {
      closeFixture(fixture);
    }
  });

  it("rejects a pre-normalization historical column shape without changing it", () => {
    const fixture = openFixture();
    const { database } = fixture;

    try {
      database.exec("ALTER TABLE exercises DROP COLUMN is_pinned;");
      const before = schemaSnapshot(database);

      expect(() => proveExerciseNameUniquenessRemoval(database)).toThrow(
        "Unsupported exercises schema: expected the post-bootstrap MVP legacy or target definition"
      );
      expect(schemaSnapshot(database)).toEqual(before);
      expect(foreignKeysEnabled(database)).toBe(1);
      expectHealthyDatabase(database);
    } finally {
      closeFixture(fixture);
    }
  });

  it("fails closed for an unproven unique expression index", () => {
    const fixture = openFixture();
    const { database } = fixture;

    try {
      database.exec("CREATE UNIQUE INDEX idx_exercises_lower_name ON exercises(lower(name));");
      const before = schemaSnapshot(database);

      expect(() => proveExerciseNameUniquenessRemoval(database)).toThrow(
        "Unsupported schema drift: unique index idx_exercises_lower_name is outside the proven exercises index set"
      );
      expect(schemaSnapshot(database)).toEqual(before);
      expect(foreignKeysEnabled(database)).toBe(1);
      expectHealthyDatabase(database);
    } finally {
      closeFixture(fixture);
    }
  });

  it.each([
    [
      "partial UID index",
      "CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid) WHERE uid IS NOT NULL;",
    ],
    [
      "collated descending UID index",
      "CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid COLLATE NOCASE DESC);",
    ],
  ])("fails closed for a same-name %s", (_label, replacementIndexSql) => {
    const fixture = openFixture();
    const { database } = fixture;

    try {
      database.exec("DROP INDEX idx_exercises_uid;");
      database.exec(replacementIndexSql);
      const beforeData = dataSnapshot(database);
      const beforeSchema = schemaSnapshot(database);
      const beforeForeignKeys = foreignKeySnapshot(database);

      expect(() => proveExerciseNameUniquenessRemoval(database)).toThrow(
        "Unsupported schema drift: unique index idx_exercises_uid is outside the proven exercises index set"
      );
      expect(dataSnapshot(database)).toEqual(beforeData);
      expect(schemaSnapshot(database)).toEqual(beforeSchema);
      expect(foreignKeySnapshot(database)).toEqual(beforeForeignKeys);
      expect(foreignKeysEnabled(database)).toBe(1);
      expectHealthyDatabase(database);
    } finally {
      closeFixture(fixture);
    }
  });
});
