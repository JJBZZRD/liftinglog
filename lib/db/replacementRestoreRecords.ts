import type { NativeProcessToken } from "../native/appProcessIdentity";
import { isNativeProcessToken } from "../native/appProcessIdentity";
import {
  RESTORE_CONTROL_RECORD_MAX_BYTES,
  type RestoreControlRecordReadResult,
} from "../native/restoreControlStore";
import type {
  AppTable,
  ReplacementRestoreErrorCode,
  ReplacementRestoreResult,
} from "./replacementRestoreContract";
import {
  RESTORE_APP_TABLES,
  RESTORE_SCHEMA_MANIFEST_ID,
} from "./restoreSchemaManifest";

export const REPLACEMENT_RESTORE_RECORD_VERSION = 1;
export const REPLACEMENT_RESTORE_STAGING_DIRECTORY = "replacement-restore-v1";
export const REPLACEMENT_RESTORE_CANDIDATE_NAME = "candidate.db";

const RESTORE_ID_PATTERN = /^restore-v1:[A-Za-z0-9-]{8,80}$/;
const ATTEMPT_ID_PATTERN = /^attempt-v1:[A-Za-z0-9-]{8,80}$/;
const STAGING_ID_PATTERN = /^restore-v1-[A-Za-z0-9-]{8,80}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type PendingRestoreState =
  | "scheduled"
  | "attempting"
  | "rolled_back_unchanged";

type PendingRestoreRecordBase = {
  readonly version: 1;
  readonly restoreId: string;
  readonly candidatePath: string;
  readonly candidateSha256: string;
  readonly schemaManifestId: typeof RESTORE_SCHEMA_MANIFEST_ID;
  readonly scheduledFromNativeProcessToken: NativeProcessToken;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsInSource: number;
};

export type ScheduledPendingRestoreRecord = PendingRestoreRecordBase & {
  readonly state: "scheduled";
};

export type AttemptedPendingRestoreRecord = PendingRestoreRecordBase & {
  readonly state: "attempting" | "rolled_back_unchanged";
  readonly latestAttemptId: string;
  readonly latestAttemptNativeProcessToken: NativeProcessToken;
  readonly baselineWasProvenUnchanged: boolean;
};

export type PendingRestoreRecord =
  | ScheduledPendingRestoreRecord
  | AttemptedPendingRestoreRecord;

type CommittedRestoreOutcomeBase = {
  readonly version: 1;
  readonly restoreId: string;
  readonly candidateSha256: string;
  readonly schemaManifestId: typeof RESTORE_SCHEMA_MANIFEST_ID;
  readonly rowsByTable: Record<AppTable, number>;
  readonly pbEventsRebuilt: number;
};

export type PendingCommittedRestoreOutcomeRecord = CommittedRestoreOutcomeBase & {
  readonly postCommitStatus: "pending";
};

export type CompleteCommittedRestoreOutcomeRecord = CommittedRestoreOutcomeBase & {
  readonly postCommitStatus: "complete";
  readonly result: ReplacementRestoreResult;
};

export type CommittedRestoreOutcomeRecord =
  | PendingCommittedRestoreOutcomeRecord
  | CompleteCommittedRestoreOutcomeRecord;

export class RestoreRecordValidationError extends Error {
  constructor(
    readonly code: ReplacementRestoreErrorCode,
    message: string,
    readonly trustedRestoreId?: string
  ) {
    super(message);
    this.name = "RestoreRecordValidationError";
  }
}

export type RestoreRecordReader = (
  name: "pending" | "outcome"
) => RestoreControlRecordReadResult;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) length += 1;
    else if (codeUnit <= 0x7ff) length += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return Number.POSITIVE_INFINITY;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        return Number.POSITIVE_INFINITY;
      }
      length += 4;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return Number.POSITIVE_INFINITY;
    } else length += 3;
  }
  return length;
}

function parseJsonObject(
  json: string,
  label: string
): Record<string, unknown> {
  if (utf8ByteLength(json) > RESTORE_CONTROL_RECORD_MAX_BYTES) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} exceeds the restore control record limit.`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} is not valid JSON.`
    );
  }
  if (!isPlainRecord(parsed)) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} must contain one JSON object.`
    );
  }
  return parsed;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  label: string,
  trustedRestoreId?: string
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} contains missing or unknown fields.`,
      trustedRestoreId
    );
  }
}

function trustedRestoreId(value: unknown): string | undefined {
  return typeof value === "string" && RESTORE_ID_PATTERN.test(value)
    ? value
    : undefined;
}

function requireRestoreId(value: unknown, label: string): string {
  const result = trustedRestoreId(value);
  if (!result) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} has an invalid restore ID.`
    );
  }
  return result;
}

function requireVersion(
  value: unknown,
  label: string,
  restoreId?: string
): asserts value is 1 {
  if (value !== REPLACEMENT_RESTORE_RECORD_VERSION) {
    throw new RestoreRecordValidationError(
      "manifest_version_mismatch",
      `${label} uses an unsupported version.`,
      restoreId
    );
  }
}

function requireSchemaId(
  value: unknown,
  label: string,
  restoreId: string
): asserts value is typeof RESTORE_SCHEMA_MANIFEST_ID {
  if (value !== RESTORE_SCHEMA_MANIFEST_ID) {
    throw new RestoreRecordValidationError(
      "manifest_version_mismatch",
      `${label} does not match this build's restore schema manifest.`,
      restoreId
    );
  }
}

function requireSha256(value: unknown, label: string, restoreId: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} has an invalid candidate digest.`,
      restoreId
    );
  }
  return value;
}

function requireCount(
  value: unknown,
  label: string,
  restoreId: string
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} must be a non-negative safe integer.`,
      restoreId
    );
  }
  return value;
}

function requireRowsByTable(
  value: unknown,
  label: string,
  restoreId: string
): Record<AppTable, number> {
  if (!isPlainRecord(value)) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} must contain all restore table counts.`,
      restoreId
    );
  }
  exactKeys(value, RESTORE_APP_TABLES, label, restoreId);
  return Object.fromEntries(
    RESTORE_APP_TABLES.map((table) => [
      table,
      requireCount(value[table], `${label}.${table}`, restoreId),
    ])
  ) as Record<AppTable, number>;
}

const MAX_OUTCOME_DIAGNOSTICS = 64;
const MAX_OUTCOME_CODE_LENGTH = 128;

function requireCode(
  value: unknown,
  label: string,
  restoreId: string
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_OUTCOME_CODE_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} has an invalid diagnostic code.`,
      restoreId
    );
  }
  return value;
}

function sameRowsByTable(
  left: Record<AppTable, number>,
  right: Record<AppTable, number>
): boolean {
  return RESTORE_APP_TABLES.every((table) => left[table] === right[table]);
}

function requireCompleteResult(
  value: unknown,
  restoreId: string,
  outcomeRows: Record<AppTable, number>,
  outcomePbEventsRebuilt: number
): ReplacementRestoreResult {
  if (!isPlainRecord(value)) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore result must be an object.",
      restoreId
    );
  }
  exactKeys(
    value,
    [
      "status",
      "restoreId",
      "liveDatabaseChanged",
      "rowsByTable",
      "pbEventsRebuilt",
      "media",
      "cleanup",
      "warnings",
    ],
    "Committed restore result",
    restoreId
  );
  if (
    value.status !== "restored" ||
    value.restoreId !== restoreId ||
    value.liveDatabaseChanged !== true
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore result literals do not match the outcome.",
      restoreId
    );
  }

  const rowsByTable = requireRowsByTable(
    value.rowsByTable,
    "Committed restore result rowsByTable",
    restoreId
  );
  const pbEventsRebuilt = requireCount(
    value.pbEventsRebuilt,
    "Committed restore result pbEventsRebuilt",
    restoreId
  );
  if (
    pbEventsRebuilt !== rowsByTable.pr_events ||
    pbEventsRebuilt !== outcomePbEventsRebuilt ||
    !sameRowsByTable(rowsByTable, outcomeRows)
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore result counts contradict the outcome.",
      restoreId
    );
  }

  if (!isPlainRecord(value.media)) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore media result must be an object.",
      restoreId
    );
  }
  exactKeys(
    value.media,
    ["total", "resolved", "unresolved", "skippedPermission", "errors"],
    "Committed restore media result",
    restoreId
  );
  const total = requireCount(value.media.total, "Committed restore media total", restoreId);
  const resolved = requireCount(
    value.media.resolved,
    "Committed restore media resolved",
    restoreId
  );
  const unresolved = requireCount(
    value.media.unresolved,
    "Committed restore media unresolved",
    restoreId
  );
  const skippedPermission = requireCount(
    value.media.skippedPermission,
    "Committed restore media permission skips",
    restoreId
  );
  if (resolved + unresolved !== total || skippedPermission > unresolved) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore media counts are inconsistent.",
      restoreId
    );
  }
  if (
    !Array.isArray(value.media.errors) ||
    value.media.errors.length > MAX_OUTCOME_DIAGNOSTICS
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore media diagnostics are not bounded.",
      restoreId
    );
  }
  const errors = value.media.errors.map((entry, index) => {
    if (!isPlainRecord(entry)) {
      throw new RestoreRecordValidationError(
        "outcome_ambiguous",
        `Committed restore media diagnostic ${index} is invalid.`,
        restoreId
      );
    }
    exactKeys(
      entry,
      ["mediaId", "code"],
      `Committed restore media diagnostic ${index}`,
      restoreId
    );
    if (
      entry.mediaId !== null &&
      (!Number.isSafeInteger(entry.mediaId) || (entry.mediaId as number) <= 0)
    ) {
      throw new RestoreRecordValidationError(
        "outcome_ambiguous",
        `Committed restore media diagnostic ${index} has an invalid media ID.`,
        restoreId
      );
    }
    return {
      mediaId: entry.mediaId as number | null,
      code: requireCode(
        entry.code,
        `Committed restore media diagnostic ${index}`,
        restoreId
      ),
    };
  });

  if (!isPlainRecord(value.cleanup)) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore cleanup result must be an object.",
      restoreId
    );
  }
  exactKeys(
    value.cleanup,
    ["deletedManagedFiles", "skippedUntrustedPaths", "errors"],
    "Committed restore cleanup result",
    restoreId
  );
  const deletedManagedFiles = requireCount(
    value.cleanup.deletedManagedFiles,
    "Committed restore deleted file count",
    restoreId
  );
  const skippedUntrustedPaths = requireCount(
    value.cleanup.skippedUntrustedPaths,
    "Committed restore skipped path count",
    restoreId
  );
  const cleanupErrors = requireCount(
    value.cleanup.errors,
    "Committed restore cleanup error count",
    restoreId
  );
  if (deletedManagedFiles !== 0) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore cleanup counts are inconsistent.",
      restoreId
    );
  }

  if (!Array.isArray(value.warnings) || value.warnings.length > MAX_OUTCOME_DIAGNOSTICS) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore warnings are not bounded.",
      restoreId
    );
  }
  const warnings: ReplacementRestoreResult["warnings"] = value.warnings.map((warning, index) => {
    if (!isPlainRecord(warning)) {
      throw new RestoreRecordValidationError(
        "outcome_ambiguous",
        `Committed restore warning ${index} is invalid.`,
        restoreId
      );
    }
    exactKeys(
      warning,
      ["stage", "code"],
      `Committed restore warning ${index}`,
      restoreId
    );
    if (
      warning.stage !== "detach_candidate" &&
      warning.stage !== "staging_cleanup" &&
      warning.stage !== "media_reconciliation"
    ) {
      throw new RestoreRecordValidationError(
        "outcome_ambiguous",
        `Committed restore warning ${index} has an invalid stage.`,
        restoreId
      );
    }
    return {
      stage: warning.stage,
      code: requireCode(
        warning.code,
        `Committed restore warning ${index}`,
        restoreId
      ),
    };
  });

  return {
    status: "restored",
    restoreId,
    liveDatabaseChanged: true,
    rowsByTable,
    pbEventsRebuilt,
    media: { total, resolved, unresolved, skippedPermission, errors },
    cleanup: {
      deletedManagedFiles,
      skippedUntrustedPaths,
      errors: cleanupErrors,
    },
    warnings,
  };
}

function requireProcessToken(
  value: unknown,
  label: string,
  restoreId: string
): NativeProcessToken {
  if (!isNativeProcessToken(value)) {
    throw new RestoreRecordValidationError(
      "invalid_process_identity",
      `${label} has an invalid native process token.`,
      restoreId
    );
  }
  return value;
}

function decodedFilePath(uri: string): string | null {
  if (
    !uri.startsWith("file:///") ||
    /[?#\0]/.test(uri) ||
    /%(?:2f|5c|00)/i.test(uri)
  ) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(uri.slice("file://".length));
    return decoded.includes("\\") || decoded.includes("\0") ? null : decoded;
  } catch {
    return null;
  }
}

function pathSegments(path: string): string[] | null {
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return segments.filter((segment) => segment.length > 0);
}

export function requireOwnedCandidatePath(
  candidatePath: unknown,
  stagingRootUri: string,
  restoreId?: string
): string {
  if (typeof candidatePath !== "string" || candidatePath.length > 2048) {
    throw new RestoreRecordValidationError(
      "candidate_path_invalid",
      "The scheduled candidate path is invalid.",
      restoreId
    );
  }
  const candidateDecoded = decodedFilePath(candidatePath);
  const rootDecoded = decodedFilePath(stagingRootUri);
  const candidateSegments = candidateDecoded && pathSegments(candidateDecoded);
  const rootSegments = rootDecoded && pathSegments(rootDecoded);
  if (!candidateSegments || !rootSegments) {
    throw new RestoreRecordValidationError(
      "candidate_path_invalid",
      "The scheduled candidate path is not a safe private file path.",
      restoreId
    );
  }
  const relative = candidateSegments.slice(rootSegments.length);
  const withinRoot = rootSegments.every(
    (segment, index) => candidateSegments[index] === segment
  );
  if (
    !withinRoot ||
    relative.length !== 2 ||
    !STAGING_ID_PATTERN.test(relative[0]) ||
    relative[1] !== REPLACEMENT_RESTORE_CANDIDATE_NAME
  ) {
    throw new RestoreRecordValidationError(
      "candidate_path_invalid",
      "The scheduled candidate is outside its private staging directory.",
      restoreId
    );
  }
  return candidatePath;
}

export function stagingDirectoryForCandidate(
  candidatePath: string,
  stagingRootUri: string
): string {
  const safePath = requireOwnedCandidatePath(candidatePath, stagingRootUri);
  return safePath.slice(0, safePath.lastIndexOf("/"));
}

export function parsePendingRestoreRecord(
  json: string,
  stagingRootUri: string
): PendingRestoreRecord {
  const record = parseJsonObject(json, "Pending restore record");
  const restoreId = requireRestoreId(record.restoreId, "Pending restore record");
  requireVersion(record.version, "Pending restore record", restoreId);

  if (
    record.state !== "scheduled" &&
    record.state !== "attempting" &&
    record.state !== "rolled_back_unchanged"
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Pending restore record has an invalid state.",
      restoreId
    );
  }
  const attempted = record.state !== "scheduled";
  exactKeys(
    record,
    attempted
      ? [
          "version",
          "restoreId",
          "candidatePath",
          "candidateSha256",
          "schemaManifestId",
          "scheduledFromNativeProcessToken",
          "rowsByTable",
          "pbEventsInSource",
          "state",
          "latestAttemptId",
          "latestAttemptNativeProcessToken",
          "baselineWasProvenUnchanged",
        ]
      : [
          "version",
          "restoreId",
          "candidatePath",
          "candidateSha256",
          "schemaManifestId",
          "scheduledFromNativeProcessToken",
          "rowsByTable",
          "pbEventsInSource",
          "state",
        ],
    "Pending restore record",
    restoreId
  );
  requireSchemaId(record.schemaManifestId, "Pending restore record", restoreId);
  const scheduledToken = requireProcessToken(
    record.scheduledFromNativeProcessToken,
    "Pending restore record",
    restoreId
  );
  const rowsByTable = requireRowsByTable(
    record.rowsByTable,
    "Pending restore record rowsByTable",
    restoreId
  );
  const pbEventsInSource = requireCount(
    record.pbEventsInSource,
    "Pending restore record pbEventsInSource",
    restoreId
  );
  if (pbEventsInSource !== rowsByTable.pr_events) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Pending restore PB count contradicts rowsByTable.",
      restoreId
    );
  }
  const base = {
    version: 1 as const,
    restoreId,
    candidatePath: requireOwnedCandidatePath(
      record.candidatePath,
      stagingRootUri,
      restoreId
    ),
    candidateSha256: requireSha256(
      record.candidateSha256,
      "Pending restore record",
      restoreId
    ),
    schemaManifestId: RESTORE_SCHEMA_MANIFEST_ID as typeof RESTORE_SCHEMA_MANIFEST_ID,
    scheduledFromNativeProcessToken: scheduledToken,
    rowsByTable,
    pbEventsInSource,
  };

  if (!attempted) {
    return { ...base, state: "scheduled" };
  }
  if (
    typeof record.latestAttemptId !== "string" ||
    !ATTEMPT_ID_PATTERN.test(record.latestAttemptId) ||
    typeof record.baselineWasProvenUnchanged !== "boolean"
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Pending restore attempt fields are invalid.",
      restoreId
    );
  }
  const latestToken = requireProcessToken(
    record.latestAttemptNativeProcessToken,
    "Pending restore attempt",
    restoreId
  );
  if (latestToken === scheduledToken) {
    throw new RestoreRecordValidationError(
      "invalid_process_identity",
      "A restore attempt cannot use its scheduling process token.",
      restoreId
    );
  }
  if (
    record.state === "rolled_back_unchanged" &&
    record.baselineWasProvenUnchanged !== true
  ) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "A rolled-back record must retain a proven unchanged baseline.",
      restoreId
    );
  }
  return {
    ...base,
    state: record.state as "attempting" | "rolled_back_unchanged",
    latestAttemptId: record.latestAttemptId,
    latestAttemptNativeProcessToken: latestToken,
    baselineWasProvenUnchanged: record.baselineWasProvenUnchanged,
  };
}

export function parseCommittedRestoreOutcome(
  json: string
): CommittedRestoreOutcomeRecord {
  const record = parseJsonObject(json, "Committed restore outcome");
  const restoreId = requireRestoreId(record.restoreId, "Committed restore outcome");
  if (record.postCommitStatus !== "pending" && record.postCommitStatus !== "complete") {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore outcome has an unsupported status.",
      restoreId
    );
  }
  exactKeys(
    record,
    record.postCommitStatus === "complete"
      ? [
          "version",
          "restoreId",
          "candidateSha256",
          "schemaManifestId",
          "rowsByTable",
          "pbEventsRebuilt",
          "postCommitStatus",
          "result",
        ]
      : [
          "version",
          "restoreId",
          "candidateSha256",
          "schemaManifestId",
          "rowsByTable",
          "pbEventsRebuilt",
          "postCommitStatus",
        ],
    "Committed restore outcome",
    restoreId
  );
  requireVersion(record.version, "Committed restore outcome", restoreId);
  requireSchemaId(record.schemaManifestId, "Committed restore outcome", restoreId);
  const rowsByTable = requireRowsByTable(
    record.rowsByTable,
    "Committed restore outcome rowsByTable",
    restoreId
  );
  const pbEventsRebuilt = requireCount(
    record.pbEventsRebuilt,
    "Committed restore outcome pbEventsRebuilt",
    restoreId
  );
  if (pbEventsRebuilt !== rowsByTable.pr_events) {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      "Committed restore PB count contradicts rowsByTable.",
      restoreId
    );
  }
  const base = {
    version: 1 as const,
    restoreId,
    candidateSha256: requireSha256(
      record.candidateSha256,
      "Committed restore outcome",
      restoreId
    ),
    schemaManifestId: RESTORE_SCHEMA_MANIFEST_ID as typeof RESTORE_SCHEMA_MANIFEST_ID,
    rowsByTable,
    pbEventsRebuilt,
  };
  if (record.postCommitStatus === "pending") {
    return { ...base, postCommitStatus: "pending" };
  }
  return {
    ...base,
    postCommitStatus: "complete",
    result: requireCompleteResult(
      record.result,
      restoreId,
      rowsByTable,
      pbEventsRebuilt
    ),
  };
}

export type ParsedControlRecord<T> =
  | { readonly status: "absent" }
  | { readonly status: "present"; readonly record: T };

function requireReadable(
  result: RestoreControlRecordReadResult,
  label: string
): Exclude<RestoreControlRecordReadResult, { status: "unavailable" | "unreadable" }> {
  if (result.status === "unavailable") {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} storage is unavailable.`
    );
  }
  if (result.status === "unreadable") {
    throw new RestoreRecordValidationError(
      "outcome_ambiguous",
      `${label} is unreadable (${result.code}).`
    );
  }
  return result;
}

export function readPendingRestoreRecord(
  read: RestoreRecordReader,
  stagingRootUri: string
): ParsedControlRecord<PendingRestoreRecord> {
  const result = requireReadable(read("pending"), "Pending restore record");
  return result.status === "absent"
    ? result
    : { status: "present", record: parsePendingRestoreRecord(result.json, stagingRootUri) };
}

export function readCommittedRestoreOutcome(
  read: RestoreRecordReader
): ParsedControlRecord<CommittedRestoreOutcomeRecord> {
  const result = requireReadable(read("outcome"), "Committed restore outcome");
  return result.status === "absent"
    ? result
    : { status: "present", record: parseCommittedRestoreOutcome(result.json) };
}

export function serializePendingRestoreRecord(record: PendingRestoreRecord): string {
  return JSON.stringify(record);
}

export function serializeCommittedRestoreOutcome(
  record: CommittedRestoreOutcomeRecord
): string {
  return JSON.stringify(record);
}

export function samePendingRestoreRecord(
  left: PendingRestoreRecord,
  right: PendingRestoreRecord
): boolean {
  return serializePendingRestoreRecord(left) === serializePendingRestoreRecord(right);
}

export function sameCommittedRestoreOutcome(
  left: CommittedRestoreOutcomeRecord,
  right: CommittedRestoreOutcomeRecord
): boolean {
  return serializeCommittedRestoreOutcome(left) === serializeCommittedRestoreOutcome(right);
}

export function isTrustedRestoreId(value: unknown): value is string {
  return trustedRestoreId(value) !== undefined;
}
