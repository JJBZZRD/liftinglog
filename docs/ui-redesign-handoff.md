# UI redesign handoff

Written 2026-09-26 for the agent taking over the LiftingLog UI redesign on branch
`UI-redesign`. Read this first, then the documents it points to.

## Where things stand

Phases 1 to 6 of [ui-redesign-plan.md](ui-redesign-plan.md) are done, committed and
pushed. **Phase 7 (Settings and the global theme) is next.**

| Commit | What |
| --- | --- |
| a47b2ce | Phase 1: `mvp` is the local default, multiple workouts per day, scroll fades |
| 367abb4 | Phase 2: Ink tokens, contrast test, no-hex lint rule, design-system docs folder |
| 7383d7e | Phase 3: shared primitives and the dev catalog |
| 3cbebaa, da5502a, af0548d | Phase 4: transactional `deleteWorkoutSession`, metric-strip cards, hold-to-delete, date button, fixed Complete footer |
| c6d0baf | Phase 5: docked tab bar and live-workout strip |
| a1dd3ef | Phase 6: Exercises redesign, plus a pass that made existing screens mirror the mockups (`Icon`, `BrandMark`, dates, workout detail layout) |

## Read in this order

1. [AGENTS.md](../AGENTS.md) (imported by `CLAUDE.md`): repository rules, UI rules, and the mockup-mirroring rule.
2. [ui-redesign-plan.md](ui-redesign-plan.md): decisions, Ink token values, the phase list, build notes and **intended deviations** from the mockups.
3. [design-system/README.md](design-system/README.md) and its pages, especially [grouped-list](design-system/components/grouped-list.md), [segmented-control](design-system/components/segmented-control.md), [dialogs-and-glass](design-system/components/dialogs-and-glass.md), [icons-and-brand](design-system/components/icons-and-brand.md) and [migration.md](design-system/migration.md).
4. The mockups: [ui-mockups/liftinglog-screen-mockups.html](ui-mockups/liftinglog-screen-mockups.html). Section 5 is Settings; the `settingsScreen()` and `formulaSheet()` functions and the `.m-segc`, `.m-li .icn`, `.m-sheet` and `.m-opt` CSS are the Phase 7 spec.
5. For anything touching persistence: [database-ground-truth.md](database-ground-truth.md) and [db-access-patterns.md](db-access-patterns.md).

## How the owner wants the work done

- **Mirror the mockups.** The owner approved them for full implementation. Layout, the placement of dates, times and status, type sizes, spacing, icons and the brand mark must match. Any deliberate difference goes in the plan's deviations list with a reason. Compare each finished screen with a rendered mockup (see below) before calling it done.
- **Work phase by phase.** At the end of each phase, report back and wait. The owner replies "carry on" to start the next one.
- **Commit and push at sensible points** to `UI-redesign` (`git push origin UI-redesign`). End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Never commit** the unrelated working-tree changes: `android/**`, `.gitignore`, `.codex-artifacts/`, `docs/codebase-analysis-2026-06-21/`. Stage paths explicitly.
- **Subagents** get narrow, task-only briefs, not the whole session context. They work well for test updates after a UI change.
- **Check on the emulator**, in light and dark mode, with screenshots, and put the dev build back to the owner's setting (Light) afterwards.
- **Don't change the owner's data** on the emulator. To test a destructive flow, create a throwaway workout and discard it. There is currently an in-progress "Workout 1 Sat 26 Sep" that the owner created; leave it alone.
- The owner likes seeing visual options as mockups before new UI is designed. For Phase 7 the design is already chosen, so no new mockups are needed.

## Phase 7 file map (checked 2026-09-26)

**Settings screen:** `app/(tabs)/settings.tsx` (584 lines, legacy classes, not wrapped in `DesignSystemProvider`). Move its UI into `features/settings/` like the other redesigned features, keeping the route file small. The behaviour to keep:

- `onSelect` (about line 63): 1RM formula via `getGlobalFormula` / `setGlobalFormula` from `lib/db`.
- `onThemeSelect` (line 68): display mode through `useTheme().setThemePreference`.
- `onColorThemeSelect` (line 73) and the Color Theme UI (from line 258): **remove**.
- `onExportCsv` (line 78), `onExportBackup` (line 136), `onImportBackup` (line 191) and `ReplacementRestoreDialog`: keep all guards (`operationOwnerRef`, `isExporting*`, `showReplacementRestore`, `getReplacementRestoreAvailability()`), alerts and cancellation handling exactly. `__tests__/app/settings-replacement-restore.test.tsx` covers the restore flow.
- `onUnitSelect` (line 218): weight unit.

**The mocked layout:**

- A "Settings" title (`typography.screenTitle`).
- Four groups built from `GroupLabel` + `GroupedList` + `ListRow`:
  - **Appearance:** Display with an inline `SegmentedControl` (System / Light / Dark).
  - **Units & calculations:** Weight unit with an inline kg/lb `SegmentedControl`; "Estimated 1RM formula" with subtitle "Used in charts and the 1RM toolkit", trailing current formula name and a chevron. It opens a sheet.
  - **Data:** Export backup ("Full copy of your data as a .db file"), Export CSV ("Workouts and sets for spreadsheets"), Restore from backup ("Replaces all data on this device") in destructive red, last.
  - **About:** LiftingLog, "Version x.y.z" (from `expo-constants`, already a dependency; app.json version is 1.0.0).
- Settings rows use a **32 dp icon tile with a 10 dp radius** (`.m-li .icn`), not `ListRow`'s 36 dp tile. Extend `ListRow` (for example a `tile="small"` option), update its doc and the catalog.
- Icons: `moon`, `scale`, `formula`, `download`, `table`, `restore`, `info`, all already in `components/design-system/icon.tsx`.
- **Formula sheet** (`formulaSheet()`): the shared frosted `BaseModal`. Title "Estimated 1RM formula". Explanation: "Estimates your one-rep max from weight (w) and reps (r). Changes recalculate charts; your logged sets are not modified." It shows radio options with each equation in monospace (Epley `w × (1 + r/30)`, Brzycki `w × 36 / (37 − r)`, Lombardi `w × r^0.10`, Mayhew `100w / (52.2 + 41.9e^−0.055r)`, Wathan `100w / (48.8 + 53.8e^−0.075r)`), and a Cancel / "Use Epley" `Button` row. Check the equations against `lib/pb` before shipping.
- The live strip already shows on Settings (Phase 5).

**Global theme:**

- `lib/theme/ThemeContext.tsx`: `colorTheme` state (about lines 39, 56, 74 to 77), `setColorTheme` (line 98). The root `ThemeProvider` is in `app/_layout.tsx` (line 165).
- `lib/theme/themes.ts`: the seven legacy palettes, `getRawThemeColors`, `withDerivedRoles`, `createThemeVars`.
- **Goal:** apply the Ink `designColors` app-wide from the root provider, remove the selector, and retire the legacy palettes. Screens not yet redesigned (Programs, the exercise page, calculators, history, set detail, user metrics, edit workout) must then be checked visually.
- `DesignSystemProvider` / `WorkoutThemeBoundary` become no-ops at that point. They can stay as thin wrappers or be removed in a follow-up. `ThemeColorScope` now accepts `style` (the docked tab bar passes `{ flex: 0 }`).
- Keep the DB column `settings.color_theme` (`lib/db/schema.ts`, `lib/db/settings.ts` `getColorTheme` / `setColorTheme`). Backups and restores include it; stop reading it rather than dropping it.
- `components/programs/ProgramsScreen.tsx:53` and `:486` use `colorTheme` as a React key. Update them.
- After any palette change, run `__tests__/design-system/contrast.test.ts`.

## Environment on this PC (Windows)

- **Emulator:** AVD `Pixel_9_Pro_XL`, dev client package `com.anonymous.LiftingLog`. Start it with `"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Pixel_9_Pro_XL -no-snapshot-save`, run in the background.
- **Metro** must bind IPv4, or the emulator can't connect. In PowerShell: `$env:NODE_OPTIONS="--dns-result-order=ipv4first"; npx expo start --dev-client --localhost`, run in the background. Then `adb reverse tcp:8081 tcp:8081`. If port 8081 is stuck, find and kill the node process, but ask the owner first.
- **adb:** `"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"`. In Git Bash, prefix commands with `export MSYS_NO_PATHCONV=1;`, or `/sdcard/...` paths get mangled.
  - Screenshot: `adb exec-out screencap -p > file.png` (1344x2992 px; 3 px per dp).
  - Reopen the app: `adb shell monkey -p com.anonymous.LiftingLog -c android.intent.category.LAUNCHER 1`.
  - Dev catalog: `adb shell am start -a android.intent.action.VIEW -d liftinglog://dev/design-catalog com.anonymous.LiftingLog`.
- **Pressing Back on a tab root leaves the app.** A mis-tap can then land on the launcher; check the screenshot before tapping again.
- **Display mode** is set inside the app under Settings → Display Mode. Restore Light when done.
- **Render a mockup screen:** `python -X utf8 scripts/render-mockup-screens.py <outdir> [--dark] [home|hold|detail|del|ex|exv|nav|settings|formula ...]`. It writes 720x1520 PNGs (2x) using headless Edge.
- **Shell gotchas:**
  - In the Bash tool, heredocs containing apostrophes fail to parse. Write scripts to a file (Write tool) and run them with `python -X utf8`.
  - `npx jest --testPathIgnorePatterns ...` replaces the config's ignore list. Run plain `npx jest` or pass paths.

## Tests and checks

- `npx tsc --noEmit -p .`, scoped `npx eslint <paths>`, and `npx jest`. There are two projects: `unit` (node, react-native mocked as host strings, react-native-svg mapped to `__tests__/support/react-native-svg-stub.js`) and `router` (jest-expo).
- **Known failures, not caused by the redesign:** `__tests__/config/fileSha256Native.test.ts` and `restoreNativePlugin.test.ts` fail because of the owner's uncommitted `android/` changes. Everything else passes: 1,317 of 1,319 at `a1dd3ef`.
- **Screens that use `StatusPill`, `LiveDot` or press-and-hold** need Reanimated hooks (`useReducedMotion`, `useSharedValue`, `useAnimatedStyle`, `withRepeat`, `withTiming`, `withDelay`, `cancelAnimation`, `runOnJS`, `Easing`) and `expo-haptics` in the test mocks. `__tests__/support/workout-native-mocks.ts` and `__tests__/app/exercise-library-screen.test.tsx` have working examples.
- **NativeWind:** a function `style` on `Pressable` loses its layout, so use a static style plus an `active:` class.
- **Android:** a View whose background colour changes after mount can lose its corner radius. Keep an always-mounted layer and change its opacity (see the dock pill).
- **`ThemeColorScope` renders a `flex: 1` View.** Pass `style={{ flex: 0 }}` when wrapping something that shouldn't fill its parent.
- **Hex colour literals are rejected by lint** in `features/**` and `components/design-system/**`. Put new colours in `lib/design-system/tokens.ts`.
- Add each new shared primitive (or variant) to `features/dev/design-catalog-screen.tsx`.

## Open items and follow-ups

- **Not yet checked on the emulator with real data** (tests cover them):
  - "In this workout" rows with logged sets;
  - expanded variation rows in the library. None of the owner's exercises have variations; the style was checked in the catalog.
- **Calendar sheet:** in dark mode it doesn't visually mark today (the date's `todayTextColor` is the same as the day text). Fix it with the global theme.
- **Legacy dialogs:** the library's sort, action and variation dialogs still use the older dialog pattern.
- **Floating-bar leftovers:** `ProgramsScreen` (full profile only) still has bottom paddings sized for the old floating bar (100 and 170).
- **`PinnedExercisesOverlay`:** the source is kept but no longer rendered by the tab layout.
- **Deferred to later rounds:** rest-timer defaults (with the exercise page redesign), the exercise page redesign, and the accessibility audit.
