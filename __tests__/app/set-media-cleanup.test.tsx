import { act, create } from "react-test-renderer";
import SetInfoScreen from "../../app/set/[id]";
import { getLatestMediaForSet, listMediaForLocalUris, unlinkMediaForSet, updateMedia, upsertVideoForSet } from "../../lib/db/media";
import { getSetById } from "../../lib/db/workouts";
import { pressableText } from "../helpers/setDetailCharacterization";

jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() }, useLocalSearchParams: () => ({ id: "42" }) }));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
jest.mock("expo-video", () => ({ VideoView: () => null, useVideoPlayer: () => ({ pause: jest.fn(), play: jest.fn(), replaceAsync: jest.fn(), loop: false, muted: true }) }));
jest.mock("expo-image-picker", () => ({ getMediaLibraryPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-media-library/legacy", () => ({ getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, accessPrivileges: "none" }), getAlbumAsync: jest.fn(), getAssetsAsync: jest.fn(), getAssetInfoAsync: jest.fn(), MediaType: { video: "video" }, SortBy: { creationTime: "creationTime" } }));
jest.mock("react-native", () => ({ ActivityIndicator: () => null, Alert: { alert: jest.fn() }, Pressable: "Pressable", ScrollView: "ScrollView", StyleSheet: { create: (styles: unknown) => styles }, Text: "Text", TextInput: "TextInput", View: "View" }));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: { background: "#fff", surface: "#fff", surfaceSecondary: "#eee", border: "#ddd", shadow: "#000", foreground: "#111", foregroundSecondary: "#333", foregroundMuted: "#777", primary: "#05f", primaryForeground: "#fff" } }) }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/db/media", () => ({ getLatestMediaForSet: jest.fn(), listMediaForLocalUris: jest.fn(), unlinkMediaForSet: jest.fn(), updateMedia: jest.fn(), upsertVideoForSet: jest.fn() }));
jest.mock("../../lib/db/workouts", () => ({ getSetById: jest.fn(), updateSet: jest.fn() }));
jest.mock("../../lib/utils/videoStorage", () => ({ deleteManagedVideoUri: jest.fn(), doesFileUriExist: jest.fn().mockResolvedValue(false), getUriScheme: jest.fn(() => "file"), inferVideoMimeFromUri: jest.fn(() => "video/mp4"), isFileUri: jest.fn(() => true), isLikelyTransientUri: jest.fn(() => false), persistVideoForSetLink: jest.fn(), persistVideoUriToAppStorage: jest.fn(), toMillis: jest.fn((value: number | null | undefined) => value ?? null) }));

const fixture = { id: 42, workoutId: 1, exerciseId: 1, workoutExerciseId: null, weightKg: 0, reps: 0, note: "Keep this note", setIndex: 0, performedAt: 1_700_000_000_000 };

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function press(renderer: ReturnType<typeof create>, label: string) {
  const node = renderer.root.findAllByType("Pressable").find((candidate: unknown) => pressableText(candidate, label) === candidate);
  if (!node) throw new Error(`Could not find ${label}`);
  return node as unknown as { props: { onPress: () => void } };
}

describe("SetInfoScreen missing media cleanup states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const ImagePicker = jest.requireMock("expo-image-picker") as Record<string, jest.Mock>;
    const MediaLibrary = jest.requireMock("expo-media-library/legacy") as Record<string, jest.Mock>;
    const videoStorage = jest.requireMock("../../lib/utils/videoStorage") as Record<string, jest.Mock>;
    (getSetById as jest.Mock).mockReset().mockResolvedValue(fixture);
    (getLatestMediaForSet as jest.Mock).mockReset().mockResolvedValue({
      id: 8, localUri: "file:///app/documents/set-videos/missing.mp4", assetId: "gone-asset", mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: "missing.mp4", mediaCreatedAt: 1, durationMs: 1000, albumName: "LiftingLog",
    });
    (listMediaForLocalUris as jest.Mock).mockReset().mockResolvedValue([]);
    (unlinkMediaForSet as jest.Mock).mockReset().mockResolvedValue(undefined);
    (updateMedia as jest.Mock).mockReset().mockResolvedValue(undefined);
    (upsertVideoForSet as jest.Mock).mockReset().mockResolvedValue(8);
    ImagePicker.getMediaLibraryPermissionsAsync.mockReset();
    ImagePicker.requestMediaLibraryPermissionsAsync.mockReset();
    ImagePicker.launchImageLibraryAsync.mockReset();
    MediaLibrary.getPermissionsAsync.mockReset().mockResolvedValue({ granted: false, accessPrivileges: "none" });
    MediaLibrary.getAlbumAsync.mockReset();
    MediaLibrary.getAssetsAsync.mockReset();
    MediaLibrary.getAssetInfoAsync.mockReset();
    videoStorage.deleteManagedVideoUri.mockReset();
    videoStorage.doesFileUriExist.mockReset().mockResolvedValue(false);
    videoStorage.getUriScheme.mockReset().mockReturnValue("file");
    videoStorage.inferVideoMimeFromUri.mockReset().mockReturnValue("video/mp4");
    videoStorage.isFileUri.mockReset().mockReturnValue(true);
    videoStorage.isLikelyTransientUri.mockReset().mockReturnValue(false);
    videoStorage.persistVideoForSetLink.mockReset();
    videoStorage.persistVideoUriToAppStorage.mockReset();
    videoStorage.toMillis.mockReset().mockImplementation((value: number | null | undefined) => value ?? null);
  });

  it("keeps the set and note visible when its attachment is missing, with replacement and unlink still available", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });

    expect(renderer.root.findAllByProps({ children: "Keep this note" })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ children: "The linked video is unavailable." })).toHaveLength(1);
    await act(async () => { press(renderer, "Edit").props.onPress(); });
    const actions = (jest.requireMock("react-native").Alert.alert as jest.Mock).mock.calls.find(([title]) => title === "Video options")?.[2] as Array<{ text: string; onPress?: () => void }>;
    expect(actions.map(({ text }) => text)).toEqual(expect.arrayContaining(["Change video", "Unlink video"]));
    await act(async () => { actions.find(({ text }) => text === "Unlink video")?.onPress?.(); await flush(); });
    expect(unlinkMediaForSet).toHaveBeenCalledWith(42);
  });

  it("removes the recovered managed copy when the repaired link is replaced", async () => {
    const ImagePicker = jest.requireMock("expo-image-picker");
    const MediaLibrary = jest.requireMock("expo-media-library/legacy");
    const videoStorage = jest.requireMock("../../lib/utils/videoStorage");
    const recoveredUri = "file:///app/documents/set-videos/recovered.mp4";
    (getLatestMediaForSet as jest.Mock).mockResolvedValue({
      id: 8, localUri: "file:///app/documents/set-videos/missing.mp4", assetId: "gone-asset", mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: "missing.mp4", mediaCreatedAt: 1, durationMs: 1000, albumName: "LiftingLog",
    });
    MediaLibrary.getPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    MediaLibrary.getAssetInfoAsync.mockRejectedValueOnce(new Error("stale asset")).mockResolvedValue({ localUri: "content://rediscovered", uri: "content://rediscovered", filename: "missing.mp4", creationTime: 1, duration: 1 });
    MediaLibrary.getAlbumAsync.mockResolvedValue(null);
    MediaLibrary.getAssetsAsync.mockResolvedValue({ assets: [{ id: "recovered-asset", filename: "missing.mp4", creationTime: 1 }], hasNextPage: false, endCursor: null });
    videoStorage.isFileUri.mockImplementation((uri: string | null | undefined) => typeof uri === "string" && uri.startsWith("file://"));
    videoStorage.doesFileUriExist.mockImplementation((uri: string) => Promise.resolve(uri !== "file:///app/documents/set-videos/missing.mp4"));
    videoStorage.persistVideoUriToAppStorage.mockResolvedValue(recoveredUri);
    ImagePicker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "replacement", fileName: "replacement.mp4", duration: 1000, mimeType: "video/mp4" }] });
    videoStorage.persistVideoForSetLink.mockResolvedValue({ localUri: "file:///app/documents/set-videos/replacement.mp4", assetId: "replacement", originalFilename: "replacement.mp4", mediaCreatedAt: 2, durationMs: 1000, albumName: "LiftingLog" });
    (updateMedia as jest.Mock).mockResolvedValue(undefined);
    (upsertVideoForSet as jest.Mock).mockResolvedValue(8);
    (listMediaForLocalUris as jest.Mock).mockResolvedValue([]);

    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit").props.onPress(); });
    const actions = (jest.requireMock("react-native").Alert.alert as jest.Mock).mock.calls.find(([title]) => title === "Video options")?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { actions.find(({ text }) => text === "Change video")?.onPress?.(); await flush(); });

    expect(videoStorage.deleteManagedVideoUri).toHaveBeenCalledWith(recoveredUri);
  });

  it("retains the prior link in state when persisting a repair fails", async () => {
    const ImagePicker = jest.requireMock("expo-image-picker");
    const MediaLibrary = jest.requireMock("expo-media-library/legacy");
    const videoStorage = jest.requireMock("../../lib/utils/videoStorage");
    const priorUri = "file:///app/documents/set-videos/missing.mp4";
    (getLatestMediaForSet as jest.Mock).mockResolvedValue({
      id: 8, localUri: priorUri, assetId: "gone-asset", mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: "missing.mp4", mediaCreatedAt: 1, durationMs: 1000, albumName: "LiftingLog",
    });
    MediaLibrary.getPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    MediaLibrary.getAssetInfoAsync.mockRejectedValueOnce(new Error("stale asset")).mockResolvedValue({ localUri: "content://rediscovered", uri: "content://rediscovered", filename: "missing.mp4", creationTime: 1, duration: 1 });
    MediaLibrary.getAlbumAsync.mockResolvedValue(null);
    MediaLibrary.getAssetsAsync.mockResolvedValue({ assets: [{ id: "recovered-asset", filename: "missing.mp4", creationTime: 1 }], hasNextPage: false, endCursor: null });
    videoStorage.isFileUri.mockImplementation((uri: string | null | undefined) => typeof uri === "string" && uri.startsWith("file://"));
    videoStorage.doesFileUriExist.mockImplementation((uri: string) => Promise.resolve(uri !== priorUri));
    videoStorage.persistVideoUriToAppStorage.mockResolvedValue("file:///app/documents/set-videos/recovered.mp4");
    (updateMedia as jest.Mock).mockRejectedValue(new Error("repair write failed"));
    ImagePicker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "replacement", fileName: "replacement.mp4", duration: 1000, mimeType: "video/mp4" }] });
    videoStorage.persistVideoForSetLink.mockResolvedValue({ localUri: "file:///app/documents/set-videos/replacement.mp4", assetId: "replacement", originalFilename: "replacement.mp4", mediaCreatedAt: 2, durationMs: 1000, albumName: "LiftingLog" });
    (upsertVideoForSet as jest.Mock).mockResolvedValue(8);
    (listMediaForLocalUris as jest.Mock).mockResolvedValue([]);

    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit").props.onPress(); });
    const actions = (jest.requireMock("react-native").Alert.alert as jest.Mock).mock.calls.find(([title]) => title === "Video options")?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { actions.find(({ text }) => text === "Change video")?.onPress?.(); await flush(); });

    expect(videoStorage.deleteManagedVideoUri).toHaveBeenCalledWith(priorUri);
  });

  it("preserves a managed previous copy when another media row still references it", async () => {
    const ImagePicker = jest.requireMock("expo-image-picker");
    const videoStorage = jest.requireMock("../../lib/utils/videoStorage");
    const sharedUri = "file:///app/documents/set-videos/shared.mp4";
    (getLatestMediaForSet as jest.Mock).mockResolvedValue({
      id: 8, localUri: sharedUri, assetId: null, mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: "shared.mp4", mediaCreatedAt: null, durationMs: null, albumName: null,
    });
    videoStorage.doesFileUriExist.mockResolvedValue(true);
    ImagePicker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "replacement", fileName: "replacement.mp4", duration: 1000, mimeType: "video/mp4" }] });
    videoStorage.persistVideoForSetLink.mockResolvedValue({ localUri: "file:///app/documents/set-videos/replacement.mp4", assetId: "replacement", originalFilename: "replacement.mp4", mediaCreatedAt: 2, durationMs: 1000, albumName: "LiftingLog" });
    (listMediaForLocalUris as jest.Mock).mockResolvedValue([{ id: 99, localUri: sharedUri }]);

    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit").props.onPress(); });
    const actions = (jest.requireMock("react-native").Alert.alert as jest.Mock).mock.calls.find(([title]) => title === "Video options")?.[2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { actions.find(({ text }) => text === "Change video")?.onPress?.(); await flush(); });

    expect(listMediaForLocalUris).toHaveBeenCalledWith([sharedUri]);
    expect(videoStorage.deleteManagedVideoUri).not.toHaveBeenCalled();
  });
});
