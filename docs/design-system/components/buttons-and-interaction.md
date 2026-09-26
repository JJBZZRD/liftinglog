# Buttons and interaction

Part of the [LiftingLog design system](../README.md).

- Use `IconButton` for a single icon action. It provides a 44 dp target, an
  accessibility label, disabled semantics, and press feedback. Use
  `variant="secondary"` for a visible slate button surface with the same 12 dp
  corners and secondary foreground as Calendar; the default stays plain.
- Use `Metric` for a value with a short supporting label. Keep workout-specific
  status and PB components in their feature/domain folders.
- Reuse `SetItem` for logged sets; see [Set rows](set-rows.md).
- Give a screen one clearly dominant action where practical. Secondary controls
  use the secondary control surface (`control` fill with a `controlBorder` border;
  see [Color](../foundations/color.md)); destructive actions have an explicit verb
  and color, with `onDestructive` for text and icons on a `destructive` fill.
- Use static `Pressable` styles with NativeWind active classes, such as
  `active:opacity-70`. Avoid callback `style` props on NativeWind Pressables;
  this combination has rendered incorrectly in the Android development client.
- Disable actions while their operation is pending and show a progress label or
  indicator. Keep the label stable enough to avoid moving adjacent controls.
- Empty states explain the absence of content and the next action. Errors explain
  what failed and offer retry where possible. Loading is distinct from empty.
- Icon-only actions need labels; headings need heading semantics. Disabled and
  selected states must be exposed to assistive technology.

For modal action rows (Cancel / Save), use the class-based pattern in
[Dialogs and glass](dialogs-and-glass.md#modal-action-rows).
