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
    TextInput: createHost("TextInput"),
    ActivityIndicator: createHost("ActivityIndicator"),
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {}),
    },
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  return {
    SafeAreaView: React.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode } & Record<string, unknown>,
        ref: React.Ref<unknown>
      ) => React.createElement("SafeAreaView", { ref, ...props }, children)
    ),
  };
});

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Stack: {
    Screen: () => null,
  },
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
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

jest.mock("../../lib/db/workouts", () => ({
  getLastWorkoutDay: jest.fn(async () => null),
  getQuickStats: jest.fn(async () => ({
    totalWorkoutDays: 12,
    totalVolumeKg: 34567,
  })),
}));

jest.mock("../../lib/db/pbEvents", () => ({
  getTotalPBCount: jest.fn(async () => 8),
}));

jest.mock("../../lib/db/userCheckins", () => ({
  getLatestUserMetricsSnapshot: jest.fn(),
}));

jest.mock("../../lib/db/settings", () => ({
  getGlobalFormula: jest.fn(() => "epley"),
  setGlobalFormula: jest.fn(),
}));

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import OverviewScreen from "../../app/(tabs)/index";
import CalculatorsScreen from "../../app/calculators";
import OneRmToolkitScreen from "../../app/calculators/1rm-toolkit";
import PowerScoreScreen from "../../app/calculators/power-score";
import SinclairScreen from "../../app/calculators/sinclair";
import { getLatestUserMetricsSnapshot } from "../../lib/db/userCheckins";
import { setGlobalFormula } from "../../lib/db/settings";

const mockedGetLatestUserMetricsSnapshot =
  getLatestUserMetricsSnapshot as jest.MockedFunction<typeof getLatestUserMetricsSnapshot>;
const mockedSetGlobalFormula = setGlobalFormula as jest.MockedFunction<typeof setGlobalFormula>;

describe("calculators UI", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockedSetGlobalFormula.mockReset();
    mockedGetLatestUserMetricsSnapshot.mockResolvedValue({
      bodyweightKg: { value: 81.2, recordedAt: new Date("2026-04-11T08:00:00.000Z").getTime() },
      sleepHours: null,
      restingHrBpm: null,
    });
  });

  it("shows the overview card and routes to calculators", async () => {
    render(<OverviewScreen />);

    const card = await screen.findByTestId("calculators-summary-card");
    fireEvent.press(card);

    expect(mockPush).toHaveBeenCalledWith("/calculators");
  });

  it("renders the calculators hub with categories and calculator cards", () => {
    render(<CalculatorsScreen />);

    expect(screen.getByTestId("calculators-screen")).toBeTruthy();
    expect(screen.getByTestId("calculator-category-strength")).toBeTruthy();
    expect(screen.getByTestId("calculator-category-powerlifting")).toBeTruthy();
    expect(screen.getByTestId("calculator-category-weightlifting")).toBeTruthy();
    expect(screen.getByTestId("calculator-category-utility")).toBeTruthy();
    expect(screen.getByTestId("calculator-card-1rm-toolkit")).toBeTruthy();
    expect(screen.getByTestId("calculator-card-power-score")).toBeTruthy();
  });

  it("prefills the 1rm toolkit from settings defaults and recalculates locally", async () => {
    render(<OneRmToolkitScreen />);

    fireEvent.changeText(screen.getByTestId("1rm-weight-input"), "100");
    fireEvent.changeText(screen.getByTestId("1rm-reps-input"), "5");

    await waitFor(() => {
      expect(screen.getAllByText("116.7 kg").length).toBeGreaterThan(0);
      expect(screen.getByText("Epley projection")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("1rm-formula-brzycki"));

    await waitFor(() => {
      expect(screen.getAllByText("112.5 kg").length).toBeGreaterThan(0);
      expect(screen.getByText("Brzycki projection")).toBeTruthy();
    });

    expect(mockedSetGlobalFormula).not.toHaveBeenCalled();
  });

  it("prefills bodyweight from user metrics for power score and sinclair", async () => {
    render(<PowerScoreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("power-score-bodyweight-input").props.value).toBe("81.2");
    });

    render(<SinclairScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("sinclair-bodyweight-input").props.value).toBe("81.2");
    });
  });

  it("leaves bodyweight blank and editable when metrics are unavailable", async () => {
    mockedGetLatestUserMetricsSnapshot.mockResolvedValueOnce({
      bodyweightKg: null,
      sleepHours: null,
      restingHrBpm: null,
    });

    render(<PowerScoreScreen />);

    const input = screen.getByTestId("power-score-bodyweight-input");
    await waitFor(() => {
      expect(input.props.value).toBe("");
    });

    fireEvent.changeText(input, "90");

    expect(screen.getByTestId("power-score-bodyweight-input").props.value).toBe("90");
  });
});
