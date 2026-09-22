import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  APP_TABLES,
  appTableCounts,
  buildExportArtifactDescriptor,
  closeReplacementFixturePair,
  createOnlineBackupProof,
  createReplacementFixturePair,
  decideScheduledRestoreGate,
  disposePreparedCandidate,
  hashProofFile,
  isSupportedCurrentExerciseColumnOrder,
  pickConservativeMediaCandidate,
  prepareReplacementCandidate,
  replaceLiveDatabaseFromCandidate,
  resolveRollbackProofState,
  resolveScheduleAbort,
  sealWalCandidateProof,
  SUPPORTED_CURRENT_EXERCISE_COLUMN_ORDERS,
  snapshotAppData,
  type AppTable,
  type PreparedCandidate,
  type RestoreFault,
} from "../helpers/replacementRestoreProof";

const OPTIONAL_TABLES: readonly AppTable[] = [
  "settings",
  "user_checkins",
  "psl_programs",
  "program_calendar",
  "program_calendar_exercises",
  "program_calendar_sets",
  "pr_events",
  "tags",
  "taggings",
  "media",
  "exercise_formula_overrides",
];

describe("MVP-006A replacement restore design proof", () => {
  test("SQLite online backup includes committed WAL writes while a second connection makes TRUNCATE checkpoint busy", async () => {
    const pair = createReplacementFixturePair();
    const sourcePath = join(pair.directory, "wal-source.db");
    const destinationPath = join(pair.directory, "wal-export.db");
    const source = new DatabaseSync(sourcePath);
    const reader = new DatabaseSync(sourcePath);
    try {
      source.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE proof (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO proof (id, value) VALUES (1, 'checkpointed');
        PRAGMA wal_checkpoint(TRUNCATE);
      `);

      reader.exec("BEGIN;");
      expect(
        Number(
          (
            reader.prepare("SELECT COUNT(*) AS count FROM proof;").get() as {
              count: number;
            }
          ).count
        )
      ).toBe(1);

      source.exec(
        "INSERT INTO proof (id, value) VALUES (2, 'committed-only-in-wal');"
      );
      const checkpoint = source
        .prepare("PRAGMA wal_checkpoint(TRUNCATE);")
        .get() as { busy: number; checkpointed: number; log: number };
      expect(Number(checkpoint.busy)).toBe(1);

      const progress: Array<{ remainingPages: number; totalPages: number }> = [];
      const pages = await createOnlineBackupProof(
        source,
        destinationPath,
        (event) => progress.push(event)
      );
      expect(pages).toBeGreaterThan(0);
      expect(progress.length).toBeGreaterThan(0);

      const exported = new DatabaseSync(destinationPath, { readOnly: true });
      try {
        expect(
          exported
            .prepare("SELECT id, value FROM proof ORDER BY id;")
            .all()
        ).toEqual([
          { id: 1, value: "checkpointed" },
          { id: 2, value: "committed-only-in-wal" },
        ]);
        expect(
          Object.values(
            exported.prepare("PRAGMA integrity_check;").get() as Record<
              string,
              unknown
            >
          )[0]
        ).toBe("ok");
      } finally {
        exported.close();
      }
    } finally {
      if (reader.isOpen) {
        reader.exec("ROLLBACK;");
        reader.close();
      }
      if (source.isOpen) source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("a WAL-mode candidate is sealed into one hashed DELETE-mode file with no required sidecars", async () => {
    const pair = createReplacementFixturePair();
    const sealedPath = join(pair.directory, "sealed-candidate.db");
    const source = new DatabaseSync(pair.candidatePath);
    try {
      source.exec("PRAGMA journal_mode=WAL;");
      source.exec(
        "UPDATE settings SET color_theme = 'sealed-wal-write' WHERE id = 1;"
      );
      expect(existsSync(`${pair.candidatePath}-wal`)).toBe(true);

      const sealed = await sealWalCandidateProof(source, sealedPath);
      expect(sealed.journalMode).toBe("delete");
      expect(sealed.hash).toMatch(/^[0-9a-f]{64}$/);

      const reopened = new DatabaseSync(sealedPath, { readOnly: true });
      try {
        expect(
          reopened
            .prepare("SELECT color_theme FROM settings WHERE id = 1;")
            .get()
        ).toEqual({ color_theme: "sealed-wal-write" });
      } finally {
        reopened.close();
      }
      expect(hashProofFile(sealedPath)).toBe(sealed.hash);
    } finally {
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("logical replacement preserves candidate IDs and links, deletes live-only rows, and rebuilds PBs", () => {
    const pair = createReplacementFixturePair();
    let prepared: PreparedCandidate | undefined;
    const live = new DatabaseSync(pair.livePath);
    try {
      live.exec("PRAGMA foreign_keys = ON;");
      prepared = prepareReplacementCandidate(pair.candidatePath, pair.directory);
      const candidate = new DatabaseSync(prepared.path, { readOnly: true });
      const expected = snapshotAppData(candidate);
      candidate.close();

      const result = replaceLiveDatabaseFromCandidate(live, prepared, {
        reconcileMedia: (rows) => {
          expect(rows).toEqual([
            expect.objectContaining({
              asset_id: "candidate-asset-80",
              id: 80,
              original_filename: "candidate-80.mp4",
            }),
          ]);
          throw new Error("gallery permission unavailable");
        },
      });
      expect(result.status).toBe("restored");
      if (result.status !== "restored") throw new Error("unexpected cancellation");

      const actual = snapshotAppData(live);
      for (const table of APP_TABLES) {
        if (table === "pr_events") continue;
        if (table === "media") {
          expect(actual.media).toEqual(
            expected.media.map((row) => ({
              ...(row as Record<string, unknown>),
              local_uri: "",
            }))
          );
          continue;
        }
        expect(actual[table]).toEqual(expected[table]);
      }

      expect(APP_TABLES).toHaveLength(15);
      expect(result.pbEventsRebuilt).toBe(3);
      expect(result.rowsByTable.pr_events).toBe(3);
      expect(actual.pr_events).toEqual([
        expect.objectContaining({ set_id: 30, metric_value: 55 }),
        expect.objectContaining({ set_id: 32, metric_value: 60 }),
        expect.objectContaining({ set_id: 31, metric_value: 130 }),
      ]);
      expect(actual.pr_events).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ uid: "stale-derived-event" }),
        ])
      );

      const workouts = actual.workouts as Array<{
        id: number;
        note: string | null;
        uid: string | null;
      }>;
      expect(workouts.map((row) => row.id)).toEqual([10, 11, 12]);
      expect(workouts[0].uid).toEqual(expect.any(String));
      expect(workouts[1].uid).toEqual(expect.any(String));
      expect(workouts[0].uid).not.toBe(workouts[1].uid);
      expect(workouts[2].note).toBe("candidate workout note");

      expect(actual.program_calendar_exercises).toEqual([
        expect.objectContaining({ id: 52, workout_exercise_id: 20 }),
      ]);
      expect(actual.program_calendar_sets).toEqual([
        expect.objectContaining({ id: 53, set_id: 30 }),
      ]);
      expect(actual.media).toEqual([
        expect.objectContaining({
          id: 80,
          local_uri: "",
          set_id: 30,
          workout_id: 10,
        }),
      ]);
      expect(result.media).toEqual({
        errors: ["gallery permission unavailable"],
        resolved: 0,
        total: 1,
        unresolved: 1,
      });
      expect(result.warnings).toEqual([]);
    } finally {
      live.close();
      if (prepared) disposePreparedCandidate(prepared);
      closeReplacementFixturePair(pair);
    }
  });

  test("aborted media reconciliation never leaves a restored backup URI playable", () => {
    const pair = createReplacementFixturePair();
    let prepared: PreparedCandidate | undefined;
    const live = new DatabaseSync(pair.livePath);
    try {
      prepared = prepareReplacementCandidate(pair.candidatePath, pair.directory);
      const result = replaceLiveDatabaseFromCandidate(live, prepared, {
        abortMediaReconciliation: true,
      });
      expect(result.status).toBe("restored");
      if (result.status !== "restored") throw new Error("unexpected cancellation");
      expect(result.media).toEqual({
        errors: [],
        resolved: 0,
        total: 1,
        unresolved: 1,
      });
      expect(
        live.prepare("SELECT id, local_uri FROM media ORDER BY id;").all()
      ).toEqual([{ id: 80, local_uri: "" }]);
    } finally {
      live.close();
      if (prepared) disposePreparedCandidate(prepared);
      closeReplacementFixturePair(pair);
    }
  });

  test("cancellation and every injected pre-commit fault leave every live app row unchanged", () => {
    const pair = createReplacementFixturePair();
    let prepared: PreparedCandidate | undefined;
    const live = new DatabaseSync(pair.livePath);
    try {
      live.exec("PRAGMA foreign_keys = ON;");
      prepared = prepareReplacementCandidate(pair.candidatePath, pair.directory);
      const before = snapshotAppData(live);

      expect(
        replaceLiveDatabaseFromCandidate(live, prepared, {
          cancelBeforeCommit: true,
        })
      ).toEqual({ liveDatabaseChanged: false, status: "cancelled" });
      expect(snapshotAppData(live)).toEqual(before);

      const faults: RestoreFault[] = [
        "after-live-delete",
        "after-candidate-copy",
        "before-commit",
      ];
      for (const failAt of faults) {
        expect(() =>
          replaceLiveDatabaseFromCandidate(live, prepared!, { failAt })
        ).toThrow(`Injected replacement restore fault at ${failAt}`);
        expect(snapshotAppData(live)).toEqual(before);
      }

      const committed = replaceLiveDatabaseFromCandidate(live, prepared, {
        failAt: "after-commit-before-detach",
      });
      expect(committed.status).toBe("restored");
      if (committed.status !== "restored") {
        throw new Error("unexpected cancellation");
      }
      expect(committed.warnings).toEqual([
        "Injected replacement restore fault at after-commit-before-detach",
      ]);
      expect(snapshotAppData(live)).not.toEqual(before);
    } finally {
      live.close();
      if (prepared) disposePreparedCandidate(prepared);
      closeReplacementFixturePair(pair);
    }
  });

  test("the current-manifest policy recognizes all five bootstrap-preserved exercise column orders and rejects drift", () => {
    expect(SUPPORTED_CURRENT_EXERCISE_COLUMN_ORDERS).toHaveLength(5);
    expect(
      new Set(
        SUPPORTED_CURRENT_EXERCISE_COLUMN_ORDERS.map((columns) =>
          columns.join("|")
        )
      ).size
    ).toBe(5);
    for (const columns of SUPPORTED_CURRENT_EXERCISE_COLUMN_ORDERS) {
      expect(isSupportedCurrentExerciseColumnOrder(columns)).toBe(true);
    }
    expect(
      isSupportedCurrentExerciseColumnOrder([
        ...SUPPORTED_CURRENT_EXERCISE_COLUMN_ORDERS[0],
        "future_metric",
      ])
    ).toBe(false);
  });

  test.each([
    {
      label: "unknown future column",
      mutate: (database: DatabaseSync) =>
        database.exec("ALTER TABLE sets ADD COLUMN future_metric REAL;"),
      message: "exact supported current schema",
    },
    {
      label: "unknown future constraint",
      mutate: (database: DatabaseSync) =>
        database.exec(
          "CREATE UNIQUE INDEX future_sets_note_constraint ON sets(note);"
        ),
      message: "exact supported current schema",
    },
    {
      label: "untrusted trigger",
      mutate: (database: DatabaseSync) =>
        database.exec(`
          CREATE TRIGGER untrusted_restore_trigger
          AFTER INSERT ON sets
          BEGIN
            UPDATE workouts SET note = 'triggered' WHERE id = NEW.workout_id;
          END;
        `),
      message: "Untrusted schema objects",
    },
    {
      label: "unsupported migration shape",
      mutate: (database: DatabaseSync) =>
        database.exec("ALTER TABLE exercises ADD COLUMN future_metric REAL;"),
      message: "Unsupported exercises schema",
    },
  ])("$label fails closed before any live mutation", ({ mutate, message }) => {
    const pair = createReplacementFixturePair();
    const candidate = new DatabaseSync(pair.candidatePath);
    mutate(candidate);
    candidate.close();
    const live = new DatabaseSync(pair.livePath);
    try {
      const before = snapshotAppData(live);
      expect(() =>
        prepareReplacementCandidate(pair.candidatePath, pair.directory)
      ).toThrow(message);
      expect(snapshotAppData(live)).toEqual(before);
    } finally {
      live.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("extensionless input and missing optional legacy-era tables are accepted, then optional live data is replaced with empty tables", () => {
    const pair = createReplacementFixturePair();
    const candidate = new DatabaseSync(pair.candidatePath);
    candidate.exec("PRAGMA foreign_keys = OFF;");
    for (const table of OPTIONAL_TABLES) {
      candidate.exec(`DROP TABLE ${table};`);
    }
    candidate.close();

    const extensionlessPath = join(pair.directory, "valid-sqlite-without-extension");
    copyFileSync(pair.candidatePath, extensionlessPath);
    let prepared: PreparedCandidate | undefined;
    const live = new DatabaseSync(pair.livePath);
    try {
      prepared = prepareReplacementCandidate(extensionlessPath, pair.directory);
      for (const table of OPTIONAL_TABLES) {
        expect(prepared.counts[table]).toBe(0);
      }

      const result = replaceLiveDatabaseFromCandidate(live, prepared);
      expect(result.status).toBe("restored");
      const counts = appTableCounts(live);
      expect(counts.workouts).toBe(3);
      expect(counts.workout_exercises).toBe(3);
      expect(counts.sets).toBe(3);
      expect(counts.pr_events).toBe(3);
      for (const table of OPTIONAL_TABLES.filter(
        (table) => table !== "pr_events"
      )) {
        expect(counts[table]).toBe(0);
      }
    } finally {
      live.close();
      if (prepared) disposePreparedCandidate(prepared);
      closeReplacementFixturePair(pair);
    }
  });

  test("the proposed Android SAF artifact contract passes the complete .db display name and a concrete SQLite MIME type", () => {
    expect(
      buildExportArtifactDescriptor(new Date("2026-09-21T19:01:25.000Z"))
    ).toEqual({
      displayName: "LiftingLog-backup-20260921-190125.db",
      mimeType: "application/vnd.sqlite3",
    });
  });

  test("media identity requires a unique canonical compound match and never uses asset ID to break ties", () => {
    const candidates = [
      {
        albumName: "Camera",
        assetId: "50",
        durationMs: 2_000,
        filename: "PRE001H_5554_20260921_0700_A.mp4",
        mediaCreatedAt: 1_790_010_000_000,
      },
      {
        albumName: "Camera",
        assetId: "51",
        durationMs: 2_000,
        filename: "PRE001H_5554_20260921_0700_B.mp4",
        mediaCreatedAt: 1_790_010_000_000,
      },
    ];

    expect(
      pickConservativeMediaCandidate(
        {
          albumName: null,
          assetId: null,
          durationMs: 2_000,
          originalFilename: "50.mp4",
          mediaCreatedAt: null,
        },
        candidates
      )
    ).toBeNull();
    expect(
      pickConservativeMediaCandidate(
        {
          albumName: null,
          assetId: "50",
          durationMs: null,
          originalFilename: null,
          mediaCreatedAt: null,
        },
        candidates
      )
    ).toBeNull();
    expect(
      pickConservativeMediaCandidate(
        {
          albumName: null,
          assetId: null,
          durationMs: null,
          originalFilename: "PRE001H_5554_20260921_0700_A.mp4",
          mediaCreatedAt: 0,
        },
        candidates
      )
    ).toBeNull();

    expect(
      pickConservativeMediaCandidate(
        {
          albumName: "Camera",
          assetId: "50",
          durationMs: 2_000,
          originalFilename: "PRE001H_5554_20260921_0700_A.mp4",
          mediaCreatedAt: 1_790_010_000_000,
        },
        candidates
      )
    ).toEqual(candidates[0]);

    expect(
      pickConservativeMediaCandidate(
        {
          albumName: "Different album hint",
          assetId: null,
          durationMs: 2_000,
          originalFilename: "PRE001H_5554_20260921_0700_A.mp4",
          mediaCreatedAt: 0,
        },
        candidates
      )
    ).toEqual(candidates[0]);

    expect(
      pickConservativeMediaCandidate(
        {
          albumName: "Camera",
          assetId: "50",
          durationMs: 2_000,
          originalFilename: "PRE001H_5554_20260921_0700_A.mp4",
          mediaCreatedAt: 1_790_010_000_000,
        },
        [
          {
            ...candidates[0],
            filename: "UNRELATED_ASSET_WITH_REUSED_ID.mp4",
          },
        ]
      )
    ).toBeNull();

    expect(
      pickConservativeMediaCandidate(
        {
          albumName: "Camera",
          assetId: "50",
          durationMs: 2_000,
          originalFilename: "PRE001H_5554_20260921_0700_A.mp4",
          mediaCreatedAt: 1_790_010_000_000,
        },
        [...candidates, { ...candidates[0], assetId: "52" }]
      )
    ).toBeNull();
  });

  test("the restore gate fails closed for process identity and preserves durable attempt-state recovery", () => {
    const processA = "process-v1:11111111-1111-4111-8111-111111111111";
    const processB = "process-v1:22222222-2222-4222-8222-222222222222";
    const processC = "process-v1:33333333-3333-4333-8333-333333333333";

    expect(
      decideScheduledRestoreGate({
        currentNativeProcessToken: processA,
        manifestVersion: 1,
        pendingState: "scheduled",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "await_cold_process",
      liveDatabaseChanged: false,
      normalUseBlocked: true,
    });

    expect(
      decideScheduledRestoreGate({
        currentNativeProcessToken: processB,
        manifestVersion: 1,
        pendingState: "scheduled",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "apply_at_startup",
      liveDatabaseChanged: false,
      normalUseBlocked: true,
    });

    expect(
      decideScheduledRestoreGate({
        currentNativeProcessToken: processB,
        latestAttemptNativeProcessToken: processB,
        manifestVersion: 1,
        pendingState: "attempting",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "await_cold_process",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    });

    expect(
      decideScheduledRestoreGate({
        currentNativeProcessToken: processC,
        latestAttemptNativeProcessToken: processB,
        manifestVersion: 1,
        pendingState: "attempting",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "apply_at_startup",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    });

    expect(
      decideScheduledRestoreGate({
        committedInCurrentProcess: true,
        currentNativeProcessToken: processB,
        latestAttemptNativeProcessToken: processB,
        manifestVersion: 1,
        pendingState: "attempting",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "retry_committed_cleanup",
      liveDatabaseChanged: true,
      normalUseBlocked: true,
    });

    expect(
      decideScheduledRestoreGate({
        currentNativeProcessToken: "",
        manifestVersion: 1,
        pendingState: "scheduled",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "block_invalid_process_identity",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    });
    expect(
      decideScheduledRestoreGate({
        currentNativeProcessToken: processB,
        manifestVersion: 1,
        pendingState: "scheduled",
      })
    ).toEqual({
      action: "block_invalid_process_identity",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    });

    for (const latestAttemptNativeProcessToken of [undefined, "invalid"]) {
      expect(
        decideScheduledRestoreGate({
          currentNativeProcessToken: processC,
          latestAttemptNativeProcessToken,
          manifestVersion: 1,
          pendingState: "attempting",
          scheduledFromNativeProcessToken: processA,
        })
      ).toEqual({
        action: "block_invalid_process_identity",
        liveDatabaseChanged: "unknown",
        normalUseBlocked: true,
      });
    }

    for (const manifest of [
      { manifestVersion: 1 },
      { manifestVersion: 1, pendingState: "future-state" },
      { pendingState: "scheduled" },
    ]) {
      expect(
        decideScheduledRestoreGate({
          currentNativeProcessToken: processC,
          scheduledFromNativeProcessToken: processA,
          ...manifest,
        })
      ).toEqual({
        action: "block_ambiguous_state",
        liveDatabaseChanged: "unknown",
        normalUseBlocked: true,
      });
    }

    expect(
      decideScheduledRestoreGate({ pendingManifestPresent: true })
    ).toEqual({
      action: "block_ambiguous_state",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    });

    expect(
      decideScheduledRestoreGate({
        candidateValidation: "invalid",
        currentNativeProcessToken: processC,
        latestAttemptNativeProcessToken: processB,
        manifestVersion: 1,
        pendingState: "rolled_back_unchanged",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "safe_discard_and_reprepare",
      liveDatabaseChanged: false,
      normalUseBlocked: true,
    });

    expect(
      decideScheduledRestoreGate({
        candidateValidation: "invalid",
        currentNativeProcessToken: processC,
        latestAttemptNativeProcessToken: processB,
        manifestVersion: 1,
        pendingState: "attempting",
        scheduledFromNativeProcessToken: processA,
      })
    ).toEqual({
      action: "block_ambiguous_state",
      liveDatabaseChanged: "unknown",
      normalUseBlocked: true,
    });

    expect(
      resolveRollbackProofState({
        baselineState: "scheduled",
        rollbackSucceeded: true,
      })
    ).toEqual({
      liveDatabaseChanged: false,
      pendingState: "rolled_back_unchanged",
      recoveryTokenAllowed: true,
    });
    expect(
      resolveRollbackProofState({
        baselineState: "attempting",
        rollbackSucceeded: true,
      })
    ).toEqual({
      liveDatabaseChanged: "unknown",
      pendingState: "attempting",
      recoveryTokenAllowed: false,
    });

    expect(
      decideScheduledRestoreGate({
        currentNativeProcessToken: processB,
      })
    ).toEqual({
      action: "allow_normal_use",
      liveDatabaseChanged: false,
      normalUseBlocked: false,
    });
  });

  test("schedule abort linearizes at the atomic pending-manifest rename", () => {
    expect(
      resolveScheduleAbort({
        abortObserved: true,
        manifestRenameCommitted: false,
      })
    ).toEqual({ liveDatabaseChanged: false, status: "cancelled" });
    expect(
      resolveScheduleAbort({
        abortObserved: true,
        manifestRenameCommitted: true,
      })
    ).toEqual({
      liveDatabaseChanged: false,
      status: "restart_required",
    });
  });
});
