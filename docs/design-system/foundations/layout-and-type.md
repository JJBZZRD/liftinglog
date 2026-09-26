# Layout, spacing, and typography

Part of the [LiftingLog design system](../README.md).

## Spacing and page layout

Use the exported spacing and size tokens. The wide page reference uses 22 dp horizontal
padding and a centered maximum page width of 700 dp. Cards use up to 20 dp padding,
18 dp corners, and internal dividers for sets or metrics. Use normal document flow
and flex gaps; reserve absolute positioning for overlays and scroll fades.

The token exports are `designColors`, `space`, `radius`, `typography`, `motion`,
`sizes`, `glass`, and `opacity`. For example, use `space[22]` for page padding,
`radius.card` for a card, and `typography.section` for a section heading.

Respect safe areas and bottom navigation. Keep long content scrollable and allow
rows to wrap at narrow widths or larger text sizes. A fixed visual position must
not require clipping text or disabling accessibility scaling.

## Typography

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

Use the system font and exported text styles. Keep font scaling enabled. Important
instructions, input content, and errors need body text, not captions. Use tabular
numerals for values and dates whose width should remain stable. Make useful data
selectable. Let titles wrap where practical; truncate only when the full value is
available in the destination or editor.

## Shape

Use rounded rectangles: 8 dp for modal action buttons, 12 dp for compact controls,
14 dp for icon controls, 16 dp for prominent page actions, 18 dp for cards, and
24 dp for dialog shells. Reserve circles for dots and actual circular controls.

## Responsive sizing across devices

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

## Alignment is visual as well as geometric

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
