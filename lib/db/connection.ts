import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";
import { initializeDatabase } from "./bootstrap";

export const sqlite = openDatabaseSync("LiftingLog.db");

sqlite.execSync("PRAGMA foreign_keys = ON;");
sqlite.execSync("PRAGMA journal_mode = WAL;");
sqlite.execSync("PRAGMA synchronous = NORMAL;");

initializeDatabase(sqlite);

export const db = drizzle(sqlite);
