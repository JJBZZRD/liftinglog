import fs from "node:fs";
import path from "node:path";

describe("non-shipping replacement restore kill entry", () => {
  const originalProbeFlag = process.env.EXPO_PUBLIC_RESTORE_KILL_PROBE;
  const originalDev = (global as typeof globalThis & { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    if (originalProbeFlag === undefined) {
      delete process.env.EXPO_PUBLIC_RESTORE_KILL_PROBE;
    } else {
      process.env.EXPO_PUBLIC_RESTORE_KILL_PROBE = originalProbeFlag;
    }
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  it("imports the real entry, component, and engine graph without Router or mutation", () => {
    const registerRootComponent = jest.fn();
    const mutationCalls: string[] = [];
    let mockApplicationId: string | null =
      "com.anonymous.LiftingLog.restorekillprobe";

    process.env.EXPO_PUBLIC_RESTORE_KILL_PROBE = "1";
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;

    jest.doMock("expo", () => ({ registerRootComponent }));
    jest.doMock("expo-application", () => ({
      get applicationId() {
        return mockApplicationId;
      },
    }));
    jest.doMock("../../app/global.css", () => ({}));
    jest.doMock("react-native", () => ({
      NativeModules: {},
      Platform: { OS: "android" },
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
    }));
    jest.doMock("expo-file-system", () => {
      class ImportMutationSentinel {
        constructor() {
          mutationCalls.push("filesystem-constructor");
          throw new Error("Filesystem objects must not be created during import.");
        }
      }
      return {
        Directory: ImportMutationSentinel,
        File: ImportMutationSentinel,
        FileMode: { ReadOnly: "read-only" },
        Paths: { document: "file:///probe-documents/" },
      };
    });
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: () => {
        mutationCalls.push("open-database");
        throw new Error("SQLite must not open during import.");
      },
    }));
    jest.doMock("expo-document-picker", () => ({
      getDocumentAsync: () => {
        mutationCalls.push("document-picker");
        throw new Error("Picker must not open during import.");
      },
    }));
    const unexpectedExternalCall = (label: string) => () => {
      mutationCalls.push(label);
      throw new Error(`${label} must not execute during import.`);
    };
    jest.doMock("expo-file-system/legacy", () => ({
      __esModule: true,
      documentDirectory: "file:///probe-documents/",
      copyAsync: unexpectedExternalCall("legacy-copy"),
      deleteAsync: unexpectedExternalCall("legacy-delete"),
      getInfoAsync: unexpectedExternalCall("legacy-info"),
      makeDirectoryAsync: unexpectedExternalCall("legacy-mkdir"),
    }));
    jest.doMock("expo-media-library/legacy", () => ({
      __esModule: true,
      MediaType: { video: "video" },
      SortBy: { creationTime: "creationTime" },
      createAlbumAsync: unexpectedExternalCall("media-create-album"),
      createAssetAsync: unexpectedExternalCall("media-create-asset"),
      getAlbumAsync: unexpectedExternalCall("media-get-album"),
      getAlbumsAsync: unexpectedExternalCall("media-get-albums"),
      getAssetContentUriAsync: unexpectedExternalCall("media-content-uri"),
      getAssetInfoAsync: unexpectedExternalCall("media-asset-info"),
      getAssetsAsync: unexpectedExternalCall("media-assets"),
      getPermissionsAsync: unexpectedExternalCall("media-permissions"),
      requestPermissionsAsync: unexpectedExternalCall("media-request-permissions"),
    }));

    const forbiddenModules = [
      "expo-router",
      "expo-router/entry",
      "../../lib/db/replacementRestoreLifecycle",
      "../../lib/db/connection",
      "../../lib/notificationHandler",
      "../../lib/restTimerNavigationGuard",
      "../../lib/timerStore",
    ];
    for (const moduleName of forbiddenModules) {
      jest.doMock(moduleName, () => {
        throw new Error(`Forbidden diagnostic import: ${moduleName}`);
      });
    }

    let entry: typeof import("../../restore-kill-entry");
    let component: typeof import("../../diagnostics/RestoreEngineKillProbe");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    entry = require("../../restore-kill-entry") as typeof import("../../restore-kill-entry");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    component = require("../../diagnostics/RestoreEngineKillProbe") as typeof import("../../diagnostics/RestoreEngineKillProbe");

    const React = jest.requireActual<typeof import("react")>("react");
    const TestRenderer = jest.requireActual<typeof import("react-test-renderer")>(
      "react-test-renderer"
    );
    let renderer: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(component!.default));
    });
    mockApplicationId = "com.anonymous.LiftingLog";
    TestRenderer.act(() => {
      renderer!.update(React.createElement(component!.default));
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "Restore kill diagnostic disabled"
    );
    mockApplicationId = null;
    TestRenderer.act(() => {
      renderer!.update(React.createElement(component!.default));
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "Restore kill diagnostic disabled"
    );

    const identityGuard = component!.createRestoreKillMutationGuard();
    const identityMutations: string[] = [];
    expect(() => identityGuard.run(() => identityMutations.push("normal-app"))).toThrow(
      "requires a development Android build"
    );
    mockApplicationId = null;
    expect(() => identityGuard.run(() => identityMutations.push("null-app"))).toThrow(
      "requires a development Android build"
    );
    expect(identityMutations).toEqual([]);

    mockApplicationId = "com.anonymous.LiftingLog.restorekillprobe";
    const controlWrites: string[] = [];
    const mutationGuard = component!.createRestoreKillMutationGuard();
    mutationGuard.run(() => controlWrites.push("pending:attempting"));
    expect(() =>
      mutationGuard.failAfterCheckpointTimeout("precommit")
    ).toThrow("runtime is fail-closed");
    expect(() =>
      mutationGuard.run(() => controlWrites.push("pending:rolled_back_unchanged"))
    ).toThrow(
      "further mutations are blocked"
    );
    expect(controlWrites).toEqual(["pending:attempting"]);

    TestRenderer.act(() => renderer!.unmount());

    expect(entry!).toEqual({});
    expect(registerRootComponent).toHaveBeenCalledTimes(1);
    expect(registerRootComponent).toHaveBeenCalledWith(component!.default);
    expect(component!.RESTORE_KILL_POINTS).toEqual([
      "before_attempt",
      "after_attempt",
      "precommit",
      "postcommit",
      "postoutcome",
      "postdelete",
    ]);
    expect(component!.RESTORE_KILL_HOLD_MILLIS).toBe(60_000);
    expect(component!.RESTORE_KILL_PROBE_APPLICATION_ID).toBe(
      "com.anonymous.LiftingLog.restorekillprobe"
    );
    expect(mutationCalls).toEqual([]);
  });

  it("pins the custom entry and unique debug application sandbox", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { main?: unknown };
    const appJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "app.json"), "utf8")
    ) as { expo?: { android?: { package?: unknown } } };
    const gradle = fs.readFileSync(
      path.join(process.cwd(), "android", "app", "build.gradle"),
      "utf8"
    );
    const entrySource = fs.readFileSync(
      path.join(process.cwd(), "restore-kill-entry.tsx"),
      "utf8"
    );
    const tailwind = fs.readFileSync(
      path.join(process.cwd(), "tailwind.config.js"),
      "utf8"
    );

    expect(packageJson.main).toBe("./restore-kill-entry.tsx");
    expect(appJson.expo?.android?.package).toBe(
      "com.anonymous.LiftingLog.restorekillprobe"
    );
    expect(gradle).toContain("applicationId 'com.anonymous.LiftingLog'");
    expect(gradle).toMatch(
      /debug\s*\{\s*signingConfig signingConfigs\.debug\s*applicationIdSuffix '\.restorekillprobe'/
    );
    expect(entrySource).toMatch(/^import "\.\/app\/global\.css";/);
    expect(tailwind).toContain('"./diagnostics/**/*.{js,jsx,ts,tsx}"');
  });
});
