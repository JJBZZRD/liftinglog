import React from "react";
import renderer, { act } from "react-test-renderer";

const mockParams: Record<string, string> = {};
const mockRouter = { back: jest.fn(), dismissTo: jest.fn() };
const mockRecordAsync = jest.fn();
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Alert: { alert: jest.fn() },
  Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View",
}));
jest.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" }, useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
  useMicrophonePermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock("expo-media-library", () => ({ getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }), requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }) }));
jest.mock("react-native-gesture-handler", () => ({ PinchGestureHandler: "PinchGestureHandler", State: {} }));
jest.mock("react-native-reanimated", () => ({
  runOnJS: (fn: unknown) => fn, SensorType: { GRAVITY: "gravity" },
  useAnimatedReaction: jest.fn(), useAnimatedSensor: () => ({ sensor: { value: { x: 0, y: 0, z: 0 } } }),
  useSharedValue: (value: number) => ({ value }),
}));
jest.mock("../../components/modals/BaseModal", () => "BaseModal");
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }) }));
jest.mock("../../lib/db/exercises", () => ({ getExerciseById: jest.fn() }));
jest.mock("../../lib/db/media", () => ({ addMedia: jest.fn() }));
jest.mock("../../lib/db/programCalendar", () => ({ getCalendarExerciseById: jest.fn(), linkCalendarExerciseToWorkoutExercise: jest.fn(), linkExerciseToDb: jest.fn() }));
jest.mock("../../lib/db/workouts", () => ({
  addSet: jest.fn(), addWorkoutExercise: jest.fn(), getOpenWorkoutExercise: jest.fn(),
  getWorkoutById: jest.fn(), getWorkoutExerciseById: jest.fn(), listSetsForWorkoutExercise: jest.fn(),
}));
jest.mock("../../lib/utils/videoStorage", () => ({
  DEFAULT_MEDIA_ALBUM_NAME: "LiftingLog", inferVideoMimeFromUri: () => "video/mp4", persistVideoForSetLink: jest.fn(),
}));
jest.mock("../../lib/utils/units", () => ({ getWeightUnitLabel: () => "kg", parseWeightInputToKg: (value: string) => Number(value) }));

const RecordVideoScreen = jest.requireActual("../../app/exercise/record-video").default;
const workouts = jest.requireMock("../../lib/db/workouts");
const calendar = jest.requireMock("../../lib/db/programCalendar");
const storage = jest.requireMock("../../lib/utils/videoStorage");
const media = jest.requireMock("../../lib/db/media");
const exercise = jest.requireMock("../../lib/db/exercises");
const activeWorkout = { id: 10, completedAt: null, startedAt: new Date("2026-09-20T18:00:00").getTime() };
const durableVideo = { localUri: "file:///durable.mp4", assetId: null, originalFilename: "set.mp4" };
type Tree = ReturnType<typeof renderer.create>;
function button(tree: Tree, label: string) {
  return tree.root.findAllByType("Pressable").find((node: any) => node.findAll((child: any) => child.props.children === label).length > 0)!;
}
async function mount() {
  let tree: Tree;
  await act(async () => { tree = renderer.create(<RecordVideoScreen />, { createNodeMock: (node: { type: unknown }) => node.type === "CameraView" ? { recordAsync: mockRecordAsync } : null }); });
  return tree!;
}
async function prepareSet(tree: Tree, weight = "100") {
  await act(async () => { await tree.root.findByProps({ accessibilityLabel: "Start recording" }).props.onPress(); });
  await act(async () => { button(tree, "Save Video").props.onPress(); });
  const inputs = tree.root.findAllByType("TextInput");
  await act(async () => { inputs[0].props.onChangeText(weight); inputs[1].props.onChangeText("5"); });
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, { id: "1", name: "Bench", workoutId: "10", setIndex: "1" });
  workouts.getWorkoutById.mockResolvedValue(activeWorkout);
  workouts.getWorkoutExerciseById.mockResolvedValue(null);
  workouts.getOpenWorkoutExercise.mockResolvedValue(null);
  workouts.listSetsForWorkoutExercise.mockResolvedValue([]);
  workouts.addWorkoutExercise.mockResolvedValue(20);
  workouts.addSet.mockResolvedValue(30);
  exercise.getExerciseById.mockResolvedValue({ id: 1 });
  storage.persistVideoForSetLink.mockResolvedValue(durableVideo);
  mockRecordAsync.mockResolvedValue({ uri: "file:///capture.mp4" });
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("video recording entry lifecycle", () => {
  it("keeps camera opening, recording, and cancelling read-only", async () => {
    const tree = await mount();
    await prepareSet(tree);
    await act(async () => { button(tree, "Cancel").props.onPress(); });
    expect(workouts.addWorkoutExercise).not.toHaveBeenCalled();
    expect(workouts.addSet).not.toHaveBeenCalled();
    expect(storage.persistVideoForSetLink).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it.each(["", "-1", "Infinity"])("does not persist a video or create an entry with invalid weight %s", async weight => {
    const tree = await mount();
    await prepareSet(tree, weight);
    await act(async () => { await button(tree, "Add Set").props.onPress(); });
    expect(storage.persistVideoForSetLink).not.toHaveBeenCalled();
    expect(workouts.addWorkoutExercise).not.toHaveBeenCalled();
    expect(workouts.addSet).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("creates its first entry only after the video is durable and links a valid 0 kg set", async () => {
    let resolveCopy: (value: unknown) => void;
    storage.persistVideoForSetLink.mockImplementationOnce(() => new Promise(resolve => { resolveCopy = resolve; }));
    const tree = await mount();
    await prepareSet(tree, "0");
    let save: Promise<void>;
    await act(async () => { save = button(tree, "Add Set").props.onPress(); });
    expect(workouts.addWorkoutExercise).not.toHaveBeenCalled();
    await act(async () => { resolveCopy!(durableVideo); await save!; });
    expect(workouts.addWorkoutExercise).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 10, exercise_id: 1 }));
    expect(workouts.addSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 10, workout_exercise_id: 20, weight_kg: 0, reps: 5 }));
    expect(media.addMedia).toHaveBeenCalledWith(expect.objectContaining({ set_id: 30, workout_id: 10, local_uri: "file:///durable.mp4" }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/exercise/[id]", params: expect.objectContaining({ id: "1", weId: "20", workoutId: "10" }) }));
    await act(async () => tree.unmount());
  });

  it("returns a newly recorded repeat entry explicitly instead of reusing an open sibling", async () => {
    mockParams.newEntry = "1";
    workouts.getOpenWorkoutExercise.mockResolvedValue({ id: 44, exerciseId: 1, workoutId: 10, completedAt: null });
    const tree = await mount();
    await prepareSet(tree);
    await act(async () => { await button(tree, "Add Set").props.onPress(); });
    expect(workouts.getOpenWorkoutExercise).not.toHaveBeenCalled();
    expect(workouts.addWorkoutExercise).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ weId: "20", tab: "record" }) }));
    await act(async () => tree.unmount());
  });

  it("coalesces repeated save taps while the durable copy is pending", async () => {
    let resolveCopy: (value: unknown) => void;
    storage.persistVideoForSetLink.mockImplementationOnce(() => new Promise(resolve => { resolveCopy = resolve; }));
    const tree = await mount();
    await prepareSet(tree);
    let save: Promise<void>;
    await act(async () => {
      const saveButton = button(tree, "Add Set");
      save = saveButton.props.onPress();
      await saveButton.props.onPress();
    });
    expect(storage.persistVideoForSetLink).toHaveBeenCalledTimes(1);
    await act(async () => { resolveCopy!(durableVideo); await save!; });
    expect(workouts.addWorkoutExercise).toHaveBeenCalledTimes(1);
    expect(workouts.addSet).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  it("creates no entry when durable video storage fails", async () => {
    storage.persistVideoForSetLink.mockResolvedValue(null);
    const tree = await mount();
    await prepareSet(tree);
    await act(async () => { await button(tree, "Add Set").props.onPress(); });
    expect(workouts.addWorkoutExercise).not.toHaveBeenCalled();
    expect(workouts.addSet).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("rechecks parent completion after the durable copy finishes", async () => {
    let resolveCopy: (value: unknown) => void;
    storage.persistVideoForSetLink.mockImplementationOnce(() => new Promise(resolve => { resolveCopy = resolve; }));
    const tree = await mount();
    await prepareSet(tree);
    let save: Promise<void>;
    await act(async () => { save = button(tree, "Add Set").props.onPress(); });
    workouts.getWorkoutById.mockResolvedValue({ ...activeWorkout, completedAt: Date.now() });
    await act(async () => { resolveCopy!(durableVideo); await save!; });
    expect(workouts.addWorkoutExercise).not.toHaveBeenCalled();
    expect(workouts.addSet).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("rejects an entry moved to another workout while the camera was open", async () => {
    mockParams.workoutExerciseId = "20";
    workouts.getWorkoutExerciseById.mockResolvedValue({ id: 20, workoutId: 11, exerciseId: 1, completedAt: null });
    const tree = await mount();
    await prepareSet(tree);
    await act(async () => { await button(tree, "Add Set").props.onPress(); });
    expect(workouts.addWorkoutExercise).not.toHaveBeenCalled();
    expect(workouts.addSet).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("links an unlogged program exercise only on confirmed video set save", async () => {
    mockParams.programExerciseId = "900";
    mockParams.dateIso = "2026-09-18";
    calendar.getCalendarExerciseById.mockResolvedValue({ id: 900, exerciseId: null, workoutExerciseId: null, orderIndex: 2 });
    const tree = await mount();
    await prepareSet(tree);
    expect(calendar.linkCalendarExerciseToWorkoutExercise).not.toHaveBeenCalled();
    await act(async () => { await button(tree, "Add Set").props.onPress(); });
    expect(calendar.linkExerciseToDb).toHaveBeenCalledWith(900, 1);
    expect(calendar.linkCalendarExerciseToWorkoutExercise).toHaveBeenCalledWith(900, 20);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ programExerciseId: "900", dateIso: "2026-09-18" }) }));
    expect(workouts.addSet).toHaveBeenCalledWith(expect.objectContaining({ workout_exercise_id: 20 }));
    await act(async () => tree.unmount());
  });

  it("reuses a program link created while the camera was open, preserving immediate-completion semantics", async () => {
    mockParams.programExerciseId = "900";
    calendar.getCalendarExerciseById.mockResolvedValue({ id: 900, exerciseId: 1, workoutExerciseId: 44 });
    workouts.getWorkoutExerciseById.mockResolvedValue({ id: 44, exerciseId: 1, workoutId: 10, completedAt: Date.now() });
    const tree = await mount();
    await prepareSet(tree);
    await act(async () => { await button(tree, "Add Set").props.onPress(); });
    expect(workouts.addWorkoutExercise).not.toHaveBeenCalled();
    expect(calendar.linkCalendarExerciseToWorkoutExercise).not.toHaveBeenCalled();
    expect(workouts.addSet).toHaveBeenCalledWith(expect.objectContaining({ workout_exercise_id: 44 }));
    await act(async () => tree.unmount());
  });
});
