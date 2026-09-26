# Dialogs and glass

Part of the [LiftingLog design system](../README.md).

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

## Modal action rows

Build action rows from [`Button`](buttons-and-interaction.md#button): a
`secondary` button to back out, then the `primary` (or `destructive`) action, both
with `style={{ flex: 1 }}` in a row with a 12 dp gap.

```tsx
<View style={{ flexDirection: 'row', gap: space[12] }}>
  <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
  <Button label="Save" onPress={onSave} busy={saving} style={{ flex: 1 }} />
</View>
```

Older dialogs use the previous class pattern (`bg-surface-secondary` for the
secondary button). Move them to `Button` when you next touch them; don't copy
the old pattern into new code.

Use task-specific verbs. Confirm consequential actions in context; do not add
confirmation dialogs to routine reversible navigation.

## Confirmation dialogs

Use [`ConfirmDialog`](../../../components/design-system/confirm-dialog.tsx) for
"are you sure?" moments, such as deleting or discarding a workout. It is built on
`BaseModal`, so it is frosted inside a `FrostedModalProvider`.

- The `title` names the thing: "Delete Push Day?", not "Are you sure?".
- The `message` says exactly what will be lost, such as counts of exercises and
  sets, and any side effects (PBs recalculated, videos kept).
- `emphasis` holds the irreversible part, such as "This can't be undone.", on
  its own stronger line.
- `tone="destructive"` (the default) shows a bin tile and a `destructive`
  confirm button with a bin icon. `tone="primary"` is for non-destructive
  confirmations. Pass `icon={null}` to drop the tile.
- While `busy`, both buttons are inactive and backdrop or back-button dismissal
  is ignored, so an in-flight delete can't be abandoned half way. Show failures
  through `error`, which is announced as an alert.
- The feature owns the decision and the data work; the dialog only presents it.
