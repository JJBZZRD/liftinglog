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

## SDK 57

Status: automated gate passed on branch `upgrade-expo-57` on 2026-09-20.

### Installed baseline

- Expo `57.0.24`
- React Native `0.86.3`
- React, React DOM, and React Test Renderer `19.2.3`
- TypeScript `6.0.3`
- Reanimated `4.5.1`, Worklets `0.10.1`, Gesture Handler `2.32.0`
- Gradle `9.3.1`

`@react-native/jest-preset` `0.86.3` is now an explicit development dependency
because `jest-expo` 57 declares it as a peer dependency. The final dependency tree
is clean even though npm emitted expected peer-override warnings while replacing the
already-installed SDK 56 Jest packages.

### Compatibility changes

- Upgraded to the newest stable SDK 57 patch; SDK 58 was still a preview release at
  execution time.
- Aligned the Expo-managed packages, React Native, React, Pager View, Reanimated,
  Worklets, Gesture Handler, Babel preset, ESLint config, and Jest preset.
- Resolved the SDK 56 Hermes memory-regression gate by moving to Expo `57.0.24` and
  React Native `0.86.3`.
- Regenerated the checked-in Android project with a clean SDK 57 prebuild. The
  generated template introduced no semantic tracked-native diff and preserved the
  rest-timer package registration, receivers, Kotlin sources, layouts, notification
  icon, immutable pending intents, and exact-alarm permission.
- Revalidated both postinstall scripts against their SDK 57 package sources: the
  Expo Camera orientation patch still applies, while CSS interop remains upstream-safe.
- Retained `expo-media-library/legacy`; SDK 57 continues to support that compatibility
  entry point, and procedural-media migration is outside this SDK transition.

### Gate results

| Gate | Result |
| --- | --- |
| `npm ls --depth=0` | Pass |
| `npx expo install --check` | Pass; dependencies are up to date |
| `npm run postinstall` | Pass; camera patch applied and CSS interop verified upstream-safe |
| `npm run lint -- --no-cache` | Pass; 20 baseline warnings, 0 errors |
| `npm run typecheck` | Pass |
| `npm test -- --runInBand --silent` | Pass; 26 suites, 337 tests |
| `npx expo config --type public` | Pass; SDK 57 and native plugin configuration confirmed |
| `npx expo export --platform android` | Pass; production Hermes bundle generated |
| `npx expo-doctor@latest` | 20/21 checks pass |
| `android\\gradlew.bat :app:compileDebugKotlin` | Pass after final clean prebuild |

The sole Expo Doctor finding is the expected checked-in-native-directory warning.
`MVP-PRE-001F` owns the final native/plugin review and `MVP-PRE-001G` owns clean
development-build validation, so the warning remains visible rather than suppressed.

### Deferred checks and risks

- Automated SDK transition gates are complete, but Android install/boot and the
  generated/EAS iOS development build remain required in `MVP-PRE-001G` before the
  platform prerequisite can be accepted.
- SDK 57 builds made with Xcode 27 require scene-based lifecycle support. The app does
  not currently enable `ios.enableSceneSupport` or pin an older EAS build image;
  `MVP-PRE-001G` must resolve that choice before its iOS build and launch matrix.
- `npm audit --omit=dev` reports 28 production-tree advisories (1 critical, 8 high,
  17 moderate, 2 low). npm's proposed automatic resolution includes incompatible
  downgrades such as Expo 46. Do not run `npm audit fix --force`; classify and address
  compatible direct/transitive changes in `MVP-PRE-001E`.
- Native package deprecation warnings remain non-fatal. The only project-owned Kotlin
  warning is the existing deprecated ReactPackage override in
  `RestTimerNotificationsPackage`; `MVP-PRE-001F` owns its compatibility review.
- Android compilation does not prove that generated manifest registrations or pending
  intent flags remain present. `MVP-PRE-001F` must add an automated read-only invariant
  check for rest-timer package registration, permission, receivers, and immutable
  pending intents before its native/plugin review is accepted.
- NativeWind remains on the stable 4.x line used by the SDK transition. Moving to the
  plan's SDK 57-supported stable patch belongs to the isolated dependency batch in
  `MVP-PRE-001E`.

## Resume Point

1. Independently review the `upgrade-expo-57` diff and gate evidence, then commit and
   integrate it into `main` without the unrelated local files listed below.
2. Branch `MVP-PRE-001E` from the accepted SDK 57 `main` commit. Inventory dependency
   ownership and update small compatibility/security risk groups separately; start
   with NativeWind stable 4.x support and audit findings that have non-breaking fixes.
3. Run database regression coverage for any dependency batch that can affect SQLite,
   Drizzle, backup, or restore. Never use `npm audit fix --force`.
4. Complete `MVP-PRE-001F` patch/native-plugin review and `MVP-PRE-001G` Android/iOS
   development-build smoke matrices before accepting `MVP-PRE-001`.
5. Do not start MVP feature branches until dependency review, native patch review,
   and final development-build checks are complete.

The pre-existing `.gitignore` modification and
`docs/codebase-analysis-2026-06-21/` directory are unrelated and excluded from these
upgrade commits.
