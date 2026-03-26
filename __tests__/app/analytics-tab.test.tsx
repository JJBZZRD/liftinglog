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
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {}),
    },
    Modal: ({
      visible = true,
      children,
      ...props
    }: {
      visible?: boolean;
      children?: React.ReactNode;
    }) => (visible ? React.createElement("Modal", props, children) : null),
  };
});

jest.mock("../../lib/db/connection", () => ({
  db: {},
}));

jest.mock("../../lib/db/introspection", () => ({
  hasColumn: jest.fn(() => true),
}));

jest.mock("../../lib/db/pbEvents", () => ({
  getPBEventsForExercise: jest.fn(async () => []),
}));

jest.mock("../../lib/db/settings", () => ({
  getExerciseFormulaOverride: jest.fn(() => null),
  getGlobalFormula: jest.fn(() => "epley"),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(() => ({
    id: "1",
    name: "Bench Press",
  })),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: () => null,
}));

jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: jest.fn(() => ({
    rawColors: {
      shadow: "#000000",
      foreground: "#111111",
      foregroundSecondary: "#667085",
      foregroundMuted: "#98a2b3",
      background: "#ffffff",
      surface: "#ffffff",
      surfaceSecondary: "#f3f5f6",
      border: "#d7dde0",
      borderLight: "#e8ecef",
      primary: "#0a7f5a",
      primaryLight: "#dff2ea",
      success: "#34C759",
      warning: "#FF9500",
      pbGold: "#FFD700",
      overlay: "rgba(0,0,0,0.35)",
      pressed: "#d8e6df",
    },
  })),
}));

jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: jest.fn(() => ({
    unitPreference: "kg",
  })),
}));

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");

  const createAnimationMock = () => {
    const animation = {
      duration: () => animation,
      delay: () => animation,
    };

    return animation;
  };

  const AnimatedView = React.forwardRef(
    (
      { children, ...props }: { children?: React.ReactNode } & Record<string, unknown>,
      ref: React.Ref<unknown>
    ) => React.createElement(View, { ref, ...props }, children)
  );

  return {
    __esModule: true,
    default: {
      View: AnimatedView,
    },
    LinearTransition: {
      duration: () => ({}),
    },
    FadeInDown: createAnimationMock(),
    FadeOutUp: createAnimationMock(),
    useAnimatedStyle: (updater: () => Record<string, unknown>) => updater(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  };
});

const mockAnalyticsChart = jest.fn(
  ({
    overlays = [],
  }: {
    overlays?: { overlayType: string }[];
  }) => {
    const React = require("react");
    return React.createElement("View", {
      testID: "analytics-chart",
      overlayCount: overlays.length,
      overlayTypes: overlays.map((overlay) => overlay.overlayType).join(","),
    });
  }
);

jest.mock("../../components/charts/AnalyticsChart", () => ({
  __esModule: true,
  default: (props: unknown) => mockAnalyticsChart(props as never),
}));
jest.mock("../../components/charts/DataPointModal", () => () => null);
const mockFullscreenChart = jest.fn(
  ({
    overlays = [],
  }: {
    overlays?: { overlayType: string }[];
  }) => {
    const React = require("react");
    return React.createElement("View", {
      testID: "fullscreen-chart",
      overlayCount: overlays.length,
      overlayTypes: overlays.map((overlay) => overlay.overlayType).join(","),
    });
  }
);

jest.mock("../../components/charts/FullscreenChart", () => ({
  __esModule: true,
  default: (props: unknown) => mockFullscreenChart(props as never),
}));
jest.mock("../../components/charts/AnalyticsInsightsDeck", () => ({
  __esModule: true,
  default: ({
    overview,
  }: {
    overview: { snapshot: { latestValue: number | null; sessionCount: number } };
  }) => {
    const React = require("react");
    return React.createElement(
      "Text",
      { testID: "analytics-overview-summary" },
      `latest:${overview.snapshot.latestValue ?? "none"} sessions:${overview.snapshot.sessionCount}`
    );
  },
}));

jest.mock("../../components/charts/DateRangeSelector", () => ({
  __esModule: true,
  default: () => {
    const React = require("react");
    return React.createElement("View", { testID: "date-range-selector" });
  },
  getDefaultDateRange: () => ({
    startDate: null,
    endDate: new Date("2026-04-30T23:59:59Z"),
  }),
}));

jest.mock("../../lib/utils/analytics", () => {
  const actual = jest.requireActual("../../lib/utils/analytics");

  return {
    ...actual,
    getExerciseAnalyticsDataset: jest.fn(),
    getSessionDetails: jest.fn(),
    getSessionDetailsByWorkoutExerciseId: jest.fn(),
  };
});

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AnalyticsTab from "../../app/exercise/tabs/AnalyticsTab";
import { createAnalyticsDatasetFixture } from "../helpers/analyticsFixture";
import { getExerciseAnalyticsDataset } from "../../lib/utils/analytics";

const mockedGetExerciseAnalyticsDataset =
  getExerciseAnalyticsDataset as jest.MockedFunction<typeof getExerciseAnalyticsDataset>;

describe("AnalyticsTab", () => {
  beforeEach(() => {
    mockedGetExerciseAnalyticsDataset.mockResolvedValue(createAnalyticsDatasetFixture());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("updates the analytics overview when switching from all sets to work sets", async () => {
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("analytics-overview-summary").props.children).toBe(
        "latest:80 sessions:6"
      );
    });

    fireEvent.press(screen.getByTestId("analytics-set-scope-work"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-overview-summary").props.children).toBe(
        "latest:115 sessions:5"
      );
    });
  });

  it("renders overlay chips and enables default overlays on first load", async () => {
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("analytics-chart").props.overlayTypes).toBe(
        "trendLine,pbMarkers"
      );
      expect(screen.getByTestId("fullscreen-chart").props.overlayTypes).toBe(
        "trendLine,pbMarkers"
      );
    });

    expect(screen.queryByTestId("analytics-overlay-content")).toBeNull();

    fireEvent.press(screen.getByTestId("analytics-overlay-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-overlay-content")).toBeTruthy();
    });

    expect(screen.getByTestId("analytics-overlay-chip-trendLine")).toBeTruthy();
    expect(screen.getByTestId("analytics-overlay-chip-pbMarkers")).toBeTruthy();
    expect(screen.getByTestId("analytics-overlay-chip-ewma")).toBeTruthy();
  });

  it("updates chart overlays and evicts the oldest non-default overlay when a fourth is selected", async () => {
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("analytics-chart").props.overlayTypes).toBe(
        "trendLine,pbMarkers"
      );
    });

    fireEvent.press(screen.getByTestId("analytics-overlay-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-overlay-content")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("analytics-overlay-chip-ewma"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-chart").props.overlayTypes).toBe(
        "trendLine,pbMarkers,ewma"
      );
    });

    fireEvent.press(screen.getByTestId("analytics-overlay-chip-robustTrend"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-chart").props.overlayTypes).toBe(
        "trendLine,pbMarkers,robustTrend"
      );
      expect(screen.getByTestId("fullscreen-chart").props.overlayTypes).toBe(
        "trendLine,pbMarkers,robustTrend"
      );
    });

    fireEvent.press(screen.getByTestId("analytics-overlay-chip-pbMarkers"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-chart").props.overlayTypes).toBe(
        "trendLine,robustTrend"
      );
    });
  });

  it("updates overlay availability when the metric changes", async () => {
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByTestId("analytics-overlay-toggle")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("analytics-overlay-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-overlay-content")).toBeTruthy();
      expect(screen.getByTestId("analytics-overlay-chip-repBuckets")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("analytics-metric-picker-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-metric-option-totalVolume")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("analytics-metric-option-totalVolume"));

    await waitFor(() => {
      expect(screen.getByText("Not available for this metric")).toBeTruthy();
    });
  });
});
