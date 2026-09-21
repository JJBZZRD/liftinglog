import {
  persistVideoForSetLink,
  resolveVideoLibraryReference,
} from "../../lib/utils/videoStorage";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/documents/",
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

jest.mock("expo-media-library/legacy", () => ({
  MediaType: { video: "video" },
  SortBy: { creationTime: "creationTime" },
  createAlbumAsync: jest.fn(),
  createAssetAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  getAlbumAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const file = jest.requireMock("expo-file-system/legacy") as Record<string, jest.Mock>;
const library = jest.requireMock("expo-media-library/legacy") as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  file.getInfoAsync.mockImplementation(async (uri: string) => ({ exists: uri.endsWith("/set-videos/") }));
  file.makeDirectoryAsync.mockResolvedValue(undefined);
  file.copyAsync.mockResolvedValue(undefined);
  library.getAssetInfoAsync.mockResolvedValue({
    filename: "lift.mp4",
    creationTime: 1_700_000_000_000,
    duration: 12.4,
    localUri: "file:///gallery/lift.mp4",
    uri: "content://gallery/lift",
  });
  library.getAlbumAsync.mockResolvedValue({ id: "album", title: "LiftingLog" });
});

describe("set detail video storage characterization", () => {
  it("keeps a durable app copy and treats incoming picker duration as milliseconds", async () => {
    const result = await persistVideoForSetLink({
      sourceUri: "content://picker/video",
      assetId: "asset-1",
      filenameHint: "picked.mov",
      mediaCreatedAt: 1_700_000_001_000,
      durationMs: 8_500,
      albumName: "LiftingLog",
      saveToLibrary: false,
    });

    expect(file.copyAsync).toHaveBeenCalledWith(expect.objectContaining({ from: "content://picker/video" }));
    expect(result).toMatchObject({
      assetId: "asset-1",
      originalFilename: "lift.mp4",
      mediaCreatedAt: 1_700_000_000_000,
      durationMs: 12_400,
      albumName: "LiftingLog",
    });
  });

  it("returns null when the managed copy cannot be created", async () => {
    file.copyAsync.mockRejectedValueOnce(new Error("copy unavailable"));
    await expect(persistVideoForSetLink({ sourceUri: "content://picker/video" })).resolves.toBeNull();
  });

  it("uses metadata rediscovery and safely returns null when no gallery match exists", async () => {
    library.getAssetsAsync.mockResolvedValue({ assets: [], endCursor: null, hasNextPage: false });
    await expect(resolveVideoLibraryReference({
      originalFilename: "missing.mp4",
      mediaCreatedAt: 1_700_000_000_000,
      durationMs: 10_000,
      albumName: "LiftingLog",
    })).resolves.toBeNull();
    expect(library.getAssetsAsync).toHaveBeenCalled();
  });
});
