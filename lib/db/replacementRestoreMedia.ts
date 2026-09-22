import type { SQLiteDatabase } from "expo-sqlite";
import {
  ensureVideoLibraryPermission,
  resolveVideoLibraryReference,
  type RediscoveredVideoReference,
  type VideoRediscoveryMetadata,
} from "../utils/videoStorage";
import type {
  ReplacementRestoreResult,
  RestoreProgress,
} from "./replacementRestoreContract";

const MAX_MEDIA_DIAGNOSTICS = 64;

type RestoreWarning = ReplacementRestoreResult["warnings"][number];

type CurrentMediaRow = {
  readonly id: number;
  readonly localUri: string;
  readonly assetId: string | null;
  readonly mime: string | null;
  readonly setId: number | null;
  readonly workoutId: number | null;
  readonly note: string | null;
  readonly createdAt: number | null;
  readonly originalFilename: string | null;
  readonly mediaCreatedAt: number | null;
  readonly durationMs: number | null;
  readonly albumName: string | null;
};

export type ReplacementRestoreMediaCompletion = {
  readonly media: ReplacementRestoreResult["media"];
  readonly cleanup: ReplacementRestoreResult["cleanup"];
  readonly warnings: readonly RestoreWarning[];
};

export type ReplacementRestoreMediaOptions = {
  readonly sqlite: SQLiteDatabase;
  readonly mode: "scan" | "skip";
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RestoreProgress) => void;
  readonly untrustedPreCommitMediaUris: readonly string[];
};

export type ReplacementRestoreMediaAdapters = {
  ensurePermission(): Promise<boolean>;
  resolveReference(
    metadata: VideoRediscoveryMetadata
  ): Promise<RediscoveredVideoReference | null>;
};

const productionAdapters: ReplacementRestoreMediaAdapters = {
  ensurePermission: ensureVideoLibraryPermission,
  resolveReference: resolveVideoLibraryReference,
};

function emitProgress(
  callback: ((progress: RestoreProgress) => void) | undefined,
  progress: RestoreProgress
): void {
  if (!callback) return;
  try {
    callback(progress);
  } catch (error) {
    if (__DEV__) console.warn("[replacement-restore] Progress callback failed.", error);
  }
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Current media ${label} is invalid.`);
  }
  return value;
}

function nullableFiniteNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Current media ${label} is invalid.`);
  }
  return value;
}

function nullableSafeInteger(
  value: unknown,
  label: string,
  requirePositive = false
): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    (requirePositive && value <= 0)
  ) {
    throw new Error(`Current media ${label} is invalid.`);
  }
  return value;
}

function readCurrentMediaRows(sqlite: SQLiteDatabase): CurrentMediaRow[] {
  const rows = sqlite.getAllSync<Record<string, unknown>>(
    `SELECT
       id,
       local_uri,
       asset_id,
       mime,
       set_id,
       workout_id,
       note,
       created_at,
       original_filename,
       media_created_at,
       duration_ms,
       album_name
     FROM media
     ORDER BY id;`
  );

  return rows.map((row) => {
    if (!Number.isSafeInteger(row.id) || (row.id as number) <= 0) {
      throw new Error("Current media row has an invalid ID.");
    }
    if (typeof row.local_uri !== "string") {
      throw new Error("Current media row has an invalid local URI.");
    }
    return {
      id: row.id as number,
      localUri: row.local_uri,
      assetId: nullableString(row.asset_id, "asset ID"),
      mime: nullableString(row.mime, "MIME type"),
      setId: nullableSafeInteger(row.set_id, "set link", true),
      workoutId: nullableSafeInteger(row.workout_id, "workout link", true),
      note: nullableString(row.note, "note"),
      createdAt: nullableSafeInteger(row.created_at, "created time"),
      originalFilename: nullableString(row.original_filename, "filename"),
      mediaCreatedAt: nullableFiniteNumber(row.media_created_at, "creation time"),
      durationMs: nullableFiniteNumber(row.duration_ms, "duration"),
      albumName: nullableString(row.album_name, "album"),
    };
  });
}

function sameMetadata(left: CurrentMediaRow, right: CurrentMediaRow): boolean {
  return (
    left.id === right.id &&
    left.assetId === right.assetId &&
    left.mime === right.mime &&
    left.setId === right.setId &&
    left.workoutId === right.workoutId &&
    left.note === right.note &&
    left.createdAt === right.createdAt &&
    left.originalFilename === right.originalFilename &&
    left.mediaCreatedAt === right.mediaCreatedAt &&
    left.durationMs === right.durationMs &&
    left.albumName === right.albumName
  );
}

function verifiedUri(reference: RediscoveredVideoReference | null): string | null {
  const candidate = reference?.localUri ?? reference?.uri;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export async function reconcileReplacementRestoreMediaWithAdapters(
  options: ReplacementRestoreMediaOptions,
  adapters: ReplacementRestoreMediaAdapters
): Promise<ReplacementRestoreMediaCompletion> {
  const rows = readCurrentMediaRows(options.sqlite);
  const expectedUris = new Map<number, string>();
  const errors: { mediaId: number | null; code: string }[] = [];
  const diagnosticKeys = new Set<string>();
  const warnings: RestoreWarning[] = [];
  let diagnosticsTruncated = false;
  let resolved = 0;
  let skippedPermission = 0;
  const signalAborted = () => options.signal?.aborted === true;
  let aborted = signalAborted();

  const addDiagnostic = (mediaId: number | null, code: string) => {
    const key = `${mediaId ?? "global"}:${code}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    if (errors.length < MAX_MEDIA_DIAGNOSTICS) {
      errors.push({ mediaId, code });
    } else {
      diagnosticsTruncated = true;
    }
  };
  const writeUri = (mediaId: number, localUri: string): boolean => {
    try {
      options.sqlite.runSync("UPDATE media SET local_uri = ? WHERE id = ?;", [
        localUri,
        mediaId,
      ]);
      return true;
    } catch {
      addDiagnostic(mediaId, "local_uri_write_failed");
      return false;
    }
  };

  emitProgress(options.onProgress, {
    phase: "reconciling_media",
    cancellable: options.mode === "scan",
    completed: 0,
    total: rows.length,
  });
  aborted = aborted || signalAborted();

  let permissionEstablished = false;
  if (options.mode === "scan" && rows.length > 0 && !aborted) {
    permissionEstablished = await adapters.ensurePermission();
    aborted = signalAborted();
    if (!aborted && !permissionEstablished && rows.length > 0) {
      skippedPermission = rows.length;
      addDiagnostic(null, "permission_not_established");
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    aborted = aborted || signalAborted();
    const row = rows[index];
    let nextUri: string | null = null;

    if (
      options.mode === "scan" &&
      permissionEstablished &&
      !aborted &&
      !signalAborted()
    ) {
      try {
        const reference = await adapters.resolveReference({
          assetId: row.assetId,
          originalFilename: row.originalFilename,
          mediaCreatedAt: row.mediaCreatedAt,
          durationMs: row.durationMs,
          albumName: row.albumName,
        });
        if (signalAborted()) {
          aborted = true;
        } else {
          nextUri = verifiedUri(reference);
          if (!nextUri) addDiagnostic(row.id, "media_reference_unresolved");
        }
      } catch {
        if (signalAborted()) aborted = true;
        else addDiagnostic(row.id, "media_resolver_failed");
      }
    }

    if (nextUri !== null && writeUri(row.id, nextUri)) {
      expectedUris.set(row.id, nextUri);
      resolved += 1;
    } else {
      // A failed repair must fall back to the schema-compatible unresolved URI.
      writeUri(row.id, "");
      expectedUris.set(row.id, "");
    }

    emitProgress(options.onProgress, {
      phase: "reconciling_media",
      cancellable: options.mode === "scan",
      completed: index + 1,
      total: rows.length,
    });
    aborted = aborted || signalAborted();
  }

  aborted = aborted || signalAborted();
  if (aborted) {
    warnings.push({ stage: "media_reconciliation", code: "media_scan_aborted" });
  }
  if (diagnosticsTruncated) {
    warnings.push({
      stage: "media_reconciliation",
      code: "media_diagnostics_truncated",
    });
  }

  const verifiedRows = readCurrentMediaRows(options.sqlite);
  if (verifiedRows.length !== rows.length) {
    throw new Error("Current media rows changed during restore reconciliation.");
  }
  for (let index = 0; index < rows.length; index += 1) {
    const before = rows[index];
    const after = verifiedRows[index];
    if (!sameMetadata(before, after)) {
      throw new Error("Current media row identity or metadata changed during reconciliation.");
    }
    if (after.localUri !== expectedUris.get(before.id)) {
      throw new Error("A reconciled media URI could not be durably verified.");
    }
  }

  const untrustedCandidates = new Set(
    options.untrustedPreCommitMediaUris.filter(
      (uri): uri is string => typeof uri === "string" && uri.length > 0
    )
  );

  return {
    media: {
      total: rows.length,
      resolved,
      unresolved: rows.length - resolved,
      skippedPermission,
      errors,
    },
    cleanup: {
      deletedManagedFiles: 0,
      skippedUntrustedPaths: untrustedCandidates.size,
      errors: 0,
    },
    warnings,
  };
}

export function reconcileReplacementRestoreMedia(
  options: ReplacementRestoreMediaOptions
): Promise<ReplacementRestoreMediaCompletion> {
  return reconcileReplacementRestoreMediaWithAdapters(options, productionAdapters);
}
