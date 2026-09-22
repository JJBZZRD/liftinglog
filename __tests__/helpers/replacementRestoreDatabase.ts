import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import type { NativeProcessToken } from "../../lib/native/appProcessIdentity";
import type {
  RestoreControlRecordName,
  RestoreControlRecordReadResult,
} from "../../lib/native/restoreControlStore";
import {
  createSealedBackupSnapshotWithAdapter,
  type BackupSnapshotAdapter,
} from "../../lib/db/backupSnapshot";
import { initializeDatabase } from "../../lib/db/bootstrap";
import type { RestoreSource } from "../../lib/db/replacementRestoreContract";
import type {
  ReplacementPreparationAdapter,
  ReplacementPreparationConnection,
} from "../../lib/db/replacementRestorePreparation";
import {
  REPLACEMENT_RESTORE_CANDIDATE_NAME,
  REPLACEMENT_RESTORE_STAGING_DIRECTORY,
} from "../../lib/db/replacementRestoreRecords";
import {
  createReplacementRestoreRuntime,
  type ReplacementRestoreEngine,
} from "../../lib/db/replacementRestoreRuntime";
import {
  openValidatedReplacementSession,
  type ReplacementSqliteConnection,
} from "../../lib/db/replacementRestoreTransaction";
import { RESTORE_APP_TABLES } from "../../lib/db/restoreSchemaManifest";
import { NodeBackupSnapshotConnection } from "./backupSnapshotDatabase";
import {
  closeReplacementFixturePair,
  createReplacementFixturePair,
  type ReplacementFixturePair,
} from "./replacementRestoreProof";

function paramsFrom(values: unknown): SQLInputValue[] {
  if (Array.isArray(values)) return values as SQLInputValue[];
  if (values === undefined || values === null) return [];
  return Object.values(values as Record<string, SQLInputValue>);
}

function isQuery(sql: string): boolean {
  return /^\s*(?:SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(sql);
}

function plainRows<T>(rows: T[]): T[] {
  return JSON.parse(JSON.stringify(rows)) as T[];
}

function statementRows<T>(statement: StatementSync, values: unknown): T[] {
  return plainRows(statement.all(...paramsFrom(values)) as T[]);
}

export class NodeReplacementDatabase
  implements ReplacementPreparationConnection, ReplacementSqliteConnection {
  readonly sqlLog: string[] = [];
  beforeExec?: (sql: string) => void;
  afterExec?: (sql: string) => void;
  beforeRun?: (sql: string) => void;
  afterRun?: (sql: string) => void;
  failClose: unknown;

  constructor(readonly database: DatabaseSync, readonly databasePath: string) {}

  execSync(sql: string): void {
    this.beforeExec?.(sql);
    this.database.exec(sql);
    this.sqlLog.push(sql);
    this.afterExec?.(sql);
  }

  async execAsync(sql: string): Promise<void> {
    this.execSync(sql);
  }

  getAllSync<T>(sql: string, params: unknown = []): T[] {
    this.sqlLog.push(sql);
    return statementRows<T>(this.database.prepare(sql), params);
  }

  runSync(sql: string, params: unknown = []): unknown {
    this.beforeRun?.(sql);
    const result = this.database.prepare(sql).run(...paramsFrom(params));
    this.sqlLog.push(sql);
    this.afterRun?.(sql);
    return result;
  }

  prepareSync(sql: string) {
    const statement = this.database.prepare(sql);
    return {
      executeSync: (params: unknown = []) => {
        const rows = isQuery(sql) ? statementRows(statement, params) : [];
        if (!isQuery(sql)) statement.run(...paramsFrom(params));
        this.sqlLog.push(sql);
        return { getAllSync: () => rows };
      },
      finalizeSync: () => undefined,
    };
  }

  async closeAsync(): Promise<void> {
    if (this.failClose !== undefined) throw this.failClose;
    if (this.database.isOpen) this.database.close();
  }

  close(): void {
    if (this.database.isOpen) this.database.close();
  }
}

export class MemoryRestoreControlStore {
  pending: RestoreControlRecordReadResult = { status: "absent" };
  outcome: RestoreControlRecordReadResult = { status: "absent" };
  readonly writes: { readonly name: RestoreControlRecordName; readonly json: string }[] = [];
  writeFault?: (name: RestoreControlRecordName, json: string) => void;
  deleteFault?: (name: RestoreControlRecordName) => void;
  readOverride?: (
    name: RestoreControlRecordName,
    current: RestoreControlRecordReadResult
  ) => RestoreControlRecordReadResult | undefined;

  read = (name: RestoreControlRecordName): RestoreControlRecordReadResult => {
    const current = name === "pending" ? this.pending : this.outcome;
    return this.readOverride?.(name, current) ?? current;
  };

  write = (name: RestoreControlRecordName, json: string): void => {
    this.writes.push({ name, json });
    this.writeFault?.(name, json);
    if (name === "pending") this.pending = { status: "present", json };
    else this.outcome = { status: "present", json };
  };

  delete = (name: RestoreControlRecordName): void => {
    this.deleteFault?.(name);
    if (name === "pending") this.pending = { status: "absent" };
    else this.outcome = { status: "absent" };
  };
}

function streamingHash(path: string): string {
  const size = statSync(path).size;
  const descriptor = openSync(path, "r");
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  try {
    while (position < size) {
      const read = readSync(descriptor, buffer, 0, Math.min(buffer.length, size - position), position);
      if (read <= 0) throw new Error("Unexpected short restore fixture read.");
      hash.update(buffer.subarray(0, read));
      position += read;
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function pathFromUri(uri: string): string {
  return uri.startsWith("file:") ? fileURLToPath(uri) : uri;
}

export type EngineFixture = {
  readonly pair: ReplacementFixturePair;
  readonly rootPath: string;
  readonly rootUri: string;
  readonly candidatePath: string;
  readonly candidateUri: string;
  readonly live: NodeReplacementDatabase;
  readonly controls: MemoryRestoreControlStore;
  readonly runtime: ReplacementRestoreEngine;
  readonly scheduleToken: NativeProcessToken;
  readonly attemptToken: NativeProcessToken;
  readonly retryToken: NativeProcessToken;
  readonly discardedPaths: string[];
  close(): void;
};

export const PROCESS_A =
  "process-v1:11111111-1111-4111-8111-111111111111" as NativeProcessToken;
export const PROCESS_B =
  "process-v1:22222222-2222-4222-8222-222222222222" as NativeProcessToken;
export const PROCESS_C =
  "process-v1:33333333-3333-4333-8333-333333333333" as NativeProcessToken;

function candidateSummary(path: string) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const rowsByTable = Object.fromEntries(
      RESTORE_APP_TABLES.map((table) => [
        table,
        Number(
          (database.prepare(`SELECT COUNT(*) AS count FROM "${table}";`).get() as {
            count: number;
          }).count
        ),
      ])
    ) as Record<(typeof RESTORE_APP_TABLES)[number], number>;
    return { rowsByTable, pbEventsInSource: rowsByTable.pr_events, mediaRows: rowsByTable.media };
  } finally {
    database.close();
  }
}

export function createEngineFixture(options: {
  currentToken?: NativeProcessToken;
  prepareCandidate?: ReplacementRestoreRuntimeParameters["prepareCandidate"];
  hashCandidate?: ReplacementRestoreRuntimeParameters["hashCandidate"];
} = {}): EngineFixture {
  const pair = createReplacementFixturePair();
  const candidateDatabase = new DatabaseSync(pair.candidatePath);
  candidateDatabase.exec("PRAGMA foreign_keys=ON;");
  const candidateAdapter = new NodeReplacementDatabase(
    candidateDatabase,
    pair.candidatePath
  );
  initializeDatabase(candidateAdapter as never);
  candidateAdapter.close();
  const rootPath = join(pair.directory, REPLACEMENT_RESTORE_STAGING_DIRECTORY);
  const stagingPath = join(rootPath, "restore-v1-enginefixture01");
  const candidatePath = join(stagingPath, REPLACEMENT_RESTORE_CANDIDATE_NAME);
  mkdirSync(stagingPath, { recursive: true });
  copyFileSync(pair.candidatePath, candidatePath);
  const rootUri = pathToFileURL(rootPath).href;
  const candidateUri = pathToFileURL(candidatePath).href;
  const liveDatabase = new DatabaseSync(pair.livePath);
  liveDatabase.exec("PRAGMA foreign_keys=ON;");
  const live = new NodeReplacementDatabase(liveDatabase, pair.livePath);
  const controls = new MemoryRestoreControlStore();
  const discardedPaths: string[] = [];
  let currentToken = options.currentToken ?? PROCESS_A;
  let sequence = 0;
  const runtime = createReplacementRestoreRuntime({
    stagingRootUri: rootUri,
    prepareCandidate:
      options.prepareCandidate ??
      (async () => ({
        sourceDisplayName: "fixture.db",
        candidatePath: candidateUri,
        candidateSha256: streamingHash(candidatePath),
        ...candidateSummary(candidatePath),
      })),
    discardCandidate(path) {
      discardedPaths.push(path);
      const directory = dirname(pathFromUri(path));
      if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
    },
    candidateExists: (path) => existsSync(pathFromUri(path)),
    hashCandidate:
      options.hashCandidate ??
      (async (path) => streamingHash(pathFromUri(path))),
    hashCandidateSync: (path) => streamingHash(pathFromUri(path)),
    getNativeProcessToken: () => currentToken,
    readControlRecord: controls.read,
    writeControlRecord: controls.write,
    deleteControlRecord: controls.delete,
    openValidatedSession: openValidatedReplacementSession,
    createOpaqueId(kind) {
      sequence += 1;
      return `${kind}-v1:fixture-${String(sequence).padStart(8, "0")}`;
    },
  });
  const fixture = {
    pair,
    rootPath,
    rootUri,
    candidatePath,
    candidateUri,
    live,
    controls,
    runtime,
    scheduleToken: PROCESS_A,
    attemptToken: PROCESS_B,
    retryToken: PROCESS_C,
    discardedPaths,
    close() {
      live.close();
      closeReplacementFixturePair(pair);
    },
  };
  Object.defineProperty(fixture, "currentToken", {
    get: () => currentToken,
    set: (value: NativeProcessToken) => {
      currentToken = value;
    },
  });
  return fixture;
}

type ReplacementRestoreRuntimeParameters = Parameters<
  typeof createReplacementRestoreRuntime
>[0];

export function setFixtureProcess(fixture: EngineFixture, token: NativeProcessToken): void {
  (fixture as EngineFixture & { currentToken: NativeProcessToken }).currentToken = token;
}

export function openReadonly(path: string): DatabaseSync {
  return new DatabaseSync(path, { readOnly: true });
}

export function createNodePreparationAdapter(options: {
  rootPath?: string;
  source?: RestoreSource | null;
} = {}): {
  readonly adapter: ReplacementPreparationAdapter;
  readonly rootPath: string;
  readonly opened: NodeReplacementDatabase[];
  cleanup(): void;
} {
  const rootPath = options.rootPath ?? mkdtempSync(join(tmpdir(), "replacement-preparation-"));
  mkdirSync(rootPath, { recursive: true });
  const opened: NodeReplacementDatabase[] = [];
  let sequence = 0;
  const adapter: ReplacementPreparationAdapter = {
    async pickSource() {
      return options.source ?? null;
    },
    createStaging() {
      sequence += 1;
      const directoryPath = join(rootPath, `restore-v1-preparation${String(sequence).padStart(4, "0")}`);
      mkdirSync(directoryPath);
      return {
        rootUri: pathToFileURL(rootPath).href,
        directoryUri: pathToFileURL(directoryPath).href,
        workFileUri: pathToFileURL(join(directoryPath, "work.db")).href,
        candidateFileUri: pathToFileURL(join(directoryPath, REPLACEMENT_RESTORE_CANDIDATE_NAME)).href,
      };
    },
    async copyFile(sourceUri, destinationUri) {
      copyFileSync(pathFromUri(sourceUri), pathFromUri(destinationUri));
    },
    deleteDirectory(uri) {
      rmSync(pathFromUri(uri), { recursive: true, force: true });
    },
    deleteFile(uri) {
      rmSync(pathFromUri(uri), { force: true });
    },
    fileInfo(uri) {
      const path = pathFromUri(uri);
      if (!existsSync(path)) return { exists: false, isDirectory: null, size: null };
      const stat = statSync(path);
      return { exists: true, isDirectory: stat.isDirectory(), size: stat.size };
    },
    readHeader(uri, bytes) {
      const descriptor = openSync(pathFromUri(uri), "r");
      const buffer = Buffer.alloc(bytes);
      try {
        const count = readSync(descriptor, buffer, 0, bytes, 0);
        return new Uint8Array(buffer.subarray(0, count));
      } finally {
        closeSync(descriptor);
      }
    },
    async hashFile(uri) {
      return streamingHash(pathFromUri(uri));
    },
    hashFileSync(uri) {
      return streamingHash(pathFromUri(uri));
    },
    async openPrivateDatabase(uri) {
      const path = pathFromUri(uri);
      const database = new DatabaseSync(path);
      const connection = new NodeReplacementDatabase(database, path);
      opened.push(connection);
      return connection;
    },
    initializeCandidate(connection) {
      initializeDatabase(connection as never);
    },
    async sealCandidate({ sourceDatabase, destinationDirectory, destinationName }) {
      const backupAdapter: BackupSnapshotAdapter = {
        async backupDatabase({ destDatabase }) {
          await (destDatabase as NodeBackupSnapshotConnection).replaceFrom(
            (sourceDatabase as NodeReplacementDatabase).database
          );
        },
        fileExists: existsSync,
        async hashFile(path) {
          return streamingHash(path);
        },
        async openDatabase(name, _openOptions, directory) {
          return new NodeBackupSnapshotConnection(join(pathFromUri(directory), name));
        },
      };
      const snapshot = await createSealedBackupSnapshotWithAdapter({
        adapter: backupAdapter,
        destinationDirectory: pathFromUri(destinationDirectory),
        destinationName,
        sourceDatabase,
      });
      return {
        ...snapshot,
        fileUri: pathToFileURL(snapshot.fileUri).href,
      };
    },
  };
  return {
    adapter,
    rootPath,
    opened,
    cleanup() {
      for (const connection of opened) connection.close();
      rmSync(rootPath, { recursive: true, force: true });
    },
  };
}

export function copyFixtureToExtensionlessSource(pair: ReplacementFixturePair): string {
  const path = join(pair.directory, "extensionless-source");
  copyFileSync(pair.candidatePath, path);
  return path;
}

export function readFileDigest(path: string): string {
  return streamingHash(path);
}

export function corruptFile(path: string): void {
  const bytes = readFileSync(path);
  bytes[0] ^= 0xff;
  writeFileSync(path, bytes);
}
