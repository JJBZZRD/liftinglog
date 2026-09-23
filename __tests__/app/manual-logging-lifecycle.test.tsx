import React from "react";
import renderer, { act } from "react-test-renderer";

const mockAddSet = jest.fn();
const mockAddWorkoutExercise = jest.fn();
const mockGetOpenWorkoutExercise = jest.fn();
const mockListSetsForWorkoutExercise = jest.fn();
const mockUpdateExerciseEntryDate = jest.fn();
const mockGetProgrammedExercisesForExerciseOnDate = jest.fn();
const mockPersistProgramSetToWorkoutHistory = jest.fn();
const mockAppCapabilities = {
  programsExperience: "enabled" as "enabled" | "coming-soon",
  healthMetrics: true,
  videoRecording: true,
  thirdPartyImport: true,
  multipleWorkoutSessions: true,
};
const mockParams = { id: "1", name: "Midnight Bench" };
type TestNode = {
  props: Record<string, unknown>;
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
};

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  FlatList: "FlatList",
  Keyboard: { dismiss: jest.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: "AnimatedView" },
  useAnimatedStyle: (value: unknown) => value,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));
jest.mock("../../components/lists/SetItem", () => "SetItem");
jest.mock("../../components/modals/BaseModal", () => "AppModal");
jest.mock("../../components/modals/DatePickerModal", () => "DatePickerModal");
jest.mock("../../components/modals/EditSetModal", () => "EditSetModal");
jest.mock("../../components/TimerModal", () => "TimerModal");
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/config/releaseProfile", () => ({ appCapabilities: mockAppCapabilities }));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }) }));
jest.mock("../../lib/db/exercises", () => ({
  getExerciseById: jest.fn().mockResolvedValue({ id: 1 }),
  getLastRestSeconds: jest.fn().mockResolvedValue(null),
  setLastRestSeconds: jest.fn(),
}));
jest.mock("../../lib/db/media", () => ({ listMediaForSet: jest.fn().mockResolvedValue([]), listMediaForSetIds: jest.fn().mockResolvedValue([]) }));
jest.mock("../../lib/db/programCalendar", () => ({
  deleteUserSet: jest.fn(), getCalendarSetById: jest.fn(), getCalendarSetByWorkoutSetId: jest.fn(),
  getProgrammedExercisesForExerciseOnDate: mockGetProgrammedExercisesForExerciseOnDate, listCalendarSetsByWorkoutSetIds: jest.fn().mockResolvedValue([]),
  resolveWorkoutExerciseIdForCalendarExercise: jest.fn(), syncStatusesForCalendarExercise: jest.fn(), updateSetActuals: jest.fn(),
}));
jest.mock("../../lib/db/workouts", () => ({
  addSet: mockAddSet,
  addWorkoutExercise: mockAddWorkoutExercise,
  completeExerciseEntry: jest.fn(), deleteSet: jest.fn(), deleteSetsForWorkoutExercise: jest.fn(),
  getOpenWorkoutExercise: mockGetOpenWorkoutExercise,
  getActiveWorkout: jest.fn().mockResolvedValue({ id: 10, startedAt: new Date("2026-09-20T18:00:00").getTime(), completedAt: null, name: "Evening workout" }),
  getWorkoutById: jest.fn().mockResolvedValue({ id: 10, startedAt: new Date("2026-09-20T18:00:00").getTime(), completedAt: null, name: "Evening workout" }), getOrCreateActiveWorkout: jest.fn().mockResolvedValue(10),
  getWorkoutExerciseById: jest.fn().mockResolvedValue({ id: 20, exerciseId: 1, workoutId: 10, note: null, currentWeight: null, currentReps: null }),
  listSetsForWorkoutExercise: mockListSetsForWorkoutExercise, updateExerciseEntryDate: mockUpdateExerciseEntryDate, updateSet: jest.fn(),
  updateWorkoutExerciseInputs: jest.fn(), updateWorkoutExerciseNote: jest.fn(),
}));
jest.mock("../../lib/programs/programExerciseHistory", () => ({ ensureProgramExerciseWorkoutSession: jest.fn(), persistCompletedProgramExercise: jest.fn(), persistProgramSetToWorkoutHistory: mockPersistProgramSetToWorkoutHistory }));
jest.mock("../../lib/programs/psl/pslMapper", () => ({ getIntensityDefaultValue: jest.fn(), getIntensityUnit: jest.fn() }));
jest.mock("../../lib/programs/psl/programRuntime", () => ({ refreshUpcomingCalendarForProgram: jest.fn() }));
jest.mock("../../lib/timerStore", () => ({ timerStore: { deleteTimer: jest.fn(), createTimer: jest.fn(), updateTimer: jest.fn(), subscribe: jest.fn(() => jest.fn()) } }));
jest.mock("../../lib/utils/formatters", () => ({ formatRelativeDate: jest.fn(() => "Today"), formatTime: jest.fn(), parseTimerDurationSeconds: jest.fn() }));
jest.mock("../../lib/utils/mediaCleanup", () => ({ deleteAssociatedMediaForSets: jest.fn() }));
jest.mock("../../lib/utils/units", () => ({
  formatEditableWeightFromKg: (value: number) => String(value), formatWeightFromKg: (value: number) => String(value),
  getWeightUnitLabel: () => "kg", parseWeightInputToKg: (value: string) => Number(value),
}));

jest.mock("../../components/workouts/workout-theme", () => ({
  WorkoutThemeBoundary: ({ children }: { children: unknown }) => children,
  useWorkoutTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }),
}));
jest.mock("../../components/exercise/recording/workout-picker-modal", () => "WorkoutPickerModal");
jest.mock("../../lib/db/workoutSessions", () => ({
  getWorkoutSessionDetail: jest.fn().mockResolvedValue(null),
  moveWorkoutExerciseToWorkout: jest.fn().mockResolvedValue(undefined), listWorkoutSessionsForDate: jest.fn().mockResolvedValue([]),
}));

const UnifiedRecordTab = jest.requireActual("../../components/exercise/UnifiedRecordTab").default;


const mockWorkouts = jest.requireMock("../../lib/db/workouts");
const mockSessions = jest.requireMock("../../lib/db/workoutSessions");
const mockCalendar = jest.requireMock("../../lib/db/programCalendar");
const { useRecordingController } = jest.requireActual("../../components/exercise/recording/use-recording-controller");
const selection = jest.requireActual("../../lib/workouts/selection-store");
const activeWorkout = { id: 10, startedAt: new Date("2026-09-20T18:00:00").getTime(), completedAt: null, name: "Evening workout" };
const openEntry = { id: 20, exerciseId: 1, workoutId: 10, note: null, currentWeight: 100, currentReps: 5 };
type Tree = ReturnType<typeof renderer.create>;
async function renderTab() { let tree: Tree; await act(async () => { tree = renderer.create(<UnifiedRecordTab />); }); return tree!; }
async function addSet(tree: Tree) {
  const inputs = tree.root.findAllByType("TextInput");
  await act(async () => { inputs[0].props.onChangeText("100"); inputs[1].props.onChangeText("5"); });
  const button = tree.root.findAllByType("Pressable").find((node: any) => node.findAll((child: any) => child.props.children === "Add Set").length > 0)!;
  await act(async () => { await button.props.onPress(); });
}

describe("workout-aware recording lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks(); selection.setSelectedWorkoutId(null);
    mockAppCapabilities.programsExperience = "enabled"; mockAppCapabilities.videoRecording = true;
    for (const key of Object.keys(mockParams)) delete (mockParams as Record<string, unknown>)[key];
    Object.assign(mockParams, { id: "1", name: "Midnight Bench" });
    mockAddWorkoutExercise.mockResolvedValue(20); mockAddSet.mockResolvedValue(30);
    mockGetOpenWorkoutExercise.mockResolvedValue(null); mockListSetsForWorkoutExercise.mockResolvedValue([]);
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([]);
    mockCalendar.resolveWorkoutExerciseIdForCalendarExercise.mockResolvedValue(null);
    mockWorkouts.getActiveWorkout.mockResolvedValue(activeWorkout);
    mockWorkouts.getWorkoutById.mockImplementation((id: number) => Promise.resolve({ ...activeWorkout, id }));
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue(openEntry);
    mockWorkouts.deleteSet.mockReset();
    mockWorkouts.deleteSetsForWorkoutExercise.mockReset();
    mockSessions.moveWorkoutExerciseToWorkout.mockResolvedValue(undefined);
    jest.useFakeTimers(); jest.setSystemTime(new Date("2026-09-20T23:59:00"));
  });
  afterEach(() => jest.useRealTimers());

  it("opens without creating a workout or an empty exercise entry", async () => {
    const tree = await renderTab();
    expect(mockWorkouts.getOrCreateActiveWorkout).not.toHaveBeenCalled();
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    await addSet(tree);
    expect(mockAddWorkoutExercise).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 10, exercise_id: 1 }));
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 10, workout_exercise_id: 20 }));
    await act(async () => tree.unmount());
  });

  it("opens the camera without creating manual or programmed entries", async () => {
    const tree = await renderTab();
    await act(async () => { tree.root.findByProps({ accessibilityLabel: "Record video" }).props.onPress(); });
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "/exercise/record-video",
      params: expect.objectContaining({ id: "1", workoutId: "10" }),
    }));
    expect(jest.requireMock("expo-router").router.push.mock.calls[0][0].params.workoutExerciseId).toBeUndefined();
    await act(async () => tree.unmount());
  });

  it.each(["", "-1", "Infinity"])("does not create an entry for invalid weight %s", async (weight) => {
    const tree = await renderTab();
    const inputs = tree.root.findAllByType("TextInput");
    await act(async () => { inputs[0].props.onChangeText(weight); inputs[1].props.onChangeText("5"); });
    await act(async () => { await tree.root.findByProps({ accessibilityLabel: "Add Set" }).props.onPress(); });
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    expect(mockAddSet).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ accessibilityLabel: "Complete Exercise" }).props.disabled).toBe(true);
    await act(async () => tree.unmount());
  });

  it("enables completion only after a successful real set, including 0 kg", async () => {
    let saved = false;
    mockListSetsForWorkoutExercise.mockImplementation(async () => saved ? [{ id: 30, weightKg: 0, reps: 5, note: null }] : []);
    mockAddSet.mockRejectedValueOnce(new Error("Write failed")).mockImplementation(async () => { saved = true; return 30; });
    const tree = await renderTab();
    const inputs = tree.root.findAllByType("TextInput");
    await act(async () => { inputs[0].props.onChangeText("0"); inputs[1].props.onChangeText("5"); });
    await act(async () => { await expect(tree.root.findByProps({ accessibilityLabel: "Add Set" }).props.onPress()).rejects.toThrow("Write failed"); });
    expect(tree.root.findByProps({ accessibilityLabel: "Complete Exercise" }).props.disabled).toBe(true);
    await act(async () => { await tree.root.findByProps({ accessibilityLabel: "Add Set" }).props.onPress(); });
    expect(mockAddWorkoutExercise).toHaveBeenCalledTimes(1);
    expect(mockAddSet).toHaveBeenLastCalledWith(expect.objectContaining({ weight_kg: 0, reps: 5, workout_exercise_id: 20 }));
    expect(tree.root.findByProps({ accessibilityLabel: "Complete Exercise" }).props.disabled).toBe(false);
    await act(async () => tree.unmount());
  });

  it("stops treating an open entry as recorded after its last set is deleted and reuses it on the next set", async () => {
    const set = { id: 30, weightKg: 100, reps: 5, note: null };
    let saved = true;
    mockGetOpenWorkoutExercise.mockResolvedValue(openEntry);
    mockListSetsForWorkoutExercise.mockImplementation(async () => saved ? [set] : []);
    mockWorkouts.deleteSet.mockImplementation(async () => { saved = false; });
    mockAddSet.mockImplementation(async () => { saved = true; return 31; });
    let controller: any;
    function Harness() { controller = useRecordingController(); return null; }
    let tree: Tree;
    await act(async () => { tree = renderer.create(<Harness />); });
    expect(controller.hasConfirmedSets).toBe(true);
    await act(async () => { await controller.handleDeleteSetPress(set, 1); });
    await act(async () => { await controller.handleConfirmDeleteSet(); });
    expect(controller.hasConfirmedSets).toBe(false);
    await act(async () => { await controller.handleCompleteManualExercise(); });
    expect(mockWorkouts.completeExerciseEntry).not.toHaveBeenCalled();
    await act(async () => { await controller.handleAddSet(); });
    expect(controller.hasConfirmedSets).toBe(true);
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_exercise_id: 20 }));
    await act(async () => tree!.unmount());
  });

  it.each(["delete", "clear"])("prepares a read-only replacement in the same workout after %s removes the last completed-entry set", async (action) => {
    Object.assign(mockParams, { weId: "42" });
    const set = { id: 30, weightKg: 100, reps: 5, note: null };
    let exists = true;
    mockWorkouts.getWorkoutExerciseById.mockImplementation(async (id: number) => id === 42
      ? exists ? { ...openEntry, id: 42, workoutId: 55, completedAt: Date.now() } : null
      : { ...openEntry, workoutId: 55 });
    mockListSetsForWorkoutExercise.mockImplementation(async () => exists ? [set] : []);
    mockWorkouts.deleteSet.mockImplementation(async () => { exists = false; });
    mockWorkouts.deleteSetsForWorkoutExercise.mockImplementation(async () => { exists = false; });
    let controller: any;
    function Harness() { controller = useRecordingController(); return null; }
    let tree: Tree;
    await act(async () => { tree = renderer.create(<Harness />); });
    if (action === "delete") {
      await act(async () => { await controller.handleDeleteSetPress(set, 1); });
      await act(async () => { await controller.handleConfirmDeleteSet(); });
    } else {
      await act(async () => { await controller.handleConfirmClearSets(); });
    }
    expect(controller.recordLoadError).toBeNull();
    expect(controller.workoutId).toBe(55);
    expect(controller.hasConfirmedSets).toBe(false);
    expect(controller.workoutExerciseId).toBeNull();
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    await act(async () => { controller.setWeight("100"); controller.setReps("5"); });
    await act(async () => { await controller.handleAddSet(); });
    expect(mockAddWorkoutExercise).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 55 }));
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 55, workout_exercise_id: 20 }));
    await act(async () => tree!.unmount());
  });

  it("keeps the workout day when adding a set after midnight", async () => {
    const tree = await renderTab(); jest.setSystemTime(new Date("2026-09-21T00:01:00"));
    await addSet(tree);
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ performed_at: new Date("2026-09-20T12:00:00").getTime() }));
    await act(async () => tree.unmount());
  });

  it("reuses an open entry in the selected workout after reopening past midnight", async () => {
    mockGetOpenWorkoutExercise.mockResolvedValue(openEntry);
    jest.setSystemTime(new Date("2026-09-21T00:01:00"));
    const tree = await renderTab(); await addSet(tree);
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_exercise_id: 20, performed_at: new Date("2026-09-20T12:00:00").getTime() }));
    await act(async () => tree.unmount());
  });

  it("honors an explicitly selected workout before the active fallback", async () => {
    selection.setSelectedWorkoutId(44);
    const tree = await renderTab(); await addSet(tree);
    expect(mockWorkouts.getActiveWorkout).not.toHaveBeenCalled();
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 44 }));
    await act(async () => tree.unmount());
  });

  it("offers Workouts and performs no writes when there is no active workout", async () => {
    mockWorkouts.getActiveWorkout.mockResolvedValue(null);
    const tree = await renderTab();
    expect(tree.root.findAllByProps({ accessibilityLabel: "Open Workouts" })).toHaveLength(1);
    expect(tree.root.findAllByType("TextInput")).toHaveLength(0);
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    expect(mockWorkouts.getOrCreateActiveWorkout).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("requires explicit resume before recording into a completed selected workout", async () => {
    selection.setSelectedWorkoutId(44);
    mockWorkouts.getWorkoutById.mockResolvedValue({ ...activeWorkout, id: 44, completedAt: Date.now() });
    const tree = await renderTab();
    expect(tree.root.findAllByProps({ accessibilityLabel: "Open Workouts" })).toHaveLength(1);
    expect(tree.root.findAllByType("TextInput")).toHaveLength(0);
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("retains the explicit repeated entry and its own workout instead of taking an open sibling", async () => {
    Object.assign(mockParams, { weId: "42" });
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue({ ...openEntry, id: 42, workoutId: 55 });
    const tree = await renderTab(); await addSet(tree);
    expect(mockGetOpenWorkoutExercise).not.toHaveBeenCalled();
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 55, workout_exercise_id: 42 }));
    await act(async () => tree.unmount());
  });

  it("moves the current entry to another workout on the same day, retaining its ID", async () => {
    mockGetOpenWorkoutExercise.mockResolvedValue(openEntry);
    const tree = await renderTab();
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue({ ...openEntry, workoutId: 11 });
    await act(async () => { await tree.root.findByType("WorkoutPickerModal").props.onSelect({ ...activeWorkout, id: 11 }); });
    expect(mockSessions.moveWorkoutExerciseToWorkout).toHaveBeenCalledWith(20, 11);
    expect(mockUpdateExerciseEntryDate).not.toHaveBeenCalled();
    expect(selection.getSelectedWorkoutId()).toBe(11);
    await addSet(tree);
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 11, workout_exercise_id: 20 }));
    await act(async () => tree.unmount());
  });

  it("uses the destination workout day for new sets after a cross-day move", async () => {
    mockGetOpenWorkoutExercise.mockResolvedValue(openEntry);
    const tree = await renderTab();
    const target = { ...activeWorkout, id: 11, startedAt: new Date("2026-09-19T08:30:00").getTime() };
    mockWorkouts.getWorkoutById.mockResolvedValue(target);
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue({ ...openEntry, workoutId: 11 });
    await act(async () => { await tree.root.findByType("WorkoutPickerModal").props.onSelect(target); });
    await addSet(tree);
    expect(mockSessions.moveWorkoutExerciseToWorkout).toHaveBeenCalledWith(20, 11);
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 11, performed_at: new Date("2026-09-19T12:00:00").getTime() }));
    await act(async () => tree.unmount());
  });

  it("keeps ownership unchanged when the move fails", async () => {
    mockGetOpenWorkoutExercise.mockResolvedValue(openEntry);
    const tree = await renderTab();
    mockSessions.moveWorkoutExerciseToWorkout.mockRejectedValue(new Error("Resume destination first"));
    await act(async () => { await expect(tree.root.findByType("WorkoutPickerModal").props.onSelect({ ...activeWorkout, id: 11 })).rejects.toThrow("Resume destination first"); });
    expect(selection.getSelectedWorkoutId()).toBeNull();
    await addSet(tree);
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 10 }));
    await act(async () => tree.unmount());
  });

  it("keeps MVP routes out of program hydration and hides video recording", async () => {
    mockAppCapabilities.programsExperience = "coming-soon"; mockAppCapabilities.videoRecording = false;
    Object.assign(mockParams, { programExerciseId: "999", dateIso: "2026-09-18" });
    const tree = await renderTab(); await addSet(tree);
    expect(mockGetProgrammedExercisesForExerciseOnDate).not.toHaveBeenCalled();
    expect(mockPersistProgramSetToWorkoutHistory).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ accessibilityLabel: "Record video" })).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it("retains explicit program lookup and the video control in the full profile", async () => {
    Object.assign(mockParams, { programExerciseId: "999", dateIso: "2026-09-18" });
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([{
      calendar: { programId: 1, sessionName: "Day 1" }, calendarExercise: { id: 999, status: "pending", exerciseName: "Midnight Bench" },
      programName: "Full Program", sets: [],
    }]);
    const tree = await renderTab();
    expect(mockGetProgrammedExercisesForExerciseOnDate).toHaveBeenCalledWith(expect.objectContaining({ dateIso: "2026-09-18", exerciseId: 1 }));
    expect(tree.root.findAllByProps({ accessibilityLabel: "Record video" })).toHaveLength(1);
    await act(async () => { tree.root.findByProps({ accessibilityLabel: "Record video" }).props.onPress(); });
    expect(jest.requireMock("../../lib/programs/programExerciseHistory").ensureProgramExerciseWorkoutSession).not.toHaveBeenCalled();
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ programExerciseId: "999" }) }));
    await act(async () => tree.unmount());
  });

  it("creates a distinct entry only after explicitly choosing Add another entry", async () => {
    Object.assign(mockParams, { weId: "42" });
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue({ ...openEntry, id: 42, completedAt: Date.now() });
    const tree = await renderTab();
    expect(tree.root.findAllByProps({ accessibilityLabel: "Add Set" })).toHaveLength(0);
    await act(async () => { tree.root.findByProps({ accessibilityLabel: "Add another entry" }).props.onPress(); });
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue(openEntry);
    await addSet(tree);
    expect(mockAddWorkoutExercise).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 10, exercise_id: 1 }));
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_exercise_id: 20 }));
    await act(async () => tree.unmount());
  });

  it("does not move the next route's entry after a deferred target lookup", async () => {
    mockGetOpenWorkoutExercise.mockResolvedValue(openEntry);
    const tree = await renderTab();
    let resolveTarget: (value: unknown) => void;
    mockWorkouts.getWorkoutById.mockImplementation((id: number) => id === 11 ? new Promise(resolve => { resolveTarget = resolve; }) : Promise.resolve(activeWorkout));
    let result: Promise<unknown>;
    await act(async () => { result = tree.root.findByType("WorkoutPickerModal").props.onSelect({ ...activeWorkout, id: 11 }).catch((error: Error) => error); });
    Object.assign(mockParams, { weId: "42" });
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue({ ...openEntry, id: 42 });
    await act(async () => { tree.update(<UnifiedRecordTab />); });
    await act(async () => { resolveTarget!({ ...activeWorkout, id: 11 }); await result!; });
    expect(mockSessions.moveWorkoutExerciseToWorkout).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("does not finish a pending manual entry creation into the previous workout", async () => {
    const tree = await renderTab();
    let resolveOpen: (value: null) => void;
    mockGetOpenWorkoutExercise.mockImplementationOnce(() => new Promise(resolve => { resolveOpen = resolve; }));
    const inputs = tree.root.findAllByType("TextInput");
    await act(async () => { inputs[0].props.onChangeText("100"); inputs[1].props.onChangeText("5"); });
    let add: Promise<void>;
    await act(async () => { add = tree.root.findByProps({ accessibilityLabel: "Add Set" }).props.onPress(); });
    await act(async () => { await tree.root.findByType("WorkoutPickerModal").props.onSelect({ ...activeWorkout, id: 11 }); });
    await act(async () => { resolveOpen!(null); await add!; });
    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    expect(mockAddSet).not.toHaveBeenCalled();
    await addSet(tree);
    expect(mockAddSet).toHaveBeenCalledWith(expect.objectContaining({ workout_id: 11 }));
    await act(async () => tree.unmount());
  });

  it("coalesces a program blur/autosave and waits for it before moving the entry", async () => {
    Object.assign(mockParams, { programExerciseId: "900", dateIso: "2026-09-20" });
    const prescribed = { id: 901, calendarExerciseId: 900, isLogged: false, setId: null, isUserAdded: false, prescribedReps: "5" };
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([{ calendar: { programId: 1, sessionName: "Day 1" }, calendarExercise: { id: 900, status: "pending", exerciseName: "Midnight Bench" }, programName: "Program", sets: [prescribed] }]);
    mockCalendar.resolveWorkoutExerciseIdForCalendarExercise.mockResolvedValue(20);
    mockCalendar.getCalendarSetById.mockResolvedValue(prescribed);
    let resolveSave: (value: unknown) => void;
    mockPersistProgramSetToWorkoutHistory.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
    let controller: any;
    function Harness() { controller = useRecordingController(); return null; }
    let tree: Tree;
    await act(async () => { tree = renderer.create(<Harness />); });
    await act(async () => { controller.handleProgramWeightChange(901, "100"); controller.handleProgramRepsChange(901, "5"); });
    let first: Promise<void>, second: Promise<void>, move: Promise<void>;
    await act(async () => { first = controller.commitProgramSetChanges(901, { skipReload: true }); second = controller.commitProgramSetChanges(901, { skipReload: true }); });
    await act(async () => { move = controller.selectWorkout({ ...activeWorkout, id: 11 }); });
    expect(mockPersistProgramSetToWorkoutHistory).toHaveBeenCalledTimes(1);
    expect(mockSessions.moveWorkoutExerciseToWorkout).not.toHaveBeenCalled();
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue({ ...openEntry, workoutId: 11 });
    await act(async () => { resolveSave!({ workoutExerciseId: 20, linkedSetId: 30 }); await Promise.all([first!, second!, move!]); });
    expect(mockPersistProgramSetToWorkoutHistory).toHaveBeenCalledTimes(1);
    expect(mockSessions.moveWorkoutExerciseToWorkout).toHaveBeenCalledWith(20, 11);
    await act(async () => tree!.unmount());
  });

  it("resolves an active parent for a new program entry instead of inheriting the previous completed workout", async () => {
    Object.assign(mockParams, { programExerciseId: "900", dateIso: "2026-09-18" });
    const entries = [900, 910].map(id => ({ calendar: { programId: 1, sessionName: "Day " + id }, calendarExercise: { id, status: "pending", exerciseName: "Midnight Bench" }, programName: "Program", sets: [] }));
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue(entries);
    mockCalendar.resolveWorkoutExerciseIdForCalendarExercise.mockImplementation((id: number) => Promise.resolve(id === 900 ? 20 : null));
    mockWorkouts.getWorkoutExerciseById.mockResolvedValue({ ...openEntry, workoutId: 44 });
    mockWorkouts.getWorkoutById.mockImplementation((id: number) => Promise.resolve(id === 44 ? { ...activeWorkout, id: 44, completedAt: Date.now() } : activeWorkout));
    let controller: any;
    function Harness() { controller = useRecordingController(); return null; }
    let tree: Tree;
    await act(async () => { tree = renderer.create(<Harness />); });
    expect(controller.workout.id).toBe(44);
    await act(async () => { await controller.handleSelectProgramExercise(910); });
    expect(controller.workout.id).toBe(10);
    expect(controller.workout.completedAt).toBeNull();
    expect(controller.entryIdRef.current).toBeNull();
    expect(controller.selectedDate.getTime()).toBe(new Date("2026-09-20T12:00:00").getTime());
    await act(async () => tree!.unmount());
  });

});
