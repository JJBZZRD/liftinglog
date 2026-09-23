import React from "react";
import renderer, { act } from "react-test-renderer";
import '../support/workout-native-mocks';

type TestNode = { props: Record<string, unknown> };

const mockGetLatestUserMetricsSnapshot = jest.fn();
const mockGetLastWorkoutDay = jest.fn();
const mockGetQuickStats = jest.fn();
const mockGetTotalPBCount = jest.fn();
const mockAppCapabilities = { healthMetrics: false };
const mockListWorkoutSessionsForDate = jest.fn();
const mockPush = jest.fn();

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
  ActivityIndicator: "ActivityIndicator",
  RefreshControl: "RefreshControl",
  Modal: ({ visible, children }: any) => visible ? children : null,
  AppState: { addEventListener: () => ({ remove: jest.fn() }) },
  StyleSheet: { create: (style: unknown) => style },
}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: mockPush },
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
  };
});
jest.mock("../../components/calculators/CalculatorsSummaryCard", () => "CalculatorsSummaryCard");
jest.mock("../../lib/config/releaseProfile", () => ({ appCapabilities: mockAppCapabilities }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/db/pbEvents", () => ({ getTotalPBCount: mockGetTotalPBCount }));
jest.mock("../../lib/db/userCheckins", () => ({ getLatestUserMetricsSnapshot: mockGetLatestUserMetricsSnapshot }));
jest.mock("../../lib/db/workouts", () => ({
  getActiveWorkout: jest.fn(async () => null),
  getLastWorkoutDay: mockGetLastWorkoutDay,
  getQuickStats: mockGetQuickStats,
}));
jest.mock("../../lib/db/workoutSessions", () => ({
  listWorkoutSessionsForDate: mockListWorkoutSessionsForDate,
  createWorkoutSession: jest.fn(),
  ActiveWorkoutConflictError: class extends Error {},
}));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }) }));
jest.mock("../../lib/utils/units", () => ({
  formatVolumeFromKg: (value: number) => String(value),
  formatWeightFromKg: (value: number | null | undefined) => value == null ? "--" : String(value),
  getWeightUnitLabel: () => "kg",
}));

const OverviewScreen = require("../../app/(tabs)/index").default;

describe("capability entry points", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLastWorkoutDay.mockResolvedValue(null);
    mockGetQuickStats.mockResolvedValue({ totalWorkoutDays: 0, totalVolumeKg: 0 });
    mockGetTotalPBCount.mockResolvedValue(0);
    mockGetLatestUserMetricsSnapshot.mockResolvedValue(null);
    mockListWorkoutSessionsForDate.mockResolvedValue([]);
  });

  it("does not query or render health metrics in MVP", async () => {
    mockAppCapabilities.healthMetrics = false;
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<OverviewScreen />);
    });

    expect(mockGetLatestUserMetricsSnapshot).not.toHaveBeenCalled();
    expect(tree!.root.findAll((node: TestNode) => node.props.children === "Health metrics")).toHaveLength(0);
    expect(mockListWorkoutSessionsForDate).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree!.unmount();
    });
  });

  it("retains health metrics in the full profile", async () => {
    mockAppCapabilities.healthMetrics = true;
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<OverviewScreen />);
    });

    const metricsLabel = tree!.root.findAll((node: TestNode) => node.props.children === "Health metrics");
    expect(metricsLabel).toHaveLength(1);
    await act(async () => { metricsLabel[0].parent!.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/user-metrics');
    await act(async () => {
      tree!.unmount();
    });
  });
});
