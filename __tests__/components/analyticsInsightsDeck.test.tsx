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

jest.mock("../../lib/db/pbEvents", () => ({
  getPBEventsForExercise: jest.fn(async () => []),
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

jest.mock("react-native-animated-dots-carousel", () => {
  const React = require("react");
  const { View } = require("react-native");

  return React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
    React.createElement(View, { ref, ...props })
  );
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

describe("AnalyticsInsightsDeck", () => {
  it("renders the seven analytics cards in the expected order", () => {
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
      "analytics-card-pbs",
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

    const getCurrentIndex = () =>
      renderer!.root.findByProps({ testID: "analytics-dots-carousel" }).props.currentIndex;

    expect(getCurrentIndex()).toBe(0);

    act(() => {
      scrollView.props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: {
            x: 342,
          },
        },
      });
    });

    expect(getCurrentIndex()).toBe(1);
  });

  it("allows the page control to jump between cards", () => {
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

    const dotsCarousel = renderer!.root.findByProps({
      testID: "analytics-dots-carousel",
    });

    act(() => {
      dotsCarousel.props.scrollableDotsConfig.setIndex(6);
      dotsCarousel.props.scrollableDotsConfig.onNewIndex(6);
    });

    expect(
      renderer!.root.findByProps({ testID: "analytics-dots-carousel" }).props.currentIndex
    ).toBe(6);
  });
});
