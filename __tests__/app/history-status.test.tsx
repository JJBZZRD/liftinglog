import React from "react";
import renderer, { act } from "react-test-renderer";

type TestNode = { type: unknown; props: Record<string, unknown> };
type RenderedTree = ReturnType<typeof renderer.create>;

const mockGetLastWorkoutDay = jest.fn();
const mockGetQuickStats = jest.fn();
const mockGetTotalPBCount = jest.fn();
const mockGetLatestUserMetricsSnapshot = jest.fn();
const mockListWorkoutDays = jest.fn();
const mockSearchWorkoutDays = jest.fn();
const mockGetWorkoutDayDetails = jest.fn();
const mockGetWorkoutDayPage = jest.fn();
const mockListMediaForSetIds = jest.fn();
const mockRouterPush = jest.fn();

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => {
  const React = require("react");
  return {
    ActivityIndicator: "ActivityIndicator",
    Alert: { alert: jest.fn() },
    FlatList: React.forwardRef(({ data, renderItem, ...props }: any, _ref: unknown) =>
      React.createElement(
        "FlatList",
        { ...props, data },
        data.map((item: unknown, index: number) =>
          React.createElement(React.Fragment, { key: index }, renderItem({ item, index }))
        )
      )
    ),
    LayoutAnimation: { configureNext: jest.fn(), Presets: { easeInEaseOut: {} } },
    Platform: { OS: "ios" },
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: "Text",
    TextInput: "TextInput",
    TouchableWithoutFeedback: "TouchableWithoutFeedback",
    View: "View",
  };
});
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: "StackScreen" },
    router: { back: jest.fn(), push: mockRouterPush },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ dayKey: "2026-09-20" }),
  };
});
jest.mock("../../components/exercise/VariationExerciseLabel", () => (props: any) =>
  require("react").createElement("VariationExerciseLabel", props, props.exercise.name)
);
jest.mock("../../components/calculators/CalculatorsSummaryCard", () => "CalculatorsSummaryCard");
jest.mock("../../components/lists/SetItem", () => "SetItem");
jest.mock("../../components/modals/BaseModal", () => "BaseModal");
jest.mock("../../components/modals/DatePickerModal", () => "DatePickerModal");
jest.mock("../../lib/config/releaseProfile", () => ({ appCapabilities: { healthMetrics: false } }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "kg" }),
}));
jest.mock("../../lib/db/media", () => ({ listMediaForSetIds: mockListMediaForSetIds }));
jest.mock("../../lib/db/pbEvents", () => ({ getTotalPBCount: mockGetTotalPBCount }));
jest.mock("../../lib/db/userCheckins", () => ({ getLatestUserMetricsSnapshot: mockGetLatestUserMetricsSnapshot }));
jest.mock("../../lib/db/workouts", () => ({
  dayKeyToTimestamp: () => new Date(2026, 8, 20).getTime(),
  deleteWorkoutExercise: jest.fn(),
  getLastWorkoutDay: mockGetLastWorkoutDay,
  getQuickStats: mockGetQuickStats,
  getWorkoutDayDetails: mockGetWorkoutDayDetails,
  getWorkoutDayPage: mockGetWorkoutDayPage,
  listWorkoutDays: mockListWorkoutDays,
  searchWorkoutDays: mockSearchWorkoutDays,
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }),
}));
jest.mock("../../lib/utils/layoutAnimation", () => ({
  enableLegacyAndroidLayoutAnimationsIfNeeded: jest.fn(),
}));
jest.mock("../../lib/utils/units", () => ({
  formatVolumeFromKg: (value: number) => String(value),
  formatWeightFromKg: (value: number | null | undefined) => value == null ? "--" : String(value),
  getWeightUnitLabel: () => "kg",
}));

const WorkoutHistoryScreen = require("../../app/workout-history").default;
const WorkoutDayScreen = require("../../app/workout/[dayKey]").default;
const OverviewScreen = require("../../app/(tabs)/index").default;

const completedAt = new Date(2026, 8, 20, 9).getTime();
const sharedExerciseId = 8;

const completedEntry = {
  workoutExerciseId: 101,
  exerciseId: sharedExerciseId,
  exerciseName: "Bench Press",
  exerciseVariationLabel: null,
  exerciseParentExerciseId: null,
  exerciseParentName: null,
  isVariation: false,
  completedAt,
  note: null,
  bestSet: { weightKg: 100, reps: 5, e1rm: 117 },
};

const inProgressEntry = {
  ...completedEntry,
  workoutExerciseId: 102,
  completedAt: null,
};

const getTextContent = (children: unknown): string =>
  Array.isArray(children) ? children.map(getTextContent).join("") : String(children ?? "");

const findText = (tree: RenderedTree, value: string) =>
  tree.root.findAll((node: TestNode) =>
    node.type === "Text" && getTextContent(node.props.children) === value
  );

describe("history in-progress status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListMediaForSetIds.mockResolvedValue([]);
    mockGetQuickStats.mockResolvedValue({ totalWorkoutDays: 2, totalVolumeKg: 500 });
    mockGetTotalPBCount.mockResolvedValue(0);
    mockGetLatestUserMetricsSnapshot.mockResolvedValue(null);
    mockSearchWorkoutDays.mockResolvedValue([]);
  });

  it("shows an in-progress day count and labels only open entries after expansion", async () => {
    const firstPage = [
      {
        dayKey: "2026-09-20",
        displayDate: new Date(2026, 8, 20, 8).getTime(),
        totalExercises: 2,
        totalSets: 2,
        inProgressCount: 1,
        notesPreview: null,
      },
      ...Array.from({ length: 19 }, (_, index) => ({
        dayKey: `2026-08-${String(31 - index).padStart(2, "0")}`,
        displayDate: new Date(2026, 7, 31 - index, 8).getTime(),
        totalExercises: 1,
        totalSets: 1,
        inProgressCount: 0,
        notesPreview: null,
      })),
    ];
    mockListWorkoutDays.mockResolvedValueOnce(firstPage).mockResolvedValue([]);
    mockGetWorkoutDayDetails.mockResolvedValue({
      dayKey: "2026-09-20",
      exercises: [completedEntry, inProgressEntry],
      hasMoreExercises: false,
      totalVolumeKg: 500,
      bestE1rmKg: 117,
    });

    let tree: RenderedTree;
    await act(async () => {
      tree = renderer.create(<WorkoutHistoryScreen />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockListWorkoutDays).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(tree!.root.findByType("FlatList").props.data).toHaveLength(20);
    expect(findText(tree!, "1 In Progress")).toHaveLength(1);
    expect(findText(tree!, "In Progress")).toHaveLength(0);

    const cardHeaders = tree!.root.findAll((node: TestNode) =>
      node.type === "Pressable" &&
      (node.props.style as { justifyContent?: string } | undefined)?.justifyContent === "space-between"
    );
    const cardHeader = cardHeaders[0];
    await act(async () => {
      (cardHeader!.props.onPress as () => Promise<void>)();
    });

    expect(mockGetWorkoutDayDetails).toHaveBeenCalledWith("2026-09-20");
    expect(findText(tree!, "In Progress")).toHaveLength(1);

    const list = tree!.root.findByType("FlatList");
    await act(async () => {
      (list.props.onEndReached as () => void)();
    });
    expect(mockListWorkoutDays).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    await act(async () => {
      tree!.unmount();
    });
  });

  it("labels only unfinished entries on the day-detail route while retaining duplicate exercise entries", async () => {
    mockGetWorkoutDayPage.mockResolvedValue({
      dayKey: "2026-09-20",
      displayDate: new Date(2026, 8, 20, 8).getTime(),
      totals: { totalExercises: 2, totalSets: 2, totalReps: 10, totalVolumeKg: 500, bestE1rmKg: 117 },
      entries: [
        { ...completedEntry, performedAt: completedAt, sets: [{ id: 1, weightKg: 100, reps: 5, note: null }], totalSets: 1, totalReps: 5, totalVolumeKg: 500 },
        { ...inProgressEntry, performedAt: completedAt + 60_000, sets: [{ id: 2, weightKg: 0, reps: 5, note: null }], totalSets: 1, totalReps: 5, totalVolumeKg: 0 },
      ],
      hasMore: false,
    });

    let tree: RenderedTree;
    await act(async () => {
      tree = renderer.create(<WorkoutDayScreen />);
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(mockGetWorkoutDayPage).toHaveBeenCalledWith("2026-09-20");
    expect(findText(tree!, "In Progress")).toHaveLength(1);
    expect(tree!.root.findAll((node: TestNode) => node.type === "SetItem")).toHaveLength(2);
    await act(async () => {
      tree!.unmount();
    });
  });

  it("shows the same entry status in Overview and keeps last-workout navigation", async () => {
    mockGetLastWorkoutDay.mockResolvedValue({
      date: new Date(2026, 8, 20, 8).getTime(),
      exercises: [
        { ...completedEntry, bestSet: completedEntry.bestSet },
        { ...inProgressEntry, bestSet: null },
      ],
      hasMore: false,
    });

    let tree: RenderedTree;
    await act(async () => {
      tree = renderer.create(<OverviewScreen />);
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(findText(tree!, "In Progress")).toHaveLength(1);
    const pressables = tree!.root.findAll((node: TestNode) => node.type === "Pressable");
    await act(async () => {
      (pressables[pressables.length - 1].props.onPress as () => void)();
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/workout/[dayKey]",
      params: { dayKey: "2026-09-20" },
    });
    await act(async () => {
      tree!.unmount();
    });
  });
});
