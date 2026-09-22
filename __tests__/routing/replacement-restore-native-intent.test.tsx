/* eslint-disable @typescript-eslint/no-require-imports */

import React from "react";
import { Text } from "react-native";
import * as ExpoLinking from "expo-linking";
import { Stack } from "expo-router";
import {
  act,
  cleanup,
  renderRouter,
  waitFor,
} from "expo-router/testing-library";

import type { RestoreStartupResult } from "../../lib/db/replacementRestoreContract";

const persistentReact = React;
const persistentExpoRouter = require("expo-router");
const persistentReactNative = require("react-native") as typeof import("react-native");
const mockSqlite = { execSync: jest.fn() };
const mockDb = {};
const mockOpenDatabaseSync = jest.fn();
const mockDrizzle = jest.fn();
const mockInitializeDatabase = jest.fn();
const mockApplyStartup = jest.fn();
const mockGetProcessToken = jest.fn();
const mockGetGeneration = jest.fn();
const mockReadControl = jest.fn();

let mockStartupResult: RestoreStartupResult;
let mockNavigationGeneration: string | null;

jest.mock("expo-sqlite", () => ({ openDatabaseSync: mockOpenDatabaseSync }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: mockDrizzle }));
jest.mock("expo", () => ({
  ...jest.requireActual("expo"),
  reloadAppAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-notifications", () => ({
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../lib/db/bootstrap", () => ({ initializeDatabase: mockInitializeDatabase }));
jest.mock("../../lib/native/appProcessIdentity", () => ({
  getNativeProcessToken: mockGetProcessToken,
}));
jest.mock("../../lib/native/restTimerNotifications", () => ({
  getRestTimerNavigationGeneration: mockGetGeneration,
  retireRestTimerArtifactsForReplacementRestore: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../lib/native/restoreControlStore", () => ({
  readRestoreControlRecord: mockReadControl,
}));
jest.mock("../../lib/db/replacementRestore", () => ({
  applyScheduledReplacementRestoreAtStartup: mockApplyStartup,
  scheduleReplacementRestore: jest.fn(),
  cancelScheduledReplacementRestore: jest.fn(),
  discardPreparedRestore: jest.fn(),
  discardSafelyFailedScheduledRestore: jest.fn(),
  resumeCommittedStartupFinalization: jest.fn(),
  completeReplacementRestorePostCommit: jest.fn(),
}));

const generationA = "timer-nav-v1:123e4567-e89b-42d3-a456-426614174000";
const generationB = "timer-nav-v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const processToken = "process-v1:123e4567-e89b-42d3-a456-426614174000";
const expoOsKey = ["EXPO", "OS"].join("_");

type NativeIntentModule = typeof import("../../app/+native-intent");
type UrlEvent = { url: string };

function timerPath(generation: string | null = mockNavigationGeneration) {
  const suffix = generation
    ? `&navigationGeneration=${encodeURIComponent(generation)}`
    : "";
  return `/exercise/42?tab=record&source=notification&timerId=timer-42&endAt=1000${suffix}`;
}

function RootLayout() {
  return <Stack />;
}

function route(label: string, mounts: Record<string, number>) {
  return () => {
    mounts[label] = (mounts[label] ?? 0) + 1;
    return <Text testID={`route-${label}`}>{label}</Text>;
  };
}

function resetHarness(
  startupResult: RestoreStartupResult = { status: "no_pending", pendingPresence: "absent" },
  navigationGeneration: string | null = generationA
) {
  jest.resetModules();
  jest.doMock("react", () => persistentReact);
  jest.doMock("expo-router", () => persistentExpoRouter);
  jest.doMock("react-native", () => persistentReactNative);
  jest.clearAllMocks();
  process.env[expoOsKey] = "android";
  mockStartupResult = startupResult;
  mockNavigationGeneration = navigationGeneration;
  mockOpenDatabaseSync.mockReturnValue(mockSqlite);
  mockApplyStartup.mockImplementation(() => mockStartupResult);
  mockInitializeDatabase.mockImplementation(() => undefined);
  mockDrizzle.mockReturnValue(mockDb);
  mockGetProcessToken.mockReturnValue(processToken);
  mockGetGeneration.mockImplementation(() => ({
    status: "available",
    generation: mockNavigationGeneration,
  }));
  mockReadControl.mockReturnValue({ status: "absent" });
}

function createRouterHarness() {
  let nativeIntent!: NativeIntentModule;
  let lifecycle!: typeof import("../../lib/db/replacementRestoreLifecycle");
  jest.isolateModules(() => {
    nativeIntent = require("../../app/+native-intent") as NativeIntentModule;
    lifecycle = require("../../lib/db/replacementRestoreLifecycle");
  });
  const redirectSystemPath = jest.fn(nativeIntent.redirectSystemPath);
  const mounts: Record<string, number> = {};
  const context = {
    _layout: { default: RootLayout },
    index: { default: route("safe", mounts) },
    "exercise/[id]": { default: route("exercise", mounts) },
    settings: { default: route("settings", mounts) },
    "+native-intent": { redirectSystemPath },
  };
  return { context, lifecycle, mounts, redirectSystemPath };
}

async function settleRouter() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("installed Expo Router replacement restore native-intent pipeline", () => {
  const originalExpoOs = process.env[expoOsKey];
  let warmListener: ((event: UrlEvent) => void | Promise<void>) | undefined;
  let linkingSpy: jest.SpyInstance;

  beforeEach(() => {
    warmListener = undefined;
    linkingSpy = jest
      .spyOn(ExpoLinking, "addEventListener")
      .mockImplementation(((_type: string, listener: (event: UrlEvent) => void) => {
        warmListener = listener;
        return { remove: jest.fn() };
      }) as unknown as typeof ExpoLinking.addEventListener);
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    linkingSpy.mockRestore();
  });

  afterAll(() => {
    if (originalExpoOs === undefined) delete process.env[expoOsKey];
    else process.env[expoOsKey] = originalExpoOs;
  });

  it("runs the actual initial pipeline and admits only a ready current-generation timer", async () => {
    resetHarness();
    const { context, mounts, redirectSystemPath } = createRouterHarness();
    const result = renderRouter(context, { initialUrl: timerPath(generationA) });
    await settleRouter();

    await waitFor(() => expect(result.getPathname()).toBe("/exercise/42"));
    expect(mounts.exercise).toBeGreaterThan(0);
    expect(redirectSystemPath).toHaveBeenCalledWith(
      expect.objectContaining({ initial: true })
    );
    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(1);
    expect(mockInitializeDatabase).toHaveBeenCalledTimes(1);
  });

  it("fails a blocked initial reused-ID target to the safe route", async () => {
    resetHarness();
    mockOpenDatabaseSync.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    const { context, mounts } = createRouterHarness();
    const result = renderRouter(context, { initialUrl: timerPath(generationA) });
    await settleRouter();

    await waitFor(() => expect(result.getPathname()).toBe("/"));
    expect(mounts.exercise).toBeUndefined();
    expect(mounts.safe).toBeGreaterThan(0);
  });

  it("revalidates warm links at delivery after generation rotation", async () => {
    resetHarness();
    const { context, mounts, redirectSystemPath } = createRouterHarness();
    const result = renderRouter(context, { initialUrl: "/" });
    await settleRouter();
    mockNavigationGeneration = generationB;

    await act(async () => {
      await warmListener?.({ url: `liftinglog://${timerPath(generationA).slice(1)}` });
      await Promise.resolve();
    });
    expect(result.getPathname()).toBe("/");
    expect(mounts.exercise).toBeUndefined();

    await act(async () => {
      await warmListener?.({ url: `liftinglog://${timerPath(generationB).slice(1)}` });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.getPathname()).toBe("/exercise/42"));
    expect(redirectSystemPath).toHaveBeenCalledWith(
      expect.objectContaining({ initial: false })
    );
  });

  it.each([
    [
      "encoded marker key",
      "liftinglog://exercise/42?source%3Dnotification%26timerId%3Dold%26endAt%3D1",
    ],
    ["blank timer ID", `liftinglog://${timerPath(generationA).slice(1).replace("timerId=timer-42", "timerId=%20")}`],
    ["nonpositive end time", `liftinglog://${timerPath(generationA).slice(1).replace("endAt=1000", "endAt=0")}`],
  ])("fails malformed warm %s links closed before exercise routing", async (_label, url) => {
    resetHarness();
    const { context, mounts } = createRouterHarness();
    const result = renderRouter(context, { initialUrl: "/" });
    await settleRouter();

    await act(async () => {
      await warmListener?.({ url });
      await Promise.resolve();
    });
    expect(result.getPathname()).toBe("/");
    expect(mounts.exercise).toBeUndefined();
  });

  it("preserves an unrelated warm source parameter", async () => {
    resetHarness();
    const { context, redirectSystemPath } = createRouterHarness();
    const result = renderRouter(context, { initialUrl: "/" });
    await settleRouter();

    await act(async () => {
      await warmListener?.({ url: "liftinglog://settings?source=share" });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.getPathname()).toBe("/settings"));
    expect(redirectSystemPath).toHaveBeenLastCalledWith({
      path: "liftinglog://settings?source=share",
      initial: false,
    });
  });

  it("keeps an old reused-ID target rejected in a new lifecycle instance", async () => {
    resetHarness(undefined, generationB);
    const { context, mounts, lifecycle } = createRouterHarness();
    const result = renderRouter(context, { initialUrl: timerPath(generationA) });
    await settleRouter();

    await waitFor(() => expect(result.getPathname()).toBe("/"));
    expect(lifecycle.getDatabaseStartupSnapshot().phase).toBe("ready");
    expect(mounts.exercise).toBeUndefined();
    expect(mockOpenDatabaseSync).toHaveBeenCalledTimes(1);
  });
});
