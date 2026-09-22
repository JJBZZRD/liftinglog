import { Directory, File, Paths } from "expo-file-system";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { applicationId } from "expo-application";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { initializeDatabase } from "../lib/db/bootstrap";
import {
  prepareReplacementRestore,
  scheduleReplacementRestore,
} from "../lib/db/replacementRestore";
import type { AppTable, RestoreStartupResult } from "../lib/db/replacementRestoreContract";
import { reconcileReplacementRestoreMedia } from "../lib/db/replacementRestoreMedia";
import {
  discardReplacementRestoreCandidate,
  getReplacementRestoreStagingRootUri,
  hashReplacementRestoreCandidate,
  hashReplacementRestoreCandidateSync,
  prepareReplacementCandidate,
  replacementRestoreCandidateExists,
} from "../lib/db/replacementRestorePreparation";
import {
  isTrustedRestoreId,
  parsePendingRestoreRecord,
  readCommittedRestoreOutcome,
  readPendingRestoreRecord,
  requireOwnedCandidatePath,
  type PendingRestoreRecord,
} from "../lib/db/replacementRestoreRecords";
import {
  createReplacementRestoreRuntime,
  type ReplacementRestoreEngine,
} from "../lib/db/replacementRestoreRuntime";
import {
  openValidatedReplacementSession,
  readReplacementTableCounts,
  type ReplacementSqliteConnection,
  type ValidatedReplacementSession,
} from "../lib/db/replacementRestoreTransaction";
import { RESTORE_APP_TABLES } from "../lib/db/restoreSchemaManifest";
import {
  getNativeProcessToken,
  isNativeProcessToken,
  type NativeProcessToken,
} from "../lib/native/appProcessIdentity";
import {
  deleteRestoreControlRecord,
  readRestoreControlRecord,
  writeRestoreControlRecord,
  type RestoreControlRecordName,
} from "../lib/native/restoreControlStore";
import { sha256File } from "../lib/utils/fileSha256";
import { newUid } from "../lib/utils/uid";

export const RESTORE_KILL_PROBE_DIRECTORY = "restore-engine-kill-probe-v1";
export const RESTORE_KILL_HOLD_MILLIS = 60_000;
export const RESTORE_KILL_PROBE_APPLICATION_ID =
  "com.anonymous.LiftingLog.restorekillprobe";

const SOURCE_NAME = "source-populated.db";
const LIVE_NAME = "live-scratch.db";
const OWNERSHIP_NAME = "ownership.json";
const ARM_NAME = "kill-arm.json";
const REACHED_NAME = "kill-reached.json";
const LIVE_ONLY_WORKOUT_ID = 96_001;
const LIVE_ONLY_TAG_ID = 96_002;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RUN_ID_PATTERN = /^kill-run-v1:[A-Za-z0-9-]{8,100}$/;

export const RESTORE_KILL_POINTS = [
  "before_attempt",
  "after_attempt",
  "precommit",
  "postcommit",
  "postoutcome",
  "postdelete",
] as const;

export type RestoreKillPoint = (typeof RESTORE_KILL_POINTS)[number];

type OwnershipReceipt = {
  readonly version: 1;
  readonly runId: string;
  readonly restoreId: string;
  readonly sourceSha256: string;
  readonly candidatePath: string;
  readonly candidateSha256: string;
};

type CheckpointReceipt = {
  readonly version: 1;
  readonly runId: string;
  readonly restoreId: string;
  readonly point: RestoreKillPoint;
  readonly nativeProcessToken: NativeProcessToken;
};

type Snapshot = {
  readonly counts: Record<AppTable, number>;
  readonly rows: Record<AppTable, Record<string, unknown>[]>;
  readonly integrity: boolean;
  readonly foreignKeys: boolean;
  readonly softLinks: boolean;
};

type Evidence = {
  readonly label: string;
  readonly detail: string;
};

type DiagnosticRuntime = {
  readonly engine: ReplacementRestoreEngine;
  readonly transactionCalls: { current: number };
};

function probeEnabled(): boolean {
  return (
    __DEV__ &&
    Platform.OS === "android" &&
    applicationId === RESTORE_KILL_PROBE_APPLICATION_ID &&
    process.env.EXPO_PUBLIC_RESTORE_KILL_PROBE === "1"
  );
}

function requireProbeEnabled(): void {
  if (!probeEnabled()) {
    throw new Error(
      `Restore kill diagnostic requires a development Android build with application ID ${RESTORE_KILL_PROBE_APPLICATION_ID} and EXPO_PUBLIC_RESTORE_KILL_PROBE=1.`
    );
  }
}

function boundedError(error: unknown): string {
  const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return value.replace(/\s+/g, " ").slice(0, 260);
}

function resultSummary(result: RestoreStartupResult): string {
  if (result.status === "failed") {
    return `${result.status} (${result.error.code}; ${result.error.transactionState}; ${result.error.liveDatabaseChanged}; ${result.error.recovery})`;
  }
  return result.status;
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…`;
}

function probeDirectory(): Directory {
  return new Directory(Paths.document, RESTORE_KILL_PROBE_DIRECTORY);
}

function sourceFile(): File {
  return new File(probeDirectory(), SOURCE_NAME);
}

function liveFile(): File {
  return new File(probeDirectory(), LIVE_NAME);
}

function ownershipFile(): File {
  return new File(probeDirectory(), OWNERSHIP_NAME);
}

function armFile(): File {
  return new File(probeDirectory(), ARM_NAME);
}

function reachedFile(): File {
  return new File(probeDirectory(), REACHED_NAME);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(record).sort().join(",") === [...expected].sort().join(",");
}

function isKillPoint(value: unknown): value is RestoreKillPoint {
  return RESTORE_KILL_POINTS.includes(value as RestoreKillPoint);
}

function parseOwnershipReceipt(value: unknown): OwnershipReceipt {
  if (!isPlainRecord(value) || !exactKeys(value, [
    "version",
    "runId",
    "restoreId",
    "sourceSha256",
    "candidatePath",
    "candidateSha256",
  ])) {
    throw new Error("Probe ownership receipt has an unknown shape.");
  }
  if (
    value.version !== 1 ||
    typeof value.runId !== "string" ||
    !RUN_ID_PATTERN.test(value.runId) ||
    !isTrustedRestoreId(value.restoreId) ||
    typeof value.sourceSha256 !== "string" ||
    !SHA256_PATTERN.test(value.sourceSha256) ||
    typeof value.candidateSha256 !== "string" ||
    !SHA256_PATTERN.test(value.candidateSha256)
  ) {
    throw new Error("Probe ownership receipt is malformed.");
  }
  const candidatePath = requireOwnedCandidatePath(
    value.candidatePath,
    getReplacementRestoreStagingRootUri(),
    value.restoreId
  );
  return {
    version: 1,
    runId: value.runId,
    restoreId: value.restoreId,
    sourceSha256: value.sourceSha256,
    candidatePath,
    candidateSha256: value.candidateSha256,
  };
}

function parseCheckpointReceipt(value: unknown): CheckpointReceipt {
  if (!isPlainRecord(value) || !exactKeys(value, [
    "version",
    "runId",
    "restoreId",
    "point",
    "nativeProcessToken",
  ])) {
    throw new Error("Probe checkpoint receipt has an unknown shape.");
  }
  if (
    value.version !== 1 ||
    typeof value.runId !== "string" ||
    !RUN_ID_PATTERN.test(value.runId) ||
    !isTrustedRestoreId(value.restoreId) ||
    !isKillPoint(value.point) ||
    !isNativeProcessToken(value.nativeProcessToken)
  ) {
    throw new Error("Probe checkpoint receipt is malformed.");
  }
  return {
    version: 1,
    runId: value.runId,
    restoreId: value.restoreId,
    point: value.point,
    nativeProcessToken: value.nativeProcessToken,
  };
}

function readJson(file: File): unknown {
  try {
    return JSON.parse(file.textSync()) as unknown;
  } catch {
    throw new Error(`${file.name} is unreadable; preserving all diagnostic state.`);
  }
}

function readOwnershipReceipt(): OwnershipReceipt {
  const file = ownershipFile();
  if (!file.exists) {
    throw new Error("No probe ownership receipt exists; fixed native controls are not adopted.");
  }
  return parseOwnershipReceipt(readJson(file));
}

function readOptionalCheckpoint(file: File): CheckpointReceipt | null {
  return file.exists ? parseCheckpointReceipt(readJson(file)) : null;
}

function sameCheckpoint(left: CheckpointReceipt, right: CheckpointReceipt): boolean {
  return (
    left.version === right.version &&
    left.runId === right.runId &&
    left.restoreId === right.restoreId &&
    left.point === right.point &&
    left.nativeProcessToken === right.nativeProcessToken
  );
}

function writeAndVerifyOwnership(receipt: OwnershipReceipt): void {
  requireProbeEnabled();
  const file = ownershipFile();
  if (file.exists) throw new Error("Ownership receipt already exists; overwrite refused.");
  file.write(JSON.stringify(receipt));
  const verified = readOwnershipReceipt();
  if (JSON.stringify(verified) !== JSON.stringify(receipt)) {
    throw new Error("Ownership receipt readback did not match; controls and candidate are retained.");
  }
}

function writeAndVerifyCheckpoint(file: File, receipt: CheckpointReceipt): void {
  requireProbeEnabled();
  if (file.exists) throw new Error(`${file.name} already exists; overwrite refused.`);
  file.write(JSON.stringify(receipt));
  const verified = readOptionalCheckpoint(file);
  if (!verified || !sameCheckpoint(verified, receipt)) {
    throw new Error(`${file.name} readback did not match; diagnostic state is retained.`);
  }
}

function requireCheckpointOwnership(
  checkpoint: CheckpointReceipt,
  ownership: OwnershipReceipt
): void {
  if (
    checkpoint.runId !== ownership.runId ||
    checkpoint.restoreId !== ownership.restoreId
  ) {
    throw new Error("Checkpoint receipt does not match strict probe ownership.");
  }
}

function rows<T extends Record<string, unknown>>(
  sqlite: SQLiteDatabase | ReplacementSqliteConnection,
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  return sqlite.getAllSync<T>(sql, params);
}

function oneCount(sqlite: SQLiteDatabase, sql: string): number {
  return Number(rows<{ count: number }>(sqlite, sql)[0]?.count ?? Number.NaN);
}

function readSnapshot(sqlite: SQLiteDatabase): Snapshot {
  const rowsByTable = Object.fromEntries(
    RESTORE_APP_TABLES.map((table) => [
      table,
      rows<Record<string, unknown>>(sqlite, `SELECT * FROM "${table}" ORDER BY rowid;`),
    ])
  ) as Record<AppTable, Record<string, unknown>[]>;
  const integrity = rows<Record<string, unknown>>(sqlite, "PRAGMA integrity_check;");
  const foreignKeys = rows<Record<string, unknown>>(sqlite, "PRAGMA foreign_key_check;");
  const staleSoftLinks = oneCount(
    sqlite,
    `SELECT COUNT(*) AS count
       FROM program_calendar_exercises AS pce
      WHERE pce.workout_exercise_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM workout_exercises AS we WHERE we.id = pce.workout_exercise_id
        );`
  );
  return {
    counts: readReplacementTableCounts(sqlite),
    rows: rowsByTable,
    integrity: integrity.length === 1 && Object.values(integrity[0])[0] === "ok",
    foreignKeys: foreignKeys.length === 0,
    softLinks: staleSoftLinks === 0,
  };
}

function stableRows(value: readonly Record<string, unknown>[]): string {
  return JSON.stringify(value);
}

function expectedLiveRows(table: AppTable, source: readonly Record<string, unknown>[]) {
  if (table === "media") return source.map((row) => ({ ...row, local_uri: "" }));
  if (table === "pr_events") return source.map(({ id: _id, uid: _uid, ...row }) => row);
  return source;
}

function actualLiveRows(table: AppTable, live: readonly Record<string, unknown>[]) {
  if (table === "pr_events") return live.map(({ id: _id, uid: _uid, ...row }) => row);
  return live;
}

function snapshotEvidence(
  source: Snapshot,
  live: Snapshot,
  candidate: Snapshot | null
): Evidence[] {
  const result: Evidence[] = RESTORE_APP_TABLES.map((table) => {
    const candidateExact = candidate
      ? stableRows(source.rows[table]) === stableRows(candidate.rows[table])
      : null;
    const liveExact =
      stableRows(expectedLiveRows(table, source.rows[table])) ===
      stableRows(actualLiveRows(table, live.rows[table]));
    return {
      label: table,
      detail: `source ${source.counts[table]}; candidate ${candidate ? candidate.counts[table] : "absent"}${candidateExact === null ? "" : candidateExact ? " exact" : " DIFF"}; live ${live.counts[table]} ${liveExact ? "restored-exact" : "different"}`,
    };
  });
  result.push({
    label: "source health",
    detail: `${source.integrity ? "integrity ok" : "integrity FAIL"}; ${source.foreignKeys ? "FK ok" : "FK FAIL"}; ${source.softLinks ? "soft links ok" : "soft links FAIL"}`,
  });
  if (candidate) {
    result.push({
      label: "candidate health",
      detail: `${candidate.integrity ? "integrity ok" : "integrity FAIL"}; ${candidate.foreignKeys ? "FK ok" : "FK FAIL"}; ${candidate.softLinks ? "soft links ok" : "soft links FAIL"}`,
    });
  }
  result.push({
    label: "live health",
    detail: `${live.integrity ? "integrity ok" : "integrity FAIL"}; ${live.foreignKeys ? "FK ok" : "FK FAIL"}; ${live.softLinks ? "soft links ok" : "soft links FAIL"}`,
  });
  return result;
}

async function closeDatabase(sqlite: SQLiteDatabase): Promise<void> {
  await sqlite.closeAsync();
}

function requireForeignKeys(sqlite: SQLiteDatabase): void {
  sqlite.execSync("PRAGMA foreign_keys=ON;");
  const foreignKeys = rows<Record<string, unknown>>(sqlite, "PRAGMA foreign_keys;");
  if (foreignKeys.length !== 1 || Number(Object.values(foreignKeys[0])[0]) !== 1) {
    throw new Error("Probe connection could not prove foreign_keys=ON.");
  }
}

function configureNewFixtureConnection(sqlite: SQLiteDatabase): void {
  requireForeignKeys(sqlite);
  sqlite.execSync("PRAGMA journal_mode=WAL;");
  sqlite.execSync("PRAGMA synchronous=NORMAL;");
}

async function openExisting(file: File): Promise<SQLiteDatabase> {
  requireProbeEnabled();
  if (!file.exists) throw new Error(`Expected owned probe file is missing: ${file.name}.`);
  const sqlite = await openDatabaseAsync(
    file.name,
    { useNewConnection: true },
    file.parentDirectory.uri
  );
  try {
    // This connection-local PRAGMA does not alter the sealed candidate when it
    // is opened for read-only evidence. WAL/synchronous are set only at owned
    // fixture creation, never during candidate inspection.
    requireForeignKeys(sqlite);
    return sqlite;
  } catch (error) {
    try {
      await closeDatabase(sqlite);
    } catch {
      // Preserve the original setup error and all files for review.
    }
    throw error;
  }
}

async function withExisting<T>(
  file: File,
  openHandles: { current: number },
  action: (sqlite: SQLiteDatabase) => T | Promise<T>
): Promise<T> {
  const sqlite = await openExisting(file);
  openHandles.current += 1;
  try {
    return await action(sqlite);
  } finally {
    await closeDatabase(sqlite);
    openHandles.current -= 1;
  }
}

function seedPopulated(sqlite: SQLiteDatabase, base: number, liveOnly = false): void {
  requireProbeEnabled();
  const exercise = base + 1;
  const workout = base + 2;
  const workoutExercise = base + 3;
  const set = base + 4;
  const program = base + 5;
  const calendar = base + 6;
  const calendarExercise = base + 7;
  const calendarSet = base + 8;
  const tag = base + 9;
  const tagging = base + 10;
  const media = base + 11;
  const checkin = base + 12;
  const epoch = 1_700_100_000_000 + base;
  sqlite.runSync("INSERT INTO settings (id, e1rm_formula, unit_preference, theme_preference, color_theme, show_all_tab_body_part_grouping) VALUES (1, 'epley', 'kg', 'system', 'default', 1);");
  sqlite.runSync("INSERT INTO user_checkins (id, uid, recorded_at, context, bodyweight_kg, note, source) VALUES (?, ?, ?, 'probe', 80, 'kill probe checkin', 'probe');", [checkin, `kill-checkin-${base}`, epoch]);
  sqlite.runSync("INSERT INTO exercises (id, uid, name, description, muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned) VALUES (?, ?, ?, 'fixture', 'chest', 'barbell', 0, ?, 90, 0);", [exercise, `kill-exercise-${base}`, `Kill Probe Exercise ${base}`, epoch]);
  sqlite.runSync("INSERT INTO workouts (id, uid, started_at, completed_at, note) VALUES (?, ?, ?, ?, 'kill probe workout');", [workout, `kill-workout-${base}`, epoch, epoch + 1]);
  sqlite.runSync("INSERT INTO workout_exercises (id, uid, workout_id, exercise_id, order_index, note, current_weight, current_reps, completed_at, performed_at) VALUES (?, ?, ?, ?, 0, 'kill probe entry', 100, 5, ?, ?);", [workoutExercise, `kill-entry-${base}`, workout, exercise, epoch + 1, epoch]);
  sqlite.runSync("INSERT INTO sets (id, uid, workout_id, exercise_id, workout_exercise_id, set_group_id, set_index, weight_kg, reps, rpe, rir, is_warmup, note, performed_at) VALUES (?, ?, ?, ?, ?, ?, 0, 100, 5, 8, 2, 0, 'kill probe set', ?);", [set, `kill-set-${base}`, workout, exercise, workoutExercise, `kill-group-${base}`, epoch]);
  sqlite.runSync("INSERT INTO psl_programs (id, name, description, psl_source, compiled_hash, is_active, units, created_at, updated_at) VALUES (?, ?, 'kill probe program', 'program probe', ?, 1, 'kg', ?, ?);", [program, `Kill Probe Program ${base}`, `kill-hash-${base}`, epoch, epoch]);
  sqlite.runSync("INSERT INTO program_calendar (id, program_id, psl_session_id, session_name, date_iso, sequence, status, completed_at) VALUES (?, ?, ?, 'Kill Probe Session', '2026-09-22', 0, 'complete', ?);", [calendar, program, `kill-session-${base}`, epoch]);
  sqlite.runSync("INSERT INTO program_calendar_exercises (id, calendar_id, exercise_name, exercise_id, order_index, prescribed_sets_json, status, workout_exercise_id) VALUES (?, ?, ?, ?, 0, '[{\"reps\":5}]', 'complete', ?);", [calendarExercise, calendar, `Kill Probe Exercise ${base}`, exercise, workoutExercise]);
  sqlite.runSync("INSERT INTO program_calendar_sets (id, calendar_exercise_id, set_index, prescribed_reps, prescribed_intensity_json, prescribed_role, actual_weight, actual_reps, actual_rpe, is_user_added, is_logged, set_id, logged_at) VALUES (?, ?, 0, '5', '{}', 'work', 100, 5, 8, 0, 1, ?, ?);", [calendarSet, calendarExercise, set, epoch]);
  sqlite.runSync("INSERT INTO pr_events (uid, set_id, exercise_id, type, metric_value, occurred_at) VALUES (?, ?, ?, '5rm', 100, ?);", [`kill-pb-${base}`, set, exercise, epoch]);
  sqlite.runSync("INSERT INTO tags (id, name) VALUES (?, ?);", [tag, `kill-tag-${base}`]);
  sqlite.runSync("INSERT INTO taggings (id, tag_id, target_type, target_id) VALUES (?, ?, 'workout', ?);", [tagging, tag, workout]);
  sqlite.runSync("INSERT INTO media (id, local_uri, asset_id, mime, set_id, workout_id, note, created_at, original_filename, media_created_at, duration_ms, album_name) VALUES (?, 'content://kill-probe-unusable', ?, 'video/mp4', ?, ?, 'kill probe media', ?, 'kill-probe.mp4', ?, 1000, 'Kill Probe');", [media, `kill-asset-${base}`, set, workout, epoch, epoch]);
  sqlite.runSync("INSERT INTO exercise_formula_overrides (exercise_id, e1rm_formula) VALUES (?, 'brzycki');", [exercise]);
  if (liveOnly) {
    sqlite.runSync("INSERT INTO workouts (id, uid, started_at, note) VALUES (?, 'kill-live-only-workout', ?, 'live only');", [LIVE_ONLY_WORKOUT_ID, epoch]);
    sqlite.runSync("INSERT INTO tags (id, name) VALUES (?, 'kill-live-only-tag');", [LIVE_ONLY_TAG_ID]);
  }
}

async function createFixtures(): Promise<{ source: Snapshot; live: Snapshot }> {
  requireProbeEnabled();
  requireControlsAbsent();
  const root = probeDirectory();
  if (root.exists) {
    throw new Error("Probe directory already exists; initialization refuses overwrite or cleanup.");
  }
  root.create({ intermediates: true, idempotent: false });
  let sourceDb: SQLiteDatabase | undefined;
  let liveDb: SQLiteDatabase | undefined;
  try {
    sourceDb = await openDatabaseAsync(SOURCE_NAME, { useNewConnection: true }, root.uri);
    configureNewFixtureConnection(sourceDb);
    initializeDatabase(sourceDb);
    seedPopulated(sourceDb, 10_000);
    const source = readSnapshot(sourceDb);
    await closeDatabase(sourceDb);
    sourceDb = undefined;
    liveDb = await openDatabaseAsync(LIVE_NAME, { useNewConnection: true }, root.uri);
    configureNewFixtureConnection(liveDb);
    initializeDatabase(liveDb);
    seedPopulated(liveDb, 20_000, true);
    const live = readSnapshot(liveDb);
    await closeDatabase(liveDb);
    liveDb = undefined;
    return { source, live };
  } finally {
    if (sourceDb) await closeDatabase(sourceDb);
    if (liveDb) await closeDatabase(liveDb);
  }
}

function requireControlsAbsent(): void {
  for (const name of ["pending", "outcome"] as const) {
    const result = readRestoreControlRecord(name);
    if (result.status !== "absent") {
      throw new Error(`Refusing mutation because ${name} control is ${result.status}.`);
    }
  }
}

function readOwnedControls(ownership: OwnershipReceipt): {
  readonly pending: ReturnType<typeof readPendingRestoreRecord>;
  readonly outcome: ReturnType<typeof readCommittedRestoreOutcome>;
} {
  const pending = readPendingRestoreRecord(readRestoreControlRecord, getReplacementRestoreStagingRootUri());
  const outcome = readCommittedRestoreOutcome(readRestoreControlRecord);
  if (pending.status === "present") {
    if (
      pending.record.restoreId !== ownership.restoreId ||
      pending.record.candidatePath !== ownership.candidatePath ||
      pending.record.candidateSha256 !== ownership.candidateSha256
    ) {
      throw new Error("Pending control does not match strict probe ownership.");
    }
  }
  if (
    outcome.status === "present" &&
    (outcome.record.restoreId !== ownership.restoreId || outcome.record.candidateSha256 !== ownership.candidateSha256)
  ) {
    throw new Error("Outcome control does not match strict probe ownership.");
  }
  return { pending, outcome };
}

function armCheckpoint(point: RestoreKillPoint): void {
  requireProbeEnabled();
  const ownership = readOwnershipReceipt();
  const { pending, outcome } = readOwnedControls(ownership);
  if (pending.status !== "present") throw new Error("A matching pending control is required before arming.");
  if (outcome.status === "present") throw new Error("A pre-existing outcome makes this arm ambiguous.");
  if (armFile().exists || reachedFile().exists) {
    throw new Error("A checkpoint arm or reached receipt already exists; re-arm refused.");
  }
  const nativeProcessToken = getNativeProcessToken();
  if (!nativeProcessToken) throw new Error("Native process identity is unavailable.");
  writeAndVerifyCheckpoint(armFile(), {
    version: 1,
    runId: ownership.runId,
    restoreId: ownership.restoreId,
    point,
    nativeProcessToken,
  });
}

export type RestoreKillMutationGuard = {
  readonly run: <T>(mutation: () => T) => T;
  readonly isFailClosed: () => boolean;
  readonly failAfterCheckpointTimeout: (point: RestoreKillPoint) => never;
};

export function createRestoreKillMutationGuard(): RestoreKillMutationGuard {
  let failClosed = false;
  return {
    run<T>(mutation: () => T): T {
      requireProbeEnabled();
      if (failClosed) {
        throw new Error("Restore kill checkpoint timed out; further mutations are blocked.");
      }
      return mutation();
    },
    isFailClosed: () => failClosed,
    failAfterCheckpointTimeout(point): never {
      failClosed = true;
      throw new Error(`Kill checkpoint ${point} timed out; runtime is fail-closed.`);
    },
  };
}

function createCheckpointController(
  ownership: OwnershipReceipt,
  point: RestoreKillPoint | undefined,
  mutationGuard: RestoreKillMutationGuard
): (candidate: RestoreKillPoint) => void {
  let consumed = false;
  const checkpoint = (candidate: RestoreKillPoint) => {
    if (candidate !== point || consumed) return;
    requireProbeEnabled();
    const currentOwnership = readOwnershipReceipt();
    if (JSON.stringify(currentOwnership) !== JSON.stringify(ownership)) {
      throw new Error("Ownership changed before checkpoint; apply is blocked.");
    }
    const arm = readOptionalCheckpoint(armFile());
    if (!arm) throw new Error("Exact checkpoint arm is absent.");
    requireCheckpointOwnership(arm, ownership);
    if (arm.point !== candidate) throw new Error("Checkpoint point does not match its arm.");
    const token = getNativeProcessToken();
    if (!token || token !== arm.nativeProcessToken) {
      throw new Error("Checkpoint arm belongs to a different native process.");
    }
    if (reachedFile().exists) throw new Error("Reached receipt already exists; overwrite refused.");
    writeAndVerifyCheckpoint(reachedFile(), { ...arm, nativeProcessToken: token });
    armFile().delete();
    if (armFile().exists) throw new Error("Checkpoint arm deletion was not proven; hold is not entered.");
    consumed = true;
    const deadline = Date.now() + RESTORE_KILL_HOLD_MILLIS;
    while (Date.now() < deadline) {
      // The organiser verifies the reached receipt and force-stops the separate APK.
    }
    mutationGuard.failAfterCheckpointTimeout(candidate);
  };
  return checkpoint;
}

function proxyCommitBoundary(
  sqlite: SQLiteDatabase,
  checkpoint: (point: RestoreKillPoint) => void,
  failBeforeCommit: boolean
): SQLiteDatabase {
  return new Proxy(sqlite, {
    get(target, property) {
      if (property === "execSync") {
        return (sql: string) => {
          if (sql === "COMMIT;") {
            if (failBeforeCommit) throw new Error("Probe fail_before_commit before real COMMIT.");
            checkpoint("precommit");
            target.execSync(sql);
            checkpoint("postcommit");
            return;
          }
          target.execSync(sql);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function createDiagnosticRuntime(options: {
  readonly ownership: OwnershipReceipt;
  readonly point?: RestoreKillPoint;
  readonly failBeforeCommit?: boolean;
}): DiagnosticRuntime {
  requireProbeEnabled();
  const transactionCalls = { current: 0 };
  const mutationGuard = createRestoreKillMutationGuard();
  const checkpoint = createCheckpointController(
    options.ownership,
    options.point,
    mutationGuard
  );
  const engine = createReplacementRestoreRuntime({
    stagingRootUri: getReplacementRestoreStagingRootUri(),
    prepareCandidate(prepareOptions) {
      return mutationGuard.run(() => prepareReplacementCandidate(prepareOptions));
    },
    discardCandidate(candidatePath) {
      mutationGuard.run(() => discardReplacementRestoreCandidate(candidatePath));
    },
    candidateExists: replacementRestoreCandidateExists,
    hashCandidate: hashReplacementRestoreCandidate,
    hashCandidateSync: hashReplacementRestoreCandidateSync,
    getNativeProcessToken,
    readControlRecord(name) {
      return mutationGuard.isFailClosed()
        ? { status: "unavailable" }
        : readRestoreControlRecord(name);
    },
    writeControlRecord(name: RestoreControlRecordName, json: string) {
      requireProbeEnabled();
      if (name === "pending") {
        const record = parsePendingRestoreRecord(json, getReplacementRestoreStagingRootUri());
        if (record.state === "attempting") checkpoint("before_attempt");
        mutationGuard.run(() => writeRestoreControlRecord(name, json));
        if (record.state === "attempting") checkpoint("after_attempt");
        return;
      }
      checkpoint("postcommit");
      mutationGuard.run(() => writeRestoreControlRecord(name, json));
      checkpoint("postoutcome");
    },
    deleteControlRecord(name: RestoreControlRecordName) {
      requireProbeEnabled();
      if (name === "pending") checkpoint("postoutcome");
      mutationGuard.run(() => deleteRestoreControlRecord(name));
      if (name === "pending") checkpoint("postdelete");
    },
    openValidatedSession(sessionOptions): ValidatedReplacementSession {
      requireProbeEnabled();
      const session = openValidatedReplacementSession({
        ...sessionOptions,
        sqlite: proxyCommitBoundary(
          sessionOptions.sqlite as SQLiteDatabase,
          checkpoint,
          options.failBeforeCommit === true
        ),
      });
      return {
        detach: () => session.detach(),
        replace: () => {
          transactionCalls.current += 1;
          return session.replace();
        },
      };
    },
    reconcileMedia(mediaOptions) {
      return mutationGuard.run(() => reconcileReplacementRestoreMedia(mediaOptions));
    },
  });
  return { engine, transactionCalls };
}

function classifyToken(current: NativeProcessToken | null, reference: NativeProcessToken) {
  return current === null ? "unavailable" : current === reference ? "same" : "different";
}

function validateApplyMode(options: {
  readonly ownership: OwnershipReceipt;
  readonly pending: PendingRestoreRecord | null;
  readonly arm: CheckpointReceipt | null;
  readonly reached: CheckpointReceipt | null;
  readonly failBeforeCommit: boolean;
}): RestoreKillPoint | undefined {
  const current = getNativeProcessToken();
  if (!current) throw new Error("Native process identity is unavailable.");
  if (options.arm) {
    requireCheckpointOwnership(options.arm, options.ownership);
    if (options.reached) throw new Error("Both arm and reached receipts exist; state is retained.");
    if (options.failBeforeCommit) throw new Error("fail_before_commit cannot run with an arm.");
    if (options.arm.nativeProcessToken !== current) {
      throw new Error("Arm belongs to an earlier native process and cannot re-trigger.");
    }
    return options.arm.point;
  }
  if (options.reached) {
    requireCheckpointOwnership(options.reached, options.ownership);
    if (options.reached.nativeProcessToken === current) {
      throw new Error("Reached receipt has the same process token; force-stop is not proven.");
    }
  }
  if (options.failBeforeCommit) {
    if (!options.reached || !options.pending || options.pending.state !== "attempting") {
      throw new Error("fail_before_commit requires later-process pending attempting state.");
    }
    if (options.pending.latestAttemptNativeProcessToken === current) {
      throw new Error("fail_before_commit requires a later native process.");
    }
  }
  return undefined;
}

function assertFailBeforeCommitResult(result: RestoreStartupResult): void {
  if (
    result.status !== "failed" ||
    result.error.liveDatabaseChanged !== "unknown" ||
    result.error.transactionState !== "unknown" ||
    result.error.recovery !== "retry_cold_start" ||
    result.error.recoveryToken !== undefined
  ) {
    throw new Error("fail_before_commit did not preserve required unknown retry-only state.");
  }
}

function DisabledShell() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Text className="text-center text-base text-foreground-secondary">
        Restore kill diagnostic disabled. It requires the dedicated development Android application ID and the explicit probe flag.
      </Text>
    </View>
  );
}

function EnabledProbe() {
  const [busy, setBusy] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<RestoreKillPoint>("before_attempt");
  const [preparationToken, setPreparationToken] = useState<string | null>(null);
  const [preparedSourceHash, setPreparedSourceHash] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle. Import and mount performed no mutation.");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const actionLock = useRef(false);
  const openHandles = useRef(0);
  const runtimeRef = useRef<ReplacementRestoreEngine | null>(null);
  const lastTransactionCalls = useRef(0);

  const run = async (label: string, action: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      requireProbeEnabled();
      await action();
    } catch (error) {
      setStatus(`${label}: ${boundedError(error)}`);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const inspect = async () => {
    const ownership = readOwnershipReceipt();
    const { pending, outcome } = readOwnedControls(ownership);
    const arm = readOptionalCheckpoint(armFile());
    const reached = readOptionalCheckpoint(reachedFile());
    if (arm) requireCheckpointOwnership(arm, ownership);
    if (reached) requireCheckpointOwnership(reached, ownership);
    const current = getNativeProcessToken();
    const source = await withExisting(sourceFile(), openHandles, readSnapshot);
    const live = await withExisting(liveFile(), openHandles, readSnapshot);
    const sourceDigest = (await sha256File(sourceFile().uri)).sha256;
    let candidate: Snapshot | null = null;
    const physicalCandidate = new File(ownership.candidatePath);
    let candidateDetail = physicalCandidate.exists ? "present but invalid" : "absent";
    if (physicalCandidate.exists && replacementRestoreCandidateExists(ownership.candidatePath)) {
      const digest = hashReplacementRestoreCandidateSync(ownership.candidatePath);
      if (digest !== ownership.candidateSha256) {
        candidateDetail = `digest DIFF (${shortHash(digest)})`;
      } else {
        candidate = await withExisting(new File(ownership.candidatePath), openHandles, readSnapshot);
        candidateDetail = `present; SHA matches ${shortHash(digest)}`;
      }
    }
    const controls = pending.status === "present"
      ? `pending ${pending.record.state}${outcome.status === "present" ? "; matching outcome present; pending wins" : "; outcome absent"}`
      : outcome.status === "present"
        ? `pending absent; outcome-only ${outcome.record.postCommitStatus}`
        : "pending absent; outcome absent";
    setEvidence([
      { label: "controls", detail: controls },
      {
        label: "source SHA",
        detail: sourceDigest === ownership.sourceSha256
          ? `matches ${shortHash(sourceDigest)}`
          : `DIFF ${shortHash(sourceDigest)}`,
      },
      { label: "candidate", detail: candidateDetail },
      {
        label: "checkpoint",
        detail: arm
          ? `armed ${arm.point}; current token ${classifyToken(current, arm.nativeProcessToken)}`
          : reached
            ? `reached ${reached.point}; current token ${classifyToken(current, reached.nativeProcessToken)}`
            : "no arm or reached receipt",
      },
      { label: "last apply transaction calls", detail: String(lastTransactionCalls.current) },
      ...snapshotEvidence(source, live, candidate),
    ]);
    setStatus("Inspection complete. Tokens and complete control JSON were not rendered or logged.");
  };

  const apply = async (failBeforeCommit: boolean) => {
    const ownership = readOwnershipReceipt();
    const controls = readOwnedControls(ownership);
    if (controls.pending.status === "absent" && controls.outcome.status === "absent") {
      throw new Error("No matching pending or outcome control exists.");
    }
    const arm = readOptionalCheckpoint(armFile());
    const reached = readOptionalCheckpoint(reachedFile());
    const pending = controls.pending.status === "present" ? controls.pending.record : null;
    const point = validateApplyMode({ ownership, pending, arm, reached, failBeforeCommit });
    const diagnostic = createDiagnosticRuntime({ ownership, point, failBeforeCommit });
    runtimeRef.current = diagnostic.engine;
    const before = await withExisting(liveFile(), openHandles, readSnapshot);
    const result = await withExisting(liveFile(), openHandles, (sqlite) =>
      diagnostic.engine.applyScheduledReplacementRestoreAtStartup({
        sqlite,
        nativeProcessToken: getNativeProcessToken(),
      })
    );
    const after = await withExisting(liveFile(), openHandles, readSnapshot);
    lastTransactionCalls.current = diagnostic.transactionCalls.current;
    if (failBeforeCommit) assertFailBeforeCommitResult(result);
    const changed = RESTORE_APP_TABLES.filter(
      (table) => stableRows(before.rows[table]) !== stableRows(after.rows[table])
    );
    setEvidence([
      { label: "apply result", detail: `${resultSummary(result)}; real transaction calls ${diagnostic.transactionCalls.current}` },
      { label: "pre/post live", detail: changed.length === 0 ? "all 15 table rows unchanged" : `changed: ${changed.join(", ")}` },
      { label: "health", detail: `${after.integrity ? "integrity ok" : "integrity FAIL"}; ${after.foreignKeys ? "FK ok" : "FK FAIL"}; ${after.softLinks ? "soft links ok" : "soft links FAIL"}` },
    ]);
    setStatus(failBeforeCommit
      ? "fail_before_commit preserved unknown outcome, retry_cold_start, and no discard authority."
      : `Apply returned ${resultSummary(result)}.`);
  };

  const actionClass = "rounded-lg bg-primary p-3.5";
  const mutedActionClass = "rounded-lg bg-surface-secondary p-3.5";
  const actionTextClass = "text-center text-base font-semibold text-primary-foreground";
  const mutedTextClass = "text-center text-base font-semibold text-foreground-secondary";

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-5">
      <Text className="text-xl font-bold text-foreground">Replacement restore native kill diagnostic</Text>
      <Text className="text-sm text-foreground-secondary">
        Separate debug APK sandbox. Only named scratch databases and strictly owned receipts are used; the normal application database is never opened.
      </Text>

      <View className="gap-2 rounded-lg bg-surface-secondary p-3">
        <Text className="font-semibold text-foreground">1. Create owned scratch databases</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Initialize restore kill probe scratch databases" disabled={busy} className={actionClass} onPress={() => void run("Initialize", async () => {
          const snapshots = await createFixtures();
          setPreparationToken(null);
          setPreparedSourceHash(null);
          setEvidence(snapshotEvidence(snapshots.source, snapshots.live, null));
          setStatus("Created and closed distinct populated source/live scratch databases. All 15 source tables are represented.");
        })}>
          <Text className={actionTextClass}>Initialize closed source + live scratch</Text>
        </Pressable>
      </View>

      <View className="gap-2 rounded-lg bg-surface-secondary p-3">
        <Text className="font-semibold text-foreground">2. Prepare and schedule in process A</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Prepare production replacement candidate from probe source" disabled={busy} className={actionClass} onPress={() => void run("Prepare", async () => {
          requireControlsAbsent();
          if (ownershipFile().exists || armFile().exists || reachedFile().exists) throw new Error("A prior receipt exists; prepare refuses overwrite.");
          const source = sourceFile();
          if (!source.exists || !liveFile().exists) throw new Error("Owned scratch databases are missing.");
          const before = (await sha256File(source.uri)).sha256;
          const prepared = await prepareReplacementRestore({ source: { uri: source.uri, displayName: source.name, mimeType: "application/vnd.sqlite3" } });
          if (prepared.status !== "ready") throw new Error(`Unexpected prepare status: ${prepared.status}.`);
          const after = (await sha256File(source.uri)).sha256;
          if (before !== after) throw new Error("Owned source digest changed during preparation.");
          setPreparationToken(prepared.token);
          setPreparedSourceHash(before);
          setEvidence(RESTORE_APP_TABLES.map((table) => ({ label: table, detail: `${prepared.rowsByTable[table]} sealed rows` })));
          setStatus(`Production preparation ready; source unchanged and candidate SHA ${shortHash(prepared.candidateSha256)}.`);
        })}>
          <Text className={actionTextClass}>Prepare real production candidate</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Schedule native pending restore and write strict probe ownership" disabled={busy || preparationToken === null} className={preparationToken ? actionClass : mutedActionClass} onPress={() => void run("Schedule", async () => {
          if (!preparationToken || !preparedSourceHash) throw new Error("No current-process preparation ownership.");
          if (ownershipFile().exists) throw new Error("Ownership receipt already exists.");
          const scheduled = await scheduleReplacementRestore({ token: preparationToken });
          setPreparationToken(null);
          if (scheduled.status !== "restart_required") throw new Error(`Unexpected schedule status: ${scheduled.status}.`);
          const pending = readPendingRestoreRecord(readRestoreControlRecord, getReplacementRestoreStagingRootUri());
          if (pending.status !== "present" || pending.record.restoreId !== scheduled.restoreId) throw new Error("Scheduled native pending control did not read back exactly.");
          writeAndVerifyOwnership({
            version: 1,
            runId: `kill-run-v1:${newUid()}`,
            restoreId: pending.record.restoreId,
            sourceSha256: preparedSourceHash,
            candidatePath: pending.record.candidatePath,
            candidateSha256: pending.record.candidateSha256,
          });
          setStatus("Native pending control and strict ownership receipt verified. Force-stop and restart before arming process B.");
        })}>
          <Text className={preparationToken ? actionTextClass : mutedTextClass}>Schedule native pending + ownership</Text>
        </Pressable>
      </View>

      <View className="gap-2 rounded-lg bg-surface-secondary p-3">
        <Text className="font-semibold text-foreground">3. Inspect, arm one point, then apply</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Inspect strictly owned restore state" disabled={busy} className={mutedActionClass} onPress={() => void run("Inspect", inspect)}>
          <Text className={mutedTextClass}>Inspect controls, candidate, all 15 tables, and health</Text>
        </Pressable>
        {RESTORE_KILL_POINTS.map((point) => (
          <Pressable key={point} accessibilityRole="button" accessibilityLabel={`Select restore kill point ${point}`} disabled={busy} className={selectedPoint === point ? actionClass : mutedActionClass} onPress={() => setSelectedPoint(point)}>
            <Text className={selectedPoint === point ? actionTextClass : mutedTextClass}>{point}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={`Arm one-shot restore kill point ${selectedPoint}`} disabled={busy} className={actionClass} onPress={() => void run("Arm", async () => {
          armCheckpoint(selectedPoint);
          setStatus(`Armed ${selectedPoint} once in this process. Apply next; verify reached externally before force-stop.`);
        })}>
          <Text className={actionTextClass}>Arm selected point once</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Apply or reapply scheduled replacement using the actual engine" disabled={busy} className={actionClass} onPress={() => void run("Apply/reapply", () => apply(false))}>
          <Text className={actionTextClass}>Apply/reapply actual engine</Text>
        </Pressable>
        <Text className="text-xs text-foreground-secondary">
          At an armed boundary, reached is synchronously verified, arm absence is proven, and JS holds for 60 seconds. Force-stop during the hold. Timeout fails closed.
        </Text>
      </View>

      <View className="gap-2 rounded-lg bg-surface-secondary p-3">
        <Text className="font-semibold text-foreground">4. Later-process unknown-baseline rollback</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Inject failure before commit after a prior attempting checkpoint" disabled={busy} className={actionClass} onPress={() => void run("fail_before_commit", () => apply(true))}>
          <Text className={actionTextClass}>fail_before_commit in later process</Text>
        </Pressable>
        <Text className="text-xs text-foreground-secondary">
          Allowed only after a reached kill left pending attempting and a different process is proven. It requires unknown, retry_cold_start, and no recovery token.
        </Text>
      </View>

      <View className="gap-2 rounded-lg bg-surface-secondary p-3">
        <Text className="font-semibold text-foreground">5. Explicit post-commit completion / cleanup</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Complete matching post-commit outcome through the production service" disabled={busy} className={actionClass} onPress={() => void run("Complete outcome", async () => {
          const ownership = readOwnershipReceipt();
          const controls = readOwnedControls(ownership);
          if (controls.pending.status !== "absent" || controls.outcome.status !== "present") throw new Error("Completion requires matching outcome-only state and proven pending absence.");
          if (new File(ownership.candidatePath).exists) throw new Error("Candidate is retained; preserve post-delete outcome-only evidence for review.");
          const engine = runtimeRef.current ?? createDiagnosticRuntime({ ownership }).engine;
          const result = await withExisting(liveFile(), openHandles, (sqlite) => engine.completeReplacementRestorePostCommit({ sqlite, restoreId: ownership.restoreId, mode: "skip" }));
          runtimeRef.current = engine;
          setStatus(`Production post-commit completion returned ${result.status}; inspect physical controls next.`);
        })}>
          <Text className={actionTextClass}>Complete matching outcome with media skip</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clean up only verified owned closed probe fixtures" disabled={busy} className={mutedActionClass} onPress={() => void run("Cleanup", async () => {
          const ownership = readOwnershipReceipt();
          requireControlsAbsent();
          if (openHandles.current !== 0) throw new Error("A scratch handle is still open.");
          if (new File(ownership.candidatePath).exists) throw new Error("Owned candidate is retained; ambiguous post-delete evidence stays for review.");
          const sourceDigest = (await sha256File(sourceFile().uri)).sha256;
          if (sourceDigest !== ownership.sourceSha256) throw new Error("Owned source digest changed; cleanup refused.");
          if (armFile().exists) throw new Error("An arm receipt remains; cleanup refused.");
          const root = probeDirectory();
          const known = new Set([sourceFile().uri, liveFile().uri, ownershipFile().uri, reachedFile().uri]);
          if (!root.exists || root.list().some((entry) => !known.has(entry.uri))) throw new Error("Probe directory is absent or contains an unknown entry.");
          for (const file of [sourceFile(), liveFile(), reachedFile(), ownershipFile()]) if (file.exists) file.delete();
          if (root.list().length !== 0) throw new Error("Probe directory did not become empty.");
          root.delete();
          setEvidence([]);
          setStatus("Removed only verified owned closed fixtures and receipts after controls and candidate absence.");
        })}>
          <Text className={mutedTextClass}>Cleanup verified owned fixtures</Text>
        </Pressable>
      </View>

      <View className="gap-1 rounded-lg bg-surface-secondary p-3">
        <Text className="font-semibold text-foreground">Bounded evidence</Text>
        <Text className="text-xs text-foreground-secondary">{status}</Text>
        {evidence.map((item) => (
          <Text key={`${item.label}-${item.detail}`} className="text-xs text-foreground-secondary">{item.label}: {item.detail}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

export default function RestoreEngineKillProbe() {
  return probeEnabled() ? <EnabledProbe /> : <DisabledShell />;
}
