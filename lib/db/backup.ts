import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { newUid } from "../utils/uid";
import {
  pickMatchingMediaId,
  pickMatchingSetId,
  pickMatchingWorkoutExerciseId,
  pickMatchingWorkoutId,
} from "./backupMatching";
import { sqlite } from "./connection";
import { updateMedia } from "./media";
import {
  doesFileUriExist,
  ensureVideoLibraryPermission,
  isFileUri,
  isLikelyTransientUri,
  resolveVideoLibraryReference,
} from "../utils/videoStorage";

const LOG_PREFIX = "[backup]";
const DB_NAME = "LiftingLog.db";
const BACKUP_TEMP_DB_NAME = "backup-import-temp.db";
const SQLITE_HEADER = "SQLite format 3";

/** Merge result returned after import */
export interface MergeResult {
  exercises: { inserted: number; updated: number };
  workouts: { inserted: number; updated: number };
  workoutExercises: { inserted: number; updated: number };
  sets: { inserted: number; updated: number };
  prEvents: { inserted: number };
  media: { inserted: number; updated: number; relinked: number };
  durationMs: number;
}

type ExportSaveMethod = "android_saf" | "fallback_share";

/** Custom error for unavailable file system */
export class FileSystemUnavailableError extends Error {
  constructor(message?: string) {
    super(message ?? "File system is not available in this runtime.");
    this.name = "FileSystemUnavailableError";
  }
}

export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled.");
    this.name = "ExportCancelledError";
  }
}

export class InvalidBackupError extends Error {
  constructor(message?: string) {
    super(message ?? "Not a valid SQLite backup file.");
    this.name = "InvalidBackupError";
  }
}

/**
 * Generate a timestamped backup filename
 */
function generateBackupFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `LiftingLog-backup-${year}${month}${day}-${hours}${minutes}${seconds}.db`;
}

/**
 * Log runtime diagnostics for debugging (DEV only)
 */
function logRuntimeDiagnostics(): void {
  if (!__DEV__) return;
  try {
    const cacheUri = Paths.cache?.uri ?? null;
    const documentUri = Paths.document?.uri ?? null;
    console.log(`${LOG_PREFIX} Runtime diagnostics:`, {
      platform: Platform.OS,
      cacheUri,
      documentUri,
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to get runtime diagnostics:`, error);
  }
}

/**
 * Resolve the path to the SQLite database file at runtime.
 * expo-sqlite stores databases in the document directory on both platforms.
 */
function getDatabaseFile(): File {
  logRuntimeDiagnostics();

  // expo-sqlite stores databases in document directory
  const documentDir = Paths.document;
  if (!documentDir) {
    console.warn(`${LOG_PREFIX} Document directory is not available.`);
    throw new FileSystemUnavailableError(
      "Backup requires a development build or production APK. File system is not available in this runtime."
    );
  }

  // On Android, expo-sqlite stores in document/SQLite/
  // On iOS, it's directly in document/
  let dbFile: File;
  if (Platform.OS === "android") {
    dbFile = new File(documentDir, "SQLite", DB_NAME);
  } else {
    dbFile = new File(documentDir, DB_NAME);
  }

  if (__DEV__) {
    console.log(`${LOG_PREFIX} Database file path:`, dbFile.uri);
    try {
      const exists = dbFile.exists;
      console.log(`${LOG_PREFIX} Database exists:`, exists);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Could not check if database exists:`, error);
    }
  }

  return dbFile;
}

function checkpointDatabaseForBackup(): void {
  try {
    sqlite.execSync("PRAGMA wal_checkpoint(TRUNCATE);");
    if (__DEV__) {
      console.log(`${LOG_PREFIX} WAL checkpoint completed before backup export.`);
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to checkpoint WAL before backup export:`, error);
    throw error;
  }
}

/**
 * Copy the database to a temporary location for export
 */
function copyDatabaseToTemp(backupFilename: string): File {
  const cacheDir = Paths.cache ?? Paths.document;
  if (!cacheDir) {
    throw new FileSystemUnavailableError(
      "No writable cache directory available."
    );
  }

  const dbFile = getDatabaseFile();
  if (!dbFile.exists) {
    throw new FileSystemUnavailableError(
      "Database file not found. Please ensure the app has been used at least once."
    );
  }

  checkpointDatabaseForBackup();

  const tempFile = new File(cacheDir, backupFilename);
  console.log(`${LOG_PREFIX} Copying database to:`, tempFile.uri);

  try {
    dbFile.copy(tempFile);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to copy database:`, error);
    throw error;
  }

  if (__DEV__) {
    try {
      const info = tempFile.info();
      console.log(`${LOG_PREFIX} Temp backup info:`, { exists: info.exists, uri: tempFile.uri });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Unable to verify temp backup:`, error);
    }
  }

  return tempFile;
}

/**
 * Save backup using Android Storage Access Framework
 */
async function saveWithAndroidSaf(tempFile: File, backupFilename: string): Promise<string> {
  const { StorageAccessFramework } = LegacyFileSystem;
  if (!StorageAccessFramework?.requestDirectoryPermissionsAsync) {
    throw new FileSystemUnavailableError("Storage Access Framework is unavailable.");
  }

  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    throw new ExportCancelledError();
  }

  // Remove .db extension for createFileAsync (it adds based on mime type)
  const fileName = backupFilename.replace(/\.db$/i, "");
  const fileUri = await StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    fileName,
    "application/x-sqlite3"
  );

  // Read the temp file as base64 and write to the SAF URI
  const base64Content = await LegacyFileSystem.readAsStringAsync(tempFile.uri, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });

  await LegacyFileSystem.writeAsStringAsync(fileUri, base64Content, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });

  console.log(`${LOG_PREFIX} Backup saved via SAF:`, fileUri);
  return fileUri;
}

/**
 * Export the SQLite database backup to a user-selected location
 */
export async function exportDatabaseBackup(): Promise<{ uri: string; method: ExportSaveMethod }> {
  console.log(`${LOG_PREFIX} Starting database backup export.`);

  const backupFilename = generateBackupFilename();
  const tempFile = copyDatabaseToTemp(backupFilename);

  if (Platform.OS === "android") {
    const uri = await saveWithAndroidSaf(tempFile, backupFilename);
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Export method:`, { method: "android_saf", uri });
    }
    return { uri, method: "android_saf" };
  }

  // iOS: use share sheet fallback
  if (__DEV__) {
    console.log(`${LOG_PREFIX} Export method:`, { method: "fallback_share", uri: tempFile.uri });
  }
  return { uri: tempFile.uri, method: "fallback_share" };
}

/**
 * Validate that a file is a valid SQLite database by checking its header
 */
async function validateSqliteHeader(fileUri: string): Promise<boolean> {
  try {
    // Read first 16 bytes as string to check header
    const content = await LegacyFileSystem.readAsStringAsync(fileUri, {
      encoding: LegacyFileSystem.EncodingType.UTF8,
      length: 16,
      position: 0,
    });

    const isValid = content.startsWith(SQLITE_HEADER);
    console.log(`${LOG_PREFIX} SQLite header validation:`, { isValid, header: content.substring(0, 16) });
    return isValid;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to validate SQLite header:`, error);
    return false;
  }
}

/**
 * Get the app's SQLite directory for copying backup files into
 */
function getSqliteDirectory(): Directory {
  const documentDir = Paths.document;
  if (!documentDir) {
    throw new FileSystemUnavailableError(
      "Document directory is not available."
    );
  }

  // On Android, expo-sqlite stores in document/SQLite/
  // On iOS, it's directly in document/
  if (Platform.OS === "android") {
    return new Directory(documentDir, "SQLite");
  }
  return documentDir;
}

/**
 * Copy picked backup file to app's SQLite directory so we can open it by name
 */
async function copyBackupToSqliteDir(pickedFileUri: string): Promise<File> {
  const sqliteDir = getSqliteDirectory();

  // Ensure the directory exists
  if (Platform.OS === "android" && !sqliteDir.exists) {
    try {
      sqliteDir.create({ intermediates: true });
    } catch (error) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Could not create SQLite directory:`, error);
      }
    }
  }

  const tempDbFile = new File(sqliteDir, BACKUP_TEMP_DB_NAME);

  // Delete existing temp file if present
  if (tempDbFile.exists) {
    try {
      tempDbFile.delete();
    } catch {
      // Ignore deletion errors
    }
  }

  // Read the backup file as base64 and write to temp location
  const backupContent = await LegacyFileSystem.readAsStringAsync(pickedFileUri, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });

  await LegacyFileSystem.writeAsStringAsync(tempDbFile.uri, backupContent, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });

  if (__DEV__) {
    console.log(`${LOG_PREFIX} Copied backup to:`, tempDbFile.uri);
  }

  return tempDbFile;
}

/**
 * Delete the temp backup database file (best-effort)
 */
function deleteTempBackupDb(): void {
  try {
    const sqliteDir = getSqliteDirectory();
    const tempDbFile = new File(sqliteDir, BACKUP_TEMP_DB_NAME);
    if (tempDbFile.exists) {
      tempDbFile.delete();
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Deleted temp backup db.`);
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(`${LOG_PREFIX} Failed to delete temp backup db:`, error);
    }
  }
}

// ============================================================
// Merge import helpers
// ============================================================

interface BackupExercise {
  id: number;
  uid: string | null;
  name: string;
  description: string | null;
  muscle_group: string | null;
  equipment: string | null;
  is_bodyweight: number;
  created_at: number | null;
  last_rest_seconds: number | null;
  is_pinned: number;
}

interface BackupWorkout {
  id: number;
  uid: string | null;
  started_at: number;
  completed_at: number | null;
  note: string | null;
}

interface BackupWorkoutExercise {
  id: number;
  uid: string | null;
  workout_id: number;
  exercise_id: number;
  order_index: number | null;
  note: string | null;
  current_weight: number | null;
  current_reps: number | null;
  completed_at: number | null;
  performed_at: number | null;
}

interface BackupSet {
  id: number;
  uid: string | null;
  workout_id: number;
  exercise_id: number;
  workout_exercise_id: number | null;
  set_group_id: string | null;
  set_index: number | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  is_warmup: number;
  note: string | null;
  superset_group_id: string | null;
  performed_at: number | null;
}

interface LiveWorkoutCandidate {
  id: number;
  completed_at: number | null;
  note: string | null;
}

interface LiveWorkoutExerciseCandidate {
  id: number;
  order_index: number | null;
  note: string | null;
  completed_at: number | null;
  performed_at: number | null;
}

interface LiveSetCandidate {
  id: number;
  workout_exercise_id: number | null;
  set_group_id: string | null;
  set_index: number | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  is_warmup: number;
  note: string | null;
  superset_group_id: string | null;
  performed_at: number | null;
}

interface BackupMedia {
  id: number;
  local_uri: string;
  asset_id: string | null;
  mime: string | null;
  set_id: number | null;
  workout_id: number | null;
  note: string | null;
  created_at: number | null;
  original_filename: string | null;
  media_created_at: number | null;
  duration_ms: number | null;
  album_name: string | null;
}

interface LiveMediaCandidate {
  id: number;
  asset_id: string | null;
  local_uri: string;
  original_filename: string | null;
  media_created_at: number | null;
  duration_ms: number | null;
  album_name: string | null;
  note: string | null;
}

interface ImportedVideoMediaCandidate {
  mediaId: number;
  localUri: string;
  assetId: string | null;
  originalFilename: string | null;
  mediaCreatedAt: number | null;
  durationMs: number | null;
  albumName: string | null;
}

interface PRSourceSet {
  id: number;
  weight_kg: number | null;
  reps: number | null;
  performed_at: number | null;
}

/**
 * Read all rows from a backup table safely (handles missing columns)
 */
function readBackupTable<T>(backupDb: SQLiteDatabase, table: string, columns: string[]): T[] {
  try {
    // Check which columns exist in the backup
    const stmt = backupDb.prepareSync(`PRAGMA table_info(${table});`);
    let existingCols: Set<string>;
    try {
      const result = stmt.executeSync([]);
      const colRows = result.getAllSync() as Array<{ name: string }>;
      existingCols = new Set(colRows.map((r) => r.name));
    } finally {
      stmt.finalizeSync();
    }

    // Build SELECT with only existing columns (use NULL for missing)
    const selectCols = columns.map((col) => (existingCols.has(col) ? col : `NULL as ${col}`)).join(", ");
    const readStmt = backupDb.prepareSync(`SELECT ${selectCols} FROM ${table};`);
    try {
      const result = readStmt.executeSync([]);
      return result.getAllSync() as T[];
    } finally {
      readStmt.finalizeSync();
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(`${LOG_PREFIX} Failed to read ${table} from backup:`, error);
    }
    return [];
  }
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function sqlLiteral(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${escapeSqlString(value)}'`;
}

function queryLiveRows<T>(query: string): T[] {
  const stmt = sqlite.prepareSync(query);
  try {
    const result = stmt.executeSync([]);
    return result.getAllSync() as T[];
  } finally {
    stmt.finalizeSync();
  }
}

function findExistingExerciseId(backupUid: string, row: BackupExercise): number | null {
  const directRows = queryLiveRows<{ id: number }>(
    `SELECT id FROM exercises WHERE uid = ${sqlLiteral(backupUid)} LIMIT 1;`
  );
  if (directRows[0]?.id) {
    return directRows[0].id;
  }

  const nameRows = queryLiveRows<{ id: number }>(
    `SELECT id FROM exercises WHERE name = ${sqlLiteral(row.name)} LIMIT 1;`
  );
  return nameRows[0]?.id ?? null;
}

function findExistingWorkoutId(backupUid: string, row: BackupWorkout): number | null {
  const directRows = queryLiveRows<{ id: number }>(
    `SELECT id FROM workouts WHERE uid = ${sqlLiteral(backupUid)} LIMIT 1;`
  );
  if (directRows[0]?.id) {
    return directRows[0].id;
  }

  const candidates = queryLiveRows<LiveWorkoutCandidate>(
    `SELECT id, completed_at, note FROM workouts WHERE started_at = ${sqlLiteral(row.started_at)};`
  );
  return pickMatchingWorkoutId(row, candidates);
}

function findExistingWorkoutExerciseId(
  backupUid: string,
  row: BackupWorkoutExercise,
  liveWorkoutId: number,
  liveExerciseId: number
): number | null {
  const directRows = queryLiveRows<{ id: number }>(
    `SELECT id FROM workout_exercises WHERE uid = ${sqlLiteral(backupUid)} LIMIT 1;`
  );
  if (directRows[0]?.id) {
    return directRows[0].id;
  }

  const candidates = queryLiveRows<LiveWorkoutExerciseCandidate>(`
    SELECT id, order_index, note, completed_at, performed_at
    FROM workout_exercises
    WHERE workout_id = ${sqlLiteral(liveWorkoutId)}
      AND exercise_id = ${sqlLiteral(liveExerciseId)};
  `);
  return pickMatchingWorkoutExerciseId(row, candidates);
}

function findExistingSetId(
  backupUid: string,
  row: BackupSet,
  liveWorkoutId: number,
  liveExerciseId: number,
  liveWorkoutExerciseId: number | null
): number | null {
  const directRows = queryLiveRows<{ id: number }>(
    `SELECT id FROM sets WHERE uid = ${sqlLiteral(backupUid)} LIMIT 1;`
  );
  if (directRows[0]?.id) {
    return directRows[0].id;
  }

  const candidates = queryLiveRows<LiveSetCandidate>(`
    SELECT
      id,
      workout_exercise_id,
      set_group_id,
      set_index,
      weight_kg,
      reps,
      rpe,
      rir,
      is_warmup,
      note,
      superset_group_id,
      performed_at
    FROM sets
    WHERE workout_id = ${sqlLiteral(liveWorkoutId)}
      AND exercise_id = ${sqlLiteral(liveExerciseId)};
  `);
  return pickMatchingSetId(
    {
      ...row,
      workout_exercise_id: liveWorkoutExerciseId,
    },
    candidates
  );
}

function findExistingMediaId(
  row: BackupMedia,
  liveSetId: number | null,
  liveWorkoutId: number | null
): number | null {
  const whereClauses: string[] = [];

  if (liveSetId !== null) {
    whereClauses.push(`set_id = ${sqlLiteral(liveSetId)}`);
  } else {
    whereClauses.push("set_id IS NULL");
  }

  if (liveWorkoutId !== null) {
    whereClauses.push(`workout_id = ${sqlLiteral(liveWorkoutId)}`);
  } else {
    whereClauses.push("workout_id IS NULL");
  }

  const candidates = queryLiveRows<LiveMediaCandidate>(`
    SELECT id, asset_id, local_uri, original_filename, media_created_at, duration_ms, album_name, note
    FROM media
    WHERE ${whereClauses.join(" AND ")};
  `);

  return pickMatchingMediaId(row, candidates);
}

function isValidSetForPR(set: PRSourceSet): set is {
  id: number;
  weight_kg: number;
  reps: number;
  performed_at: number;
} {
  return (
    set.weight_kg !== null &&
    set.reps !== null &&
    set.performed_at !== null &&
    set.weight_kg > 0 &&
    set.reps > 0
  );
}

function rebuildImportedPREvents(exerciseIds: Iterable<number>): { inserted: number } {
  const uniqueExerciseIds = [...new Set(exerciseIds)].filter((exerciseId) => Number.isFinite(exerciseId));
  if (uniqueExerciseIds.length === 0) {
    return { inserted: 0 };
  }

  const inClause = uniqueExerciseIds.join(", ");
  sqlite.execSync(`DELETE FROM pr_events WHERE exercise_id IN (${inClause});`);

  const insertStmt = sqlite.prepareSync(`
    INSERT INTO pr_events (uid, set_id, exercise_id, type, metric_value, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?);
  `);

  let inserted = 0;

  try {
    for (const exerciseId of uniqueExerciseIds) {
      const rows = queryLiveRows<PRSourceSet>(`
        SELECT id, weight_kg, reps, performed_at
        FROM sets
        WHERE exercise_id = ${sqlLiteral(exerciseId)}
        ORDER BY performed_at, id;
      `);

      const bestByReps = new Map<number, number>();

      for (const row of rows) {
        if (!isValidSetForPR(row)) {
          continue;
        }

        const bestSoFar = bestByReps.get(row.reps);
        if (bestSoFar !== undefined && row.weight_kg <= bestSoFar) {
          continue;
        }

        bestByReps.set(row.reps, row.weight_kg);
        insertStmt.executeSync([
          newUid(),
          row.id,
          exerciseId,
          `${row.reps}rm`,
          row.weight_kg,
          row.performed_at,
        ]);
        inserted++;
      }
    }
  } finally {
    insertStmt.finalizeSync();
  }

  return { inserted };
}

async function repairImportedVideoLinks(
  candidates: ImportedVideoMediaCandidate[]
): Promise<number> {
  if (candidates.length === 0) {
    return 0;
  }

  const canReadLibrary = await ensureVideoLibraryPermission();
  if (!canReadLibrary) {
    return 0;
  }

  let relinked = 0;

  for (const candidate of candidates) {
    const storedFileMissing =
      isFileUri(candidate.localUri) && !(await doesFileUriExist(candidate.localUri));
    const needsRepair =
      storedFileMissing ||
      !candidate.localUri ||
      !isFileUri(candidate.localUri) ||
      isLikelyTransientUri(candidate.localUri);

    if (!needsRepair && candidate.assetId) {
      continue;
    }

    const resolved = await resolveVideoLibraryReference({
      assetId: candidate.assetId,
      originalFilename: candidate.originalFilename,
      mediaCreatedAt: candidate.mediaCreatedAt,
      durationMs: candidate.durationMs,
      albumName: candidate.albumName,
    });

    if (!resolved) {
      continue;
    }

    const resolvedUri = resolved.localUri ?? resolved.uri;
    if (!resolvedUri) {
      continue;
    }

    await updateMedia(candidate.mediaId, {
      local_uri: resolvedUri,
      asset_id: resolved.assetId,
      original_filename: resolved.originalFilename,
      media_created_at: resolved.mediaCreatedAt,
      duration_ms: resolved.durationMs,
      album_name: resolved.albumName,
    });
    relinked++;
  }

  return relinked;
}

/**
 * Merge exercises from backup into live DB
 */
function mergeExercises(
  backupDb: SQLiteDatabase,
  uidMap: Map<number, number> // backup.id -> live.id
): { inserted: number; updated: number } {
  const columns = ["id", "uid", "name", "description", "muscle_group", "equipment", "is_bodyweight", "created_at", "last_rest_seconds", "is_pinned"];
  const rows = readBackupTable<BackupExercise>(backupDb, "exercises", columns);

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    // Determine uid for this row (generate if missing)
    const backupUid = row.uid || newUid();
    const liveId = findExistingExerciseId(backupUid, row);

    if (liveId !== null) {
      // Existing row: fill missing fields only (COALESCE logic)
      sqlite.execSync(`
        UPDATE exercises SET
          uid = COALESCE(uid, ${sqlLiteral(backupUid)}),
          description = COALESCE(description, ${sqlLiteral(row.description)}),
          muscle_group = COALESCE(muscle_group, ${sqlLiteral(row.muscle_group)}),
          equipment = COALESCE(equipment, ${sqlLiteral(row.equipment)}),
          created_at = COALESCE(created_at, ${row.created_at ?? "NULL"}),
          last_rest_seconds = COALESCE(last_rest_seconds, ${row.last_rest_seconds ?? "NULL"})
        WHERE id = ${liveId};
      `);
      uidMap.set(row.id, liveId);
      updated++;
    } else {
      // Insert new row
      sqlite.execSync(`
        INSERT INTO exercises (uid, name, description, muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned)
        VALUES (
          ${sqlLiteral(backupUid)},
          ${sqlLiteral(row.name)},
          ${sqlLiteral(row.description)},
          ${sqlLiteral(row.muscle_group)},
          ${sqlLiteral(row.equipment)},
          ${row.is_bodyweight ?? 0},
          ${row.created_at ?? "NULL"},
          ${row.last_rest_seconds ?? "NULL"},
          ${row.is_pinned ?? 0}
        );
      `);
      // Get the inserted id
      const lastIdStmt = sqlite.prepareSync(`SELECT last_insert_rowid() as id;`);
      try {
        const result = lastIdStmt.executeSync([]);
        const idRows = result.getAllSync() as Array<{ id: number }>;
        uidMap.set(row.id, idRows[0]?.id ?? 0);
      } finally {
        lastIdStmt.finalizeSync();
      }
      inserted++;
    }
  }

  return { inserted, updated };
}

/**
 * Merge workouts from backup into live DB
 */
function mergeWorkouts(
  backupDb: SQLiteDatabase,
  uidMap: Map<number, number> // backup.id -> live.id
): { inserted: number; updated: number } {
  const columns = ["id", "uid", "started_at", "completed_at", "note"];
  const rows = readBackupTable<BackupWorkout>(backupDb, "workouts", columns);

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const backupUid = row.uid || newUid();
    const liveId = findExistingWorkoutId(backupUid, row);

    if (liveId !== null) {
      // Fill missing fields only
      sqlite.execSync(`
        UPDATE workouts SET
          uid = COALESCE(uid, ${sqlLiteral(backupUid)}),
          note = COALESCE(note, ${sqlLiteral(row.note)}),
          completed_at = COALESCE(completed_at, ${row.completed_at ?? "NULL"})
        WHERE id = ${liveId};
      `);
      uidMap.set(row.id, liveId);
      updated++;
    } else {
      // Insert new row
      sqlite.execSync(`
        INSERT INTO workouts (uid, started_at, completed_at, note)
        VALUES (
          ${sqlLiteral(backupUid)},
          ${row.started_at},
          ${row.completed_at ?? "NULL"},
          ${sqlLiteral(row.note)}
        );
      `);
      const lastIdStmt = sqlite.prepareSync(`SELECT last_insert_rowid() as id;`);
      try {
        const result = lastIdStmt.executeSync([]);
        const idRows = result.getAllSync() as Array<{ id: number }>;
        uidMap.set(row.id, idRows[0]?.id ?? 0);
      } finally {
        lastIdStmt.finalizeSync();
      }
      inserted++;
    }
  }

  return { inserted, updated };
}

/**
 * Merge workout_exercises from backup into live DB
 */
function mergeWorkoutExercises(
  backupDb: SQLiteDatabase,
  exerciseUidMap: Map<number, number>,
  workoutUidMap: Map<number, number>,
  uidMap: Map<number, number> // backup.id -> live.id
): { inserted: number; updated: number } {
  const columns = ["id", "uid", "workout_id", "exercise_id", "order_index", "note", "current_weight", "current_reps", "completed_at", "performed_at"];
  const rows = readBackupTable<BackupWorkoutExercise>(backupDb, "workout_exercises", columns);

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    // Resolve foreign keys
    const liveWorkoutId = workoutUidMap.get(row.workout_id);
    const liveExerciseId = exerciseUidMap.get(row.exercise_id);

    if (liveWorkoutId === undefined || liveExerciseId === undefined) {
      // Skip if we can't resolve FKs
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Skipping workout_exercise ${row.id}: missing FK mapping`);
      }
      continue;
    }

    const backupUid = row.uid || newUid();
    const liveId = findExistingWorkoutExerciseId(
      backupUid,
      row,
      liveWorkoutId,
      liveExerciseId
    );

    if (liveId !== null) {
      // Fill missing fields only
      sqlite.execSync(`
        UPDATE workout_exercises SET
          uid = COALESCE(uid, ${sqlLiteral(backupUid)}),
          note = COALESCE(note, ${sqlLiteral(row.note)}),
          order_index = COALESCE(order_index, ${row.order_index ?? "NULL"}),
          current_weight = COALESCE(current_weight, ${row.current_weight ?? "NULL"}),
          current_reps = COALESCE(current_reps, ${row.current_reps ?? "NULL"}),
          completed_at = COALESCE(completed_at, ${row.completed_at ?? "NULL"}),
          performed_at = COALESCE(performed_at, ${row.performed_at ?? "NULL"})
        WHERE id = ${liveId};
      `);
      uidMap.set(row.id, liveId);
      updated++;
    } else {
      // Insert new row
      sqlite.execSync(`
        INSERT INTO workout_exercises (uid, workout_id, exercise_id, order_index, note, current_weight, current_reps, completed_at, performed_at)
        VALUES (
          ${sqlLiteral(backupUid)},
          ${liveWorkoutId},
          ${liveExerciseId},
          ${row.order_index ?? "NULL"},
          ${sqlLiteral(row.note)},
          ${row.current_weight ?? "NULL"},
          ${row.current_reps ?? "NULL"},
          ${row.completed_at ?? "NULL"},
          ${row.performed_at ?? "NULL"}
        );
      `);
      const lastIdStmt = sqlite.prepareSync(`SELECT last_insert_rowid() as id;`);
      try {
        const result = lastIdStmt.executeSync([]);
        const idRows = result.getAllSync() as Array<{ id: number }>;
        uidMap.set(row.id, idRows[0]?.id ?? 0);
      } finally {
        lastIdStmt.finalizeSync();
      }
      inserted++;
    }
  }

  return { inserted, updated };
}

/**
 * Merge sets from backup into live DB
 */
function mergeSets(
  backupDb: SQLiteDatabase,
  exerciseUidMap: Map<number, number>,
  workoutUidMap: Map<number, number>,
  workoutExerciseUidMap: Map<number, number>,
  uidMap: Map<number, number> // backup.id -> live.id
): { inserted: number; updated: number } {
  const columns = ["id", "uid", "workout_id", "exercise_id", "workout_exercise_id", "set_group_id", "set_index", "weight_kg", "reps", "rpe", "rir", "is_warmup", "note", "superset_group_id", "performed_at"];
  const rows = readBackupTable<BackupSet>(backupDb, "sets", columns);

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    // Resolve foreign keys
    const liveWorkoutId = workoutUidMap.get(row.workout_id);
    const liveExerciseId = exerciseUidMap.get(row.exercise_id);
    const liveWorkoutExerciseId = row.workout_exercise_id !== null ? workoutExerciseUidMap.get(row.workout_exercise_id) : null;

    if (liveWorkoutId === undefined || liveExerciseId === undefined) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Skipping set ${row.id}: missing FK mapping`);
      }
      continue;
    }

    const backupUid = row.uid || newUid();
    const liveId = findExistingSetId(
      backupUid,
      row,
      liveWorkoutId,
      liveExerciseId,
      liveWorkoutExerciseId ?? null
    );

    if (liveId !== null) {
      sqlite.execSync(`
        UPDATE sets SET
          uid = COALESCE(uid, ${sqlLiteral(backupUid)}),
          workout_exercise_id = COALESCE(workout_exercise_id, ${sqlLiteral(liveWorkoutExerciseId)}),
          set_group_id = COALESCE(set_group_id, ${sqlLiteral(row.set_group_id)}),
          set_index = COALESCE(set_index, ${sqlLiteral(row.set_index)}),
          weight_kg = COALESCE(weight_kg, ${sqlLiteral(row.weight_kg)}),
          reps = COALESCE(reps, ${sqlLiteral(row.reps)}),
          rpe = COALESCE(rpe, ${sqlLiteral(row.rpe)}),
          rir = COALESCE(rir, ${sqlLiteral(row.rir)}),
          note = COALESCE(note, ${sqlLiteral(row.note)}),
          superset_group_id = COALESCE(superset_group_id, ${sqlLiteral(row.superset_group_id)}),
          performed_at = COALESCE(performed_at, ${sqlLiteral(row.performed_at)})
        WHERE id = ${liveId};
      `);
      uidMap.set(row.id, liveId);
      updated++;
      continue;
    }

    // Insert new row
    sqlite.execSync(`
      INSERT INTO sets (uid, workout_id, exercise_id, workout_exercise_id, set_group_id, set_index, weight_kg, reps, rpe, rir, is_warmup, note, superset_group_id, performed_at)
      VALUES (
        ${sqlLiteral(backupUid)},
        ${liveWorkoutId},
        ${liveExerciseId},
        ${sqlLiteral(liveWorkoutExerciseId)},
        ${sqlLiteral(row.set_group_id)},
        ${sqlLiteral(row.set_index)},
        ${sqlLiteral(row.weight_kg)},
        ${sqlLiteral(row.reps)},
        ${sqlLiteral(row.rpe)},
        ${sqlLiteral(row.rir)},
        ${row.is_warmup ?? 0},
        ${sqlLiteral(row.note)},
        ${sqlLiteral(row.superset_group_id)},
        ${sqlLiteral(row.performed_at)}
      );
    `);
    const lastIdStmt = sqlite.prepareSync(`SELECT last_insert_rowid() as id;`);
    try {
      const result = lastIdStmt.executeSync([]);
      const idRows = result.getAllSync() as Array<{ id: number }>;
      uidMap.set(row.id, idRows[0]?.id ?? 0);
    } finally {
      lastIdStmt.finalizeSync();
    }
    inserted++;
  }

  return { inserted, updated };
}

function mergeMedia(
  backupDb: SQLiteDatabase,
  workoutUidMap: Map<number, number>,
  setUidMap: Map<number, number>,
  relinkCandidates: ImportedVideoMediaCandidate[]
): { inserted: number; updated: number } {
  const columns = [
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
  ];
  const rows = readBackupTable<BackupMedia>(backupDb, "media", columns);

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const liveSetId =
      row.set_id !== null ? setUidMap.get(row.set_id) ?? null : null;
    const liveWorkoutId =
      row.workout_id !== null ? workoutUidMap.get(row.workout_id) ?? null : null;

    if (row.set_id !== null && liveSetId === null) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Skipping media ${row.id}: missing set mapping`);
      }
      continue;
    }

    if (row.workout_id !== null && liveWorkoutId === null) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Skipping media ${row.id}: missing workout mapping`);
      }
      continue;
    }

    const liveId = findExistingMediaId(row, liveSetId, liveWorkoutId);

    if (liveId !== null) {
      sqlite.execSync(`
        UPDATE media SET
          local_uri = COALESCE(local_uri, ${sqlLiteral(row.local_uri)}),
          asset_id = COALESCE(asset_id, ${sqlLiteral(row.asset_id)}),
          mime = COALESCE(mime, ${sqlLiteral(row.mime)}),
          set_id = COALESCE(set_id, ${sqlLiteral(liveSetId)}),
          workout_id = COALESCE(workout_id, ${sqlLiteral(liveWorkoutId)}),
          note = COALESCE(note, ${sqlLiteral(row.note)}),
          created_at = COALESCE(created_at, ${sqlLiteral(row.created_at)}),
          original_filename = COALESCE(original_filename, ${sqlLiteral(row.original_filename)}),
          media_created_at = COALESCE(media_created_at, ${sqlLiteral(row.media_created_at)}),
          duration_ms = COALESCE(duration_ms, ${sqlLiteral(row.duration_ms)}),
          album_name = COALESCE(album_name, ${sqlLiteral(row.album_name)})
        WHERE id = ${liveId};
      `);
      updated++;
    } else {
      sqlite.execSync(`
        INSERT INTO media (
          local_uri,
          asset_id,
          mime,
          set_id,
          workout_id,
          note,
          created_at,
          original_filename,
          media_created_at,
          duration_ms,
          album_name
        )
        VALUES (
          ${sqlLiteral(row.local_uri)},
          ${sqlLiteral(row.asset_id)},
          ${sqlLiteral(row.mime)},
          ${sqlLiteral(liveSetId)},
          ${sqlLiteral(liveWorkoutId)},
          ${sqlLiteral(row.note)},
          ${sqlLiteral(row.created_at)},
          ${sqlLiteral(row.original_filename)},
          ${sqlLiteral(row.media_created_at)},
          ${sqlLiteral(row.duration_ms)},
          ${sqlLiteral(row.album_name)}
        );
      `);
      const lastIdRows = queryLiveRows<{ id: number }>(
        "SELECT last_insert_rowid() as id;"
      );
      if (
        lastIdRows[0]?.id &&
        (row.mime ?? "video/unknown").toLowerCase().startsWith("video/")
      ) {
        relinkCandidates.push({
          mediaId: lastIdRows[0].id,
          localUri: row.local_uri,
          assetId: row.asset_id,
          originalFilename: row.original_filename,
          mediaCreatedAt: row.media_created_at,
          durationMs: row.duration_ms,
          albumName: row.album_name,
        });
      }
      inserted++;
      continue;
    }

    if ((row.mime ?? "video/unknown").toLowerCase().startsWith("video/")) {
      relinkCandidates.push({
        mediaId: liveId,
        localUri: row.local_uri,
        assetId: row.asset_id,
        originalFilename: row.original_filename,
        mediaCreatedAt: row.media_created_at,
        durationMs: row.duration_ms,
        albumName: row.album_name,
      });
    }
  }

  return { inserted, updated };
}

/**
 * Import a database backup using merge (no restart required)
 */
export async function importDatabaseBackup(): Promise<MergeResult> {
  const startTime = Date.now();
  console.log(`${LOG_PREFIX} Starting merge-based database backup import.`);

  // Let user pick a .db file
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/x-sqlite3", "application/octet-stream", "*/*"],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    console.log(`${LOG_PREFIX} Import cancelled by user.`);
    throw new ExportCancelledError();
  }

  const pickedFile = result.assets[0];
  console.log(`${LOG_PREFIX} Picked file:`, { name: pickedFile.name, uri: pickedFile.uri });

  // Validate SQLite header
  const isValid = await validateSqliteHeader(pickedFile.uri);
  if (!isValid) {
    throw new InvalidBackupError("The selected file is not a valid SQLite database.");
  }

  // Copy backup to app's SQLite directory
  await copyBackupToSqliteDir(pickedFile.uri);

  // Open backup database by name
  let backupDb: SQLiteDatabase;
  try {
    backupDb = openDatabaseSync(BACKUP_TEMP_DB_NAME);
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Opened backup database.`);
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to open backup database:`, error);
    deleteTempBackupDb();
    throw new InvalidBackupError("Failed to open backup database.");
  }

  // Maps: backup.id -> live.id
  const exerciseUidMap = new Map<number, number>();
  const workoutUidMap = new Map<number, number>();
  const workoutExerciseUidMap = new Map<number, number>();
  const setUidMap = new Map<number, number>();
  const importedVideoCandidates: ImportedVideoMediaCandidate[] = [];

  let mergeResult: MergeResult;

  try {
    // Begin transaction on live DB
    sqlite.execSync("BEGIN TRANSACTION;");

    try {
      // Merge in FK order, then rebuild derived PR events from merged sets.
      const exercisesResult = mergeExercises(backupDb, exerciseUidMap);
      const workoutsResult = mergeWorkouts(backupDb, workoutUidMap);
      const workoutExercisesResult = mergeWorkoutExercises(backupDb, exerciseUidMap, workoutUidMap, workoutExerciseUidMap);
      const setsResult = mergeSets(backupDb, exerciseUidMap, workoutUidMap, workoutExerciseUidMap, setUidMap);
      const mediaResult = mergeMedia(backupDb, workoutUidMap, setUidMap, importedVideoCandidates);
      const prEventsResult = rebuildImportedPREvents(exerciseUidMap.values());

      sqlite.execSync("COMMIT;");

      const relinkedMediaCount = await repairImportedVideoLinks(importedVideoCandidates);

      mergeResult = {
        exercises: exercisesResult,
        workouts: workoutsResult,
        workoutExercises: workoutExercisesResult,
        sets: setsResult,
        prEvents: prEventsResult,
        media: {
          ...mediaResult,
          relinked: relinkedMediaCount,
        },
        durationMs: Date.now() - startTime,
      };

      if (__DEV__) {
        console.log(`${LOG_PREFIX} Merge complete:`, mergeResult);
      }
    } catch (error) {
      sqlite.execSync("ROLLBACK;");
      console.warn(`${LOG_PREFIX} Merge failed, rolled back:`, error);
      throw error;
    }
  } finally {
    // Close backup database handle
    try {
      backupDb.closeSync();
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Closed backup database.`);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Failed to close backup database:`, error);
      }
    }

    // Delete temp backup file
    deleteTempBackupDb();
  }

  console.log(`${LOG_PREFIX} Merge import completed successfully.`);
  return mergeResult;
}
