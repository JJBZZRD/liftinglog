import React from "react";
import renderer, { act } from "react-test-renderer";

type TestNode = { type: unknown; props: Record<string, unknown> };
type RenderedTree = ReturnType<typeof renderer.create>;

const mockGetExerciseHistory = jest.fn();
const mockGetExerciseScopeIdsForView = jest.fn();
const mockGetCurrentPBEventsForExercise = jest.fn();
const mockGetWorkoutDayPage = jest.fn();
const mockListMediaForSetIds = jest.fn();
const mockRouterPush = jest.fn();

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => {
  const React = require("react");
  return {
    ActivityIndicator: "ActivityIndicator",
    Alert: { alert: jest.fn() },
    FlatList: ({ data, renderItem, ...props }: any) =>
      React.createElement(
        "FlatList",
        { ...props, data },
        data.map((item: unknown, index: number) =>
          React.createElement(React.Fragment, { key: index }, renderItem({ item, index }))
        )
      ),
    Modal: "Modal",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: "Text",
    TextInput: "TextInput",
    TouchableWithoutFeedback: "TouchableWithoutFeedback",
    View: "View",
  };
});
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: { View: "AnimatedView" },
    Easing: { bezier: jest.fn() },
    interpolate: jest.fn(() => 0),
    useAnimatedStyle: jest.fn(() => ({})),
    useSharedValue: jest.fn(() => ({ value: 0 })),
    withTiming: jest.fn((value) => value),
  };
});
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: "StackScreen" },
    router: { back: jest.fn(), push: mockRouterPush, setParams: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ id: "8", dayKey: "2026-09-23" }),
  };
});
jest.mock("../../components/exercise/VariationExerciseLabel", () => (props: any) =>
  require("react").createElement("VariationExerciseLabel", props, props.exercise.name)
);
jest.mock("../../components/lists/SetItem", () => (props: any) =>
  require("react").createElement("SetItem", props)
);
jest.mock("../../components/modals/BaseModal", () => "BaseModal");
jest.mock("../../components/modals/DatePickerModal", () => "DatePickerModal");
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "kg" }),
}));
jest.mock("../../lib/db/exercises", () => ({ getExerciseScopeIdsForView: mockGetExerciseScopeIdsForView }));
jest.mock("../../lib/db/media", () => ({ listMediaForSetIds: mockListMediaForSetIds }));
jest.mock("../../lib/db/pbEvents", () => ({ getCurrentPBEventsForExercise: mockGetCurrentPBEventsForExercise }));
jest.mock("../../lib/db/workouts", () => ({
  dayKeyToTimestamp: () => new Date(2026, 8, 23).getTime(),
  deleteWorkoutExercise: jest.fn(),
  getExerciseHistory: mockGetExerciseHistory,
  getWorkoutDayPage: mockGetWorkoutDayPage,
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }),
}));
jest.mock("../../lib/utils/units", () => ({
  convertWeightToKg: (value: number) => value,
  formatVolumeFromKg: (value: number) => String(value),
  formatWeightFromKg: (value: number | null | undefined) => (value == null ? "--" : String(value)),
  getWeightUnitLabel: () => "kg",
}));

const HistoryTab = require("../../app/exercise/tabs/HistoryTab").default;
const WorkoutDayScreen = require("../../app/workout/[dayKey]").default;

const getTextContent = (children: unknown): string =>
  Array.isArray(children) ? children.map(getTextContent).join("") : String(children ?? "");

const findText = (tree: RenderedTree, value: string) =>
  tree.root.findAll((node: TestNode) =>
    node.type === "Text" && getTextContent(node.props.children) === value
  );

const timestamp = new Date(2026, 8, 23, 8).getTime();

describe("history note display", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExerciseScopeIdsForView.mockResolvedValue([8]);
    mockGetCurrentPBEventsForExercise.mockResolvedValue(new Map());
    mockListMediaForSetIds.mockResolvedValue([]);
  });

  it("shows separately labelled workout and exercise notes in exercise history without changing set-note rendering", async () => {
    mockGetExerciseHistory.mockResolvedValue([
      {
        workout: { id: 41, startedAt: timestamp, note: "workout note\nwith detail" },
        workoutExercise: { id: 101, workoutId: 41, performedAt: timestamp, completedAt: null, note: "exercise entry note" },
        sets: [{ id: 1, weightKg: 100, reps: 5, note: "set note" }],
        loggedExerciseId: 8,
        loggedExerciseName: "Bench Press",
        loggedExerciseVariationLabel: null,
        loggedExerciseParentExerciseId: null,
        loggedExerciseParentName: null,
        isVariation: false,
      },
    ]);

    let tree: RenderedTree;
    await act(async () => {
      tree = renderer.create(<HistoryTab />);
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(findText(tree!, "Workout Note")).toHaveLength(1);
    expect(findText(tree!, "workout note\nwith detail")).toHaveLength(1);
    expect(findText(tree!, "Exercise Note")).toHaveLength(1);
    expect(findText(tree!, "exercise entry note")).toHaveLength(1);
    expect(tree!.root.findByType("SetItem").props.note).toBe("set note");
    expect(findText(tree!, "In Progress")).toHaveLength(1);
    await act(async () => tree!.unmount());
  });

  it("maps same-day workout envelopes and same-named entries by their own IDs, omitting empty notes", async () => {
    mockGetWorkoutDayPage.mockResolvedValue({
      dayKey: "2026-09-23",
      displayDate: timestamp,
      totals: { totalExercises: 3, totalSets: 3, totalReps: 15, totalVolumeKg: 1500, bestE1rmKg: 117 },
      entries: [
        {
          workoutId: 41, workoutNote: "morning workout", workoutExerciseId: 101, exerciseId: 8,
          exerciseName: "Bench Press", exerciseVariationLabel: null, exerciseParentExerciseId: null, exerciseParentName: null,
          isVariation: false, performedAt: timestamp, completedAt: timestamp, note: "morning bench", totalSets: 1,
          totalReps: 5, totalVolumeKg: 500, bestSet: null, sets: [{ id: 1, weightKg: 100, reps: 5, note: "morning set" }],
        },
        {
          workoutId: 42, workoutNote: "evening workout", workoutExerciseId: 102, exerciseId: 8,
          exerciseName: "Bench Press", exerciseVariationLabel: null, exerciseParentExerciseId: null, exerciseParentName: null,
          isVariation: false, performedAt: timestamp + 60_000, completedAt: null, note: "evening bench", totalSets: 1,
          totalReps: 5, totalVolumeKg: 500, bestSet: null, sets: [{ id: 2, weightKg: 100, reps: 5, note: "evening set" }],
        },
        {
          workoutId: 42, workoutNote: "evening workout", workoutExerciseId: 103, exerciseId: 8,
          exerciseName: "Bench Press", exerciseVariationLabel: null, exerciseParentExerciseId: null, exerciseParentName: null,
          isVariation: false, performedAt: timestamp + 120_000, completedAt: timestamp, note: "   ", totalSets: 1,
          totalReps: 5, totalVolumeKg: 500, bestSet: null, sets: [{ id: 3, weightKg: 100, reps: 5, note: "later set" }],
        },
      ],
      hasMore: false,
    });

    let tree: RenderedTree;
    await act(async () => {
      tree = renderer.create(<WorkoutDayScreen />);
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(mockGetWorkoutDayPage).toHaveBeenCalledWith("2026-09-23");
    expect(findText(tree!, "morning workout")).toHaveLength(1);
    expect(findText(tree!, "morning bench")).toHaveLength(1);
    expect(findText(tree!, "evening workout")).toHaveLength(2);
    expect(findText(tree!, "evening bench")).toHaveLength(1);
    expect(findText(tree!, "   ")).toHaveLength(0);
    const setItems = tree!.root.findAll((node: TestNode) => node.type === "SetItem");
    expect(setItems.map((node: TestNode) => node.props.note)).toEqual(["morning set", "evening set", "later set"]);

    const editButtons = tree!.root.findAll((node: TestNode) =>
      node.type === "Pressable" && node.props.onPress && node.props.hitSlop === 8
    );
    await act(async () => (editButtons[0].props.onPress as () => void)());
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/edit-workout",
      params: { workoutExerciseId: "101", exerciseName: "Bench Press" },
    });
    await act(async () => tree!.unmount());
  });
});
