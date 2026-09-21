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

## Native Patch and Plugin Review (MVP-PRE-001F)

Status: automated gate passed on branch `upgrade/MVP-PRE-001F-native-patches` on
2026-09-20. Device behavior remains part of `MVP-PRE-001G`.

### Patch decisions and native hardening

- Retained the Expo Camera Android orientation patch because `expo-camera` `57.0.5`
  still does not propagate target rotation to `VideoCapture`. The postinstall script
  now supports only the explicitly reviewed package version, requires every source
  anchor exactly once, rejects partial or duplicate patch states, fails if the target
  is absent, verifies all postconditions before writing, and is byte-idempotent.
- Retired the obsolete CSS Interop SafeAreaView mutation. NativeWind `4.2.7` and its
  locked CSS Interop `0.2.7` already register `react-native-safe-area-context` in the
  runtime artifact. A read-only postinstall assertion now rejects a return to the
  deprecated React Native core `SafeAreaView` registration.
- Replaced unchecked manifest text replacement with Expo's structured manifest mod
  and moved `MainApplication.kt` registration into `withMainApplication`. The
  dangerous mod is now limited to generated Kotlin, layout, and image resources.
- Added `verify:android-rest-timer-native`, which checks template/output byte parity,
  notification icon pixel parity, package registration, manifest permission and
  receivers, app-plugin configuration, package/Gradle identity, module naming,
  immutable pending intents, exact-alarm scheduling, resources, and URI schemes.
- Normalized native notification URIs to the configured lowercase `liftinglog`
  scheme and made package/output paths derive from `expo.android.package`.
- Migrated the custom package from deprecated `ReactPackage.createNativeModules` to
  the React Native 0.86 `BaseReactPackage` and `ReactModuleInfoProvider` contract.
- Independent review then closed false-pass paths for commented package additions,
  equivalent fully qualified receiver names, aggregate pending-intent flag counts,
  and missing React Native package metadata assertions.

### Gate results

| Gate | Result |
| --- | --- |
| `npm ci` | Pass; camera patch applied to a clean install and CSS runtime verified |
| Second `npm run postinstall` | Pass; camera patch byte-idempotent |
| `npm ls --depth=0` | Pass |
| `npx expo install --check` | Pass; dependencies are up to date |
| `npx expo prebuild --platform android --clean --no-install` | Pass; structured plugin regenerated all required integration |
| `npm run verify:android-rest-timer-native` | Pass |
| `npm run lint -- --no-cache` | Pass; 20 baseline warnings, 0 errors |
| `npm run typecheck` | Pass |
| `npm test -- --runInBand --silent` | Pass; 27 suites, 343 tests |
| `npx expo config --type public` | Pass |
| `npx expo export --platform android` | Pass; production bundle generated |
| `npx expo-doctor@latest` | 20/21 checks pass; expected native-directory warning only |
| `android\\gradlew.bat :app:compileDebugKotlin` | Pass after clean prebuild |
| `git diff --check` | Pass |

### Deferred device checks

- Static checks and compilation cannot prove encoded MP4 orientation across CameraX
  implementations. `MVP-PRE-001G` must cover front/back cameras, portrait and both
  landscape rotations, rotation before and during recording, and consecutive clips.
- `MVP-PRE-001G` must exercise rest-timer countdown, completion, cancellation,
  notification taps, exact-alarm permission states, and process/background behavior
  on an Android development build.
- The checked-in-native-directory Doctor warning remains intentional. The successful
  clean prebuild plus the read-only native verifier are the synchronization controls.

## Development-Build Smoke Checkpoint (MVP-PRE-001G)

Status: Android emulator matrix and automated gates passed on branch
`upgrade/MVP-PRE-001G-development-builds` on 2026-09-20. Subsequently accepted for
the Android MVP prerequisite under the explicit iOS and camera deferrals recorded
below. This is not iOS or full-profile camera runtime acceptance. PRE-001H still
owns the complete final-SHA Android console matrix, including gallery revalidation.

### Compatibility changes found by the smoke run

- Added `expo-dev-client` because the existing EAS development profile declares
  `developmentClient: true`. A clean native development build now contains the SDK
  57 launcher/menu modules and the generated `exp+liftinglog` Android scheme.
- Added `expo-build-properties` with `ios.enableSceneSupport: true`, the SDK 57
  configuration required for Xcode 27 scene lifecycle builds. Public Expo config
  evaluation confirms the setting, but an iOS build still requires an authenticated
  EAS session or a macOS build host.
- Removed the literal `sound: "default"` value from the Expo Notifications completion
  channel. SDK 57 interprets a non-null string as a bundled custom sound filename;
  omitting the field retains Android's system-default channel sound without the
  runtime warning. A focused regression test protects the channel importance,
  vibration, and default-sound semantics.

### Android runtime evidence

| Surface | Result |
| --- | --- |
| Clean native build | Pass; universal debug APK compiled and installed on a Pixel 9 Pro XL emulator |
| Fresh install | Pass; x86_64 APK installed on a separate clean API 36 emulator |
| SQLite startup | Pass; migrations ran, development fixtures seeded, one-time UID backfill ran after seeding, and the following cold start made no further backfills |
| NativeWind/theme | Pass; Dark/Ocean applied visually and persisted across a cold start |
| Calculator | Pass; 100 kg x 5 produced a 116.7 kg estimated 1RM and projection table |
| Manual logging | Pass; completion was disabled with no sets, the first 100 kg x 5 set created an In Progress history entry, and completion closed only that entry |
| History/filtering | Pass; exercise history changed from In Progress to completed and the global history search found the smoke entry |
| Gallery video | Pass; a gallery MP4 attached to one set, copied into app storage, rendered inline, played fullscreen, and displayed its history indicator |
| Rest timer | Pass; exact-alarm prompt, foreground countdown, background completion notification, notification deep link, pause, delete, and notification cancellation were exercised |
| Backup export/import | Platform path passed; Android SAF saved a 1.11 MB SQLite backup, the picker reopened it, header validation passed, and import completed. Current merge semantics do not satisfy MVP replacement restore |
| Camera surface | Partial; route launch and native permission handoff passed, but recording/orientation capture was not exercised |
| Crash check | Pass; no crash reports on either emulator |

The clean-install sequence exposed an existing development-only ordering detail:
fixture rows are inserted after the startup UID migration, so the next launch
backfills those seeded rows once. A third launch proved the initialized database is
then stable. This does not affect production builds, where development fixture
seeding is disabled.

In the restricted agent environment, an expired global Expo session combined with
blocked Expo GraphQL access caused the SDK 57 manifest endpoint to return HTTP 500.
Starting Metro with `EXPO_OFFLINE=1` bypassed the account lookup; the Android manifest
then returned HTTP 200 and the app bundled normally. Package/config inspection found
no repository defect, so no application change is required for that harness issue.

### Final automated gates

| Gate | Result |
| --- | --- |
| `npm ci` | Pass; clean lockfile install and both postinstall guards completed |
| `npx expo install --check` | Pass; dependencies are up to date |
| `npm ls --depth=0` | Pass |
| Native dependency and rest-timer verifiers | Pass |
| `npm run typecheck` | Pass |
| `npm run lint -- --no-cache` | Pass; 20 baseline warnings, 0 errors |
| `npm test -- --runInBand --silent` | Pass; 27 suites, 344 tests |
| `npx expo config --type public` | Pass; iOS scene support is enabled |
| `npx expo export --platform android` | Pass; production bundle generated |
| `npx expo-doctor@latest` | 20/21 checks pass; expected checked-in-native-directory warning only |
| `git diff --check` | Pass |

### Open evidence and accepted blockers

- `npx eas-cli whoami` reports `Not logged in`. Windows cannot generate the missing
  iOS project locally, so the clean iOS development build and iOS runtime matrix are
  blocked until an authenticated EAS session or macOS build operator is available.
- Front/back camera recording, portrait/landscape encoded-video orientation, rotation
  during recording, and consecutive clips still require an explicitly authorized
  full-profile physical-device run. The MVP recording surface remains deferred.
- The Android backup picker round trip works, but the implementation is explicitly a
  merge that reports existing data was preserved. It has no replacement warning and
  does not remove live rows missing from the backup, so `MVP-006` remains responsible
  for the agreed replacement-restore behavior.
- The export helper removed `.db` before handing the display name to Android SAF,
  assuming the provider would infer the extension from the MIME type. The provider
  did not, producing `LiftingLog-backup-20260920-141130`. The document picker could
  still select it and SQLite-header validation succeeded, but `MVP-006` must make the
  user-visible file contract consistent and test extension/MIME handling on both
  platforms.
- The smoke backup was captured immediately after development fixture seeding, before
  the next-launch UID backfill. Importing it into the same database updated 7,700
  records but also inserted 112 workouts, 112 workout-exercise rows, and 112 sets.
  Missing UIDs alone do not force insertion because the current importer also attempts
  natural-key matching. Preserve both the backup and its pre-import live state so
  `MVP-006A/006E` can reproduce the candidate ambiguity and verify exact replacement.
- The Expo ImagePicker `MediaTypeOptions` deprecation observed during the first
  gallery run was repaired separately in commit `d8ee8cf` by using the SDK 57
  `MediaType` value `"videos"`. The provisional PRE-001H rerun opened Android Photo
  Picker without the warning. The earlier PRE-001G run contains attachment and
  playback evidence, but the clean rerun emulator contained no selectable media, so
  those behaviors were not revalidated on `d8ee8cf` and remain in the final matrix.

## Android Console Audit Checkpoint (MVP-PRE-001H)

Status: Provisional Android pass on `main` commit
`d8ee8cf474815ea40d3a768b42ffcea991caae3e` on 2026-09-20. PRE-001H remains
formally open because its execution contract starts after PRE-001G, whose iOS and
physical-device evidence is still blocked.

### Scoped repair

- Replaced the deprecated `ImagePicker.MediaTypeOptions.Videos` call with the SDK 57
  `MediaType` value `"videos"` in `app/set/[id].tsx`.
- The repair was isolated on `fix/MVP-PRE-001H-image-picker-media-types`, passed
  typecheck, focused ESLint, and commit whitespace validation, and was merged as
  `d8ee8cf`. The organizer independently repeated those checks after integration.

### Runtime evidence

| Surface | Result |
| --- | --- |
| Clean startup | Pass; Android bundle loaded, both workout-exercise migrations reported OK, and development fixtures seeded |
| Populated restart | Pass; one-time UID backfill completed and fixture seeding inserted no duplicate sessions |
| Calculator | Pass; 100 kg x 5 displayed a 116.7 kg Epley estimate |
| Manual logging | Pass; a 100 kg x 5 set created one active Test_531 entry with 500 kg volume |
| In-progress history | Pass; the new entry appeared immediately with the In Progress badge |
| Completion/history | Pass; completion updated and verified one row, and the same entry then appeared without In Progress |
| Analytics/PB read | Pass; chart, insight controls, PB markers, and visible-point logs loaded for Test_531 |
| Gallery picker | Partial; Set Info opened Android Photo Picker and emitted no `MediaTypeOptions` warning, but the emulator contained no selectable media |
| Camera route | Partial; the camera/microphone permission gate loaded, but physical recording remained outside this emulator run |
| Console | Pass for exercised routes; no app-owned fatal exception, ReactNativeJS error, unhandled rejection, or database failure was observed |

The first headless attempt exposed a harness problem rather than an application
defect. On this Windows host, `expo start --localhost` selected IPv6 `::1`; Android
`adb reverse` expected the host IPv4 loopback and Dev Launcher reported an unexpected
EOF. The successful organizer launch sequence was:

```powershell
$env:EXPO_OFFLINE = "1"
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"
npm.cmd start -- --localhost
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d "exp+liftinglog://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

Verify that Metro listens on `127.0.0.1:8081` before launching. Do not type the URL
into Dev Launcher through `adb shell input text`; that command encoded `:` as `%3A`
and produced an invalid-port error in the discarded attempt.

The run also confirmed expected Expo/React Native development warnings and Android
emulator/Google service noise. Broad workout history, backup/import, rest-timer
notifications, gallery attachment/playback, and physical camera recording were not
rerun in this provisional sweep and must not be inferred from it.

## Organiser Resume Review (2026-09-20)

The organiser resumed from `main` / `origin/main`
`2311f55216453f5a62b5aeb0e86a894711f5dcab`; the SDK transitions and PRE-001E/F
were not restarted. PRE-001G, PRE-001H, and PRE-001R remain open.

### Explicit iOS deferral

The user instructed **"ignore ios for now"** during this resume. iOS build and
runtime evidence are deferred under exception `PRE-001G-IOS-DEFERRED`, owned by
the organiser. This removes iOS from the current execution queue; it does not
constitute iOS acceptance or cross-platform release approval. Revisit the iOS
build/runtime matrix before iOS release approval. Android PRE-001G evidence,
PRE-001H, and the independent PRE-001R audit remain required before Wave 1.

### Physical Android readiness

**Subsequent user scope clarification:** in-app recording is excluded from the
MVP; only gallery video attachment/playback remains. Under exception
`PRE-001G-CAMERA-DEFERRED`, the organiser defers physical front/back recording,
encoded-orientation, rotation-during-capture, consecutive-clip, and camera-save
checks to a future full-profile camera release. These checks no longer block the
MVP prerequisite. Static/native compilation coverage remains required and passed.
MVP-001D and MVP-004C must still remove recording entry points and protect the
recording route in the MVP profile; retain the source/dependencies for the full
profile as required by product facts sections 9 and 11. This exception does not
waive gallery attachment/playback, Android console verification, or PRE-001R.

- The attached CPH2841 phone reports Android 16 / API 36 and is ADB-authorized.
- ADB reverse already maps `tcp:8081` to `tcp:8081`; the existing Metro server
  responds over IPv4 at `http://127.0.0.1:8081/status` with HTTP 200.
- The ignored `.env.local` retains `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`.
- The installed APK and local `android/app/build/outputs/apk/debug/app-debug.apk`
  have identical SHA-256 hashes:
  `2e0b4e4472da64cd8b3a9fc2564932dfce3bef3750ad106b354e197bd1deb8f2`.
  This identifies the installed artifact, not a reproducible clean-build proof.
- Launching the encoded development-client localhost URL returned `Status: ok`.
  UI hierarchy and screenshot inspection confirmed the populated Overview renders.
  This is readiness evidence only, not a completed runtime matrix.
- Physical camera recordings/rotations are deferred under the exception above.
  Post-picker-fix gallery attachment and playback remain pending. No new recording
  was made in this readiness run.

Local evidence is in `.codex-artifacts/pre001g-resume-20260920/`. All pre-existing
changes and untracked evidence are preserved, including the five Android files
reported modified by Git and the unrelated `.gitignore` change. The organiser
dispatched independent, read-only native-provenance and Android-matrix packets to
Sol/high and Luna/medium respectively, each pinned to `2311f55`, in separate
worktrees, with no inherited conversation. These are PRE-001G preparation, not
the final PRE-001R audit.

The organiser independently checked the native review: the five Android files
match their HEAD blobs, and `git diff 81a181f 2311f55 -- android package.json
package-lock.json app.json plugins scripts` is empty. The documented clean native
build remains applicable to the unchanged native inputs; no SDK restart or rebuild
is required solely because of those Git status entries. The pinned-worktree and
main-worktree native verifiers both pass. The repository-root `.gitignore` still
has its pre-existing three-line `.codebase-memory/` addition; it is not part of
the five-file native finding.

Reviewed Android operator matrix (camera rows are now deferred; gallery remains
required):

| Check | Required evidence |
| --- | --- |
| Camera facing and initial rotation | Front and back camera clips in portrait and both landscape directions; verify the encoded clip through playback, not just preview/icon rotation |
| Rotation during capture | Start in portrait, rotate to landscape, stop; repeat in the other direction; verify playable output and no stuck recording state |
| Consecutive clips | Record, stop, and record again without leaving the camera route; verify the second URI replaces the first and the controls recover |
| Durable camera save | Use a disposable test exercise entry; Save Video and its Add Set modal create one real set and linked media; inspect playback from that set after saving |
| Gallery after `d8ee8cf` | On a disposable test set, select an MP4, verify inline/fullscreen playback and persistence after navigating away and back; verify replacement and absence of the old picker deprecation |

Enter recording from the normal Record tab so `id`, `name`, `workoutId`,
`workoutExerciseId`, `performedAt`, and `setIndex` are supplied by the app. Do not
invent database IDs. Saving a recording adds real training data and can also add a
gallery asset; do not use an existing personal training entry for these tests.
The camera screen has no encoded-video preview: inspect saved output through the
set screen. Physical rotation and a non-sensitive camera scene need the device
operator when this deferred matrix resumes. The previous camera-operator prompt
is superseded by the user's MVP scope clarification; no camera interaction is
required for the current gate.

### Resumed automated verification

| Command | Result on `2311f55` |
| --- | --- |
| `npm ls --depth=0` | Pass; SDK 57.0.24 dependency tree |
| `npm run verify:android-rest-timer-native` | Pass |
| `npm run typecheck` | Pass |
| `npm run lint -- --no-cache` | Pass; 20 baseline warnings, 0 errors |
| `npm test -- --runInBand --silent` | Pass; 27 suites, 344 tests |

The first two Jest attempts incorrectly discovered the two temporary review
worktrees nested beneath `.codex-artifacts/`: 81 suites, with six missing-local-
dependency failures in the duplicate native-patch suites. This was an organiser
harness error, not an app regression. Both newly created, clean worktrees were
removed after their read-only handoffs; the unchanged standard Jest command then
passed with exactly 27 suites. Future worker worktrees must be outside the app
directory. The review branches remain pinned to `2311f55`; no worker code merged.
Hashes confirm all six pre-existing modified files and `.env.local` stayed
byte-for-byte unchanged during this run.

## Resume Point

### Current checkpoint, 2026-09-21

**PRE-001G and PRE-001H are accepted for Android prerequisite ordering;
PRE-001R is next and Wave 1 remains blocked until R acceptance.** The resumed
[Android audit](android-console-audit-2026-09-20.md) records completed populated
gallery persistence/replacement, SAF export/import, independent SQLite integrity
and foreign-key checks, and final console classifications on `99c1033` (unchanged
application/native inputs). The two inserted seed rows during current merge import
remain a documented MVP-006 regression fixture, not replacement-restore approval.

Typecheck, 27 suites/344 tests, baseline-only lint, dependency tree and Android
native verifier passed again. The user authorised proceeding into plan-ordered
implementation after the checks without another permission prompt. Run independent
Sol/high PRE-001R on the committed H checkpoint; resolve findings, reread the plan,
refresh codebase-memory and pin the accepted SHA before dispatching Wave 1.
Keep iOS/camera exceptions below, phone disconnected, original dirty/untracked
work preserved, and worker worktrees outside the app directory.

### User-requested pause, 2026-09-20

Historical checkpoint; superseded by the current checkpoint above.

The current detailed checkpoint is
[PRE-001H Android audit](android-console-audit-2026-09-20.md). PRE-001G is accepted
for Android ordering with the explicit iOS/camera deferrals below; **PRE-001H is
still in progress and PRE-001R has not started**. Wave 1 remains blocked.

Physical gallery attach/playback/persistence/replacement passed and the phone can
be unplugged. The remaining work is emulator-only: complete the populated gallery
and backup matrix, reconcile reviewed evidence/log classifications, then accept H
and run independent R. The organiser has verified the clean-instance exact-set
logging lifecycle, background timer/notification return, backup round-trip with
SQLite integrity/count checks, cold relaunch, and gallery playback. No feature
implementation, camera removal, or feature-branch dispatch has occurred yet.

Use the x86_64 emulator APK identified in the linked checkpoint; the ARM64 phone
APK cannot serve as the emulator artifact. Initial white DevLauncher state can
last about 45 seconds before JS starts; wait for settled UI and inspect logs before
classifying a defect. Local evidence and app-data archives are preserved under
`.codex-artifacts/pre001h-final/`. All pre-existing dirty/untracked work is retained.

### Android PRE-001G acceptance with explicit scope exceptions

After the user's iOS deferral and gallery-only MVP clarification, the organiser
accepts the existing PRE-001G Android build/runtime matrix for prerequisite
ordering. The original open iOS and physical-camera cases are now explicitly
deferred, not marked passed. Evidence is the clean-build/emulator matrix above,
the unchanged native inputs from `81a181f` to `4d8a61b`, installed/local APK hash
identity, physical populated Overview rendering, and the resumed automated gate
(27 suites / 344 tests, clean typecheck, baseline-only lint warnings, native
verifier). The post-`d8ee8cf` gallery rerun remains mandatory within PRE-001H's
final-SHA complete matrix; the supplementary physical gallery run can proceed in
parallel. No gallery result is inferred from the camera exception.

Next executable gate: **PRE-001H** on the current Android baseline, followed by
the independent **PRE-001R** review. Wave 1 remains blocked until both are accepted.

1. Keep iOS build/runtime work deferred under `PRE-001G-IOS-DEFERRED` above. When
   resumed, authenticate EAS or use a macOS operator to build and run the SDK 57
   iOS development client with scene support enabled.
2. Complete the remaining Android gallery evidence as part of PRE-001H. Keep physical camera
   tests deferred under `PRE-001G-CAMERA-DEFERRED`; carry the characterized
   replacement-restore gaps into `MVP-006` rather
   than this platform checkpoint, and keep any platform fixes in new narrowly
   scoped tickets.
3. Complete `MVP-PRE-001H` against the accepted SDK 57 Android development build,
   carrying the explicit iOS and camera deferrals.
   Reuse the IPv4 Metro launch contract above. The
   provisional clean/populated, calculator, logging, history, analytics, and gallery
   picker checks pass on `d8ee8cf`; rerun the complete matrix, including the surfaces
   explicitly left unexercised above, on the final accepted `main` SHA. Close only
   when no project-owned issue remains, external noise is recorded, and the
   transcript, route matrix, log signatures, and repair links are committed.
4. Run the read-only `MVP-PRE-001R` audit, resolve findings, and pin the accepted SDK
   57 `main` SHA as the base for Wave 1.
5. Do not start MVP feature branches until the final development-build evidence,
   Android console audit, and independent audit are accepted.

The pre-existing `.gitignore` modification and
`docs/codebase-analysis-2026-06-21/` directory are unrelated and excluded from these
upgrade commits. Local `.codex-artifacts/` screenshots are evidence only and are not
committed.
