import { addMedia, getLatestMediaForSet, listMediaForSet, unlinkMediaForSet, updateMedia } from "../../lib/db/media";
import { mediaFixture } from "../helpers/setDetailCharacterization";

const rowsByCall: unknown[][] = [];
const run = jest.fn(async () => undefined);
jest.mock("../../lib/db/schema", () => ({ media: { id: "id", setId: "setId", createdAt: "createdAt" } }));
jest.mock("drizzle-orm", () => ({ desc: jest.fn((value) => value), eq: jest.fn((a, b) => [a, b]), inArray: jest.fn() }));
jest.mock("../../lib/db/connection", () => ({ db: {
  insert: jest.fn(() => ({ values: jest.fn((value: unknown) => ({ run: jest.fn(async () => ({ lastInsertRowId: 9, value })) })) })),
  update: jest.fn(() => ({ set: jest.fn((value: unknown) => ({ where: jest.fn(() => ({ run: jest.fn(async () => ({ value })) })) })) })),
  select: jest.fn(),
  delete: jest.fn(),
} }));
const mockDb = jest.requireMock("../../lib/db/connection").db as Record<string, jest.Mock>;

describe("set media persistence characterization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rowsByCall.length = 0;
    mockDb.select.mockImplementation(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ orderBy: jest.fn(() => ({ limit: jest.fn(async () => rowsByCall.shift() ?? []) })) })) })) }));
    mockDb.delete.mockImplementation(() => ({ where: jest.fn(() => ({ run })) }));
  });

  it("persists and updates note and replacement metadata through the real media functions", async () => {
    await addMedia({ local_uri: "file:///new.mp4", set_id: 42, note: "form check", asset_id: "asset-new", original_filename: "new.mp4", duration_ms: 12_000 });
    expect(mockDb.insert).toHaveBeenCalled();
    const insertValues = mockDb.insert.mock.results[0].value.values;
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ localUri: "file:///new.mp4", setId: 42, note: "form check", assetId: "asset-new", durationMs: 12_000 }));
    await updateMedia(9, { note: null, local_uri: "file:///replacement.mp4", asset_id: "asset-replacement", original_filename: null, duration_ms: 15_000 });
    expect(mockDb.update).toHaveBeenCalled();
    const updateSet = mockDb.update.mock.results[0].value.set;
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ localUri: "file:///replacement.mp4", assetId: "asset-replacement", originalFilename: null, note: null, durationMs: 15_000 }));
    expect(mockDb.update.mock.results[0].value.set.mock.results[0].value.where).toHaveBeenCalledWith(["id", 9]);
  });

  it("selects the latest row boundary used by SetInfo and retains legacy rows for list callers", async () => {
    const newest = mediaFixture({ id: 4, createdAt: 200, localUri: "file:///new.mp4" });
    rowsByCall.push([newest]);
    await expect(getLatestMediaForSet(42)).resolves.toEqual(newest);
    const drizzle = jest.requireMock("drizzle-orm") as { desc: jest.Mock; eq: jest.Mock };
    expect(drizzle.desc).toHaveBeenCalledWith("createdAt");
    expect(drizzle.desc).toHaveBeenCalledWith("id");
    const latestSelect = mockDb.select.mock.results[0].value;
    const latestWhere = latestSelect.from.mock.results[0].value.where;
    expect(latestWhere).toHaveBeenCalledWith(["setId", 42]);
    const latestOrder = latestWhere.mock.results[0].value.orderBy;
    expect(latestOrder).toHaveBeenCalledWith("createdAt", "id");
    expect(latestOrder.mock.results[0].value.limit).toHaveBeenCalledWith(1);
    const legacy = [mediaFixture({ id: 1 }), mediaFixture({ id: 2, createdAt: 101 })];
    const listChain = { from: jest.fn(() => ({ where: jest.fn(async () => legacy) })) };
    mockDb.select.mockReturnValueOnce(listChain);
    await expect(listMediaForSet(42)).resolves.toEqual(legacy);
  });

  it("deletes every set-linked media relationship when unlinking", async () => {
    await unlinkMediaForSet(42);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb.delete.mock.results[0].value.where).toHaveBeenCalledWith(["setId", 42]);
    expect(run).toHaveBeenCalled();
  });
});
