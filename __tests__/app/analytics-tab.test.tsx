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

jest.mock("../../lib/db/prEvents", () => ({
  getPREventsForExercise: jest.fn(async () => []),
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

jest.mock("../../components/charts/AnalyticsChart", () => () => {
  const React = require("react");
  return React.createElement("View", { testID: "analytics-chart" });
});
jest.mock("../../components/charts/DataPointModal", () => () => null);
jest.mock("../../components/charts/FullscreenChart", () => () => null);
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
});
