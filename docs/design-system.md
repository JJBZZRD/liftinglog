# LiftingLog design system

Status: **v1 foundations, adopted in the Workouts redesign; migration in progress.**

This is the visual and interaction contract for new features. The reference is
the redesigned Workouts page and its detail flow. The app is **LiftingLog**.
The design uses clear slate surfaces, a blue action accent, compact information
hierarchy, and restrained translucency and motion.

## Source of truth

| Responsibility | Source |
| --- | --- |
| Light/dark semantic colors, spacing, type, radii, motion, glass | [`lib/design-system/tokens.ts`](../lib/design-system/tokens.ts) |
| Responsive gutters, card padding, and gaps | [`useResponsiveLayout`](../lib/design-system/use-responsive-layout.ts), [`getResponsiveLayout`](../lib/design-system/responsive-layout.ts) |
| Actual width available to a nested row | [`useContainerWidth`](../lib/design-system/use-container-width.ts) |
| Slate theme scope, shared by inline styles and NativeWind | [`DesignSystemProvider`](../components/design-system/design-system-provider.tsx) |
| Current scoped colors in a component | `useTheme().rawColors` from [`ThemeContext`](../lib/theme/ThemeContext.tsx) |
| Generic icon action | [`IconButton`](../components/design-system/icon-button.tsx) |
| Numeric summary | [`Metric`](../components/design-system/metric.tsx) |
| Logged set presentation | [`SetItem`](../components/lists/SetItem.tsx); `workout` variant for redesigned workout detail |
| Dialog presentation | [`BaseModal`](../components/modals/BaseModal.tsx), [`FrostedModal`](../components/modals/frosted-modal.tsx) |
| Dialog blur target | [`FrostedModalProvider`](../components/modals/frosted-modal-context.tsx) |
| Logo asset | [`liftinglog-logo.svg`](../assets/branding/liftinglog-logo.svg) |
| Working page composition | [`workouts-home-screen.tsx`](../features/workouts/screens/workouts-home-screen.tsx) |

Tokens define values; shared components define reusable behavior; this document
defines when to use them. Change the canonical token or component when changing
a shared rule. Do not copy a palette or modal shell into another feature.

The installed NativeWind, Expo Blur, Reanimated, Expo Image, safe-area, icon, and
calendar libraries already support this system. Reuse them before introducing
another UI framework. There is no separate Figma library or interactive component
catalog maintained by this repository yet.

## Color and surfaces

Read colors by semantic role, never by a chosen legacy theme name. Use NativeWind
classes such as `bg-surface` and `text-foreground`, or `rawColors.surface` and
`rawColors.foreground` for native styles, icons, and charts. Both resolve through
the same provider. Do not hardcode hex colors in new feature components.

| Role | Use |
| --- | --- |
| `background` | Page canvas: pale slate in light mode, deep slate in dark mode |
| `surface` | Cards, grouped content, dialog base |
| `surfaceSecondary` | Secondary controls and input backgrounds |
| `foreground` | Titles, values, essential body text |
| `foregroundSecondary` | Supporting labels and descriptions |
| `foregroundMuted` | Timestamps and low-priority metadata |
| `primary`, `primaryForeground` | Main action fill and its label; primary also marks active state |
| `primaryLight` | Subtle accent background |
| `border`, `borderLight` | Surface boundaries and internal dividers |
| `success`, `warning`, `destructive` | Outcome and risk; pair with text or an icon |
| `pbGold` | Personal-best recognition only |
| `overlay`, `overlayDark` | Context-preserving scrims, not ordinary card fills |

Keep regular list cards opaque and quiet. Use frosted glass for overlays and
scroll-edge transitions, not behind every piece of text. Use a border or surface
change before adding a shadow. Status must remain understandable without color:
for example, the workout status includes both a dot and “In progress” or “Completed”.

The current palette is the preserved redesign baseline, not a claim of a completed
accessibility contrast audit. Check text and control contrast when adding or
changing combinations, especially labels over primary, gold, and translucent
surfaces in both modes. Do not solve low contrast by lowering text opacity.

## Layout, spacing, and typography

Use the exported spacing and size tokens. The wide page reference uses 22 dp horizontal
padding and a centered maximum page width of 700 dp. Cards use up to 20 dp padding,
18 dp corners, and internal dividers for sets or metrics. Use normal document flow
and flex gaps; reserve absolute positioning for overlays and scroll fades.

| Text role | Baseline |
| --- | --- |
| Detail title | 32 / 39, bold |
| Workout card title | 23 / 29, semibold |
| Section heading | 18, semibold |
| Body or action label | 16 |
| Secondary control label | 14 |
| Caption or status | 12 |
| Metric value | 25, semibold, tabular numerals |
| Metric label | 11; short supporting labels only |

The token exports are `designColors`, `space`, `radius`, `typography`, `motion`,
`sizes`, `glass`, and `opacity`. For example, use `space[22]` for page padding,
`radius.card` for a card, and `typography.section` for a section heading.

Use the system font and exported text styles. Keep font scaling enabled. Important
instructions, input content, and errors need body text, not captions. Use tabular
numerals for values and dates whose width should remain stable. Make useful data
selectable. Let titles wrap where practical; truncate only when the full value is
available in the destination or editor.

Use rounded rectangles: 8 dp for modal action buttons, 12 dp for compact controls,
14 dp for icon controls, 16 dp for prominent page actions, 18 dp for cards, and
24 dp for dialog shells. Reserve circles for dots and actual circular controls.

Respect safe areas and bottom navigation. Keep long content scrollable and allow
rows to wrap at narrow widths or larger text sizes. A fixed visual position must
not require clipping text or disabling accessibility scaling.

### Responsive sizing across devices

Use the available **layout width in dp**, not the phone's physical pixel resolution
or the emulator's dimensions. `useResponsiveLayout()` tracks the app window and
font scale, subtracts horizontal safe-area insets, and returns shared bounded
spacing. Its `pageWidth` is capped at 700 dp. Apply horizontal safe-area insets once
outside that page, then use `pageGutter` for its internal padding.

| Responsive value | At 360 dp and narrower | At 448 dp and wider |
| --- | --- | --- |
| Page gutter | 16 dp | 22 dp |
| Card padding | 16 dp | 20 dp |
| Item gap | 12 dp | 18 dp |

Spacing interpolates between those widths and stays within those limits. Use it
for new or redesigned screens and shared components. Do not globally multiply
font sizes, icons, controls, or whole-screen transforms by a width ratio. Keep
44 dp touch targets, system font scaling, and the established text roles. The
installed React Native [window-dimension hook](https://reactnative.dev/docs/usewindowdimensions)
and flex layout provide the required responsive behaviour; no scaling package is
needed for these foundations.

For a constrained row, use `useContainerWidth(initialWidth)` and attach its
`onLayout` to the row's outer container. Window width alone is insufficient inside
a card, modal, split view, or padded page. Fit the complete row, including gaps,
icons, padding, and the user's font scale. Prefer flexible content with
`minWidth: 0` and intentional wrapping; give fixed action targets `flexShrink: 0`.
Do not rely on clipping, `numberOfLines`, or an arbitrary font-size reduction to
conceal overflowing controls.

Use explicit presentation modes when space is limited: full labels first,
compact spacing and approved shorter labels next, then a deliberate wrapped
layout when necessary. Compact text uses a defined readable style, not continuous
font shrinking. Keep the full meaning in accessibility labels. Reserve slots for
conditional actions, and choose the mode independently of whether those actions
are currently visible. Rotation, window resizing, and font-scale changes must
recalculate the fit without retaining stale measurements.

Workouts, its date navigator, workout cards, and the shared header, metrics,
icon buttons, and frosted modal demonstrate this approach. Existing legacy pages
still require deliberate adoption; these helpers do not automatically make every
fixed-width component responsive. Check 320, 360, 390, and 448 dp widths, larger
font scales (including 1.3 and 2), and landscape or split-window layouts. Verify
actual text and button bounds on a physical device as well as the emulator.

### Alignment is visual as well as geometric

Align visible glyphs and borders, not only touch rectangles. The Workouts date
navigator reserves its date and return-to-today slots so actions do not shift
when the date changes. Its small, documented optical offset includes half the
outer row gap to center the return label between the arrow button and Calendar
button edges. Preserve that correction when refactoring; do not turn this
feature-specific offset into a general token.

The date controls use a full single row when space allows. On narrower phones,
use a compact single row with `Today`, a 15 dp date label, and the Calendar label;
the return action's accessibility label remains `Back to today`. Keep both arrows
at 44 dp and reserve the return slot on today too. If even the compact row cannot
fit the measured width and font scale, put the complete arrow/date group on a
centered first row, with Today and Calendar on a second row. Budget both actions
explicitly rather than restricting Calendar to half the row, which can split its
label at larger font scales. Choose that
layout independently of the selected date. Constrain the date slot so large text
can wrap without disappearing or forcing controls outside the page.

Optional content must not decide where a row's primary values or actions sit.
Reserve an accessory column for conditional PB badges or trailing controls, and
use the same value columns for every row in a list. Check the combinations with
and without badges, notes, warm-up labels, and status. Notes may increase row
height; they must not move the weight, reps, or navigation columns sideways.
Use a consistent responsive layout for narrow screens and larger type rather than
shrinking an individual row's font to make its badge fit.

### Fixed controls and bounded scrolling

On Workouts, the brand header, date navigator, New Workout action, and Workouts
heading stay fixed. Only the list viewport scrolls. Give that viewport bounded
flex ancestors, with `flex: 1` and `minHeight: 0` where it must consume remaining
space. Keep its refresh control, empty/error content, active-workout banner, and
optional footer in the scrolling area. Changing the date resets the list position.

Scroll fades belong to the list viewport. They are plain gradients, so they need
no blur target. The full page remains the blur target for frosted dialogs. Keep the final list item reachable above the floating tab bar. A smaller
screen must reduce the viewport height, not turn the fixed controls into scroll
content.

### Scrollable list edge fades

When a scrollable list uses edge fades, reuse `ScrollFade` and keep the overlays
mounted. Use `useScrollEdgeFades()` from `lib/design-system/use-scroll-edge-fades.ts`:
spread its `scrollProps` onto an `Animated.ScrollView` and pass `topOpacity` and
`bottomOpacity` to the two fades. The hook drives each opacity directly from the
distance scrolled away from the corresponding boundary:
`clamp(distance / sizes.scrollFade, 0, 1)`. The ramp spans the fade's height
(currently 36 dp). It updates on the UI thread using Reanimated's scroll handler,
so slow drags, fast swipes, momentum, and direction changes all track the content
without delay.

`ScrollFade` is a single `LinearGradient` in the page background colour with
eased ("scrim") stops, so it has no visible start or end line. Do not stack blur
layers or several gradients to build a fade: each layer's edge shows as a hard
line once opacity rises, and Android blur at partial opacity is unreliable. When
a screen scrolls under a system bar, pass `solidExtent` (for example
`insets.top`) to add an opaque band behind that bar before the gradient starts.

Scrolling speed therefore controls how quickly the fade changes: a faster swipe
traverses the opacity ramp faster, while a slower drag reveals it gradually. At
the same scroll position, opacity must be identical regardless of speed or elapsed
time. For example, 18 dp from an edge gives 50% opacity across the 36 dp ramp,
and pausing there keeps it at 50% without continuing to fade in.

Do not use a timed animation, spring, or binary scroll threshold for this effect.
Opacity must stop changing when scrolling stops and reverse immediately with the
gesture. This direct opacity mapping adds no autonomous motion or transforms,
including with reduced motion enabled.

Hide the corresponding fade at the start or end of the list, and hide both when
the content fits without scrolling. Keep fades inside the list viewport, outside
their blur target, and non-interactive. They must not shift content or obscure
the final item when the user reaches it. The Workouts list is the reference
implementation, and workout detail uses the same hook; apply this behaviour to
new or redesigned scrollable lists.

### Active-workout shortcut

The Exercises library keeps a floating return action above the tab bar while a
workout is active. Use the shared slate surface, border, blue accent, action
radius and glass tokens in both light and dark modes. The workout name and
explicit active status sit on the left; the return label and arrow sit on the
right. Long names may truncate because the full name is available at the
destination and in the accessibility label. Keep the action readable at larger
text sizes rather than forcing the whole bar onto one text line.

The shortcut overlays the list without moving its rows. Reserve measured bottom
clearance so the final exercise can scroll fully above it, and hide it while the
search keyboard is open. Its blur samples the list only; the surrounding modal
blur target includes both the list and shortcut. Search and the library's Add
button share a row, with a reserved clear-search slot so typing does not move
the Add button or resize the input.

Navigate directly from workout detail to Exercises. Do not stage a return via
the Workouts tab or wait for one animation before starting another. The shortcut
uses the actual active workout, independently of a historical workout selection.

## Components and interaction

- Use `IconButton` for a single icon action. It provides a 44 dp target, an
  accessibility label, disabled semantics, and press feedback. Use
  `variant="secondary"` for a visible slate button surface with the same 12 dp
  corners and secondary foreground as Calendar; the default stays plain.
- Use `Metric` for a value with a short supporting label. Keep workout-specific
  status and PB components in their feature/domain folders.
- Reuse `SetItem` for logged sets. Its `workout` variant adapts the exercise-history
  pattern to slate surfaces, with a numbered badge, aligned weight/reps columns,
  inline PB recognition, and notes below. The status/date row of an exercise card
  belongs above the exercise name. PB indicators stay alongside their specific
  sets, including when narrow widths require units to sit below their values.
  Each exercise entry starts with its best set plus every set that achieved a PB,
  in original set order and with original numbering. Show a set only once when it
  belongs to both groups. A separate Show all / Show highlights control expands
  the entry without changing exercise or set navigation; omit it when every set
  is already visible. Best uses a blue label, while PBs retain gold recognition.
  Workout PB badges represent records achieved at the time, including records
  later beaten. Exercise history retains its current-record badge behavior.
- Give a screen one clearly dominant action where practical. Secondary controls
  use the secondary surface; destructive actions have an explicit verb and color.
- Use static `Pressable` styles with NativeWind active classes, such as
  `active:opacity-70`. Avoid callback `style` props on NativeWind Pressables;
  this combination has rendered incorrectly in the Android development client.
- Disable actions while their operation is pending and show a progress label or
  indicator. Keep the label stable enough to avoid moving adjacent controls.
- Empty states explain the absence of content and the next action. Errors explain
  what failed and offer retry where possible. Loading is distinct from empty.
- Icon-only actions need labels; headings need heading semantics. Disabled and
  selected states must be exposed to assistive technology.

### Dialogs and glass

Use `BaseModal` for ordinary dialogs. Inside `FrostedModalProvider` it automatically
uses the shared frosted presentation. Use `FrostedModal` directly only when a tool
panel needs explicit positioning or a supplied target.

The page's `BlurTargetView` contains the page content, and the dialogs are rendered
as siblings. Pass its ref to `FrostedModalProvider`. This explicit target is needed
for the Android blur implementation; do not include the modal in its own target.
See the Workouts screen for the complete safe-area and scroll composition.

The shared shell owns blur intensity, scrim, translucent surface, border alpha,
entrance animation, keyboard avoidance, safe-area spacing, and bounded scrolling.
Keep controls opaque and readable. Older Android devices use the existing library
fallback. A blurred background is optional decoration; the scrim and surface must
still establish the dialog hierarchy without blur.

Modal action rows follow the repository's class-based pattern:

```tsx
<View className="flex-row gap-3">
  <Pressable
    accessibilityRole="button"
    onPress={onCancel}
    className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
  >
    <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
  </Pressable>
  <Pressable
    accessibilityRole="button"
    onPress={onConfirm}
    className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary"
  >
    <Text className="text-base font-semibold text-primary-foreground">Save</Text>
  </Pressable>
</View>
```

Use task-specific verbs. Confirm consequential actions in context; do not add
confirmation dialogs to routine reversible navigation. Existing confirmation
behavior remains owned by the feature, not by the design system.

### Motion

The current motion tokens are 180 ms for layout changes, 240 ms for list entrances,
260 ms for dialog entrances, and 40 ms list stagger. Limit stagger to the first few
items. Use Reanimated's system reduced-motion support, and suppress both the native
modal transition and its content entrance when reduced motion is enabled.

Let wrapped text determine card height directly. On Android, layout transitions
can capture a height before larger or newly wrapped text finishes measuring,
causing clipped labels or overlapping rows. The workout cards retain entrance
animations but do not animate their content-driven height.

Animation should explain a state or navigation change. Sequence dependent route
transitions using navigation lifecycle events, not guessed timeouts. Scroll-edge
fades are decorative, ignore touches, and must not permanently obscure content.
Follow the [scrollable list edge fade guidelines](#scrollable-list-edge-fades)
for their visibility transitions and boundary behaviour.

## Using the system in a new feature

Keep routes small. Put feature screens, components, and state hooks in
`features/<feature>/`; put truly reusable presentation in `components/design-system/`.
Pure visual constants belong in `lib/design-system/`. UI primitives must not import
database access, workout controllers, or feature state.

Until the whole application is migrated, wrap a new or redesigned screen in
`DesignSystemProvider` underneath the app's existing `ThemeProvider`:

```tsx
import { DesignSystemProvider } from '@/components/design-system/design-system-provider';
import { IconButton } from '@/components/design-system/icon-button';
import { useTheme } from '@/lib/theme/ThemeContext';
import { View } from 'react-native';

function FeatureContent({ onClose }: { onClose: () => void }) {
  const { rawColors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: rawColors.background }}>
      <IconButton icon="close" label="Close" onPress={onClose} />
    </View>
  );
}

export function FeatureScreen({ onClose }: { onClose: () => void }) {
  return (
    <DesignSystemProvider>
      <FeatureContent onClose={onClose} />
    </DesignSystemProvider>
  );
}
```

Call `useTheme` in a descendant of the provider, not the component returning the
provider. Use `useDesignSystemTheme` only when a boundary needs the slate values
before it mounts. The provider preserves the user's light/dark preference and
does not rewrite their stored legacy color-theme selection.

NativeWind scans `app`, `components`, and `features`. Use complete, statically
written class names rather than constructing a color class at runtime. Prefer
classes for modal actions and semantic color roles; use typed tokens for native
layout, motion, and inline styles. Avoid assigning the same style property through
both mechanisms on one element.

## Adoption and remaining work

| Area | State |
| --- | --- |
| Slate colors and provider | Shared source; previous Workouts exports remain compatibility aliases |
| Icon actions and metric summaries | Shared primitives used by the current Workouts UI |
| Frosted dialog shell | Shared, token-driven, opt-in through page scope |
| Workout set rows | Reuse the exercise-history `SetItem` with a slate variant and reserved accessory space |
| Exercise library search and active-workout shortcut | Shared slate theme, inline Add action, frosted return shortcut above the tab bar |
| Workouts, detail, exercise recording, calculators | Reference direction; some local spacing and typography still await token adoption |
| Brand header, date navigator, workout/PB rows | Existing shared/domain components; retain their behavior and optical adjustments |
| Legacy screens and selectable color themes | Still supported during phased migration; do not extend these palettes for new features |
| Component catalog and accessibility audit | Follow-up work; not yet complete |

Adopt this system when adding or redesigning a feature. Migrate the surrounding
screen deliberately instead of mixing two palettes on the same surface. Do not
rewrite unrelated screens just to replace numeric literals. Extract a new shared
component when its visual and behavioral contract is actually reused.

For a design-system change, update the implementation and this document together,
and note any exception beside the affected code. Before finishing, review light
and dark modes, narrow width and larger text, loading/empty/error/disabled states,
keyboard and hardware-back behavior for dialogs, reduced motion, and stable
alignment across changing content. Run typecheck, scoped lint, and relevant
behavioral tests. Visual changes need a rendered review on the target platform;
unit tests alone do not establish visual correctness.
