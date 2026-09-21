import { act, create } from "react-test-renderer";
import * as ImagePicker from "expo-image-picker";
import SetInfoScreen from "../../app/set/[id]";
import { addMedia, getLatestMediaForSet, listMediaForLocalUris, unlinkMediaForSet, updateMedia } from "../../lib/db/media";
import { deleteManagedVideoUri, doesFileUriExist, persistVideoForSetLink } from "../../lib/utils/videoStorage";
import { mediaFixture, pressableText } from "../helpers/setDetailCharacterization";

jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() }, useLocalSearchParams: () => ({ id: "42" }) }));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
jest.mock("expo-video", () => {
  const player = {
    loop: false,
    muted: true,
    pause: jest.fn(),
    play: jest.fn(),
    replaceAsync: jest.fn().mockResolvedValue(undefined),
  };
  return { VideoView: () => null, useVideoPlayer: jest.fn(() => player) };
});
jest.mock("expo-image-picker", () => ({ getMediaLibraryPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-media-library/legacy", () => ({ getPermissionsAsync: jest.fn(), getAssetInfoAsync: jest.fn(), getAssetsAsync: jest.fn(), getAlbumAsync: jest.fn(), MediaType: { video: "video" }, SortBy: { creationTime: "creationTime" } }));
jest.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Alert: { alert: jest.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: { background: "#fff", surface: "#fff", surfaceSecondary: "#eee", border: "#ddd", shadow: "#000", foreground: "#111", foregroundSecondary: "#333", foregroundMuted: "#777", primary: "#05f", primaryForeground: "#fff" } }) }));
jest.mock("../../lib/db/media", () => ({ addMedia: jest.fn(), getLatestMediaForSet: jest.fn(), listMediaForLocalUris: jest.fn(), unlinkMediaForSet: jest.fn(), updateMedia: jest.fn() }));
jest.mock("../../lib/utils/videoStorage", () => ({ DEFAULT_MEDIA_ALBUM_NAME: "LiftingLog", deleteManagedVideoUri: jest.fn(), doesFileUriExist: jest.fn().mockResolvedValue(true), getUriScheme: jest.fn(() => "file"), inferVideoMimeFromUri: jest.fn(() => "video/mp4"), isFileUri: jest.fn((uri: string | null) => !!uri?.startsWith("file:")), isLikelyTransientUri: jest.fn(() => false), persistVideoForSetLink: jest.fn(), persistVideoUriToAppStorage: jest.fn(), toMillis: jest.fn((value: number | null | undefined) => value ?? null) }));

const mockPlayer = (jest.requireMock("expo-video").useVideoPlayer as jest.Mock)();
const alertMock = jest.requireMock("react-native").Alert.alert as jest.Mock;
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mediaLibrary = jest.requireMock("expo-media-library/legacy") as Record<string, jest.Mock>;

function pressableContaining(renderer: ReturnType<typeof create>, text: string) {
  for (const node of renderer.root.findAllByType("Pressable")) {
    if (pressableText(node, text) === node) {
      return node as unknown as { props: { onPress: () => void } };
    }
  }
  throw new Error(`Could not find Pressable containing ${text}`);
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SetInfoScreen characterization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (addMedia as jest.Mock).mockReset();
    (getLatestMediaForSet as jest.Mock).mockReset().mockResolvedValue(null);
    (listMediaForLocalUris as jest.Mock).mockReset().mockResolvedValue([]);
    (unlinkMediaForSet as jest.Mock).mockReset();
    (updateMedia as jest.Mock).mockReset();
    (doesFileUriExist as jest.Mock).mockReset().mockResolvedValue(true);
    (deleteManagedVideoUri as jest.Mock).mockReset();
    (persistVideoForSetLink as jest.Mock).mockReset();
    picker.getMediaLibraryPermissionsAsync.mockReset();
    picker.requestMediaLibraryPermissionsAsync.mockReset();
    picker.launchImageLibraryAsync.mockReset();
    picker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] } as never);
    mediaLibrary.getPermissionsAsync.mockReset();
    mediaLibrary.getAssetInfoAsync.mockReset();
    mediaLibrary.getAlbumAsync.mockReset();
    mediaLibrary.getAssetsAsync.mockReset();
    mediaLibrary.getPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    mediaLibrary.getAlbumAsync.mockResolvedValue(null);
    mediaLibrary.getAssetsAsync.mockResolvedValue({ assets: [], endCursor: null, hasNextPage: false });
    mockPlayer.replaceAsync.mockResolvedValue(undefined);
  });

  it("does not persist a cancelled gallery selection", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); });
    const add = pressableContaining(renderer, "Add From Gallery");
    await act(async () => { add.props.onPress(); await flushAsyncWork(); });
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: false }));
    expect(persistVideoForSetLink).not.toHaveBeenCalled();
    expect(addMedia).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it("stops before opening the picker when library permission is denied", async () => {
    picker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false, accessPrivileges: "none" } as never);
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false, accessPrivileges: "none" } as never);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); });
    const add = pressableContaining(renderer, "Add From Gallery");
    await act(async () => { add.props.onPress(); await flushAsyncWork(); });
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("Permission required", expect.any(String));
    await act(async () => { renderer.unmount(); });
  });

  it("adds one selected asset and passes picker milliseconds through the existing extra conversion", async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://first", assetId: "asset-first", fileName: "picked.mov", duration: 12_500, mimeType: "video/mp4" }, { uri: "content://ignored", assetId: "ignored" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: "file:///app/set-videos/picked.mov", assetId: "asset-first", originalFilename: "picked.mov", mediaCreatedAt: 1700000000000, durationMs: 12500, albumName: "LiftingLog" });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); });
    const add = pressableContaining(renderer, "Add From Gallery");
    await act(async () => { add.props.onPress(); await flushAsyncWork(); });
    expect(persistVideoForSetLink).toHaveBeenCalledWith(expect.objectContaining({ sourceUri: "content://first", assetId: "asset-first", durationMs: 12_500_000 }));
    expect(addMedia).toHaveBeenCalledWith(expect.objectContaining({ local_uri: "file:///app/set-videos/picked.mov", set_id: 42, asset_id: "asset-first", original_filename: "picked.mov", duration_ms: 12500 }));
    await act(async () => { renderer.unmount(); });
  });

  it("cancelling a change from loaded media preserves the player and has no writes", async () => {
    const existing = mediaFixture({ id: 7 });
    (getLatestMediaForSet as jest.Mock).mockResolvedValue(existing);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flushAsyncWork(); });
    const edit = pressableContaining(renderer, "Edit");
    expect(mockPlayer.replaceAsync).toHaveBeenCalledWith(existing.localUri);
    mockPlayer.replaceAsync.mockClear();

    await act(async () => { edit.props.onPress(); });
    const videoOptions = alertMock.mock.calls.find(([title]) => title === "Video options");
    expect(videoOptions).toBeDefined();
    const actions = videoOptions?.[2] as { text: string; onPress?: () => void }[];
    const changeVideo = actions.find(({ text }) => text === "Change video");
    expect(changeVideo).toBeDefined();
    await act(async () => { changeVideo?.onPress?.(); await flushAsyncWork(); });

    expect(picker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(updateMedia).not.toHaveBeenCalled();
    expect(addMedia).not.toHaveBeenCalled();
    expect(deleteManagedVideoUri).not.toHaveBeenCalled();
    expect(mockPlayer.replaceAsync).not.toHaveBeenCalled();
    expect(pressableContaining(renderer, "Edit")).toBeDefined();
    await act(async () => { renderer.unmount(); });
  });

  it("replaces an existing media row from the loaded Edit action", async () => {
    const existing = mediaFixture({ id: 7 });
    const replacement = mediaFixture({ id: 7, localUri: "file:///app/set-videos/replacement.mp4", assetId: "asset-replacement", originalFilename: "replacement.mp4", durationMs: 15_000 });
    (getLatestMediaForSet as jest.Mock)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(replacement);
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "asset-replacement", fileName: "replacement.mp4", duration: 15_000, mimeType: "video/mp4" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: replacement.localUri, assetId: replacement.assetId, originalFilename: replacement.originalFilename, mediaCreatedAt: replacement.mediaCreatedAt, durationMs: replacement.durationMs, albumName: replacement.albumName });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flushAsyncWork(); });
    const edit = pressableContaining(renderer, "Edit");
    await act(async () => { edit.props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    const changeVideo = actions.find(({ text }) => text === "Change video");
    expect(changeVideo).toBeDefined();
    await act(async () => { changeVideo?.onPress?.(); await flushAsyncWork(); });

    expect(updateMedia).toHaveBeenCalledWith(existing.id, expect.objectContaining({ local_uri: replacement.localUri, asset_id: "asset-replacement", set_id: 42, original_filename: "replacement.mp4", duration_ms: 15_000 }));
    expect(addMedia).not.toHaveBeenCalled();
    expect(listMediaForLocalUris).toHaveBeenCalledWith([existing.localUri]);
    expect(getLatestMediaForSet).toHaveBeenCalledTimes(2);
    expect(mediaLibrary.getAssetsAsync).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it("keeps unresolved missing media metadata without deleting the attachment or set", async () => {
    (getLatestMediaForSet as jest.Mock).mockResolvedValue(mediaFixture({ id: 7, localUri: "file:///missing.mp4", assetId: "gone" }));
    (doesFileUriExist as jest.Mock).mockResolvedValue(false);
    mediaLibrary.getAssetInfoAsync.mockRejectedValue(new Error("asset no longer available"));
    mediaLibrary.getAlbumAsync.mockResolvedValue(null);
    mediaLibrary.getAssetsAsync.mockResolvedValue({ assets: [], endCursor: null, hasNextPage: false });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); });
    await act(async () => { await flushAsyncWork(); });
    expect(mediaLibrary.getAssetInfoAsync).toHaveBeenCalledWith("gone");
    expect(mediaLibrary.getAlbumAsync).toHaveBeenCalledWith("LiftingLog");
    expect(mediaLibrary.getAssetsAsync).toHaveBeenCalled();
    expect(unlinkMediaForSet).not.toHaveBeenCalled();
    expect(deleteManagedVideoUri).not.toHaveBeenCalled();
    expect(updateMedia).not.toHaveBeenCalled();
    expect(pressableContaining(renderer, "Add From Gallery")).toBeDefined();
    await act(async () => { renderer.unmount(); });
  });

});
