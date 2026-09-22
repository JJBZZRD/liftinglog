import type { drizzle } from "drizzle-orm/expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

export type AppDatabase = ReturnType<typeof drizzle>;

/**
 * Live bindings published only after restore, bootstrap, and Drizzle
 * construction have all completed. Importing this module is inert.
 */
export let sqlite: SQLiteDatabase;
export let db: AppDatabase;

let bindingsPublished = false;

export function publishDatabaseBindings(
  nextSqlite: SQLiteDatabase,
  nextDb: AppDatabase
): void {
  if (bindingsPublished) {
    throw new Error("Database bindings have already been published.");
  }

  // No callback or await occurs between these assignments. Consumers can only
  // mount after the lifecycle publishes its subsequent ready/postcommit state.
  sqlite = nextSqlite;
  db = nextDb;
  bindingsPublished = true;
}
