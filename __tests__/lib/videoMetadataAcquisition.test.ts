jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

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
  getAlbumsAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  getAlbumAsync: jest.fn(),
  getAssetContentUriAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

import {
  acquireSelectedVideoMetadata,
  persistVideoForSetLink,
  resolveVideoLibraryReference,
} from "../../lib/utils/videoStorage";

const file = jest.requireMock("expo-file-system/legacy") as Record<string, jest.Mock>;
const library = jest.requireMock("expo-media-library/legacy") as Record<string, jest.Mock>;

const asset = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  filename: `fixture-${id}.mp4`,
  uri: `file:///storage/${id}.mp4`,
  mediaType: "video",
  width: 320,
  height: 180,
  creationTime: 0,
  modificationTime: 0,
  duration: 2,
  albumId: "downloads",
  ...overrides,
});

const page = (assets: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  assets,
  hasNextPage,
  endCursor,
});

describe("gallery metadata acquisition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    library.getPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    library.getAlbumsAsync.mockResolvedValue([{ id: "downloads", title: "Download" }]);
    library.getAssetContentUriAsync.mockImplementation(async (id: string) => `content://media/${id}`);
    library.getAssetInfoAsync.mockImplementation(async (id: string) => asset(id));
    library.getAssetsAsync.mockResolvedValue(page([]));
    file.getInfoAsync.mockImplementation(async (uri: string, options?: { md5?: boolean }) => {
      if (uri.endsWith("/set-videos/")) return { exists: true, uri, size: 0, isDirectory: true };
      const id = uri.split("/").pop() ?? "selected";
      return {
        exists: true,
        uri,
        size: 5_000,
        isDirectory: false,
        modificationTime: 0,
        ...(options?.md5 ? { md5: id === "B" ? "digest-b" : "digest-a" } : {}),
      };
    });
    file.copyAsync.mockResolvedValue(undefined);
    file.makeDirectoryAsync.mockResolvedValue(undefined);
  });

  it("maps the observed null-ID A/B selection by content and treats creation time zero as missing", async () => {
    library.getAssetsAsync.mockResolvedValue(page([
      asset("A", { filename: "PRE001H_5554_20260921_0700_A.mp4" }),
      asset("B", { filename: "PRE001H_5554_20260921_0700_B.mp4" }),
    ]));
    library.getAssetInfoAsync.mockImplementation(async (id: string) =>
      asset(id, { filename: `PRE001H_5554_20260921_0700_${id}.mp4` })
    );

    await expect(acquireSelectedVideoMetadata({
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_069,
    })).resolves.toEqual({
      status: "resolved",
      method: "unique_content_match",
      metadata: {
        assetId: "A",
        originalFilename: "PRE001H_5554_20260921_0700_A.mp4",
        mediaCreatedAt: null,
        durationMs: 2_000,
        albumName: "Download",
      },
    });
    expect(library.getAssetContentUriAsync).toHaveBeenCalledTimes(2);
  });

  it("rejects a contradictory picker ID and resolves the selected bytes instead", async () => {
    library.getAssetInfoAsync.mockImplementation(async (id: string) =>
      asset(id, id === "wrong" ? { width: 640, height: 480, duration: 9 } : {})
    );
    library.getAssetsAsync.mockResolvedValue(page([asset("A")]));

    const result = await acquireSelectedVideoMetadata({
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: "wrong",
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_000,
    });

    expect(result).toMatchObject({ status: "resolved", method: "unique_content_match", metadata: { assetId: "A" } });
  });

  it.each([
    ["denied permission", { granted: false, accessPrivileges: "none" }, "permission_denied"],
    ["limited permission with no visible match", { granted: true, accessPrivileges: "limited" }, "no_match"],
  ])("fails closed for %s", async (_label, permission, reason) => {
    library.getPermissionsAsync.mockResolvedValue(permission);
    await expect(acquireSelectedVideoMetadata({
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_000,
    })).resolves.toMatchObject({ status: "unresolved", reason });
    expect(library.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("returns unresolved for incomplete pages, repeated cursors, and the scan ceiling", async () => {
    library.getAssetsAsync.mockResolvedValueOnce(page([], true, "cursor"));
    const args = {
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_000,
    };
    await expect(acquireSelectedVideoMetadata(args)).resolves.toMatchObject({ reason: "scan_limit" });

    library.getAssetsAsync
      .mockReset()
      .mockResolvedValueOnce(page([asset("x", { width: 1 })], true, "same"))
      .mockResolvedValueOnce(page([asset("y", { width: 1 })], true, "same"));
    await expect(acquireSelectedVideoMetadata(args)).resolves.toMatchObject({ reason: "scan_limit" });

    library.getAssetsAsync.mockReset().mockResolvedValue(
      page(Array.from({ length: 1500 }, (_, index) => asset(String(index), { width: 1 })), true, "more")
    );
    await expect(acquireSelectedVideoMetadata(args)).resolves.toMatchObject({ reason: "scan_limit" });
  });

  it("refuses more than eight plausible candidates before hashing", async () => {
    library.getAssetsAsync.mockResolvedValue(page(Array.from({ length: 9 }, (_, index) => asset(String(index)))));
    await expect(acquireSelectedVideoMetadata({
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_000,
    })).resolves.toMatchObject({ reason: "candidate_limit" });
    expect(library.getAssetContentUriAsync).not.toHaveBeenCalled();
  });

  it("returns ambiguous after hashing every plausible candidate with identical content", async () => {
    library.getAssetsAsync.mockResolvedValue(page([asset("A"), asset("A-copy")]));
    file.getInfoAsync.mockImplementation(async (uri: string, options?: { md5?: boolean }) => ({
      exists: true,
      uri,
      size: 5_000,
      isDirectory: false,
      modificationTime: 0,
      ...(options?.md5 ? { md5: "same-digest" } : {}),
    }));

    await expect(acquireSelectedVideoMetadata({
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_000,
    })).resolves.toMatchObject({ status: "unresolved", reason: "ambiguous" });
    expect(library.getAssetContentUriAsync).toHaveBeenCalledTimes(2);
  });

  it("keeps candidates with unavailable dimensions and duration in the uniqueness check", async () => {
    library.getAssetsAsync.mockResolvedValue(page([
      asset("A"),
      asset("A-copy", { width: 0, height: 0, duration: 0 }),
    ]));
    file.getInfoAsync.mockImplementation(async (uri: string, options?: { md5?: boolean }) => ({
      exists: true,
      uri,
      size: 5_000,
      isDirectory: false,
      modificationTime: 0,
      ...(options?.md5 ? { md5: "same-digest" } : {}),
    }));

    await expect(acquireSelectedVideoMetadata({
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_000,
    })).resolves.toMatchObject({ status: "unresolved", reason: "ambiguous" });
    expect(library.getAssetContentUriAsync).toHaveBeenCalledTimes(2);
  });

  it("checks selected and candidate size before hashing", async () => {
    const args = {
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 65 * 1024 * 1024,
    };
    await expect(acquireSelectedVideoMetadata(args)).resolves.toMatchObject({ reason: "selected_file_too_large" });

    library.getAssetsAsync.mockResolvedValue(page([asset("A")]));
    file.getInfoAsync.mockImplementation(async (uri: string, options?: { md5?: boolean }) => ({
      exists: true,
      uri,
      size: uri.startsWith("content:") ? 65 * 1024 * 1024 : 5_000,
      isDirectory: false,
      modificationTime: 0,
      ...(options?.md5 ? { md5: "digest-a" } : {}),
    }));
    await expect(acquireSelectedVideoMetadata({ ...args, pickerFileSize: 5_000 })).resolves.toMatchObject({ reason: "candidate_file_too_large" });

    file.getInfoAsync.mockImplementation(async (uri: string, options?: { md5?: boolean }) => ({
      exists: true,
      uri,
      size: uri.startsWith("content:") ? Number.NaN : 5_000,
      isDirectory: false,
      modificationTime: 0,
      ...(options?.md5 ? { md5: "digest-a" } : {}),
    }));
    await expect(acquireSelectedVideoMetadata({ ...args, pickerFileSize: 5_000 })).resolves.toMatchObject({ reason: "asset_unreadable" });
  });

  it("fails closed on candidate read and digest failures", async () => {
    const args = {
      durableLocalUri: "file:///app/documents/set-videos/selected-A",
      pickerAssetId: null,
      pickerDurationMs: 2_000,
      pickerWidth: 320,
      pickerHeight: 180,
      pickerFileSize: 5_000,
    };
    library.getAssetsAsync.mockResolvedValue(page([asset("A")]));
    library.getAssetContentUriAsync.mockRejectedValueOnce(new Error("unreadable"));
    await expect(acquireSelectedVideoMetadata(args)).resolves.toMatchObject({ reason: "asset_unreadable" });

    file.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: true,
      uri,
      size: 5_000,
      isDirectory: false,
      modificationTime: 0,
    }));
    await expect(acquireSelectedVideoMetadata(args)).resolves.toMatchObject({ reason: "hash_unavailable" });
  });

  it("keeps the durable attachment with null canonical fields when optional enrichment fails", async () => {
    library.getPermissionsAsync.mockRejectedValueOnce(new Error("permission changed"));
    const result = await persistVideoForSetLink({
      sourceUri: "content://picker/50",
      assetId: null,
      filenameHint: "50.mp4",
      durationMs: 2_000,
      saveToLibrary: false,
      gallerySelection: { width: 320, height: 180, fileSize: 5_069 },
    });

    expect(file.copyAsync).toHaveBeenCalled();
    expect(result).toMatchObject({
      assetId: null,
      originalFilename: null,
      mediaCreatedAt: null,
      durationMs: 2_000,
      albumName: null,
    });
  });
});

describe("conservative gallery repair", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    library.getPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    library.getAssetContentUriAsync.mockImplementation(async (id: string) => `content://media/${id}`);
    library.getAssetInfoAsync.mockImplementation(async (id: string) => asset(id, {
      filename: "canonical.mp4",
      creationTime: 1_700_000_000_000,
      duration: 2,
    }));
  });

  it("requires unique compound metadata and does not let a stored ID break a tie", async () => {
    library.getAssetsAsync.mockResolvedValue(page([
      asset("stored", { filename: "canonical.mp4" }),
      asset("other", { filename: "canonical.mp4" }),
    ]));
    await expect(resolveVideoLibraryReference({
      assetId: "stored",
      originalFilename: "canonical.mp4",
      mediaCreatedAt: 1_700_000_000_000,
      durationMs: 2_000,
    })).resolves.toBeNull();
  });

  it("rejects a contradictory stored ID and returns the one unique canonical match", async () => {
    library.getAssetsAsync.mockResolvedValue(page([
      asset("stored", { filename: "wrong.mp4" }),
      asset("correct", { filename: "canonical.mp4" }),
    ]));
    library.getAssetInfoAsync.mockImplementation(async (id: string) =>
      asset(id, {
        filename: id === "stored" ? "wrong.mp4" : "canonical.mp4",
        creationTime: 1_700_000_000_000,
        duration: 2,
      })
    );

    await expect(resolveVideoLibraryReference({
      assetId: "stored",
      originalFilename: "canonical.mp4",
      mediaCreatedAt: 1_700_000_000_000,
      durationMs: 2_000,
      albumName: "Hint only",
    })).resolves.toMatchObject({
      assetId: "correct",
      localUri: null,
      uri: "content://media/correct",
      source: "library_search",
    });
    expect(library.getAlbumAsync).not.toHaveBeenCalled();
  });

  it("rejects weak metadata, creation time zero, incomplete scans, and unreadable candidates", async () => {
    await expect(resolveVideoLibraryReference({
      assetId: "stored",
      originalFilename: "canonical.mp4",
      mediaCreatedAt: 0,
      durationMs: null,
    })).resolves.toBeNull();
    expect(library.getAssetsAsync).not.toHaveBeenCalled();

    library.getAssetsAsync.mockResolvedValueOnce(page([], true, null));
    await expect(resolveVideoLibraryReference({
      originalFilename: "canonical.mp4",
      durationMs: 2_000,
    })).resolves.toBeNull();

    library.getAssetsAsync.mockResolvedValueOnce(page([asset("broken", { filename: "canonical.mp4" })]));
    library.getAssetInfoAsync.mockRejectedValueOnce(new Error("unreadable"));
    await expect(resolveVideoLibraryReference({
      originalFilename: "canonical.mp4",
      durationMs: 2_000,
    })).resolves.toBeNull();
  });
});
