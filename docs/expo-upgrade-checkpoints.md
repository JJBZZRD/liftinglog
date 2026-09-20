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

## Dependency Modernization (MVP-PRE-001E)

Status: automated gate passed on branch `upgrade/MVP-PRE-001E-dependencies` on
2026-09-20. Runtime/device smoke coverage remains part of `MVP-PRE-001G`.

### Compatibility and security batches

Changes were kept in separately tested commits rather than applied through a blanket
upgrade or `npm audit fix`:

1. NativeWind moved from `4.2.1` to the SDK 57-supported stable `4.2.7`; its pinned
   `react-native-css-interop` dependency moved from `0.2.1` to `0.2.7`. The existing
   Babel, Metro, Tailwind 3, global CSS, and root-layout configuration remains valid.
2. Runtime transitive leaves moved from `yaml` `2.8.2` to `2.9.1` and `lodash`
   `4.17.23` to `4.18.1` within their parents' existing semver ranges. Focused PSL,
   program-calendar, and program-history tests passed before the full gate.
3. Drizzle ORM moved from `0.44.7` to `0.45.2` as an isolated database batch. The
   update removes its SQL-identifier advisory and remains compatible with Expo SQLite
   57. Thirteen database/logging/analytics/PB/media/backup suites (252 tests) passed
   before the full gate.
4. Compatible build-tool leaves were refreshed without adding overrides: Babel core,
   XML DOM, both JS YAML lines, Minimatch and Brace Expansion lines, Picomatch lines,
   PostCSS Selector Parser, Shell Quote, and both WebSocket lines.
5. Reviewer-identified development leaves were refreshed within their parent ranges:
   HumanFS, Once, AJV, Flatted, and Form Data. This removed the remaining fixable
   lint/test-tree audit records without changing direct tooling versions.

The CSS interop postinstall guard remains valid: against CSS interop `0.2.7` it
confirms the upstream `react-native-safe-area-context` implementation and performs no
mutation. The Expo Camera orientation patch still applies. Final patch retirement or
hardening remains owned by `MVP-PRE-001F`.

### Gate results

| Gate | Result |
| --- | --- |
| `npm ci` | Pass; both postinstall checks pass |
| `npm ls --depth=0` | Pass |
| `npx expo install --check` | Pass; dependencies are up to date |
| `npm run lint -- --no-cache` | Pass; 20 baseline warnings, 0 errors |
| `npm run typecheck` | Pass |
| `npm test -- --runInBand --silent` | Pass; 26 suites, 337 tests |
| Focused Drizzle regression gate | Pass; 13 suites, 252 tests |
| `npx expo config --type public` | Pass |
| `npx expo export --platform android` | Pass; production bundle generated |
| `npx expo-doctor@latest` | 20/21 checks pass; expected native-directory warning only |
| `android\\gradlew.bat :app:compileDebugKotlin` | Pass |
| `git diff --check` | Pass |

### Remaining advisories and risks

`npm audit --omit=dev` is reduced from 28 records (including 1 critical and 8 high)
to 16 moderate records. They form two upstream-blocked groups:

- Thirteen Expo configuration records flow through `xcode@3.0.1` and `uuid@7.0.3`.
  Current Expo 57 packages are already at their latest compatible patches; npm's
  proposed Expo 46 downgrade is invalid.
- Three routing records flow through Expo Router's `query-string@7.1.3` and
  `decode-uri-component@0.2.2`. Patched major versions are outside Expo Router 57's
  declared ranges and must not be forced without an upstream-compatible Router update.

No critical, high, or low production audit records remain. Reassess both moderate
groups when another stable Expo 57 patch is available or during the next SDK upgrade.
The full audit, including development dependencies, reports the same 16 moderate
records and no additional development-only advisories.
NativeWind theme switching, modal/navigation styling, and Fast Refresh still require
the device smoke matrix in `MVP-PRE-001G`; a successful Metro export is not a visual
runtime test.

## Resume Point

1. Independently review the complete `MVP-PRE-001E` dependency diff and evidence,
   then integrate it into `main` without the unrelated local files listed below.
2. Branch `MVP-PRE-001F` from the accepted PRE-001E `main` commit. Revalidate or
   retire both postinstall scripts and add the documented automated rest-timer native
   invariant check before reviewing the checked-in Android integration.
3. Complete `MVP-PRE-001G` Android/iOS development-build smoke matrices, including
   the Xcode 27 scene-support decision and NativeWind visual/runtime checks.
4. Do not start MVP feature branches until the native patch review and final
   development-build checks are complete.

The pre-existing `.gitignore` modification and
`docs/codebase-analysis-2026-06-21/` directory are unrelated and excluded from these
upgrade commits.
