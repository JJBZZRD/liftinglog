import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

export const DEFAULT_MEDIA_ALBUM_NAME = "LiftingLog";
export const APP_VIDEO_STORAGE_DIR = "set-videos";
const isDevEnv = typeof __DEV__ !== "undefined" && __DEV__;
const REDISCOVERY_PAGE_SIZE = 200;
const REDISCOVERY_MAX_SCAN_COUNT = 1500;
const REDISCOVERY_TIME_WINDOW_MS = 60_000;
const REDISCOVERY_MATCH_WINDOW_MS = 2_000;
const REDISCOVERY_DURATION_WINDOW_MS = 2_000;

export type PersistedVideoDescriptor = {
  localUri: string;
  assetId: string | null;
  originalFilename: string | null;
  mediaCreatedAt: number | null;
  durationMs: number | null;
  albumName: string | null;
};

export type VideoRediscoveryMetadata = {
  assetId?: string | null;
  originalFilename?: string | null;
  mediaCreatedAt?: number | null;
  durationMs?: number | null;
  albumName?: string | null;
};

export type RediscoveredVideoReference = {
  assetId: string;
  localUri: string | null;
  uri: string | null;
  originalFilename: string | null;
  mediaCreatedAt: number | null;
  durationMs: number | null;
  albumName: string | null;
  source: "asset_id" | "album_search" | "library_search";
};

export function toMillis(value?: number | null): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

export function getUriScheme(uri: string | null | undefined): string {
  if (!uri) return "unknown";
  const match = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

export function isFileUri(uri: string | null | undefined): uri is string {
  return typeof uri === "string" && uri.length > 0 && getUriScheme(uri) === "file";
}

export function isLikelyTransientUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const normalized = uri.toLowerCase();
  return (
    normalized.includes("/cache/") ||
    normalized.includes("\\cache\\") ||
    normalized.includes("/tmp/") ||
    normalized.includes("\\tmp\\") ||
    normalized.includes("imagepicker")
  );
}

export function inferVideoMimeFromUri(uri: string | null): string {
  const lower = (uri ?? "").split("?")[0].toLowerCase();
  if (lower.endsWith(".mov") || lower.endsWith(".qt")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".3gp") || lower.endsWith(".3gpp")) return "video/3gpp";
  return "video/mp4";
}

function extractExtension(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutQuery = value.split("?")[0] ?? value;
  const filename = withoutQuery.split("/").pop() ?? withoutQuery;
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return null;
  return filename.slice(dotIndex + 1);
}

function sanitizeExtension(extension: string | null | undefined): string {
  const sanitized = (extension ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (sanitized.length === 0) return "mp4";
  return sanitized.slice(0, 10);
}

function getManagedVideoDirectoryUri(): string | null {
  const documentDirectory = FileSystem.documentDirectory;
  if (!documentDirectory) return null;
  return `${documentDirectory}${APP_VIDEO_STORAGE_DIR}/`;
}

export function isManagedVideoUri(uri: string | null | undefined): uri is string {
  if (!uri) return false;
  const managedDirectoryUri = getManagedVideoDirectoryUri();
  if (!managedDirectoryUri) return false;
  return uri.startsWith(managedDirectoryUri);
}

export async function doesFileUriExist(uri: string | null | undefined): Promise<boolean> {
  if (!isFileUri(uri)) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info.exists;
  } catch {
    return false;
  }
}

export async function persistVideoUriToAppStorage(
  sourceUri: string,
  filenameHint?: string | null
): Promise<string | null> {
  const directoryUri = getManagedVideoDirectoryUri();
  if (!directoryUri) return null;

  try {
    const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
    }

    const extension = sanitizeExtension(extractExtension(filenameHint) ?? extractExtension(sourceUri));
    const targetUri = `${directoryUri}${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
    return targetUri;
  } catch (error) {
    if (isDevEnv) {
      console.warn("[videoStorage] Failed to persist URI to app storage:", {
        sourceUri,
        error: String(error),
      });
    }
    return null;
  }
}

async function getSafeAssetInfo(assetId: string): Promise<MediaLibrary.AssetInfo | null> {
  try {
    return await MediaLibrary.getAssetInfoAsync(assetId);
  } catch (error) {
    if (isDevEnv) {
      console.warn("[videoStorage] Failed to resolve asset metadata:", {
        assetId,
        error: String(error),
      });
    }
    return null;
  }
}

export async function ensureVideoLibraryPermission(): Promise<boolean> {
  try {
    let permission = await MediaLibrary.getPermissionsAsync(false, ["video"]);
    if (!permission.granted) {
      permission = await MediaLibrary.requestPermissionsAsync(false, ["video"]);
    }
    return permission.granted && permission.accessPrivileges !== "none";
  } catch (error) {
    if (isDevEnv) {
      console.warn("[videoStorage] Failed checking video library permission:", {
        error: String(error),
      });
    }
    return false;
  }
}

function getDurationDeltaMs(
  expectedDurationMs: number | null,
  assetDurationSeconds?: number | null
): number | null {
  if (expectedDurationMs == null || assetDurationSeconds == null) {
    return null;
  }

  return Math.abs(Math.round(assetDurationSeconds * 1000) - expectedDurationMs);
}

function buildResolvedReference(
  assetId: string,
  assetInfo: MediaLibrary.AssetInfo | null,
  source: RediscoveredVideoReference["source"],
  fallbackAlbumName: string | null
): RediscoveredVideoReference | null {
  if (!assetInfo) {
    return null;
  }

  return {
    assetId,
    localUri: assetInfo.localUri ?? null,
    uri: assetInfo.uri ?? null,
    originalFilename: assetInfo.filename ?? null,
    mediaCreatedAt: assetInfo.creationTime ?? null,
    durationMs:
      assetInfo.duration != null ? Math.round(assetInfo.duration * 1000) : null,
    albumName: fallbackAlbumName,
    source,
  };
}

async function resolveVideoByAssetId(
  assetId: string,
  fallbackAlbumName: string | null
): Promise<RediscoveredVideoReference | null> {
  const assetInfo = await getSafeAssetInfo(assetId);
  return buildResolvedReference(assetId, assetInfo, "asset_id", fallbackAlbumName);
}

async function searchVideoScope(
  metadata: Required<Pick<VideoRediscoveryMetadata, "originalFilename" | "mediaCreatedAt" | "durationMs">> & {
    albumName: string | null;
  },
  scope: "album" | "library"
): Promise<RediscoveredVideoReference | null> {
  const hasFilename = !!metadata.originalFilename;
  const mediaCreatedAtMs = toMillis(metadata.mediaCreatedAt);
  const hasCreationTime = mediaCreatedAtMs !== null;

  if (!hasFilename && !hasCreationTime) {
    return null;
  }

  let album: MediaLibrary.Album | null = null;
  if (scope === "album" && metadata.albumName) {
    album = await MediaLibrary.getAlbumAsync(metadata.albumName);
    if (!album) {
      return null;
    }
  }

  const searchOptions: MediaLibrary.AssetsOptions = {
    mediaType: MediaLibrary.MediaType.video,
    first: REDISCOVERY_PAGE_SIZE,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    ...(album ? { album } : {}),
  };

  if (mediaCreatedAtMs !== null) {
    searchOptions.createdAfter = mediaCreatedAtMs - REDISCOVERY_TIME_WINDOW_MS;
    searchOptions.createdBefore = mediaCreatedAtMs + REDISCOVERY_TIME_WINDOW_MS;
  }

  let after: string | undefined;
  let scannedCount = 0;
  let bestMatch:
    | {
        score: number;
        reference: RediscoveredVideoReference;
      }
    | null = null;

  while (scannedCount < REDISCOVERY_MAX_SCAN_COUNT) {
    const page = await MediaLibrary.getAssetsAsync({
      ...searchOptions,
      ...(after ? { after } : {}),
    });
    scannedCount += page.assets.length;

    for (const candidate of page.assets) {
      const candidateCreationTimeMs = toMillis(candidate.creationTime);
      const filenameMatches =
        hasFilename && candidate.filename === metadata.originalFilename;
      const creationTimeMatches =
        hasCreationTime &&
        candidateCreationTimeMs !== null &&
        mediaCreatedAtMs !== null &&
        Math.abs(candidateCreationTimeMs - mediaCreatedAtMs) <= REDISCOVERY_MATCH_WINDOW_MS;

      if (!filenameMatches && !creationTimeMatches) {
        continue;
      }

      const assetInfo = await getSafeAssetInfo(candidate.id);
      if (!assetInfo) {
        continue;
      }

      let score = 0;
      if (filenameMatches) score += 5;
      if (creationTimeMatches) score += 4;

      const durationDeltaMs = getDurationDeltaMs(metadata.durationMs, assetInfo.duration);
      if (durationDeltaMs !== null) {
        if (durationDeltaMs <= REDISCOVERY_DURATION_WINDOW_MS) {
          score += 3;
        } else if (durationDeltaMs <= REDISCOVERY_TIME_WINDOW_MS) {
          score += 1;
        }
      }

      if (!bestMatch || score > bestMatch.score) {
        const reference = buildResolvedReference(
          candidate.id,
          assetInfo,
          scope === "album" ? "album_search" : "library_search",
          metadata.albumName
        );
        if (reference) {
          bestMatch = { score, reference };
        }
      }
    }

    if (!page.hasNextPage || !page.endCursor || page.assets.length === 0) {
      break;
    }
    after = page.endCursor;
  }

  return bestMatch?.reference ?? null;
}

export async function resolveVideoLibraryReference(
  metadata: VideoRediscoveryMetadata
): Promise<RediscoveredVideoReference | null> {
  const preferredAlbumNames = [...new Set(
    [metadata.albumName, DEFAULT_MEDIA_ALBUM_NAME].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    )
  )];

  if (metadata.assetId) {
    const direct = await resolveVideoByAssetId(
      String(metadata.assetId),
      preferredAlbumNames[0] ?? null
    );
    if (direct) {
      return direct;
    }
  }

  for (const albumName of preferredAlbumNames) {
    const match = await searchVideoScope(
      {
        originalFilename: metadata.originalFilename ?? null,
        mediaCreatedAt: metadata.mediaCreatedAt ?? null,
        durationMs: metadata.durationMs ?? null,
        albumName,
      },
      "album"
    );
    if (match) {
      return match;
    }
  }

  return await searchVideoScope(
    {
      originalFilename: metadata.originalFilename ?? null,
      mediaCreatedAt: metadata.mediaCreatedAt ?? null,
      durationMs: metadata.durationMs ?? null,
      albumName: preferredAlbumNames[0] ?? null,
    },
    "library"
  );
}

async function createLibraryAssetFromManagedVideo(
  localUri: string,
  albumName: string
): Promise<MediaLibrary.Asset | null> {
  try {
    const existingAlbum = await MediaLibrary.getAlbumAsync(albumName);
    const asset = existingAlbum
      ? await MediaLibrary.createAssetAsync(localUri, existingAlbum)
      : await MediaLibrary.createAssetAsync(localUri);

    if (!existingAlbum) {
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
    }

    return asset;
  } catch (error) {
    if (isDevEnv) {
      console.warn("[videoStorage] Failed creating MediaLibrary asset from managed video:", {
        localUri,
        albumName,
        error: String(error),
      });
    }
    return null;
  }
}

export async function persistVideoForSetLink(args: {
  sourceUri: string;
  assetId?: string | null;
  filenameHint?: string | null;
  mediaCreatedAt?: number | null;
  durationMs?: number | null;
  albumName?: string | null;
  saveToLibrary?: boolean;
}): Promise<PersistedVideoDescriptor | null> {
  const durableLocalUri = await persistVideoUriToAppStorage(args.sourceUri, args.filenameHint);
  if (!durableLocalUri) {
    return null;
  }

  let nextAssetId = args.assetId ?? null;
  let nextOriginalFilename = args.filenameHint ?? null;
  let nextMediaCreatedAt = args.mediaCreatedAt ?? null;
  let nextDurationMs = args.durationMs ?? null;
  let nextAlbumName = args.albumName ?? null;

  if (nextAssetId) {
    const assetInfo = await getSafeAssetInfo(nextAssetId);
    if (assetInfo) {
      if (!nextOriginalFilename && assetInfo.filename) {
        nextOriginalFilename = assetInfo.filename;
      }
      if (nextMediaCreatedAt == null && assetInfo.creationTime != null) {
        nextMediaCreatedAt = assetInfo.creationTime;
      }
      if (nextDurationMs == null && assetInfo.duration != null) {
        nextDurationMs = Math.round(assetInfo.duration * 1000);
      }
    }
  } else if (args.saveToLibrary) {
    const albumName = nextAlbumName ?? DEFAULT_MEDIA_ALBUM_NAME;
    const createdAsset = await createLibraryAssetFromManagedVideo(durableLocalUri, albumName);
    if (createdAsset?.id) {
      nextAssetId = String(createdAsset.id);
      nextAlbumName = albumName;
      const assetInfo = await getSafeAssetInfo(nextAssetId);
      if (assetInfo) {
        if (!nextOriginalFilename && assetInfo.filename) {
          nextOriginalFilename = assetInfo.filename;
        }
        if (nextMediaCreatedAt == null && assetInfo.creationTime != null) {
          nextMediaCreatedAt = assetInfo.creationTime;
        }
        if (nextDurationMs == null && assetInfo.duration != null) {
          nextDurationMs = Math.round(assetInfo.duration * 1000);
        }
      }
    }
  }

  return {
    localUri: durableLocalUri,
    assetId: nextAssetId,
    originalFilename: nextOriginalFilename,
    mediaCreatedAt: nextMediaCreatedAt,
    durationMs: nextDurationMs,
    albumName: nextAlbumName,
  };
}

export async function deleteManagedVideoUri(uri: string | null | undefined): Promise<void> {
  if (!isManagedVideoUri(uri)) return;

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (error) {
    if (isDevEnv) {
      console.warn("[videoStorage] Failed deleting managed video:", {
        uri,
        error: String(error),
      });
    }
  }
}
