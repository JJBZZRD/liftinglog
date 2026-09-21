import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { CapabilityGuard } from "../../components/routing/CapabilityGuard";
import { getCapabilities } from "../../lib/config/releaseProfile";
import { isCapabilityEnabled } from "../../lib/routing/capabilityAccess";

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => require("react").createElement("Redirect", { href }),
}));

jest.mock("expo/virtual/env", () => ({ env: process.env }));

jest.mock("../../lib/config/releaseProfile", () => {
  const actual = jest.requireActual<typeof import("../../lib/config/releaseProfile")>(
    "../../lib/config/releaseProfile"
  );
  return { ...actual, appCapabilities: actual.getCapabilities("mvp") };
});

describe("isCapabilityEnabled", () => {
  it.each([
    ["programsExperience", "full", true],
    ["programsExperience", "mvp", false],
    ["healthMetrics", "full", true],
    ["healthMetrics", "mvp", false],
    ["videoRecording", "full", true],
    ["videoRecording", "mvp", false],
    ["thirdPartyImport", "full", true],
    ["thirdPartyImport", "mvp", false],
    ["multipleWorkoutSessions", "full", true],
    ["multipleWorkoutSessions", "mvp", false],
  ] as const)("reports %s for %s", (capability, profile, expected) => {
    expect(isCapabilityEnabled(capability, getCapabilities(profile))).toBe(expected);
  });
});

describe("CapabilityGuard", () => {
  it("redirects to tabs without mounting denied children", () => {
    const onMount = jest.fn();
    const Child = () => {
      onMount();
      return React.createElement("Child");
    };

    let result: ReturnType<typeof TestRenderer.create>;
    act(() => {
      result = TestRenderer.create(
        React.createElement(
          CapabilityGuard,
          { capability: "videoRecording", children: React.createElement(Child) }
        )
      );
    });

    expect(onMount).not.toHaveBeenCalled();
    expect(result!.root.findByType("Redirect").props.href).toBe("/(tabs)");
  });
});
