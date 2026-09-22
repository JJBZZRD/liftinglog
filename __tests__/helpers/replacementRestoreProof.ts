import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backup,
  DatabaseSync,
  type BackupProgressInfo,
  type SQLInputValue,
  type StatementSync,
} from "node:sqlite";
import { initializeDatabase } from "../../lib/db/bootstrap";

export const APP_TABLES = [
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

export type AppTable = (typeof APP_TABLES)[number];

const REQUIRED_LEGACY_TABLES = new Set<AppTable>([
  "exercises",
  "workouts",
  "workout_exercises",
  "sets",
]);

const KNOWN_OBSOLETE_TABLES = new Set([
  "planned_workouts",
  "progressions",
  "program_exercises",
  "program_days",
  "programs",
]);

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

const INSERT_ORDER: readonly Exclude<AppTable, "pr_events">[] = [
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
];

export const SUPPORTED_CURRENT_EXERCISE_COLUMN_ORDERS = [
  [
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
  [
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
  [
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
  [
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
  [
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
] as const;

export function isSupportedCurrentExerciseColumnOrder(
  columns: readonly string[]
): boolean {
  return SUPPORTED_CURRENT_EXERCISE_COLUMN_ORDERS.some(
    (supported) =>
      supported.length === columns.length &&
      supported.every((column, index) => column === columns[index])
  );
}

const FIXTURE_DIRECTORY = join(
  __dirname,
  "..",
  "fixtures",
  "replacement-restore"
);

type SqlStatementResult = {
  getAllSync: () => unknown[];
};

type CatalogRow = {
  name: string;
  sql: string;
  tbl_name: string;
  type: string;
};

type TableInfoRow = {
  name: string;
};

export type PreparedCandidate = {
  counts: Record<AppTable, number>;
  directory: string;
  hash: string;
  path: string;
};

export type ReplacementFixturePair = {
  candidatePath: string;
  directory: string;
  livePath: string;
};

export type RestoreFault =
  | "after-live-delete"
  | "after-candidate-copy"
  | "before-commit"
  | "after-commit-before-detach";

export type GalleryProofCandidate = {
  albumName: string | null;
  assetId: string;
  durationMs: number | null;
  filename: string | null;
  mediaCreatedAt: number | null;
};

export type GalleryProofMetadata = {
  albumName: string | null;
  assetId: string | null;
  durationMs: number | null;
  originalFilename: string | null;
  mediaCreatedAt: number | null;
};

export type MediaProofRow = {
  album_name: string | null;
  asset_id: string | null;
  duration_ms: number | null;
  id: number;
  local_uri: string;
  media_created_at: number | null;
  original_filename: string | null;
};

export type ReplacementProofResult = {
  media: {
    errors: string[];
    resolved: number;
    total: number;
    unresolved: number;
  };
  pbEventsRebuilt: number;
  rowsByTable: Record<AppTable, number>;
  status: "restored";
  warnings: string[];
};

export type CancelledProofResult = {
  liveDatabaseChanged: false;
  status: "cancelled";
};

export type ScheduledRestoreGateDecision =
  | {
      action: "allow_normal_use";
      liveDatabaseChanged: false;
      normalUseBlocked: false;
    }
  | {
      action: "safe_discard_and_reprepare";
      liveDatabaseChanged: false;
      normalUseBlocked: true;
    }
  | {
      action: "await_cold_process";
      liveDatabaseChanged: false | "unknown";
      normalUseBlocked: true;
    }
  | {
      action: "apply_at_startup";
      liveDatabaseChanged: false | "unknown";
      normalUseBlocked: true;
    }
  | {
      action: "retry_committed_cleanup";
      liveDatabaseChanged: true;
      normalUseBlocked: true;
    }
  | {
      action: "block_ambiguous_state" | "block_invalid_process_identity";
      liveDatabaseChanged: "unknown";
      normalUseBlocked: true;
    };

export type PendingRestoreProofState =
  | "attempting"
  | "rolled_back_unchanged"
  | "scheduled";

type ReplaceOptions = {
  abortMediaReconciliation?: boolean;
  cancelBeforeCommit?: boolean;
  failAt?: RestoreFault;
  reconcileMedia?: (rows: MediaProofRow[]) => number;
};

export function decideScheduledRestoreGate(options: {
  candidateValidation?: "invalid" | "valid";
  committedInCurrentProcess?: boolean;
  currentNativeProcessToken?: string | null;
  latestAttemptNativeProcessToken?: string | null;
  manifestVersion?: number;
  pendingManifestPresent?: boolean;
  pendingState?: string | null;
  scheduledFromNativeProcessToken?: string;
}): ScheduledRestoreGateDecision {
  const hasPendingManifest =
    options.pendingManifestPresent === true ||
    options.pendingState !== undefined ||
    options.scheduledFromNativeProcessToken !== undefined;
  if (!hasPendingManifest) {
    return {
      action: "allow_normal_use",
      liveDatabaseChanged: false,
      normalUseBlocked: false,
    };
  }

  if (
    options.manifestVersion !== 1 ||
    !options.pendingState ||
    !["attempting", "rolled_back_unchanged", "scheduled"].includes(
      options.pendingState
    )
  ) {
    return {
      action: "block_ambiguous_state",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    };
  }
  const pendingState = options.pendingState as PendingRestoreProofState;
  const tokenPattern =
    /^process-v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !options.currentNativeProcessToken ||
    !tokenPattern.test(options.currentNativeProcessToken) ||
    !options.scheduledFromNativeProcessToken ||
    !tokenPattern.test(options.scheduledFromNativeProcessToken) ||
    (pendingState === "scheduled" &&
      options.latestAttemptNativeProcessToken !== undefined) ||
    (pendingState !== "scheduled" &&
      (!options.latestAttemptNativeProcessToken ||
        !tokenPattern.test(options.latestAttemptNativeProcessToken) ||
        options.latestAttemptNativeProcessToken ===
          options.scheduledFromNativeProcessToken))
  ) {
    return {
      action: "block_invalid_process_identity",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    };
  }

  if (options.committedInCurrentProcess) {
    if (
      options.latestAttemptNativeProcessToken !==
      options.currentNativeProcessToken
    ) {
      return {
        action: "block_ambiguous_state",
        liveDatabaseChanged: "unknown",
        normalUseBlocked: true,
      };
    }
    return {
      action: "retry_committed_cleanup",
      liveDatabaseChanged: true,
      normalUseBlocked: true,
    };
  }

  if (
    options.scheduledFromNativeProcessToken ===
      options.currentNativeProcessToken ||
    options.latestAttemptNativeProcessToken ===
      options.currentNativeProcessToken
  ) {
    return {
      action: "await_cold_process",
      liveDatabaseChanged:
        pendingState === "attempting" ? "unknown" : false,
      normalUseBlocked: true,
    };
  }

  if (options.candidateValidation === "invalid") {
    if (
      pendingState === "scheduled" ||
      pendingState === "rolled_back_unchanged"
    ) {
      return {
        action: "safe_discard_and_reprepare",
        liveDatabaseChanged: false,
        normalUseBlocked: true,
      };
    }
    return {
      action: "block_ambiguous_state",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    };
  }

  return {
    action: "apply_at_startup",
    liveDatabaseChanged:
      pendingState === "attempting" ? "unknown" : false,
    normalUseBlocked: true,
  };
}

export function resolveScheduleAbort(options: {
  abortObserved: boolean;
  manifestRenameCommitted: boolean;
}):
  | { liveDatabaseChanged: false; status: "cancelled" }
  | { liveDatabaseChanged: false; status: "restart_required" } {
  if (options.manifestRenameCommitted) {
    return { liveDatabaseChanged: false, status: "restart_required" };
  }
  return { liveDatabaseChanged: false, status: "cancelled" };
}

export function resolveRollbackProofState(options: {
  baselineState: PendingRestoreProofState;
  rollbackSucceeded: boolean;
}): {
  liveDatabaseChanged: false | "unknown";
  pendingState: PendingRestoreProofState;
  recoveryTokenAllowed: boolean;
} {
  if (
    options.rollbackSucceeded &&
    (options.baselineState === "scheduled" ||
      options.baselineState === "rolled_back_unchanged")
  ) {
    return {
      liveDatabaseChanged: false,
      pendingState: "rolled_back_unchanged",
      recoveryTokenAllowed: true,
    };
  }
  return {
    liveDatabaseChanged: "unknown",
    pendingState: "attempting",
    recoveryTokenAllowed: false,
  };
}

function plainRows<T>(rows: T[]): T[] {
  return JSON.parse(JSON.stringify(rows)) as T[];
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function paramsFrom(values: unknown): SQLInputValue[] {
  if (Array.isArray(values)) return values as SQLInputValue[];
  if (values === undefined || values === null) return [];
  return Object.values(values as Record<string, SQLInputValue>);
}

function isQuery(sql: string): boolean {
  return /^\s*(?:SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(sql);
}

class ProofExpoSqliteAdapter {
  constructor(readonly database: DatabaseSync) {}

  execSync(sql: string): void {
    this.database.exec(sql);
  }

  prepareSync(sql: string) {
    const statement: StatementSync = this.database.prepare(sql);
    return {
      executeSync: (values: unknown = []): SqlStatementResult => {
        const params = paramsFrom(values);
        const rows = isQuery(sql)
          ? plainRows(statement.all(...params))
          : [];
        if (!isQuery(sql)) {
          statement.run(...params);
        }
        return { getAllSync: () => rows };
      },
      finalizeSync: () => undefined,
    };
  }
}

function initializeNodeDatabase(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = ON;");
  initializeDatabase(new ProofExpoSqliteAdapter(database) as never);
}

function createCurrentDatabase(path: string, fixtureName: string): void {
  const database = new DatabaseSync(path);
  try {
    initializeNodeDatabase(database);
    database.exec(readFileSync(join(FIXTURE_DIRECTORY, fixtureName), "utf8"));
  } finally {
    database.close();
  }
}

export function createReplacementFixturePair(): ReplacementFixturePair {
  const directory = mkdtempSync(join(tmpdir(), "workoutlog-mvp006a-pair-"));
  const candidatePath = join(directory, "candidate.db");
  const livePath = join(directory, "live.db");
  createCurrentDatabase(candidatePath, "candidate.sql");
  createCurrentDatabase(livePath, "live-after-merge.sql");
  return { candidatePath, directory, livePath };
}

export function closeReplacementFixturePair(pair: ReplacementFixturePair): void {
  rmSync(pair.directory, { force: true, recursive: true });
}

function catalogRows(database: DatabaseSync): CatalogRow[] {
  return plainRows(
    database
      .prepare(
        `SELECT type, name, tbl_name, sql
         FROM sqlite_schema
         WHERE sql IS NOT NULL
           AND name NOT LIKE 'sqlite_%'
         ORDER BY type, name;`
      )
      .all() as CatalogRow[]
  );
}

function normalizedCatalog(database: DatabaseSync): CatalogRow[] {
  return catalogRows(database).map((row) => ({
    ...row,
    sql: row.sql.replace(/\s+/g, " ").trim().toLowerCase(),
  }));
}

function assertSafePreMigrationCatalog(database: DatabaseSync): void {
  // Host-proof boundary: production still needs a frozen historical DDL manifest.
  const catalog = catalogRows(database);
  const untrusted = catalog.filter(
    (row) => row.type === "trigger" || row.type === "view"
  );
  if (untrusted.length > 0) {
    throw new Error(
      `Untrusted schema objects are not accepted: ${untrusted
        .map((row) => `${row.type}:${row.name}`)
        .join(", ")}`
    );
  }

  const tables = new Set(
    catalog.filter((row) => row.type === "table").map((row) => row.name)
  );
  const unknownTables = [...tables].filter(
    (table) =>
      !APP_TABLES.includes(table as AppTable) &&
      !KNOWN_OBSOLETE_TABLES.has(table)
  );
  if (unknownTables.length > 0) {
    throw new Error(`Unknown backup table(s): ${unknownTables.join(", ")}`);
  }

  const missingRequired = [...REQUIRED_LEGACY_TABLES].filter(
    (table) => !tables.has(table)
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `Required backup table(s) missing: ${missingRequired.join(", ")}`
    );
  }
}

function expectedCurrentCatalog(): CatalogRow[] {
  // Generated from today's bootstrap for mechanism testing; not a versioned manifest.
  const database = new DatabaseSync(":memory:");
  try {
    initializeNodeDatabase(database);
    return normalizedCatalog(database);
  } finally {
    database.close();
  }
}

function assertCurrentCatalog(database: DatabaseSync): void {
  const actual = normalizedCatalog(database);
  const expected = expectedCurrentCatalog();
  const exerciseColumns = (
    database.prepare("PRAGMA table_info(exercises);").all() as TableInfoRow[]
  ).map((row) => row.name);
  if (!isSupportedCurrentExerciseColumnOrder(exerciseColumns)) {
    throw new Error(
      "Candidate exercises column order is outside the five supported current layouts"
    );
  }

  // initializeDatabase has already matched the exercises DDL and indexes against
  // its five exact target definitions. Compare every remaining schema object with
  // the fresh catalog while allowing those deliberately preserved table layouts.
  const withoutExerciseTable = (catalog: CatalogRow[]) =>
    catalog.filter(
      (row) => !(row.type === "table" && row.name === "exercises")
    );
  if (
    JSON.stringify(withoutExerciseTable(actual)) !==
    JSON.stringify(withoutExerciseTable(expected))
  ) {
    throw new Error(
      "Candidate schema is not an exact supported current schema after migration"
    );
  }
}

function assertHealthyDatabase(database: DatabaseSync): void {
  const integrityRows = database.prepare("PRAGMA integrity_check;").all();
  if (
    integrityRows.length !== 1 ||
    Object.values(integrityRows[0] as Record<string, unknown>)[0] !== "ok"
  ) {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrityRows)}`);
  }
  const foreignKeyRows = database.prepare("PRAGMA foreign_key_check;").all();
  if (foreignKeyRows.length > 0) {
    throw new Error(
      `SQLite foreign key check failed: ${JSON.stringify(foreignKeyRows)}`
    );
  }
  assertSoftLinks(database);
}

function assertSoftLinks(database: DatabaseSync): void {
  const staleExerciseLinks = database
    .prepare(
      `SELECT pce.id
       FROM program_calendar_exercises pce
       WHERE pce.workout_exercise_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM workout_exercises we
           WHERE we.id = pce.workout_exercise_id
         );`
    )
    .all();
  if (staleExerciseLinks.length > 0) {
    throw new Error(
      `Stale program workout-exercise link(s): ${JSON.stringify(staleExerciseLinks)}`
    );
  }
}

function tableCount(database: DatabaseSync, table: AppTable): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)};`)
    .get() as { count: number };
  return Number(row.count);
}

export function appTableCounts(
  database: DatabaseSync
): Record<AppTable, number> {
  return Object.fromEntries(
    APP_TABLES.map((table) => [table, tableCount(database, table)])
  ) as Record<AppTable, number>;
}

export function snapshotAppData(
  database: DatabaseSync
): Record<AppTable, unknown[]> {
  return Object.fromEntries(
    APP_TABLES.map((table) => [
      table,
      plainRows(
        database
          .prepare(
            `SELECT * FROM ${quoteIdentifier(table)} ORDER BY rowid;`
          )
          .all()
      ),
    ])
  ) as Record<AppTable, unknown[]>;
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function hashProofFile(path: string): string {
  return fileHash(path);
}

export function prepareReplacementCandidate(
  inputPath: string,
  parentDirectory?: string
): PreparedCandidate {
  const directory = parentDirectory
    ? mkdtempSync(join(parentDirectory, "prepared-"))
    : mkdtempSync(join(tmpdir(), "workoutlog-mvp006a-prepared-"));
  const path = join(directory, "candidate.db");
  copyFileSync(inputPath, path);

  const database = new DatabaseSync(path);
  try {
    assertSafePreMigrationCatalog(database);
    initializeNodeDatabase(database);
    assertCurrentCatalog(database);
    assertHealthyDatabase(database);
    return {
      counts: appTableCounts(database),
      directory,
      hash: fileHash(path),
      path,
    };
  } catch (error) {
    database.close();
    rmSync(directory, { force: true, recursive: true });
    throw error;
  } finally {
    if (database.isOpen) {
      database.close();
    }
  }
}

export function disposePreparedCandidate(candidate: PreparedCandidate): void {
  rmSync(candidate.directory, { force: true, recursive: true });
}

function tableColumns(database: DatabaseSync, table: AppTable): string[] {
  return (
    database
      .prepare(`PRAGMA table_info(${quoteIdentifier(table)});`)
      .all() as TableInfoRow[]
  ).map((row) => row.name);
}

function copyCandidateTable(database: DatabaseSync, table: AppTable): void {
  const columns = tableColumns(database, table);
  const columnList = columns.map(quoteIdentifier).join(", ");
  const sourceList = columns
    .map((column) =>
      table === "media" && column === "local_uri"
        ? "'' AS local_uri"
        : quoteIdentifier(column)
    )
    .join(", ");
  database.exec(
    `INSERT INTO main.${quoteIdentifier(table)} (${columnList})
     SELECT ${sourceList}
     FROM restore_candidate.${quoteIdentifier(table)};`
  );
}

function rebuildDerivedPBEvents(database: DatabaseSync): number {
  // Proof-only implementation. Production must share the canonical pbEvents routine.
  type SourceSet = {
    exercise_id: number;
    id: number;
    performed_at: number | null;
    reps: number | null;
    weight_kg: number | null;
  };

  const rows = database
    .prepare(
      `SELECT id, exercise_id, weight_kg, reps, performed_at
       FROM sets
       ORDER BY exercise_id, performed_at, id;`
    )
    .all() as SourceSet[];
  const bestByExerciseAndReps = new Map<string, number>();
  const insert = database.prepare(
    `INSERT INTO pr_events (
       uid, set_id, exercise_id, type, metric_value, occurred_at
     ) VALUES (?, ?, ?, ?, ?, ?);`
  );
  let inserted = 0;

  for (const row of rows) {
    if (
      row.weight_kg === null ||
      row.reps === null ||
      row.performed_at === null ||
      row.weight_kg <= 0 ||
      row.reps <= 0
    ) {
      continue;
    }
    const key = `${row.exercise_id}:${row.reps}`;
    const prior = bestByExerciseAndReps.get(key);
    if (prior !== undefined && prior >= row.weight_kg) {
      continue;
    }
    bestByExerciseAndReps.set(key, row.weight_kg);
    inserted += 1;
    insert.run(
      `proof-pb-${row.id}`,
      row.id,
      row.exercise_id,
      `${row.reps}rm`,
      row.weight_kg,
      row.performed_at
    );
  }

  return inserted;
}

function mediaRows(database: DatabaseSync): MediaProofRow[] {
  return plainRows(
    database
      .prepare(
        `SELECT
           id,
           local_uri,
           asset_id,
           original_filename,
           media_created_at,
           duration_ms,
           album_name
         FROM media
         ORDER BY id;`
      )
      .all() as MediaProofRow[]
  );
}

function injectFault(actual: RestoreFault | undefined, expected: RestoreFault): void {
  if (actual === expected) {
    throw new Error(`Injected replacement restore fault at ${expected}`);
  }
}

export function replaceLiveDatabaseFromCandidate(
  live: DatabaseSync,
  prepared: PreparedCandidate,
  options: ReplaceOptions = {}
): ReplacementProofResult | CancelledProofResult {
  if (options.cancelBeforeCommit) {
    return { liveDatabaseChanged: false, status: "cancelled" };
  }
  if (!prepared.hash || fileHash(prepared.path) !== prepared.hash) {
    throw new Error("Prepared candidate hash changed before commit");
  }

  assertCurrentCatalog(live);
  assertHealthyDatabase(live);

  live.exec(
    `ATTACH DATABASE '${escapeSqlString(prepared.path)}' AS restore_candidate;`
  );
  let transactionOpen = false;
  let pbEventsRebuilt = 0;
  try {
    live.exec("BEGIN IMMEDIATE;");
    transactionOpen = true;
    for (const table of DELETE_ORDER) {
      live.exec(`DELETE FROM main.${quoteIdentifier(table)};`);
    }
    injectFault(options.failAt, "after-live-delete");

    for (const table of INSERT_ORDER) {
      copyCandidateTable(live, table);
    }
    injectFault(options.failAt, "after-candidate-copy");

    pbEventsRebuilt = rebuildDerivedPBEvents(live);
    assertHealthyDatabase(live);
    injectFault(options.failAt, "before-commit");
    live.exec("COMMIT;");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      live.exec("ROLLBACK;");
    }
    live.exec("DETACH DATABASE restore_candidate;");
    throw error;
  }

  const warnings: string[] = [];
  try {
    injectFault(options.failAt, "after-commit-before-detach");
    live.exec("DETACH DATABASE restore_candidate;");
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    try {
      live.exec("DETACH DATABASE restore_candidate;");
    } catch {
      // A post-commit detach failure is a cleanup warning, never a rollback claim.
    }
  }

  const rows = mediaRows(live);
  const errors: string[] = [];
  let resolved = 0;
  try {
    resolved = options.abortMediaReconciliation
      ? 0
      : (options.reconcileMedia?.(rows) ?? 0);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  resolved = Math.max(0, Math.min(rows.length, resolved));

  return {
    media: {
      errors,
      resolved,
      total: rows.length,
      unresolved: rows.length - resolved,
    },
    pbEventsRebuilt,
    rowsByTable: appTableCounts(live),
    status: "restored",
    warnings,
  };
}

export function pickConservativeMediaCandidate(
  metadata: GalleryProofMetadata,
  candidates: GalleryProofCandidate[]
): GalleryProofCandidate | null {
  if (
    !metadata.originalFilename ||
    !(
      (metadata.mediaCreatedAt !== null && metadata.mediaCreatedAt > 0) ||
      (metadata.durationMs !== null && metadata.durationMs > 0)
    )
  ) {
    return null;
  }

  const matches = candidates.filter((candidate) => {
    if (candidate.filename !== metadata.originalFilename) return false;
    if (
      metadata.mediaCreatedAt !== null &&
      metadata.mediaCreatedAt > 0 &&
      (candidate.mediaCreatedAt === null ||
        candidate.mediaCreatedAt <= 0 ||
        Math.abs(candidate.mediaCreatedAt - metadata.mediaCreatedAt) > 2_000)
    ) {
      return false;
    }
    if (
      metadata.durationMs !== null &&
      metadata.durationMs > 0 &&
      (candidate.durationMs === null ||
        candidate.durationMs <= 0 ||
        Math.abs(candidate.durationMs - metadata.durationMs) > 2_000)
    ) {
      return false;
    }
    return true;
  });

  return matches.length === 1 ? matches[0] : null;
}

export function buildExportArtifactDescriptor(now: Date): {
  displayName: string;
  mimeType: "application/vnd.sqlite3";
} {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    "-",
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return {
    displayName: `LiftingLog-backup-${stamp}.db`,
    mimeType: "application/vnd.sqlite3",
  };
}

export async function createOnlineBackupProof(
  source: DatabaseSync,
  destinationPath: string,
  onProgress?: (progress: BackupProgressInfo) => void
): Promise<number> {
  return backup(source, destinationPath, {
    progress: onProgress,
    rate: 1,
  });
}

export async function sealWalCandidateProof(
  source: DatabaseSync,
  destinationPath: string
): Promise<{ hash: string; journalMode: string }> {
  await backup(source, destinationPath, { rate: 1 });
  const destination = new DatabaseSync(destinationPath);
  let journalMode = "";
  try {
    destination.prepare("PRAGMA wal_checkpoint(TRUNCATE);").get();
    const modeRow = destination.prepare("PRAGMA journal_mode=DELETE;").get() as
      | Record<string, unknown>
      | undefined;
    journalMode = String(modeRow ? Object.values(modeRow)[0] : "").toLowerCase();
    if (journalMode !== "delete") {
      throw new Error(`Could not seal candidate in DELETE mode: ${journalMode}`);
    }
    assertHealthyDatabase(destination);
  } finally {
    destination.close();
  }
  if (
    existsSync(`${destinationPath}-wal`) ||
    existsSync(`${destinationPath}-shm`)
  ) {
    throw new Error("Sealed candidate still requires WAL/SHM sidecars");
  }
  return { hash: fileHash(destinationPath), journalMode };
}
