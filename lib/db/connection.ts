import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

export type E1RMFormulaId =
  | "epley"
  | "brzycki"
  | "oconner"
  | "lombardi"
  | "mayhew"
  | "wathan";

export type UnitPreference = "kg" | "lb";

// Single SQLite database for the app
export const sqlite = openDatabaseSync("LiftingLog.db");

// Pragmas
sqlite.execSync("PRAGMA foreign_keys = ON;");
sqlite.execSync("PRAGMA journal_mode = WAL;");
sqlite.execSync("PRAGMA synchronous = NORMAL;");

// Schema bootstrap
sqlite.execSync(`
  -- Core tables
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY NOT NULL,
    e1rm_formula TEXT NOT NULL,
    unit_preference TEXT NOT NULL,
    theme_preference TEXT NOT NULL DEFAULT 'system',
    color_theme TEXT NOT NULL DEFAULT 'default'
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    muscle_group TEXT,
    equipment TEXT,
    is_bodyweight INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER,
    last_rest_seconds INTEGER,
    is_pinned INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS workout_exercises (
    id INTEGER PRIMARY KEY NOT NULL,
    workout_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    order_index INTEGER,
    note TEXT,
    current_weight REAL,
    current_reps INTEGER,
    completed_at INTEGER,
    performed_at INTEGER,
    FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY NOT NULL,
    workout_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    workout_exercise_id INTEGER,
    set_group_id TEXT,
    set_index INTEGER,
    weight_kg REAL,
    reps INTEGER,
    rpe REAL,
    rir REAL,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    superset_group_id TEXT,
    performed_at INTEGER,
    FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT,
    FOREIGN KEY(workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE SET NULL
  );

  -- Programs
  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS program_days (
    id INTEGER PRIMARY KEY NOT NULL,
    program_id INTEGER NOT NULL,
    schedule TEXT NOT NULL,
    day_of_week INTEGER,
    interval_days INTEGER,
    note TEXT,
    FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS program_exercises (
    id INTEGER PRIMARY KEY NOT NULL,
    program_day_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    order_index INTEGER,
    prescription_json TEXT,
    FOREIGN KEY(program_day_id) REFERENCES program_days(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS progressions (
    id INTEGER PRIMARY KEY NOT NULL,
    program_exercise_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    value REAL NOT NULL,
    cadence TEXT NOT NULL,
    cap_kg REAL,
    FOREIGN KEY(program_exercise_id) REFERENCES program_exercises(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS planned_workouts (
    id INTEGER PRIMARY KEY NOT NULL,
    program_id INTEGER NOT NULL,
    program_day_id INTEGER NOT NULL,
    planned_for INTEGER NOT NULL,
    note TEXT,
    FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE CASCADE,
    FOREIGN KEY(program_day_id) REFERENCES program_days(id) ON DELETE CASCADE
  );

  -- Analytics
  CREATE TABLE IF NOT EXISTS pr_events (
    id INTEGER PRIMARY KEY NOT NULL,
    set_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    metric_value REAL NOT NULL,
    occurred_at INTEGER NOT NULL,
    FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
  );

  -- Reserved for future optimization if needed:
  -- CREATE TABLE IF NOT EXISTS best_lifts (
  --   exercise_id INTEGER PRIMARY KEY NOT NULL,
  --   best_1rm_kg REAL,
  --   best_volume_in_session_kg REAL,
  --   best_reps INTEGER,
  --   updated_at INTEGER,
  --   FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  -- );

  -- Tags & media (optional)
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS taggings (
    id INTEGER PRIMARY KEY NOT NULL,
    tag_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY NOT NULL,
    local_uri TEXT NOT NULL,
    asset_id TEXT,
    mime TEXT,
    set_id INTEGER,
    workout_id INTEGER,
    note TEXT,
    created_at INTEGER,
    FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE CASCADE,
    FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE
  );

  -- Per-exercise formula overrides
  CREATE TABLE IF NOT EXISTS exercise_formula_overrides (
    exercise_id INTEGER PRIMARY KEY NOT NULL,
    e1rm_formula TEXT NOT NULL,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_sets_workout_id ON sets(workout_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise_id ON sets(exercise_id);
  CREATE INDEX IF NOT EXISTS idx_sets_performed_at ON sets(performed_at);
  CREATE INDEX IF NOT EXISTS idx_sets_group ON sets(set_group_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise_reps ON sets(exercise_id, reps);
  CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise_id ON sets(workout_exercise_id);
  CREATE INDEX IF NOT EXISTS idx_workout_exercises_order ON workout_exercises(workout_id, order_index);
  CREATE INDEX IF NOT EXISTS idx_pr_events_exercise_time ON pr_events(exercise_id, occurred_at);
  CREATE INDEX IF NOT EXISTS idx_planned_workouts_date ON planned_workouts(planned_for);
`);

// Migrations for existing databases
// Add last_rest_seconds column to exercises table if it doesn't exist
try {
  sqlite.execSync(`ALTER TABLE exercises ADD COLUMN last_rest_seconds INTEGER;`);
} catch {
  // Column already exists, ignore
}

// Add current_weight and current_reps columns to workout_exercises table if they don't exist
try {
  sqlite.execSync(`ALTER TABLE workout_exercises ADD COLUMN current_weight REAL;`);
} catch {
  // Column already exists, ignore
}
try {
  sqlite.execSync(`ALTER TABLE workout_exercises ADD COLUMN current_reps INTEGER;`);
} catch {
  // Column already exists, ignore
}

// Add is_pinned column to exercises table if it doesn't exist
try {
  sqlite.execSync(`ALTER TABLE exercises ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;`);
} catch {
  // Column already exists, ignore
}

// Add theme_preference column to settings table if it doesn't exist
try {
  sqlite.execSync(`ALTER TABLE settings ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system';`);
} catch {
  // Column already exists, ignore
}

// Add color_theme column to settings table if it doesn't exist
try {
  sqlite.execSync(`ALTER TABLE settings ADD COLUMN color_theme TEXT NOT NULL DEFAULT 'default';`);
} catch {
  // Column already exists, ignore
}

// Add completed_at column to workout_exercises table if it doesn't exist
try {
  sqlite.execSync(`ALTER TABLE workout_exercises ADD COLUMN completed_at INTEGER;`);
} catch {
  // Column already exists, ignore
}

// Add performed_at column to workout_exercises table if it doesn't exist
try {
  sqlite.execSync(`ALTER TABLE workout_exercises ADD COLUMN performed_at INTEGER;`);
} catch {
  // Column already exists, ignore
}

// Add asset_id column to media table if it doesn't exist
try {
  sqlite.execSync(`ALTER TABLE media ADD COLUMN asset_id TEXT;`);
} catch {
  // Column already exists, ignore
}

// Add metadata columns to media table for video re-discovery after reinstall
try {
  sqlite.execSync(`ALTER TABLE media ADD COLUMN original_filename TEXT;`);
} catch {
  // Column already exists, ignore
}
try {
  sqlite.execSync(`ALTER TABLE media ADD COLUMN media_created_at INTEGER;`);
} catch {
  // Column already exists, ignore
}
try {
  sqlite.execSync(`ALTER TABLE media ADD COLUMN duration_ms INTEGER;`);
} catch {
  // Column already exists, ignore
}
try {
  sqlite.execSync(`ALTER TABLE media ADD COLUMN album_name TEXT;`);
} catch {
  // Column already exists, ignore
}

// ============================================================
// UID column migrations for merge-based backup import
// ============================================================

// Add uid columns to core tables
const uidTables = ["exercises", "workouts", "workout_exercises", "sets", "pr_events"];
for (const table of uidTables) {
  try {
    sqlite.execSync(`ALTER TABLE ${table} ADD COLUMN uid TEXT;`);
    if (__DEV__) {
      console.log(`[db] Added uid column to ${table}`);
    }
  } catch {
    // Column already exists, ignore
  }
}

// Backfill uid for existing rows (batched to avoid UI freezes)
function backfillUids() {
  const BATCH_SIZE = 300;

  // Simple uid generator for backfill (avoid import cycles at module init)
  function generateUid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    const randomPart2 = Math.random().toString(36).substring(2, 6);
    return `${timestamp}-${randomPart}-${randomPart2}`;
  }

  for (const table of uidTables) {
    try {
      // Count rows needing backfill
      const countStmt = sqlite.prepareSync(`SELECT COUNT(*) as cnt FROM ${table} WHERE uid IS NULL;`);
      let totalNull = 0;
      try {
        const result = countStmt.executeSync([]);
        const rows = result.getAllSync() as Array<{ cnt: number }>;
        totalNull = rows[0]?.cnt ?? 0;
      } finally {
        countStmt.finalizeSync();
      }

      if (totalNull === 0) {
        continue;
      }

      if (__DEV__) {
        console.log(`[db] Backfilling ${totalNull} uid values for ${table}`);
      }

      // Backfill in batches
      let processed = 0;
      while (processed < totalNull) {
        const selectStmt = sqlite.prepareSync(`SELECT id FROM ${table} WHERE uid IS NULL LIMIT ${BATCH_SIZE};`);
        let ids: number[] = [];
        try {
          const result = selectStmt.executeSync([]);
          const rows = result.getAllSync() as Array<{ id: number }>;
          ids = rows.map((r) => r.id);
        } finally {
          selectStmt.finalizeSync();
        }

        if (ids.length === 0) {
          break;
        }

        for (const id of ids) {
          const uid = generateUid();
          sqlite.execSync(`UPDATE ${table} SET uid = '${uid}' WHERE id = ${id};`);
        }

        processed += ids.length;
      }

      if (__DEV__) {
        console.log(`[db] Backfilled ${processed} uid values for ${table}`);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn(`[db] Failed to backfill uid for ${table}:`, error);
      }
    }
  }
}

backfillUids();

// Create unique indexes on uid columns (after backfill)
for (const table of uidTables) {
  try {
    sqlite.execSync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uid ON ${table}(uid);`);
    if (__DEV__) {
      console.log(`[db] Created unique index idx_${table}_uid`);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(`[db] Failed to create unique index for ${table}.uid:`, error);
    }
  }
}

const columnCache = new Map<string, Set<string>>();

function loadTableColumns(table: string): Set<string> | null {
  try {
    const stmt = sqlite.prepareSync(`PRAGMA table_info(${table});`);
    try {
      const result = stmt.executeSync([]);
      const rows = result.getAllSync() as Array<{ name: string }>;
      return new Set(rows.map((row) => row.name));
    } finally {
      stmt.finalizeSync();
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(`[db] Failed to read schema for ${table}:`, error);
    }
    return null;
  }
}

export function hasColumn(table: string, column: string): boolean {
  let columns = columnCache.get(table);
  if (!columns) {
    columns = loadTableColumns(table) ?? new Set<string>();
    columnCache.set(table, columns);
  }
  return columns.has(column);
}

function ensureWorkoutExerciseIndexes() {
  if (hasColumn("workout_exercises", "performed_at")) {
    try {
      sqlite.execSync(`CREATE INDEX IF NOT EXISTS idx_workout_exercises_performed_at ON workout_exercises(performed_at);`);
    } catch (error) {
      if (__DEV__) {
        console.warn("[db] Failed to create idx_workout_exercises_performed_at:", error);
      }
    }
  }

  if (hasColumn("workout_exercises", "completed_at")) {
    try {
      sqlite.execSync(`CREATE INDEX IF NOT EXISTS idx_workout_exercises_completed_at ON workout_exercises(completed_at);`);
    } catch (error) {
      if (__DEV__) {
        console.warn("[db] Failed to create idx_workout_exercises_completed_at:", error);
      }
    }
  }
}

function logWorkoutExerciseColumnStatus() {
  const hasPerformedAt = hasColumn("workout_exercises", "performed_at");
  const hasCompletedAt = hasColumn("workout_exercises", "completed_at");

  if (__DEV__) {
    if (hasPerformedAt) {
      console.log("Migration OK: workout_exercises.performed_at exists");
    } else {
      console.warn("Migration missing: workout_exercises.performed_at not found");
    }

    if (hasCompletedAt) {
      console.log("Migration OK: workout_exercises.completed_at exists");
    } else {
      console.warn("Migration missing: workout_exercises.completed_at not found");
    }
  }
}

ensureWorkoutExerciseIndexes();
logWorkoutExerciseColumnStatus();

export const db = drizzle(sqlite);


