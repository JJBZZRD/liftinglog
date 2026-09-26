# Status pills and metric strips

Part of the [LiftingLog design system](../README.md).

## StatusPill and LiveDot

[`StatusPill`](../../../components/design-system/status-pill.tsx) shows whether a
workout or exercise entry is in progress or completed.

- `status="live"`: a `liveSoft` pill with a pulsing `live` dot and `liveInk` text,
  "In progress" by default. This is the main use of the green highlight; see
  [Color](../foundations/color.md).
- `status="completed"`: a muted check and "Completed" in `foregroundSecondary`,
  with no fill, so finished items recede.
- Pass `label` to change the text. Each pill is a single accessible element whose
  label is its text; status never relies on colour alone.
- `LiveDot` is the 7 dp dot on its own, for the return pill and live strip. Its
  ring pulses over `motion.livePulse` (2.2 s); under reduced motion it is still.
  Pass `pulse={false}` where several dots would otherwise pulse at once.

## MetricStrip

[`MetricStrip`](../../../components/design-system/metric-strip.tsx) is the row of
small value/label chips on a workout card ("4 exercises · 14 sets · 6.2k kg").

- Chips share the width equally, on a `surfaceSecondary` fill with 10 dp corners.
  Values use `typography.chipValue` (17 sp, tabular figures).
- Keep to three chips on a phone, with one short word per label: the label wraps
  under its value at large text sizes.
- Each chip is one accessible element, read as "4 exercises".
- For a single large value with a label, as in a detail header, use `Metric`.
