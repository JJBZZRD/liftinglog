# Expo Upgrade Checkpoints

This is the resumable execution record for `MVP-PRE-001`. The strategy and gate
definitions remain in [mvp-platform-baseline.md](mvp-platform-baseline.md).

## SDK 55

Status: automated gate passed on branch `upgrade-expo-55` on 2026-09-20.

### Installed baseline

- Expo `55.0.31`
- React Native `0.83.10`
- React and React Test Renderer `19.2.0`
- Reanimated `4.2.1`, Worklets `0.7.4`, Gesture Handler `2.30.1`
- Gradle `9.0.0`

`expo-file-system` and `babel-preset-expo` are now explicit dependencies because
application and test code imported them while SDK 54 supplied them only transitively.

### Compatibility changes

- Lowercased the invalid app scheme from `LiftingLog` to `liftinglog`.
- Removed obsolete `newArchEnabled` and `android.edgeToEdgeEnabled` app fields.
- Regenerated the checked-in Android project with a clean SDK 55 prebuild.
- Declared `SCHEDULE_EXACT_ALARM` in app configuration so clean prebuilds retain it.
- Preserved the custom rest-timer package registration, receivers, Kotlin sources,
  layouts, notification icon, and exact-alarm permission.
- Updated the Expo Camera orientation patch for the SDK 55 source shape.
- Hardened the CSS interop patch to verify that upstream uses
  `react-native-safe-area-context` when no mutation is required.
- Updated the analytics deck scroll ref type for the React Native 0.83 definitions.

### Gate results

| Gate | Result |
| --- | --- |
| `npm ls --depth=0` | Pass |
| `npm run lint -- --no-cache` | Pass; 20 baseline warnings, 0 errors |
| `npm run typecheck` | Pass |
| `npm test -- --runInBand` | Pass; 26 suites, 337 tests |
| `npx expo config --type public` | Pass; SDK 55 and lowercase scheme confirmed |
| `npx expo-doctor@latest` | 19/20 checks pass |
| `android\\gradlew.bat :app:compileDebugKotlin` | Pass |
| `git diff --check` | Pass |

The remaining Expo Doctor finding is the expected warning that app configuration is
not automatically synchronized when a native directory is checked in. This branch
ran and reviewed a clean Android prebuild, so the warning is documented rather than
suppressed.

### Deferred checks and risks

- Android/iOS development-build and real-device scenarios remain part of the final
  SDK 57 gate; this checkpoint proves compilation, not runtime device behavior.
- `npm audit --omit=dev` reports 27 production-tree advisories (1 critical, 8 high,
  16 moderate, 2 low). Do not run `npm audit fix --force`: suggested changes include
  incompatible Expo package downgrades. Address compatible transitive updates and the
  direct `drizzle-orm` advisory in `MVP-PRE-001E` with database regression coverage.
- Native dependency deprecation warnings remain, notably in Linear Gradient, Pager
  View, WebView, Screens, and the custom rest-timer package. They do not fail the SDK
  55 build and must be reassessed at SDK 57.

## SDK 56

Status: automated gate passed on branch `upgrade-expo-56` on 2026-09-20.

### Installed baseline

- Expo `56.0.22`
- React Native `0.85.3`
- React, React DOM, and React Test Renderer `19.2.3`
- TypeScript `6.0.3`
- Reanimated `4.3.1`, Worklets `0.8.3`, Gesture Handler `2.31.2`
- Gradle `9.3.1`

### Compatibility changes

- Regenerated the checked-in Android project with a clean SDK 56 prebuild and
  preserved the custom rest-timer package, receivers, Kotlin sources, layouts,
  notification icon, and exact-alarm permission.
- Updated the custom config plugin to use the supported `expo/config-plugins`
  sub-export and made its direct `jimp-compact` script dependency explicit.
- Migrated application navigation hooks and test mocks from direct
  `@react-navigation/*` imports to Expo Router SDK 56 exports, then removed the four
  forbidden direct React Navigation dependencies.
- Kept the procedural media APIs on the SDK 56 `expo-media-library/legacy` entry point.
- Replaced the removed `StyleSheet.absoluteFillObject` type usage with explicit
  absolute positioning.
- Replaced `ts-jest`, which does not support TypeScript 6, with a dedicated
  `babel-jest` test transform and the Node dynamic-import transform. Test mocks were
  updated to remain deterministic under Babel's hoisting behavior.
- Preserved the SDK 55 lint gate by disabling only the React Compiler diagnostic
  rules newly enabled through React Hooks ESLint 7. `rules-of-hooks` and
  `exhaustive-deps` remain enabled.
- Accepted Expo's explicit app-plugin entries for installed modules during prebuild.

### Gate results

| Gate | Result |
| --- | --- |
| `npm ls --depth=0` | Pass |
| `npm run postinstall` | Pass; camera patch applied and CSS interop verified upstream-safe |
| `npm run lint -- --no-cache` | Pass; 20 baseline warnings, 0 errors |
| `npm run typecheck` | Pass |
| `npm test -- --runInBand` | Pass; 26 suites, 337 tests |
| `npx expo config --type public` | Pass; SDK 56 and native plugin configuration confirmed |
| `npx expo export --platform android` | Pass; production Hermes bundle generated |
| `npx expo-doctor@latest` | 20/22 checks pass |
| `android\\gradlew.bat :app:compileDebugKotlin` | Pass after final clean prebuild |
| `git diff --check` | Pass |

The remaining Expo Doctor findings are understood and intentionally unsuppressed:

1. SDK 56's Hermes V1 build has a known memory regression. SDK 56 is therefore an
   intermediate checkpoint and must not become the release baseline; SDK 57 is the
   required next platform step.
2. App configuration is not automatically synchronized when a native directory is
   checked in. This checkpoint ran and reviewed a final clean Android prebuild.

### Deferred checks and risks

- Android/iOS development-build and real-device scenarios remain part of the final
  SDK 57 gate; this checkpoint proves regeneration, compilation, and JS behavior.
- `npm audit --omit=dev` reports 28 production-tree advisories (1 critical, 8 high,
  17 moderate, 2 low). Do not run `npm audit fix --force`: suggested changes include
  incompatible Expo package downgrades. Address compatible transitive updates and the
  direct `drizzle-orm` advisory in `MVP-PRE-001E` with database regression coverage.
- React Compiler diagnostics are deferred as an explicit post-platform task rather
  than being mixed into the SDK upgrade. Their SDK 56 lint rules are listed in
  `eslint.config.js` so that adoption can be reviewed deliberately.
- Native dependency and Gradle deprecation warnings remain non-fatal and must be
  reassessed after SDK 57 regeneration.

## Resume Point

1. Confirm `upgrade-expo-56` is committed and integrated into `main` after review.
2. Branch `upgrade-expo-57` from that exact integrated commit.
3. Upgrade only to the latest stable SDK 57 patch and run the same automated gate.
4. Resolve the Hermes regression by confirming SDK 57 uses React Native `0.86.2` or
   later and Expo `57.0.9` or later.
5. Do not start MVP feature branches until SDK 57, dependency review, native patch
   review, and final development-build checks are complete.

The pre-existing `.gitignore` modification and
`docs/codebase-analysis-2026-06-21/` directory are unrelated and excluded from these
upgrade commits.
