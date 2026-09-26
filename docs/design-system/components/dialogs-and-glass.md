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
