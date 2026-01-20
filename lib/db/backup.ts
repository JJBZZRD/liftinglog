import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { newUid } from "../utils/uid";
import { sqlite } from "./connection";

const LOG_PREFIX = "[backup]";
const DB_NAME = "workoutlog.db";
const BACKUP_TEMP_DB_NAME = "backup-import-temp.db";
const SQLITE_HEADER = "SQLite format 3";

/** Merge result returned after import */
export interface MergeResult {
  exercises: { inserted: number; updated: number };
  workouts: { inserted: number; updated: number };
  workoutExercises: { inserted: number; updated: number };
  sets: { inserted: number };
  prEvents: { inserted: number };
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
  return `workoutlog-backup-${year}${month}${day}-${hours}${minutes}${seconds}.db`;
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

interface BackupPREvent {
  id: number;
  uid: string | null;
  set_id: number;
  exercise_id: number;
  type: string;
  metric_value: number;
  occurred_at: number;
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

    // Try to find existing by uid first
    let liveId: number | null = null;
    const uidStmt = sqlite.prepareSync(`SELECT id FROM exercises WHERE uid = ?;`);
    try {
      const result = uidStmt.executeSync([backupUid]);
      const liveRows = result.getAllSync() as Array<{ id: number }>;
      liveId = liveRows[0]?.id ?? null;
    } finally {
      uidStmt.finalizeSync();
    }

    // Fallback: match by name (unique) if no uid match
    if (liveId === null) {
      const nameStmt = sqlite.prepareSync(`SELECT id FROM exercises WHERE name = ?;`);
      try {
        const result = nameStmt.executeSync([row.name]);
        const liveRows = result.getAllSync() as Array<{ id: number }>;
        liveId = liveRows[0]?.id ?? null;
      } finally {
        nameStmt.finalizeSync();
      }
    }

    if (liveId !== null) {
      // Existing row: fill missing fields only (COALESCE logic)
      sqlite.execSync(`
        UPDATE exercises SET
          uid = COALESCE(uid, '${backupUid}'),
          description = COALESCE(description, ${row.description ? `'${row.description.replace(/'/g, "''")}'` : "NULL"}),
          muscle_group = COALESCE(muscle_group, ${row.muscle_group ? `'${row.muscle_group.replace(/'/g, "''")}'` : "NULL"}),
          equipment = COALESCE(equipment, ${row.equipment ? `'${row.equipment.replace(/'/g, "''")}'` : "NULL"}),
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
          '${backupUid}',
          '${row.name.replace(/'/g, "''")}',
          ${row.description ? `'${row.description.replace(/'/g, "''")}'` : "NULL"},
          ${row.muscle_group ? `'${row.muscle_group.replace(/'/g, "''")}'` : "NULL"},
          ${row.equipment ? `'${row.equipment.replace(/'/g, "''")}'` : "NULL"},
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

    // Try to find existing by uid
    let liveId: number | null = null;
    const uidStmt = sqlite.prepareSync(`SELECT id FROM workouts WHERE uid = ?;`);
    try {
      const result = uidStmt.executeSync([backupUid]);
      const liveRows = result.getAllSync() as Array<{ id: number }>;
      liveId = liveRows[0]?.id ?? null;
    } finally {
      uidStmt.finalizeSync();
    }

    // No fallback matching for workouts (too risky)

    if (liveId !== null) {
      // Fill missing fields only
      sqlite.execSync(`
        UPDATE workouts SET
          uid = COALESCE(uid, '${backupUid}'),
          note = COALESCE(note, ${row.note ? `'${row.note.replace(/'/g, "''")}'` : "NULL"}),
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
          '${backupUid}',
          ${row.started_at},
          ${row.completed_at ?? "NULL"},
          ${row.note ? `'${row.note.replace(/'/g, "''")}'` : "NULL"}
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

    // Try to find existing by uid
    let liveId: number | null = null;
    const uidStmt = sqlite.prepareSync(`SELECT id FROM workout_exercises WHERE uid = ?;`);
    try {
      const result = uidStmt.executeSync([backupUid]);
      const liveRows = result.getAllSync() as Array<{ id: number }>;
      liveId = liveRows[0]?.id ?? null;
    } finally {
      uidStmt.finalizeSync();
    }

    if (liveId !== null) {
      // Fill missing fields only
      sqlite.execSync(`
        UPDATE workout_exercises SET
          uid = COALESCE(uid, '${backupUid}'),
          note = COALESCE(note, ${row.note ? `'${row.note.replace(/'/g, "''")}'` : "NULL"}),
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
          '${backupUid}',
          ${liveWorkoutId},
          ${liveExerciseId},
          ${row.order_index ?? "NULL"},
          ${row.note ? `'${row.note.replace(/'/g, "''")}'` : "NULL"},
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
): { inserted: number } {
  const columns = ["id", "uid", "workout_id", "exercise_id", "workout_exercise_id", "set_group_id", "set_index", "weight_kg", "reps", "rpe", "rir", "is_warmup", "note", "superset_group_id", "performed_at"];
  const rows = readBackupTable<BackupSet>(backupDb, "sets", columns);

  let inserted = 0;

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

    // Check if already exists by uid (insert-only for sets)
    const uidStmt = sqlite.prepareSync(`SELECT id FROM sets WHERE uid = ?;`);
    let liveId: number | null = null;
    try {
      const result = uidStmt.executeSync([backupUid]);
      const liveRows = result.getAllSync() as Array<{ id: number }>;
      liveId = liveRows[0]?.id ?? null;
    } finally {
      uidStmt.finalizeSync();
    }

    if (liveId !== null) {
      // Already exists, just map
      uidMap.set(row.id, liveId);
      continue;
    }

    // Insert new row
    sqlite.execSync(`
      INSERT INTO sets (uid, workout_id, exercise_id, workout_exercise_id, set_group_id, set_index, weight_kg, reps, rpe, rir, is_warmup, note, superset_group_id, performed_at)
      VALUES (
        '${backupUid}',
        ${liveWorkoutId},
        ${liveExerciseId},
        ${liveWorkoutExerciseId ?? "NULL"},
        ${row.set_group_id ? `'${row.set_group_id.replace(/'/g, "''")}'` : "NULL"},
        ${row.set_index ?? "NULL"},
        ${row.weight_kg ?? "NULL"},
        ${row.reps ?? "NULL"},
        ${row.rpe ?? "NULL"},
        ${row.rir ?? "NULL"},
        ${row.is_warmup ?? 0},
        ${row.note ? `'${row.note.replace(/'/g, "''")}'` : "NULL"},
        ${row.superset_group_id ? `'${row.superset_group_id.replace(/'/g, "''")}'` : "NULL"},
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

  return { inserted };
}

/**
 * Merge pr_events from backup into live DB
 */
function mergePREvents(
  backupDb: SQLiteDatabase,
  exerciseUidMap: Map<number, number>,
  setUidMap: Map<number, number>
): { inserted: number } {
  const columns = ["id", "uid", "set_id", "exercise_id", "type", "metric_value", "occurred_at"];
  const rows = readBackupTable<BackupPREvent>(backupDb, "pr_events", columns);

  let inserted = 0;

  for (const row of rows) {
    const liveSetId = setUidMap.get(row.set_id);
    const liveExerciseId = exerciseUidMap.get(row.exercise_id);

    if (liveSetId === undefined || liveExerciseId === undefined) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Skipping pr_event ${row.id}: missing FK mapping`);
      }
      continue;
    }

    const backupUid = row.uid || newUid();

    // Check if already exists by uid (insert-only)
    const uidStmt = sqlite.prepareSync(`SELECT id FROM pr_events WHERE uid = ?;`);
    let liveId: number | null = null;
    try {
      const result = uidStmt.executeSync([backupUid]);
      const liveRows = result.getAllSync() as Array<{ id: number }>;
      liveId = liveRows[0]?.id ?? null;
    } finally {
      uidStmt.finalizeSync();
    }

    if (liveId !== null) {
      // Already exists, skip
      continue;
    }

    // Insert new row
    sqlite.execSync(`
      INSERT INTO pr_events (uid, set_id, exercise_id, type, metric_value, occurred_at)
      VALUES (
        '${backupUid}',
        ${liveSetId},
        ${liveExerciseId},
        '${row.type.replace(/'/g, "''")}',
        ${row.metric_value},
        ${row.occurred_at}
      );
    `);
    inserted++;
  }

  return { inserted };
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

  let mergeResult: MergeResult;

  try {
    // Begin transaction on live DB
    sqlite.execSync("BEGIN TRANSACTION;");

    try {
      // Merge in FK order: exercises -> workouts -> workout_exercises -> sets -> pr_events
      const exercisesResult = mergeExercises(backupDb, exerciseUidMap);
      const workoutsResult = mergeWorkouts(backupDb, workoutUidMap);
      const workoutExercisesResult = mergeWorkoutExercises(backupDb, exerciseUidMap, workoutUidMap, workoutExerciseUidMap);
      const setsResult = mergeSets(backupDb, exerciseUidMap, workoutUidMap, workoutExerciseUidMap, setUidMap);
      const prEventsResult = mergePREvents(backupDb, exerciseUidMap, setUidMap);

      sqlite.execSync("COMMIT;");

      mergeResult = {
        exercises: exercisesResult,
        workouts: workoutsResult,
        workoutExercises: workoutExercisesResult,
        sets: setsResult,
        prEvents: prEventsResult,
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
