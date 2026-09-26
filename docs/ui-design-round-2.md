# UI design round 2: everything in the MVP not yet redesigned

Written 2026-09-26 for the session that runs the next LiftingLog design round on
branch `UI-redesign`. Round 1 (Phases 1 to 7 of [ui-redesign-plan.md](ui-redesign-plan.md))
is built and pushed. This round is **design first**: produce mockups, get the owner's
choices, record the decisions, and only then build.

## Progress

- **Proposed split (awaiting the owner):** page A (the exercise page, sections 1 to 8) first, then page B (sections 9 to 13).
- **Page A mockups, round 1 of choices:** [ui-mockups/liftinglog-round2-mockups.html](ui-mockups/liftinglog-round2-mockups.html), hosted (private to the owner) at https://claude.ai/artifact/XiFe95KAfAHTev5ajxqmif. Awaiting the owner's choices.
- **Found while preparing page A:** pinning has no visible effect in the MVP since the pinned-exercises overlay was removed (decision on page A). The edit-entry page doesn't guard unsaved set changes, and a failed Save Edits is silent (fixes shown on page A).

## Goal

Mock up every screen, modal, sheet and dialog a user can reach in the `mvp` release
profile that has not been redesigned, so the whole MVP matches the Ink design system.
The owner named the exercise page and its modals, the calculators and quick stats as
part of the scope. The full inventory is below.

Out of scope: anything hidden in `mvp` (see [Not reachable in mvp](#not-reachable-in-mvp)),
unless the owner asks for it.

## Read first

1. [AGENTS.md](../AGENTS.md): repository and UI rules.
2. [ui-redesign-handoff.md](ui-redesign-handoff.md): environment, emulator, Metro, adb, test and shell gotchas. The environment section applies unchanged.
3. [ui-redesign-plan.md](ui-redesign-plan.md): round 1 decisions, Ink token values, intended deviations.
4. [design-system/README.md](design-system/README.md) and its component pages: the primitives the mockups must be drawn from.
5. The round 1 mockups, [ui-mockups/liftinglog-screen-mockups.html](ui-mockups/liftinglog-screen-mockups.html), and the palette study beside it. Open them in a browser before designing anything.

## How the owner runs a design round

This is how round 1 worked, and the owner wants the same again.

- **Mockups before code.** The owner chooses from visual options, not written proposals. For each real decision, show two or three labelled options (A, B, C) with one marked as recommended, and say what the difference means in use.
- **Phone-frame HTML page.** One self-contained HTML page with the screens drawn in phone frames at **real Android dp** (360 × 760 dp frames, scaled down with `zoom`), a sticky control bar with a **Light / Dark** toggle, numbered sections, a caption under each shot, and a "Decisions" list at the end. Round 1's page is the template: reuse its CSS, its `BASE` Ink colours, its `I` icon set, and its `phone()`, `shot()` and `dock()` helpers. Save the source to `docs/ui-mockups/` (suggested name `liftinglog-round2-mockups.html`).
- **Publish it** as a private artifact so the owner can open it on any device, and keep the local file in step. Round 1's hosted copies are linked from the plan.
- **Rounds of choices.** The owner replies with a choice per section, and sometimes asks for changes. Revise the page: mark chosen options "Chosen", drop the rejected ones, and update the Decisions list. Repeat until the owner approves the page "for full implementation".
- **Record the decisions** in a plan document (extend [ui-redesign-plan.md](ui-redesign-plan.md) with a round 2 section, or start a round 2 plan) with a phased build order, before any code.
- **Then build** phase by phase, as in round 1: the built UI must mirror the approved mockups; compare a rendered mockup screen with an emulator screenshot in light and dark before calling a screen done; list deliberate deviations with reasons; commit and push per phase; report and wait for "carry on".
- Where a dialog only needs converting to the existing system (for example a two-button confirmation becoming `ConfirmDialog`), show one converted mockup rather than invented options. Save the A/B/C treatment for real structural choices.

## Already decided (do not reopen)

- **Palette:** Ink, the only palette, applied app-wide by the root `ThemeProvider`. The ink is the only action colour and flips to near-white in dark mode. Green (`live`, `liveSoft`, `liveInk`) is reserved for in-progress state. Token values are in the plan and `lib/design-system/tokens.ts`.
- **Primitives to design with:** `Button` (primary, secondary, destructive, destructive-outline), `IconButton`, `StatusPill` and `LiveDot`, `MetricStrip`, `GroupedList` / `ListRow` / `GroupLabel` (with the small settings tile, `busy` and `disabled`), `SegmentedControl`, `ConfirmDialog`, press-and-hold, `Icon` (the mockups' stroke icons) and `BrandMark`.
- **Dialogs:** the shared frosted `BaseModal`. Confirmations are centred (`ConfirmDialog`); option pickers are bottom sheets (`BaseModal sheet`, as in the Settings 1RM formula sheet). Action rows are a secondary `Button` then the primary or destructive `Button`, equal widths.
- **Type roles:** `screenTitle` 28/34, `detailTitle` 30/36, `cardTitle` 20/25, `section` 18, group labels 12 uppercase, row title 16/600 and subtitle 13. Dates read "Wed 24 Sep".
- **Navigation:** the docked tab bar and the live strip (Programs and Settings only).
- **Deferred from round 1 into this round:** rest-timer defaults in Settings, designed with the rest-timer control on the exercise page so both use one control.

## What the fresh session should do first

1. Start the emulator and Metro (see the handoff's Environment section) and take "before" screenshots of every item in the inventory, in light and dark. Use deep links where possible (`adb shell am start -a android.intent.action.VIEW -d "liftinglog://<path>" com.anonymous.LiftingLog`), for example `set/1`, `exercise/<id>`, `calculators/1rm-toolkit`. Screenshot after every navigation before tapping again.
2. **Do not change the owner's data.** Open dialogs and cancel them. Opening the exercise page is read-only; only saving a set, completing an exercise, pinning, or deleting writes. To see a destructive or populated flow, create a throwaway workout and discard it afterwards. Put Display back to Light at the end.
3. Read the code for anything the screenshots don't explain (states, error paths, empty states).
4. Propose the mockup sections and the decisions needed (see below), then build the mockup page.

## Suggested mockup sections

This is a large round. Consider splitting it into two pages and two approval rounds, **A** first (it holds the biggest structural decisions), then **B**. Agree the split with the owner.

**Round A: the exercise page**

1. **Exercise page shell.** Header (back, name, pin), the Record / History / Analytics switch (today a react-native-tab-view tab bar), error and "unavailable" states, the pin-limit dialog.
2. **Record tab.** Workout chooser card, the "Next set" form (weight, reps, note), the rest-timer button, Add Set, Recorded Sets, the historical-note card, the fixed Complete Exercise footer, and the empty and locked states ("Start with a workout", "Exercise complete", "This workout is complete").
3. **Record dialogs.** Choose workout (calendar plus list), Edit Set with its time picker, Delete set (with the linked-media option), Clear sets, and the Rest Timer dialog.
4. **Rest-timer defaults in Settings**, sharing one control with the Rest Timer dialog.
5. **History tab.** Session cards (in-progress badge, view, edit and delete actions, notes, set rows), the filter panel (search, sort, date presets, weight and reps ranges), the sort picker, the custom date-range pickers, and Delete session.
6. **Analytics tab.** Controls (metric, set scope, date range, overlays), the chart card and its empty and loading states, the insights deck, the Select Metric sheet, the date-range dialog, the fullscreen chart, and the data-point details sheet in portrait and landscape.
7. **Set Info page.** Set details, the note editor, the video card and video options.
8. **Edit workout entry page** (opened from History and the data-point sheet). Date, workout and entry notes, the add-set form, recorded sets, Save Edits, and its dialogs: Edit Set, time and date pickers, Delete set, "Discard unsaved note changes?".

**Round B: tools, library dialogs and the rest**

9. **Tools.** The Calculators panel (rows still use Material Community Icons), the Quick stats panel, and the five calculators (1RM Toolkit, Powerlifting Total, Power Score, Sinclair, Plate Loader) with their shared input, result, note and unit-toggle parts and the calculators stack header.
10. **Library dialogs.** New Exercise and Edit Exercise, Sort & Filter, the exercise action sheet, Delete Exercise, Manage Variations, New or Rename Variation, Delete Variation.
11. **Workout dialogs still in the old pattern.** "A workout is in progress", "Finish these exercises?", and "Edit workout" (name and note).
12. **System screens.** Programs "Coming Soon", the Replace-from-backup dialog's inner panels, and the startup and restore gate screens (checking, restart needed, recovery, pending, could not start, restored with the video scan, restore complete).
13. **Cross-cutting.** Which native `Alert.alert` messages become in-app dialogs (about 33 calls, see below), the date and time picker treatment, and the icons to add to `Icon` to retire Material Community Icons.

## Decisions the owner will need to make

These are the structural choices worth showing as options. Everything else can follow the existing system.

- **Exercise page navigation:** keep three tabs, move to a `SegmentedControl` under the header, or another structure.
- **Record tab layout:** the order and density of the set form, the recorded sets and the footer; how the set form, the rest timer and Add Set sit together; and whether the workout chooser stays a card.
- **Rest timer:** the in-page control, the Rest Timer dialog, and the matching Settings defaults, as one control.
- **History tab:** session cards compared with the Workouts metric-strip card; where the filters live (an inline panel or a sheet).
- **Analytics tab:** the controls layout, the chart styling in Ink (lines, PB markers in `pbGold`, the trend overlay), and whether the data-point details become a bottom sheet.
- **Set Info and Edit workout entry:** keep them as full pages or turn them into sheets.
- **Calculators:** keep them as stack pages or turn them into sheets from the tools panel; the shared calculator layout.
- **Native alerts:** which to keep as system alerts (for example the permission prompt) and which to turn into `ConfirmDialog` or inline messages.

## Inventory: reachable in mvp and not yet redesigned

Checked by reading the code on 2026-09-26. `L` means the legacy pattern: NativeWind classes, a `bg-surface-secondary` Pressable for Cancel and a `bg-primary` Pressable for Confirm, and Material Community Icons (MCI). `SS` means StyleSheet or inline `rawColors`. `F` means the dialog renders frosted, because its screen provides a `FrostedModalProvider`. `P` means it renders the plain `BaseModal` fallback.

The mvp profile turns off `healthMetrics`, `videoRecording` and `thirdPartyImport`, sets `programsExperience` to `coming-soon`, and turns on `multipleWorkoutSessions`. Gating is in `app/_layout.tsx` (`Stack.Protected`), `app/(tabs)/programs.tsx`, `components/exercise/recording/manual-set-form.tsx`, `use-recording-context.ts` and `docked-tab-bar.tsx`.

Only five screens provide frosted dialogs: Workouts, workout detail, the Exercises library, Settings, and the exercise page (`app/exercise/[id].tsx`, which covers its three tabs). Every other route gets the plain fallback.

### Exercise page (`app/exercise/[id].tsx`, a stack modal)

It opens from the library, from the library's "In this workout" rows, from exercise rows on workout detail, and from a rest-timer notification tap (Record tab).

| Item | Files | How it's reached | Styling |
| --- | --- | --- | --- |
| Page shell: native header with back and pin, a react-native-tab-view tab bar | `app/exercise/[id].tsx` | — | MCI, library tab bar |
| "Exercise unavailable" and load-error states | `app/exercise/[id].tsx` | a bad or deleted id | L |
| "Pin limit reached" | `app/exercise/[id].tsx` (inline) | the pin button at the pin limit | F, L |
| Record tab body: workout chooser card, "Next set" form, Recorded Sets, historical note, Complete Exercise footer | `components/exercise/UnifiedRecordTab.tsx`, `recording/manual-set-form.tsx`, `recording/recorded-sets-panel.tsx`, `components/lists/SetItem.tsx` | default tab | L |
| Empty and locked cards: "Start with a workout", "Exercise complete / Add another entry", "This workout is complete / Open workout" | `UnifiedRecordTab.tsx` | no workout; entry or workout completed | L |
| Record tab load error | `UnifiedRecordTab.tsx` | load failure | L |
| Choose workout (calendar and list) | `recording/workout-picker-modal.tsx` | tap the workout card | F, react-native-calendars, L |
| Edit Set | `components/modals/EditSetModal.tsx` via `recording/recording-modals.tsx` | pencil on a recorded set | F, L |
| Select Time (inside Edit Set) | `components/modals/DatePickerModal.tsx` | the time field | Android: native dialog. iOS: F with a legacy header |
| Delete set? (optional "Delete associated media") | `recording-modals.tsx` | trash on a set | F, L, MCI checkbox |
| Clear sets? | `recording-modals.tsx` | "Clear" in Recorded Sets | F, L |
| Rest Timer | `components/TimerModal.tsx` via `recording-modals.tsx` | long-press the timer button (a tap starts or pauses) | frosted here, L |
| Complete Exercise (manual) | `use-recording-actions.ts` | footer button | no dialog: completes and goes back |
| History tab: session cards (in-progress badge, view, edit and delete, notes, set rows) | `app/exercise/tabs/HistoryTab.tsx` (1,505 lines) | History tab | SS and some classes, MCI |
| History filter panel: search, sort row, date presets 1W to All and Custom, weight and reps ranges, Clear All | `HistoryTab.tsx` | filter toggle | SS, MCI, inline |
| Sort By picker | `HistoryTab.tsx` | "Choose sort metric" | **raw RN `Modal`**, not frosted |
| Start and End date pickers | `DatePickerModal` ×2 | the Custom preset | iOS F, Android native |
| Delete session? (and a failure `Alert`) | `HistoryTab.tsx` | trash on a session | F, L |
| Analytics controls: metric trigger, Set Scope chips, date presets, Overlays panel | `app/exercise/tabs/AnalyticsTab.tsx`, `components/charts/DateRangeSelector.tsx` | Analytics tab | L chips, MCI |
| Chart card, empty and loading states | `components/charts/AnalyticsChart.tsx` (1,155 lines) | Analytics tab | SS, MCI |
| Insights deck | `components/charts/AnalyticsInsightsDeck.tsx` (1,215 lines) | below the chart | classes, MCI, dots carousel |
| Select Metric sheet | `AnalyticsTab.tsx` (about lines 618 to 669) | metric trigger | **raw RN `Modal`**, hand-built sheet, L |
| Select Date Range | `DateRangeSelector.tsx` (plus `DatePickerModal` ×2) | Custom preset | **raw RN `Modal`**, L |
| Fullscreen chart (landscape) | `components/charts/FullscreenChart.tsx` | fullscreen button | **raw RN `Modal`**, L |
| Data point / session details (portrait and landscape) | `components/charts/DataPointModal.tsx` (963 lines) | tap or scrub a point, inline or fullscreen | **raw RN `Modal`**, SS; delete uses native `Alert` |

Not reachable in mvp on this page: the program-mode "Complete Exercise?" dialog and programmed-sets panel (`programsExperience`), and the Record video button (`videoRecording`).

### Pages opened from the exercise page

| Item | Files | How it's reached | Styling |
| --- | --- | --- | --- |
| Set Info: set details, set note editor, video card | `app/set/[id].tsx` (952 lines) | set rows on workout detail, Record, History, data-point sheet, edit workout | SS and L, MCI, plain dialogs |
| Set Info video: gallery picker, "Video options → Unlink video", native player, about 10 error `Alert`s | `app/set/[id].tsx` | the video card (**not** gated by `videoRecording`) | system picker, native `Alert` |
| Edit workout entry ("Edit {exercise}", stack modal): date pill, workout and entry note editors, add-set form, recorded sets, Save Edits footer | `app/edit-workout.tsx` (1,155 lines) | History pencil, data-point pencil | L, MCI, **no frost provider** |
| Its dialogs: date picker, Edit Set and Select Time, Delete set?, "Discard unsaved note changes?" | `app/edit-workout.tsx`, `EditSetModal`, `DatePickerModal` | from the page | P, L |

### Tools (from the Workouts header)

| Item | Files | How it's reached | Styling |
| --- | --- | --- | --- |
| Calculators panel | `components/workouts/workout-overlays.tsx` | calculator icon | frosted, DS `IconButton`, but hand-built rows with MCI icons and chevrons |
| Quick stats panel | same file (`QuickStatsPanel`) | chart icon | frosted, DS `Metric`, plain-text "Try again" (mostly redesigned) |
| Calculators stack header | `app/calculators/_layout.tsx` | — | native stack header |
| 1RM Toolkit | `app/calculators/1rm-toolkit.tsx` | panel | SS, formula chips, shared parts, no dialogs |
| Powerlifting Total | `app/calculators/powerlifting-total.tsx` | panel | SS |
| Power Score (bodyweight prefill from user metrics, usually empty in mvp) | `app/calculators/power-score.tsx` | panel | SS, sex toggle |
| Sinclair | `app/calculators/sinclair.tsx` | panel | SS |
| Plate Loader | `app/calculators/plate-loader.tsx` | panel | SS |
| Shared parts | `components/calculators/{CalculatorNumberInput,CalculatorResultCard,CalculatorNote,UnitToggle}.tsx` | — | SS |

### Library dialogs (all frosted, opened from the redesigned Exercises tab)

| Item | Files | How it's reached |
| --- | --- | --- |
| New Exercise; Edit Exercise | `components/AddExerciseModal.tsx` | "+" in the header; action sheet → Edit Details |
| Sort & Filter | `features/exercises/components/library-sort-dialog.tsx` | sort control (uses RN `Switch`) |
| Exercise action sheet: Edit Details, Variations, Delete | `features/exercises/components/library-exercise-dialogs.tsx` | long-press an exercise |
| Delete Exercise? (plus an "Unable to delete" `Alert`) | `library-exercise-dialogs.tsx`, `use-library-controller.ts` | action sheet → Delete |
| Manage Variations | `features/exercises/components/library-variation-manager.tsx` | action sheet → Variations |
| New Variation / Rename Variation / Delete Variation? | `features/exercises/components/library-variation-dialogs.tsx` | from Manage Variations |

All use the L pattern with MCI.

### Other legacy dialogs on redesigned screens (all frosted)

| Item | Files | How it's reached | Styling |
| --- | --- | --- | --- |
| "A workout is in progress" | `features/workouts/components/workout-dialogs.tsx` | starting or resuming while another workout is active | L |
| "Finish these exercises?" | same file | Complete Workout with unfinished entries | L |
| "Edit workout" (name and note) | `features/workouts/components/workout-metadata-editor.tsx` | tap the title or note on workout detail | L |
| "Replace app data from backup" inner panels | `components/settings/ReplacementRestoreDialog.tsx` | Settings → Restore from backup | DS `Button`, legacy text and panels |
| Export and backup result alerts (about 12) | `features/settings/hooks/use-data-transfer.ts` | Settings → Export | native `Alert` |

### System screens

| Item | Files | How it's reached | Styling |
| --- | --- | --- | --- |
| Programs "Coming Soon" | `components/programs/ProgramsComingSoon.tsx` | Programs tab | L, MCI |
| Startup and restore gate: checking, restart needed, recovery needed, completion pending, could not start safely, "Training data restored" with a video scan, restore complete | `components/ReplacementRestoreGate.tsx` in `app/_layout.tsx` | launch, when the database isn't ready | L; renders **outside** `ThemeProvider`, so check its colours |
| "Allow Timer Alerts" | `lib/timerStore.ts` | first rest timer without exact-alarm permission (Android) | native `Alert`; probably stays native |
| Rest-timer notification | `lib/native/restTimerNotifications.ts` | running timer | OS notification, not app UI |

### Shared legacy parts that recur

| Part | Use in mvp |
| --- | --- |
| Two-button confirm pattern | about 15 dialogs; candidates for `ConfirmDialog` |
| Raw RN `Modal` (skips `BaseModal`) | 6: History sort, Analytics metric sheet, `DateRangeSelector`, `DataPointModal`, `FullscreenChart`, the `TimerModal` fallback |
| `DatePickerModal` | about 6 instances (iOS only; Android uses the native dialog) |
| `EditSetModal` | Record tab and edit workout |
| `SetItem` | Record, History, data-point sheet, edit workout, and workout detail (`variant="workout"`) |
| `VariationExerciseLabel` | the exercise header, History, the data-point sheet, library dialogs |
| Material Community Icons | 48 files outside `components/design-system` |
| Native `Alert.alert` | about 33 calls in mvp code |

### Not reachable in mvp

- `healthMetrics`: user metrics, user metric detail, the performance guide, and the health row on Workouts.
- `videoRecording`: the record-video screen.
- `programsExperience`: the Programs screen, manage, templates, template import and exercise picker, create program (basics, editor, schedule, exercise picker), and the program exercise log.
- No entry point (deep link only): `app/workout-history.tsx`, `app/workout/[dayKey].tsx`, `app/add-exercise.tsx`, `app/calculators/index.tsx`. Ask the owner whether to delete these or leave them.
- Unused: `components/PinnedExercisesOverlay.tsx`, `components/calculators/CalculatorsSummaryCard.tsx`, `app/(drawer)/_layout.tsx`.

## Technical notes for the mockup page

- Start from a copy of `liftinglog-screen-mockups.html`. Keep the `BASE` colours in step with `designColors` in `lib/design-system/tokens.ts`. Round 1's `BASE` still has the mockup's lighter `destructive` (#C8434F); the tokens use #BF3E4A.
- Draw at real dp so sizes carry straight into code. Reuse the existing classes (`.m-li`, `.m-group`, `.m-glabel`, `.m-segc`, `.m-sheet`, `.m-opt`, `.m-dialog`, `.m-actions`, `.m-btn`, `.m-card`, `.cB` and the rest) before adding new ones.
- Any new icon drawn in the mockup must be added to `components/design-system/icon.tsx` during the build, in the same 24-unit stroke style.
- Extend `scripts/render-mockup-screens.py` (its `SCREENS` map and `MOCKUP` path) so each approved screen can be rendered to PNG for the build comparisons.
- Keep the page's light/dark toggle and "Chosen" tags, and add a Decisions list, as in round 1.

## Handoff prompt

Paste this into a fresh session:

```text
We're starting design round 2 of the LiftingLog UI redesign on branch UI-redesign. Round 1 (Phases 1–7) is built and pushed: the Ink design system is app-wide, and Workouts, workout detail, Exercises, Settings and the tab bar are redesigned.

This round is design first. Before doing anything, read docs/ui-design-round-2.md in full, then the documents in its "Read first" section (AGENTS.md, docs/ui-redesign-handoff.md for the environment, docs/ui-redesign-plan.md, docs/design-system/README.md and its component pages, and the round 1 mockups in docs/ui-mockups/).

Scope: every screen, modal, sheet and dialog reachable in the MVP profile that isn't redesigned yet. The inventory is in the round 2 document. It includes the exercise page (Record, History and Analytics tabs and all their modals), Set Info, the edit-workout entry page, the calculators and Quick stats, the Exercises library's dialogs, the remaining legacy workout dialogs, and the system and restore screens. Rest-timer defaults in Settings are part of this round, sharing one control with the exercise page's rest timer.

How I want it done:
- Mockups before any code, like round 1: a phone-frame HTML page at real Android dp with a light/dark toggle, built from the round 1 mockup page's styles and icons, saved under docs/ui-mockups/ and published so I can open it. For real structural decisions, show 2–3 labelled options with a recommendation. Where a dialog just needs converting to the existing design system, show the converted version rather than inventing options.
- Start by getting the emulator and Metro running (see the handoff's Environment section) and screenshotting the current screens in light and dark as a reference. Don't change my data: open dialogs and cancel them; if you need a populated or destructive flow, use a throwaway workout and discard it. Set the display mode back to Light when done.
- Propose how to split the round (the document suggests Round A: the exercise page, then Round B: tools, library dialogs and the rest), then build the first mockup page and stop for my choices. We'll iterate until I approve it for full implementation, then record the decisions and a phased build plan before writing any code.
- Commit and push the mockups and docs to UI-redesign at sensible points. Never stage the unrelated android/, .gitignore, .codex-artifacts/ or docs/codebase-analysis-2026-06-21/ changes, and never use git stash in this working tree.
- If you use subagents, give them narrow, task-only briefs.
```
