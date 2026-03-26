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
    useWindowDimensions: jest.fn(() => ({
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1,
    })),
  };
});

jest.mock("../../lib/db/connection", () => ({
  db: {},
}));

jest.mock("../../lib/db/introspection", () => ({
  hasColumn: jest.fn(() => true),
}));

jest.mock("../../lib/db/prEvents", () => ({
  getPREventsForExercise: jest.fn(async () => []),
}));

jest.mock("../../lib/db/settings", () => ({
  getExerciseFormulaOverride: jest.fn(() => null),
  getGlobalFormula: jest.fn(() => "epley"),
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: () => null,
}));

jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: jest.fn(() => ({
    rawColors: {
      primary: "#0a7f5a",
      primaryLight: "#dff2ea",
      border: "#d7dde0",
      surfaceSecondary: "#f3f5f6",
      shadow: "#000000",
      foreground: "#111111",
      foregroundSecondary: "#667085",
      foregroundMuted: "#98a2b3",
      destructive: "#c0392b",
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
  const { ScrollView } = require("react-native");

  return {
    __esModule: true,
    default: {
      ScrollView: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
        React.createElement(ScrollView, { ref, ...props })
      ),
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedReaction: jest.fn(),
    useAnimatedScrollHandler: (handlers: { onScroll?: (event: unknown) => void }) =>
      handlers.onScroll,
    useSharedValue: (value: unknown) => ({ value }),
  };
});

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import AnalyticsInsightsDeck from "../../components/charts/AnalyticsInsightsDeck";
import { buildExerciseAnalyticsOverview } from "../../lib/utils/analytics";
import { analyticsFixtureNow, createAnalyticsDatasetFixture } from "../helpers/analyticsFixture";

function getOverview() {
  return buildExerciseAnalyticsOverview(createAnalyticsDatasetFixture(), "maxWeight", {
    now: analyticsFixtureNow,
    setScope: "work",
  });
}

function getStyleValue(style: unknown, key: string): unknown {
  if (!style || typeof style !== "object") return undefined;
  return (style as Record<string, unknown>)[key];
}

describe("AnalyticsInsightsDeck", () => {
  it("renders the six analytics cards in the expected order", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <AnalyticsInsightsDeck
          overview={getOverview()}
          selectedMetric="maxWeight"
          selectedMetricLabel="Max Weight Per Session"
        />
      );
    });

    const cardTestIds = [
      ...new Set(
        renderer!.root
          .findAll(
            (node: any) =>
              typeof node.props.testID === "string" &&
              node.props.testID.startsWith("analytics-card-")
          )
          .map((node: any) => node.props.testID)
      ),
    ];

    expect(cardTestIds).toEqual([
      "analytics-card-estimated-rep-maxes",
      "analytics-card-performance-progress",
      "analytics-card-snapshot",
      "analytics-card-metric-trend",
      "analytics-card-prs",
      "analytics-card-consistency",
      "analytics-card-rep-profile",
    ]);
  });

  it("updates the active pagination dot after horizontal snapping", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <AnalyticsInsightsDeck
          overview={getOverview()}
          selectedMetric="maxWeight"
          selectedMetricLabel="Max Weight Per Session"
        />
      );
    });

    const scrollView = renderer!.root.findByProps({
      testID: "analytics-insights-scroll",
    });

    const getDotWidth = (index: number) =>
      getStyleValue(
        renderer!.root.findByProps({ testID: `analytics-dot-${index}` }).props.style,
        "width"
      );

    expect(getDotWidth(0)).toBe(18);
    expect(getDotWidth(1)).toBe(8);

    act(() => {
      scrollView.props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: {
            x: 342,
          },
        },
      });
    });

    expect(getDotWidth(0)).toBe(8);
    expect(getDotWidth(1)).toBe(18);
  });
});
