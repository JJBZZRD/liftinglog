/* eslint-disable @typescript-eslint/no-require-imports, import/first, react/display-name */

jest.mock("react-native", () => {
  const React = require("react");

  const createHost = (name: string) =>
    React.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode } & Record<string, unknown>,
        ref: React.Ref<unknown>
      ) => React.createElement(name, { ref, ...props }, children)
    );

  return {
    View: createHost("View"),
    Text: createHost("Text"),
    ScrollView: createHost("ScrollView"),
    Pressable: createHost("Pressable"),
    ActivityIndicator: createHost("ActivityIndicator"),
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {}),
    },
  };
});

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  Stack: {
    Screen: () => null,
  },
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: () => null,
}));

jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: jest.fn(() => ({
    rawColors: {
      primary: "#0a7f5a",
      primaryLight: "#dff2ea",
      primaryForeground: "#ffffff",
      success: "#34c759",
      warning: "#ff9500",
      destructive: "#ff3b30",
      background: "#f7f7f8",
      surface: "#ffffff",
      surfaceSecondary: "#f3f5f6",
      border: "#d7dde0",
      borderLight: "#e8ecef",
      foreground: "#111111",
      foregroundSecondary: "#667085",
      foregroundMuted: "#98a2b3",
      pressed: "#d8e6df",
      overlay: "rgba(0,0,0,0.35)",
      overlayDark: "rgba(0,0,0,0.5)",
      shadow: "#000000",
      pbGold: "#ffd700",
    },
  })),
}));

jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: jest.fn(() => ({
    unitPreference: "kg",
  })),
}));

jest.mock("../../lib/db/userCheckins", () => ({
  listAllUserCheckins: jest.fn(),
}));

jest.mock("../../lib/userMetrics/performanceGuide", () => {
  const actual = jest.requireActual("../../lib/userMetrics/performanceGuide");
  return {
    ...actual,
    buildPerformanceGuideFromCheckins: jest.fn(),
  };
});

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import UserMetricsScreen from "../../app/user-metrics";
import PerformanceGuideScreen from "../../app/performance-guide";
import { listAllUserCheckins, type UserCheckin } from "../../lib/db/userCheckins";
import {
  METRIC_TYPES,
  buildPerformanceGuideFromCheckins,
  type MetricAvailabilityMap,
  type PerformanceGuideResult,
} from "../../lib/userMetrics/performanceGuide";

const mockedListAllUserCheckins =
  listAllUserCheckins as jest.MockedFunction<typeof listAllUserCheckins>;
const mockedBuildPerformanceGuideFromCheckins =
  buildPerformanceGuideFromCheckins as jest.MockedFunction<typeof buildPerformanceGuideFromCheckins>;

function makeCheckin(overrides: Partial<UserCheckin> = {}): UserCheckin {
  return {
    id: 1,
    uid: "checkin-1",
    recordedAt: new Date("2026-04-11T08:00:00.000Z").getTime(),
    context: "manual_log",
    bodyweightKg: 81.2,
    waistCm: null,
    sleepStartAt: null,
    sleepEndAt: null,
    sleepHours: 8.2,
    restingHrBpm: 55,
    fatigueScore: 1,
    sorenessScore: 2,
    stressScore: 1,
    steps: 9000,
    note: null,
    source: "manual",
    ...overrides,
  };
}

function buildAvailabilityMap(
  overrides: Partial<MetricAvailabilityMap> = {}
): MetricAvailabilityMap {
  const base = Object.fromEntries(
    METRIC_TYPES.map((metric) => [
      metric,
      {
        metric,
        hasAnyData: false,
        hasRecentData: false,
        recentCount: 0,
        baselineCount: 0,
        daysSinceLastEntry: null,
        acuteEligible: false,
        trendEligible: false,
        latestEntry: null,
      },
    ])
  ) as MetricAvailabilityMap;

  return {
    ...base,
    ...overrides,
  };
}

function buildReadyResult(): PerformanceGuideResult {
  return {
    zone: "ready",
    normalizedScore: 0.42,
    confidence: 0.67,
    confidenceLabel: "medium",
    summary: "Ready: Sleep and recovery markers look supportive for performance.",
    reasons: [
      "Sleep and recovery markers look supportive for performance.",
      "Fatigue is low today at 1/5.",
    ],
    missingDataNotes: [
      {
        id: "stress_trend_unavailable",
        metric: "stress",
        message: "Stress trend unavailable due to limited recent entries.",
      },
    ],
    signals: [
      {
        id: "fatigue_low_today",
        metric: "fatigue",
        kind: "acute",
        polarity: "positive",
        score: 0.46,
        magnitude: 1,
        reliability: 0.8,
        metricWeight: 1.15,
        weightedScore: 0.42,
        reason: "Fatigue is low today at 1/5.",
      },
      {
        id: "sleep_good_last_night",
        metric: "sleep",
        kind: "acute",
        polarity: "positive",
        score: 0.34,
        magnitude: 0.7,
        reliability: 0.85,
        metricWeight: 1.2,
        weightedScore: 0.35,
        reason: "Last night's sleep was supportive at 8.2 hours.",
      },
    ],
    patterns: [
      {
        id: "primed_for_performance",
        metrics: ["sleep", "fatigue"],
        polarity: "positive",
        score: 0.66,
        magnitude: 1,
        reliability: 0.82,
        weight: 1.1,
        weightedScore: 0.6,
        reason: "Sleep and recovery markers look supportive for performance.",
      },
    ],
    availabilityByMetric: buildAvailabilityMap({
      sleep: {
        metric: "sleep",
        hasAnyData: true,
        hasRecentData: true,
        recentCount: 5,
        baselineCount: 8,
        daysSinceLastEntry: 0,
        acuteEligible: true,
        trendEligible: true,
        latestEntry: {
          metric: "sleep",
          recordedAt: new Date("2026-04-11T07:00:00.000Z").getTime(),
          value: 8.2,
        },
      },
      restingHr: {
        metric: "restingHr",
        hasAnyData: true,
        hasRecentData: true,
        recentCount: 4,
        baselineCount: 8,
        daysSinceLastEntry: 0,
        acuteEligible: false,
        trendEligible: true,
        latestEntry: {
          metric: "restingHr",
          recordedAt: new Date("2026-04-11T07:00:00.000Z").getTime(),
          value: 55,
        },
      },
      fatigue: {
        metric: "fatigue",
        hasAnyData: true,
        hasRecentData: true,
        recentCount: 1,
        baselineCount: 0,
        daysSinceLastEntry: 0,
        acuteEligible: true,
        trendEligible: false,
        latestEntry: {
          metric: "fatigue",
          recordedAt: new Date("2026-04-11T07:00:00.000Z").getTime(),
          value: 1,
        },
      },
      stress: {
        metric: "stress",
        hasAnyData: true,
        hasRecentData: true,
        recentCount: 2,
        baselineCount: 1,
        daysSinceLastEntry: 0,
        acuteEligible: false,
        trendEligible: false,
        latestEntry: {
          metric: "stress",
          recordedAt: new Date("2026-04-11T07:00:00.000Z").getTime(),
          value: 2,
        },
      },
      bodyweight: {
        metric: "bodyweight",
        hasAnyData: true,
        hasRecentData: false,
        recentCount: 0,
        baselineCount: 0,
        daysSinceLastEntry: 30,
        acuteEligible: false,
        trendEligible: false,
        latestEntry: {
          metric: "bodyweight",
          recordedAt: new Date("2026-03-12T07:00:00.000Z").getTime(),
          value: 81.2,
        },
      },
    }),
    contributingMetrics: ["sleep", "fatigue", "restingHr"],
    dominantMetrics: ["sleep", "fatigue"],
    basedMostlyOnSingleMetric: false,
    totalWeightedScore: 1.37,
    availableInfluence: 2.45,
  };
}

function buildNoDataResult(): PerformanceGuideResult {
  return {
    zone: null,
    normalizedScore: null,
    confidence: 0,
    confidenceLabel: "insufficient",
    summary: "Not enough recent data to estimate performance.",
    reasons: [],
    missingDataNotes: [
      {
        id: "no_recent_data",
        metric: "system",
        message: "Not enough recent recovery metrics are available to estimate performance today.",
      },
    ],
    signals: [],
    patterns: [],
    availabilityByMetric: buildAvailabilityMap(),
    contributingMetrics: [],
    dominantMetrics: [],
    basedMostlyOnSingleMetric: false,
    totalWeightedScore: 0,
    availableInfluence: 0,
  };
}

function buildNarrowDataResult(): PerformanceGuideResult {
  return {
    zone: "ready",
    normalizedScore: 0.31,
    confidence: 0.24,
    confidenceLabel: "low",
    summary: "Ready: Fatigue is low today at 1/5.",
    reasons: ["Fatigue is low today at 1/5."],
    missingDataNotes: [
      {
        id: "narrow_data_warning_note",
        metric: "system",
        message: "This guide is based mostly on fatigue because other recent recovery metrics are limited.",
      },
    ],
    signals: [
      {
        id: "fatigue_low_today",
        metric: "fatigue",
        kind: "acute",
        polarity: "positive",
        score: 0.46,
        magnitude: 1,
        reliability: 0.7,
        metricWeight: 1.15,
        weightedScore: 0.37,
        reason: "Fatigue is low today at 1/5.",
      },
    ],
    patterns: [
      {
        id: "narrow_data_warning",
        metrics: ["fatigue"],
        polarity: "neutral",
        score: 0,
        magnitude: 1,
        reliability: 1,
        weight: 0,
        weightedScore: 0,
        reason: "This guide is based mostly on fatigue because other recent recovery metrics are limited.",
      },
    ],
    availabilityByMetric: buildAvailabilityMap({
      fatigue: {
        metric: "fatigue",
        hasAnyData: true,
        hasRecentData: true,
        recentCount: 1,
        baselineCount: 0,
        daysSinceLastEntry: 0,
        acuteEligible: true,
        trendEligible: false,
        latestEntry: {
          metric: "fatigue",
          recordedAt: new Date("2026-04-11T07:00:00.000Z").getTime(),
          value: 1,
        },
      },
    }),
    contributingMetrics: ["fatigue"],
    dominantMetrics: ["fatigue"],
    basedMostlyOnSingleMetric: true,
    totalWeightedScore: 0.37,
    availableInfluence: 1.19,
  };
}

describe("performance guide UI", () => {
  beforeEach(() => {
    mockedListAllUserCheckins.mockResolvedValue([makeCheckin()]);
    mockedBuildPerformanceGuideFromCheckins.mockReturnValue(buildReadyResult());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the performance guide card on user metrics and navigates to the detail route", async () => {
    render(<UserMetricsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("performance-guide-summary-card")).toBeTruthy();
      expect(screen.getByTestId("performance-guide-summary-zone-badge")).toBeTruthy();
      expect(screen.getByTestId("performance-guide-summary-confidence-badge")).toBeTruthy();
      expect(screen.getByTestId("performance-guide-summary-text").props.children).toBe(
        "Ready: Sleep and recovery markers look supportive for performance."
      );
      expect(screen.getByTestId("performance-guide-summary-reasons")).toBeTruthy();
      expect(screen.getByText("Bodyweight")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("performance-guide-summary-card"));

    expect(mockPush).toHaveBeenCalledWith("/performance-guide");
  });

  it("renders the detail route with summary, notes, chips, and coverage states", async () => {
    render(<PerformanceGuideScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("performance-guide-screen")).toBeTruthy();
      expect(screen.getByTestId("performance-guide-detail-zone-badge")).toBeTruthy();
      expect(screen.getByTestId("performance-guide-detail-confidence-badge")).toBeTruthy();
      expect(
        screen.getByText("Good setup for normal hard training.")
      ).toBeTruthy();
      expect(
        screen.getAllByText("Sleep and recovery markers look supportive for performance.").length
      ).toBeGreaterThan(0);
      expect(
        screen.getByText("Stress trend unavailable due to limited recent entries.")
      ).toBeTruthy();
      expect(screen.getByTestId("performance-guide-metric-chip-sleep")).toBeTruthy();
      expect(screen.getByTestId("performance-guide-coverage-sleep")).toBeTruthy();
      expect(screen.getByTestId("performance-guide-engine-detail-0")).toBeTruthy();
      expect(
        within(screen.getByTestId("performance-guide-coverage-sleep")).getByText("Trend ready")
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("performance-guide-coverage-fatigue")).getByText("Acute only")
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("performance-guide-coverage-stress")).getByText("Recent, trend limited")
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("performance-guide-coverage-bodyweight")).getByText("Stale")
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("performance-guide-coverage-waist")).getByText("No data")
      ).toBeTruthy();
    });
  });

  it("renders the no-data state on the detail route", async () => {
    mockedBuildPerformanceGuideFromCheckins.mockReturnValue(buildNoDataResult());
    mockedListAllUserCheckins.mockResolvedValue([]);

    render(<PerformanceGuideScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("performance-guide-detail-zone-badge")).toBeTruthy();
      expect(screen.getByText("Unavailable")).toBeTruthy();
      expect(
        screen.getByText("Not enough recent data to estimate performance confidently.")
      ).toBeTruthy();
      expect(
        screen.getByText("Not enough recent recovery metrics are available to estimate performance today.")
      ).toBeTruthy();
    });
  });

  it("shows narrow-data warning with a low-confidence presentation", async () => {
    mockedBuildPerformanceGuideFromCheckins.mockReturnValue(buildNarrowDataResult());

    render(<PerformanceGuideScreen />);

    await waitFor(() => {
      expect(screen.getByText("Low confidence")).toBeTruthy();
      expect(
        screen.getAllByText("This guide is based mostly on fatigue because other recent recovery metrics are limited.").length
      ).toBeGreaterThan(0);
      expect(screen.getByText("Mostly driven by Fatigue")).toBeTruthy();
    });
  });

  it("routes relevant metric chips into metric detail screens", async () => {
    render(<PerformanceGuideScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("performance-guide-metric-chip-sleep")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("performance-guide-metric-chip-sleep"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/user-metric/[metric]",
      params: { metric: "sleep" },
    });
  });
});
