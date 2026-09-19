# MVP Platform Baseline

Execution record for `MVP-PRE-001A`. This document records the platform state before
Expo modernization. It contains no product-scope decisions.

## Current Baseline

| Component | Current version or state |
| --- | --- |
| Expo | SDK 54; `expo` 54.0.32 installed (`package.json` requests `~54.0.31`) |
| React Native | 0.81.5 |
| React | 19.1.0 |
| Node.js | v22.19.0 |
| npm | 11.7.0 |
| Java | OpenJDK 17.0.16 |
| Gradle | 8.14.3 wrapper |
| Android | Checked in; compile/target SDK 36, minimum SDK 24, Kotlin 2.1.20 |
| iOS | No checked-in `ios/` project; use a clean generated/EAS development build |

New Architecture and Hermes are enabled in the current Android project. The checked-in
native project, custom Expo config plugin, postinstall patches, and lockfile are all
part of the upgrade surface.

## Current Checks

| Command | Result |
| --- | --- |
| `npm ls --depth=0` | Pass |
| `npm run lint` | Pass; 20 warnings, 0 errors |
| `npm run typecheck` | Pass after the recorded SDK 54 typing remediation |
| `npm test -- --runInBand` | Pass; 26 suites, 337 tests |
| `cd android; .\gradlew.bat :app:compileDebugKotlin` | Pass; emitted existing `NODE_ENV` and Gradle deprecation warnings |
| `npx expo-doctor@1.20.4` | 15/18 checks passed; three findings below |

Current Expo Doctor findings are not release exceptions:

- The app URL scheme is uppercase `LiftingLog`, which Doctor reports as invalid.
- A checked-in native project is out of synchronization with app configuration; this
  must be reviewed during each generated-native comparison.
- Eleven SDK 54 package/patch mismatches require alignment during modernization.

## Configuration and Native Assumptions

The SDK 55 transition must review and remove obsolete configuration rather than carry
it forward blindly:

- `app.json` has `newArchEnabled`; SDK 55 makes New Architecture mandatory.
- `app.json` has `android.edgeToEdgeEnabled`; SDK 55 removes this app-config field.
- The generated Android project also contains the deprecated `expo.edgeToEdgeEnabled`
  Gradle property and must be reconciled with the SDK 55 template.
- The uppercase URL scheme must be corrected or explicitly accepted with evidence.

The `postinstall` script runs two exact-source patches:

- `scripts/patch-expo-camera-orientation.js` patches Expo Camera Android Kotlin
  `ExpoCameraView.kt` for target rotation and recording orientation. It can throw when
  expected source blocks change and can otherwise warn/skip when the target file is
  absent; each SDK gate must prove the patch is applied or safely removed.
- `scripts/patch-react-native-css-interop-safe-area.js` removes deprecated
  `SafeAreaView` registration from NativeWind CSS interop runtime files using exact
  path/string assumptions. "Already patched" is not sufficient evidence that the
  current upstream structure is compatible.

The custom `plugins/withAndroidRestTimerNative` and
`scripts/sync-android-rest-timer-native.js` assume an existing Android project, package
ID `com.anonymous.LiftingLog`, exact `MainApplication.kt` `PackageList` structure,
exact manifest permission/application anchors, and compatible Kotlin/React Native host
templates. Synchronization must recreate and review the Kotlin files, package
registration, exact-alarm permission, receivers, and notification integration.

## Dependency Risk Groups

- **Expo-managed/native core:** Expo packages, React Native, React, Router, SQLite,
  Camera, Video, MediaLibrary, ImagePicker, Notifications, Sharing, and DocumentPicker.
  Align these as a coherent SDK set.
- **Native runtime:** Reanimated, Worklets, Gesture Handler, Screens, Safe Area,
  Pager View, DateTimePicker, Picker, WebView, Linear Gradient, and chart/UI packages.
  Validate against each target React Native release and New Architecture.
- **Media:** MediaLibrary has deprecated APIs from SDK 56 onward; validate permissions,
  asset discovery, albums, deletion, gallery selection, and video playback.
- **Navigation and styling:** Expo Router plus direct React Navigation dependencies,
  NativeWind, and `react-native-css-interop`. Keep NativeWind on stable 4.x and target
  4.2.7 for SDK 57 support. Do not migrate to NativeWind 5.
- **Deferred/full-profile code:** Camera and program-specification-language must keep
  compiling even when not exposed by the MVP profile. Do not remove them as part of
  modernization.
- **Tooling and unrelated packages:** Upgrade only where SDK compatibility, a supported
  security fix, or a confirmed deprecation requires it. Do not run a blanket latest
  dependency update.

## Upgrade Decision

Use one sequential path: **SDK 54 -> SDK 55 -> SDK 56 -> SDK 57**. At each step, use
Expo-managed version selection with `npx expo install --fix`; do not hand-select Expo
package versions that conflict with the target SDK. Target the latest stable SDK 57.x
patch available when the SDK 57 branch begins, never a canary or preview. Do not enable
Hermes V1 as part of this work.

The official references are the [Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/),
[SDK 55 release notes](https://expo.dev/changelog/sdk-55),
[SDK 56 release notes](https://expo.dev/changelog/sdk-56), and
[SDK 57 release notes](https://expo.dev/changelog/sdk-57).

## Required Gate Commands

Run these commands after each SDK transition, with the target version committed before
the next transition:

```text
npx expo install --fix
npx expo-doctor@latest
npx expo config --type public
npm ls --depth=0
npm run lint
npm run typecheck
npm test -- --runInBand
cd android
.\gradlew.bat :app:compileDebugKotlin
```

Each gate must also inspect the generated-native diff and confirm that the custom rest
timer integration and both postinstall patches are either valid or intentionally
updated. Manual and device checks are deferred to the final SDK 57 gate, where Android
development-build and generated/EAS iOS checks cover startup, navigation, SQLite,
notifications/rest timer, media selection/playback, camera compilation, and the
remaining native animation surfaces.

## Branch and Rollback Rule

Platform writes are serialized. Use one isolated branch and one focused commit/PR for
each SDK transition: `upgrade/expo-55`, `upgrade/expo-56`, and `upgrade/expo-57`.
Merge only after that gate passes; then branch the next transition from the merged
commit. Dependency-risk audits may run in parallel as read-only work, but no parallel
branch may edit the shared package, lockfile, app config, or native project.

If a gate fails and cannot be repaired within that ticket, revert the isolated SDK
commit by branch/PR rollback, restore the last passing baseline, and record the failure
before reassessing. Do not combine two SDK transitions or feature work into one rollback
unit.
