import { act, create } from "react-test-renderer";
import * as ImagePicker from "expo-image-picker";
import SetInfoScreen from "../../app/set/[id]";
import { getLatestMediaForSet, listMediaForLocalUris, unlinkMediaForSet, updateMedia, upsertVideoForSet } from "../../lib/db/media";
import { getSetById, updateSet } from "../../lib/db/workouts";
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
  TextInput: "TextInput",
  View: "View",
}));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: { background: "#fff", surface: "#fff", surfaceSecondary: "#eee", border: "#ddd", shadow: "#000", foreground: "#111", foregroundSecondary: "#333", foregroundMuted: "#777", primary: "#05f", primaryForeground: "#fff" } }) }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/db/media", () => ({ getLatestMediaForSet: jest.fn(), listMediaForLocalUris: jest.fn(), unlinkMediaForSet: jest.fn(), updateMedia: jest.fn(), upsertVideoForSet: jest.fn() }));
jest.mock("../../lib/db/workouts", () => ({ getSetById: jest.fn(), updateSet: jest.fn() }));
jest.mock("../../lib/utils/videoStorage", () => ({ deleteManagedVideoUri: jest.fn(), doesFileUriExist: jest.fn().mockResolvedValue(true), getUriScheme: jest.fn(() => "file"), inferVideoMimeFromUri: jest.fn(() => "video/mp4"), isFileUri: jest.fn((uri: string | null) => !!uri?.startsWith("file:")), isLikelyTransientUri: jest.fn(() => false), persistVideoForSetLink: jest.fn(), persistVideoUriToAppStorage: jest.fn(), toMillis: jest.fn((value: number | null | undefined) => value ?? null) }));

const mockPlayer = (jest.requireMock("expo-video").useVideoPlayer as jest.Mock)();
const alertMock = jest.requireMock("react-native").Alert.alert as jest.Mock;
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mediaLibrary = jest.requireMock("expo-media-library/legacy") as Record<string, jest.Mock>;

const setFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  workoutId: 1,
  exerciseId: 1,
  workoutExerciseId: null,
  weightKg: 100,
  reps: 5,
  note: null,
  setIndex: 0,
  performedAt: 1_700_000_000_000,
  ...overrides,
});

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
    (getLatestMediaForSet as jest.Mock).mockReset().mockResolvedValue(null);
    (listMediaForLocalUris as jest.Mock).mockReset().mockResolvedValue([]);
    (unlinkMediaForSet as jest.Mock).mockReset();
    (updateMedia as jest.Mock).mockReset();
    (upsertVideoForSet as jest.Mock).mockReset().mockResolvedValue(7);
    (getSetById as jest.Mock).mockReset().mockResolvedValue(setFixture());
    (updateSet as jest.Mock).mockReset();
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
    expect(upsertVideoForSet).not.toHaveBeenCalled();
    expect(updateMedia).not.toHaveBeenCalled();
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
    expect(updateMedia).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("Permission required", expect.any(String));
    await act(async () => { renderer.unmount(); });
  });

  it("adds one selected asset and passes picker milliseconds through unchanged", async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://first", assetId: "asset-first", fileName: "picked.mov", duration: 12_500, mimeType: "video/mp4" }, { uri: "content://ignored", assetId: "ignored" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: "file:///app/set-videos/picked.mov", assetId: "asset-first", originalFilename: "picked.mov", mediaCreatedAt: 1700000000000, durationMs: 12500, albumName: "LiftingLog" });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); });
    const add = pressableContaining(renderer, "Add From Gallery");
    await act(async () => { add.props.onPress(); await flushAsyncWork(); });
    expect(persistVideoForSetLink).toHaveBeenCalledWith(expect.objectContaining({ sourceUri: "content://first", assetId: "asset-first", durationMs: 12_500 }));
    expect(upsertVideoForSet).toHaveBeenCalledWith(42, expect.objectContaining({ localUri: "file:///app/set-videos/picked.mov", assetId: "asset-first", originalFilename: "picked.mov", durationMs: 12500 }));
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
    expect(upsertVideoForSet).not.toHaveBeenCalled();
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

    expect(upsertVideoForSet).toHaveBeenCalledWith(42, expect.objectContaining({ localUri: replacement.localUri, assetId: "asset-replacement", originalFilename: "replacement.mp4", durationMs: 15_000 }));
    expect(listMediaForLocalUris).toHaveBeenCalledWith([existing.localUri]);
    expect(getLatestMediaForSet).toHaveBeenCalledTimes(2);
    expect(mediaLibrary.getAssetsAsync).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it("preserves the old attachment when the atomic replacement fails", async () => {
    const existing = mediaFixture({ id: 7 });
    (getLatestMediaForSet as jest.Mock).mockResolvedValue(existing);
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "asset-replacement", fileName: "replacement.mp4", duration: 15_000, mimeType: "video/mp4" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: "file:///app/set-videos/replacement.mp4", assetId: "asset-replacement", originalFilename: "replacement.mp4", mediaCreatedAt: 1700000000000, durationMs: 15_000, albumName: "LiftingLog" });
    (upsertVideoForSet as jest.Mock).mockRejectedValue(new Error("DB write failed"));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flushAsyncWork(); });
    await act(async () => { pressableContaining(renderer, "Edit").props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => { actions.find(({ text }) => text === "Change video")?.onPress?.(); await flushAsyncWork(); });
    expect(deleteManagedVideoUri).not.toHaveBeenCalled();
    expect(listMediaForLocalUris).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("Error", "Failed to link video to this set.");
    expect(pressableContaining(renderer, "Edit")).toBeDefined();
    await act(async () => { renderer.unmount(); });
  });

  it("reports cleanup separately after a committed replacement", async () => {
    const existing = mediaFixture({ id: 7 });
    const replacement = mediaFixture({ id: 7, localUri: "file:///app/set-videos/replacement.mp4" });
    (getLatestMediaForSet as jest.Mock).mockResolvedValueOnce(existing).mockResolvedValueOnce(replacement);
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "asset-replacement", fileName: "replacement.mp4", duration: 15_000, mimeType: "video/mp4" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: replacement.localUri, assetId: "asset-replacement", originalFilename: "replacement.mp4", mediaCreatedAt: 1700000000000, durationMs: 15_000, albumName: "LiftingLog" });
    (deleteManagedVideoUri as jest.Mock).mockRejectedValue(new Error("cleanup failed"));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flushAsyncWork(); });
    await act(async () => { pressableContaining(renderer, "Edit").props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => { actions.find(({ text }) => text === "Change video")?.onPress?.(); await flushAsyncWork(); });
    expect(upsertVideoForSet).toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("Video linked", expect.stringContaining("previous local copy"));
    expect(alertMock).not.toHaveBeenCalledWith("Error", "Failed to link video to this set.");
    expect(pressableContaining(renderer, "Edit")).toBeDefined();
    await act(async () => { renderer.unmount(); });
  });

  it("refreshes the committed replacement when the reference lookup fails", async () => {
    const existing = mediaFixture({ id: 7 });
    const replacement = mediaFixture({ id: 7, localUri: "file:///app/set-videos/replacement.mp4" });
    (getLatestMediaForSet as jest.Mock).mockResolvedValueOnce(existing).mockResolvedValueOnce(replacement);
    (listMediaForLocalUris as jest.Mock).mockRejectedValue(new Error("reference lookup failed"));
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "asset-replacement", fileName: "replacement.mp4", duration: 15_000, mimeType: "video/mp4" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: replacement.localUri, assetId: "asset-replacement", originalFilename: "replacement.mp4", mediaCreatedAt: 1700000000000, durationMs: 15_000, albumName: "LiftingLog" });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flushAsyncWork(); });
    await act(async () => { pressableContaining(renderer, "Edit").props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => { actions.find(({ text }) => text === "Change video")?.onPress?.(); await flushAsyncWork(); });
    expect(alertMock).toHaveBeenCalledWith("Video linked", expect.stringContaining("could not be checked"));
    expect(alertMock).not.toHaveBeenCalledWith("Error", "Failed to link video to this set.");
    expect(mockPlayer.replaceAsync).toHaveBeenCalledWith(replacement.localUri);
    await act(async () => { renderer.unmount(); });
  });

  it("persists a successful rediscovery on the existing media row and reloads it on re-entry", async () => {
    const missing = mediaFixture({ id: 7, localUri: "file:///missing.mp4", assetId: "gone", originalFilename: null, mediaCreatedAt: 1_700_000_000_000, durationMs: null, albumName: null });
    const repaired = mediaFixture({ ...missing, localUri: "file:///app/set-videos/rediscovered.mp4", assetId: "rediscovered", originalFilename: "rediscovered.mp4", mediaCreatedAt: 1_700_000_000_000, durationMs: 12_500, albumName: null });
    (getLatestMediaForSet as jest.Mock).mockResolvedValueOnce(missing).mockResolvedValueOnce(repaired);
    (doesFileUriExist as jest.Mock).mockImplementation(async (uri: string) => uri !== missing.localUri);
    mediaLibrary.getAssetInfoAsync
      .mockRejectedValueOnce(new Error("old asset missing"))
      .mockResolvedValueOnce({ localUri: repaired.localUri, uri: repaired.localUri, filename: "rediscovered.mp4", creationTime: 1_700_000_000_000, duration: 12.5 });
    mediaLibrary.getAssetsAsync.mockResolvedValue({ assets: [{ id: "rediscovered", filename: "rediscovered.mp4", creationTime: 1_700_000_000_000 }], endCursor: null, hasNextPage: false });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flushAsyncWork(); });
    expect(updateMedia).toHaveBeenCalledWith(7, expect.objectContaining({ local_uri: repaired.localUri, asset_id: "rediscovered", original_filename: "rediscovered.mp4", media_created_at: 1_700_000_000_000, duration_ms: 12_500, album_name: null }));
    await act(async () => { renderer.unmount(); renderer = create(<SetInfoScreen />); await flushAsyncWork(); });
    expect(mockPlayer.replaceAsync).toHaveBeenCalledWith(repaired.localUri);
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
    const edit = pressableContaining(renderer, "Edit");
    await act(async () => { edit.props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    expect(actions.map(({ text }) => text)).toEqual(expect.arrayContaining(["Change video", "Unlink video"]));
    await act(async () => { actions.find(({ text }) => text === "Unlink video")?.onPress?.(); await flushAsyncWork(); });
    expect(unlinkMediaForSet).toHaveBeenCalledWith(42);
    expect(renderer.root.findAllByProps({ children: "Set Details" })).toHaveLength(1);
    await act(async () => { renderer.unmount(); });
  });

});
