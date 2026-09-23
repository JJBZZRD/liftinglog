/* eslint-disable @typescript-eslint/no-require-imports, import/first */

import React from "react";
import renderer, { act } from "react-test-renderer";

const mockParams: { id?: string; name?: string } = { id: "1", name: "Bench Press" };
const mockGetExerciseById = jest.fn();
const mockGetOrCreateActiveWorkout = jest.fn();
const mockGetOpenWorkoutExercise = jest.fn();
const mockAddWorkoutExercise = jest.fn();
const mockGetWorkoutExerciseById = jest.fn();
const mockAddSet = jest.fn();
const mockUpdateWorkoutExerciseInputs = jest.fn();
const mockUpdateWorkoutExerciseNote = jest.fn();
let mockIsFocused = true;
const mockFocusSubscribers = new Set<() => void>();

function setFocused(nextFocused: boolean) {
  mockIsFocused = nextFocused;
  mockFocusSubscribers.forEach((subscriber) => subscriber());
}

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
    router: { back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn(), push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => {
      const [focusVersion, setFocusVersion] = React.useState(0);
      React.useEffect(() => {
        const subscriber = () => setFocusVersion((version: number) => version + 1);
        mockFocusSubscribers.add(subscriber);
        return () => mockFocusSubscribers.delete(subscriber);
      }, []);
      React.useEffect(() => {
        if (!mockIsFocused) {
          return;
        }
        return callback();
      }, [callback, focusVersion]);
    },
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
jest.mock("../../lib/config/releaseProfile", () => ({
  appCapabilities: {
    programsExperience: "coming-soon",
    healthMetrics: true,
    videoRecording: false,
    thirdPartyImport: true,
    multipleWorkoutSessions: true,
  },
}));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }) }));
jest.mock("../../lib/db/exercises", () => ({
  getExerciseById: mockGetExerciseById,
  getLastRestSeconds: jest.fn().mockResolvedValue(null),
  setLastRestSeconds: jest.fn(),
}));
jest.mock("../../lib/db/media", () => ({ listMediaForSet: jest.fn().mockResolvedValue([]), listMediaForSetIds: jest.fn().mockResolvedValue([]) }));
jest.mock("../../lib/db/programCalendar", () => ({
  deleteUserSet: jest.fn(), getCalendarSetById: jest.fn(), getCalendarSetByWorkoutSetId: jest.fn(),
  getProgrammedExercisesForExerciseOnDate: jest.fn().mockResolvedValue([]), listCalendarSetsByWorkoutSetIds: jest.fn().mockResolvedValue([]),
  resolveWorkoutExerciseIdForCalendarExercise: jest.fn(), syncStatusesForCalendarExercise: jest.fn(), updateSetActuals: jest.fn(),
}));
jest.mock("../../lib/db/workouts", () => ({
  addSet: mockAddSet,
  addWorkoutExercise: mockAddWorkoutExercise,
  completeExerciseEntry: jest.fn(),
  deleteSet: jest.fn(),
  deleteSetsForWorkoutExercise: jest.fn(),
  getOpenWorkoutExercise: mockGetOpenWorkoutExercise,
  getActiveWorkout: jest.fn().mockResolvedValue({ id: 10, startedAt: new Date("2026-09-20T18:00:00").getTime(), completedAt: null, name: "Evening workout" }),
  getWorkoutById: jest.fn().mockResolvedValue({ id: 10, startedAt: new Date("2026-09-20T18:00:00").getTime(), completedAt: null, name: "Evening workout" }),
  getOrCreateActiveWorkout: mockGetOrCreateActiveWorkout,
  getWorkoutExerciseById: mockGetWorkoutExerciseById,
  listSetsForWorkoutExercise: jest.fn().mockResolvedValue([]),
  updateExerciseEntryDate: jest.fn(),
  updateSet: jest.fn(),
  updateWorkoutExerciseInputs: mockUpdateWorkoutExerciseInputs,
  updateWorkoutExerciseNote: mockUpdateWorkoutExerciseNote,
}));
jest.mock("../../lib/programs/programExerciseHistory", () => ({ ensureProgramExerciseWorkoutSession: jest.fn(), persistCompletedProgramExercise: jest.fn(), persistProgramSetToWorkoutHistory: jest.fn() }));
jest.mock("../../lib/programs/psl/pslMapper", () => ({ getIntensityDefaultValue: jest.fn(), getIntensityUnit: jest.fn() }));
jest.mock("../../lib/programs/psl/programRuntime", () => ({ refreshUpcomingCalendarForProgram: jest.fn() }));
jest.mock("../../lib/timerStore", () => ({ timerStore: { deleteTimer: jest.fn(), createTimer: jest.fn(), updateTimer: jest.fn(), subscribe: jest.fn(() => jest.fn()) } }));
jest.mock("../../lib/utils/formatters", () => ({ formatRelativeDate: jest.fn(() => "Today"), formatTime: jest.fn(), parseTimerDurationSeconds: jest.fn() }));
jest.mock("../../lib/utils/mediaCleanup", () => ({ deleteAssociatedMediaForSets: jest.fn() }));
jest.mock("../../lib/utils/units", () => ({
  formatEditableWeightFromKg: (value: number) => String(value),
  formatWeightFromKg: (value: number) => String(value),
  getWeightUnitLabel: () => "kg",
  parseWeightInputToKg: (value: string) => Number(value),
}));

import { parseExerciseRouteId } from "../../lib/routing/exerciseRouteId";

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
const mockRouter = require("expo-router").router;
type RenderTree = ReturnType<typeof renderer.create>;

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function expectNoHistoryWrites() {
  expect(mockGetOrCreateActiveWorkout).not.toHaveBeenCalled();
  expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
  expect(mockAddSet).not.toHaveBeenCalled();
  expect(mockUpdateWorkoutExerciseInputs).not.toHaveBeenCalled();
  expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
}

describe("invalid exercise route protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFocused = true;
    mockParams.id = "1";
    mockParams.name = "Bench Press";
    mockGetExerciseById.mockResolvedValue({ id: 1 });
    mockGetOrCreateActiveWorkout.mockResolvedValue(10);
    mockWorkouts.getActiveWorkout.mockResolvedValue({ id: 10, startedAt: Date.now(), completedAt: null });
    mockGetOpenWorkoutExercise.mockResolvedValue(null);
    mockAddWorkoutExercise.mockResolvedValue(20);
    mockGetWorkoutExerciseById.mockResolvedValue({ id: 20, exerciseId: 1, workoutId: 10, note: null, currentWeight: null, currentReps: null });
    mockAddSet.mockResolvedValue(30);
    mockRouter.canGoBack.mockReturnValue(true);
  });

  it("accepts only positive safe decimal route IDs", () => {
    expect(parseExerciseRouteId("001")).toBe(1);
    for (const value of [undefined, ["1"], "", "0", "-1", "1.5", "1e3", "1abc", " 1", "9007199254740992"]) {
      expect(parseExerciseRouteId(value)).toBeNull();
    }
  });

  it.each([
    ["malformed", "1abc", undefined],
    ["deleted", "1900012", null],
  ])("does not initialize logging for a %s route", async (_kind, id, lookupResult) => {
    mockParams.id = id;
    mockGetExerciseById.mockResolvedValue(lookupResult);

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await flushEffects();

    expectNoHistoryWrites();
    expect(tree!.root.findAll((node: any) => node.type === "Text" && String(node.props.children).includes("exercise"))).not.toHaveLength(0);
    await act(async () => tree!.unmount());
  });

  it("contains catalog read failures and leaves every history write untouched", async () => {
    mockGetExerciseById.mockRejectedValue(new Error("database unavailable"));

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await flushEffects();

    expectNoHistoryWrites();
    expect(tree!.root.findAllByProps({ accessibilityLabel: "Retry loading exercise" })).toHaveLength(1);
    await act(async () => tree!.unmount());
  });

  it("waits for the current route lookup before hydrating its workout", async () => {
    let resolveFirst: ((value: { id: number }) => void) | undefined;
    let resolveSecond: ((value: { id: number }) => void) | undefined;
    mockGetExerciseById.mockImplementation((id: number) =>
      new Promise((resolve) => {
        if (id === 1) {
          resolveFirst = resolve;
        } else {
          resolveSecond = resolve;
        }
      })
    );

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    mockParams.id = "2";
    await act(async () => {
      tree!.update(<UnifiedRecordTab />);
    });

    await act(async () => {
      resolveFirst?.({ id: 1 });
      await Promise.resolve();
    });
    expectNoHistoryWrites();

    await act(async () => {
      resolveSecond?.({ id: 2 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetOpenWorkoutExercise).toHaveBeenCalledWith(10, 2);
    expectNoHistoryWrites();
    expect(mockAddWorkoutExercise).not.toHaveBeenCalledWith(expect.objectContaining({ exercise_id: 1 }));
    await act(async () => tree!.unmount());
  });

  it("hydrates after a valid catalog lookup without creating an empty entry", async () => {
    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await flushEffects();

    expect(mockWorkouts.getActiveWorkout).toHaveBeenCalledTimes(1);
    expect(mockGetOpenWorkoutExercise).toHaveBeenCalledWith(10, 1);
    expectNoHistoryWrites();
    await act(async () => tree!.unmount());
  });

  it("does not expose a stale open entry after a replacement route", async () => {
    let resolveOpen: (value: unknown) => void;
    mockGetOpenWorkoutExercise.mockImplementation(() => new Promise(resolve => { resolveOpen = resolve; }));
    let tree: RenderTree;
    await act(async () => { tree = renderer.create(<UnifiedRecordTab />); });
    mockGetExerciseById.mockImplementation(() => new Promise(() => {}));
    mockParams.id = "2";
    await act(async () => { tree!.update(<UnifiedRecordTab />); });
    await act(async () => { resolveOpen!({ id: 20, exerciseId: 1, workoutId: 10, note: "Old entry" }); });
    expect(tree!.root.findAllByType("TextInput")).toHaveLength(0);
    expectNoHistoryWrites();
    await act(async () => tree!.unmount());
  });

  it("contains a manual initializer rejection and retries from the real record tab", async () => {
    mockWorkouts.getActiveWorkout
      .mockRejectedValueOnce(new Error("workout unavailable"))
      .mockResolvedValueOnce({ id: 10, startedAt: Date.now(), completedAt: null });

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await flushEffects();

    const retry = tree!.root.findByProps({ accessibilityLabel: "Retry loading exercise" });
    await act(async () => {
      retry.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWorkouts.getActiveWorkout).toHaveBeenCalledTimes(2);
    expect(mockGetOpenWorkoutExercise).toHaveBeenCalledWith(10, 1);
    expectNoHistoryWrites();
    await act(async () => tree!.unmount());
  });

  it("does not add an entry when a deferred open-entry read completes after blur", async () => {
    let resolveOpenEntry: ((value: null) => void) | undefined;
    mockGetOpenWorkoutExercise.mockImplementation(
      () => new Promise((resolve) => {
        resolveOpenEntry = resolve;
      })
    );

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await flushEffects();
    expect(mockGetOpenWorkoutExercise).toHaveBeenCalled();

    await act(async () => {
      setFocused(false);
    });
    await act(async () => {
      resolveOpenEntry?.(null);
      await Promise.resolve();
    });

    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
  });

  it("does not add an entry when a deferred open-entry read completes after unmount", async () => {
    let resolveOpenEntry: ((value: null) => void) | undefined;
    mockGetOpenWorkoutExercise.mockImplementation(
      () => new Promise((resolve) => {
        resolveOpenEntry = resolve;
      })
    );

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await flushEffects();
    await act(async () => tree!.unmount());
    await act(async () => {
      resolveOpenEntry?.(null);
      await Promise.resolve();
    });

    expect(mockAddWorkoutExercise).not.toHaveBeenCalled();
  });

  it("does not initialize after refocus when the formerly valid exercise was deleted", async () => {
    mockGetOpenWorkoutExercise.mockResolvedValue({
      id: 20,
      workoutId: 10,
      note: null,
      currentWeight: null,
      currentReps: null,
    });

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await flushEffects();
    jest.clearAllMocks();
    mockGetExerciseById.mockResolvedValueOnce(null);

    await act(async () => {
      setFocused(false);
      setFocused(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expectNoHistoryWrites();
    await act(async () => tree!.unmount());
  });

  it("preserves historical notes on blur without writing them", async () => {
    mockGetOpenWorkoutExercise.mockResolvedValue({ id: 20, exerciseId: 1, workoutId: 10, note: "Keep this note", currentWeight: null, currentReps: null });
    let tree: RenderTree;
    await act(async () => { tree = renderer.create(<UnifiedRecordTab />); });
    expect(tree!.root.findAllByProps({ accessibilityLabel: "Exercise note" })).toHaveLength(0);
    expect(tree!.root.findAll((node: any) => node.type === "Text" && node.props.children === "Keep this note")).toHaveLength(1);
    await act(async () => { setFocused(false); });
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
  });

  it("returns a cold standalone link to Exercises", async () => {
    mockParams.id = "1abc";
    mockRouter.canGoBack.mockReturnValue(false);

    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });
    await act(async () => {
      tree!.root.findByProps({ accessibilityLabel: "Go back" }).props.onPress();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/exercises");
    await act(async () => tree!.unmount());
  });
});
