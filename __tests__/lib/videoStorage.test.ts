const copyAsync = jest.fn();
const deleteAsync = jest.fn();
const getInfoAsync = jest.fn();
const makeDirectoryAsync = jest.fn();

const createAlbumAsync = jest.fn();
const createAssetAsync = jest.fn();
const getAlbumAsync = jest.fn();
const getAssetInfoAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/documents/",
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
}));

jest.mock("expo-media-library", () => ({
  createAlbumAsync,
  createAssetAsync,
  getAlbumAsync,
  getAssetInfoAsync,
}));

import { persistVideoForSetLink } from "../../lib/utils/videoStorage";

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
    getAssetInfoAsync.mockResolvedValue({
      filename: "lift.mp4",
      creationTime: 1700000000000,
      duration: 12.4,
      localUri: "file:///media/lift.mp4",
      uri: "content://media/lift",
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
