/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import renderer, { act } from "react-test-renderer";

const mockActivateWhenAppReady = jest.fn();
const readyStartupSnapshot = {
  phase: "ready" as const,
  connectionInitialized: true as const,
  canMountApp: true as const,
};

jest.mock("../../lib/db/connection", () => ({}));
jest.mock("../../lib/db/replacementRestoreLifecycle", () => ({
  getDatabaseStartupSnapshot: () => readyStartupSnapshot,
  subscribeDatabaseStartup: () => () => undefined,
  performDatabaseStartupAction: jest.fn(),
}));
jest.mock("../../components/ReplacementRestoreGate", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../../app/global.css", () => ({}));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  UnitPreferenceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ isDark: false }),
}));
jest.mock("../../lib/config/releaseProfile", () => ({
  appCapabilities: { healthMetrics: false, programsExperience: false, videoRecording: false },
  releaseProfile: "mvp",
}));
jest.mock("../../lib/db/seedTestData", () => ({ seedTestDataExercise: jest.fn() }));
jest.mock("../../lib/notificationHandler", () => ({ useNotificationHandler: jest.fn() }));
jest.mock("../../lib/routing/capabilityAccess", () => ({ isCapabilityEnabled: () => false }));
jest.mock("../../lib/timerStore", () => ({ timerStore: { activateWhenAppReady: mockActivateWhenAppReady } }));
jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { PORTRAIT_UP: "portrait" },
  lockAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("expo-router", () => {
  function MockStack({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function MockStackScreen() {
    return null;
  }
  function MockStackProtected({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  MockStack.Screen = MockStackScreen;
  MockStack.Protected = MockStackProtected;
  return { Stack: MockStack };
});

const RootLayout = require("../../app/_layout").default as typeof import("../../app/_layout").default;

describe("root timer readiness", () => {
  beforeEach(() => jest.clearAllMocks());

  it("activates the timer singleton from the mounted ready subtree exactly once", async () => {
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<RootLayout />);
    });

    expect(mockActivateWhenAppReady).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.unmount();
    });
  });
});
