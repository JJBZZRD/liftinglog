import { DatabaseSync } from "node:sqlite";
import {
  RESTORE_APP_TABLES,
  RESTORE_SCHEMA_MANIFEST_ID,
  RestoreSchemaValidationError,
  validateRestoreSchema,
} from "../../lib/db/restoreSchemaManifest";
import {
  appIdentityRows,
  closeRestoreFixture,
  databaseDigest,
  dropRestoreTables,
  initializeRestoreFixture,
  openExerciseRestoreFixture,
  openHistoricalRestoreFixture,
  PRODUCTION_EXERCISE_FIXTURES,
  ReadonlyNodeSqliteConnection,
  type RestoreManifestFixture,
} from "../helpers/restoreSchemaManifestDatabase";

const OPTIONAL_APP_TABLES = RESTORE_APP_TABLES.filter(
  (table) => !["exercises", "workouts", "workout_exercises", "sets"].includes(table)
);

const E9_PRESENT_OPTIONAL_TABLES = [
  "settings",
  "pr_events",
  "tags",
  "taggings",
  "media",
  "exercise_formula_overrides",
] as const;

const CANONICAL_OPTIONAL_OMISSION_CASES = PRODUCTION_EXERCISE_FIXTURES.flatMap(
  (productionFixture) =>
    OPTIONAL_APP_TABLES.map((table) => ({ productionFixture, table }))
);

function omissionClosure(table: string): readonly string[] {
  switch (table) {
    case "psl_programs":
      return [
        "program_calendar_sets",
        "program_calendar_exercises",
        "program_calendar",
        "psl_programs",
      ];
    case "program_calendar":
      return ["program_calendar_sets", "program_calendar_exercises", "program_calendar"];
    case "program_calendar_exercises":
      return ["program_calendar_sets", "program_calendar_exercises"];
    case "tags":
      return ["taggings", "tags"];
    default:
      return [table];
  }
}

function withFixture(
  open: () => RestoreManifestFixture,
  run: (fixture: RestoreManifestFixture) => void
): void {
  const fixture = open();
  try {
    run(fixture);
  } finally {
    closeRestoreFixture(fixture);
  }
}

function expectUnsupported(
  action: () => unknown,
  expected: Partial<Pick<RestoreSchemaValidationError, "objectName" | "objectType" | "phase">> = {}
): RestoreSchemaValidationError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(RestoreSchemaValidationError);
    const validationError = error as RestoreSchemaValidationError;
    expect(validationError.code).toBe("unsupported_schema");
    expect(validationError.details.length).toBeGreaterThan(0);
    expect(validationError).toMatchObject(expected);
    return validationError;
  }
  throw new Error("Expected unsupported restore schema");
}

function recreateSettings(database: DatabaseSync, body: string): void {
  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("ALTER TABLE settings RENAME TO __settings_before_drift;");
  database.exec(`CREATE TABLE settings (${body});`);
  database.exec("DROP TABLE __settings_before_drift;");
}

function recreateMediaWithForeignKeyDrift(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("ALTER TABLE media RENAME TO __media_before_drift;");
  database.exec(`
    CREATE TABLE media (
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
      FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE SET NULL,
      FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );
  `);
  database.exec("DROP TABLE __media_before_drift;");
}

describe("restore schema manifests", () => {
  test("exports one versioned 15-table replacement contract", () => {
    expect(RESTORE_SCHEMA_MANIFEST_ID).toBe("replacement-restore-schema-v1");
    expect(RESTORE_APP_TABLES).toEqual([
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
    ]);
  });

  test.each(PRODUCTION_EXERCISE_FIXTURES)(
    "$name validates before and after production bootstrap",
    (productionFixture) => {
      withFixture(() => openExerciseRestoreFixture(productionFixture), (fixture) => {
        const beforeDigest = databaseDigest(fixture);
        const source = validateRestoreSchema(fixture.connection, "source");
        expect(source).toEqual({
          manifestId: RESTORE_SCHEMA_MANIFEST_ID,
          missingOptionalTables: [],
          phase: "source",
          tables: RESTORE_APP_TABLES,
        });
        expect(databaseDigest(fixture)).toBe(beforeDigest);
        expect(fixture.connection.queries.length).toBeGreaterThan(0);

        const identityBefore =
          productionFixture.initialExerciseUids === "stable"
            ? appIdentityRows(fixture)
            : null;
        initializeRestoreFixture(fixture);
        const current = validateRestoreSchema(fixture.connection, "current");
        expect(current).toEqual({
          manifestId: RESTORE_SCHEMA_MANIFEST_ID,
          missingOptionalTables: [],
          phase: "current",
          tables: RESTORE_APP_TABLES,
        });
        expect(validateRestoreSchema(fixture.connection, "source").tables).toEqual(
          RESTORE_APP_TABLES
        );
        if (productionFixture.initialExerciseUids === "stable") {
          expect(appIdentityRows(fixture)).toEqual(identityBefore);
        }
      });
    }
  );

  test("the e9ee8ed historical DDL validates and migrates to its evidenced current output", () => {
    withFixture(openHistoricalRestoreFixture, (fixture) => {
      const source = validateRestoreSchema(fixture.connection, "source");
      expect(source.tables).toEqual([
        "settings",
        "exercises",
        "workouts",
        "workout_exercises",
        "sets",
        "pr_events",
        "tags",
        "taggings",
        "media",
        "exercise_formula_overrides",
      ]);
      expect(source.missingOptionalTables).toEqual([
        "user_checkins",
        "psl_programs",
        "program_calendar",
        "program_calendar_exercises",
        "program_calendar_sets",
      ]);
      initializeRestoreFixture(fixture);
      expect(validateRestoreSchema(fixture.connection, "current").tables).toEqual(
        RESTORE_APP_TABLES
      );
      expect(validateRestoreSchema(fixture.connection, "source").tables).toEqual(
        RESTORE_APP_TABLES
      );
    });
  });

  test("the e9ee8ed fixture retains the exact pinned column and index boundary", () => {
    withFixture(openHistoricalRestoreFixture, (fixture) => {
      const columns = fixture.database
        .prepare("PRAGMA table_xinfo('workout_exercises');")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(columns).toEqual([
        "id",
        "workout_id",
        "exercise_id",
        "order_index",
        "note",
        "current_weight",
        "current_reps",
      ]);

      const indexes = fixture.database
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL ORDER BY name;"
        )
        .all()
        .map((row) => (row as { name: string }).name);
      expect(indexes).toEqual([
        "idx_planned_workouts_date",
        "idx_pr_events_exercise_time",
        "idx_sets_exercise_id",
        "idx_sets_exercise_reps",
        "idx_sets_group",
        "idx_sets_performed_at",
        "idx_sets_workout_id",
        "idx_workout_exercises_order",
      ]);
    });
  });

  test.each(CANONICAL_OPTIONAL_OMISSION_CASES)(
    "$productionFixture.name source omission of $table is closed under bootstrap",
    ({ productionFixture, table }) => {
      withFixture(() => openExerciseRestoreFixture(productionFixture), (fixture) => {
        dropRestoreTables(fixture, omissionClosure(table));
        expect(validateRestoreSchema(fixture.connection, "source").missingOptionalTables).toContain(
          table
        );
        initializeRestoreFixture(fixture);
        expect(validateRestoreSchema(fixture.connection, "current").tables).toEqual(
          RESTORE_APP_TABLES
        );
        expect(validateRestoreSchema(fixture.connection, "source").tables).toEqual(
          RESTORE_APP_TABLES
        );
      });
    }
  );

  test.each(E9_PRESENT_OPTIONAL_TABLES)(
    "e9ee8ed source omission of %s is closed under bootstrap",
    (table) => {
      withFixture(openHistoricalRestoreFixture, (fixture) => {
        dropRestoreTables(fixture, [table]);
        expect(validateRestoreSchema(fixture.connection, "source").missingOptionalTables).toContain(
          table
        );
        initializeRestoreFixture(fixture);
        expect(validateRestoreSchema(fixture.connection, "current").tables).toEqual(
          RESTORE_APP_TABLES
        );
        expect(validateRestoreSchema(fixture.connection, "source").tables).toEqual(
          RESTORE_APP_TABLES
        );
      });
    }
  );

  test.each(OPTIONAL_APP_TABLES)(
    "e9ee8ed migrated source omission of %s is closed under a second bootstrap",
    (table) => {
      withFixture(openHistoricalRestoreFixture, (fixture) => {
        initializeRestoreFixture(fixture);
        validateRestoreSchema(fixture.connection, "current");
        dropRestoreTables(fixture, omissionClosure(table));
        expect(validateRestoreSchema(fixture.connection, "source").missingOptionalTables).toContain(
          table
        );
        initializeRestoreFixture(fixture);
        validateRestoreSchema(fixture.connection, "current");
        validateRestoreSchema(fixture.connection, "source");
      });
    }
  );

  test.each([
    { tables: [] },
    { tables: ["settings"] },
    { tables: ["pr_events"] },
    { tables: ["media"] },
    { tables: ["settings", "pr_events"] },
    { tables: ["settings", "media"] },
    { tables: ["pr_events", "media"] },
    { tables: ["settings", "pr_events", "media"] },
  ] as const)(
    "e9ee8ed optional variant combination %# is closed under bootstrap",
    ({ tables }) => {
      withFixture(openHistoricalRestoreFixture, (fixture) => {
        dropRestoreTables(fixture, tables);
        validateRestoreSchema(fixture.connection, "source");
        initializeRestoreFixture(fixture);
        validateRestoreSchema(fixture.connection, "current");
        validateRestoreSchema(fixture.connection, "source");
      });
    }
  );

  test("all policy-optional tables may be absent and bootstrap creates them empty", () => {
    withFixture(() => openExerciseRestoreFixture(PRODUCTION_EXERCISE_FIXTURES[0]), (fixture) => {
      const dropOrder = [
        "exercise_formula_overrides",
        "media",
        "taggings",
        "tags",
        "pr_events",
        "program_calendar_sets",
        "program_calendar_exercises",
        "program_calendar",
        "psl_programs",
        "user_checkins",
        "settings",
      ];
      dropRestoreTables(fixture, dropOrder);
      const source = validateRestoreSchema(fixture.connection, "source");
      expect(source.tables).toEqual(["exercises", "workouts", "workout_exercises", "sets"]);
      expect(source.missingOptionalTables).toEqual(
        OPTIONAL_APP_TABLES
      );
      initializeRestoreFixture(fixture);
      validateRestoreSchema(fixture.connection, "current");
      validateRestoreSchema(fixture.connection, "source");
      for (const table of source.missingOptionalTables) {
        const count = fixture.database.prepare(`SELECT COUNT(*) AS count FROM ${table};`).get() as {
          count: number;
        };
        expect(count.count).toBe(0);
      }
    });
  });

  test("a missing core source table fails closed", () => {
    withFixture(() => openExerciseRestoreFixture(PRODUCTION_EXERCISE_FIXTURES[0]), (fixture) => {
      fixture.database.exec("PRAGMA foreign_keys = OFF; DROP TABLE sets;");
      expectUnsupported(() => validateRestoreSchema(fixture.connection, "source"), {
        objectName: "sets",
        objectType: "table",
        phase: "source",
      });
    });
  });

  test("an obsolete program table is accepted only with its evidenced definition", () => {
    withFixture(openHistoricalRestoreFixture, (fixture) => {
      fixture.database.exec("ALTER TABLE programs ADD COLUMN future_policy TEXT;");
      expectUnsupported(() => validateRestoreSchema(fixture.connection, "source"), {
        objectName: "programs",
        objectType: "table",
        phase: "source",
      });
    });
  });

  test.each([
    {
      label: "unknown column",
      mutate: (database: DatabaseSync) => database.exec("ALTER TABLE sets ADD COLUMN future_metric REAL;"),
      expected: { objectName: "sets", objectType: "table" as const },
    },
    {
      label: "unknown index",
      mutate: (database: DatabaseSync) => database.exec("CREATE INDEX future_sets_note ON sets(note);"),
      expected: { objectName: "future_sets_note", objectType: "index" as const },
    },
    {
      label: "missing index",
      mutate: (database: DatabaseSync) => database.exec("DROP INDEX idx_sets_group;"),
      expected: { objectName: "idx_sets_group", objectType: "index" as const },
    },
    {
      label: "partial descending index",
      mutate: (database: DatabaseSync) =>
        database.exec(
          "DROP INDEX idx_sets_group; CREATE INDEX idx_sets_group ON sets(set_group_id DESC) WHERE set_group_id IS NOT NULL;"
        ),
      expected: { objectName: "idx_sets_group", objectType: "index" as const },
    },
    {
      label: "column order",
      mutate: (database: DatabaseSync) =>
        recreateSettings(
          database,
          `id INTEGER PRIMARY KEY NOT NULL,
           unit_preference TEXT NOT NULL DEFAULT 'kg',
           e1rm_formula TEXT NOT NULL DEFAULT 'epley',
           theme_preference TEXT NOT NULL DEFAULT 'system',
           color_theme TEXT NOT NULL DEFAULT 'default',
           show_all_tab_body_part_grouping INTEGER NOT NULL DEFAULT 1`
        ),
      expected: { objectName: "settings", objectType: "table" as const },
    },
    {
      label: "check constraint",
      mutate: (database: DatabaseSync) =>
        recreateSettings(
          database,
          `id INTEGER PRIMARY KEY NOT NULL,
           e1rm_formula TEXT NOT NULL DEFAULT 'epley',
           unit_preference TEXT NOT NULL DEFAULT 'kg',
           theme_preference TEXT NOT NULL DEFAULT 'system',
           color_theme TEXT NOT NULL DEFAULT 'default',
           show_all_tab_body_part_grouping INTEGER NOT NULL DEFAULT 1,
           CHECK(length(e1rm_formula) > 0)`
        ),
      expected: { objectName: "settings", objectType: "table" as const },
    },
    {
      label: "quoted default value",
      mutate: (database: DatabaseSync) =>
        recreateSettings(
          database,
          `id INTEGER PRIMARY KEY NOT NULL,
           e1rm_formula TEXT NOT NULL DEFAULT 'epley',
           unit_preference TEXT NOT NULL DEFAULT 'kg',
           theme_preference TEXT NOT NULL DEFAULT 'SYSTEM',
           color_theme TEXT NOT NULL DEFAULT 'default',
           show_all_tab_body_part_grouping INTEGER NOT NULL DEFAULT 1`
        ),
      expected: { objectName: "settings", objectType: "table" as const },
    },
    {
      label: "foreign key action",
      mutate: recreateMediaWithForeignKeyDrift,
      expected: { objectName: "media", objectType: "table" as const },
    },
    {
      label: "unknown table",
      mutate: (database: DatabaseSync) => database.exec("CREATE TABLE future_data (id INTEGER);"),
      expected: { objectName: "future_data", objectType: "table" as const },
    },
    {
      label: "trigger",
      mutate: (database: DatabaseSync) =>
        database.exec("CREATE TRIGGER future_trigger AFTER INSERT ON sets BEGIN SELECT 1; END;"),
      expected: { objectName: "future_trigger", objectType: "trigger" as const },
    },
    {
      label: "view",
      mutate: (database: DatabaseSync) => database.exec("CREATE VIEW future_view AS SELECT * FROM sets;"),
      expected: { objectName: "future_view", objectType: "view" as const },
    },
    {
      label: "unexpected SQLite internal table",
      mutate: (database: DatabaseSync) =>
        database.exec(
          "CREATE TABLE transient_autoincrement (id INTEGER PRIMARY KEY AUTOINCREMENT); DROP TABLE transient_autoincrement;"
        ),
      expected: { objectName: "sqlite_sequence", objectType: "table" as const },
    },
  ])("$label drift fails closed", ({ mutate, expected }) => {
    withFixture(() => openExerciseRestoreFixture(PRODUCTION_EXERCISE_FIXTURES[0]), (fixture) => {
      initializeRestoreFixture(fixture);
      mutate(fixture.database);
      expectUnsupported(() => validateRestoreSchema(fixture.connection, "current"), {
        phase: "current",
        ...expected,
      });
    });
  });

  test("a host adapter with only generic getAllSync is sufficient", () => {
    withFixture(() => openExerciseRestoreFixture(PRODUCTION_EXERCISE_FIXTURES[0]), (fixture) => {
      const connection = new ReadonlyNodeSqliteConnection(fixture.database);
      expect(validateRestoreSchema(connection, "source").manifestId).toBe(
        RESTORE_SCHEMA_MANIFEST_ID
      );
    });
  });
});
