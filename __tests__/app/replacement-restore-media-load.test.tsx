import { act, create } from "react-test-renderer";
import SetInfoScreen from "../../app/set/[id]";
import { getLatestMediaForSet, updateMedia } from "../../lib/db/media";
import { getSetById } from "../../lib/db/workouts";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "42" }),
}));
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
jest.mock("expo-image-picker", () => ({
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
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
jest.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Alert: { alert: jest.fn() },
  Platform: { OS: "android" },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({
    rawColors: {
      background: "#fff",
      surface: "#fff",
      surfaceSecondary: "#eee",
      border: "#ddd",
      shadow: "#000",
      foreground: "#111",
      foregroundSecondary: "#333",
      foregroundMuted: "#777",
      primary: "#05f",
      primaryForeground: "#fff",
    },
  }),
}));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "kg" }),
}));
jest.mock("../../lib/db/media", () => ({
  getLatestMediaForSet: jest.fn(),
  listMediaForLocalUris: jest.fn().mockResolvedValue([]),
  unlinkMediaForSet: jest.fn(),
  updateMedia: jest.fn(),
  upsertVideoForSet: jest.fn(),
}));
jest.mock("../../lib/db/workouts", () => ({
  getSetById: jest.fn(),
  updateSet: jest.fn(),
}));

const mediaLibrary = jest.requireMock("expo-media-library/legacy") as Record<
  string,
  jest.Mock
>;
const fileSystem = jest.requireMock("expo-file-system/legacy") as Record<
  string,
  jest.Mock
>;
const player = (jest.requireMock("expo-video").useVideoPlayer as jest.Mock)();

async function flushAsyncWork() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("ordinary set load after replacement restore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSetById as jest.Mock).mockResolvedValue({
      id: 42,
      workoutId: 1,
      exerciseId: 1,
      workoutExerciseId: null,
      weightKg: 100,
      reps: 5,
      note: null,
      setIndex: 0,
      performedAt: 1_700_000_000_000,
    });
    (getLatestMediaForSet as jest.Mock).mockResolvedValue({
      id: 7,
      localUri: "",
      assetId: "reused-id",
      mime: "video/mp4",
      setId: 42,
      workoutId: 1,
      note: null,
      createdAt: 1_700_000_000_000,
      originalFilename: "canonical.mp4",
      mediaCreatedAt: 1_700_000_000_000,
      durationMs: 2_000,
      albumName: null,
    });
    mediaLibrary.getPermissionsAsync.mockResolvedValue({
      granted: true,
      accessPrivileges: "all",
    });
    mediaLibrary.getAssetsAsync.mockResolvedValue({
      assets: [
        { id: "reused-id", filename: "canonical.mp4" },
        { id: "different-id", filename: "canonical.mp4" },
      ],
      endCursor: null,
      hasNextPage: false,
    });
    mediaLibrary.getAssetInfoAsync.mockImplementation(async (id: string) => ({
      id,
      filename: "canonical.mp4",
      creationTime: 1_700_000_000_000,
      duration: 2,
      localUri: `file:///gallery/${id}.mp4`,
      uri: `content://media/${id}`,
    }));
  });

  test("a reused stored asset ID cannot break an ambiguous canonical match", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SetInfoScreen />);
      await flushAsyncWork();
    });

    expect(mediaLibrary.getAssetsAsync).toHaveBeenCalledTimes(1);
    expect(mediaLibrary.getAssetInfoAsync).toHaveBeenCalledTimes(2);
    expect(mediaLibrary.getAssetContentUriAsync).not.toHaveBeenCalled();
    expect(updateMedia).not.toHaveBeenCalled();
    expect(fileSystem.copyAsync).not.toHaveBeenCalled();
    expect(player.replaceAsync).not.toHaveBeenCalledWith(expect.any(String));

    await act(async () => {
      renderer.unmount();
    });
  });
});
