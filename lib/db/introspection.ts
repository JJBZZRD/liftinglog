import { sqlite } from "./connection";

const columnCache = new Map<string, Set<string>>();

export function hasColumn(table: string, column: string): boolean {
  let columns = columnCache.get(table);
  if (!columns) {
    columns = loadTableColumns(table) ?? new Set<string>();
    columnCache.set(table, columns);
  }
  return columns.has(column);
}

function loadTableColumns(table: string): Set<string> | null {
  try {
    const stmt = sqlite.prepareSync(`PRAGMA table_info(${table});`);
    try {
      const result = stmt.executeSync([]);
      const rows = result.getAllSync() as Array<{ name: string }>;
      return new Set(rows.map((row) => row.name));
    } finally {
      stmt.finalizeSync();
    }
  } catch (error) {
    if (__DEV__) {
      console.warn(`[db] Failed to read schema for ${table}:`, error);
    }
    return null;
  }
}
