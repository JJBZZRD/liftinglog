import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import type {
  BackupSnapshotAdapter,
  BackupSnapshotConnection,
} from "../../lib/db/backupSnapshot";

export class NodeBackupSnapshotConnection
  implements BackupSnapshotConnection
{
  private database: DatabaseSync;

  constructor(readonly databasePath: string) {
    this.database = new DatabaseSync(databasePath);
  }

  async replaceFrom(source: DatabaseSync): Promise<void> {
    this.database.close();
    await backup(source, this.databasePath, { rate: 1 });
    this.database = new DatabaseSync(this.databasePath);
  }

  async closeAsync(): Promise<void> {
    if (this.database.isOpen) {
      this.database.close();
    }
  }

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  getAllSync<T>(sql: string): T[] {
    return this.database.prepare(sql).all() as T[];
  }

  async getFirstAsync<T>(sql: string): Promise<T | null> {
    return (this.database.prepare(sql).get() as T | undefined) ?? null;
  }
}

export function createNodeBackupSnapshotAdapter(): BackupSnapshotAdapter {
  return {
    async backupDatabase({ sourceDatabase, destDatabase }) {
      await (destDatabase as NodeBackupSnapshotConnection).replaceFrom(
        sourceDatabase as DatabaseSync
      );
    },
    fileExists: existsSync,
    async hashFile(path) {
      return createHash("sha256").update(readFileSync(path)).digest("hex");
    },
    async openDatabase(databaseName, _options, directory) {
      return new NodeBackupSnapshotConnection(join(directory, databaseName));
    },
  };
}
