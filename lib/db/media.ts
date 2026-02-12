import { desc, eq, inArray } from "drizzle-orm";
import { db } from "./connection";
import { media, type MediaRow } from "./schema";

export type Media = MediaRow;

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
