import * as MediaLibrary from "expo-media-library";
import { listMediaForAssetIds, listMediaForLocalUris, listMediaForSetIds } from "../db/media";

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

async function getSafeAssetInfo(assetId: string) {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    if (!info || typeof info !== "object") return null;
    if (!("uri" in info) || typeof info.uri !== "string" || info.uri.length === 0) {
      return null;
    }
    return info;
  } catch {
    return null;
  }
}

async function logAssetInfos(stage: string, assetIds: string[]) {
  if (!__DEV__ || assetIds.length === 0) return;
  const sampleIds = assetIds.slice(0, 3);
  const details = await Promise.all(
    sampleIds.map(async (id) => {
      const info = await getSafeAssetInfo(id);
      if (info) {
        return {
          id,
          exists: true,
          uri: info.uri,
          localUri: info.localUri ?? null,
          filename: info.filename ?? null,
          creationTime: info.creationTime ?? null,
          albumId: "albumId" in info ? (info as { albumId?: string }).albumId ?? null : null,
        };
      }
      return {
        id,
        exists: false,
        error: "Asset info not found for ID",
      };
    })
  );

  console.log("[mediaCleanup] Asset info", stage, details);
}

async function ensureMediaPermission() {
  let permission = await MediaLibrary.getPermissionsAsync(false, ["video"]);
  if (__DEV__) {
    console.log("[mediaCleanup] Media permission status:", {
      granted: permission.granted,
      accessPrivileges: permission.accessPrivileges,
      canAskAgain: permission.canAskAgain,
      status: permission.status,
    });
  }
  if (!permission.granted) {
    permission = await MediaLibrary.requestPermissionsAsync(false, ["video"]);
    if (__DEV__) {
      console.log("[mediaCleanup] Media permission after request:", {
        granted: permission.granted,
        accessPrivileges: permission.accessPrivileges,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });
    }
  }
  return permission;
}

async function resolveMissingAssetIds(missing: MediaTarget[]): Promise<string[]> {
  if (missing.length === 0) return [];

  const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (__DEV__) {
    console.log("[mediaCleanup] Resolving missing assets:", {
      missingCount: missing.length,
      albumFound: !!album,
    });
  }
  let remaining: TargetCandidate[] = missing.map((item) => ({
    ...item,
    normalizedUri: normalizeUri(item.localUri),
    filename: extractFilename(item.localUri),
  }));
  const resolvedIds = new Set<string>();
  let scanned = 0;

  const scanScope = async (scope: "album" | "all") => {
    let after: string | undefined;
    while (remaining.length > 0) {
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after,
        mediaType: ["video"],
        ...(scope === "album" && album ? { album } : {}),
      });
      scanned += page.assets.length;

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
  };

  if (album) {
    await scanScope("album");
  }
  if (remaining.length > 0) {
    await scanScope("all");
  }

  if (__DEV__) {
    console.log("[mediaCleanup] Asset resolution finished:", {
      scanned,
      resolvedCount: resolvedIds.size,
      remainingCount: remaining.length,
      unresolvedSample: remaining.slice(0, 3).map((item) => ({
        assetId: item.assetId,
        localUri: item.localUri,
        filename: item.filename,
      })),
    });
  }

  return Array.from(resolvedIds);
}

export async function deleteAssociatedMediaForSets(setIds: number[]): Promise<void> {
  if (setIds.length === 0) return;

  const mediaRows = await listMediaForSetIds(setIds);
  if (__DEV__) {
    console.log("[mediaCleanup] Delete request:", {
      setCount: setIds.length,
      mediaCount: mediaRows.length,
      withAssetId: mediaRows.filter((row) => !!row.assetId).length,
      sample: mediaRows.slice(0, 3).map((row) => ({
        assetId: row.assetId ?? null,
        localUri: row.localUri,
        createdAt: row.createdAt ?? null,
      })),
    });
  }
  if (mediaRows.length === 0) return;

  const permission = await ensureMediaPermission();
  if (!permission.granted || permission.accessPrivileges === "none") {
    if (__DEV__) {
      console.log("[mediaCleanup] Missing media permission, aborting delete.");
    }
    return;
  }

  const verifiedDirectIds: string[] = [];
  const missing: MediaTarget[] = [];
  for (const row of mediaRows) {
    if (row.assetId) {
      const info = await getSafeAssetInfo(row.assetId);
      if (info) {
        verifiedDirectIds.push(row.assetId);
        continue;
      }
      if (__DEV__) {
        console.log("[mediaCleanup] Stored assetId is stale, falling back to URI resolution:", {
          assetId: row.assetId,
          localUri: row.localUri,
        });
      }
    }
    missing.push({
      assetId: row.assetId ?? null,
      localUri: row.localUri,
      createdAt: row.createdAt ?? null,
    });
  }

  let resolvedIds: string[] = [];
  try {
    resolvedIds = await resolveMissingAssetIds(missing);
  } catch (error) {
    console.warn("Failed to resolve media assets:", error);
  }

  let idsToDelete = Array.from(new Set([...verifiedDirectIds, ...resolvedIds]));
  if (__DEV__) {
    console.log("[mediaCleanup] Deleting assets:", {
      directCount: verifiedDirectIds.length,
      resolvedCount: resolvedIds.length,
      totalCount: idsToDelete.length,
    });
  }
  if (idsToDelete.length === 0) return;

  const setIdSet = new Set(setIds);
  const isTargetSetId = (setId: number | null) => setId !== null && setIdSet.has(setId);

  // Guard: if the same underlying asset is linked to multiple sets, deleting media for one set
  // should not delete the asset for the other sets.
  try {
    const rowsWithAssetId = await listMediaForAssetIds(idsToDelete);
    const sharedAssetIds = new Set(
      rowsWithAssetId
        .filter((row) => row.assetId !== null && !isTargetSetId(row.setId))
        .map((row) => row.assetId)
    );

    if (sharedAssetIds.size > 0) {
      idsToDelete = idsToDelete.filter((assetId) => !sharedAssetIds.has(assetId));
      if (__DEV__) {
        console.log("[mediaCleanup] Skipping shared assets (assetId referenced by other sets):", {
          skipped: sharedAssetIds.size,
        });
      }
    }
  } catch (error) {
    console.warn("[mediaCleanup] Failed checking shared assetId references:", error);
  }

  if (idsToDelete.length === 0) return;

  try {
    const assetInfos = await Promise.all(
      idsToDelete.map(async (assetId) => {
        const info = await getSafeAssetInfo(assetId);
        return info ? { assetId, info } : null;
      })
    );

    const assetInfoPairs = assetInfos.filter(
      (item): item is { assetId: string; info: MediaLibrary.AssetInfo } => item !== null
    );

    const urisToCheck = Array.from(
      new Set(
        assetInfoPairs
          .flatMap(({ info }) => [info.uri, info.localUri ?? null])
          .filter((uri): uri is string => typeof uri === "string" && uri.length > 0)
      )
    );

    if (urisToCheck.length > 0) {
      const rowsWithMatchingUri = await listMediaForLocalUris(urisToCheck);
      const sharedUris = new Set(
        rowsWithMatchingUri
          .filter((row) => !isTargetSetId(row.setId))
          .map((row) => row.localUri)
      );

      if (sharedUris.size > 0) {
        const sharedByUri = new Set<string>();
        for (const { assetId, info } of assetInfoPairs) {
          if (sharedUris.has(info.uri) || (info.localUri && sharedUris.has(info.localUri))) {
            sharedByUri.add(assetId);
          }
        }

        if (sharedByUri.size > 0) {
          idsToDelete = idsToDelete.filter((assetId) => !sharedByUri.has(assetId));
          if (__DEV__) {
            console.log("[mediaCleanup] Skipping shared assets (URI referenced by other sets):", {
              skipped: sharedByUri.size,
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn("[mediaCleanup] Failed checking shared URI references:", error);
  }

  if (idsToDelete.length === 0) return;

  try {
    await logAssetInfos("before-delete", idsToDelete);
    const result = await MediaLibrary.deleteAssetsAsync(idsToDelete);
    if (__DEV__) {
      console.log("[mediaCleanup] Delete result:", result);
    }
    await logAssetInfos("after-delete", idsToDelete);
    if (__DEV__) {
      console.log("[mediaCleanup] Delete complete.");
    }
  } catch (error) {
    console.warn("Failed to delete associated media:", error, {
      idsToDelete,
    });
  }
}
