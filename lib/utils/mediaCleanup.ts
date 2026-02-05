import * as MediaLibrary from "expo-media-library";
import { listMediaForSetIds } from "../db/media";

const ALBUM_NAME = "LiftingLog";
const PAGE_SIZE = 200;
const FILENAME_MATCH_WINDOW_MS = 10 * 60 * 1000;

type MediaTarget = {
  assetId: string | null;
  localUri: string;
  createdAt: number | null;
};

type TargetCandidate = MediaTarget & {
  normalizedUri: string;
  filename: string | null;
};

function normalizeUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  return withoutQuery.replace(/^file:\/\//, "").toLowerCase();
}

function extractFilename(uri: string): string | null {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const lastSlash = withoutQuery.lastIndexOf("/");
  if (lastSlash === -1) return withoutQuery || null;
  return withoutQuery.slice(lastSlash + 1) || null;
}

function toMillis(value?: number): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

async function ensureMediaPermission() {
  let permission = await MediaLibrary.getPermissionsAsync(false, ["video"]);
  if (!permission.granted) {
    permission = await MediaLibrary.requestPermissionsAsync(false, ["video"]);
  }
  return permission;
}

async function resolveMissingAssetIds(missing: MediaTarget[]): Promise<string[]> {
  if (missing.length === 0) return [];

  const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  let remaining: TargetCandidate[] = missing.map((item) => ({
    ...item,
    normalizedUri: normalizeUri(item.localUri),
    filename: extractFilename(item.localUri),
  }));
  const resolvedIds = new Set<string>();
  let after: string | undefined;

  while (remaining.length > 0) {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: ["video"],
      ...(album ? { album } : {}),
    });

    for (const asset of page.assets) {
      if (remaining.length === 0) break;
      const assetUri = normalizeUri(asset.uri);
      const assetFilename = asset.filename ?? null;
      const assetTime = toMillis(asset.creationTime);

      remaining = remaining.filter((target) => {
        if (assetUri && assetUri === target.normalizedUri) {
          resolvedIds.add(asset.id);
          return false;
        }

        if (assetFilename && target.filename && assetFilename === target.filename) {
          if (target.createdAt && assetTime) {
            const delta = Math.abs(assetTime - target.createdAt);
            if (delta > FILENAME_MATCH_WINDOW_MS) {
              return true;
            }
          }
          resolvedIds.add(asset.id);
          return false;
        }

        return true;
      });
    }

    if (!page.hasNextPage) {
      break;
    }
    after = page.endCursor ?? undefined;
  }

  return Array.from(resolvedIds);
}

export async function deleteAssociatedMediaForSets(setIds: number[]): Promise<void> {
  if (setIds.length === 0) return;

  const mediaRows = await listMediaForSetIds(setIds);
  if (mediaRows.length === 0) return;

  const permission = await ensureMediaPermission();
  if (!permission.granted || permission.accessPrivileges === "none") {
    return;
  }

  const directIds = mediaRows
    .map((row) => row.assetId)
    .filter(Boolean) as string[];

  const missing = mediaRows
    .filter((row) => !row.assetId)
    .map((row) => ({
      assetId: null,
      localUri: row.localUri,
      createdAt: row.createdAt ?? null,
    }));

  let resolvedIds: string[] = [];
  try {
    resolvedIds = await resolveMissingAssetIds(missing);
  } catch (error) {
    console.warn("Failed to resolve media assets:", error);
  }

  const idsToDelete = Array.from(new Set([...directIds, ...resolvedIds]));
  if (idsToDelete.length === 0) return;

  try {
    await MediaLibrary.deleteAssetsAsync(idsToDelete);
  } catch (error) {
    console.warn("Failed to delete associated media:", error);
  }
}
