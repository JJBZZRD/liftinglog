# LiftingLog UI redesign plan

Status: **agreed 2026-09-26, not yet implemented.** This file records the design
decisions for the next round of the UI redesign, the order of work, and the
items deliberately deferred. Read it together with [design-system.md](design-system.md),
[workouts-ui-redesign.md](workouts-ui-redesign.md) and, for any persistence
change, [database-ground-truth.md](database-ground-truth.md).

Reference mockups: the source is saved in this repo, so any agent can open it in a browser.

- [ui-mockups/liftinglog-screen-mockups.html](ui-mockups/liftinglog-screen-mockups.html): the chosen screens. Section 6 is the finished Workouts tab.
- [ui-mockups/liftinglog-palette-study.html](ui-mockups/liftinglog-palette-study.html): Ink v1 compared with Steel and the old palette, with contrast checks.
- Hosted copies (private to the owner): https://claude.ai/artifact/CKqfQfQmdiA7pLLoRnW8jQ and https://claude.ai/artifact/AZGNPy8EgHijKeDFaF9uY9

The mockups draw at real Android dp, so their sizes and radii can be copied directly.
Where the mockups and this document disagree, this document wins.

## Ink token values

These are the values for `designColors` in `lib/design-system/tokens.ts`. The role names are
the target names. The mockups use shorter names, shown in brackets.

| Role | Light | Dark |
| --- | --- | --- |
| background | `#F3F4F7` | `#12151C` |
| surface | `#FFFFFF` | `#1B1F28` |
| surfaceSecondary (surface2: set badges, metric chips) | `#EDEFF3` | `#252A35` |
| control (ctl: secondary button fill) | `#E3E6EC` | `#2A2F3A` |
| controlBorder (ctlBorder) | `#D2D7DF` | `#3A4150` |
| border | `#DDE1E7` | `#323845` |
| borderLight | `#EBEDF1` | `#282D38` |
| foreground | `#1D2230` | `#F2F4F7` |
| foregroundSecondary | `#4F5667` | `#B4BAC6` |
| foregroundMuted | `#626978` | `#8D94A2` |
| primary | `#292F3D` | `#E8EBF0` |
| primaryForeground | `#FFFFFF` | `#292F3D` |
| primaryLight (tinted background behind active items) | `#E6E8EE` | `#2C3240` |
| live | `#1F9D6B` | `#4FD39B` |
| liveSoft | `#E0F2EA` | `#17342A` |
| liveInk (text on liveSoft) | `#16613F` | `#9BE3C2` |
| success | `#287A5F` | `#5BBE98` |
| warning | `#A86A1C` | `#DDB06A` |
| destructive | `#C8434F` | `#F07C86` |
| onDestructive | `#FFFFFF` | `#1A1D25` |
| pbGold | `#9C6C1E` | `#E0B45E` |
| overlay (scrim) | `rgba(29,34,48,0.28)` | `rgba(6,8,12,0.5)` |

The palette study checks these pairs against WCAG AA in both modes:

- body text on a card: 4.5:1
- secondary text on a card: 4.5:1
- muted text on the page: 4.5:1
- primary button label: 4.5:1
- accent on a card: 3:1
- Delete button label: 4.5:1
- PB label on a card: 4.5:1

The old palette failed the dark Delete label (about 2.5:1) and the dark primary label (about 3.2:1). It also failed light-mode PB gold on a card (about 3:1).

Mockup sizes worth keeping:

- **Status pill:** 12 sp semibold, 3/9 dp padding, 7 dp live dot.
- **Metric-strip card:** 14/16 dp padding and a 20 sp title. Each chip is a `surfaceSecondary` fill with 10 dp radius, a 17 sp value and a 12 sp label.
- **Docked tab bar:** 80 dp tall. The active icon sits in a 58×30 dp pill with 15 dp radius.
- **Live strip:** about 58 dp tall.
- **Return pill:** 32 dp tall, filled with `liveSoft`.

## Code findings to act on

- **Scroll fade lines:** `components/workouts/scroll-fade.tsx` stacks three BlurViews at 36, 24 and 12 dp, each at opacity 0.12. Their hard edges show as parallel lines once the fade's opacity rises. Android blur at partial opacity is also unreliable.
- **Detail-screen fades:** `features/workouts/screens/workout-detail-screen.tsx` (around line 124) mounts its top fade on `scrolled` and passes no `opacity`, so it doesn't follow scroll position.
- **Release profile:** in `lib/config/releaseProfile.ts`, `parseReleaseProfile(undefined)` returns `full`. `npx expo run:android` doesn't read `eas.json`, so local builds get `full`. Only `healthMetrics`, `programsExperience` and `videoRecording` are consumed. `multipleWorkoutSessions` and `thirdPartyImport` are unused.
- **`deleteWorkout` gaps:** `deleteWorkout` in `lib/db/workouts.ts:184` has no UI caller.
  - It relies on foreign-key cascades: `workout_exercises` and `sets` cascade on the workout, and `pr_events` and `media` cascade on the set.
  - It does not call `clearLinkedProgramSetsByWorkoutSetIds` or `clearLinkedProgramExercisesByWorkoutExerciseIds` (both in `lib/db/programCalendar.ts`), or `refreshUpcomingCalendarForPrograms`.
  - `deleteWorkoutExercise` (`workouts.ts:201`) and `deleteSet` (`workouts.ts:577`) show the correct cleanup order.
  - The transactional precedent is `moveWorkoutExerciseToWorkout` in `lib/db/workoutSessions.ts`. It uses a sync `db.transaction(..., { behavior: "immediate" })`, so async helpers can't be awaited inside it.
- **Workout detail hook:** `features/workouts/hooks/use-workout-detail.ts` exposes `save`, `resume`, `complete`, `requestComplete` and `cancelComplete` through a busy-guarded `run()`. There is no delete. Existing destructive dialogs are built inline with the `bg-destructive` button pattern, for example `app/workout/[dayKey].tsx:457-491`.
- **In-progress query:** `listInProgressExercises(workoutId)` (`lib/db/workouts.ts:377`) already feeds `PinnedExercisesOverlay`. Reuse it for "In this workout".
- **Tab layout:** `app/(tabs)/_layout.tsx` has a floating bar (64 dp tall, 24 dp from the bottom, 12 dp from the sides) and renders `PinnedExercisesOverlay` outside Workouts. `features/workouts/screens/workouts-home-screen.tsx` and `features/exercises/screens/exercise-library-screen.tsx` hard-code those offsets.
- **Theme selection:** `lib/theme/ThemeContext.tsx` holds `colorTheme` (7 legacy palettes in `lib/theme/themes.ts`). `DesignSystemProvider` overrides it through `ThemeColorScope`. Settings (`app/(tabs)/settings.tsx`, 584 lines) has pickers for display mode, colour theme, weight unit and 1RM formula (Epley, Brzycki, Lombardi, Mayhew, Wathan), plus backup export, replace-from-backup and CSV export.
- **Exercises screen:** `features/exercises/components/library-header.tsx` has a gradient hero with a 38 sp title. `library-exercise-card.tsx` has an icon tile, an equipment chip, a variations count, an expand chevron and a ⋯ menu, with long-press opening actions. The search scopes are All, Muscle and Equipment, and scope also changes the grouping. Sort is A–Z or Recent.

## Decisions

| Area | Decision |
| --- | --- |
| Palette | **Ink**: slate neutrals taken from the logo (`#292F3D` ink, white, `#A3A3A3`). The ink is the only action colour. In dark mode it flips to near-white with ink text. |
| Highlight | **Green**, used only for in-progress state: the status pill, the live dot, the active-workout strip and the return pill. It is never used for ordinary actions. |
| Secondary controls | Darker fill with a 1 dp border (`control`, `controlBorder`), on a slightly darker page background. |
| In-progress status | Green-tinted pill with a pulsing dot and the text "In progress". The pulse stops under reduced motion. Completed uses a muted check with the text "Completed". |
| Date navigator | Remove "Today". The date itself becomes the calendar button, with a relative caption (Today, Yesterday, "2 days ago"). The calendar sheet gets a Today action. |
| Workout card | **Metric strip**: status and time, then the name and a chevron, then three small metric chips. |
| Exercises | Grouped list per section, with chip filters and sort beside them. An "In this workout" group at the top has a return pill ("● Push Day →") in its heading. The pinned-exercises overlay is removed. |
| Navigation | **Docked bar** with an ink pill behind the active icon. The live strip shows on Programs and Settings only. Exercises uses the return pill instead, and Workouts lists the active workout. Programs shows a "Soon" badge in the MVP profile. |
| Settings | Grouped lists: Appearance (inline System/Light/Dark), Units & calculations (inline kg/lb, 1RM formula sheet with equations), Data (Export backup, Export CSV, Restore in red at the bottom), About (version). The colour-theme selector is removed. |
| Delete / discard | Two entry points open the same confirmation. On the list, a press-and-hold on a card: it scales down, a red bar fills along its bottom edge over about 500 ms, and a haptic fires when it triggers. On the detail page, a red-outlined **Delete workout** button at the end of the content. An in-progress workout with no sets shows "Discard workout?" instead of "Delete". |
| MVP scope | Multiple workouts per day are **in** the MVP. Update [mvp-product-facts.md](mvp-product-facts.md) §11 and set `multipleWorkoutSessions: true` for `mvp`. |
| Dev builds | Default to the `mvp` profile. `EXPO_PUBLIC_RELEASE_PROFILE=full` in `.env.local` shows deferred features. |

## Work order

Each phase ends with typecheck, scoped lint and the relevant Jest suites, plus a
rendered check on the Android emulator in light and dark mode. Commit each phase
separately. Do not include the unrelated `android/` and `.gitignore` working-tree
changes.

### Phase 1: quick fixes

1. **Release profile.**
   - Change `parseReleaseProfile(undefined)` to return `mvp`.
   - Set the EAS `development` profile to `mvp`.
   - Enable `multipleWorkoutSessions` for `mvp`.
   - Update `__tests__/config/releaseProfile.test.ts`, `easProfiles.test.ts` and the product facts.
   - Note: `thirdPartyImport` has no consumer because no import UI exists yet. Leave it until one does.
2. **Scroll fade.** The three stacked blur layers in `components/workouts/scroll-fade.tsx` draw hard edges at 12, 24 and 36 dp.
   - Replace them with one eased multi-stop gradient in the background colour.
   - Extract the offset-to-opacity logic into a shared `useScrollEdgeFades()` hook.
   - Use the hook in the Workouts list and in workout detail. Detail currently mounts its top fade on a boolean and never fades its bottom edge.
   - Update the fade section of the design-system doc.

### Phase 2: tokens and design-system structure

1. **Ink tokens.** Put the Ink values in `designColors`, taken from the mockups. Add these roles:
   - `live`, `liveSoft`, `liveInk`
   - `control`, `controlBorder`
   - `onDestructive`

   Extend `RawThemeColors`, `createThemeVars` and `tailwind.config.js` so every role has a NativeWind class.
2. **Contrast test.** Add a Jest test that asserts WCAG AA for the key text/background pairs in both modes. Palette changes are then checked automatically, whichever agent makes them.
3. **Restructure the docs.** Split `design-system.md` into a `docs/design-system/` folder: `README`, `foundations/`, `components/`, `patterns/`, and a migration tracker. Keep `AGENTS.md` as the entry point, and add a one-line `CLAUDE.md` that imports it.
4. **Lint rule.** Reject hex colour literals in `features/**` and `components/design-system/**`.

### Phase 3: shared primitives

Add these to `components/design-system/`, all on existing dependencies (NativeWind, Reanimated, Gesture Handler, expo-haptics, BaseModal):

- `Button`: primary, secondary, destructive, destructive-outline
- `StatusPill`: live and completed
- `MetricStrip`
- `GroupedList`, `ListRow`, `GroupLabel`
- `SegmentedControl`
- `ConfirmDialog`, built on `BaseModal`
- `usePressAndHold`: long-press progress, scale and haptic

Also add a dev-only `/dev/design-catalog` route, gated by a new capability that is enabled only in `full`. It renders every primitive in both modes.

### Phase 4: Workouts

1. Date navigator: the date button opens the calendar, and the calendar sheet gets a Today action.
2. Metric strip cards and the live status pill.
3. Delete and discard:
   - Add a transactional `deleteWorkoutSession(id)` in `lib/db/workoutSessions.ts` that:
     1. collects the workout's set IDs and exercise-entry IDs;
     2. clears the linked `program_calendar_sets` and `program_calendar_exercises` rows;
     3. deletes the workout;
     4. rebuilds PBs for the affected exercises and refreshes the program calendar;
     5. clears the selection store if it points at this workout.
   - Route the existing `deleteWorkout` (`lib/db/workouts.ts`) through it. It currently skips the program-link cleanup that the database ground-truth doc requires.
   - Add DB tests covering: sets present, no sets, active workout, completed workout, and a workout with program links.
4. Hold-to-delete on list cards, and the Delete workout button on the detail page, both opening `ConfirmDialog`.

### Phase 5: navigation

1. Build a custom docked `tabBar` for the Expo Router `Tabs`, with the live strip on Programs and Settings and the "Soon" badge in `mvp`.
2. Remove `PinnedExercisesOverlay` from the tab layout, keeping its source.
3. Export the bar and strip heights from one shared hook. This replaces the hard-coded 64 dp / 24 dp offsets in the Workouts and Exercises screens.

### Phase 6: Exercises

1. Grouped-list redesign with chip filters and sort beside them.
2. The "In this workout" group, fed by the existing `listInProgressExercises(workoutId)`, with the return pill in its heading.
3. Remove `ActiveWorkoutShortcut` from Exercises.

### Phase 7: Settings and the global theme

1. Redesign Settings as mocked. Include the About section.
2. Remove the colour-theme selector, and apply the Ink palette app-wide from the root provider so unmigrated screens use it too.
3. Retire the seven legacy palettes. Check the unmigrated screens visually after the switch.

## Deferred

- **Rest-timer defaults in Settings (MVP).** Wanted for MVP. Design and build them with the exercise page redesign, which will also cover the timer selector, so both use one control.
- **Exercise page redesign.** This is the next design round after this plan.
- **Accessibility audit and component catalog screenshots.** Run these as a separate pass once Phases 2 and 3 land.
