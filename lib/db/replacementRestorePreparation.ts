import * as DocumentPicker from "expo-document-picker";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { newUid } from "../utils/uid";
import {
  DEFAULT_MAX_SHA256_FILE_BYTES,
  sha256File,
  sha256FileSync,
} from "../utils/fileSha256";
import { createSealedBackupSnapshot } from "./backupSnapshot";
import { initializeDatabase } from "./bootstrap";
import type {
  AppTable,
  ReplacementRestoreErrorCode,
  RestorePreparePhase,
  RestoreProgress,
  RestoreSource,
} from "./replacementRestoreContract";
import {
  REPLACEMENT_RESTORE_CANDIDATE_NAME,
  REPLACEMENT_RESTORE_STAGING_DIRECTORY,
  requireOwnedCandidatePath,
  stagingDirectoryForCandidate,
} from "./replacementRestoreRecords";
import {
  RestoreSchemaValidationError,
  validateRestoreSchema,
} from "./restoreSchemaManifest";
import {
  readReplacementTableCounts,
  type ReplacementSqliteConnection,
} from "./replacementRestoreTransaction";

const SQLITE_HEADER = "SQLite format 3\0";
const SOURCE_MIME_TYPES = [
  "application/vnd.sqlite3",
  "application/x-sqlite3",
  "application/octet-stream",
  "*/*",
] as const;

export type PreparedReplacementCandidate = {
  readonly sourceDisplayName: string | null;
  readonly candidatePath: string;
  readonly candidateSha256: string;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsInSource: number;
  readonly mediaRows: number;
};

export class ReplacementPreparationError extends Error {
  constructor(
    readonly code: ReplacementRestoreErrorCode,
    readonly stage: RestorePreparePhase,
    message: string,
    readonly causeValue?: unknown
  ) {
    super(message);
    this.name = "ReplacementPreparationError";
  }
}

export class UnconfirmedOwnedHandleCloseError extends Error {
  constructor(readonly primaryError: unknown, readonly closeError: unknown) {
    super(
      primaryError instanceof Error
        ? primaryError.message
        : "An owned restore file handle could not be confirmed closed."
    );
    this.name = "UnconfirmedOwnedHandleCloseError";
  }
}

export interface ReplacementPreparationConnection
  extends ReplacementSqliteConnection {
  closeAsync(): Promise<void>;
  execAsync(sql: string): Promise<void>;
}

export type ReplacementPreparationStaging = {
  readonly rootUri: string;
  readonly directoryUri: string;
  readonly workFileUri: string;
  readonly candidateFileUri: string;
};

export interface ReplacementPreparationAdapter {
  pickSource(): Promise<RestoreSource | null>;
  createStaging(): ReplacementPreparationStaging;
  copyFile(sourceUri: string, destinationUri: string): Promise<void>;
  deleteDirectory(directoryUri: string): void;
  deleteFile(fileUri: string): void;
  fileInfo(fileUri: string): {
    readonly exists: boolean;
    readonly isDirectory: boolean | null;
    readonly size: number | null;
  };
  readHeader(fileUri: string, bytes: number): Uint8Array;
  hashFile(fileUri: string, signal?: AbortSignal): Promise<string>;
  hashFileSync(fileUri: string): string;
  openPrivateDatabase(fileUri: string): Promise<ReplacementPreparationConnection>;
  initializeCandidate(connection: ReplacementPreparationConnection): void;
  sealCandidate(options: {
    sourceDatabase: ReplacementPreparationConnection;
    destinationDirectory: string;
    destinationName: string;
  }): Promise<{
    readonly fileUri: string;
    readonly rowsByTable: Readonly<Record<AppTable, number>>;
    readonly sha256: string;
  }>;
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("Replacement restore preparation was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

function emitProgress(
  callback: ((progress: RestoreProgress) => void) | undefined,
  phase: RestorePreparePhase,
  cancellable: boolean
): void {
  if (!callback) return;
  try {
    callback({ phase, cancellable });
  } catch (error) {
    if (__DEV__) console.warn("[replacement-restore] Progress callback failed.", error);
  }
}

function firstValue(row: Record<string, unknown> | undefined): unknown {
  return row ? Object.values(row)[0] : undefined;
}

function requireIntegrity(
  connection: ReplacementPreparationConnection,
  stage: RestorePreparePhase
): void {
  const rows = connection.getAllSync<Record<string, unknown>>(
    "PRAGMA integrity_check;"
  );
  if (rows.length !== 1 || firstValue(rows[0]) !== "ok") {
    throw new ReplacementPreparationError(
      "integrity_failed",
      stage,
      "Restore candidate failed SQLite integrity validation."
    );
  }
}

function requireForeignKeys(
  connection: ReplacementPreparationConnection,
  stage: RestorePreparePhase
): void {
  if (connection.getAllSync<Record<string, unknown>>("PRAGMA foreign_key_check;").length) {
    throw new ReplacementPreparationError(
      "foreign_key_failed",
      stage,
      "Restore candidate contains invalid foreign-key links."
    );
  }
}

function hasTable(
  connection: ReplacementPreparationConnection,
  table: string
): boolean {
  const rows = connection.getAllSync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = ?;",
    [table]
  );
  return rows.length === 1 && Number(rows[0].count) === 1;
}

function requireSoftLinks(
  connection: ReplacementPreparationConnection,
  stage: RestorePreparePhase
): void {
  if (!hasTable(connection, "program_calendar_exercises")) return;
  const rows = connection.getAllSync<{ id: number }>(
    `SELECT pce.id
       FROM program_calendar_exercises AS pce
      WHERE pce.workout_exercise_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM workout_exercises AS we
           WHERE we.id = pce.workout_exercise_id
        );`
  );
  if (rows.length) {
    throw new ReplacementPreparationError(
      "soft_link_failed",
      stage,
      "Restore candidate contains stale program workout-exercise links."
    );
  }
}

function requireMigratedUids(connection: ReplacementPreparationConnection): void {
  for (const table of [
    "user_checkins",
    "exercises",
    "workouts",
    "workout_exercises",
    "sets",
  ] as const) {
    const rows = connection.getAllSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM "${table}" WHERE uid IS NULL OR uid = '';`
    );
    if (rows.length !== 1 || Number(rows[0].count) !== 0) {
      throw new ReplacementPreparationError(
        "candidate_migration_failed",
        "validating_candidate",
        `Restore candidate migration left missing UIDs in ${table}.`
      );
    }
  }
}

function requireSettingsSingleton(connection: ReplacementPreparationConnection): void {
  const rows = connection.getAllSync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM settings;"
  );
  if (rows.length !== 1 || Number(rows[0].count) > 1) {
    throw new ReplacementPreparationError(
      "unsupported_schema",
      "validating_candidate",
      "Restore candidate contains more than one settings row."
    );
  }
}

function requireHealth(
  connection: ReplacementPreparationConnection,
  migrated: boolean,
  stage: RestorePreparePhase
): void {
  requireIntegrity(connection, stage);
  requireForeignKeys(connection, stage);
  requireSoftLinks(connection, stage);
  if (migrated) {
    requireMigratedUids(connection);
    requireSettingsSingleton(connection);
  }
}

function exactCounts(
  left: Readonly<Record<AppTable, number>>,
  right: Readonly<Record<AppTable, number>>
): boolean {
  return (Object.keys(left) as AppTable[]).length === 15 &&
    (Object.keys(right) as AppTable[]).length === 15 &&
    (Object.keys(left) as AppTable[]).every((table) => left[table] === right[table]);
}

async function closePreservingFailure(
  connection: ReplacementPreparationConnection | undefined,
  primaryError: unknown,
  markUnsafeCleanup: () => void
): Promise<void> {
  if (!connection) return;
  try {
    await connection.closeAsync();
  } catch (closeError) {
    markUnsafeCleanup();
    if (primaryError === undefined) throw closeError;
  }
}

function mapValidationError(
  error: unknown,
  stage: RestorePreparePhase,
  fallbackCode: ReplacementRestoreErrorCode,
  fallbackMessage: string
): ReplacementPreparationError {
  if (error instanceof ReplacementPreparationError) return error;
  if (error instanceof RestoreSchemaValidationError) {
    return new ReplacementPreparationError(
      "unsupported_schema",
      stage,
      error.message,
      error
    );
  }
  return new ReplacementPreparationError(fallbackCode, stage, fallbackMessage, error);
}

async function validateClosedPrivateFile(options: {
  adapter: ReplacementPreparationAdapter;
  fileUri: string;
  phase: "source" | "current";
  expectedCounts?: Record<AppTable, number>;
  markUnsafeCleanup: () => void;
}): Promise<{ hash: string; rowsByTable?: Record<AppTable, number> }> {
  const { adapter, fileUri, phase, expectedCounts, markUnsafeCleanup } = options;
  const info = adapter.fileInfo(fileUri);
  if (!info.exists || info.isDirectory !== false) {
    throw new ReplacementPreparationError(
      "source_unreadable",
      phase === "source" ? "validating_source" : "validating_candidate",
      "Restore candidate disappeared before validation."
    );
  }
  const hashBefore = await adapter.hashFile(fileUri);
  let connection: ReplacementPreparationConnection | undefined;
  let primaryError: unknown;
  let rowsByTable: Record<AppTable, number> | undefined;
  try {
    if (!adapter.fileInfo(fileUri).exists) {
      throw new Error("Restore candidate disappeared before open.");
    }
    connection = await adapter.openPrivateDatabase(fileUri);
    await connection.execAsync("PRAGMA query_only=ON;");
    await connection.execAsync("PRAGMA trusted_schema=OFF;");
    validateRestoreSchema(connection, phase);
    requireHealth(
      connection,
      phase === "current",
      phase === "source" ? "validating_source" : "validating_candidate"
    );
    if (phase === "current") {
      rowsByTable = readReplacementTableCounts(connection);
      if (expectedCounts && !exactCounts(rowsByTable, expectedCounts)) {
        throw new Error("Sealed candidate row counts changed during validation.");
      }
    }
  } catch (error) {
    primaryError = error;
  }
  try {
    await closePreservingFailure(connection, primaryError, markUnsafeCleanup);
  } catch (error) {
    primaryError = error;
  }
  if (primaryError !== undefined) {
    throw mapValidationError(
      primaryError,
      phase === "source" ? "validating_source" : "validating_candidate",
      phase === "source" ? "unsupported_schema" : "integrity_failed",
      `Restore ${phase} validation failed.`
    );
  }
  const hashAfter = await adapter.hashFile(fileUri);
  if (hashAfter !== hashBefore) {
    throw new ReplacementPreparationError(
      "candidate_changed",
      phase === "source" ? "validating_source" : "validating_candidate",
      `Restore ${phase} file changed during query-only validation.`
    );
  }
  return { hash: hashAfter, rowsByTable };
}

function requireBoundedSqliteFile(
  adapter: ReplacementPreparationAdapter,
  fileUri: string
): void {
  const info = adapter.fileInfo(fileUri);
  if (
    !info.exists ||
    info.isDirectory !== false ||
    typeof info.size !== "number" ||
    !Number.isSafeInteger(info.size) ||
    info.size <= 0
  ) {
    throw new ReplacementPreparationError(
      "source_unreadable",
      "staging",
      "The selected restore source is absent or empty."
    );
  }
  if (info.size > DEFAULT_MAX_SHA256_FILE_BYTES) {
    throw new ReplacementPreparationError(
      "source_unreadable",
      "staging",
      `Restore sources are limited to ${DEFAULT_MAX_SHA256_FILE_BYTES} bytes.`
    );
  }
  const header = adapter.readHeader(fileUri, 16);
  const actual = Array.from(header, (byte) => String.fromCharCode(byte)).join("");
  if (header.byteLength !== 16 || actual !== SQLITE_HEADER) {
    throw new ReplacementPreparationError(
      "invalid_sqlite",
      "validating_source",
      "The selected file does not have a valid SQLite header."
    );
  }
}

export async function prepareReplacementCandidateWithAdapter(options: {
  adapter: ReplacementPreparationAdapter;
  source?: RestoreSource;
  signal?: AbortSignal;
  onProgress?: (progress: RestoreProgress) => void;
}): Promise<PreparedReplacementCandidate | null> {
  const { adapter, signal, onProgress } = options;
  throwIfAborted(signal);
  emitProgress(onProgress, "selecting", true);
  const source = options.source ?? (await adapter.pickSource());
  if (!source) return null;
  if (typeof source.uri !== "string" || source.uri.trim().length === 0) {
    throw new ReplacementPreparationError(
      "source_unreadable",
      "selecting",
      "The selected restore source has no readable URI."
    );
  }

  let staging: ReplacementPreparationStaging | undefined;
  let succeeded = false;
  let cleanupIsSafe = true;
  try {
    throwIfAborted(signal);
    emitProgress(onProgress, "staging", true);
    staging = adapter.createStaging();
    requireOwnedCandidatePath(staging.candidateFileUri, staging.rootUri);
    await adapter.copyFile(source.uri, staging.workFileUri);
    throwIfAborted(signal);
    try {
      requireBoundedSqliteFile(adapter, staging.workFileUri);
    } catch (error) {
      if (error instanceof UnconfirmedOwnedHandleCloseError) {
        cleanupIsSafe = false;
        throw error.primaryError ?? error.closeError;
      }
      throw error;
    }

    emitProgress(onProgress, "validating_source", true);
    await validateClosedPrivateFile({
      adapter,
      fileUri: staging.workFileUri,
      phase: "source",
      markUnsafeCleanup: () => {
        cleanupIsSafe = false;
      },
    });
    throwIfAborted(signal);

    emitProgress(onProgress, "migrating_candidate", true);
    let migration: ReplacementPreparationConnection | undefined;
    let migrationError: unknown;
    let rowsByTable: Record<AppTable, number> | undefined;
    let sealedSnapshotSha256: string | undefined;
    try {
      if (!adapter.fileInfo(staging.workFileUri).exists) {
        throw new Error("Private restore work copy disappeared before migration.");
      }
      migration = await adapter.openPrivateDatabase(staging.workFileUri);
      await migration.execAsync("PRAGMA trusted_schema=OFF;");
      migration.execSync("PRAGMA foreign_keys=ON;");
      adapter.initializeCandidate(migration);
      validateRestoreSchema(migration, "current");
      requireHealth(migration, true, "validating_candidate");
      rowsByTable = readReplacementTableCounts(migration);
      throwIfAborted(signal);

      emitProgress(onProgress, "validating_candidate", true);
      let snapshot;
      try {
        snapshot = await adapter.sealCandidate({
          sourceDatabase: migration,
          destinationDirectory: staging.directoryUri,
          destinationName: REPLACEMENT_RESTORE_CANDIDATE_NAME,
        });
      } catch (error) {
        // The shared snapshot helper preserves its primary failure over a
        // secondary close failure. The adapter cannot expose which close won,
        // so retain the owned directory conservatively on every seal failure.
        cleanupIsSafe = false;
        throw error;
      }
      if (
        snapshot.fileUri !== staging.candidateFileUri ||
        !exactCounts(snapshot.rowsByTable, rowsByTable)
      ) {
        throw new Error("Sealed candidate does not match its migrated work copy.");
      }
      sealedSnapshotSha256 = snapshot.sha256;
    } catch (error) {
      migrationError = error;
    }
    try {
      await closePreservingFailure(migration, migrationError, () => {
        cleanupIsSafe = false;
      });
    } catch (error) {
      migrationError = error;
    }
    if (migrationError !== undefined) {
      throw mapValidationError(
        migrationError,
        "migrating_candidate",
        "candidate_migration_failed",
        "Restore candidate migration or sealing failed."
      );
    }
    if (!rowsByTable) {
      throw new ReplacementPreparationError(
        "candidate_migration_failed",
        "migrating_candidate",
        "Restore candidate migration produced no replacement plan."
      );
    }
    if (!sealedSnapshotSha256) {
      throw new ReplacementPreparationError(
        "candidate_migration_failed",
        "migrating_candidate",
        "Restore candidate sealing produced no verified digest."
      );
    }

    adapter.deleteFile(staging.workFileUri);
    throwIfAborted(signal);
    const sealed = await validateClosedPrivateFile({
      adapter,
      fileUri: staging.candidateFileUri,
      phase: "current",
      expectedCounts: rowsByTable,
      markUnsafeCleanup: () => {
        cleanupIsSafe = false;
      },
    });
    if (sealed.hash !== sealedSnapshotSha256) {
      throw new ReplacementPreparationError(
        "candidate_changed",
        "validating_candidate",
        "Sealed restore candidate changed after snapshot validation."
      );
    }
    throwIfAborted(signal);
    emitProgress(onProgress, "ready", false);
    succeeded = true;
    return {
      sourceDisplayName: source.displayName ?? null,
      candidatePath: staging.candidateFileUri,
      candidateSha256: sealed.hash,
      rowsByTable,
      pbEventsInSource: rowsByTable.pr_events,
      mediaRows: rowsByTable.media,
    };
  } catch (error) {
    if (isAbort(error, signal)) return null;
    throw mapValidationError(
      error,
      "staging",
      "source_unreadable",
      "Replacement restore preparation failed."
    );
  } finally {
    if (!succeeded && staging && cleanupIsSafe) {
      try {
        adapter.deleteDirectory(staging.directoryUri);
      } catch {
        // Preserve the primary preparation failure or cancellation.
      }
    }
  }
}

function productionStagingRoot(): Directory {
  return new Directory(Paths.document, REPLACEMENT_RESTORE_STAGING_DIRECTORY);
}

export function getReplacementRestoreStagingRootUri(): string {
  return productionStagingRoot().uri;
}

export function replacementRestoreCandidateExists(candidatePath: string): boolean {
  requireOwnedCandidatePath(candidatePath, getReplacementRestoreStagingRootUri());
  const file = new File(candidatePath);
  if (!file.exists) return false;
  const info = file.info();
  return (
    info.exists &&
    typeof info.size === "number" &&
    Number.isSafeInteger(info.size) &&
    info.size > 0 &&
    info.size <= DEFAULT_MAX_SHA256_FILE_BYTES
  );
}

export function hashReplacementRestoreCandidateSync(candidatePath: string): string {
  requireOwnedCandidatePath(candidatePath, getReplacementRestoreStagingRootUri());
  return sha256FileSync(candidatePath, {
    maxBytes: DEFAULT_MAX_SHA256_FILE_BYTES,
  }).sha256;
}

export async function hashReplacementRestoreCandidate(
  candidatePath: string,
  signal?: AbortSignal
): Promise<string> {
  requireOwnedCandidatePath(candidatePath, getReplacementRestoreStagingRootUri());
  return (
    await sha256File(candidatePath, {
      maxBytes: DEFAULT_MAX_SHA256_FILE_BYTES,
      signal,
    })
  ).sha256;
}

export function discardReplacementRestoreCandidate(candidatePath: string): void {
  const rootUri = getReplacementRestoreStagingRootUri();
  const directoryUri = stagingDirectoryForCandidate(candidatePath, rootUri);
  const directory = new Directory(directoryUri);
  if (directory.exists) directory.delete();
}

export const expoReplacementPreparationAdapter: ReplacementPreparationAdapter = {
  async pickSource() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...SOURCE_MIME_TYPES],
      copyToCacheDirectory: false,
      multiple: false,
      base64: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      displayName: asset.name,
      mimeType: asset.mimeType ?? null,
    };
  },
  createStaging() {
    const root = productionStagingRoot();
    if (!root.exists) root.create({ intermediates: true, idempotent: true });
    const directory = new Directory(root, `restore-v1-${newUid()}`);
    directory.create();
    return {
      rootUri: root.uri,
      directoryUri: directory.uri,
      workFileUri: new File(directory, "work.db").uri,
      candidateFileUri: new File(directory, REPLACEMENT_RESTORE_CANDIDATE_NAME).uri,
    };
  },
  async copyFile(sourceUri, destinationUri) {
    await new File(sourceUri).copy(new File(destinationUri));
  },
  deleteDirectory(directoryUri) {
    const directory = new Directory(directoryUri);
    if (directory.exists) directory.delete();
  },
  deleteFile(fileUri) {
    const file = new File(fileUri);
    if (file.exists) file.delete();
  },
  fileInfo(fileUri) {
    const file = new File(fileUri);
    if (!file.exists) return { exists: false, isDirectory: null, size: null };
    const pathInfo = Paths.info(fileUri);
    const info = file.info();
    return {
      exists: info.exists && pathInfo.exists,
      isDirectory: pathInfo.isDirectory,
      size: info.size ?? null,
    };
  },
  readHeader(fileUri, bytes) {
    const handle = new File(fileUri).open(FileMode.ReadOnly);
    let primaryError: unknown;
    let result: Uint8Array | undefined;
    try {
      result = handle.readBytes(bytes);
    } catch (error) {
      primaryError = error;
    }
    try {
      handle.close();
    } catch (closeError) {
      throw new UnconfirmedOwnedHandleCloseError(primaryError, closeError);
    }
    if (primaryError !== undefined) throw primaryError;
    return result!;
  },
  async hashFile(fileUri, signal) {
    return (
      await sha256File(fileUri, {
        maxBytes: DEFAULT_MAX_SHA256_FILE_BYTES,
        signal,
      })
    ).sha256;
  },
  hashFileSync(fileUri) {
    return sha256FileSync(fileUri, {
      maxBytes: DEFAULT_MAX_SHA256_FILE_BYTES,
    }).sha256;
  },
  async openPrivateDatabase(fileUri) {
    const file = new File(fileUri);
    if (!file.exists) throw new Error("Private restore database does not exist.");
    return openDatabaseAsync(file.name, { useNewConnection: true }, file.parentDirectory.uri);
  },
  initializeCandidate(connection) {
    initializeDatabase(connection as SQLiteDatabase);
  },
  sealCandidate(options) {
    return createSealedBackupSnapshot({
      sourceDatabase: options.sourceDatabase as SQLiteDatabase,
      destinationDirectory: options.destinationDirectory,
      destinationName: options.destinationName,
    });
  },
};

export function prepareReplacementCandidate(options: {
  source?: RestoreSource;
  signal?: AbortSignal;
  onProgress?: (progress: RestoreProgress) => void;
}): Promise<PreparedReplacementCandidate | null> {
  return prepareReplacementCandidateWithAdapter({
    ...options,
    adapter: expoReplacementPreparationAdapter,
  });
}
