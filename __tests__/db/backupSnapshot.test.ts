import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createSealedBackupSnapshotWithAdapter,
  type BackupSnapshotAdapter,
  type BackupSnapshotConnection,
} from "../../lib/db/backupSnapshot";
import {
  closeReplacementFixturePair,
  createReplacementFixturePair,
  hashProofFile,
} from "../helpers/replacementRestoreProof";
import {
  closeRestoreFixture,
  initializeRestoreFixture,
  openHistoricalRestoreFixture,
} from "../helpers/restoreSchemaManifestDatabase";
import {
  createNodeBackupSnapshotAdapter,
  NodeBackupSnapshotConnection,
} from "../helpers/backupSnapshotDatabase";

jest.mock("expo-file-system", () => ({ File: jest.fn() }));
jest.mock("expo-sqlite", () => ({
  backupDatabaseAsync: jest.fn(),
  openDatabaseAsync: jest.fn(),
}));
jest.mock("../../lib/utils/fileSha256", () => ({ sha256File: jest.fn() }));

function wrapOpen(
  base: BackupSnapshotAdapter,
  transform: (
    connection: BackupSnapshotConnection,
    openNumber: number
  ) => BackupSnapshotConnection
): BackupSnapshotAdapter {
  let opens = 0;
  return {
    ...base,
    async openDatabase(name, options, directory) {
      const connection = await base.openDatabase(name, options, directory);
      opens += 1;
      return transform(connection, opens);
    },
  };
}

describe("sealed database backup snapshots", () => {
  test("online backup includes a committed WAL row while a reader keeps TRUNCATE busy", async () => {
    const fixture = openHistoricalRestoreFixture();
    initializeRestoreFixture(fixture);
    fixture.database.close();
    fixture.database = new DatabaseSync(fixture.path);
    const source = fixture.database;
    let reader: DatabaseSync | undefined;
    const destinationName = "sealed-export.db";
    const destinationPath = join(fixture.directory, destinationName);
    try {
      source.exec("PRAGMA journal_mode=WAL;");
      source.exec("INSERT INTO workouts (id, started_at) VALUES (900001, 1);");
      source.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      reader = new DatabaseSync(fixture.path);
      reader.exec("BEGIN;");
      expect(
        reader.prepare("SELECT id FROM workouts WHERE id = 900001;").get()
      ).toBeDefined();

      source.exec(
        "INSERT INTO workouts (id, started_at) VALUES (900002, 2);"
      );
      const checkpoint = source
        .prepare("PRAGMA wal_checkpoint(TRUNCATE);")
        .get() as { busy: number };
      expect(Number(checkpoint.busy)).toBe(1);

      const adapter = createNodeBackupSnapshotAdapter();
      const openSpy = jest.spyOn(adapter, "openDatabase");
      const result = await createSealedBackupSnapshotWithAdapter({
        adapter,
        destinationDirectory: fixture.directory,
        destinationName,
        sourceDatabase: source,
      });

      expect(openSpy).toHaveBeenNthCalledWith(
        1,
        destinationName,
        { useNewConnection: true },
        fixture.directory
      );
      expect(openSpy).toHaveBeenNthCalledWith(
        2,
        destinationName,
        { useNewConnection: true },
        fixture.directory
      );
      expect(result.fileUri).toBe(destinationPath);
      expect(result.sha256).toBe(hashProofFile(destinationPath));
      expect(result.rowsByTable.workouts).toBeGreaterThanOrEqual(2);
      expect(existsSync(`${destinationPath}-wal`)).toBe(false);
      expect(existsSync(`${destinationPath}-shm`)).toBe(false);

      const exported = new DatabaseSync(destinationPath, { readOnly: true });
      try {
        expect(
          exported.prepare("PRAGMA journal_mode;").get()
        ).toEqual({ journal_mode: "delete" });
        expect(
          exported
            .prepare("SELECT id FROM workouts WHERE id IN (900001, 900002) ORDER BY id;")
            .all()
        ).toEqual([{ id: 900001 }, { id: 900002 }]);
      } finally {
        exported.close();
      }
    } finally {
      if (reader?.isOpen) {
        if (reader.isTransaction) {
          reader.exec("ROLLBACK;");
        }
        reader.close();
      }
      closeRestoreFixture(fixture);
    }
  });

  test("fails closed and closes the destination when online backup fails", async () => {
    const pair = createReplacementFixturePair();
    const source = new DatabaseSync(pair.candidatePath);
    const base = createNodeBackupSnapshotAdapter();
    let opened: NodeBackupSnapshotConnection | undefined;
    const closeSpy = jest.spyOn(
      NodeBackupSnapshotConnection.prototype,
      "closeAsync"
    );
    const adapter: BackupSnapshotAdapter = {
      ...base,
      async backupDatabase() {
        throw new Error("injected backup failure");
      },
      async openDatabase(...args) {
        opened = (await base.openDatabase(...args)) as NodeBackupSnapshotConnection;
        return opened;
      },
    };
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: pair.directory,
          destinationName: "backup-failure.db",
          sourceDatabase: source,
        })
      ).rejects.toThrow("injected backup failure");
      expect(opened).toBeDefined();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test.each([
    ["journal mode", "PRAGMA journal_mode=DELETE", { journal_mode: "wal" }],
    ["checkpoint", "PRAGMA wal_checkpoint", { busy: 1, log: 2, checkpointed: 1 }],
  ])("rejects an invalid destination %s result", async (_label, sqlPart, row) => {
    const pair = createReplacementFixturePair();
    const source = new DatabaseSync(pair.candidatePath);
    const base = createNodeBackupSnapshotAdapter();
    const adapter = wrapOpen(base, (connection, openNumber) => {
      if (openNumber !== 1) return connection;
      const original = connection.getFirstAsync.bind(connection);
      connection.getFirstAsync = async <T,>(sql: string) =>
        sql.includes(sqlPart) ? (row as T) : original<T>(sql);
      return connection;
    });
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: pair.directory,
          destinationName: `${_label.replace(" ", "-")}.db`,
          sourceDatabase: source,
        })
      ).rejects.toThrow(/checkpoint failed|DELETE mode/);
    } finally {
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("rejects destination close failure", async () => {
    const pair = createReplacementFixturePair();
    const source = new DatabaseSync(pair.candidatePath);
    const base = createNodeBackupSnapshotAdapter();
    const adapter = wrapOpen(base, (connection, openNumber) => {
      if (openNumber !== 1) return connection;
      const close = connection.closeAsync.bind(connection);
      connection.closeAsync = async () => {
        await close();
        throw new Error("injected close failure");
      };
      return connection;
    });
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: pair.directory,
          destinationName: "close-failure.db",
          sourceDatabase: source,
        })
      ).rejects.toThrow("injected close failure");
    } finally {
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("preserves a backup failure when destination close also fails", async () => {
    const pair = createReplacementFixturePair();
    const source = new DatabaseSync(pair.candidatePath);
    const base = createNodeBackupSnapshotAdapter();
    const backupFailure = new Error("primary backup failure");
    const closeFailure = new Error("secondary destination close failure");
    const adapter = wrapOpen(
      {
        ...base,
        async backupDatabase() {
          throw backupFailure;
        },
      },
      (connection, openNumber) => {
        if (openNumber !== 1) return connection;
        const close = connection.closeAsync.bind(connection);
        connection.closeAsync = async () => {
          await close();
          throw closeFailure;
        };
        return connection;
      }
    );
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: pair.directory,
          destinationName: "combined-backup-close-failure.db",
          sourceDatabase: source,
        })
      ).rejects.toBe(backupFailure);
    } finally {
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("rejects a sidecar after sealing", async () => {
    const pair = createReplacementFixturePair();
    const source = new DatabaseSync(pair.candidatePath);
    const base = createNodeBackupSnapshotAdapter();
    const adapter: BackupSnapshotAdapter = {
      ...base,
      fileExists(uri) {
        return uri.endsWith("-wal") || base.fileExists(uri);
      },
    };
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: pair.directory,
          destinationName: "sidecar-failure.db",
          sourceDatabase: source,
        })
      ).rejects.toThrow("still requires WAL/SHM sidecars");
    } finally {
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("sets query_only first and rejects validation failure", async () => {
    const pair = createReplacementFixturePair();
    const source = new DatabaseSync(pair.candidatePath);
    const base = createNodeBackupSnapshotAdapter();
    const validationCalls: string[] = [];
    const adapter = wrapOpen(base, (connection, openNumber) => {
      if (openNumber !== 2) return connection;
      const exec = connection.execAsync.bind(connection);
      connection.execAsync = async (sql) => {
        validationCalls.push(sql);
        await exec(sql);
      };
      connection.getAllSync = () => {
        throw new Error("injected validation failure");
      };
      return connection;
    });
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: pair.directory,
          destinationName: "validation-failure.db",
          sourceDatabase: source,
        })
      ).rejects.toThrow("injected validation failure");
      expect(validationCalls).toEqual(["PRAGMA query_only=ON;"]);
    } finally {
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("preserves a validation failure when validation close also fails", async () => {
    const pair = createReplacementFixturePair();
    const source = new DatabaseSync(pair.candidatePath);
    const base = createNodeBackupSnapshotAdapter();
    const validationFailure = new Error("primary validation failure");
    const closeFailure = new Error("secondary validation close failure");
    const adapter = wrapOpen(base, (connection, openNumber) => {
      if (openNumber !== 2) return connection;
      const close = connection.closeAsync.bind(connection);
      connection.getAllSync = () => {
        throw validationFailure;
      };
      connection.closeAsync = async () => {
        await close();
        throw closeFailure;
      };
      return connection;
    });
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: pair.directory,
          destinationName: "combined-validation-close-failure.db",
          sourceDatabase: source,
        })
      ).rejects.toBe(validationFailure);
    } finally {
      source.close();
      closeReplacementFixturePair(pair);
    }
  });

  test("rejects a digest change caused during validation", async () => {
    const fixture = openHistoricalRestoreFixture();
    initializeRestoreFixture(fixture);
    const source = fixture.database;
    const base = createNodeBackupSnapshotAdapter();
    let hashCalls = 0;
    const adapter: BackupSnapshotAdapter = {
      ...base,
      async hashFile(path) {
        hashCalls += 1;
        return `${await base.hashFile(path)}-${hashCalls}`;
      },
    };
    try {
      await expect(
        createSealedBackupSnapshotWithAdapter({
          adapter,
          destinationDirectory: fixture.directory,
          destinationName: "digest-failure.db",
          sourceDatabase: source,
        })
      ).rejects.toThrow("changed during validation");
    } finally {
      closeRestoreFixture(fixture);
    }
  });
});
