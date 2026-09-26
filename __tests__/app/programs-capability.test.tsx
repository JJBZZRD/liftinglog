import React from "react";
import renderer, { act } from "react-test-renderer";

type TestNode = { props: Record<string, unknown> };

const mockUseFocusEffect = jest.fn();
const mockGetAllExercisesForDate = jest.fn();
const mockGetCalendarSessionsForDate = jest.fn();
const mockGetProgrammedDatesInRange = jest.fn();
const mockMarkMissedSessions = jest.fn();
const mockRawColors = new Proxy({}, { get: () => "#000" });
const mockAppCapabilities = {
  programsExperience: "enabled" as "enabled" | "coming-soon",
};

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => ({
  FlatList: "FlatList",
  Pressable: "Pressable",
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  Text: "Text",
  View: "View",
}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => {
      mockUseFocusEffect();
      React.useEffect(callback, [callback]);
    },
  };
});
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: "AnimatedView" },
  runOnJS: (callback: (...args: never[]) => unknown) => callback,
  useAnimatedStyle: (callback: () => unknown) => callback(),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));
jest.mock("react-native-calendars", () => ({ Calendar: "Calendar" }));
jest.mock("../../components/modals/BaseModal", () => "BaseModal");
jest.mock("../../lib/config/releaseProfile", () => ({ appCapabilities: mockAppCapabilities }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "kg" }),
}));
jest.mock("../../lib/db/programCalendar", () => ({
  getAllExercisesForDate: mockGetAllExercisesForDate,
  getCalendarSessionsForDate: mockGetCalendarSessionsForDate,
  getNextProgrammedDate: jest.fn(),
  getProgrammedDatesInRange: mockGetProgrammedDatesInRange,
  markMissedSessions: mockMarkMissedSessions,
  markSessionComplete: jest.fn(),
  undoSessionComplete: jest.fn(),
}));
jest.mock("../../lib/programs/psl/programRuntime", () => ({
  refreshUpcomingCalendarForPrograms: jest.fn(),
}));
jest.mock("../../lib/programs/psl/pslMapper", () => ({ formatIntensity: jest.fn() }));
jest.mock("../../lib/programs/psl/pslService", () => ({
  formatDateForDisplay: () => "Sunday, September 21",
  getDateIsoToday: () => "2026-09-21",
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    rawColors: mockRawColors,
  }),
}));

const ProgramsRoute = require("../../app/(tabs)/programs").default;

describe("Programs capability entry point", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllExercisesForDate.mockResolvedValue([]);
    mockGetCalendarSessionsForDate.mockResolvedValue([]);
    mockGetProgrammedDatesInRange.mockResolvedValue(new Map());
    mockMarkMissedSessions.mockResolvedValue(undefined);
  });

  it("renders Coming Soon without mounting Programs effects in MVP", async () => {
    mockAppCapabilities.programsExperience = "coming-soon";
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<ProgramsRoute />);
    });

    expect(tree!.root.findAll((node: TestNode) => node.props.children === "Coming Soon")).toHaveLength(1);
    expect(tree!.root.findAll((node: TestNode) => node.props.children === "Manage")).toHaveLength(0);
    expect(mockUseFocusEffect).not.toHaveBeenCalled();
    expect(mockMarkMissedSessions).not.toHaveBeenCalled();
    expect(mockGetProgrammedDatesInRange).not.toHaveBeenCalled();
    expect(mockGetAllExercisesForDate).not.toHaveBeenCalled();
    expect(mockGetCalendarSessionsForDate).not.toHaveBeenCalled();
    await act(async () => {
      tree!.unmount();
    });
  });

  it("mounts the existing Programs screen in the full profile", async () => {
    mockAppCapabilities.programsExperience = "enabled";
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<ProgramsRoute />);
    });

    expect(tree!.root.findAll((node: TestNode) => node.props.children === "Programs")).toHaveLength(1);
    expect(tree!.root.findAll((node: TestNode) => node.props.children === "Manage")).toHaveLength(1);
    expect(tree!.root.findAllByType("Calendar")).toHaveLength(1);
    expect(mockUseFocusEffect).toHaveBeenCalled();
    expect(mockMarkMissedSessions).toHaveBeenCalledTimes(1);
    expect(mockGetProgrammedDatesInRange).toHaveBeenCalledTimes(1);
    expect(mockGetAllExercisesForDate).toHaveBeenCalledTimes(1);
    expect(mockGetCalendarSessionsForDate).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree!.unmount();
    });
  });
});
