import { File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { sqlite, hasColumn } from "../db/connection";

type ExportRow = {
  setPerformedAt: number | null;
  workoutExercisePerformedAt: number | null;
  workoutStartedAt: number | null;
  exerciseName: string;
  reps: number | null;
  weightKg: number | null;
  setNote: string | null;
  workoutExerciseNote: string | null;
};

const CSV_HEADERS = ["Date", "Time", "Exercise", "# of Reps", "Weight", "Notes"];
const LOG_PREFIX = "[exportCsv]";
const CSV_FILENAME = "workoutlog-export.csv";
type ExportSaveMethod = "android_saf" | "ios_export" | "fallback_share";

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

function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateTime(timestamp: number | null): { date: string; time: string } {
  if (timestamp === null || timestamp === undefined) {
    return { date: "", time: "" };
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

function logRuntimeDiagnostics(): void {
  if (!__DEV__) return;
  try {
    // Access Paths at runtime, not at module load
    const cacheUri = Paths.cache?.uri ?? null;
    const documentUri = Paths.document?.uri ?? null;
    const bundleUri = Paths.bundle?.uri ?? null;
    console.log(`${LOG_PREFIX} Runtime diagnostics:`, {
      platform: Platform.OS,
      cacheUri,
      documentUri,
      bundleUri,
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to get runtime diagnostics:`, error);
  }
}

function writeTempCsvFile(csvContent: string): File {
  logRuntimeDiagnostics();

  const cacheDir = Paths.cache ?? Paths.document;
  if (!cacheDir) {
    console.warn(`${LOG_PREFIX} No writable cache/document directory available.`);
    throw new FileSystemUnavailableError(
      "Export requires a development build or production APK. File system is not available in this runtime."
    );
  }

  const file = new File(cacheDir, CSV_FILENAME);

  console.log(`${LOG_PREFIX} Writing CSV to:`, file.uri);

  try {
    file.create({ intermediates: true, overwrite: true });
    file.write(csvContent, { encoding: "utf8" });
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to write CSV file:`, error);
    throw error;
  }

  try {
    const info = file.info();
    console.log(`${LOG_PREFIX} CSV file info:`, { exists: info.exists, uri: file.uri });
  } catch (error) {
    console.warn(`${LOG_PREFIX} Unable to verify CSV file:`, error);
  }

  return file;
}

async function saveWithAndroidSaf(csvContent: string): Promise<string> {
  const { StorageAccessFramework } = LegacyFileSystem;
  if (!StorageAccessFramework?.requestDirectoryPermissionsAsync) {
    throw new FileSystemUnavailableError("Storage Access Framework is unavailable.");
  }

  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    throw new ExportCancelledError();
  }

  const fileName = CSV_FILENAME.replace(/\.csv$/i, "");
  const fileUri = await StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    fileName,
    "text/csv"
  );

  await LegacyFileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: LegacyFileSystem.EncodingType.UTF8,
  });

  return fileUri;
}

function buildCsvContent(): { csv: string; rowCount: number } {
  console.log(`${LOG_PREFIX} Building CSV content.`);
  const hasWorkoutExercisePerformedAt = hasColumn("workout_exercises", "performed_at");
  console.log(`${LOG_PREFIX} workout_exercises.performed_at:`, hasWorkoutExercisePerformedAt);

  const workoutExercisePerformedAtSelect = hasWorkoutExercisePerformedAt
    ? "we.performed_at AS workoutExercisePerformedAt"
    : "NULL AS workoutExercisePerformedAt";
  const workoutExercisePerformedAtOrder = hasWorkoutExercisePerformedAt ? "we.performed_at" : "NULL";

  const stmt = sqlite.prepareSync(`
    SELECT
      s.performed_at AS setPerformedAt,
      ${workoutExercisePerformedAtSelect},
      w.started_at AS workoutStartedAt,
      e.name AS exerciseName,
      s.reps AS reps,
      s.weight_kg AS weightKg,
      s.note AS setNote,
      we.note AS workoutExerciseNote
    FROM sets s
    INNER JOIN exercises e ON e.id = s.exercise_id
    LEFT JOIN workout_exercises we ON we.id = s.workout_exercise_id
    LEFT JOIN workouts w ON w.id = s.workout_id
    ORDER BY COALESCE(s.performed_at, ${workoutExercisePerformedAtOrder}, w.started_at), s.id
  `);

  let rows: ExportRow[] = [];
  try {
    const result = stmt.executeSync([]);
    rows = result.getAllSync() as ExportRow[];
    console.log(`${LOG_PREFIX} Rows fetched:`, rows.length);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to query export rows:`, error);
    throw error;
  } finally {
    stmt.finalizeSync();
  }

  const lines: string[] = [CSV_HEADERS.join(",")];

  for (const row of rows) {
    const performedAt = row.setPerformedAt ?? row.workoutExercisePerformedAt ?? row.workoutStartedAt ?? null;
    const { date, time } = formatDateTime(performedAt);
    const setNote = row.setNote ?? "";
    const notes = setNote.trim().length > 0 ? setNote : row.workoutExerciseNote ?? "";

    const values = [
      date,
      time,
      row.exerciseName ?? "",
      row.reps ?? "",
      row.weightKg ?? "",
      notes,
    ];
    lines.push(values.map(escapeCsvValue).join(","));
  }

  const csvBody = lines.join("\r\n");
  // Add UTF-8 BOM for Excel compatibility
  const csvWithBom = `\uFEFF${csvBody}`;

  return { csv: csvWithBom, rowCount: rows.length };
}

export async function exportTrainingCsv(): Promise<{ path: string; rowCount: number }> {
  console.log(`${LOG_PREFIX} Starting export.`);

  const { csv, rowCount } = buildCsvContent();
  const tempFile = writeTempCsvFile(csv);
  const path = tempFile.uri;

  console.log(`${LOG_PREFIX} Export complete.`, { path, rowCount });
  return { path, rowCount };
}

export async function exportTrainingCsvToUserSaveLocation(): Promise<{ uri: string; method: ExportSaveMethod }> {
  console.log(`${LOG_PREFIX} Starting export (save flow).`);

  const { csv } = buildCsvContent();
  const tempFile = writeTempCsvFile(csv);

  if (Platform.OS === "android") {
    const uri = await saveWithAndroidSaf(csv);
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Save method`, { method: "android_saf", uri });
    }
    return { uri, method: "android_saf" };
  }

  if (__DEV__) {
    console.log(`${LOG_PREFIX} Save method`, { method: "fallback_share", uri: tempFile.uri });
  }
  return { uri: tempFile.uri, method: "fallback_share" };
}
