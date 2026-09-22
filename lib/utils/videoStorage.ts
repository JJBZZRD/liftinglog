import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { Platform } from "react-native";

export const DEFAULT_MEDIA_ALBUM_NAME = "LiftingLog";
export const APP_VIDEO_STORAGE_DIR = "set-videos";
const isDevEnv = typeof __DEV__ !== "undefined" && __DEV__;
const REDISCOVERY_PAGE_SIZE = 200;
const REDISCOVERY_MAX_SCAN_COUNT = 1500;
const REDISCOVERY_MATCH_WINDOW_MS = 2_000;
const REDISCOVERY_DURATION_WINDOW_MS = 2_000;
const GALLERY_METADATA_MAX_BYTES = 64 * 1024 * 1024;
const GALLERY_METADATA_MAX_HASH_CANDIDATES = 8;

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

export type CanonicalVideoMetadata = {
  assetId: string;
  originalFilename: string | null;
  mediaCreatedAt: number | null;
  durationMs: number | null;
  albumName: string | null;
};

export type SelectionMetadataResolution =
  | {
      status: "resolved";
      method: "picker_asset_id" | "unique_content_match";
      metadata: CanonicalVideoMetadata;
    }
  | {
      status: "unresolved";
      reason:
        | "permission_denied"
        | "asset_unreadable"
        | "selected_file_too_large"
        | "candidate_file_too_large"
        | "scan_limit"
        | "candidate_limit"
        | "hash_unavailable"
        | "no_match"
        | "ambiguous";
    };

export type GallerySelectionMetadata = {
  width: number | null;
  height: number | null;
  fileSize: number | null;
};

export function toMillis(value?: number | null): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function toPositiveMillis(value?: number | null): number | null {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return null;
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

function getCanonicalAssetMetadata(assetInfo: MediaLibrary.AssetInfo | null): {
  originalFilename: string | null;
  mediaCreatedAt: number | null;
  durationMs: number | null;
} {
  if (!assetInfo) {
    return {
      originalFilename: null,
      mediaCreatedAt: null,
      durationMs: null,
    };
  }

  return {
    originalFilename:
      typeof assetInfo.filename === "string" && assetInfo.filename.trim().length > 0
        ? assetInfo.filename
        : null,
    mediaCreatedAt:
      toPositiveMillis(assetInfo.creationTime),
    durationMs:
      typeof assetInfo.duration === "number" && Number.isFinite(assetInfo.duration) && assetInfo.duration > 0
        ? Math.round(assetInfo.duration * 1000)
        : null,
  };
}

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function pickerMetadataMatchesAsset(
  assetInfo: MediaLibrary.AssetInfo,
  pickerDurationMs: number | null,
  pickerWidth: number | null,
  pickerHeight: number | null
): boolean {
  const expectedDuration = positiveFinite(pickerDurationMs);
  const actualDuration = positiveFinite(assetInfo.duration);
  if (
    expectedDuration !== null &&
    (actualDuration === null || Math.abs(Math.round(actualDuration * 1000) - expectedDuration) > REDISCOVERY_DURATION_WINDOW_MS)
  ) {
    return false;
  }

  const expectedWidth = positiveFinite(pickerWidth);
  const expectedHeight = positiveFinite(pickerHeight);
  if (expectedWidth !== null && expectedHeight !== null) {
    const actualWidth = positiveFinite(assetInfo.width);
    const actualHeight = positiveFinite(assetInfo.height);
    if (actualWidth === null || actualHeight === null) return false;
    const sameOrientation = actualWidth === expectedWidth && actualHeight === expectedHeight;
    const rotated = actualWidth === expectedHeight && actualHeight === expectedWidth;
    if (!sameOrientation && !rotated) return false;
  }

  return true;
}

function candidateMatchesPickerPrefilter(
  candidate: MediaLibrary.Asset,
  pickerDurationMs: number | null,
  pickerWidth: number | null,
  pickerHeight: number | null
): boolean {
  const expectedDuration = positiveFinite(pickerDurationMs);
  const actualDuration = positiveFinite(candidate.duration);
  if (
    expectedDuration !== null &&
    actualDuration !== null &&
    Math.abs(Math.round(actualDuration * 1000) - expectedDuration) > REDISCOVERY_DURATION_WINDOW_MS
  ) {
    return false;
  }

  const expectedWidth = positiveFinite(pickerWidth);
  const expectedHeight = positiveFinite(pickerHeight);
  const actualWidth = positiveFinite(candidate.width);
  const actualHeight = positiveFinite(candidate.height);
  if (
    expectedWidth !== null &&
    expectedHeight !== null &&
    actualWidth !== null &&
    actualHeight !== null
  ) {
    const sameOrientation = actualWidth === expectedWidth && actualHeight === expectedHeight;
    const rotated = actualWidth === expectedHeight && actualHeight === expectedWidth;
    if (!sameOrientation && !rotated) return false;
  }

  return true;
}

async function getAlbumName(albumId: string | null | undefined): Promise<string | null> {
  if (!albumId) return null;
  try {
    const albums = await MediaLibrary.getAlbumsAsync();
    return albums.find((album) => String(album.id) === String(albumId))?.title ?? null;
  } catch {
    return null;
  }
}

async function canonicalMetadataForAsset(
  assetId: string,
  assetInfo: MediaLibrary.AssetInfo
): Promise<CanonicalVideoMetadata> {
  const canonical = getCanonicalAssetMetadata(assetInfo);
  return {
    assetId,
    ...canonical,
    albumName: await getAlbumName(assetInfo.albumId),
  };
}

async function getExistingVideoPermission(): Promise<boolean> {
  try {
    const permission = await MediaLibrary.getPermissionsAsync(false, ["video"]);
    return permission.granted && permission.accessPrivileges !== "none";
  } catch {
    return false;
  }
}

async function getBoundedFileInfo(
  uri: string,
  tooLargeReason: "selected_file_too_large" | "candidate_file_too_large"
): Promise<{ status: "ok"; size: number } | Extract<SelectionMetadataResolution, { status: "unresolved" }>> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || !Number.isFinite(info.size) || info.size <= 0) {
      return { status: "unresolved", reason: "asset_unreadable" };
    }
    if (info.size > GALLERY_METADATA_MAX_BYTES) {
      return { status: "unresolved", reason: tooLargeReason };
    }
    return { status: "ok", size: info.size };
  } catch {
    return { status: "unresolved", reason: "asset_unreadable" };
  }
}

async function getMd5(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { md5: true });
    return info.exists && typeof info.md5 === "string" && info.md5.length > 0 ? info.md5 : null;
  } catch {
    return null;
  }
}

export async function acquireSelectedVideoMetadata(args: {
  durableLocalUri: string;
  pickerAssetId: string | null;
  pickerDurationMs: number | null;
  pickerWidth: number | null;
  pickerHeight: number | null;
  pickerFileSize: number | null;
}): Promise<SelectionMetadataResolution> {
  if (!(await getExistingVideoPermission())) {
    return { status: "unresolved", reason: "permission_denied" };
  }

  const pickerSize = positiveFinite(args.pickerFileSize);
  if (pickerSize !== null && pickerSize > GALLERY_METADATA_MAX_BYTES) {
    return { status: "unresolved", reason: "selected_file_too_large" };
  }
  const selectedFile = await getBoundedFileInfo(args.durableLocalUri, "selected_file_too_large");
  if (selectedFile.status === "unresolved") return selectedFile;

  if (args.pickerAssetId) {
    const assetInfo = await getSafeAssetInfo(String(args.pickerAssetId));
    if (
      assetInfo &&
      pickerMetadataMatchesAsset(
        assetInfo,
        args.pickerDurationMs,
        args.pickerWidth,
        args.pickerHeight
      )
    ) {
      return {
        status: "resolved",
        method: "picker_asset_id",
        metadata: await canonicalMetadataForAsset(String(args.pickerAssetId), assetInfo),
      };
    }
  }

  let after: string | undefined;
  let scannedCount = 0;
  const seenCursors = new Set<string>();
  const plausibleCandidates: MediaLibrary.Asset[] = [];

  try {
    while (true) {
      const remaining = REDISCOVERY_MAX_SCAN_COUNT - scannedCount;
      if (remaining <= 0) {
        return { status: "unresolved", reason: "scan_limit" };
      }
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: Math.min(REDISCOVERY_PAGE_SIZE, remaining),
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        ...(after ? { after } : {}),
      });
      if (page.assets.length > remaining) {
        return { status: "unresolved", reason: "scan_limit" };
      }
      scannedCount += page.assets.length;
      for (const candidate of page.assets) {
        if (
          candidateMatchesPickerPrefilter(
            candidate,
            args.pickerDurationMs,
            args.pickerWidth,
            args.pickerHeight
          )
        ) {
          plausibleCandidates.push(candidate);
          if (plausibleCandidates.length > GALLERY_METADATA_MAX_HASH_CANDIDATES) {
            return { status: "unresolved", reason: "candidate_limit" };
          }
        }
      }

      if (!page.hasNextPage) break;
      if (!page.endCursor || page.assets.length === 0 || seenCursors.has(page.endCursor)) {
        return { status: "unresolved", reason: "scan_limit" };
      }
      if (scannedCount >= REDISCOVERY_MAX_SCAN_COUNT) {
        return { status: "unresolved", reason: "scan_limit" };
      }
      seenCursors.add(page.endCursor);
      after = page.endCursor;
    }
  } catch {
    return { status: "unresolved", reason: "asset_unreadable" };
  }

  const selectedMd5 = await getMd5(args.durableLocalUri);
  if (!selectedMd5) return { status: "unresolved", reason: "hash_unavailable" };

  const matches: MediaLibrary.Asset[] = [];
  for (const candidate of plausibleCandidates) {
    let contentUri: string;
    try {
      contentUri = await MediaLibrary.getAssetContentUriAsync(candidate.id);
    } catch {
      return { status: "unresolved", reason: "asset_unreadable" };
    }
    const candidateFile = await getBoundedFileInfo(contentUri, "candidate_file_too_large");
    if (candidateFile.status === "unresolved") return candidateFile;
    const candidateMd5 = await getMd5(contentUri);
    if (!candidateMd5) return { status: "unresolved", reason: "hash_unavailable" };
    if (candidateMd5 === selectedMd5) matches.push(candidate);
  }

  if (matches.length === 0) return { status: "unresolved", reason: "no_match" };
  if (matches.length > 1) return { status: "unresolved", reason: "ambiguous" };

  const match = matches[0];
  const assetInfo = await getSafeAssetInfo(match.id);
  if (!assetInfo) return { status: "unresolved", reason: "asset_unreadable" };
  return {
    status: "resolved",
    method: "unique_content_match",
    metadata: await canonicalMetadataForAsset(match.id, assetInfo),
  };
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

async function buildResolvedReference(
  assetId: string,
  assetInfo: MediaLibrary.AssetInfo | null,
  source: RediscoveredVideoReference["source"],
  fallbackAlbumName: string | null
): Promise<RediscoveredVideoReference | null> {
  if (!assetInfo) {
    return null;
  }

  let localUri = assetInfo.localUri ?? null;
  let uri = assetInfo.uri ?? null;
  if (Platform.OS === "android") {
    try {
      uri = await MediaLibrary.getAssetContentUriAsync(assetId);
      localUri = null;
    } catch {
      return null;
    }
  }

  const canonical = getCanonicalAssetMetadata(assetInfo);

  return {
    assetId,
    localUri,
    uri,
    ...canonical,
    albumName: fallbackAlbumName,
    source,
  };
}

function metadataMatchesCanonicalAsset(
  metadata: VideoRediscoveryMetadata,
  assetInfo: MediaLibrary.AssetInfo
): boolean {
  const expectedFilename = metadata.originalFilename?.trim() ?? "";
  if (!expectedFilename || assetInfo.filename !== expectedFilename) return false;

  const expectedCreatedAt = toPositiveMillis(metadata.mediaCreatedAt);
  const expectedDurationMs = positiveFinite(metadata.durationMs);
  if (expectedCreatedAt === null && expectedDurationMs === null) return false;

  const canonical = getCanonicalAssetMetadata(assetInfo);
  if (
    expectedCreatedAt !== null &&
    (canonical.mediaCreatedAt === null ||
      Math.abs(canonical.mediaCreatedAt - expectedCreatedAt) > REDISCOVERY_MATCH_WINDOW_MS)
  ) {
    return false;
  }
  if (
    expectedDurationMs !== null &&
    (canonical.durationMs === null ||
      Math.abs(canonical.durationMs - expectedDurationMs) > REDISCOVERY_DURATION_WINDOW_MS)
  ) {
    return false;
  }
  return true;
}

async function searchVideoScope(
  metadata: VideoRediscoveryMetadata
): Promise<RediscoveredVideoReference | null> {
  let after: string | undefined;
  let scannedCount = 0;
  const seenCursors = new Set<string>();
  const matches: Array<{ id: string; info: MediaLibrary.AssetInfo }> = [];

  try {
    while (true) {
      const remaining = REDISCOVERY_MAX_SCAN_COUNT - scannedCount;
      if (remaining <= 0) return null;
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: Math.min(REDISCOVERY_PAGE_SIZE, remaining),
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        ...(after ? { after } : {}),
      });
      if (page.assets.length > remaining) return null;
      scannedCount += page.assets.length;

      for (const candidate of page.assets) {
        if (candidate.filename !== metadata.originalFilename) continue;
        const assetInfo = await getSafeAssetInfo(candidate.id);
        if (!assetInfo) return null;
        if (metadataMatchesCanonicalAsset(metadata, assetInfo)) {
          matches.push({ id: candidate.id, info: assetInfo });
        }
      }

      if (!page.hasNextPage) break;
      if (!page.endCursor || page.assets.length === 0 || seenCursors.has(page.endCursor)) return null;
      if (scannedCount >= REDISCOVERY_MAX_SCAN_COUNT) return null;
      seenCursors.add(page.endCursor);
      after = page.endCursor;
    }
  } catch {
    return null;
  }

  if (matches.length !== 1) return null;
  const match = matches[0];
  return await buildResolvedReference(
    match.id,
    match.info,
    metadata.assetId != null && String(metadata.assetId) === match.id
      ? "asset_id"
      : "library_search",
    metadata.albumName ?? null
  );
}

export async function resolveVideoLibraryReference(
  metadata: VideoRediscoveryMetadata
): Promise<RediscoveredVideoReference | null> {
  const filename = metadata.originalFilename?.trim() ?? "";
  if (
    !filename ||
    (toPositiveMillis(metadata.mediaCreatedAt) === null && positiveFinite(metadata.durationMs) === null)
  ) {
    return null;
  }
  if (!(await getExistingVideoPermission())) return null;
  return await searchVideoScope({ ...metadata, originalFilename: filename });
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
  gallerySelection?: GallerySelectionMetadata;
}): Promise<PersistedVideoDescriptor | null> {
  const durableLocalUri = await persistVideoUriToAppStorage(args.sourceUri, args.filenameHint);
  if (!durableLocalUri) {
    return null;
  }

  if (args.gallerySelection) {
    let resolution: SelectionMetadataResolution;
    try {
      resolution = await acquireSelectedVideoMetadata({
        durableLocalUri,
        pickerAssetId: args.assetId ?? null,
        pickerDurationMs: args.durationMs ?? null,
        pickerWidth: args.gallerySelection.width,
        pickerHeight: args.gallerySelection.height,
        pickerFileSize: args.gallerySelection.fileSize,
      });
    } catch {
      resolution = { status: "unresolved", reason: "asset_unreadable" };
    }

    if (resolution.status === "resolved") {
      return {
        localUri: durableLocalUri,
        ...resolution.metadata,
      };
    }

    return {
      localUri: durableLocalUri,
      assetId: null,
      originalFilename: null,
      mediaCreatedAt: null,
      durationMs: positiveFinite(args.durationMs),
      albumName: null,
    };
  }

  let nextAssetId = args.assetId ?? null;
  let nextOriginalFilename = args.filenameHint ?? null;
  let nextMediaCreatedAt = args.mediaCreatedAt ?? null;
  let nextDurationMs = args.durationMs ?? null;
  let nextAlbumName = args.albumName ?? null;

  if (nextAssetId) {
    const assetInfo = await getSafeAssetInfo(nextAssetId);
    const canonical = getCanonicalAssetMetadata(assetInfo);
    nextOriginalFilename = canonical.originalFilename ?? nextOriginalFilename;
    nextMediaCreatedAt = canonical.mediaCreatedAt ?? nextMediaCreatedAt;
    nextDurationMs = canonical.durationMs ?? nextDurationMs;
  } else if (args.saveToLibrary) {
    const albumName = nextAlbumName ?? DEFAULT_MEDIA_ALBUM_NAME;
    const createdAsset = await createLibraryAssetFromManagedVideo(durableLocalUri, albumName);
    if (createdAsset?.id) {
      nextAssetId = String(createdAsset.id);
      nextAlbumName = albumName;
      const assetInfo = await getSafeAssetInfo(nextAssetId);
      const canonical = getCanonicalAssetMetadata(assetInfo);
      nextOriginalFilename = canonical.originalFilename ?? nextOriginalFilename;
      nextMediaCreatedAt = canonical.mediaCreatedAt ?? nextMediaCreatedAt;
      nextDurationMs = canonical.durationMs ?? nextDurationMs;
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
