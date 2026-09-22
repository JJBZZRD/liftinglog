import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { ReplacementRestoreError } from "../../lib/db/replacementRestoreContract";
import {
  RESTORE_APP_TABLES,
  RESTORE_SCHEMA_MANIFEST_ID,
} from "../../lib/db/restoreSchemaManifest";
import {
  openValidatedReplacementSession,
  readReplacementTableCounts,
} from "../../lib/db/replacementRestoreTransaction";
import {
  RestoreRecordValidationError,
  parseCommittedRestoreOutcome,
  parsePendingRestoreRecord,
} from "../../lib/db/replacementRestoreRecords";
import {
  PROCESS_A,
  PROCESS_B,
  PROCESS_C,
  NodeReplacementDatabase,
  corruptFile,
  createEngineFixture,
  readFileDigest,
  setFixtureProcess,
  type EngineFixture,
} from "../helpers/replacementRestoreDatabase";
import { snapshotAppData } from "../helpers/replacementRestoreProof";

jest.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "android" },
}));
jest.mock("expo-file-system", () => ({ File: jest.fn() }));
jest.mock("expo-sqlite", () => ({
  backupDatabaseAsync: jest.fn(),
  openDatabaseAsync: jest.fn(),
}));
jest.mock("../../lib/utils/fileSha256", () => ({
  sha256File: jest.fn(),
  sha256FileSync: jest.fn(),
}));

async function prepareAndSchedule(fixture: EngineFixture) {
  const prepared = await fixture.runtime.prepareReplacementRestore({});
  expect(prepared.status).toBe("ready");
  if (prepared.status !== "ready") throw new Error("fixture preparation cancelled");
  const scheduled = await fixture.runtime.scheduleReplacementRestore({
    token: prepared.token,
  });
  expect(scheduled.status).toBe("restart_required");
  if (scheduled.status !== "restart_required") throw new Error("fixture scheduling cancelled");
  return { prepared, scheduled };
}

function beginCount(fixture: EngineFixture): number {
  return fixture.live.sqlLog.filter((sql) => sql.trim() === "BEGIN IMMEDIATE;").length;
}

function installStaleOutcome(fixture: EngineFixture): void {
  if (fixture.controls.pending.status !== "present") throw new Error("missing pending");
  const pending = parsePendingRestoreRecord(
    fixture.controls.pending.json,
    fixture.rootUri
  );
  fixture.controls.outcome = {
    status: "present",
    json: JSON.stringify({
      version: 1,
      restoreId: "restore-v1:stale-outcome-00000001",
      candidateSha256: pending.candidateSha256,
      schemaManifestId: RESTORE_SCHEMA_MANIFEST_ID,
      rowsByTable: pending.rowsByTable,
      pbEventsRebuilt: pending.rowsByTable.pr_events,
      postCommitStatus: "pending",
    }),
  };
}

const MALFORMED_PROCESS_TOKENS = [
  ["truthy string", "process-v1:not-a-uuid"],
  ["object", { token: PROCESS_B }],
  ["uppercase UUID", "process-v1:AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"],
] as const;

describe("replacement restore production engine", () => {
  let fixture: EngineFixture | undefined;

  afterEach(() => {
    fixture?.close();
    fixture = undefined;
  });

  test("schedules without live mutation, blocks process A, then exactly replaces in process B", async () => {
    fixture = createEngineFixture();
    const before = snapshotAppData(fixture.live.database);
    const candidate = new DatabaseSync(fixture.candidatePath, { readOnly: true });
    const candidateRows = snapshotAppData(candidate);
    candidate.close();

    const { scheduled } = await prepareAndSchedule(fixture);
    expect(snapshotAppData(fixture.live.database)).toEqual(before);
    expect(beginCount(fixture)).toBe(0);

    expect(
      fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: PROCESS_A,
      })
    ).toEqual({
      status: "restart_required",
      restoreId: scheduled.restoreId,
      liveDatabaseChanged: false,
      restartRequired: true,
    });

    setFixtureProcess(fixture, PROCESS_B);
    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    if (result.status === "failed") throw result.error;
    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw new Error(`unexpected ${result.status}`);
    expect(result.restoreId).toBe(scheduled.restoreId);
    expect(result.liveDatabaseChanged).toBe(true);
    expect(result.rowsByTable.pr_events).toBe(result.pbEventsRebuilt);
    expect(fixture.controls.pending).toEqual({ status: "absent" });
    expect(fixture.controls.outcome.status).toBe("present");
    expect(existsSync(fixture.candidatePath)).toBe(false);
    expect(beginCount(fixture)).toBe(1);

    const restored = snapshotAppData(fixture.live.database);
    for (const table of Object.keys(candidateRows)) {
      if (table === "pr_events" || table === "media") continue;
      expect(restored[table as keyof typeof restored]).toEqual(
        candidateRows[table as keyof typeof candidateRows]
      );
    }
    expect(
      fixture.live.database.prepare("SELECT id, local_uri FROM media ORDER BY id;").all()
    ).toEqual(
      candidateRows.media.map((row) => ({
        id: (row as { id: number }).id,
        local_uri: "",
      }))
    );
    expect(
      fixture.live.database
        .prepare("SELECT set_id, exercise_id, type, metric_value, occurred_at FROM pr_events ORDER BY id;")
        .all()
    ).not.toEqual(candidateRows.pr_events);
    expect(
      fixture.live.database.prepare("SELECT COUNT(*) AS count FROM workouts WHERE id >= 700;").get()
    ).toEqual({ count: 0 });

    expect(
      fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: PROCESS_B,
      })
    ).toMatchObject({
      status: "postcommit_pending",
      restoreId: scheduled.restoreId,
      requiresExplicitMediaScan: true,
    });
  });

  test("an empty candidate exactly replaces a populated live database", async () => {
    fixture = createEngineFixture();
    const before = snapshotAppData(fixture.live.database);
    expect(Object.values(before).some((rows) => rows.length > 0)).toBe(true);
    const candidate = new DatabaseSync(fixture.candidatePath);
    candidate.exec("PRAGMA foreign_keys=OFF;");
    for (const table of RESTORE_APP_TABLES) {
      candidate.exec(`DELETE FROM "${table}";`);
    }
    candidate.close();
    await prepareAndSchedule(fixture);
    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "committed",
      pbEventsRebuilt: 0,
    });
    expect(
      Object.values(snapshotAppData(fixture.live.database)).every(
        (rows) => rows.length === 0
      )
    ).toBe(true);
  });

  test("precommit media URI strings remain explicitly untrusted", () => {
    fixture = createEngineFixture();
    fixture.live.database.exec(`
      DELETE FROM media;
      INSERT INTO media (id, local_uri) VALUES (99990, 'content://gallery/video/42');
      INSERT INTO media (id, local_uri) VALUES (99991, 'file:///outside-app/video.mp4');
      INSERT INTO media (id, local_uri) VALUES (99992, 'https://example.invalid/video.mp4');
    `);
    const candidateDatabase = new DatabaseSync(fixture.candidatePath, {
      readOnly: true,
    });
    const candidateConnection = new NodeReplacementDatabase(
      candidateDatabase,
      fixture.candidatePath
    );
    const expectedRowsByTable = readReplacementTableCounts(candidateConnection);
    candidateConnection.close();
    const session = openValidatedReplacementSession({
      sqlite: fixture.live,
      candidatePath: fixture.candidateUri,
      candidateExists: () => true,
      expectedRowsByTable,
    });

    const transaction = session.replace();
    session.detach();

    expect(transaction.untrustedPreCommitMediaUris).toEqual([
      "content://gallery/video/42",
      "file:///outside-app/video.mp4",
      "https://example.invalid/video.mp4",
    ]);
    expect("preCommitMediaUriCandidates" in transaction).toBe(false);
  });

  test("prepared and scheduled tokens are single-use and stale calls are rejected", async () => {
    fixture = createEngineFixture();
    const prepared = await fixture.runtime.prepareReplacementRestore({});
    if (prepared.status !== "ready") throw new Error("unexpected cancellation");
    await expect(fixture.runtime.prepareReplacementRestore({})).rejects.toMatchObject({
      code: "restore_busy",
    });
    await expect(
      fixture.runtime.discardPreparedRestore("preparation-v1:stale-token")
    ).rejects.toMatchObject({ code: "restore_busy" });
    const scheduled = await fixture.runtime.scheduleReplacementRestore({
      token: prepared.token,
    });
    expect(scheduled.status).toBe("restart_required");
    await expect(
      fixture.runtime.scheduleReplacementRestore({ token: prepared.token })
    ).rejects.toMatchObject({ code: "restore_busy" });
    await expect(fixture.runtime.discardPreparedRestore(prepared.token)).rejects.toMatchObject({
      code: "restore_busy",
    });
  });

  test("an abort before scheduling publication removes the private candidate", async () => {
    fixture = createEngineFixture();
    const prepared = await fixture.runtime.prepareReplacementRestore({});
    if (prepared.status !== "ready") throw new Error("unexpected cancellation");
    const controller = new AbortController();
    controller.abort();

    await expect(
      fixture.runtime.scheduleReplacementRestore({
        token: prepared.token,
        signal: controller.signal,
      })
    ).resolves.toEqual({ status: "cancelled", liveDatabaseChanged: false });
    expect(fixture.controls.pending).toEqual({ status: "absent" });
    expect(existsSync(fixture.candidatePath)).toBe(false);
  });

  test("an abort raised by asynchronous hashing cancels before publication", async () => {
    const controller = new AbortController();
    fixture = createEngineFixture({
      async hashCandidate() {
        controller.abort();
        throw new Error("hash aborted");
      },
    });
    const prepared = await fixture.runtime.prepareReplacementRestore({});
    if (prepared.status !== "ready") throw new Error("unexpected cancellation");

    await expect(
      fixture.runtime.scheduleReplacementRestore({
        token: prepared.token,
        signal: controller.signal,
      })
    ).resolves.toEqual({ status: "cancelled", liveDatabaseChanged: false });
    expect(fixture.controls.pending).toEqual({ status: "absent" });
    expect(existsSync(fixture.candidatePath)).toBe(false);
  });

  test("successful publication wins an abort raised during the native write", async () => {
    fixture = createEngineFixture();
    const controller = new AbortController();
    fixture.controls.writeFault = (name) => {
      if (name === "pending") controller.abort();
    };
    const prepared = await fixture.runtime.prepareReplacementRestore({});
    if (prepared.status !== "ready") throw new Error("unexpected cancellation");

    await expect(
      fixture.runtime.scheduleReplacementRestore({
        token: prepared.token,
        signal: controller.signal,
      })
    ).resolves.toMatchObject({ status: "restart_required" });
    expect(fixture.controls.pending.status).toBe("present");
    expect(existsSync(fixture.candidatePath)).toBe(true);
  });

  test("safe scheduled cancellation proves absence before deleting staging", async () => {
    fixture = createEngineFixture();
    const before = snapshotAppData(fixture.live.database);
    const { scheduled } = await prepareAndSchedule(fixture);

    await fixture.runtime.cancelScheduledReplacementRestore(scheduled.restoreId);

    expect(fixture.controls.pending).toEqual({ status: "absent" });
    expect(existsSync(fixture.candidatePath)).toBe(false);
    expect(snapshotAppData(fixture.live.database)).toEqual(before);
    await expect(
      fixture.runtime.cancelScheduledReplacementRestore(scheduled.restoreId)
    ).rejects.toBeInstanceOf(ReplacementRestoreError);
  });

  test.each(["write_success_read_unavailable", "write_throw_read_unavailable"])(
    "retains a possibly published candidate after %s",
    async (fault) => {
      fixture = createEngineFixture();
      let publicationStarted = false;
      fixture.controls.writeFault = (name) => {
        if (name !== "pending") return;
        publicationStarted = true;
        if (fault === "write_throw_read_unavailable") {
          throw new Error("ack lost after native publication");
        }
      };
      fixture.controls.readOverride = (name, current) =>
        name === "pending" && publicationStarted
          ? { status: "unreadable", code: "injected_after_publish" }
          : current;
      const prepared = await fixture.runtime.prepareReplacementRestore({});
      if (prepared.status !== "ready") throw new Error("unexpected cancellation");

      await expect(
        fixture.runtime.scheduleReplacementRestore({ token: prepared.token })
      ).rejects.toMatchObject({ code: "outcome_ambiguous" });
      expect(existsSync(fixture.candidatePath)).toBe(true);
      expect(fixture.discardedPaths).toEqual([]);
    }
  );

  test("a write that throws after publishing succeeds when the physical record matches", async () => {
    fixture = createEngineFixture();
    fixture.controls.writeFault = (name, json) => {
      if (name !== "pending") return;
      fixture!.controls.pending = { status: "present", json };
      throw new Error("native acknowledgement lost after rename");
    };
    const prepared = await fixture.runtime.prepareReplacementRestore({});
    if (prepared.status !== "ready") throw new Error("unexpected cancellation");

    await expect(
      fixture.runtime.scheduleReplacementRestore({ token: prepared.token })
    ).resolves.toMatchObject({ status: "restart_required" });
    expect(existsSync(fixture.candidatePath)).toBe(true);
  });

  test("successful rollback publishes one safe single-use discard token", async () => {
    fixture = createEngineFixture();
    const before = snapshotAppData(fixture.live.database);
    const { scheduled } = await prepareAndSchedule(fixture);
    let injected = false;
    fixture.live.afterExec = (sql) => {
      if (!injected && sql.startsWith('DELETE FROM main."media"')) {
        injected = true;
        throw new Error("injected after first delete");
      }
    };

    const failure = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(failure.status).toBe("failed");
    if (failure.status !== "failed") throw new Error(`unexpected ${failure.status}`);
    expect(failure.error).toMatchObject({
      code: "commit_failed",
      liveDatabaseChanged: false,
      transactionState: "rolled_back",
      recovery: "discard_and_reprepare",
    });
    expect(failure.error.recoveryToken).toBeDefined();
    expect(snapshotAppData(fixture.live.database)).toEqual(before);

    const discarded = await fixture.runtime.discardSafelyFailedScheduledRestore({
      restoreId: scheduled.restoreId,
      recoveryToken: failure.error.recoveryToken!,
    });
    expect(discarded).toEqual({
      status: "discarded",
      liveDatabaseChanged: false,
      reinitializeRequired: true,
    });
    await expect(
      fixture.runtime.discardSafelyFailedScheduledRestore({
        restoreId: scheduled.restoreId,
        recoveryToken: failure.error.recoveryToken!,
      })
    ).rejects.toMatchObject({ code: "outcome_ambiguous" });
  });

  test("same-process reload blocks a rolled-back attempt and invalidates its discard token", async () => {
    fixture = createEngineFixture();
    const { scheduled } = await prepareAndSchedule(fixture);
    fixture.live.afterExec = (sql) => {
      if (sql.startsWith('DELETE FROM main."media"')) {
        throw new Error("rollback before reload");
      }
    };
    const failure = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    if (failure.status !== "failed" || !failure.error.recoveryToken) {
      throw new Error("missing recovery token");
    }

    expect(
      fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: PROCESS_B,
      })
    ).toMatchObject({
      status: "restart_required",
      restoreId: scheduled.restoreId,
      liveDatabaseChanged: false,
    });
    await expect(
      fixture.runtime.discardSafelyFailedScheduledRestore({
        restoreId: scheduled.restoreId,
        recoveryToken: failure.error.recoveryToken,
      })
    ).rejects.toMatchObject({ code: "outcome_ambiguous" });
    expect(existsSync(fixture.candidatePath)).toBe(true);
  });

  test.each(MALFORMED_PROCESS_TOKENS)(
    "scheduling rejects a malformed %s process token before hash or publication",
    async (_label, malformedToken) => {
      let hashCalls = 0;
      fixture = createEngineFixture({
        currentToken: malformedToken as never,
        async hashCandidate() {
          hashCalls += 1;
          throw new Error("malformed-token scheduling reached hash");
        },
      });
      const prepared = await fixture.runtime.prepareReplacementRestore({});
      if (prepared.status !== "ready") throw new Error("unexpected cancellation");

      await expect(
        fixture.runtime.scheduleReplacementRestore({ token: prepared.token })
      ).rejects.toMatchObject({ code: "invalid_process_identity" });
      expect(hashCalls).toBe(0);
      expect(fixture.controls.writes).toEqual([]);
      expect(fixture.controls.pending).toEqual({ status: "absent" });
      expect(existsSync(fixture.candidatePath)).toBe(false);
    }
  );

  test.each(MALFORMED_PROCESS_TOKENS)(
    "startup rejects a malformed %s process token without changing controls",
    async (_label, malformedToken) => {
      let hashCalls = 0;
      fixture = createEngineFixture({
        async hashCandidate(path) {
          hashCalls += 1;
          return readFileDigest(fileURLToPath(path));
        },
      });
      await prepareAndSchedule(fixture);
      expect(hashCalls).toBe(1);
      hashCalls = 0;
      fixture.controls.writes.length = 0;
      const pendingBefore = fixture.controls.pending;

      const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: malformedToken as never,
      });

      expect(result).toMatchObject({
        status: "failed",
        error: {
          code: "invalid_process_identity",
          liveDatabaseChanged: false,
          transactionState: "not_started",
        },
      });
      expect(hashCalls).toBe(0);
      expect(fixture.controls.writes).toEqual([]);
      expect(fixture.controls.pending).toEqual(pendingBefore);
      expect(beginCount(fixture)).toBe(0);
      expect(fixture.live.sqlLog.some((sql) => sql.startsWith("ATTACH DATABASE"))).toBe(
        false
      );
    }
  );

  test("a BEGIN invocation that throws after opening is rolled back before unchanged is claimed", async () => {
    fixture = createEngineFixture();
    const before = snapshotAppData(fixture.live.database);
    await prepareAndSchedule(fixture);
    let injected = false;
    fixture.live.afterExec = (sql) => {
      if (!injected && sql.trim() === "BEGIN IMMEDIATE;") {
        injected = true;
        throw new Error("BEGIN acknowledgement lost");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(result).toMatchObject({
      status: "failed",
      error: {
        code: "commit_failed",
        liveDatabaseChanged: false,
        transactionState: "rolled_back",
      },
    });
    expect(snapshotAppData(fixture.live.database)).toEqual(before);
    expect(fixture.live.sqlLog.some((sql) => sql.trim() === "ROLLBACK;")).toBe(true);
  });

  test("a COMMIT invocation that throws is unknown even when ROLLBACK then fails", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    let injected = false;
    fixture.live.afterExec = (sql) => {
      if (!injected && sql.trim() === "COMMIT;") {
        injected = true;
        throw new Error("COMMIT acknowledgement lost");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(result).toMatchObject({
      status: "failed",
      error: {
        code: "commit_failed",
        liveDatabaseChanged: "unknown",
        transactionState: "unknown",
        recoveryToken: undefined,
      },
    });
    expect(fixture.controls.pending.status).toBe("present");
    expect(fixture.controls.outcome).toEqual({ status: "absent" });
  });

  test("unknown prior attempt never becomes unchanged after a later rollback", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    fixture.live.afterExec = (sql) => {
      if (sql.trim() === "COMMIT;") throw new Error("uncertain commit");
    };
    fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    fixture.live.afterExec = (sql) => {
      if (sql.startsWith('DELETE FROM main."media"')) throw new Error("retry fault");
    };
    setFixtureProcess(fixture, PROCESS_C);

    const retry = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_C,
    });
    expect(retry).toMatchObject({
      status: "failed",
      error: {
        liveDatabaseChanged: "unknown",
        transactionState: "unknown",
        recoveryToken: undefined,
      },
    });
    if (fixture.controls.pending.status !== "present") throw new Error("missing pending");
    const pending = parsePendingRestoreRecord(
      fixture.controls.pending.json,
      fixture.rootUri
    );
    expect(pending.state).toBe("attempting");
  });

  test.each([
    ["after delete", (sql: string) => sql.startsWith('DELETE FROM main."media"')],
    [
      "after final copy",
      (sql: string) => sql.startsWith("INSERT INTO main.\"exercise_formula_overrides\""),
    ],
  ])("real SQL rollback restores live rows for a fault %s", async (_label, matches) => {
    fixture = createEngineFixture();
    const before = snapshotAppData(fixture.live.database);
    await prepareAndSchedule(fixture);
    let injected = false;
    fixture.live.afterExec = (sql) => {
      if (!injected && matches(sql)) {
        injected = true;
        throw new Error("injected transaction fault");
      }
    };
    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(result.status).toBe("failed");
    expect(snapshotAppData(fixture.live.database)).toEqual(before);
  });

  test("PB rebuild failure rolls back the physical replacement", async () => {
    fixture = createEngineFixture();
    const before = snapshotAppData(fixture.live.database);
    await prepareAndSchedule(fixture);
    let injected = false;
    fixture.live.afterRun = (sql) => {
      if (!injected && sql.startsWith("INSERT INTO main.pr_events")) {
        injected = true;
        throw new Error("injected PB rebuild fault");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: {
        liveDatabaseChanged: false,
        transactionState: "rolled_back",
      },
    });
    expect(snapshotAppData(fixture.live.database)).toEqual(before);
  });

  test("changed candidate fails before BEGIN and remains available for safe discard", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    corruptFile(fixture.candidatePath);

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: {
        code: "candidate_changed",
        liveDatabaseChanged: false,
        transactionState: "not_started",
        recoveryToken: expect.any(String),
      },
    });
    expect(beginCount(fixture)).toBe(0);
    expect(existsSync(fixture.candidatePath)).toBe(true);
  });

  test("a later successful apply invalidates an older safe-discard token", async () => {
    fixture = createEngineFixture();
    const originalCandidate = readFileSync(fixture.candidatePath);
    const { scheduled } = await prepareAndSchedule(fixture);
    corruptFile(fixture.candidatePath);
    const failure = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(failure).toMatchObject({
      status: "failed",
      error: { recoveryToken: expect.any(String) },
    });
    if (failure.status !== "failed" || !failure.error.recoveryToken) {
      throw new Error("missing recovery token");
    }
    const staleRecoveryToken = failure.error.recoveryToken;
    writeFileSync(fixture.candidatePath, originalCandidate);

    const committed = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(committed).toMatchObject({ status: "committed", liveDatabaseChanged: true });
    await expect(
      fixture.runtime.discardSafelyFailedScheduledRestore({
        restoreId: scheduled.restoreId,
        recoveryToken: staleRecoveryToken,
      })
    ).rejects.toMatchObject({ code: "outcome_ambiguous" });
  });

  test("safe discard rejects a pending record already absent at entry", async () => {
    fixture = createEngineFixture();
    const { scheduled } = await prepareAndSchedule(fixture);
    corruptFile(fixture.candidatePath);
    const failure = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    if (failure.status !== "failed" || !failure.error.recoveryToken) {
      throw new Error("missing recovery token");
    }
    fixture.controls.pending = { status: "absent" };

    await expect(
      fixture.runtime.discardSafelyFailedScheduledRestore({
        restoreId: scheduled.restoreId,
        recoveryToken: failure.error.recoveryToken,
      })
    ).rejects.toMatchObject({ code: "outcome_ambiguous" });
    expect(existsSync(fixture.candidatePath)).toBe(true);
    expect(fixture.discardedPaths).toEqual([]);
  });

  test("missing candidate fails before BEGIN with a safe discard authorization", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    rmSync(fixture.candidatePath, { force: true });

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: {
        code: "candidate_path_invalid",
        liveDatabaseChanged: false,
        transactionState: "not_started",
        recoveryToken: expect.any(String),
      },
    });
    expect(beginCount(fixture)).toBe(0);
  });

  test("a detach failure after commit retains staging owned by the live handle", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    fixture.live.beforeExec = (sql) => {
      if (sql.trim() === "DETACH DATABASE restore_candidate;") {
        throw new Error("detach before execution");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "committed",
      liveDatabaseChanged: true,
      warnings: [{ stage: "detach_candidate", code: "Error" }],
    });
    expect(fixture.controls.pending).toEqual({ status: "absent" });
    expect(fixture.controls.outcome.status).toBe("present");
    expect(existsSync(fixture.candidatePath)).toBe(true);
    expect(fixture.discardedPaths).toEqual([]);
  });

  test("a validation detach failure does not issue a candidate discard token", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    if (fixture.controls.pending.status !== "present") throw new Error("missing pending");
    const pending = JSON.parse(fixture.controls.pending.json) as {
      rowsByTable: { media: number };
    };
    pending.rowsByTable.media += 1;
    fixture.controls.pending = { status: "present", json: JSON.stringify(pending) };
    fixture.live.beforeExec = (sql) => {
      if (sql.trim() === "DETACH DATABASE restore_candidate;") {
        throw new Error("validation detach before execution");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: {
        liveDatabaseChanged: false,
        transactionState: "not_started",
        recovery: "retry_cold_start",
        recoveryToken: undefined,
      },
    });
    expect(existsSync(fixture.candidatePath)).toBe(true);
  });

  test("ATTACH acknowledgement loss with successful detach preserves the primary error", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    fixture.live.afterRun = (sql) => {
      if (sql.startsWith("ATTACH DATABASE")) {
        throw new Error("attach acknowledgement lost");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: {
        message: "attach acknowledgement lost",
        liveDatabaseChanged: false,
        transactionState: "not_started",
        recoveryToken: expect.any(String),
      },
    });
    expect(
      fixture.live.database
        .prepare("PRAGMA database_list;")
        .all()
        .some((row) => (row as { name: string }).name === "restore_candidate")
    ).toBe(false);
  });

  test("uncertain ATTACH ownership never authorizes candidate deletion", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    fixture.live.afterRun = (sql) => {
      if (sql.startsWith("ATTACH DATABASE")) {
        throw new Error("attach acknowledgement lost");
      }
    };
    fixture.live.beforeExec = (sql) => {
      if (sql.trim() === "DETACH DATABASE restore_candidate;") {
        throw new Error("detach before execution");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: {
        liveDatabaseChanged: false,
        transactionState: "not_started",
        recovery: "retry_cold_start",
        recoveryToken: undefined,
      },
    });
    expect(existsSync(fixture.candidatePath)).toBe(true);
    expect(fixture.discardedPaths).toEqual([]);
  });

  test("a rollback detach failure retains staging without authorizing deletion", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    fixture.live.beforeExec = (sql) => {
      if (sql.trim() === "DETACH DATABASE restore_candidate;") {
        throw new Error("rollback detach before execution");
      }
    };
    fixture.live.afterExec = (sql) => {
      if (sql.startsWith('DELETE FROM main."media"')) {
        throw new Error("transaction fault");
      }
    };

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: {
        liveDatabaseChanged: false,
        transactionState: "rolled_back",
        recovery: "retry_cold_start",
        recoveryToken: undefined,
      },
    });
    expect(existsSync(fixture.candidatePath)).toBe(true);
    expect(fixture.discardedPaths).toEqual([]);
  });

  test("outcome persistence and pending cleanup retries are controls-only", async () => {
    fixture = createEngineFixture();
    const { scheduled } = await prepareAndSchedule(fixture);
    fixture.controls.writeFault = (name) => {
      if (name === "outcome") throw new Error("outcome write unavailable");
    };

    let result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(result.status).toBe("committed_pending_outcome");
    expect(beginCount(fixture)).toBe(1);

    fixture.controls.writeFault = undefined;
    fixture.controls.deleteFault = (name) => {
      if (name === "pending") throw new Error("pending delete unavailable");
    };
    result = fixture.runtime.resumeCommittedStartupFinalization({
      restoreId: scheduled.restoreId,
    });
    expect(result.status).toBe("committed_pending_cleanup");
    expect(beginCount(fixture)).toBe(1);

    fixture.controls.deleteFault = undefined;
    result = fixture.runtime.resumeCommittedStartupFinalization({
      restoreId: scheduled.restoreId,
    });
    expect(result.status).toBe("committed");
    expect(beginCount(fixture)).toBe(1);
  });

  test("physical pending B overwrites a valid stale outcome A after commit", async () => {
    fixture = createEngineFixture();
    const { scheduled } = await prepareAndSchedule(fixture);
    installStaleOutcome(fixture);

    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });

    expect(result).toMatchObject({
      status: "committed",
      restoreId: scheduled.restoreId,
    });
    expect(fixture.controls.pending).toEqual({ status: "absent" });
    if (fixture.controls.outcome.status !== "present") throw new Error("missing outcome");
    expect(parseCommittedRestoreOutcome(fixture.controls.outcome.json).restoreId).toBe(
      scheduled.restoreId
    );
    expect(beginCount(fixture)).toBe(1);
  });

  test("stale outcome overwrite failure retries controls only", async () => {
    fixture = createEngineFixture();
    const { scheduled } = await prepareAndSchedule(fixture);
    installStaleOutcome(fixture);
    fixture.controls.writeFault = (name) => {
      if (name === "outcome") throw new Error("stale outcome overwrite unavailable");
    };

    const first = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(first).toMatchObject({
      status: "committed_pending_outcome",
      restoreId: scheduled.restoreId,
    });
    expect(beginCount(fixture)).toBe(1);

    fixture.controls.writeFault = undefined;
    const retry = fixture.runtime.resumeCommittedStartupFinalization({
      restoreId: scheduled.restoreId,
    });
    expect(retry).toMatchObject({ status: "committed", restoreId: scheduled.restoreId });
    expect(beginCount(fixture)).toBe(1);
    if (fixture.controls.outcome.status !== "present") throw new Error("missing outcome");
    expect(parseCommittedRestoreOutcome(fixture.controls.outcome.json).restoreId).toBe(
      scheduled.restoreId
    );
  });

  test("a surviving pending record wins a matching outcome and is reapplied cold", async () => {
    fixture = createEngineFixture();
    const { scheduled } = await prepareAndSchedule(fixture);
    fixture.controls.deleteFault = (name) => {
      if (name === "pending") throw new Error("retain pending");
    };
    const first = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(first.status).toBe("committed_pending_cleanup");
    expect(fixture.controls.outcome.status).toBe("present");

    fixture.controls.deleteFault = undefined;
    setFixtureProcess(fixture, PROCESS_C);
    const second = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_C,
    });
    expect(second).toMatchObject({ status: "committed", restoreId: scheduled.restoreId });
    expect(beginCount(fixture)).toBe(2);
  });

  test("invalid physical records and unavailable storage never become no_pending", () => {
    fixture = createEngineFixture();
    fixture.controls.pending = { status: "unreadable", code: "corrupt" };
    expect(
      fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: null,
      })
    ).toMatchObject({
      status: "failed",
      error: { code: "outcome_ambiguous", liveDatabaseChanged: "unknown" },
    });

    fixture.controls.pending = { status: "absent" };
    fixture.controls.outcome = { status: "unavailable" };
    expect(
      fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: null,
      })
    ).toMatchObject({ status: "failed", error: { code: "outcome_ambiguous" } });
  });

  test("durable summaries reject missing count keys and contradictory PB counts", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    if (fixture.controls.pending.status !== "present") throw new Error("missing pending");
    const pending = JSON.parse(fixture.controls.pending.json) as Record<string, unknown>;
    const rows = pending.rowsByTable as Record<string, number>;
    delete rows.media;
    fixture.controls.pending = { status: "present", json: JSON.stringify(pending) };
    expect(
      fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: PROCESS_B,
      })
    ).toMatchObject({ status: "failed", error: { code: "outcome_ambiguous" } });

    pending.rowsByTable = { ...rows, media: 1 };
    pending.pbEventsInSource = 999;
    fixture.controls.pending = { status: "present", json: JSON.stringify(pending) };
    expect(() => parsePendingRestoreRecord(JSON.stringify(pending), fixture!.rootUri)).toThrow(
      "contradicts rowsByTable"
    );
  });

  test("pending paths require exact private-root segment containment", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    if (fixture.controls.pending.status !== "present") throw new Error("missing pending");
    const pending = JSON.parse(fixture.controls.pending.json) as Record<string, unknown>;
    const unsafePaths = [
      `${fixture.rootUri}-sibling/restore-v1-12345678/candidate.db`,
      `${fixture.rootUri}/restore-v1-12345678/../candidate.db`,
      `${fixture.rootUri}/restore-v1-12345678%2Fevil/candidate.db`,
      `${fixture.rootUri}/restore-v1-12345678/candidate.db?other=1`,
    ];

    for (const candidatePath of unsafePaths) {
      expect(() =>
        parsePendingRestoreRecord(
          JSON.stringify({ ...pending, candidatePath }),
          fixture!.rootUri
        )
      ).toThrow(RestoreRecordValidationError);
    }
  });

  test("outcome parser rejects internally contradictory derived PB counts", async () => {
    fixture = createEngineFixture();
    await prepareAndSchedule(fixture);
    const result = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(result.status).toBe("committed");
    if (fixture.controls.outcome.status !== "present") throw new Error("missing outcome");
    const outcome = JSON.parse(fixture.controls.outcome.json) as Record<string, unknown>;
    outcome.pbEventsRebuilt = 999;
    expect(() => parseCommittedRestoreOutcome(JSON.stringify(outcome))).toThrow(
      "contradicts rowsByTable"
    );
  });

  test("a complete leftover outcome permits startup even when cleanup still fails", async () => {
    fixture = createEngineFixture();
    const { scheduled } = await prepareAndSchedule(fixture);
    setFixtureProcess(fixture, PROCESS_B);
    const committed = fixture.runtime.applyScheduledReplacementRestoreAtStartup({
      sqlite: fixture.live as never,
      nativeProcessToken: PROCESS_B,
    });
    expect(committed.status).toBe("committed");
    if (fixture.controls.outcome.status !== "present") throw new Error("missing outcome");
    const pendingOutcome = parseCommittedRestoreOutcome(fixture.controls.outcome.json);
    if (pendingOutcome.postCommitStatus !== "pending") throw new Error("unexpected complete outcome");
    fixture.controls.outcome = {
      status: "present",
      json: JSON.stringify({
        ...pendingOutcome,
        postCommitStatus: "complete",
        result: {
          status: "restored",
          restoreId: scheduled.restoreId,
          liveDatabaseChanged: true,
          rowsByTable: pendingOutcome.rowsByTable,
          pbEventsRebuilt: pendingOutcome.pbEventsRebuilt,
          media: {
            total: pendingOutcome.rowsByTable.media,
            resolved: 0,
            unresolved: pendingOutcome.rowsByTable.media,
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
      }),
    };
    fixture.controls.deleteFault = (name) => {
      if (name === "outcome") throw new Error("cleanup failed");
    };

    expect(
      fixture.runtime.applyScheduledReplacementRestoreAtStartup({
        sqlite: fixture.live as never,
        nativeProcessToken: PROCESS_B,
      })
    ).toEqual({ status: "no_pending", pendingPresence: "absent" });
    expect(beginCount(fixture)).toBe(1);
    expect(fixture.controls.outcome.status).toBe("present");
  });

  test("scheduling retires an old complete outcome and blocks when absence is unproven", async () => {
    const makeComplete = (
      prepared: Extract<Awaited<ReturnType<EngineFixture["runtime"]["prepareReplacementRestore"]>>, { status: "ready" }>
    ) => ({
      version: 1,
      restoreId: "restore-v1:previous-complete-00000001",
      candidateSha256: prepared.candidateSha256,
      schemaManifestId: RESTORE_SCHEMA_MANIFEST_ID,
      rowsByTable: prepared.rowsByTable,
      pbEventsRebuilt: prepared.rowsByTable.pr_events,
      postCommitStatus: "complete",
      result: {
        status: "restored",
        restoreId: "restore-v1:previous-complete-00000001",
        liveDatabaseChanged: true,
        rowsByTable: prepared.rowsByTable,
        pbEventsRebuilt: prepared.rowsByTable.pr_events,
        media: {
          total: prepared.mediaRows,
          resolved: 0,
          unresolved: prepared.mediaRows,
          skippedPermission: 0,
          errors: [],
        },
        cleanup: { deletedManagedFiles: 0, skippedUntrustedPaths: 0, errors: 0 },
        warnings: [],
      },
    });

    fixture = createEngineFixture();
    const prepared = await fixture.runtime.prepareReplacementRestore({});
    if (prepared.status !== "ready") throw new Error("fixture preparation cancelled");
    fixture.controls.outcome = { status: "present", json: JSON.stringify(makeComplete(prepared)) };
    await expect(
      fixture.runtime.scheduleReplacementRestore({ token: prepared.token })
    ).resolves.toMatchObject({ status: "restart_required" });
    expect(fixture.controls.outcome).toEqual({ status: "absent" });

    fixture.close();
    fixture = createEngineFixture();
    const blockedPreparation = await fixture.runtime.prepareReplacementRestore({});
    if (blockedPreparation.status !== "ready") throw new Error("fixture preparation cancelled");
    fixture.controls.outcome = {
      status: "present",
      json: JSON.stringify(makeComplete(blockedPreparation)),
    };
    fixture.controls.deleteFault = (name) => {
      if (name === "outcome") throw new Error("cleanup failed");
    };
    await expect(
      fixture.runtime.scheduleReplacementRestore({ token: blockedPreparation.token })
    ).rejects.toMatchObject({
      code: "outcome_ambiguous",
      liveDatabaseChanged: true,
      transactionState: "committed",
    });
    expect(fixture.controls.pending).toEqual({ status: "absent" });
  });
});
