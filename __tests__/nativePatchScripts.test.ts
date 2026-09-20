import fs from "fs";
import path from "path";

const {
  CAMERA_TRANSFORMATIONS,
  applyExpoCameraOrientationPatchToSource,
  assertSupportedExpoCameraVersion,
  getExpoCameraPaths,
} = require("../scripts/patch-expo-camera-orientation");
const {
  ensureRestTimerManifestEntries,
  patchMainApplicationContents,
} = require("../scripts/sync-android-rest-timer-native");
const {
  verifyAndroidRestTimerNative,
} = require("../scripts/verify-android-rest-timer-native");
const {
  verifyReactNativeCssInteropSafeArea,
} = require("../scripts/verify-react-native-css-interop-safe-area");

const projectRoot = path.resolve(__dirname, "..");

describe("native dependency patches", () => {
  test("applies the Expo Camera patch atomically and idempotently", () => {
    const { targetPath } = getExpoCameraPaths(projectRoot);
    const patchedSource = fs.readFileSync(targetPath, "utf8");
    const upstreamSource = CAMERA_TRANSFORMATIONS.reduce(
      (source: string, transformation: { before: string; after: string }) =>
        source.replace(transformation.after, transformation.before),
      patchedSource
    );

    expect(applyExpoCameraOrientationPatchToSource(upstreamSource)).toBe(patchedSource);
    expect(applyExpoCameraOrientationPatchToSource(patchedSource)).toBe(patchedSource);
  });

  test("rejects partial, duplicate, and unsupported Expo Camera patch states", () => {
    const { targetPath } = getExpoCameraPaths(projectRoot);
    const patchedSource = fs.readFileSync(targetPath, "utf8");
    const upstreamSource = CAMERA_TRANSFORMATIONS.reduce(
      (source: string, transformation: { before: string; after: string }) =>
        source.replace(transformation.after, transformation.before),
      patchedSource
    );
    const partialSource = patchedSource.replace(
      CAMERA_TRANSFORMATIONS[0].after,
      CAMERA_TRANSFORMATIONS[0].before
    );

    expect(() => applyExpoCameraOrientationPatchToSource(partialSource)).toThrow(
      "only partially patched"
    );
    expect(() =>
      applyExpoCameraOrientationPatchToSource(
        `${upstreamSource}\n${CAMERA_TRANSFORMATIONS[0].before}`
      )
    ).toThrow("neither exactly unpatched nor exactly patched");
    expect(() => assertSupportedExpoCameraVersion("99.0.0")).toThrow(
      "Unsupported expo-camera version"
    );
  });

  test("verifies the installed CSS Interop safe-area runtime", () => {
    expect(() => verifyReactNativeCssInteropSafeArea(projectRoot)).not.toThrow();
  });
});

describe("Android rest-timer native integration", () => {
  test("patches MainApplication exactly once and fails on duplicate registration", () => {
    const fixture = [
      "package com.example.app",
      "",
      "import expo.modules.ApplicationLifecycleDispatcher",
      "",
      "PackageList(this).packages.apply {",
      "}",
    ].join("\n");
    const patched = patchMainApplicationContents(fixture, "com.example.app");

    expect(patchMainApplicationContents(patched, "com.example.app")).toBe(patched);
    expect(() =>
      patchMainApplicationContents(
        `${patched}\nadd(RestTimerNotificationsPackage())`,
        "com.example.app"
      )
    ).toThrow("duplicate rest-timer package registrations");
    expect(() =>
      patchMainApplicationContents(
        fixture.replace(
          "PackageList(this).packages.apply {\n}",
          "PackageList(this).packages.apply {\n}\nadd(RestTimerNotificationsPackage())"
        ),
        "com.example.app"
      )
    ).toThrow("outside the PackageList apply block");
  });

  test("normalizes required manifest entries without duplicates", () => {
    const manifest = {
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
        queries: [],
        "uses-permission": [
          { $: { "android:name": "android.permission.SCHEDULE_EXACT_ALARM" } },
          { $: { "android:name": "android.permission.SCHEDULE_EXACT_ALARM" } },
        ],
        application: [
          {
            $: { "android:name": ".MainApplication" },
            receiver: [
              {
                $: {
                  "android:name": ".notifications.RestTimerCompletionReceiver",
                  "android:exported": "true",
                },
              },
              {
                $: {
                  "android:name": ".notifications.RestTimerCompletionReceiver",
                  "android:exported": "false",
                },
              },
            ],
          },
        ],
      },
    };

    ensureRestTimerManifestEntries(manifest);
    const permissions = manifest.manifest["uses-permission"].filter(
      (permission: { $: Record<string, string> }) =>
        permission.$["android:name"] === "android.permission.SCHEDULE_EXACT_ALARM"
    );
    const receivers = manifest.manifest.application[0].receiver;

    expect(permissions).toHaveLength(1);
    expect(receivers).toEqual([
      {
        $: {
          "android:name": ".notifications.RestTimerCompletionReceiver",
          "android:exported": "false",
        },
      },
      {
        $: {
          "android:name": ".notifications.RestTimerCountdownDismissedReceiver",
          "android:exported": "false",
        },
      },
    ]);
  });

  test("verifies all checked-in native invariants without writing", async () => {
    await expect(verifyAndroidRestTimerNative(projectRoot)).resolves.toEqual({
      packageName: "com.anonymous.LiftingLog",
      scheme: "liftinglog",
    });
  });
});
