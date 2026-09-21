import { createSetVideoDatabase } from "../helpers/setVideoDatabase";

const mockDatabase = createSetVideoDatabase();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => mockDatabase.expoDatabase,
  addDatabaseChangeListener: () => ({ remove: jest.fn() }),
}));

const media = require("../../lib/db/media") as typeof import("../../lib/db/media");

const video = (overrides: Partial<Parameters<typeof media.upsertVideoForSet>[1]> = {}) => ({
  localUri: "file:///app/set-videos/current.mp4",
  assetId: "asset-current",
  mime: "video/mp4",
  originalFilename: "current.mp4",
  mediaCreatedAt: 1_700_000_000_000,
  durationMs: 12_500,
  albumName: "LiftingLog",
  ...overrides,
});

describe("one user-facing video per set contract", () => {
  afterAll(() => mockDatabase.close());

  it("inserts the first video and then replaces the deterministic winner in place", async () => {
    const setId = mockDatabase.insertSet();
    const firstId = await media.upsertVideoForSet(setId, video());
    const replacementId = await media.upsertVideoForSet(setId, video({
      localUri: "file:///app/set-videos/replacement.mov",
      assetId: "asset-replacement",
      mime: "video/quicktime",
      originalFilename: "replacement.mov",
      mediaCreatedAt: 1_800_000_000_000,
      durationMs: 8_000,
      albumName: null,
    }));

    expect(replacementId).toBe(firstId);
    expect(mockDatabase.rows<{ id: number }>("SELECT id FROM media WHERE set_id = ?", setId)).toEqual([{ id: firstId }]);
    expect(await media.getLatestMediaForSet(setId)).toEqual(expect.objectContaining({
      id: firstId,
      localUri: "file:///app/set-videos/replacement.mov",
      assetId: "asset-replacement",
      mime: "video/quicktime",
      originalFilename: "replacement.mov",
      durationMs: 8_000,
    }));
  });

  it("keeps the winning row identity and clears nullable replacement metadata", async () => {
    const setId = mockDatabase.insertSet();
    const id = await media.upsertVideoForSet(setId, video({
      assetId: "asset-old",
      originalFilename: "old.mp4",
      mediaCreatedAt: 1_700_000_000_000,
      durationMs: 10_000,
      albumName: "LiftingLog",
    }));
    const [{ workout_id: workoutId }] = mockDatabase.rows<{ workout_id: number }>(
      "SELECT workout_id FROM sets WHERE id = ?",
      setId
    );
    mockDatabase.expoDatabase.runSync(
      "UPDATE media SET note = ?, workout_id = ?, created_at = ? WHERE id = ?",
      ["keep note", workoutId, 123, id]
    );

    await media.upsertVideoForSet(setId, video({
      assetId: null,
      mime: null,
      originalFilename: null,
      mediaCreatedAt: null,
      durationMs: null,
      albumName: null,
    }));

    expect(mockDatabase.rows<Record<string, unknown>>(
      "SELECT id, set_id, note, workout_id, created_at, asset_id, mime, original_filename, media_created_at, duration_ms, album_name FROM media WHERE id = ?",
      id
    )).toEqual([{
      id,
      set_id: setId,
      note: "keep note",
      workout_id: workoutId,
      created_at: 123,
      asset_id: null,
      mime: null,
      original_filename: null,
      media_created_at: null,
      duration_ms: null,
      album_name: null,
    }]);
  });

  it("uses created_at then id for legacy winners and leaves older rows available", async () => {
    const setId = mockDatabase.insertSet();
    mockDatabase.expoDatabase.runSync(
      "INSERT INTO media (local_uri, set_id, created_at) VALUES (?, ?, ?)",
      ["file:///legacy-one.mp4", setId, 100]
    );
    const tiedWinner = mockDatabase.expoDatabase.runSync(
      "INSERT INTO media (local_uri, set_id, created_at) VALUES (?, ?, ?)",
      ["file:///legacy-two.mp4", setId, 100]
    ).lastInsertRowId;
    const nullTimestamp = mockDatabase.expoDatabase.runSync(
      "INSERT INTO media (local_uri, set_id, created_at) VALUES (?, ?, NULL)",
      ["file:///legacy-null.mp4", setId]
    ).lastInsertRowId;

    await expect(media.upsertVideoForSet(setId, video())).resolves.toBe(tiedWinner);
    expect(mockDatabase.rows<{ id: number; local_uri: string }>(
      "SELECT id, local_uri FROM media WHERE set_id = ? ORDER BY id",
      setId
    )).toEqual([
      expect.objectContaining({ local_uri: "file:///legacy-one.mp4" }),
      expect.objectContaining({ id: tiedWinner, local_uri: "file:///app/set-videos/current.mp4" }),
      expect.objectContaining({ id: nullTimestamp, local_uri: "file:///legacy-null.mp4" }),
    ]);
    expect((await media.listMediaForSet(setId)).map((row) => row.id)).toHaveLength(3);
  });

  it("uses the highest id when legacy rows all have null timestamps", async () => {
    const setId = mockDatabase.insertSet();
    mockDatabase.expoDatabase.runSync(
      "INSERT INTO media (local_uri, set_id, created_at) VALUES (?, ?, NULL)",
      ["file:///null-one.mp4", setId]
    );
    const winner = mockDatabase.expoDatabase.runSync(
      "INSERT INTO media (local_uri, set_id, created_at) VALUES (?, ?, NULL)",
      ["file:///null-two.mp4", setId]
    ).lastInsertRowId;

    await expect(media.upsertVideoForSet(setId, video())).resolves.toBe(winner);
  });

  it("rejects invalid or missing sets without mutating media", async () => {
    const setId = mockDatabase.insertSet();
    const before = mockDatabase.rows<{ id: number }>("SELECT id FROM media");

    await expect(media.upsertVideoForSet(0, video())).rejects.toThrow("valid set ID");
    await expect(media.upsertVideoForSet(setId, video({ localUri: "   " }))).rejects.toThrow("non-empty local video URI");
    await expect(media.upsertVideoForSet(999_999, video())).rejects.toThrow("missing set");

    expect(mockDatabase.rows<{ id: number }>("SELECT id FROM media")).toEqual(before);
  });

  it("rolls back an after-update failure and does not touch another set's media", async () => {
    const protectedSetId = mockDatabase.insertSet();
    const unrelatedSetId = mockDatabase.insertSet();
    const protectedId = await media.upsertVideoForSet(protectedSetId, video({ localUri: "file:///protected.mp4" }));
    const unrelatedId = await media.upsertVideoForSet(unrelatedSetId, video({ localUri: "file:///unrelated.mp4" }));
    mockDatabase.exec("CREATE TRIGGER fail_video_update AFTER UPDATE OF local_uri ON media WHEN NEW.local_uri = 'file:///fail.mp4' BEGIN SELECT RAISE(FAIL, 'forced replacement failure'); END");

    await expect(media.upsertVideoForSet(protectedSetId, video({ localUri: "file:///fail.mp4" }))).rejects.toThrow("forced replacement failure");

    expect(mockDatabase.rows<{ id: number; local_uri: string }>(
      "SELECT id, local_uri FROM media WHERE id IN (?, ?) ORDER BY id",
      protectedId,
      unrelatedId
    )).toEqual([
      { id: protectedId, local_uri: "file:///protected.mp4" },
      { id: unrelatedId, local_uri: "file:///unrelated.mp4" },
    ]);
  });

  it("rolls back a failed first insert and recovers with a later valid save", async () => {
    const setId = mockDatabase.insertSet();
    mockDatabase.exec("CREATE TRIGGER fail_video_insert AFTER INSERT ON media WHEN NEW.local_uri = 'file:///fail-insert.mp4' BEGIN SELECT RAISE(FAIL, 'forced insert failure'); END");

    await expect(media.upsertVideoForSet(setId, video({ localUri: "file:///fail-insert.mp4" }))).rejects.toThrow("forced insert failure");
    expect(mockDatabase.rows<{ id: number }>("SELECT id FROM media WHERE set_id = ?", setId)).toEqual([]);

    await expect(media.upsertVideoForSet(setId, video({ localUri: "file:///recovered.mp4" }))).resolves.toEqual(expect.any(Number));
    expect(mockDatabase.rows<{ local_uri: string }>("SELECT local_uri FROM media WHERE set_id = ?", setId)).toEqual([
      { local_uri: "file:///recovered.mp4" },
    ]);
  });

  it("keeps one row for same-connection calls through synchronous JavaScript serialization", async () => {
    const setId = mockDatabase.insertSet();
    const [firstId, secondId] = await Promise.all([
      media.upsertVideoForSet(setId, video({ localUri: "file:///first.mp4" })),
      media.upsertVideoForSet(setId, video({ localUri: "file:///second.mp4" })),
    ]);

    expect(firstId).toBe(secondId);
    expect(mockDatabase.rows<{ id: number; local_uri: string }>(
      "SELECT id, local_uri FROM media WHERE set_id = ?",
      setId
    )).toEqual([{ id: firstId, local_uri: "file:///second.mp4" }]);
  });
});
