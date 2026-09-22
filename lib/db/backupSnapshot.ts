import { File } from "expo-file-system";
import {
  backupDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";
import { sha256File } from "../utils/fileSha256";
import {
  RESTORE_APP_TABLES,
  validateRestoreSchema,
} from "./restoreSchemaManifest";

type AppTable = (typeof RESTORE_APP_TABLES)[number];

export interface BackupSnapshotConnection {
  readonly databasePath: string;
  closeAsync(): Promise<void>;
  execAsync(sql: string): Promise<void>;
  getAllSync<T>(sql: string): T[];
  getFirstAsync<T>(sql: string): Promise<T | null>;
}

export interface BackupSnapshotAdapter {
  backupDatabase(options: {
    sourceDatabase: unknown;
    destDatabase: BackupSnapshotConnection;
  }): Promise<void>;
  fileExists(uri: string): boolean;
  hashFile(uri: string): Promise<string>;
  openDatabase(
    databaseName: string,
    options: { useNewConnection: true },
    directory: string
  ): Promise<BackupSnapshotConnection>;
}

export type SealedBackupSnapshot = {
  readonly fileUri: string;
  readonly rowsByTable: Readonly<Record<AppTable, number>>;
  readonly sha256: string;
};

type CheckpointRow = {
  busy: number;
  checkpointed: number;
  log: number;
};

type JournalModeRow = {
  journal_mode: string;
};

function quoteCompiledIdentifier(identifier: AppTable): string {
  return `"${identifier}"`;
}

function requireSuccessfulCheckpoint(row: CheckpointRow | null): void {
  if (
    row === null ||
    !Number.isFinite(Number(row.busy)) ||
    !Number.isFinite(Number(row.log)) ||
    !Number.isFinite(Number(row.checkpointed)) ||
    Number(row.busy) !== 0 ||
    Number(row.log) !== Number(row.checkpointed)
  ) {
    throw new Error(`Backup destination checkpoint failed: ${JSON.stringify(row)}`);
  }
}

function requireDeleteJournalMode(row: JournalModeRow | null): void {
  const mode = row?.journal_mode?.toLowerCase();
  if (mode !== "delete") {
    throw new Error(`Backup destination could not be sealed in DELETE mode: ${mode ?? "missing"}`);
  }
}

function requireIntegrity(connection: BackupSnapshotConnection): void {
  const rows = connection.getAllSync<Record<string, unknown>>(
    "PRAGMA integrity_check;"
  );
  const value = rows.length === 1 ? Object.values(rows[0])[0] : undefined;
  if (value !== "ok") {
    throw new Error(`Backup integrity check failed: ${JSON.stringify(rows)}`);
  }
}

function readTableCounts(
  connection: BackupSnapshotConnection
): Record<AppTable, number> {
  return Object.fromEntries(
    RESTORE_APP_TABLES.map((table) => {
      const rows = connection.getAllSync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${quoteCompiledIdentifier(table)};`
      );
      const count = rows.length === 1 ? Number(rows[0].count) : Number.NaN;
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`Could not count sealed backup table ${table}.`);
      }
      return [table, count];
    })
  ) as Record<AppTable, number>;
}

function requireSealedFiles(
  adapter: BackupSnapshotAdapter,
  fileUri: string
): void {
  if (!adapter.fileExists(fileUri)) {
    throw new Error("Sealed backup main file does not exist.");
  }
  if (
    adapter.fileExists(`${fileUri}-wal`) ||
    adapter.fileExists(`${fileUri}-shm`)
  ) {
    throw new Error("Sealed backup still requires WAL/SHM sidecars.");
  }
}

async function closeConnection(
  connection: BackupSnapshotConnection | undefined,
  primaryOperationFailed: boolean
): Promise<void> {
  if (!connection) {
    return;
  }
  try {
    await connection.closeAsync();
  } catch (error) {
    if (!primaryOperationFailed) {
      throw error;
    }
  }
}

export async function createSealedBackupSnapshotWithAdapter(options: {
  adapter: BackupSnapshotAdapter;
  destinationDirectory: string;
  destinationName: string;
  sourceDatabase: unknown;
}): Promise<SealedBackupSnapshot> {
  const {
    adapter,
    destinationDirectory,
    destinationName,
    sourceDatabase,
  } = options;
  let destination: BackupSnapshotConnection | undefined;
  let destinationFileUri: string | undefined;
  let destinationOperationFailed = false;

  try {
    destination = await adapter.openDatabase(
      destinationName,
      { useNewConnection: true },
      destinationDirectory
    );
    destinationFileUri = destination.databasePath;
    await adapter.backupDatabase({ sourceDatabase, destDatabase: destination });

    const checkpoint = await destination.getFirstAsync<CheckpointRow>(
      "PRAGMA wal_checkpoint(TRUNCATE);"
    );
    requireSuccessfulCheckpoint(checkpoint);
    const journalMode = await destination.getFirstAsync<JournalModeRow>(
      "PRAGMA journal_mode=DELETE;"
    );
    requireDeleteJournalMode(journalMode);
  } catch (error) {
    destinationOperationFailed = true;
    throw error;
  } finally {
    await closeConnection(destination, destinationOperationFailed);
  }

  if (!destinationFileUri) {
    throw new Error("Backup destination did not expose a database path.");
  }
  requireSealedFiles(adapter, destinationFileUri);
  const hashBeforeValidation = await adapter.hashFile(destinationFileUri);

  let validation: BackupSnapshotConnection | undefined;
  let rowsByTable: Record<AppTable, number> | undefined;
  let validationOperationFailed = false;
  try {
    if (!adapter.fileExists(destinationFileUri)) {
      throw new Error("Sealed backup disappeared before validation.");
    }
    validation = await adapter.openDatabase(
      destinationName,
      { useNewConnection: true },
      destinationDirectory
    );
    // Expo SQLite has no read-only open flag. This is deliberately the first SQL
    // issued on the separately opened validation connection.
    await validation.execAsync("PRAGMA query_only=ON;");
    requireIntegrity(validation);
    validateRestoreSchema(validation, "current");
    rowsByTable = readTableCounts(validation);
  } catch (error) {
    validationOperationFailed = true;
    throw error;
  } finally {
    await closeConnection(validation, validationOperationFailed);
  }

  requireSealedFiles(adapter, destinationFileUri);
  const hashAfterValidation = await adapter.hashFile(destinationFileUri);
  if (hashAfterValidation !== hashBeforeValidation) {
    throw new Error("Sealed backup changed during validation.");
  }
  if (!rowsByTable) {
    throw new Error("Sealed backup validation did not produce table counts.");
  }

  return {
    fileUri: destinationFileUri,
    rowsByTable,
    sha256: hashAfterValidation,
  };
}

const expoBackupSnapshotAdapter: BackupSnapshotAdapter = {
  async backupDatabase({ sourceDatabase, destDatabase }) {
    await backupDatabaseAsync({
      sourceDatabase: sourceDatabase as SQLiteDatabase,
      destDatabase: destDatabase as SQLiteDatabase,
    });
  },
  fileExists(uri) {
    return new File(uri).exists;
  },
  async hashFile(uri) {
    return (await sha256File(uri)).sha256;
  },
  openDatabase(databaseName, openOptions, directory) {
    return openDatabaseAsync(databaseName, openOptions, directory);
  },
};

export function createSealedBackupSnapshot(options: {
  destinationDirectory: string;
  destinationName: string;
  sourceDatabase: SQLiteDatabase;
}): Promise<SealedBackupSnapshot> {
  return createSealedBackupSnapshotWithAdapter({
    ...options,
    adapter: expoBackupSnapshotAdapter,
  });
}
