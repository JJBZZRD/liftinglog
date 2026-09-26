# Grouped lists

Part of the [LiftingLog design system](../README.md).

[`GroupedList`, `ListRow` and `GroupLabel`](../../../components/design-system/grouped-list.tsx)
build settings-style and library-style lists: an uppercase label, then a bordered
card of rows with inset separators.

```tsx
<GroupLabel title="Data" />
<GroupedList>
  <ListRow title="Export backup" subtitle="Save a .db copy" chevron onPress={exportBackup} />
  <ListRow title="Export CSV" chevron onPress={exportCsv} />
  <ListRow title="Restore from backup" destructive onPress={restore} />
</GroupedList>
```

- **GroupLabel** takes `title`, and either a `detail` string (such as a count)
  or an `accessory` (such as the "In this workout" return pill), right-aligned.
  The title has heading semantics.
- **GroupedList** is a `surface` card with a 1 dp `border` and 18 dp corners. It
  draws a `borderLight` separator above every row except the first. Put only
  `ListRow`s inside it.
- **ListRow** is at least 60 dp tall with 14 dp side padding.
  - `icon` puts an 18 dp icon in a 36 dp `surfaceSecondary` tile; `live` tints
    the tile `liveSoft` for items in the active workout. `leading` replaces the
    tile with custom content.
  - When a row has a leading tile, its separator starts at the text (62 dp in)
    rather than near the card edge (16 dp).
  - `trailing` takes a string (muted text, such as a time) or any element, such
    as a `SegmentedControl`. `chevron` adds a disclosure arrow.
  - `destructive` colours the title for dangerous rows. Keep these last in a group.
  - `indent` makes a nested row, such as an exercise variation: 30 dp left
    padding, 48 dp tall, a 15 sp medium title, on a band tinted with the page
    colour at 50%.
  - A control inside a row (such as the variations toggle) is hidden from screen
    readers; expose it through `accessibilityActions` and
    `onAccessibilityAction` on the row instead.
  - Title and subtitle are one line each. With `onPress` or `onLongPress` the row
    is a button labelled "title, subtitle" (unless you pass a label) and shows
    the `pressed` fill while held. Without them it is a plain row.
