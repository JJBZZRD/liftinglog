# Navigation bar and live strip

Part of the [LiftingLog design system](../README.md).

The tabs use a custom docked bar,
[`DockedTabBar`](../../../features/navigation/components/docked-tab-bar.tsx),
passed to Expo Router's `Tabs` as `tabBar`.

## Docked bar

- It sits **below** the screens in normal layout, not floating over them. Tab
  screens therefore need no bottom offset for the bar or the bottom safe area; the
  bar pads itself with `max(insets.bottom, 12)`. Do not reintroduce hard-coded
  tab-bar heights in screens. If a screen ever needs the bar's height, use
  `useBottomTabBarHeight()` from `expo-router/js-tabs`; the bar reports its
  measured height (including any live strip).
- Layout: `surface` fill with a 1 dp `border` top edge, `sizes.dockBar` content
  height, and each tab's icon in a `sizes.dockPillWidth` × `sizes.dockPill` pill.
  The active pill is `primary` (ink, near-white in dark mode) with a
  `primaryForeground` icon; its label is bold `foreground`. Inactive tabs use
  `foregroundSecondary`.
- The active pill background is always mounted with a fixed colour and radius and
  only its opacity changes. Android drew it square when the background colour
  changed after mount.
- Programs shows a **SOON** badge while `programsExperience` is `coming-soon` (the
  `mvp` profile); its label becomes "Programs, coming soon".
- The bar is wrapped in `DesignSystemProvider` with `style={{ flex: 0 }}`, so
  the boundary sizes to the bar instead of taking height from the screens.
- It hides while the keyboard is open, like `tabBarHideOnKeyboard`.
- Tabs have the `tab` role and `selected` state, emit `tabPress` and
  `tabLongPress`, and respect a prevented `tabPress`.

## Live strip

[`LiveWorkoutStrip`](../../../features/workouts/components/live-workout-strip.tsx)
docks above the bar on **Programs and Settings** while a workout is in progress:
a pulsing `LiveDot`, the workout name, a `liveInk` line ("In progress · 42 min ·
4 exercises") and a **Return** action that opens the workout. It is not shown on
Workouts, which lists the active workout itself, or on Exercises, which has its
own return path.

Its data comes from `useLiveWorkout(enabled)`, which reads the active workout
when the tab changes, when the tabs regain focus (for example after completing
the workout on its detail page), and when the app returns to the foreground. The
elapsed time updates once a minute.
