import React from "react";
import renderer, { act } from "react-test-renderer";

type TestNode = { props: Record<string, unknown> };

const mockGetLatestUserMetricsSnapshot = jest.fn();
const mockGetLastWorkoutDay = jest.fn();
const mockGetQuickStats = jest.fn();
const mockGetTotalPBCount = jest.fn();
const mockAppCapabilities = { healthMetrics: false };

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
  };
});
jest.mock("../../components/calculators/CalculatorsSummaryCard", () => "CalculatorsSummaryCard");
jest.mock("../../lib/config/releaseProfile", () => ({ appCapabilities: mockAppCapabilities }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/db/pbEvents", () => ({ getTotalPBCount: mockGetTotalPBCount }));
jest.mock("../../lib/db/userCheckins", () => ({ getLatestUserMetricsSnapshot: mockGetLatestUserMetricsSnapshot }));
jest.mock("../../lib/db/workouts", () => ({
  getLastWorkoutDay: mockGetLastWorkoutDay,
  getQuickStats: mockGetQuickStats,
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
  });

  it("does not query or render health metrics in MVP", async () => {
    mockAppCapabilities.healthMetrics = false;
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<OverviewScreen />);
    });

    expect(mockGetLatestUserMetricsSnapshot).not.toHaveBeenCalled();
    expect(tree!.root.findAll((node: TestNode) => node.props.children === "User Metrics")).toHaveLength(0);
    expect(mockGetLastWorkoutDay).toHaveBeenCalledTimes(1);
    expect(mockGetQuickStats).toHaveBeenCalledTimes(1);
    expect(mockGetTotalPBCount).toHaveBeenCalledTimes(1);
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

    expect(mockGetLatestUserMetricsSnapshot).toHaveBeenCalledTimes(1);
    expect(tree!.root.findAll((node: TestNode) => node.props.children === "User Metrics")).toHaveLength(1);
    await act(async () => {
      tree!.unmount();
    });
  });
});
