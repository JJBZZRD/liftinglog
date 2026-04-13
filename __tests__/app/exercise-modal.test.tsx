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
    Pressable: createHost("Pressable"),
    Modal: ({
      visible = true,
      children,
      ...props
    }: {
      visible?: boolean;
      children?: React.ReactNode;
    }) => (visible ? React.createElement("Modal", props, children) : null),
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {}),
    },
    useWindowDimensions: jest.fn(() => ({
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1,
    })),
  };
});

jest.mock("expo-router", () => ({
  Stack: {
    Screen: () => null,
  },
  router: {
    back: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({
    id: "1",
    name: "Bench Press",
  })),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: jest.fn(() => ({
    addListener: jest.fn(() => jest.fn()),
  })),
}));

jest.mock("react-native-tab-view", () => ({
  TabBar: ({ navigationState }: { navigationState: { routes: { key: string; title: string }[] } }) => {
    const React = require("react");
    return React.createElement(
      "View",
      null,
      navigationState.routes.map((route) =>
        React.createElement("Text", { key: route.key }, route.title)
      )
    );
  },
  TabView: ({
    navigationState,
    renderScene,
    renderTabBar,
  }: {
    navigationState: { routes: { key: string; title: string }[] };
    renderScene: ({ route }: { route: { key: string } }) => React.ReactNode;
    renderTabBar: (props: { navigationState: { routes: { key: string; title: string }[] } }) => React.ReactNode;
  }) => {
    const React = require("react");
    return React.createElement(
      "View",
      null,
      renderTabBar({ navigationState }),
      renderScene({ route: navigationState.routes[0] })
    );
  },
}));

jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: jest.fn(() => ({
    rawColors: {
      background: "#ffffff",
      foreground: "#111111",
      foregroundSecondary: "#666666",
      primary: "#0a7f5a",
      pressed: "#d8e6df",
      surfaceSecondary: "#f2f4f5",
    },
  })),
}));

jest.mock("../../lib/db/exercises", () => ({
  MAX_PINNED_EXERCISES: 8,
  getExerciseWithParentById: jest.fn(async () => null),
  getPinnedExercisesCount: jest.fn(async () => 0),
  isExercisePinned: jest.fn(async () => false),
  togglePinExercise: jest.fn(async () => true),
}));

jest.mock("../../app/exercise/tabs/RecordTab", () => () => {
  const React = require("react");
  return React.createElement("Text", null, "Record Tab");
});
jest.mock("../../app/exercise/tabs/HistoryTab", () => () => {
  const React = require("react");
  return React.createElement("Text", null, "History Tab");
});
jest.mock("../../app/exercise/tabs/AnalyticsTab", () => () => {
  const React = require("react");
  return React.createElement("Text", null, "Analytics Tab");
});

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: () => null,
}));

import React from "react";
import { render, screen } from "@testing-library/react-native";
import ExerciseModalScreen from "../../app/exercise/[id]";

describe("ExerciseModalScreen", () => {
  it("renders the Analytics tab label instead of Visualisation", () => {
    render(<ExerciseModalScreen />);

    expect(screen.getByText("Record")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("Analytics")).toBeTruthy();
    expect(screen.queryByText("Visualisation")).toBeNull();
  });
});
