import { initializeDatabase } from "../../lib/db/bootstrap";

type MockSqlite = {
  execCalls: string[];
  execSync: jest.Mock<void, [string]>;
  prepareSync: jest.Mock;
};

function createMockSqlite(columnMap: Record<string, string[]>): MockSqlite {
  const execCalls: string[] = [];
  const liveColumns = new Map(
    Object.entries(columnMap).map(([table, columns]) => [table, new Set(columns)])
  );

  return {
    execCalls,
    execSync: jest.fn((sql: string) => {
      if (
        sql.includes(
          "CREATE INDEX IF NOT EXISTS idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);"
        ) &&
        !liveColumns.get("exercises")?.has("parent_exercise_id")
      ) {
        throw new Error("no such column: parent_exercise_id");
      }

      const addExercisesParentColumnMatch = sql.match(
        /ALTER TABLE exercises ADD COLUMN parent_exercise_id INTEGER;/
      );
      if (addExercisesParentColumnMatch) {
        if (!liveColumns.has("exercises")) {
          liveColumns.set("exercises", new Set());
        }
        liveColumns.get("exercises")!.add("parent_exercise_id");
      }

      const addExercisesVariationLabelMatch = sql.match(
        /ALTER TABLE exercises ADD COLUMN variation_label TEXT;/
      );
      if (addExercisesVariationLabelMatch) {
        if (!liveColumns.has("exercises")) {
          liveColumns.set("exercises", new Set());
        }
        liveColumns.get("exercises")!.add("variation_label");
      }

      execCalls.push(sql);
    }),
    prepareSync: jest.fn((query: string) => ({
      executeSync: jest.fn(() => {
        const pragmaMatch = query.match(/PRAGMA table_info\(([^)]+)\);?/);
        if (pragmaMatch) {
          const table = pragmaMatch[1];
          const columns = [...(liveColumns.get(table) ?? new Set<string>())];
          return {
            getAllSync: () => columns.map((name) => ({ name })),
          };
        }

        if (query.includes("SELECT COUNT(*) as cnt FROM")) {
          return {
            getAllSync: () => [{ cnt: 0 }],
          };
        }

        if (query.includes("WHERE uid IS NULL LIMIT")) {
          return {
            getAllSync: () => [],
          };
        }

        return {
          getAllSync: () => [],
        };
      }),
      finalizeSync: jest.fn(),
    })),
  };
}

describe("lib/db/bootstrap", () => {
  it("creates user_checkins with fatigue_score for new databases", () => {
    const sqlite = createMockSqlite({
      user_checkins: [
        "id",
        "uid",
        "recorded_at",
        "context",
        "bodyweight_kg",
        "waist_cm",
        "sleep_start_at",
        "sleep_end_at",
        "sleep_hours",
        "resting_hr_bpm",
        "fatigue_score",
        "soreness_score",
        "stress_score",
        "steps",
        "note",
        "source",
      ],
      workout_exercises: ["id", "performed_at", "completed_at"],
    });

    initializeDatabase(sqlite as never);

    expect(sqlite.execCalls[0]).toContain("fatigue_score INTEGER");
    expect(sqlite.execCalls[0]).not.toContain("readiness_score INTEGER");
  });

  it("repairs legacy readiness_score tables into fatigue_score tables", () => {
    const sqlite = createMockSqlite({
      user_checkins: [
        "id",
        "uid",
        "recorded_at",
        "context",
        "bodyweight_kg",
        "waist_cm",
        "sleep_start_at",
        "sleep_end_at",
        "sleep_hours",
        "resting_hr_bpm",
        "readiness_score",
        "soreness_score",
        "stress_score",
        "steps",
        "note",
        "source",
      ],
      workout_exercises: ["id", "performed_at", "completed_at"],
    });

    initializeDatabase(sqlite as never);

    const execLog = sqlite.execCalls.join("\n");
    expect(execLog).toContain("ALTER TABLE user_checkins RENAME TO user_checkins_legacy_fatigue_repair;");
    expect(execLog).toContain("CREATE TABLE user_checkins (");
    expect(execLog).toContain("fatigue_score INTEGER");
    expect(execLog).toMatch(/INSERT INTO user_checkins[\s\S]*NULL[\s\S]*FROM user_checkins_legacy_fatigue_repair;/);
  });

  it("creates exercise variation columns and parent index", () => {
    const sqlite = createMockSqlite({
      exercises: [
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
      workout_exercises: ["id", "performed_at", "completed_at"],
    });

    initializeDatabase(sqlite as never);

    const execLog = sqlite.execCalls.join("\n");
    expect(execLog).toContain("parent_exercise_id INTEGER");
    expect(execLog).toContain("variation_label TEXT");
    expect(execLog).toContain(
      "CREATE INDEX IF NOT EXISTS idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);"
    );
  });

  it("migrates legacy exercises before creating the parent variation index", () => {
    const sqlite = createMockSqlite({
      user_checkins: [
        "id",
        "uid",
        "recorded_at",
        "context",
        "bodyweight_kg",
        "waist_cm",
        "sleep_start_at",
        "sleep_end_at",
        "sleep_hours",
        "resting_hr_bpm",
        "fatigue_score",
        "soreness_score",
        "stress_score",
        "steps",
        "note",
        "source",
      ],
      exercises: [
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
      ],
      workout_exercises: ["id", "performed_at", "completed_at"],
    });

    expect(() => initializeDatabase(sqlite as never)).not.toThrow();

    const parentColumnMigrationIndex = sqlite.execCalls.findIndex((call) =>
      call.includes("ALTER TABLE exercises ADD COLUMN parent_exercise_id INTEGER;")
    );
    const parentIndexCreationIndex = sqlite.execCalls.findIndex((call) =>
      call.includes(
        "CREATE INDEX IF NOT EXISTS idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);"
      )
    );

    expect(parentColumnMigrationIndex).toBeGreaterThanOrEqual(0);
    expect(parentIndexCreationIndex).toBeGreaterThan(parentColumnMigrationIndex);
  });
});
