# Icons and brand mark

Part of the [LiftingLog design system](../README.md).

## Icon

[`Icon`](../../../components/design-system/icon.tsx) draws the stroke icons from
the approved mockups (`docs/ui-mockups/liftinglog-screen-mockups.html`) on a
24-unit grid: round caps and joins, 2-unit stroke by default, no fill. Redesigned
screens use these instead of Material Community Icons, so every icon matches the
mockups.

```tsx
<Icon name="calendar" size={18} color={rawColors.foregroundSecondary} />
```

- `Button`, `IconButton`, `ListRow`, `ConfirmDialog`, `StatusPill` and the tab
  bar take `Icon` names.
- Sizes follow the mockups: 22 dp in icon buttons and tabs, 18 dp in rows,
  controls and small buttons, 14 to 16 dp in pills and captions. Use
  `strokeWidth={2.4}` for icons at 14 dp and in list tiles.
- Icons are decorative; label the control that contains them.
- To add an icon, copy its shapes from the mockup source (or draw one in the
  same style) and add it to the catalog's icon row.

## Brand mark

[`BrandMark`](../../../components/design-system/brand-mark.tsx) is the app mark
from the mockups: the barbell and check on an ink tile. The tile keeps the same
ink colours in light and dark mode (`brandColors` in the tokens). The Workouts
header shows it at 30 dp beside "LiftingLog" at 21 sp bold.
