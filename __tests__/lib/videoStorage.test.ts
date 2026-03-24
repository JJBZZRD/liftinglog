const copyAsync = jest.fn();
const deleteAsync = jest.fn();
const getInfoAsync = jest.fn();
const makeDirectoryAsync = jest.fn();

const createAlbumAsync = jest.fn();
const createAssetAsync = jest.fn();
const getAssetsAsync = jest.fn();
const getAlbumAsync = jest.fn();
const getAssetInfoAsync = jest.fn();
const getPermissionsAsync = jest.fn();
const requestPermissionsAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/documents/",
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
}));

jest.mock("expo-media-library", () => ({
  AssetsOptions: {},
  MediaType: { video: "video" },
  SortBy: { creationTime: "creationTime" },
  createAlbumAsync,
  createAssetAsync,
  getAssetsAsync,
  getAlbumAsync,
  getAssetInfoAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
}));

import {
  ensureVideoLibraryPermission,
  persistVideoForSetLink,
  resolveVideoLibraryReference,
} from "../../lib/utils/videoStorage";

describe("persistVideoForSetLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri.endsWith("/set-videos/"),
    }));
    makeDirectoryAsync.mockResolvedValue(undefined);
    copyAsync.mockResolvedValue(undefined);
    getAlbumAsync.mockResolvedValue(null);
    createAssetAsync.mockResolvedValue({ id: "created-asset" });
    createAlbumAsync.mockResolvedValue({ id: "created-album" });
    getAssetsAsync.mockResolvedValue({
      assets: [],
      endCursor: null,
      hasNextPage: false,
    });
    getAssetInfoAsync.mockResolvedValue({
      filename: "lift.mp4",
      creationTime: 1700000000000,
      duration: 12.4,
      localUri: "file:///media/lift.mp4",
      uri: "content://media/lift",
    });
    getPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
    requestPermissionsAsync.mockResolvedValue({
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

    expect(copyAsync).toHaveBeenCalledWith(
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
    expect(createAssetAsync).toHaveBeenCalledWith(result?.localUri);
    expect(createAssetAsync).not.toHaveBeenCalledWith("content://picker/video/2");
    expect(createAlbumAsync).toHaveBeenCalled();
    expect(result?.assetId).toBe("created-asset");
  });

  it("keeps the durable app copy even when MediaLibrary asset creation fails", async () => {
    createAssetAsync.mockRejectedValueOnce(new Error("write failed"));

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
    getPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
    requestPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
    getAlbumAsync.mockResolvedValue({ id: "album-1", title: "LiftingLog" });
    getAssetInfoAsync.mockImplementation(async (assetId: string) => ({
      filename: assetId === "album-match" ? "set-001.mp4" : "set-002.mp4",
      creationTime: 1700000000000,
      duration: assetId === "album-match" ? 12.5 : 8,
      localUri: `file:///media/${assetId}.mp4`,
      uri: `content://media/${assetId}`,
    }));
  });

  it("searches the LiftingLog album first when re-discovering imported videos", async () => {
    getAssetsAsync
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

    expect(getAlbumAsync).toHaveBeenCalledWith("LiftingLog");
    expect(getAssetsAsync).toHaveBeenCalledTimes(1);
    expect(result?.assetId).toBe("album-match");
    expect(result?.source).toBe("album_search");
  });

  it("falls back to a gallery-wide search when the album does not contain the video", async () => {
    getAssetsAsync
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

    expect(getAssetsAsync).toHaveBeenCalledTimes(2);
    expect(result?.assetId).toBe("library-match");
    expect(result?.source).toBe("library_search");
  });
});

describe("ensureVideoLibraryPermission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests permission when video library access is not already granted", async () => {
    getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      accessPrivileges: "none",
    });
    requestPermissionsAsync.mockResolvedValueOnce({
      granted: true,
      accessPrivileges: "all",
    });

    await expect(ensureVideoLibraryPermission()).resolves.toBe(true);
    expect(requestPermissionsAsync).toHaveBeenCalled();
  });
});
