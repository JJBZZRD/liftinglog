# Segmented control

Part of the [LiftingLog design system](../README.md).

[`SegmentedControl`](../../../components/design-system/segmented-control.tsx) picks
one of two to four short options inline, such as System / Light / Dark or kg / lb.

```tsx
<SegmentedControl accessibilityLabel="Weight unit" value={unit} onChange={setUnit}
  options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
```

- The track is a `control` fill with a `controlBorder` border. The selected
  segment is a raised `surface` with `foreground` text; the others use
  `foregroundSecondary`.
- By default it hugs its content, which suits a `ListRow` `trailing` slot. Pass
  `stretch` to fill the row with equal-width segments.
- It is a `radiogroup` of `radio` items with `checked` state, and needs an
  `accessibilityLabel` naming the setting. Pressing the selected segment does
  nothing.
- For more than four options, or long labels, use a `ListRow` that opens a
  picker instead.

This is a small custom control rather than
`@react-native-segmented-control/segmented-control`, whose Android implementation
can't take the Ink track, border and raised-segment styling.
