jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/documents/",
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

jest.mock("expo-media-library/legacy", () => ({
  AssetsOptions: {},
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

import {
  ensureVideoLibraryPermission,
  persistVideoForSetLink,
  resolveVideoLibraryReference,
} from "../../lib/utils/videoStorage";

const {
  copyAsync: mockCopyAsync,
  getInfoAsync: mockGetInfoAsync,
  makeDirectoryAsync: mockMakeDirectoryAsync,
} = jest.requireMock("expo-file-system/legacy") as Record<string, jest.Mock>;

const {
  createAlbumAsync: mockCreateAlbumAsync,
  createAssetAsync: mockCreateAssetAsync,
  getAssetsAsync: mockGetAssetsAsync,
  getAlbumAsync: mockGetAlbumAsync,
  getAssetInfoAsync: mockGetAssetInfoAsync,
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
} = jest.requireMock("expo-media-library/legacy") as Record<string, jest.Mock>;

describe("persistVideoForSetLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri.endsWith("/set-videos/"),
    }));
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockCopyAsync.mockResolvedValue(undefined);
    mockGetAlbumAsync.mockResolvedValue(null);
    mockCreateAssetAsync.mockResolvedValue({ id: "created-asset" });
    mockCreateAlbumAsync.mockResolvedValue({ id: "created-album" });
    mockGetAssetsAsync.mockResolvedValue({
      assets: [],
      endCursor: null,
      hasNextPage: false,
    });
    mockGetAssetInfoAsync.mockResolvedValue({
      filename: "lift.mp4",
      creationTime: 1700000000000,
      duration: 12.4,
      localUri: "file:///media/lift.mp4",
      uri: "content://media/lift",
    });
    mockGetPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
    mockRequestPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
  });

  it("copies picked content URIs into app storage before persisting the link", async () => {
    const result = await persistVideoForSetLink({
      sourceUri: "content://picker/video/1",
      assetId: "existing-asset",
      filenameHint: "picker-video.mp4",
      saveToLibrary: false,
    });

    expect(mockCopyAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "content://picker/video/1",
        to: expect.stringMatching(/^file:\/\/\/app\/documents\/set-videos\//),
      })
    );
    expect(result).not.toBeNull();
    expect(result?.localUri).toMatch(/^file:\/\/\/app\/documents\/set-videos\//);
    expect(result?.assetId).toBe("existing-asset");
    expect(result?.originalFilename).toBe("picker-video.mp4");
  });

  it("creates MediaLibrary assets from the managed file copy instead of the original content URI", async () => {
    const result = await persistVideoForSetLink({
      sourceUri: "content://picker/video/2",
      filenameHint: "set-video.mp4",
      albumName: "LiftingLog",
      saveToLibrary: true,
    });

    expect(result).not.toBeNull();
    expect(mockCreateAssetAsync).toHaveBeenCalledWith(result?.localUri);
    expect(mockCreateAssetAsync).not.toHaveBeenCalledWith("content://picker/video/2");
    expect(mockCreateAlbumAsync).toHaveBeenCalled();
    expect(result?.assetId).toBe("created-asset");
  });

  it("keeps the durable app copy even when MediaLibrary asset creation fails", async () => {
    mockCreateAssetAsync.mockRejectedValueOnce(new Error("write failed"));

    const result = await persistVideoForSetLink({
      sourceUri: "file:///cache/recording.mp4",
      filenameHint: "recording.mp4",
      albumName: "LiftingLog",
      saveToLibrary: true,
    });

    expect(result).not.toBeNull();
    expect(result?.localUri).toMatch(/^file:\/\/\/app\/documents\/set-videos\//);
    expect(result?.assetId).toBeNull();
  });
});

describe("resolveVideoLibraryReference", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
    mockRequestPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
    mockGetAlbumAsync.mockResolvedValue({ id: "album-1", title: "LiftingLog" });
    mockGetAssetInfoAsync.mockImplementation(async (assetId: string) => ({
      filename: assetId === "album-match" ? "set-001.mp4" : "set-002.mp4",
      creationTime: 1700000000000,
      duration: assetId === "album-match" ? 12.5 : 8,
      localUri: `file:///media/${assetId}.mp4`,
      uri: `content://media/${assetId}`,
    }));
  });

  it("searches the LiftingLog album first when re-discovering imported videos", async () => {
    mockGetAssetsAsync
      .mockResolvedValueOnce({
        assets: [
          {
            id: "album-match",
            filename: "set-001.mp4",
            creationTime: 1700000000000,
          },
        ],
        endCursor: null,
        hasNextPage: false,
      });

    const result = await resolveVideoLibraryReference({
      originalFilename: "set-001.mp4",
      mediaCreatedAt: 1700000000000,
      durationMs: 12500,
      albumName: null,
    });

    expect(mockGetAlbumAsync).toHaveBeenCalledWith("LiftingLog");
    expect(mockGetAssetsAsync).toHaveBeenCalledTimes(1);
    expect(result?.assetId).toBe("album-match");
    expect(result?.source).toBe("album_search");
  });

  it("falls back to a gallery-wide search when the album does not contain the video", async () => {
    mockGetAssetsAsync
      .mockResolvedValueOnce({
        assets: [],
        endCursor: null,
        hasNextPage: false,
      })
      .mockResolvedValueOnce({
        assets: [
          {
            id: "library-match",
            filename: "outside-folder.mp4",
            creationTime: 1700000000500,
          },
        ],
        endCursor: null,
        hasNextPage: false,
      });

    const result = await resolveVideoLibraryReference({
      originalFilename: "outside-folder.mp4",
      mediaCreatedAt: 1700000000000,
      durationMs: 8000,
      albumName: "LiftingLog",
    });

    expect(mockGetAssetsAsync).toHaveBeenCalledTimes(2);
    expect(result?.assetId).toBe("library-match");
    expect(result?.source).toBe("library_search");
  });
});

describe("ensureVideoLibraryPermission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests permission when video library access is not already granted", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      accessPrivileges: "none",
    });
    mockRequestPermissionsAsync.mockResolvedValueOnce({
      granted: true,
      accessPrivileges: "all",
    });

    await expect(ensureVideoLibraryPermission()).resolves.toBe(true);
    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
  });
});
