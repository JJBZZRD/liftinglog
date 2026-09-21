import { desc, eq, inArray } from "drizzle-orm";
import { db } from "./connection";
import { media, sets, type MediaRow } from "./schema";
import type { PersistedVideoDescriptor } from "../utils/videoStorage";

export type Media = MediaRow;

type VideoForSet = PersistedVideoDescriptor & {
  mime: string | null;
};

function isValidSetId(setId: number): boolean {
  return Number.isSafeInteger(setId) && setId > 0;
}

function isNonEmptyUri(uri: string): boolean {
  return typeof uri === "string" && uri.trim().length > 0;
}

/**
 * Replaces the single user-facing video for a set while preserving any older
 * media rows that callers still use as legacy attachments.
 *
 * The synchronous Drizzle SQLite transaction deliberately has no async work in
 * its callback. File copying and MediaLibrary metadata resolution happen
 * before this function is called.
 */
export async function upsertVideoForSet(
  setId: number,
  video: VideoForSet
): Promise<number> {
  if (!isValidSetId(setId)) {
    throw new Error("A valid set ID is required to save a video.");
  }
  if (!isNonEmptyUri(video.localUri)) {
    throw new Error("A non-empty local video URI is required to save a video.");
  }

  return db.transaction((tx) => {
    const set = tx
      .select({ id: sets.id })
      .from(sets)
      .where(eq(sets.id, setId))
      .get();
    if (!set) {
      throw new Error(`Cannot save a video for missing set ${setId}.`);
    }

    const existing = tx
      .select({ id: media.id })
      .from(media)
      .where(eq(media.setId, setId))
      .orderBy(desc(media.createdAt), desc(media.id))
      .limit(1)
      .get();

    if (existing) {
      tx
        .update(media)
        .set({
          localUri: video.localUri,
          assetId: video.assetId,
          mime: video.mime,
          originalFilename: video.originalFilename,
          mediaCreatedAt: video.mediaCreatedAt,
          durationMs: video.durationMs,
          albumName: video.albumName,
        })
        .where(eq(media.id, existing.id))
        .run();
      return existing.id;
    }

    const inserted = tx
      .insert(media)
      .values({
        localUri: video.localUri,
        assetId: video.assetId,
        mime: video.mime,
        setId,
        workoutId: null,
        note: null,
        createdAt: Date.now(),
        originalFilename: video.originalFilename,
        mediaCreatedAt: video.mediaCreatedAt,
        durationMs: video.durationMs,
        albumName: video.albumName,
      })
      .run();
    return inserted.lastInsertRowId;
  });
}

export async function listMediaForAssetIds(assetIds: string[]): Promise<Media[]> {
  if (assetIds.length === 0) return [];
  return await db.select().from(media).where(inArray(media.assetId, assetIds));
}

export async function listMediaForLocalUris(localUris: string[]): Promise<Media[]> {
  if (localUris.length === 0) return [];
  return await db.select().from(media).where(inArray(media.localUri, localUris));
}

export async function addMedia(args: {
  local_uri: string;
  asset_id?: string | null;
  mime?: string | null;
  set_id?: number | null;
  workout_id?: number | null;
  note?: string | null;
  created_at?: number | null;
  original_filename?: string | null;
  media_created_at?: number | null;
  duration_ms?: number | null;
  album_name?: string | null;
}): Promise<number> {
  const res = await db
    .insert(media)
    .values({
      localUri: args.local_uri,
      assetId: args.asset_id ?? null,
      mime: args.mime ?? null,
      setId: args.set_id ?? null,
      workoutId: args.workout_id ?? null,
      note: args.note ?? null,
      createdAt: args.created_at ?? Date.now(),
      originalFilename: args.original_filename ?? null,
      mediaCreatedAt: args.media_created_at ?? null,
      durationMs: args.duration_ms ?? null,
      albumName: args.album_name ?? null,
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function listMediaForSet(setId: number): Promise<Media[]> {
  return await db.select().from(media).where(eq(media.setId, setId));
}

export async function unlinkMediaForSet(setId: number): Promise<void> {
  await db.delete(media).where(eq(media.setId, setId)).run();
}

export async function listMediaForSetIds(setIds: number[]): Promise<Media[]> {
  if (setIds.length === 0) return [];
  return await db.select().from(media).where(inArray(media.setId, setIds));
}

export async function getLatestMediaForSet(setId: number): Promise<Media | null> {
  const rows = await db
    .select()
    .from(media)
    .where(eq(media.setId, setId))
    .orderBy(desc(media.createdAt), desc(media.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateMedia(
  mediaId: number,
  args: {
    local_uri?: string;
    asset_id?: string | null;
    mime?: string | null;
    set_id?: number | null;
    workout_id?: number | null;
    note?: string | null;
    created_at?: number | null;
    original_filename?: string | null;
    media_created_at?: number | null;
    duration_ms?: number | null;
    album_name?: string | null;
  }
): Promise<void> {
  const updates: {
    localUri?: string;
    assetId?: string | null;
    mime?: string | null;
    setId?: number | null;
    workoutId?: number | null;
    note?: string | null;
    createdAt?: number | null;
    originalFilename?: string | null;
    mediaCreatedAt?: number | null;
    durationMs?: number | null;
    albumName?: string | null;
  } = {};

  if (args.local_uri !== undefined) updates.localUri = args.local_uri;
  if (args.asset_id !== undefined) updates.assetId = args.asset_id;
  if (args.mime !== undefined) updates.mime = args.mime;
  if (args.set_id !== undefined) updates.setId = args.set_id;
  if (args.workout_id !== undefined) updates.workoutId = args.workout_id;
  if (args.note !== undefined) updates.note = args.note;
  if (args.created_at !== undefined) updates.createdAt = args.created_at;
  if (args.original_filename !== undefined) updates.originalFilename = args.original_filename;
  if (args.media_created_at !== undefined) updates.mediaCreatedAt = args.media_created_at;
  if (args.duration_ms !== undefined) updates.durationMs = args.duration_ms;
  if (args.album_name !== undefined) updates.albumName = args.album_name;

  if (Object.keys(updates).length === 0) return;

  await db.update(media).set(updates).where(eq(media.id, mediaId)).run();
}
