import {
  CURRENT_SCHEMA_PROFILES,
  SOURCE_SCHEMA_PROFILES,
  type RestoreForeignKey,
  type RestoreIndex,
  type RestoreSchemaProfile,
  type RestoreTableShape,
} from "./restoreSchemaCatalog";

export const RESTORE_SCHEMA_MANIFEST_ID = "replacement-restore-schema-v1";

export const RESTORE_APP_TABLES = [
  "settings",
  "user_checkins",
  "exercises",
  "workouts",
  "workout_exercises",
  "sets",
  "psl_programs",
  "program_calendar",
  "program_calendar_exercises",
  "program_calendar_sets",
  "pr_events",
  "tags",
  "taggings",
  "media",
  "exercise_formula_overrides",
] as const;

export type RestoreSchemaPhase = "source" | "current";

export interface RestoreSchemaConnection {
  getAllSync<T>(sql: string): T[];
}

export type RestoreSchemaValidationResult = {
  readonly manifestId: string;
  readonly missingOptionalTables: readonly string[];
  readonly phase: RestoreSchemaPhase;
  readonly tables: readonly string[];
};

export type RestoreSchemaObjectType = "catalog" | "index" | "table" | "trigger" | "view";

export class RestoreSchemaValidationError extends Error {
  readonly code = "unsupported_schema" as const;

  constructor(
    readonly phase: RestoreSchemaPhase,
    readonly reason: string,
    readonly objectType: RestoreSchemaObjectType,
    readonly objectName: string | null,
    readonly details: readonly string[]
  ) {
    super(
      `Unsupported ${phase} restore schema (${reason})${
        objectName === null ? "" : `: ${objectType} ${objectName}`
      }`
    );
    this.name = "RestoreSchemaValidationError";
  }
}

type SchemaRow = {
  name: string;
  sql: string | null;
  tbl_name: string;
  type: string;
};

type TableXinfoRow = {
  cid: number;
  dflt_value: string | null;
  hidden: number;
  name: string;
  notnull: number;
  pk: number;
  type: string;
};

type ForeignKeyRow = {
  from: string;
  match: string;
  on_delete: string;
  on_update: string;
  table: string;
  to: string;
};

type IndexListRow = {
  name: string;
  origin: string;
  partial: number;
  unique: number;
};

type IndexXinfoRow = {
  cid: number;
  coll: string | null;
  desc: number;
  key: number;
  name: string | null;
  seqno: number;
};

type ProfileMismatch = {
  readonly detail: string;
  readonly objectName: string | null;
  readonly objectType: RestoreSchemaObjectType;
  readonly reason: string;
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteKnownIdentifier(identifier: string): string {
  if (!IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe compiled schema identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function normalizeSchemaSql(sql: string): string {
  const tokens: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      let token = quote;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        const current = sql[index];
        token += current;
        index += 1;
        if (current !== quote) {
          continue;
        }
        if (sql[index] === quote) {
          token += sql[index];
          index += 1;
          continue;
        }
        closed = true;
        break;
      }
      tokens.push(closed ? token : `unterminated:${token}`);
      continue;
    }
    if (character === "[") {
      const end = sql.indexOf("]", index + 1);
      if (end === -1) {
        tokens.push(`unterminated:${sql.slice(index)}`);
        break;
      }
      tokens.push(sql.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    if (/[(),;=<>+*/%!-]/.test(character)) {
      const next = sql[index + 1] ?? "";
      const pair = character + next;
      if (["<=", ">=", "!=", "<>", "==", "||", "<<", ">>"].includes(pair)) {
        tokens.push(pair);
        index += 2;
      } else {
        tokens.push(character);
        index += 1;
      }
      continue;
    }
    let end = index + 1;
    while (
      end < sql.length &&
      !/\s/.test(sql[end]) &&
      !/[()\[\],;=<>+*/%!'"`-]/.test(sql[end])
    ) {
      end += 1;
    }
    tokens.push(sql.slice(index, end).toLowerCase());
    index = end;
  }
  while (tokens[tokens.length - 1] === ";") {
    tokens.pop();
  }
  return tokens.join("\u001f");
}

function normalizedTableDefinition(sql: string, table: string): string | null {
  const openingParenthesis = sql.indexOf("(");
  if (openingParenthesis === -1) {
    return null;
  }
  const header = normalizeSchemaSql(sql.slice(0, openingParenthesis));
  const expectedHeaders = new Set([
    normalizeSchemaSql(`CREATE TABLE ${table}`),
    normalizeSchemaSql(`CREATE TABLE "${table}"`),
  ]);
  if (!expectedHeaders.has(header)) {
    return null;
  }
  return normalizeSchemaSql(sql.slice(openingParenthesis));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function normalizedForeignKeys(rows: readonly ForeignKeyRow[]): RestoreForeignKey[] {
  return rows
    .map((row) => ({
      from: row.from,
      match: row.match,
      onDelete: row.on_delete,
      onUpdate: row.on_update,
      table: row.table,
      to: row.to,
    }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function expectedForeignKeys(shape: RestoreTableShape): RestoreForeignKey[] {
  return [...shape.foreignKeys].sort((left, right) =>
    stableJson(left).localeCompare(stableJson(right))
  );
}

function tableMatchesShape(
  connection: RestoreSchemaConnection,
  row: SchemaRow,
  shape: RestoreTableShape
): boolean {
  if (
    row.sql === null ||
    normalizedTableDefinition(row.sql, row.name) !== normalizeSchemaSql(shape.definition)
  ) {
    return false;
  }
  const columns = connection.getAllSync<TableXinfoRow>(
    `PRAGMA table_xinfo(${quoteKnownIdentifier(row.name)});`
  );
  const actualColumns = columns.map((candidate) => ({
    dfltValue: candidate.dflt_value,
    hidden: Number(candidate.hidden),
    name: candidate.name,
    notNull: Number(candidate.notnull),
    pk: Number(candidate.pk),
    type: candidate.type.toUpperCase(),
  }));
  const expectedColumns = shape.columns.map((candidate) => ({
    dfltValue: candidate.dfltValue,
    hidden: 0,
    name: candidate.name,
    notNull: candidate.notNull,
    pk: candidate.pk,
    type: candidate.type,
  }));
  if (stableJson(actualColumns) !== stableJson(expectedColumns)) {
    return false;
  }
  const foreignKeys = connection.getAllSync<ForeignKeyRow>(
    `PRAGMA foreign_key_list(${quoteKnownIdentifier(row.name)});`
  );
  return stableJson(normalizedForeignKeys(foreignKeys)) === stableJson(expectedForeignKeys(shape));
}

function indexMatches(
  connection: RestoreSchemaConnection,
  row: SchemaRow,
  listRow: IndexListRow,
  expected: RestoreIndex
): boolean {
  if (
    row.tbl_name !== expected.table ||
    Number(listRow.unique) !== expected.unique ||
    listRow.origin !== expected.origin ||
    Number(listRow.partial) !== 0
  ) {
    return false;
  }
  if (
    (row.sql === null) !== (expected.sql === null) ||
    (row.sql !== null &&
      expected.sql !== null &&
      normalizeSchemaSql(row.sql) !== normalizeSchemaSql(expected.sql))
  ) {
    return false;
  }
  const columns = connection.getAllSync<IndexXinfoRow>(
    `PRAGMA index_xinfo(${quoteKnownIdentifier(expected.name)});`
  );
  const keyColumns = columns
    .filter((candidate) => Number(candidate.key) === 1)
    .sort((left, right) => Number(left.seqno) - Number(right.seqno));
  const auxiliaryColumns = columns.filter((candidate) => Number(candidate.key) === 0);
  return (
    keyColumns.length === expected.columns.length &&
    keyColumns.every(
      (candidate, index) =>
        candidate.name === expected.columns[index] &&
        Number(candidate.desc) === 0 &&
        candidate.coll === "BINARY"
    ) &&
    auxiliaryColumns.length === 1 &&
    auxiliaryColumns[0].name === null &&
    Number(auxiliaryColumns[0].cid) === -1
  );
}

function mismatch(
  reason: string,
  objectType: RestoreSchemaObjectType,
  objectName: string | null,
  detail: string
): ProfileMismatch {
  return { detail, objectName, objectType, reason };
}

function matchProfile(
  connection: RestoreSchemaConnection,
  schemaRows: readonly SchemaRow[],
  profile: RestoreSchemaProfile
): ProfileMismatch | null {
  const tableRows = schemaRows.filter((row) => row.type === "table");
  const tableNames = new Set(tableRows.map((row) => row.name));
  for (const table of profile.requiredTables) {
    if (!tableNames.has(table)) {
      return mismatch("missing_required_table", "table", table, `${profile.id}: missing ${table}`);
    }
  }
  const allowedAbsent = new Set(profile.optionalTables);
  for (const table of Object.keys(profile.tables)) {
    if (!tableNames.has(table) && !allowedAbsent.has(table)) {
      return mismatch("missing_table", "table", table, `${profile.id}: missing ${table}`);
    }
  }
  for (const row of tableRows) {
    const shapes = profile.tables[row.name];
    if (!shapes) {
      return mismatch("unknown_table", "table", row.name, `${profile.id}: unknown table ${row.name}`);
    }
    if (!shapes.some((shape) => tableMatchesShape(connection, row, shape))) {
      return mismatch(
        "unknown_table_shape",
        "table",
        row.name,
        `${profile.id}: ${row.name} does not match an evidenced table definition, table_xinfo, or foreign-key list`
      );
    }
  }

  const expectedIndexes = profile.indexes.filter((index) => tableNames.has(index.table));
  const expectedByName = new Map(expectedIndexes.map((index) => [index.name, index]));
  const indexRows = schemaRows.filter((row) => row.type === "index");
  const actualByName = new Map(indexRows.map((row) => [row.name, row]));
  for (const expected of expectedIndexes) {
    const row = actualByName.get(expected.name);
    if (!row) {
      return mismatch("missing_index", "index", expected.name, `${profile.id}: missing ${expected.name}`);
    }
  }
  for (const row of indexRows) {
    const expected = expectedByName.get(row.name);
    if (!expected) {
      return mismatch("unknown_index", "index", row.name, `${profile.id}: unknown index ${row.name}`);
    }
    const listRows = connection.getAllSync<IndexListRow>(
      `PRAGMA index_list(${quoteKnownIdentifier(expected.table)});`
    );
    const listRow = listRows.find((candidate) => candidate.name === row.name);
    if (!listRow || !indexMatches(connection, row, listRow, expected)) {
      return mismatch("unknown_index_shape", "index", row.name, `${profile.id}: index drift in ${row.name}`);
    }
  }
  return null;
}

function loadSchemaRows(connection: RestoreSchemaConnection): SchemaRow[] {
  return connection.getAllSync<SchemaRow>(
    `SELECT type, name, tbl_name, sql
     FROM sqlite_schema
     ORDER BY type, name;`
  );
}

function profileSimilarity(
  connection: RestoreSchemaConnection,
  schemaRows: readonly SchemaRow[],
  profile: RestoreSchemaProfile
): number {
  return schemaRows
    .filter((row) => row.type === "table")
    .reduce((score, row) => {
      const shapes = profile.tables[row.name];
      return score + (shapes?.some((shape) => tableMatchesShape(connection, row, shape)) ? 1 : 0);
    }, 0);
}

export function validateRestoreSchema(
  connection: RestoreSchemaConnection,
  phase: RestoreSchemaPhase
): RestoreSchemaValidationResult {
  const schemaRows = loadSchemaRows(connection);
  for (const row of schemaRows) {
    if (row.type === "trigger" || row.type === "view") {
      throw new RestoreSchemaValidationError(
        phase,
        "untrusted_schema_object",
        row.type,
        row.name,
        [`${row.type} ${row.name} is not part of any supported restore manifest`]
      );
    }
    if (row.type !== "table" && row.type !== "index") {
      throw new RestoreSchemaValidationError(
        phase,
        "unknown_catalog_object",
        "catalog",
        row.name,
        [`sqlite_schema type ${row.type} is unsupported`]
      );
    }
  }

  const profiles = [
    ...(phase === "source" ? SOURCE_SCHEMA_PROFILES : CURRENT_SCHEMA_PROFILES),
  ].sort(
    (left, right) =>
      profileSimilarity(connection, schemaRows, right) -
      profileSimilarity(connection, schemaRows, left)
  );
  const failures: ProfileMismatch[] = [];
  for (const profile of profiles) {
    const failure = matchProfile(connection, schemaRows, profile);
    if (!failure) {
      const present = new Set(
        schemaRows.filter((row) => row.type === "table").map((row) => row.name)
      );
      return {
        manifestId: RESTORE_SCHEMA_MANIFEST_ID,
        phase,
        tables: RESTORE_APP_TABLES.filter((table) => present.has(table)),
        missingOptionalTables:
          phase === "source"
            ? RESTORE_APP_TABLES.filter((table) => !present.has(table))
            : [],
      };
    }
    failures.push(failure);
  }
  const primary = failures[0] ?? mismatch(
    "empty_catalog",
    "catalog",
    null,
    "No supported restore schema profile matched"
  );
  throw new RestoreSchemaValidationError(
    phase,
    primary.reason,
    primary.objectType,
    primary.objectName,
    failures.map((failure) => failure.detail)
  );
}
