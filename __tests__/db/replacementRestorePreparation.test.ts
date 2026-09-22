import {
  existsSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  UnconfirmedOwnedHandleCloseError,
  prepareReplacementCandidateWithAdapter,
  type ReplacementPreparationAdapter,
} from "../../lib/db/replacementRestorePreparation";
import { initializeDatabase } from "../../lib/db/bootstrap";
import { RESTORE_APP_TABLES } from "../../lib/db/restoreSchemaManifest";
import {
  NodeReplacementDatabase,
  copyFixtureToExtensionlessSource,
  createNodePreparationAdapter,
  readFileDigest,
} from "../helpers/replacementRestoreDatabase";
import {
  closeReplacementFixturePair,
  createReplacementFixturePair,
  type ReplacementFixturePair,
} from "../helpers/replacementRestoreProof";
import {
  PRODUCTION_EXERCISE_FIXTURES,
  appIdentityRows,
  openExerciseRestoreFixture,
  openHistoricalRestoreFixture,
  type RestoreManifestFixture,
} from "../helpers/restoreSchemaManifestDatabase";

jest.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "android" },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system", () => ({
  Directory: jest.fn(),
  File: jest.fn(),
  FileMode: { ReadOnly: "read" },
  Paths: {},
}));
jest.mock("expo-sqlite", () => ({
  backupDatabaseAsync: jest.fn(),
  openDatabaseAsync: jest.fn(),
}));
jest.mock("../../lib/utils/fileSha256", () => ({
  DEFAULT_MAX_SHA256_FILE_BYTES: 256 * 1024 * 1024,
  sha256File: jest.fn(),
  sha256FileSync: jest.fn(),
}));

type PreparationHarness = ReturnType<typeof createNodePreparationAdapter>;

function sourceFor(path: string) {
  return {
    uri: pathToFileURL(path).href,
    displayName: null,
    mimeType: null,
  };
}

function retainedDirectories(harness: PreparationHarness): string[] {
  return readdirSync(harness.rootPath);
}

function migratePairCandidate(pair: ReplacementFixturePair): void {
  const database = new DatabaseSync(pair.candidatePath);
  database.exec("PRAGMA foreign_keys=ON;");
  const connection = new NodeReplacementDatabase(database, pair.candidatePath);
  initializeDatabase(connection as never);
  connection.close();
}

describe("replacement restore preparation", () => {
  let pair: ReplacementFixturePair | undefined;
  let historical: RestoreManifestFixture | undefined;
  let harness: PreparationHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
    if (historical) {
      if (historical.database.isOpen) historical.database.close();
      rmSync(historical.directory, { recursive: true, force: true });
      historical = undefined;
    }
    if (pair) {
      closeReplacementFixturePair(pair);
      pair = undefined;
    }
  });

  test("copies an extensionless source, preserves it, and seals a distinct current candidate", async () => {
    pair = createReplacementFixturePair();
    migratePairCandidate(pair);
    const sourcePath = copyFixtureToExtensionlessSource(pair);
    const sourceDigest = readFileDigest(sourcePath);
    const sourceDatabase = new DatabaseSync(sourcePath, { readOnly: true });
    const sourceUids = sourceDatabase
      .prepare("SELECT uid FROM sets ORDER BY id;")
      .all();
    sourceDatabase.close();
    harness = createNodePreparationAdapter();

    const prepared = await prepareReplacementCandidateWithAdapter({
      adapter: harness.adapter,
      source: sourceFor(sourcePath),
    });

    expect(prepared).not.toBeNull();
    if (!prepared) throw new Error("unexpected picker cancellation");
    expect(readFileDigest(sourcePath)).toBe(sourceDigest);
    expect(prepared.sourceDisplayName).toBeNull();
    expect(prepared.pbEventsInSource).toBe(prepared.rowsByTable.pr_events);
    expect(prepared.mediaRows).toBe(prepared.rowsByTable.media);
    expect(Object.keys(prepared.rowsByTable).sort()).toEqual(
      [...RESTORE_APP_TABLES].sort()
    );
    const candidatePath = fileURLToPath(prepared.candidatePath);
    expect(existsSync(candidatePath)).toBe(true);
    expect(existsSync(join(dirname(candidatePath), "work.db"))).toBe(false);

    const candidate = new DatabaseSync(new URL(prepared.candidatePath), {
      readOnly: true,
    });
    expect(candidate.prepare("SELECT uid FROM sets ORDER BY id;").all()).toEqual(
      sourceUids
    );
    expect(candidate.prepare("PRAGMA integrity_check;").get()).toEqual({
      integrity_check: "ok",
    });
    candidate.close();

    expect(harness.opened[0].sqlLog.slice(0, 2)).toEqual([
      "PRAGMA query_only=ON;",
      "PRAGMA trusted_schema=OFF;",
    ]);
    expect(harness.opened.at(-1)?.sqlLog.slice(0, 2)).toEqual([
      "PRAGMA query_only=ON;",
      "PRAGMA trusted_schema=OFF;",
    ]);
  });

  test("migrates the supported empty historical layout into all fifteen current tables", async () => {
    historical = openHistoricalRestoreFixture();
    historical.database.close();
    const sourceDigest = readFileDigest(historical.path);
    harness = createNodePreparationAdapter();

    const prepared = await prepareReplacementCandidateWithAdapter({
      adapter: harness.adapter,
      source: sourceFor(historical.path),
    });

    expect(prepared).not.toBeNull();
    if (!prepared) throw new Error("unexpected picker cancellation");
    expect(readFileDigest(historical.path)).toBe(sourceDigest);
    expect(Object.keys(prepared.rowsByTable).sort()).toEqual(
      [...RESTORE_APP_TABLES].sort()
    );
    expect(Object.values(prepared.rowsByTable).every((count) => count === 0)).toBe(true);
  });

  test("migrates a populated historical layout without changing existing UIDs", async () => {
    historical = openExerciseRestoreFixture(PRODUCTION_EXERCISE_FIXTURES[3]);
    const identitiesBefore = appIdentityRows(historical);
    expect((identitiesBefore as unknown[]).length).toBeGreaterThan(0);
    historical.database.close();
    const sourceDigest = readFileDigest(historical.path);
    harness = createNodePreparationAdapter();

    const prepared = await prepareReplacementCandidateWithAdapter({
      adapter: harness.adapter,
      source: sourceFor(historical.path),
    });

    expect(prepared).not.toBeNull();
    if (!prepared) throw new Error("unexpected picker cancellation");
    expect(readFileDigest(historical.path)).toBe(sourceDigest);
    const candidate = new DatabaseSync(new URL(prepared.candidatePath), {
      readOnly: true,
    });
    const identitiesAfter = candidate
      .prepare(
        `SELECT 'exercises' AS table_name, id, uid FROM exercises
         UNION ALL SELECT 'workouts', id, uid FROM workouts
         UNION ALL SELECT 'workout_exercises', id, uid FROM workout_exercises
         UNION ALL SELECT 'sets', id, uid FROM sets
         ORDER BY table_name, id;`
      )
      .all();
    candidate.close();
    expect(identitiesAfter).toEqual(identitiesBefore);
  });

  test("an asynchronous preparation abort removes staging after owned work closes", async () => {
    pair = createReplacementFixturePair();
    harness = createNodePreparationAdapter();
    const controller = new AbortController();
    const copy = harness.adapter.copyFile.bind(harness.adapter);
    const adapter: ReplacementPreparationAdapter = {
      ...harness.adapter,
      async copyFile(sourceUri, destinationUri) {
        await copy(sourceUri, destinationUri);
        controller.abort();
      },
    };

    await expect(
      prepareReplacementCandidateWithAdapter({
        adapter,
        source: sourceFor(pair.candidatePath),
        signal: controller.signal,
      })
    ).resolves.toBeNull();
    expect(harness.opened).toEqual([]);
    expect(retainedDirectories(harness)).toEqual([]);
  });

  test.each([
    ["empty", new Uint8Array()],
    ["wrong header", new TextEncoder().encode("not a sqlite database")],
  ])("rejects an %s source before opening SQLite", async (_label, bytes) => {
    pair = createReplacementFixturePair();
    const sourcePath = join(pair.directory, "invalid-source");
    writeFileSync(sourcePath, bytes);
    harness = createNodePreparationAdapter();

    await expect(
      prepareReplacementCandidateWithAdapter({
        adapter: harness.adapter,
        source: sourceFor(sourcePath),
      })
    ).rejects.toMatchObject({
      code: _label === "empty" ? "source_unreadable" : "invalid_sqlite",
    });
    expect(harness.opened).toHaveLength(0);
    expect(retainedDirectories(harness)).toEqual([]);
  });

  test("rejects an oversized source before opening SQLite", async () => {
    pair = createReplacementFixturePair();
    migratePairCandidate(pair);
    harness = createNodePreparationAdapter();
    const adapter: ReplacementPreparationAdapter = {
      ...harness.adapter,
      fileInfo(uri) {
        const info = harness!.adapter.fileInfo(uri);
        return info.exists ? { ...info, size: 256 * 1024 * 1024 + 1 } : info;
      },
    };

    await expect(
      prepareReplacementCandidateWithAdapter({
        adapter,
        source: sourceFor(pair.candidatePath),
      })
    ).rejects.toMatchObject({ code: "source_unreadable" });
    expect(harness.opened).toHaveLength(0);
    expect(retainedDirectories(harness)).toEqual([]);
  });

  test.each(["table", "trigger"] as const)(
    "rejects an unknown source %s without mutating the provider file",
    async (kind) => {
      pair = createReplacementFixturePair();
      migratePairCandidate(pair);
      const database = new DatabaseSync(pair.candidatePath);
      database.exec(
        kind === "table"
          ? "CREATE TABLE untrusted_restore_extension (id INTEGER PRIMARY KEY);"
          : "CREATE TRIGGER untrusted_restore_trigger AFTER INSERT ON sets BEGIN SELECT 1; END;"
      );
      database.close();
      const sourceDigest = readFileDigest(pair.candidatePath);
      harness = createNodePreparationAdapter();

      await expect(
        prepareReplacementCandidateWithAdapter({
          adapter: harness.adapter,
          source: sourceFor(pair.candidatePath),
        })
      ).rejects.toMatchObject({
        code: "unsupported_schema",
        stage: "validating_source",
      });
      expect(readFileDigest(pair.candidatePath)).toBe(sourceDigest);
      expect(retainedDirectories(harness)).toEqual([]);
    }
  );

  test("retains staging and the primary validation error when close also fails", async () => {
    pair = createReplacementFixturePair();
    migratePairCandidate(pair);
    harness = createNodePreparationAdapter();
    const primary = new Error("primary validation failure");
    const close = new Error("validation close failure");
    const open = harness.adapter.openPrivateDatabase.bind(harness.adapter);
    let call = 0;
    const adapter: ReplacementPreparationAdapter = {
      ...harness.adapter,
      async openPrivateDatabase(uri) {
        const connection = (await open(uri)) as NodeReplacementDatabase;
        call += 1;
        if (call === 1) {
          connection.failClose = close;
          const getAll = connection.getAllSync.bind(connection);
          connection.getAllSync = ((sql: string, params?: unknown) => {
            if (sql === "PRAGMA integrity_check;") throw primary;
            return getAll(sql, params);
          }) as typeof connection.getAllSync;
        }
        return connection;
      },
    };

    await expect(
      prepareReplacementCandidateWithAdapter({
        adapter,
        source: sourceFor(pair.candidatePath),
      })
    ).rejects.toMatchObject({
      causeValue: primary,
      stage: "validating_source",
    });
    expect(retainedDirectories(harness)).toHaveLength(1);
  });

  test("retains staging when migration close acknowledgement is lost", async () => {
    pair = createReplacementFixturePair();
    migratePairCandidate(pair);
    harness = createNodePreparationAdapter();
    const close = new Error("migration close failure");
    const open = harness.adapter.openPrivateDatabase.bind(harness.adapter);
    let call = 0;
    const adapter: ReplacementPreparationAdapter = {
      ...harness.adapter,
      async openPrivateDatabase(uri) {
        const connection = (await open(uri)) as NodeReplacementDatabase;
        call += 1;
        if (call === 2) connection.failClose = close;
        return connection;
      },
    };

    await expect(
      prepareReplacementCandidateWithAdapter({
        adapter,
        source: sourceFor(pair.candidatePath),
      })
    ).rejects.toMatchObject({
      causeValue: close,
      code: "candidate_migration_failed",
    });
    expect(retainedDirectories(harness)).toHaveLength(1);
  });

  test("retains staging and the read error when header read and close both fail", async () => {
    pair = createReplacementFixturePair();
    migratePairCandidate(pair);
    harness = createNodePreparationAdapter();
    const primary = new Error("header read failure");
    const close = new Error("header close failure");
    const adapter: ReplacementPreparationAdapter = {
      ...harness.adapter,
      readHeader() {
        throw new UnconfirmedOwnedHandleCloseError(primary, close);
      },
    };

    await expect(
      prepareReplacementCandidateWithAdapter({
        adapter,
        source: sourceFor(pair.candidatePath),
      })
    ).rejects.toMatchObject({ causeValue: primary });
    expect(retainedDirectories(harness)).toHaveLength(1);
  });

  test("sealed revalidation rejects soft-link drift and removes closed staging", async () => {
    pair = createReplacementFixturePair();
    migratePairCandidate(pair);
    harness = createNodePreparationAdapter();
    const seal = harness.adapter.sealCandidate.bind(harness.adapter);
    const adapter: ReplacementPreparationAdapter = {
      ...harness.adapter,
      async sealCandidate(options) {
        const snapshot = await seal(options);
        const database = new DatabaseSync(new URL(snapshot.fileUri));
        database.exec("PRAGMA foreign_keys=OFF;");
        database.exec(
          "UPDATE program_calendar_exercises SET workout_exercise_id = 999999 WHERE id = (SELECT MIN(id) FROM program_calendar_exercises);"
        );
        database.close();
        return snapshot;
      },
    };

    await expect(
      prepareReplacementCandidateWithAdapter({
        adapter,
        source: sourceFor(pair.candidatePath),
      })
    ).rejects.toMatchObject({
      code: "soft_link_failed",
      stage: "validating_candidate",
    });
    expect(retainedDirectories(harness)).toEqual([]);
  });

  test("picker cancellation performs no staging or database work", async () => {
    harness = createNodePreparationAdapter({ source: null });

    await expect(
      prepareReplacementCandidateWithAdapter({ adapter: harness.adapter })
    ).resolves.toBeNull();
    expect(harness.opened).toEqual([]);
    expect(retainedDirectories(harness)).toEqual([]);
  });
});
