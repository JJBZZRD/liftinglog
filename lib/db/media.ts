import { eq, inArray } from "drizzle-orm";
import { db } from "./connection";
import { media, type MediaRow } from "./schema";

export type Media = MediaRow;

export async function addMedia(args: {
  local_uri: string;
  asset_id?: string | null;
  mime?: string | null;
  set_id?: number | null;
  workout_id?: number | null;
  note?: string | null;
  created_at?: number | null;
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
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function listMediaForSet(setId: number): Promise<Media[]> {
  return await db.select().from(media).where(eq(media.setId, setId));
}

export async function listMediaForSetIds(setIds: number[]): Promise<Media[]> {
  if (setIds.length === 0) return [];
  return await db.select().from(media).where(inArray(media.setId, setIds));
}
