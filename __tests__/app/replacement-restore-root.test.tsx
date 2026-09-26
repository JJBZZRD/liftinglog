/* eslint-disable @typescript-eslint/no-require-imports */

import React from "react";
import renderer, { act } from "react-test-renderer";

import {
  ReplacementRestoreError,
  type RestoreCommitResult,
  type RestoreStartupResult,
} from "../../lib/db/replacementRestoreContract";

const mockReact = React;
const mockEvents: string[] = [];
const mockSqlite = { execSync: jest.fn() };
const mockSettingsRow = {
  themePreference: "dark",
  colorTheme: "ocean",
  unitPreference: "lb",
};
const mockDb = { select: jest.fn() };
const mockOpenDatabaseSync = jest.fn();
const mockDrizzle = jest.fn();
const mockInitializeDatabase = jest.fn();
const mockApplyStartup = jest.fn();
const mockSchedule = jest.fn();
const mockDiscardPrepared = jest.fn();
const mockRetire = jest.fn();
const mockQuiesce = jest.fn();
const mockActivate = jest.fn();
const mockGetGeneration = jest.fn();
const mockGetProcessToken = jest.fn();
const mockReadControl = jest.fn();
const mockClearResponse = jest.fn();
const mockGetLastResponse = jest.fn();
const mockAddResponseListener = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockSetColorScheme = jest.fn();
const mockStatusBar = jest.fn(() => null);
const mockLockAsync = jest.fn(() => Promise.resolve());
const mockSeed = jest.fn(() => Promise.resolve());

let mockStartupResult: RestoreStartupResult;
let mockRetainedResponseResolver: ((value: unknown) => void) | undefined;

jest.mock("expo-sqlite", () => ({ openDatabaseSync: mockOpenDatabaseSync }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: mockDrizzle }));
jest.mock("expo", () => ({ reloadAppAsync: jest.fn(() => Promise.resolve()) }));
jest.mock("expo-notifications", () => ({
  clearLastNotificationResponseAsync: mockClearResponse,
  getLastNotificationResponseAsync: mockGetLastResponse,
  addNotificationResponseReceivedListener: mockAddResponseListener,
}));
jest.mock("expo-router", () => {
  const Stack = ({ children }: { children: React.ReactNode }) =>
    mockReact.createElement(mockReact.Fragment, null, children);
  Stack.Screen = () => null;
  Stack.Protected = ({ children }: { children: React.ReactNode }) =>
    mockReact.createElement(mockReact.Fragment, null, children);
  return {
    Stack,
    router: { push: mockRouterPush, replace: mockRouterReplace },
    usePathname: () => "/(tabs)/history",
  };
});
jest.mock("react-native", () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    mockReact.createElement(mockReact.Fragment, null, children);
  return {
    Platform: { OS: "android" },
    BackHandler: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Pressable: passthrough,
    ScrollView: passthrough,
    Text: passthrough,
    View: passthrough,
  };
});
jest.mock("expo-screen-orientation", () => ({
  OrientationLock: { PORTRAIT_UP: "PORTRAIT_UP" },
  lockAsync: mockLockAsync,
}));
jest.mock("expo-status-bar", () => ({ StatusBar: mockStatusBar }));
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    mockReact.createElement(mockReact.Fragment, null, children),
}));
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "dark", setColorScheme: mockSetColorScheme }),
  vars: (values: Record<string, string>) => values,
}));
jest.mock("../../app/global.css", () => ({}));
jest.mock("../../lib/db/bootstrap", () => ({ initializeDatabase: mockInitializeDatabase }));
jest.mock("../../lib/db/seedTestData", () => ({ seedTestDataExercise: mockSeed }));
jest.mock("../../lib/native/appProcessIdentity", () => ({
  getNativeProcessToken: mockGetProcessToken,
}));
jest.mock("../../lib/native/restTimerNotifications", () => ({
  getRestTimerNavigationGeneration: mockGetGeneration,
  retireRestTimerArtifactsForReplacementRestore: mockRetire,
}));
jest.mock("../../lib/native/restoreControlStore", () => ({
  readRestoreControlRecord: mockReadControl,
}));
jest.mock("../../lib/timerStore", () => ({
  timerStore: {
    activateWhenAppReady: mockActivate,
    quiesceForReplacementRestore: mockQuiesce,
  },
}));
jest.mock("../../lib/db/replacementRestore", () => ({
  applyScheduledReplacementRestoreAtStartup: mockApplyStartup,
  scheduleReplacementRestore: mockSchedule,
  discardPreparedRestore: mockDiscardPrepared,
  cancelScheduledReplacementRestore: jest.fn(),
  discardSafelyFailedScheduledRestore: jest.fn(),
  resumeCommittedStartupFinalization: jest.fn(),
  completeReplacementRestorePostCommit: jest.fn(),
}));

const processToken = "process-v1:123e4567-e89b-42d3-a456-426614174000";
const expoOsKey = ["EXPO", "OS"].join("_");

function settingsSelectChain() {
  return {
    from: () => ({
      where: () => ({
        get: () => mockSettingsRow,
      }),
    }),
  };
}

function resetHarness(
  startupResult: RestoreStartupResult = { status: "no_pending", pendingPresence: "absent" }
) {
  jest.resetModules();
  jest.clearAllMocks();
  mockEvents.length = 0;
  mockStartupResult = startupResult;
  mockRetainedResponseResolver = undefined;
  process.env[expoOsKey] = "android";

  mockOpenDatabaseSync.mockImplementation(() => {
    mockEvents.push("open");
    return mockSqlite;
  });
  mockSqlite.execSync.mockImplementation((sql: string) => {
    mockEvents.push(`pragma:${sql}`);
  });
  mockApplyStartup.mockImplementation(() => {
    mockEvents.push("engine");
    return mockStartupResult;
  });
  mockInitializeDatabase.mockImplementation(() => mockEvents.push("bootstrap"));
  mockDrizzle.mockImplementation(() => {
    mockEvents.push("drizzle");
    return mockDb;
  });
  mockDb.select.mockImplementation(() => {
    mockEvents.push("settings-query");
    return settingsSelectChain();
  });
  mockGetProcessToken.mockReturnValue(processToken);
  mockGetGeneration.mockReturnValue({ status: "available", generation: null });
  mockReadControl.mockReturnValue({ status: "absent" });
  mockQuiesce.mockResolvedValue(undefined);
  mockRetire.mockResolvedValue({
    status: "retired",
    registeredTimersRetired: 0,
    displayedNotificationsCleared: true,
  });
  mockClearResponse.mockResolvedValue(undefined);
  mockDiscardPrepared.mockResolvedValue(undefined);
  mockGetLastResponse.mockResolvedValue(null);
  mockAddResponseListener.mockReturnValue({ remove: jest.fn() });
}

async function renderActualRoot() {
  let RootLayout!: React.ComponentType;
  let lifecycle!: typeof import("../../lib/db/replacementRestoreLifecycle");
  let connection!: typeof import("../../lib/db/connection");
  jest.isolateModules(() => {
    jest.doMock("react", () => mockReact);
    RootLayout = require("../../app/_layout").default as React.ComponentType;
    lifecycle = require("../../lib/db/replacementRestoreLifecycle");
    connection = require("../../lib/db/connection");
  });

  let tree!: ReturnType<typeof renderer.create>;
  await act(async () => {
    tree = renderer.create(<RootLayout />);
    await Promise.resolve();
  });
  return { tree, lifecycle, connection };
}

describe("actual root replacement restore lifecycle", () => {
  const originalExpoOs = process.env[expoOsKey];
  const originalProfile = process.env.EXPO_PUBLIC_RELEASE_PROFILE;

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalExpoOs === undefined) delete process.env[expoOsKey];
    else process.env[expoOsKey] = originalExpoOs;
    if (originalProfile === undefined) delete process.env.EXPO_PUBLIC_RELEASE_PROFILE;
    else process.env.EXPO_PUBLIC_RELEASE_PROFILE = originalProfile;
  });

  it("publishes one restored handle before actual providers read restored settings", async () => {
    resetHarness();
    const { tree, connection } = await renderActualRoot();

    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(1);
    expect(mockSqlite.execSync.mock.calls.map(([sql]) => sql)).toEqual([
      "PRAGMA foreign_keys = ON;",
      "PRAGMA journal_mode = WAL;",
      "PRAGMA synchronous = NORMAL;",
    ]);
    expect(mockEvents.slice(0, 7)).toEqual([
      "open",
      "pragma:PRAGMA foreign_keys = ON;",
      "pragma:PRAGMA journal_mode = WAL;",
      "pragma:PRAGMA synchronous = NORMAL;",
      "engine",
      "bootstrap",
      "drizzle",
    ]);
    // Display mode and weight unit. The stored colour theme is no longer read (Ink is app-wide).
    expect(mockEvents.filter((event) => event === "settings-query")).toHaveLength(2);
    expect(mockEvents.indexOf("settings-query")).toBeGreaterThan(mockEvents.indexOf("drizzle"));
    expect(connection.sqlite).toBe(mockSqlite);
    expect(connection.db).toBe(mockDb);
    expect(mockSetColorScheme).toHaveBeenCalledWith("dark");
    expect(mockStatusBar).toHaveBeenCalledWith(
      expect.objectContaining({ style: "light" }),
      undefined
    );
    expect(mockAddResponseListener).toHaveBeenCalledTimes(1);
    expect(mockActivate).toHaveBeenCalledTimes(1);

    await act(async () => tree.unmount());
  });

  it.each([
    {
      label: "precommit blocker",
      result: {
        status: "restart_required",
        restoreId: "restore-blocked",
        liveDatabaseChanged: false,
        restartRequired: true,
      } as RestoreStartupResult,
      expectsBindings: false,
    },
    {
      label: "postcommit media gate",
      result: {
        status: "postcommit_pending",
        restoreId: "restore-postcommit",
        liveDatabaseChanged: true,
        rowsByTable: {} as RestoreCommitResult["rowsByTable"],
        pbEventsRebuilt: 0,
        requiresExplicitMediaScan: true,
      } as RestoreStartupResult,
      expectsBindings: true,
    },
    {
      label: "newly committed media gate",
      result: {
        status: "committed",
        restoreId: "restore-committed",
        liveDatabaseChanged: true,
        rowsByTable: {} as RestoreCommitResult["rowsByTable"],
        pbEventsRebuilt: 0,
        postCommitPending: true,
        warnings: [],
      } as RestoreStartupResult,
      expectsBindings: true,
    },
    {
      label: "committed cleanup blocker",
      result: {
        status: "committed_pending_cleanup",
        restoreId: "restore-cleanup",
        liveDatabaseChanged: true,
        normalUseBlocked: true,
        retryable: true,
        warning: { stage: "pending_manifest_cleanup", code: "cleanup_failed" },
      } as RestoreStartupResult,
      expectsBindings: false,
    },
    {
      label: "committed outcome blocker",
      result: {
        status: "committed_pending_outcome",
        restoreId: "restore-outcome",
        liveDatabaseChanged: true,
        normalUseBlocked: true,
        retryable: true,
        warning: { stage: "committed_outcome_write", code: "outcome_failed" },
      } as RestoreStartupResult,
      expectsBindings: false,
    },
    {
      label: "engine failure blocker",
      result: {
        status: "failed",
        restoreId: "restore-failed",
        error: new ReplacementRestoreError("outcome_ambiguous", "ambiguous outcome", {
          stage: "checking_pending_restore",
          liveDatabaseChanged: "unknown",
          transactionState: "unknown",
          recovery: "manual_recovery",
          retryable: false,
        }),
      } as RestoreStartupResult,
      expectsBindings: false,
    },
  ])("keeps providers, Router effects and queries behind the actual $label", async ({ result, expectsBindings }) => {
    resetHarness(result);
    const { tree } = await renderActualRoot();

    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(1);
    expect(mockInitializeDatabase).toHaveBeenCalledTimes(expectsBindings ? 1 : 0);
    expect(mockDrizzle).toHaveBeenCalledTimes(expectsBindings ? 1 : 0);
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockAddResponseListener).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockLockAsync).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });

  it("rejects a retained legacy response requested before a safe scheduling quarantine", async () => {
    resetHarness();
    mockGetLastResponse.mockImplementation(
      () =>
        new Promise((resolve) => {
          mockRetainedResponseResolver = resolve;
        })
    );
    mockRetire.mockRejectedValue(new Error("native retirement failed"));
    const { tree, lifecycle } = await renderActualRoot();

    await act(async () => {
      await expect(
        lifecycle.scheduleReplacementRestoreAndBlock({ token: "prepared-retained" })
      ).rejects.toMatchObject({ stage: "scheduling", liveDatabaseChanged: false });
    });
    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("ready");

    await act(async () => {
      mockRetainedResponseResolver?.({
        notification: {
          request: {
            identifier: "retained-old",
            content: {
              data: { timerId: "timer-old", exerciseId: 42, endAt: 1000 },
            },
          },
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});
