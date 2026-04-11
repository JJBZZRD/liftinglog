import { initializeDatabase } from "../../lib/db/bootstrap";

type MockSqlite = {
  execCalls: string[];
  execSync: jest.Mock<void, [string]>;
  prepareSync: jest.Mock;
};

function createMockSqlite(columnMap: Record<string, string[]>): MockSqlite {
  const execCalls: string[] = [];

  return {
    execCalls,
    execSync: jest.fn((sql: string) => {
      execCalls.push(sql);
    }),
    prepareSync: jest.fn((query: string) => ({
      executeSync: jest.fn(() => {
        const pragmaMatch = query.match(/PRAGMA table_info\(([^)]+)\);?/);
        if (pragmaMatch) {
          const table = pragmaMatch[1];
          const columns = columnMap[table] ?? [];
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
});

