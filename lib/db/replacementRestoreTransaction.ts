import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";
import { newUid } from "../utils/uid";
import { derivePBEventsForExercise } from "./pbDerivation";
import type { AppTable } from "./replacementRestoreContract";
import {
  RESTORE_APP_TABLES,
  validateRestoreSchema,
  type RestoreSchemaConnection,
} from "./restoreSchemaManifest";

export interface ReplacementSqliteConnection {
  execSync(sql: string): void;
  getAllSync<T>(sql: string, params?: SQLiteBindParams): T[];
  runSync(sql: string, params?: SQLiteBindParams): unknown;
}

export type ReplacementTransactionResult = {
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsRebuilt: number;
  readonly untrustedPreCommitMediaUris: readonly string[];
};

export class ReplacementTransactionFailure extends Error {
  constructor(
    readonly kind: "rolled_back" | "commit_unknown" | "rollback_unknown",
    message: string,
    readonly primaryCause: unknown,
    readonly rollbackCause?: unknown
  ) {
    super(message);
    this.name = "ReplacementTransactionFailure";
  }
}

export class ReplacementCandidateDetachFailure extends Error {
  constructor(
    readonly primaryCause: unknown,
    readonly detachCause: unknown
  ) {
    super("Restore candidate detachment could not be confirmed.");
    this.name = "ReplacementCandidateDetachFailure";
  }
}

const DELETE_ORDER: readonly AppTable[] = [
  "media",
  "pr_events",
  "program_calendar_sets",
  "program_calendar_exercises",
  "program_calendar",
  "taggings",
  "exercise_formula_overrides",
  "sets",
  "workout_exercises",
  "psl_programs",
  "tags",
  "workouts",
  "exercises",
  "user_checkins",
  "settings",
];

const INSERT_ORDER = [
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
  "tags",
  "taggings",
  "media",
  "exercise_formula_overrides",
] as const satisfies readonly Exclude<AppTable, "pr_events">[];

const TABLE_COLUMNS = {
  settings: [
    "id",
    "e1rm_formula",
    "unit_preference",
    "theme_preference",
    "color_theme",
    "show_all_tab_body_part_grouping",
  ],
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
  workouts: ["id", "uid", "started_at", "completed_at", "note"],
  workout_exercises: [
    "id",
    "uid",
    "workout_id",
    "exercise_id",
    "order_index",
    "note",
    "current_weight",
    "current_reps",
    "completed_at",
    "performed_at",
  ],
  sets: [
    "id",
    "uid",
    "workout_id",
    "exercise_id",
    "workout_exercise_id",
    "set_group_id",
    "set_index",
    "weight_kg",
    "reps",
    "rpe",
    "rir",
    "is_warmup",
    "note",
    "superset_group_id",
    "performed_at",
  ],
  psl_programs: [
    "id",
    "name",
    "description",
    "psl_source",
    "compiled_hash",
    "percent_intensity_config_json",
    "is_active",
    "start_date",
    "end_date",
    "units",
    "created_at",
    "updated_at",
  ],
  program_calendar: [
    "id",
    "program_id",
    "psl_session_id",
    "session_name",
    "date_iso",
    "sequence",
    "status",
    "completed_at",
    "completion_override_exercise_ids_json",
  ],
  program_calendar_exercises: [
    "id",
    "calendar_id",
    "exercise_name",
    "exercise_id",
    "order_index",
    "prescribed_sets_json",
    "status",
    "workout_exercise_id",
  ],
  program_calendar_sets: [
    "id",
    "calendar_exercise_id",
    "set_index",
    "prescribed_reps",
    "prescribed_intensity_json",
    "prescribed_role",
    "actual_weight",
    "actual_reps",
    "actual_rpe",
    "is_user_added",
    "is_logged",
    "set_id",
    "logged_at",
  ],
  tags: ["id", "name"],
  taggings: ["id", "tag_id", "target_type", "target_id"],
  media: [
    "id",
    "local_uri",
    "asset_id",
    "mime",
    "set_id",
    "workout_id",
    "note",
    "created_at",
    "original_filename",
    "media_created_at",
    "duration_ms",
    "album_name",
  ],
  exercise_formula_overrides: ["exercise_id", "e1rm_formula"],
} as const satisfies Record<Exclude<AppTable, "pr_events">, readonly string[]>;

const UID_TABLES = [
  "user_checkins",
  "exercises",
  "workouts",
  "workout_exercises",
  "sets",
] as const;

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe compiled restore identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function firstValue(row: Record<string, unknown> | undefined): unknown {
  return row ? Object.values(row)[0] : undefined;
}

function requireIntegrity(
  sqlite: ReplacementSqliteConnection,
  database: "main" | "restore_candidate"
): void {
  const rows = sqlite.getAllSync<Record<string, unknown>>(
    `PRAGMA ${database}.integrity_check;`
  );
  if (rows.length !== 1 || firstValue(rows[0]) !== "ok") {
    throw new Error(`${database} database integrity check failed.`);
  }
}

function requireForeignKeys(
  sqlite: ReplacementSqliteConnection,
  database: "main" | "restore_candidate"
): void {
  const rows = sqlite.getAllSync<Record<string, unknown>>(
    `PRAGMA ${database}.foreign_key_check;`
  );
  if (rows.length !== 0) {
    throw new Error(`${database} database foreign-key check failed.`);
  }
}

function requireSoftLinks(
  sqlite: ReplacementSqliteConnection,
  prefix: "main" | "restore_candidate"
): void {
  const rows = sqlite.getAllSync<{ id: number }>(
    `SELECT pce.id
       FROM ${prefix}.program_calendar_exercises AS pce
      WHERE pce.workout_exercise_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM ${prefix}.workout_exercises AS we
           WHERE we.id = pce.workout_exercise_id
        );`
  );
  if (rows.length !== 0) {
    throw new Error(`${prefix} database contains stale program workout-exercise links.`);
  }
}

function readCount(
  sqlite: ReplacementSqliteConnection,
  prefix: "main" | "restore_candidate",
  table: AppTable
): number {
  const rows = sqlite.getAllSync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${prefix}.${quoteIdentifier(table)};`
  );
  const count = rows.length === 1 ? Number(rows[0].count) : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Could not count ${prefix}.${table}.`);
  }
  return count;
}

export function readReplacementTableCounts(
  sqlite: ReplacementSqliteConnection,
  prefix: "main" | "restore_candidate" = "main"
): Record<AppTable, number> {
  return Object.fromEntries(
    RESTORE_APP_TABLES.map((table) => [table, readCount(sqlite, prefix, table)])
  ) as Record<AppTable, number>;
}

function requireCounts(
  actual: Record<AppTable, number>,
  expected: Record<AppTable, number>,
  includeDerivedPBs: boolean
): void {
  for (const table of RESTORE_APP_TABLES) {
    if (!includeDerivedPBs && table === "pr_events") continue;
    if (actual[table] !== expected[table]) {
      throw new Error(
        `Restore count mismatch for ${table}: expected ${expected[table]}, received ${actual[table]}.`
      );
    }
  }
}

function requireDataInvariants(
  sqlite: ReplacementSqliteConnection,
  prefix: "main" | "restore_candidate"
): void {
  const settings = readCount(sqlite, prefix, "settings");
  if (settings > 1) {
    throw new Error(`${prefix} database contains more than one settings row.`);
  }
  for (const table of UID_TABLES) {
    const rows = sqlite.getAllSync<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM ${prefix}.${quoteIdentifier(table)}
        WHERE uid IS NULL OR uid = '';`
    );
    if (rows.length !== 1 || Number(rows[0].count) !== 0) {
      throw new Error(`${prefix}.${table} contains a missing UID after migration.`);
    }
  }
}

function attachedSchemaConnection(
  sqlite: ReplacementSqliteConnection
): RestoreSchemaConnection {
  return {
    getAllSync<T>(sql: string): T[] {
      let scoped = sql.replace(
        /\bFROM\s+sqlite_schema\b/gi,
        "FROM restore_candidate.sqlite_schema"
      );
      scoped = scoped.replace(
        /^PRAGMA\s+(table_xinfo|foreign_key_list|index_list|index_xinfo)\((.*)\);$/i,
        "PRAGMA restore_candidate.$1($2);"
      );
      return sqlite.getAllSync<T>(scoped);
    },
  };
}

function requireForeignKeysEnabled(sqlite: ReplacementSqliteConnection): void {
  const rows = sqlite.getAllSync<Record<string, unknown>>("PRAGMA foreign_keys;");
  if (rows.length !== 1 || Number(firstValue(rows[0])) !== 1) {
    throw new Error("Replacement restore requires foreign keys on the live connection.");
  }
}

function sqliteFilenameFromFileUri(uri: string): string {
  let path = decodeURIComponent(uri.slice("file://".length));
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  return path;
}

function copyCandidateTable(
  sqlite: ReplacementSqliteConnection,
  table: (typeof INSERT_ORDER)[number]
): void {
  const columns = TABLE_COLUMNS[table];
  const destination = columns.map(quoteIdentifier).join(", ");
  const source = columns
    .map((column) =>
      table === "media" && column === "local_uri"
        ? "''"
        : `restore_candidate.${quoteIdentifier(table)}.${quoteIdentifier(column)}`
    )
    .join(", ");
  sqlite.execSync(
    `INSERT INTO main.${quoteIdentifier(table)} (${destination})\n` +
      `SELECT ${source} FROM restore_candidate.${quoteIdentifier(table)};`
  );
}

type PBSetRow = {
  readonly id: number;
  readonly exercise_id: number;
  readonly weight_kg: number | null;
  readonly reps: number | null;
  readonly performed_at: number | null;
};

function rebuildPBEvents(sqlite: ReplacementSqliteConnection): number {
  const rows = sqlite.getAllSync<PBSetRow>(
    `SELECT id, exercise_id, weight_kg, reps, performed_at
       FROM main.sets
      ORDER BY exercise_id, performed_at, id;`
  );
  let inserted = 0;
  let index = 0;
  while (index < rows.length) {
    const exerciseId = rows[index].exercise_id;
    const exerciseRows: PBSetRow[] = [];
    while (index < rows.length && rows[index].exercise_id === exerciseId) {
      exerciseRows.push(rows[index]);
      index += 1;
    }
    const events = derivePBEventsForExercise(
      exerciseId,
      exerciseRows.map((row) => ({
        id: row.id,
        weightKg: row.weight_kg,
        reps: row.reps,
        performedAt: row.performed_at,
      }))
    );
    for (const event of events) {
      sqlite.runSync(
        `INSERT INTO main.pr_events
           (uid, set_id, exercise_id, type, metric_value, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
          newUid(),
          event.setId,
          event.exerciseId,
          event.type,
          event.metricValue,
          event.occurredAt,
        ]
      );
      inserted += 1;
    }
  }
  return inserted;
}

function requireClearedMediaUris(sqlite: ReplacementSqliteConnection): void {
  const rows = sqlite.getAllSync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM main.media WHERE local_uri <> '';"
  );
  if (rows.length !== 1 || Number(rows[0].count) !== 0) {
    throw new Error("Restored media rows must have cleared local URIs.");
  }
}

export type ValidatedReplacementSession = {
  replace(): ReplacementTransactionResult;
  detach(): void;
};

export function openValidatedReplacementSession(options: {
  sqlite: SQLiteDatabase | ReplacementSqliteConnection;
  candidatePath: string;
  candidateExists: () => boolean;
  expectedRowsByTable: Record<AppTable, number>;
}): ValidatedReplacementSession {
  const sqlite = options.sqlite as ReplacementSqliteConnection;
  requireForeignKeysEnabled(sqlite);
  sqlite.execSync("PRAGMA trusted_schema=OFF;");
  validateRestoreSchema(sqlite, "current");
  if (!options.candidateExists()) {
    throw new Error("The sealed restore candidate is missing before attach.");
  }

  let attached = false;
  try {
    // ATTACH can take effect before the adapter reports an exception. Keep it
    // inside the ownership guard so every uncertain invocation attempts detach.
    sqlite.runSync("ATTACH DATABASE ? AS restore_candidate;", [
      sqliteFilenameFromFileUri(options.candidatePath),
    ]);
    attached = true;
    validateRestoreSchema(attachedSchemaConnection(sqlite), "current");
    requireIntegrity(sqlite, "restore_candidate");
    requireForeignKeys(sqlite, "restore_candidate");
    requireSoftLinks(sqlite, "restore_candidate");
    requireDataInvariants(sqlite, "restore_candidate");
    requireCounts(
      readReplacementTableCounts(sqlite, "restore_candidate"),
      options.expectedRowsByTable,
      true
    );
  } catch (error) {
    try {
      sqlite.execSync("DETACH DATABASE restore_candidate;");
      attached = false;
    } catch (detachError) {
      throw new ReplacementCandidateDetachFailure(error, detachError);
    }
    throw error;
  }

  return {
    replace(): ReplacementTransactionResult {
      let transactionOpen = false;
      let commitInvoked = false;
      try {
        // These are opaque stored strings, not proven app-managed paths. The
        // later media owner must strictly classify each current candidate at
        // consumption time before any filesystem action.
        const untrustedPreCommitMediaUris = sqlite
          .getAllSync<{ local_uri: string }>(
            "SELECT local_uri FROM main.media WHERE local_uri <> '' ORDER BY id;"
          )
          .map((row) => row.local_uri)
          .filter((uri): uri is string => typeof uri === "string");
        transactionOpen = true;
        // Set the guard before invoking BEGIN: a native exception may be raised
        // after SQLite has already opened the transaction.
        sqlite.execSync("BEGIN IMMEDIATE;");
        for (const table of DELETE_ORDER) {
          sqlite.execSync(`DELETE FROM main.${quoteIdentifier(table)};`);
        }
        for (const table of INSERT_ORDER) {
          copyCandidateTable(sqlite, table);
        }
        const pbEventsRebuilt = rebuildPBEvents(sqlite);
        requireForeignKeys(sqlite, "main");
        requireSoftLinks(sqlite, "main");
        requireDataInvariants(sqlite, "main");
        requireClearedMediaUris(sqlite);
        const rowsByTable = readReplacementTableCounts(sqlite, "main");
        const expectedAfterRestore = {
          ...options.expectedRowsByTable,
          pr_events: pbEventsRebuilt,
        };
        requireCounts(rowsByTable, expectedAfterRestore, true);
        commitInvoked = true;
        sqlite.execSync("COMMIT;");
        transactionOpen = false;
        return {
          rowsByTable,
          pbEventsRebuilt,
          untrustedPreCommitMediaUris,
        };
      } catch (primaryError) {
        let rollbackError: unknown;
        if (transactionOpen || commitInvoked) {
          try {
            sqlite.execSync("ROLLBACK;");
            transactionOpen = false;
          } catch (error) {
            rollbackError = error;
          }
        }
        if (commitInvoked) {
          throw new ReplacementTransactionFailure(
            "commit_unknown",
            "Replacement restore COMMIT returned an uncertain result.",
            primaryError,
            rollbackError
          );
        }
        if (rollbackError !== undefined) {
          throw new ReplacementTransactionFailure(
            "rollback_unknown",
            "Replacement restore rollback could not be proven.",
            primaryError,
            rollbackError
          );
        }
        throw new ReplacementTransactionFailure(
          "rolled_back",
          "Replacement restore transaction rolled back.",
          primaryError
        );
      }
    },
    detach(): void {
      if (!attached) return;
      sqlite.execSync("DETACH DATABASE restore_candidate;");
      attached = false;
    },
  };
}
