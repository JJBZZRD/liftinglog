import { act, create } from "react-test-renderer";
import SetInfoScreen from "../../app/set/[id]";
import * as ImagePicker from "expo-image-picker";
import { getLatestMediaForSet, listMediaForLocalUris, unlinkMediaForSet, upsertVideoForSet } from "../../lib/db/media";
import type { Media } from "../../lib/db/media";
import { getSetById, updateSet } from "../../lib/db/workouts";
import { persistVideoForSetLink } from "../../lib/utils/videoStorage";
import { pressableText } from "../helpers/setDetailCharacterization";

let mockRouteId = "42";
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() }, useLocalSearchParams: () => ({ id: mockRouteId }) }));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
jest.mock("expo-video", () => ({ VideoView: () => null, useVideoPlayer: () => ({ pause: jest.fn(), play: jest.fn(), replaceAsync: jest.fn(), loop: false, muted: true }) }));
jest.mock("expo-image-picker", () => ({ getMediaLibraryPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-media-library/legacy", () => ({ getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, accessPrivileges: "none" }), MediaType: { video: "video" }, SortBy: { creationTime: "creationTime" } }));
jest.mock("react-native", () => ({ ActivityIndicator: () => null, Alert: { alert: jest.fn() }, Pressable: "Pressable", ScrollView: "ScrollView", StyleSheet: { create: (styles: unknown) => styles }, Text: "Text", TextInput: "TextInput", View: "View" }));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: { background: "#fff", surface: "#fff", surfaceSecondary: "#eee", border: "#ddd", shadow: "#000", foreground: "#111", foregroundSecondary: "#333", foregroundMuted: "#777", primary: "#05f", primaryForeground: "#fff" } }) }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/db/media", () => ({ getLatestMediaForSet: jest.fn(), listMediaForLocalUris: jest.fn().mockResolvedValue([]), unlinkMediaForSet: jest.fn(), updateMedia: jest.fn(), upsertVideoForSet: jest.fn() }));
jest.mock("../../lib/db/workouts", () => ({ getSetById: jest.fn(), updateSet: jest.fn() }));
jest.mock("../../lib/utils/videoStorage", () => ({ deleteManagedVideoUri: jest.fn(), doesFileUriExist: jest.fn().mockResolvedValue(true), getUriScheme: jest.fn(() => "file"), inferVideoMimeFromUri: jest.fn(() => "video/mp4"), isFileUri: jest.fn(() => false), isLikelyTransientUri: jest.fn(() => false), persistVideoForSetLink: jest.fn(), persistVideoUriToAppStorage: jest.fn(), toMillis: jest.fn((value: number | null | undefined) => value ?? null) }));

const setFixture = (note: string | null = null, id = 42) => ({ id, workoutId: 1, exerciseId: 1, workoutExerciseId: null, weightKg: 0, reps: 0, note, setIndex: 0, performedAt: 1_700_000_000_000 });

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function press(renderer: ReturnType<typeof create>, label: string) {
  const node = renderer.root.findAllByType("Pressable").find((candidate: unknown) => pressableText(candidate, label) === candidate);
  if (!node) throw new Error(`Could not find ${label}`);
  return node as unknown as { props: { onPress: () => void } };
}

describe("SetInfoScreen note UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteId = "42";
    (getSetById as jest.Mock).mockResolvedValue(setFixture());
    (getLatestMediaForSet as jest.Mock).mockResolvedValue(null);
    (listMediaForLocalUris as jest.Mock).mockReset().mockResolvedValue([]);
    (updateSet as jest.Mock).mockResolvedValue(undefined);
  });

  it("creates, cancels, edits, clears, and rehydrates a durable set note", async () => {
    let storedNote: string | null = null;
    (getSetById as jest.Mock).mockImplementation(() => Promise.resolve(setFixture(storedNote)));
    (updateSet as jest.Mock).mockImplementation((_setId: number, { note }: { note: string | null }) => {
      storedNote = note;
      return Promise.resolve();
    });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    expect(renderer.root.findAllByProps({ children: "Set Details" })).toHaveLength(1);
    const setSummary = (renderer.root.findAllByType("Text") as Array<{ props: { children: unknown } }>)
      .find((node) => Array.isArray(node.props.children) && node.props.children.includes("0 kg"));
    expect(setSummary?.props.children).toEqual(expect.arrayContaining(["0 kg", "0 reps"]));

    await act(async () => { press(renderer, "Add Note").props.onPress(); });
    await act(async () => { renderer.root.findByProps({ testID: "set-note-input" }).props.onChangeText("First saved note"); });
    await act(async () => { press(renderer, "Save Note").props.onPress(); await flush(); });
    expect(updateSet).toHaveBeenLastCalledWith(42, { note: "First saved note" });
    expect(renderer.root.findAllByProps({ children: "First saved note" })).toHaveLength(1);

    await act(async () => { press(renderer, "Edit Note").props.onPress(); });
    await act(async () => { renderer.root.findByProps({ testID: "set-note-input" }).props.onChangeText("Discarded edit"); press(renderer, "Cancel").props.onPress(); });
    expect(renderer.root.findAllByProps({ children: "First saved note" })).toHaveLength(1);

    await act(async () => { press(renderer, "Edit Note").props.onPress(); });
    await act(async () => { renderer.root.findByProps({ testID: "set-note-input" }).props.onChangeText("Edited saved note"); });
    await act(async () => { press(renderer, "Save Note").props.onPress(); await flush(); });
    expect(updateSet).toHaveBeenLastCalledWith(42, { note: "Edited saved note" });

    await act(async () => { renderer.unmount(); renderer = create(<SetInfoScreen />); await flush(); });
    expect(renderer.root.findAllByProps({ children: "Edited saved note" })).toHaveLength(1);

    await act(async () => { press(renderer, "Clear Note").props.onPress(); });
    await act(async () => { press(renderer, "Save Note").props.onPress(); await flush(); });
    expect(updateSet).toHaveBeenLastCalledWith(42, { note: null });

    await act(async () => { renderer.unmount(); renderer = create(<SetInfoScreen />); await flush(); });
    expect(renderer.root.findAllByProps({ children: "No note for this set." })).toHaveLength(1);
  });

  it("keeps the editable text and saved note intact when a note save fails", async () => {
    (getSetById as jest.Mock).mockResolvedValue(setFixture("Stored note"));
    (updateSet as jest.Mock).mockRejectedValue(new Error("write failed"));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit Note").props.onPress(); });
    await act(async () => { renderer.root.findByProps({ testID: "set-note-input" }).props.onChangeText("Draft remains"); });
    await act(async () => { press(renderer, "Save Note").props.onPress(); await flush(); });
    expect(renderer.root.findByProps({ testID: "set-note-input" }).props.value).toBe("Draft remains");
    expect(updateSet).toHaveBeenCalledWith(42, { note: "Draft remains" });
  });

  it("shows a clear missing-set state without note or media mutations", async () => {
    (getSetById as jest.Mock).mockResolvedValue(null);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    expect(renderer.root.findAllByProps({ children: "This set is unavailable." })).toHaveLength(1);
    expect(getLatestMediaForSet).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
    expect(upsertVideoForSet).not.toHaveBeenCalled();
    expect(unlinkMediaForSet).not.toHaveBeenCalled();
  });

  it("opens only one picker while gallery permission is pending", async () => {
    const permission = deferred<{ granted: boolean; accessPrivileges: string }>();
    const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
    picker.getMediaLibraryPermissionsAsync.mockReturnValue(permission.promise as never);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Add From Gallery").props.onPress(); press(renderer, "Add From Gallery").props.onPress(); });
    expect(picker.getMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    permission.resolve({ granted: false, accessPrivileges: "none" });
    await act(async () => { await flush(); });
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("does not apply a completed note save to a newer route", async () => {
    const pendingSave = deferred<void>();
    (getSetById as jest.Mock).mockImplementation((id: number) => Promise.resolve(id === 42 ? setFixture("First route", 42) : setFixture("Second route", 43)));
    (updateSet as jest.Mock).mockReturnValue(pendingSave.promise);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit Note").props.onPress(); });
    await act(async () => { renderer.root.findByProps({ testID: "set-note-input" }).props.onChangeText("Stale save"); });
    await act(async () => { press(renderer, "Save Note").props.onPress(); });
    mockRouteId = "43";
    await act(async () => { renderer.update(<SetInfoScreen />); await flush(); });
    pendingSave.resolve();
    await act(async () => { await flush(); });
    expect(updateSet).toHaveBeenCalledWith(42, { note: "Stale save" });
    expect(renderer.root.findAllByProps({ children: "Second route" })).toHaveLength(1);
  });

  it("does not persist a picker result after the route changes", async () => {
    const pendingPicker = deferred<{ canceled: boolean; assets: Array<{ uri: string; assetId: string; fileName: string; duration: number; mimeType: string }> }>();
    const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
    (getSetById as jest.Mock).mockImplementation((id: number) => Promise.resolve(setFixture(null, id)));
    picker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" } as never);
    picker.launchImageLibraryAsync.mockReturnValue(pendingPicker.promise as never);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Add From Gallery").props.onPress(); await flush(); });
    mockRouteId = "43";
    await act(async () => { renderer.update(<SetInfoScreen />); await flush(); });
    pendingPicker.resolve({ canceled: false, assets: [{ uri: "content://old", assetId: "old", fileName: "old.mp4", duration: 12_500, mimeType: "video/mp4" }] });
    await act(async () => { await flush(); });
    expect(upsertVideoForSet).not.toHaveBeenCalled();
  });

  it("does not let a saved old-route unlink action mutate the new route", async () => {
    const existing: Media = { id: 7, localUri: "file:///old.mp4", assetId: null, mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: null, mediaCreatedAt: null, durationMs: null, albumName: null };
    const alertMock = jest.requireMock("react-native").Alert.alert as jest.Mock;
    (getLatestMediaForSet as jest.Mock).mockResolvedValue(existing);
    (getSetById as jest.Mock).mockImplementation((id: number) => Promise.resolve(setFixture(null, id)));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit").props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    mockRouteId = "43";
    await act(async () => { renderer.update(<SetInfoScreen />); await flush(); });
    await act(async () => { actions.find(({ text }) => text === "Unlink video")?.onPress?.(); await flush(); });
    expect(unlinkMediaForSet).not.toHaveBeenCalled();
  });

  it("does not let a stale old media load overwrite the new route", async () => {
    const pendingOldMedia = deferred<Media>();
    const oldMedia = { id: 7, localUri: "file:///old.mp4", assetId: null, mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: null, mediaCreatedAt: null, durationMs: null, albumName: null };
    (getSetById as jest.Mock).mockImplementation((id: number) => Promise.resolve(setFixture(null, id)));
    (getLatestMediaForSet as jest.Mock).mockReturnValueOnce(pendingOldMedia.promise).mockResolvedValueOnce(null);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    mockRouteId = "43";
    await act(async () => { renderer.update(<SetInfoScreen />); await flush(); });
    pendingOldMedia.resolve(oldMedia);
    await act(async () => { await flush(); });
    expect(getLatestMediaForSet).toHaveBeenCalledWith(43);
    expect(press(renderer, "Add From Gallery")).toBeDefined();
  });

  it("does not let stale replacement cleanup cancel the next route's media load", async () => {
    const pendingCleanup = deferred<never[]>();
    const pendingNewMedia = deferred<Media | null>();
    const existing: Media = { id: 7, localUri: "file:///old.mp4", assetId: null, mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: "old.mp4", mediaCreatedAt: null, durationMs: null, albumName: null };
    const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
    const alertMock = jest.requireMock("react-native").Alert.alert as jest.Mock;
    (getSetById as jest.Mock).mockImplementation((id: number) => Promise.resolve(setFixture(null, id)));
    (getLatestMediaForSet as jest.Mock).mockImplementation((id: number) => id === 42 ? Promise.resolve(existing) : pendingNewMedia.promise);
    picker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "replacement", fileName: "replacement.mp4", duration: 12_500, mimeType: "video/mp4" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: "file:///replacement.mp4", assetId: "replacement", originalFilename: "replacement.mp4", mediaCreatedAt: null, durationMs: 12_500, albumName: null });
    (listMediaForLocalUris as jest.Mock).mockReturnValue(pendingCleanup.promise);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit").props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => { actions.find(({ text }) => text === "Change video")?.onPress?.(); await flush(); });
    mockRouteId = "43";
    await act(async () => { renderer.update(<SetInfoScreen />); await flush(); });
    pendingCleanup.resolve([]);
    await act(async () => { await flush(); });
    pendingNewMedia.resolve(null);
    await act(async () => { await flush(); });
    expect(press(renderer, "Add From Gallery")).toBeDefined();
  });

  it("recovers the stored video after a replacement fails while its initial load is pending", async () => {
    const pendingInitialMedia = deferred<Media | null>();
    const existing: Media = { id: 7, localUri: "file:///old.mp4", assetId: null, mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: "old.mp4", mediaCreatedAt: null, durationMs: null, albumName: null };
    const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
    (getLatestMediaForSet as jest.Mock).mockReturnValueOnce(pendingInitialMedia.promise).mockResolvedValueOnce(existing);
    picker.getMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "content://replacement", assetId: "replacement", fileName: "replacement.mp4", duration: 12_500, mimeType: "video/mp4" }] } as never);
    (persistVideoForSetLink as jest.Mock).mockResolvedValue({ localUri: "file:///replacement.mp4", assetId: "replacement", originalFilename: "replacement.mp4", mediaCreatedAt: null, durationMs: 12_500, albumName: null });
    (upsertVideoForSet as jest.Mock).mockRejectedValue(new Error("write failed"));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    expect(renderer.root.findAllByProps({ children: "Loading video..." })).toHaveLength(1);
    await act(async () => { press(renderer, "Add").props.onPress(); await flush(); });
    pendingInitialMedia.resolve(existing);
    await act(async () => { await flush(); });
    expect(renderer.root.findAllByProps({ children: "Loading video..." })).toHaveLength(0);
    expect(press(renderer, "Edit")).toBeDefined();
  });

  it("recovers the stored video after unlink fails", async () => {
    const existing: Media = { id: 7, localUri: "file:///old.mp4", assetId: null, mime: "video/mp4", setId: 42, workoutId: null, note: null, createdAt: 1, originalFilename: null, mediaCreatedAt: null, durationMs: null, albumName: null };
    const alertMock = jest.requireMock("react-native").Alert.alert as jest.Mock;
    (getLatestMediaForSet as jest.Mock).mockResolvedValueOnce(existing).mockResolvedValueOnce(existing);
    (unlinkMediaForSet as jest.Mock).mockRejectedValue(new Error("unlink failed"));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SetInfoScreen />); await flush(); });
    await act(async () => { press(renderer, "Edit").props.onPress(); });
    const actions = alertMock.mock.calls.find(([title]) => title === "Video options")?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => { actions.find(({ text }) => text === "Unlink video")?.onPress?.(); await flush(); });
    expect(unlinkMediaForSet).toHaveBeenCalledWith(42);
    expect(renderer.root.findAllByProps({ children: "Loading video..." })).toHaveLength(0);
    expect(press(renderer, "Edit")).toBeDefined();
  });
});
