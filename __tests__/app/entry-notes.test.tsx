import renderer, { act } from "react-test-renderer";

const mockUpdateWorkoutExerciseNote = jest.fn();
const mockCompleteExerciseEntry = jest.fn();
const mockGetOpenWorkoutExercise = jest.fn();
const mockListSetsForWorkoutExercise = jest.fn();
const mockGetWorkoutExerciseById = jest.fn();
const mockGetProgrammedExercisesForExerciseOnDate = jest.fn();
const mockResolveWorkoutExerciseIdForCalendarExercise = jest.fn();
const mockEnsureProgramExerciseWorkoutSession = jest.fn();
const mockAppCapabilities = {
  programsExperience: "coming-soon" as "enabled" | "coming-soon",
  healthMetrics: false,
  videoRecording: false,
  thirdPartyImport: false,
  multipleWorkoutSessions: false,
};
const mockParams = { id: "1", name: "Bench Press" };

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
  const React = require("react");
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) =>
      React.useEffect(callback, [callback]),
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
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "kg" }),
}));
jest.mock("../../lib/config/releaseProfile", () => ({
  appCapabilities: mockAppCapabilities,
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }),
}));
jest.mock("../../lib/db/exercises", () => ({
  getExerciseById: jest.fn().mockResolvedValue({ id: 1 }),
  getLastRestSeconds: jest.fn().mockResolvedValue(null),
  setLastRestSeconds: jest.fn(),
}));
jest.mock("../../lib/db/media", () => ({
  listMediaForSet: jest.fn().mockResolvedValue([]),
  listMediaForSetIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../lib/db/programCalendar", () => ({
  deleteUserSet: jest.fn(), getCalendarSetById: jest.fn(),
  getCalendarSetByWorkoutSetId: jest.fn(), getProgrammedExercisesForExerciseOnDate: mockGetProgrammedExercisesForExerciseOnDate,
  listCalendarSetsByWorkoutSetIds: jest.fn().mockResolvedValue([]),
  resolveWorkoutExerciseIdForCalendarExercise: mockResolveWorkoutExerciseIdForCalendarExercise, syncStatusesForCalendarExercise: jest.fn(),
  updateSetActuals: jest.fn(),
}));
jest.mock("../../lib/db/workouts", () => ({
  addSet: jest.fn(), addWorkoutExercise: jest.fn().mockResolvedValue(20),
  completeExerciseEntry: mockCompleteExerciseEntry, deleteSet: jest.fn(), deleteSetsForWorkoutExercise: jest.fn(),
  getOpenWorkoutExercise: mockGetOpenWorkoutExercise,
  getActiveWorkout: jest.fn().mockResolvedValue({ id: 10, startedAt: new Date("2026-09-20T18:00:00").getTime(), completedAt: null, name: "Evening workout" }),
  getWorkoutById: jest.fn().mockResolvedValue({ id: 10, startedAt: new Date("2026-09-20T18:00:00").getTime(), completedAt: null, name: "Evening workout" }),
  getOrCreateActiveWorkout: jest.fn().mockResolvedValue(10),
  getWorkoutExerciseById: mockGetWorkoutExerciseById,
  listSetsForWorkoutExercise: mockListSetsForWorkoutExercise,
  updateExerciseEntryDate: jest.fn(), updateSet: jest.fn(), updateWorkoutExerciseInputs: jest.fn(),
  updateWorkoutExerciseNote: mockUpdateWorkoutExerciseNote,
}));
jest.mock("../../lib/programs/programExerciseHistory", () => ({
  ensureProgramExerciseWorkoutSession: mockEnsureProgramExerciseWorkoutSession, persistCompletedProgramExercise: jest.fn(),
  persistProgramSetToWorkoutHistory: jest.fn(),
}));
jest.mock("../../lib/programs/psl/pslMapper", () => ({
  getIntensityDefaultValue: jest.fn(), getIntensityUnit: jest.fn(),
}));
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

const UnifiedRecordTab = require("../../components/exercise/UnifiedRecordTab").default;


const mockWorkouts = require("../../lib/db/workouts");
const mockSessions = require("../../lib/db/workoutSessions");
const selection = require("../../lib/workouts/selection-store");
async function renderRecordTab() { let tree: ReturnType<typeof renderer.create>; await act(async () => { tree = renderer.create(<UnifiedRecordTab />); }); return tree!; }

describe("historical exercise notes in workout recording", () => {
  beforeEach(() => {
    jest.clearAllMocks(); selection.setSelectedWorkoutId(null);
    mockAppCapabilities.programsExperience = "coming-soon";
    delete (mockParams as Record<string, string | undefined>).weId;
    delete (mockParams as Record<string, string | undefined>).programExerciseId;
    delete (mockParams as Record<string, string | undefined>).dateIso;
    const entry = { id: 20, exerciseId: 1, workoutId: 10, note: "Keep my historical exercise note", currentWeight: null, currentReps: null };
    mockGetOpenWorkoutExercise.mockResolvedValue(entry); mockGetWorkoutExerciseById.mockResolvedValue(entry);
    mockListSetsForWorkoutExercise.mockResolvedValue([{ id: 30, workoutId: 10, workoutExerciseId: 20, note: "Keep my set note", weightKg: 100, reps: 5 }]);
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([]);
    mockResolveWorkoutExerciseIdForCalendarExercise.mockResolvedValue(null);
    mockCompleteExerciseEntry.mockResolvedValue(undefined);
  });

  it("shows stored entry notes read-only and keeps a separate explicitly labeled set note input", async () => {
    const tree = await renderRecordTab();
    expect(tree.root.findAllByProps({ accessibilityLabel: "Exercise note" })).toHaveLength(0);
    expect(tree.root.findAll((node: any) => node.type === "Text" && node.props.children === "Keep my historical exercise note")).toHaveLength(1);
    expect(tree.root.findAllByProps({ placeholder: "Add a set note..." })).toHaveLength(1);
    expect(tree.root.findByType("FlatList").props.data[0].note).toBe("Keep my set note");
    await act(async () => tree.unmount());
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
  });

  it("completes a manual exercise without replacing its historical note", async () => {
    const tree = await renderRecordTab();
    await act(async () => { await tree.root.findByProps({ accessibilityLabel: "Complete Exercise" }).props.onPress(); });
    expect(mockCompleteExerciseEntry).toHaveBeenCalledWith(20, expect.any(Number));
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("preserves a legacy entry's stored day when completing it inside a differently dated workout", async () => {
    const performedAt = new Date("2026-09-19T15:30:00").getTime();
    mockGetOpenWorkoutExercise.mockResolvedValue({ id: 20, exerciseId: 1, workoutId: 10, note: "Historical note", performedAt });
    const tree = await renderRecordTab();
    await act(async () => { await tree.root.findByProps({ accessibilityLabel: "Complete Exercise" }).props.onPress(); });
    expect(mockCompleteExerciseEntry).toHaveBeenCalledWith(20, performedAt);
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("preserves entry and set notes through workout reassignment", async () => {
    const tree = await renderRecordTab();
    const destination = { id: 11, name: "Another workout", startedAt: Date.now(), completedAt: null };
    mockWorkouts.getWorkoutById.mockResolvedValue(destination);
    mockGetWorkoutExerciseById.mockResolvedValue({ id: 20, exerciseId: 1, workoutId: 11, note: "Keep my historical exercise note" });
    await act(async () => { await tree.root.findByType("WorkoutPickerModal").props.onSelect(destination); });
    expect(mockSessions.moveWorkoutExerciseToWorkout).toHaveBeenCalledWith(20, 11);
    expect(tree.root.findByType("FlatList").props.data[0].note).toBe("Keep my set note");
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("reads a linked program entry note without creating or rewriting history", async () => {
    mockAppCapabilities.programsExperience = "enabled";
    Object.assign(mockParams, { programExerciseId: "900", dateIso: "2026-09-20" });
    mockResolveWorkoutExerciseIdForCalendarExercise.mockResolvedValue(20);
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([{
      calendar: { programId: 1, sessionName: "Day 1" }, calendarExercise: { id: 900, status: "pending", exerciseName: "Bench Press" },
      programName: "Program", sets: [],
    }]);
    const tree = await renderRecordTab();
    expect(tree.root.findAll((node: any) => node.type === "Text" && node.props.children === "Keep my historical exercise note")).toHaveLength(1);
    expect(mockEnsureProgramExerciseWorkoutSession).not.toHaveBeenCalled();
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});
