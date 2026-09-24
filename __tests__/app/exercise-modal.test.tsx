/* eslint-disable @typescript-eslint/no-require-imports, import/first, react/display-name */

const mockParams: { id?: string; name?: string } = {
  id: "1",
  name: "Bench Press",
};

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
    canGoBack: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => mockParams),
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

jest.mock('expo-blur', () => ({ BlurTargetView: 'BlurTargetView' }));
jest.mock('../../components/modals/BaseModal', () => ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null);

jest.mock("../../lib/theme/ThemeContext", () => ({
  ThemeColorScope: ({ children }: { children: React.ReactNode }) => children,
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
  getExerciseWithParentById: jest.fn(),
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
import { fireEvent, render, screen } from "@testing-library/react-native";
import ExerciseModalScreen from "../../app/exercise/[id]";

const mockGetExerciseWithParentById = require("../../lib/db/exercises").getExerciseWithParentById;
const mockRouterReplace = require("expo-router").router.replace;
const mockRouterCanGoBack = require("expo-router").router.canGoBack;

describe("ExerciseModalScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.id = "1";
    mockParams.name = "Bench Press";
    mockRouterCanGoBack.mockReturnValue(true);
    mockGetExerciseWithParentById.mockResolvedValue({
      id: 1,
      name: "Bench Press",
      parentName: null,
      isVariation: false,
    });
  });

  it("renders the Analytics tab label instead of Visualisation", async () => {
    render(<ExerciseModalScreen />);

    expect(await screen.findByText("Record")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("Analytics")).toBeTruthy();
    expect(screen.queryByText("Visualisation")).toBeNull();
  });

  it.each([
    ["malformed", "1abc", "This exercise link is invalid."],
    ["missing", "1900012", "This exercise is no longer available."],
  ])("keeps route tabs unmounted for a %s exercise ID", async (_kind, id, message) => {
    mockParams.id = id;
    mockGetExerciseWithParentById.mockResolvedValue(null);

    render(<ExerciseModalScreen />);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Record Tab")).toBeNull();
  });

  it("does not let a stale lookup mount tabs for a replacement route", async () => {
    let resolveFirst: ((value: { id: number; name: string; parentName: null; isVariation: false }) => void) | undefined;
    let resolveSecond: ((value: { id: number; name: string; parentName: null; isVariation: false }) => void) | undefined;
    mockGetExerciseWithParentById.mockImplementation((id: number) =>
      new Promise((resolve) => {
        if (id === 1) {
          resolveFirst = resolve;
        } else {
          resolveSecond = resolve;
        }
      })
    );

    const view = render(<ExerciseModalScreen />);
    mockParams.id = "2";
    view.rerender(<ExerciseModalScreen />);

    resolveFirst?.({ id: 1, name: "Old", parentName: null, isVariation: false });
    await Promise.resolve();
    expect(screen.queryByText("Record Tab")).toBeNull();

    resolveSecond?.({ id: 2, name: "New", parentName: null, isVariation: false });
    expect(await screen.findByText("Record Tab")).toBeTruthy();
  });

  it("contains a route lookup rejection and retries it", async () => {
    mockGetExerciseWithParentById
      .mockRejectedValueOnce(new Error("catalog unavailable"))
      .mockResolvedValueOnce({ id: 1, name: "Bench Press", parentName: null, isVariation: false });

    render(<ExerciseModalScreen />);

    expect(await screen.findByText("We couldn’t load this exercise.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Retry loading exercise"));
    expect(await screen.findByText("Record Tab")).toBeTruthy();
  });

  it("returns a cold deep link to Exercises when there is no navigation history", async () => {
    mockParams.id = "1abc";
    mockRouterCanGoBack.mockReturnValue(false);
    render(<ExerciseModalScreen />);

    fireEvent.press(await screen.findByLabelText("Go back"));
    expect(mockRouterReplace).toHaveBeenCalledWith("/(tabs)/exercises");
  });
});
