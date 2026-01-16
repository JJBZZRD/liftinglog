import * as FileSystem from "expo-file-system";
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

export async function exportTrainingCsv(): Promise<{ path: string; rowCount: number }> {
  const hasWorkoutExercisePerformedAt = hasColumn("workout_exercises", "performed_at");
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
  const csvWithBom = `\uFEFF${csvBody}`;

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error("Cache directory is unavailable.");
  }

  const path = `${cacheDirectory}workoutlog-export.csv`;
  await FileSystem.writeAsStringAsync(path, csvWithBom, { encoding: FileSystem.EncodingType.UTF8 });
  return { path, rowCount: rows.length };
}
