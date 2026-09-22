import { ReplacementRestoreError } from "../../lib/db/replacementRestoreContract";
import {
  reconcileReplacementRestoreMediaWithAdapters,
  type ReplacementRestoreMediaAdapters,
} from "../../lib/db/replacementRestoreMedia";
import {
  parseCommittedRestoreOutcome,
  type CompleteCommittedRestoreOutcomeRecord,
} from "../../lib/db/replacementRestoreRecords";
import {
  RESTORE_APP_TABLES,
  RESTORE_SCHEMA_MANIFEST_ID,
} from "../../lib/db/restoreSchemaManifest";
import {
  PROCESS_B,
  createEngineFixture,
  setFixtureProcess,
  type EngineFixture,
} from "../helpers/replacementRestoreDatabase";

jest.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "android" },
}));
jest.mock("expo-file-system", () => ({ File: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/documents/",
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));
jest.mock("expo-media-library/legacy", () => ({
  MediaType: { video: "video" },
  SortBy: { creationTime: "creationTime" },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAlbumsAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  getAlbumAsync: jest.fn(),
  getAssetContentUriAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
}));
jest.mock("expo-sqlite", () => ({
  backupDatabaseAsync: jest.fn(),
  openDatabaseAsync: jest.fn(),
}));
jest.mock("../../lib/utils/fileSha256", () => ({
  sha256File: jest.fn(),
  sha256FileSync: jest.fn(),
}));

const grantedAdapters = (
  resolveReference: ReplacementRestoreMediaAdapters["resolveReference"] = async () => null
): ReplacementRestoreMediaAdapters => ({
  ensurePermission: jest.fn().mockResolvedValue(true),
  resolveReference: jest.fn(resolveReference),
});

function replaceMediaRows(
  fixture: EngineFixture,
  rows: readonly {
    id: number;
    localUri: string;
    assetId?: string | null;
    originalFilename?: string | null;
    mediaCreatedAt?: number | null;
    durationMs?: number | null;
    albumName?: string | null;
  }[]
): void {
  fixture.live.database.exec("DELETE FROM media;");
  const insert = fixture.live.database.prepare(
    `INSERT INTO media (
       id, local_uri, asset_id, mime, set_id, workout_id, note, created_at,
       original_filename, media_created_at, duration_ms, album_name
     ) VALUES (?, ?, ?, 'video/mp4', NULL, NULL, 'preserved note', 1700000000000, ?, ?, ?, ?);`
  );
  for (const row of rows) {
    insert.run(
      row.id,
      row.localUri,
      row.assetId ?? null,
      row.originalFilename ?? null,
      row.mediaCreatedAt ?? null,
      row.durationMs ?? null,
      row.albumName ?? null
    );
  }
}

function mediaSnapshot(fixture: EngineFixture) {
  return fixture.live.database
    .prepare(
      `SELECT id, local_uri, asset_id, mime, set_id, workout_id, note, created_at,
              original_filename, media_created_at, duration_ms, album_name
       FROM media ORDER BY id;`
    )
    .all();
}

async function commitFixture(fixture: EngineFixture) {
  const prepared = await fixture.runtime.prepareReplacementRestore({});
  if (prepared.status !== "ready") throw new Error("fixture preparation cancelled");
  const scheduled = await fixture.runtime.scheduleReplacementRestore({ token: prepared.token });
  if (scheduled.status !== "restart_required") throw new Error("fixture scheduling cancelled");
  setFixtureProcess(fixture, PROCESS_B);
  const committed = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
    sqlite: fixture.live as never,
    nativeProcessToken: PROCESS_B,
  });
  if (committed.status !== "committed") {
    throw new Error(`fixture did not commit: ${committed.status}`);
  }
  return { scheduled, committed };
}

describe("replacement restore media coordinator", () => {
  let fixture: EngineFixture | undefined;

  afterEach(() => {
    fixture?.close();
    fixture = undefined;
  });

  test("fresh-scans current rows, changes only local_uri, and accounts for mixed matches", async () => {
    fixture = createEngineFixture();
    replaceMediaRows(fixture, [
      {
        id: 1,
        localUri: "file:///stale/one.mp4",
        assetId: "reused-one",
        originalFilename: "one.mp4",
        durationMs: 2_000,
      },
      {
        id: 2,
        localUri: "file:///stale/two.mp4",
        assetId: "reused-two",
        originalFilename: "two.mp4",
        mediaCreatedAt: 1_700_000_000_000,
      },
    ]);
    const before = mediaSnapshot(fixture);
    const adapters = grantedAdapters(async (metadata) => {
      if (metadata.originalFilename === "one.mp4") {
        return {
            assetId: "canonical-one",
            localUri: null,
            uri: "content://media/canonical-one",
            originalFilename: "one.mp4",
            mediaCreatedAt: null,
            durationMs: 2_000,
            albumName: null,
            source: "library_search",
          };
      }
      throw new Error("provider failed");
    });

    const completion = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        untrustedPreCommitMediaUris: [
          "file:///untrusted/a.mp4",
          "file:///untrusted/a.mp4",
          "content://gallery/b",
          "",
        ],
      },
      adapters
    );

    expect(completion).toEqual({
      media: {
        total: 2,
        resolved: 1,
        unresolved: 1,
        skippedPermission: 0,
        errors: [{ mediaId: 2, code: "media_resolver_failed" }],
      },
      cleanup: {
        deletedManagedFiles: 0,
        skippedUntrustedPaths: 2,
        errors: 0,
      },
      warnings: [],
    });
    const after = mediaSnapshot(fixture) as Record<string, unknown>[];
    expect(after.map((row) => row.local_uri)).toEqual([
      "content://media/canonical-one",
      "",
    ]);
    expect(after.map(({ local_uri: _afterUri, ...row }) => row)).toEqual(
      (before as Record<string, unknown>[]).map(({ local_uri: _beforeUri, ...row }) => row)
    );
    expect(adapters.resolveReference).toHaveBeenCalledTimes(2);
  });

  test("denial, explicit skip, and an empty scan remain truthful", async () => {
    fixture = createEngineFixture();
    replaceMediaRows(fixture, [{ id: 1, localUri: "file:///stale.mp4" }]);
    const denied: ReplacementRestoreMediaAdapters = {
      ensurePermission: jest.fn().mockResolvedValue(false),
      resolveReference: jest.fn(),
    };
    const deniedResult = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        untrustedPreCommitMediaUris: [],
      },
      denied
    );
    expect(deniedResult.media).toMatchObject({
      total: 1,
      resolved: 0,
      unresolved: 1,
      skippedPermission: 1,
    });
    expect(deniedResult.media.errors).toEqual([
      { mediaId: null, code: "permission_not_established" },
    ]);
    expect(denied.resolveReference).not.toHaveBeenCalled();
    expect(mediaSnapshot(fixture)).toEqual([
      expect.objectContaining({ id: 1, local_uri: "" }),
    ]);

    replaceMediaRows(fixture, [{ id: 2, localUri: "file:///another-stale.mp4" }]);
    const skipped = grantedAdapters();
    const skippedResult = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "skip",
        untrustedPreCommitMediaUris: [],
      },
      skipped
    );
    expect(skippedResult.media).toEqual({
      total: 1,
      resolved: 0,
      unresolved: 1,
      skippedPermission: 0,
      errors: [],
    });
    expect(skipped.ensurePermission).not.toHaveBeenCalled();
    expect(skipped.resolveReference).not.toHaveBeenCalled();

    replaceMediaRows(fixture, []);
    const empty = grantedAdapters();
    await expect(
      reconcileReplacementRestoreMediaWithAdapters(
        {
          sqlite: fixture.live as never,
          mode: "scan",
          untrustedPreCommitMediaUris: [],
        },
        empty
      )
    ).resolves.toMatchObject({ media: { total: 0, resolved: 0, unresolved: 0 } });
    expect(empty.ensurePermission).not.toHaveBeenCalled();
  });

  test("aborts before permission and drains an active resolver without later writes", async () => {
    fixture = createEngineFixture();
    replaceMediaRows(fixture, [
      { id: 1, localUri: "file:///one.mp4", originalFilename: "one.mp4", durationMs: 2_000 },
      { id: 2, localUri: "file:///two.mp4", originalFilename: "two.mp4", durationMs: 2_000 },
    ]);
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const beforePermission = grantedAdapters();
    const early = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        signal: alreadyAborted.signal,
        untrustedPreCommitMediaUris: [],
      },
      beforePermission
    );
    expect(beforePermission.ensurePermission).not.toHaveBeenCalled();
    expect(early.media).toMatchObject({ total: 2, resolved: 0, unresolved: 2 });
    expect(early.warnings).toContainEqual({
      stage: "media_reconciliation",
      code: "media_scan_aborted",
    });

    replaceMediaRows(fixture, [
      { id: 1, localUri: "file:///one.mp4", originalFilename: "one.mp4", durationMs: 2_000 },
      { id: 2, localUri: "file:///two.mp4", originalFilename: "two.mp4", durationMs: 2_000 },
    ]);
    let release!: (value: Awaited<ReturnType<ReplacementRestoreMediaAdapters["resolveReference"]>>) => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const resolverResult = new Promise<
      Awaited<ReturnType<ReplacementRestoreMediaAdapters["resolveReference"]>>
    >((resolve) => {
      release = resolve;
    });
    const duringController = new AbortController();
    const during = grantedAdapters(async () => {
      started();
      return resolverResult;
    });
    const completion = reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        signal: duringController.signal,
        untrustedPreCommitMediaUris: [],
      },
      during
    );
    await began;
    duringController.abort();
    release({
      assetId: "late",
      localUri: null,
      uri: "content://media/late",
      originalFilename: "one.mp4",
      mediaCreatedAt: null,
      durationMs: 2_000,
      albumName: null,
      source: "library_search",
    });
    const result = await completion;
    expect(result.media).toMatchObject({ total: 2, resolved: 0, unresolved: 2 });
    expect(during.resolveReference).toHaveBeenCalledTimes(1);
    expect((mediaSnapshot(fixture) as Record<string, unknown>[]).map((row) => row.local_uri)).toEqual([
      "",
      "",
    ]);
  });

  test("observes cancellation raised by initial and between-row progress callbacks", async () => {
    fixture = createEngineFixture();
    replaceMediaRows(fixture, [
      { id: 1, localUri: "file:///one.mp4", originalFilename: "one.mp4", durationMs: 2_000 },
      { id: 2, localUri: "file:///two.mp4", originalFilename: "two.mp4", durationMs: 2_000 },
    ]);
    const initialController = new AbortController();
    const initialAdapters = grantedAdapters();
    const initial = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        signal: initialController.signal,
        onProgress: (progress) => {
          if (progress.completed === 0) initialController.abort();
        },
        untrustedPreCommitMediaUris: [],
      },
      initialAdapters
    );
    expect(initialAdapters.ensurePermission).not.toHaveBeenCalled();
    expect(initialAdapters.resolveReference).not.toHaveBeenCalled();
    expect(initial).toMatchObject({
      media: { total: 2, resolved: 0, unresolved: 2 },
      warnings: [{ stage: "media_reconciliation", code: "media_scan_aborted" }],
    });

    replaceMediaRows(fixture, [
      { id: 1, localUri: "file:///one.mp4", originalFilename: "one.mp4", durationMs: 2_000 },
      { id: 2, localUri: "file:///two.mp4", originalFilename: "two.mp4", durationMs: 2_000 },
      { id: 3, localUri: "file:///three.mp4", originalFilename: "three.mp4", durationMs: 2_000 },
    ]);
    const betweenRowsController = new AbortController();
    const betweenRowsAdapters = grantedAdapters(async (metadata) => ({
      assetId: metadata.assetId ?? "verified",
      localUri: null,
      uri: `content://media/${metadata.originalFilename}`,
      originalFilename: metadata.originalFilename ?? null,
      mediaCreatedAt: metadata.mediaCreatedAt ?? null,
      durationMs: metadata.durationMs ?? null,
      albumName: metadata.albumName ?? null,
      source: "library_search",
    }));
    const betweenRows = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        signal: betweenRowsController.signal,
        onProgress: (progress) => {
          if (progress.completed === 1) betweenRowsController.abort();
        },
        untrustedPreCommitMediaUris: [],
      },
      betweenRowsAdapters
    );
    expect(betweenRowsAdapters.ensurePermission).toHaveBeenCalledTimes(1);
    expect(betweenRowsAdapters.resolveReference).toHaveBeenCalledTimes(1);
    expect(betweenRows).toMatchObject({
      media: { total: 3, resolved: 1, unresolved: 2 },
      warnings: [{ stage: "media_reconciliation", code: "media_scan_aborted" }],
    });
    expect((mediaSnapshot(fixture) as Record<string, unknown>[]).map((row) => row.local_uri)).toEqual([
      "content://media/one.mp4",
      "",
      "",
    ]);
  });

  test("write failures downgrade a repair only when an empty URI can still be proved", async () => {
    fixture = createEngineFixture();
    replaceMediaRows(fixture, [
      { id: 1, localUri: "", originalFilename: "one.mp4", durationMs: 2_000 },
    ]);
    const adapters = grantedAdapters(async () => ({
      assetId: "one",
      localUri: null,
      uri: "content://media/one",
      originalFilename: "one.mp4",
      mediaCreatedAt: null,
      durationMs: 2_000,
      albumName: null,
      source: "library_search",
    }));
    fixture.live.beforeRun = (sql) => {
      if (sql.startsWith("UPDATE media SET local_uri")) throw new Error("write failed");
    };
    const result = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        untrustedPreCommitMediaUris: [],
      },
      adapters
    );
    expect(result.media).toMatchObject({ total: 1, resolved: 0, unresolved: 1 });
    expect(result.media.errors).toEqual([
      { mediaId: 1, code: "local_uri_write_failed" },
    ]);

    fixture.live.beforeRun = undefined;
    replaceMediaRows(fixture, [
      { id: 2, localUri: "file:///must-clear.mp4", originalFilename: "two.mp4", durationMs: 2_000 },
    ]);
    fixture.live.beforeRun = (sql) => {
      if (sql.startsWith("UPDATE media SET local_uri")) throw new Error("write failed");
    };
    await expect(
      reconcileReplacementRestoreMediaWithAdapters(
        {
          sqlite: fixture.live as never,
          mode: "skip",
          untrustedPreCommitMediaUris: [],
        },
        grantedAdapters()
      )
    ).rejects.toThrow("could not be durably verified");
  });

  test("caps row diagnostics, preserves aggregate totals, and ignores progress exceptions", async () => {
    fixture = createEngineFixture();
    replaceMediaRows(
      fixture,
      Array.from({ length: 70 }, (_, index) => ({
        id: index + 1,
        localUri: "",
        originalFilename: `video-${index}.mp4`,
        durationMs: 2_000,
      }))
    );
    const result = await reconcileReplacementRestoreMediaWithAdapters(
      {
        sqlite: fixture.live as never,
        mode: "scan",
        onProgress: () => {
          throw new Error("ignored progress failure");
        },
        untrustedPreCommitMediaUris: [],
      },
      grantedAdapters()
    );
    expect(result.media).toMatchObject({ total: 70, resolved: 0, unresolved: 70 });
    expect(result.media.errors).toHaveLength(64);
    expect(result.warnings).toContainEqual({
      stage: "media_reconciliation",
      code: "media_diagnostics_truncated",
    });
  });

  test("blocks durable completion with committed semantics when a current URI cannot be cleared", async () => {
    fixture = createEngineFixture({
      reconcileMedia: (options) =>
        reconcileReplacementRestoreMediaWithAdapters(options, grantedAdapters()),
    });
    const { scheduled } = await commitFixture(fixture);
    fixture.live.database
      .prepare("UPDATE media SET local_uri = 'file:///interrupted-repair.mp4' WHERE id = 80;")
      .run();
    fixture.live.beforeRun = (sql) => {
      if (sql.startsWith("UPDATE media SET local_uri")) throw new Error("write failed");
    };

    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: scheduled.restoreId,
        mode: "skip",
      })
    ).rejects.toMatchObject({
      liveDatabaseChanged: true,
      transactionState: "committed",
      recovery: "retry_committed_cleanup",
    });
    expect(fixture.controls.outcome.status).toBe("present");
    if (fixture.controls.outcome.status !== "present") throw new Error("missing outcome");
    expect(parseCommittedRestoreOutcome(fixture.controls.outcome.json).postCommitStatus).toBe(
      "pending"
    );

    fixture.live.beforeRun = undefined;
    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: scheduled.restoreId,
        mode: "skip",
      })
    ).resolves.toMatchObject({ media: { total: 1, resolved: 0, unresolved: 1 } });
  });

  test("blocks completion when a media link changes during awaited resolution", async () => {
    fixture = createEngineFixture({
      reconcileMedia: (options) =>
        reconcileReplacementRestoreMediaWithAdapters(
          options,
          grantedAdapters(async () => {
            fixture!.live.database
              .prepare("UPDATE media SET set_id = NULL WHERE id = 80;")
              .run();
            return {
              assetId: "verified",
              localUri: null,
              uri: "content://media/verified",
              originalFilename: "candidate-80.mp4",
              mediaCreatedAt: 1_790_010_179_000,
              durationMs: 4_200,
              albumName: "LiftingLog",
              source: "library_search",
            };
          })
        ),
    });
    const { scheduled } = await commitFixture(fixture);

    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: scheduled.restoreId,
        mode: "scan",
      })
    ).rejects.toMatchObject({
      liveDatabaseChanged: true,
      transactionState: "committed",
      recovery: "retry_committed_cleanup",
    });
    expect(fixture.controls.outcome.status).toBe("present");
    if (fixture.controls.outcome.status !== "present") throw new Error("missing outcome");
    expect(parseCommittedRestoreOutcome(fixture.controls.outcome.json).postCommitStatus).toBe(
      "pending"
    );
    expect(
      fixture.controls.writes.some(
        (write) =>
          write.name === "outcome" &&
          JSON.parse(write.json).postCommitStatus === "complete"
      )
    ).toBe(false);
  });

  test("publishes a strict complete record and treats its deletion failure as harmless", async () => {
    fixture = createEngineFixture({
      reconcileMedia: (options) =>
        reconcileReplacementRestoreMediaWithAdapters(
          options,
          grantedAdapters(async () => ({
            assetId: "verified",
            localUri: null,
            uri: "content://media/verified",
            originalFilename: "candidate-80.mp4",
            mediaCreatedAt: 1_790_010_179_000,
            durationMs: 4_200,
            albumName: "LiftingLog",
            source: "library_search",
          }))
        ),
    });
    const { scheduled } = await commitFixture(fixture);
    fixture.controls.deleteFault = (name) => {
      if (name === "outcome") throw new Error("delete acknowledgement lost");
    };

    const result = await fixture.runtime.completeReplacementRestorePostCommit({
      sqlite: fixture.live as never,
      restoreId: scheduled.restoreId,
      mode: "scan",
    });
    expect(result).toMatchObject({
      status: "restored",
      restoreId: scheduled.restoreId,
      liveDatabaseChanged: true,
      media: { total: 1, resolved: 1, unresolved: 0 },
      cleanup: { deletedManagedFiles: 0, skippedUntrustedPaths: 2, errors: 0 },
    });
    if (fixture.controls.outcome.status !== "present") throw new Error("missing complete outcome");
    const complete = parseCommittedRestoreOutcome(fixture.controls.outcome.json);
    expect(complete).toMatchObject({
      postCommitStatus: "complete",
      result,
    });
  });

  test("a recreated runtime resolves fresh current rows and forgets old URI cleanup candidates", async () => {
    fixture = createEngineFixture({
      reconcileMedia: (options) =>
        reconcileReplacementRestoreMediaWithAdapters(options, grantedAdapters()),
    });
    const { scheduled } = await commitFixture(fixture);
    replaceMediaRows(fixture, [
      {
        id: 80,
        localUri: "file:///fresh-stale.mp4",
        assetId: "reused-id",
        originalFilename: "fresh-current.mp4",
        durationMs: 8_000,
      },
    ]);
    const resolver = jest.fn(async () => ({
      assetId: "fresh-canonical",
      localUri: null,
      uri: "content://media/fresh-canonical",
      originalFilename: "fresh-current.mp4",
      mediaCreatedAt: null,
      durationMs: 8_000,
      albumName: null,
      source: "library_search" as const,
    }));
    const recreated = fixture.recreateRuntime((options) =>
      reconcileReplacementRestoreMediaWithAdapters(options, grantedAdapters(resolver))
    );

    const result = await recreated.completeReplacementRestorePostCommit({
      sqlite: fixture.live as never,
      restoreId: scheduled.restoreId,
      mode: "scan",
    });
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "reused-id",
        originalFilename: "fresh-current.mp4",
        durationMs: 8_000,
      })
    );
    expect(result).toMatchObject({
      media: { total: 1, resolved: 1, unresolved: 0 },
      cleanup: { deletedManagedFiles: 0, skippedUntrustedPaths: 0, errors: 0 },
    });
    expect(mediaSnapshot(fixture)).toEqual([
      expect.objectContaining({ id: 80, local_uri: "content://media/fresh-canonical" }),
    ]);
  });

  test("rereads after lost write acknowledgement and retries controls without rescanning", async () => {
    const resolver = jest.fn(async () => ({
      assetId: "verified",
      localUri: null,
      uri: "content://media/verified",
      originalFilename: "candidate-80.mp4",
      mediaCreatedAt: 1_790_010_179_000,
      durationMs: 4_200,
      albumName: "LiftingLog",
      source: "library_search" as const,
    }));
    fixture = createEngineFixture({
      reconcileMedia: (options) =>
        reconcileReplacementRestoreMediaWithAdapters(options, grantedAdapters(resolver)),
    });
    const { scheduled } = await commitFixture(fixture);
    fixture.controls.writeFault = (name, json) => {
      if (name === "outcome" && JSON.parse(json).postCommitStatus === "complete") {
        fixture!.controls.outcome = { status: "present", json };
        throw new Error("acknowledgement lost after rename");
      }
    };
    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: scheduled.restoreId,
        mode: "scan",
      })
    ).resolves.toMatchObject({ media: { resolved: 1 } });
    expect(resolver).toHaveBeenCalledTimes(1);

    fixture.controls.deleteFault = undefined;
    fixture.controls.writeFault = undefined;
    const nextFixture = createEngineFixture({
      reconcileMedia: (options) =>
        reconcileReplacementRestoreMediaWithAdapters(options, grantedAdapters(resolver)),
    });
    fixture.close();
    fixture = nextFixture;
    const next = await commitFixture(fixture);
    fixture.controls.readOverride = (name, current) => {
      if (
        name === "outcome" &&
        current.status === "present" &&
        JSON.parse(current.json).postCommitStatus === "complete"
      ) {
        return { status: "unreadable", code: "readback_failed" };
      }
      return current;
    };
    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: next.scheduled.restoreId,
        mode: "scan",
      })
    ).rejects.toMatchObject({
      liveDatabaseChanged: true,
      transactionState: "committed",
      recovery: "retry_committed_cleanup",
    });
    fixture.controls.readOverride = undefined;
    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: next.scheduled.restoreId,
        mode: "scan",
      })
    ).resolves.toMatchObject({ media: { resolved: 1 } });
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  test("validates controls before media work and serializes concurrent completion", async () => {
    let release!: (value: null) => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const resolver = jest.fn(async () => {
      began();
      return new Promise<null>((resolve) => {
        release = resolve;
      });
    });
    fixture = createEngineFixture({
      reconcileMedia: (options) =>
        reconcileReplacementRestoreMediaWithAdapters(options, grantedAdapters(resolver)),
    });
    const { scheduled } = await commitFixture(fixture);
    const first = fixture.runtime.completeReplacementRestorePostCommit({
      sqlite: fixture.live as never,
      restoreId: scheduled.restoreId,
      mode: "scan",
    });
    await started;
    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: scheduled.restoreId,
        mode: "skip",
      })
    ).rejects.toMatchObject({
      code: "restore_busy",
      liveDatabaseChanged: "unknown",
    });
    expect(() =>
      fixture!.runtime.resumeCommittedStartupFinalization({
        restoreId: scheduled.restoreId,
      })
    ).toThrow(expect.objectContaining({ code: "restore_busy" }));
    release(null);
    await first;
    expect(resolver).toHaveBeenCalledTimes(1);

    const staleMedia = jest.fn();
    const staleFixture = createEngineFixture({ reconcileMedia: staleMedia });
    fixture.close();
    fixture = staleFixture;
    const stale = await commitFixture(fixture);
    await expect(
      fixture.runtime.completeReplacementRestorePostCommit({
        sqlite: fixture.live as never,
        restoreId: "restore-v1:wrong-restore-00000001",
        mode: "scan",
      })
    ).rejects.toBeInstanceOf(ReplacementRestoreError);
    expect(stale.scheduled.restoreId).not.toBe("restore-v1:wrong-restore-00000001");
    expect(staleMedia).not.toHaveBeenCalled();
  });

  test("strictly rejects malformed complete records", () => {
    const rowsByTable = Object.fromEntries(
      RESTORE_APP_TABLES.map((table) => [table, table === "media" ? 1 : 0])
    ) as CompleteCommittedRestoreOutcomeRecord["rowsByTable"];
    const record: CompleteCommittedRestoreOutcomeRecord = {
      version: 1,
      restoreId: "restore-v1:strict-complete-00000001",
      candidateSha256: "a".repeat(64),
      schemaManifestId: RESTORE_SCHEMA_MANIFEST_ID,
      rowsByTable,
      pbEventsRebuilt: 0,
      postCommitStatus: "complete",
      result: {
        status: "restored",
        restoreId: "restore-v1:strict-complete-00000001",
        liveDatabaseChanged: true,
        rowsByTable,
        pbEventsRebuilt: 0,
        media: {
          total: 1,
          resolved: 0,
          unresolved: 1,
          skippedPermission: 0,
          errors: [],
        },
        cleanup: {
          deletedManagedFiles: 0,
          skippedUntrustedPaths: 0,
          errors: 0,
        },
        warnings: [],
      },
    };
    expect(parseCommittedRestoreOutcome(JSON.stringify(record))).toEqual(record);

    const malformed = [
      { ...record, extra: true },
      { ...record, result: { ...record.result, restoreId: "restore-v1:other-00000001" } },
      {
        ...record,
        result: {
          ...record.result,
          media: { ...record.result.media, resolved: 1, unresolved: 1 },
        },
      },
      {
        ...record,
        result: {
          ...record.result,
          media: { ...record.result.media, skippedPermission: 2 },
        },
      },
      {
        ...record,
        result: {
          ...record.result,
          warnings: Array.from({ length: 65 }, () => ({
            stage: "media_reconciliation",
            code: "bounded",
          })),
        },
      },
    ];
    for (const candidate of malformed) {
      expect(() => parseCommittedRestoreOutcome(JSON.stringify(candidate))).toThrow(
        "Committed restore"
      );
    }
  });
});
