/* eslint-disable @typescript-eslint/no-require-imports */
import fs from "fs";
import os from "os";
import path from "path";

const {
  GSON_DEPENDENCY,
  JUNIT_DEPENDENCY,
  KOTLIN_TEMPLATES,
  patchAppBuildGradleContents,
  patchMainApplicationContents,
  syncAndroidRestoreNative,
} = require("../../scripts/sync-android-restore-native");
const {
  verifyAndroidRestoreNative,
} = require("../../scripts/verify-android-restore-native");

const projectRoot = path.resolve(__dirname, "../..");

function mainApplicationFixture(packageName: string): string {
  return [
    `package ${packageName}`,
    "",
    `import ${packageName}.notifications.RestTimerNotificationsPackage`,
    "import expo.modules.ApplicationLifecycleDispatcher",
    "",
    "class MainApplication {",
    "  val packages = PackageList(this).packages.apply {",
    "    add(RestTimerNotificationsPackage())",
    "  }",
    "",
    "  override fun onCreate() {",
    "    super.onCreate()",
    "    existingStartupWork()",
    "  }",
    "}",
    "",
  ].join("\n");
}

function appBuildGradleFixture(): string {
  return [
    'apply plugin: "com.android.application"',
    "",
    "dependencies {",
    '    implementation("com.facebook.react:react-android")',
    "}",
    "",
  ].join("\n");
}

describe("Android restore native plugin", () => {
  it("pins strict Gson and native-test dependencies exactly once", () => {
    const fixture = appBuildGradleFixture();
    const patched = patchAppBuildGradleContents(fixture);

    expect(patchAppBuildGradleContents(patched)).toBe(patched);
    expect(patched.match(/com\.google\.code\.gson:gson/g)).toHaveLength(1);
    expect(patched.match(/junit:junit/g)).toHaveLength(1);
    expect(patched).toContain(GSON_DEPENDENCY);
    expect(patched).toContain(JUNIT_DEPENDENCY);
    expect(patched).toContain('implementation("com.facebook.react:react-android")');
  });

  it("rejects duplicate or drifted strict-parser dependencies", () => {
    const patched = patchAppBuildGradleContents(appBuildGradleFixture());

    expect(() =>
      patchAppBuildGradleContents(`${patched.trimEnd()}\n    ${GSON_DEPENDENCY}\n`)
    ).toThrow("duplicate Gson dependencies");
    expect(() =>
      patchAppBuildGradleContents(patched.replace("gson:2.13.2", "gson:2.8.6"))
    ).toThrow(`must use exactly ${GSON_DEPENDENCY}`);
    expect(() =>
      patchAppBuildGradleContents(patched.replace("junit:4.13.2", "junit:4.12"))
    ).toThrow(`must use exactly ${JUNIT_DEPENDENCY}`);
  });

  it("patches registration and initialization exactly once while preserving rest timer", () => {
    const packageName = "com.example.app";
    const fixture = mainApplicationFixture(packageName);
    const patched = patchMainApplicationContents(fixture, packageName);

    expect(patchMainApplicationContents(patched, packageName)).toBe(patched);
    expect(patched.match(/add\(RestoreNativePackage\(\)\)/g)).toHaveLength(1);
    expect(patched.match(/AppProcessIdentity\.initialize\(\)/g)).toHaveLength(1);
    expect(patched).toContain("add(RestTimerNotificationsPackage())");
    expect(patched).toContain("existingStartupWork()");
  });

  it("rejects duplicate or misplaced native setup", () => {
    const packageName = "com.example.app";
    const patched = patchMainApplicationContents(mainApplicationFixture(packageName), packageName);

    expect(() =>
      patchMainApplicationContents(
        patched.replace(
          "add(RestoreNativePackage())",
          "add(RestoreNativePackage())\n          add(RestoreNativePackage())"
        ),
        packageName
      )
    ).toThrow("duplicate restore package registrations");
    expect(() =>
      patchMainApplicationContents(
        patched.replace(
          "AppProcessIdentity.initialize()",
          "AppProcessIdentity.initialize()\n    AppProcessIdentity.initialize()"
        ),
        packageName
      )
    ).toThrow("duplicate process identity initialization");
    expect(() =>
      patchMainApplicationContents(
        patched.replace(
          "          add(RestoreNativePackage())\n",
          ""
        ) + "\nadd(RestoreNativePackage())\n",
        packageName
      )
    ).toThrow("outside the PackageList apply block");
  });

  it("synchronizes generated Kotlin idempotently", () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "liftinglog-restore-native-"));
    const packageName = "com.example.app";
    try {
      fs.mkdirSync(path.join(temporaryRoot, "scripts", "android-restore-native"), {
        recursive: true,
      });
      fs.mkdirSync(
        path.join(temporaryRoot, "android", "app", "src", "main", "java", ...packageName.split(".")),
        { recursive: true }
      );
      fs.writeFileSync(
        path.join(temporaryRoot, "app.json"),
        JSON.stringify({ expo: { android: { package: packageName } } }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(temporaryRoot, "android", "app", "build.gradle"),
        appBuildGradleFixture(),
        "utf8"
      );
      for (const filename of KOTLIN_TEMPLATES) {
        fs.copyFileSync(
          path.join(projectRoot, "scripts", "android-restore-native", filename),
          path.join(temporaryRoot, "scripts", "android-restore-native", filename)
        );
      }
      const mainApplicationPath = path.join(
        temporaryRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        ...packageName.split("."),
        "MainApplication.kt"
      );
      fs.writeFileSync(mainApplicationPath, mainApplicationFixture(packageName), "utf8");

      syncAndroidRestoreNative(temporaryRoot);
      const firstAppBuildGradle = fs.readFileSync(
        path.join(temporaryRoot, "android", "app", "build.gradle"),
        "utf8"
      );
      const firstMainApplication = fs.readFileSync(mainApplicationPath, "utf8");
      const firstGenerated = KOTLIN_TEMPLATES.map((filename: string) =>
        fs.readFileSync(
          path.join(
            temporaryRoot,
            "android",
            "app",
            "src",
            "main",
            "java",
            ...packageName.split("."),
            "restore",
            filename
          ),
          "utf8"
        )
      );
      syncAndroidRestoreNative(temporaryRoot);

      expect(
        fs.readFileSync(
          path.join(temporaryRoot, "android", "app", "build.gradle"),
          "utf8"
        )
      ).toBe(firstAppBuildGradle);
      expect(fs.readFileSync(mainApplicationPath, "utf8")).toBe(firstMainApplication);
      KOTLIN_TEMPLATES.forEach((filename: string, index: number) => {
        expect(
          fs.readFileSync(
            path.join(
              temporaryRoot,
              "android",
              "app",
              "src",
              "main",
              "java",
              ...packageName.split("."),
              "restore",
              filename
            ),
            "utf8"
          )
        ).toBe(firstGenerated[index]);
      });
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("verifies every checked-in integration invariant without writing", () => {
    expect(verifyAndroidRestoreNative(projectRoot)).toEqual({
      packageName: "com.anonymous.LiftingLog",
    });
  });
});
