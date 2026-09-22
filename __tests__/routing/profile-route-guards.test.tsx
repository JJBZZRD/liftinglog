import type { ComponentType } from "react";
import { cleanup } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";

import {
  mockLockAsync,
  mockSeedTestDataExercise,
  mockUseNotificationHandler,
  mockReadyStartupSnapshot,
} from "../helpers/profileRouteSetup";
import {
  createProfileRouteHarness,
  restrictedHealthRoutes,
  restrictedProgramRoutes,
  restrictedRecordingRoutes,
} from "../helpers/profileRouteHarness";

const persistentReact = require("react");
const persistentExpoRouter = require("expo-router");

jest.mock("../../lib/db/connection", () => ({}));
jest.mock("../../lib/db/replacementRestoreLifecycle", () => ({
  getDatabaseStartupSnapshot: () => mockReadyStartupSnapshot,
  subscribeDatabaseStartup: () => () => undefined,
  performDatabaseStartupAction: jest.fn(),
}));

function loadRootLayout(profile: "full" | "mvp"): ComponentType {
  const originalProfile = process.env.EXPO_PUBLIC_RELEASE_PROFILE;
  process.env.EXPO_PUBLIC_RELEASE_PROFILE = profile;

  try {
    let RootLayout: ComponentType;
    jest.isolateModules(() => {
      jest.doMock("react", () => persistentReact);
      jest.doMock("expo-router", () => persistentExpoRouter);
      RootLayout = require("../../app/_layout").default as ComponentType;
    });
    return RootLayout!;
  } finally {
    if (originalProfile === undefined) {
      delete process.env.EXPO_PUBLIC_RELEASE_PROFILE;
    } else {
      process.env.EXPO_PUBLIC_RELEASE_PROFILE = originalProfile;
    }
  }
}

describe("profile route guards", () => {
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    mockLockAsync.mockClear();
    mockSeedTestDataExercise.mockClear();
    mockUseNotificationHandler.mockClear();
  });

  it.each([
    ...restrictedProgramRoutes.map((route) => `/${route.replace("[id]", "42")}`),
    ...restrictedHealthRoutes.map((route) => `/${route.replace("[metric]", "bodyweightKg")}`),
    ...restrictedRecordingRoutes.map((route) => `/${route}`),
  ])("keeps MVP direct navigation to %s out of deferred screens", (initialUrl) => {
    const { context, mountedRoutes } = createProfileRouteHarness(loadRootLayout("mvp"));
    const result = renderRouter(context, { initialUrl });
    const mountedRoute = initialUrl
      .replace(/^\//, "")
      .replace("42", "[id]")
      .replace("bodyweightKg", "[metric]");

    expect(result.getPathname()).toBe("/");
    expect(mountedRoutes[mountedRoute]).toBeUndefined();
    expect(result.getByTestId("route-home")).toBeTruthy();
  });

  it.each([
    ["/exercise/42", "manual-exercise"],
    ["/set/42", "gallery"],
    ["/calculators", "calculators"],
    ["/programs", "programs-tab"],
  ])("keeps %s accessible in MVP", (initialUrl, route) => {
    const { context } = createProfileRouteHarness(loadRootLayout("mvp"));
    const result = renderRouter(context, { initialUrl });

    expect(result.getPathname()).toBe(initialUrl);
    expect(result.getByTestId(`route-${route}`)).toBeTruthy();
  });

  it.each([
    "/programs/create/editor",
    "/user-metric/bodyweightKg",
    "/exercise/record-video",
  ])("retains full-profile direct navigation to %s", (initialUrl) => {
    const { context, mountedRoutes } = createProfileRouteHarness(loadRootLayout("full"));
    const result = renderRouter(context, { initialUrl });
    const mountedRoute = initialUrl
      .replace(/^\//, "")
      .replace("bodyweightKg", "[metric]");

    expect(result.getPathname()).toBe(initialUrl);
    expect(mountedRoutes[mountedRoute]).toBeGreaterThan(0);
  });

  it("keeps notification handling active and skips development seed data in MVP", () => {
    const { context } = createProfileRouteHarness(loadRootLayout("mvp"));
    renderRouter(context, { initialUrl: "/" });

    expect(mockUseNotificationHandler).toHaveBeenCalledTimes(1);
    expect(mockSeedTestDataExercise).not.toHaveBeenCalled();
    expect(mockLockAsync).toHaveBeenCalled();
  });

  it("retains development seed data in the full profile", () => {
    const { context } = createProfileRouteHarness(loadRootLayout("full"));
    renderRouter(context, { initialUrl: "/" });

    expect(mockUseNotificationHandler).toHaveBeenCalledTimes(1);
    expect(mockSeedTestDataExercise).toHaveBeenCalledTimes(1);
  });
});
