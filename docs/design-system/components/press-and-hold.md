# Press and hold

Part of the [LiftingLog design system](../README.md).

[`usePressAndHold` and `HoldProgress`](../../../components/design-system/press-and-hold.tsx)
add a hold-to-act shortcut, such as hold-to-delete, to a card that already opens
on tap. The hold only opens a confirmation; it never destroys data by itself.

```tsx
const { progress, holdStyle, pressableProps } = usePressAndHold({
  onPress: open, onHold: () => setConfirming(true), holdLabel: 'Delete workout',
});
return <Animated.View style={holdStyle}>
  <Pressable accessibilityRole="button" accessibilityLabel={title} {...pressableProps} style={cardStyle}>
    {content}
    <HoldProgress progress={progress} />
  </Pressable>
</Animated.View>;
```

- Pass the card's tap as `onPress` to the hook, not to the `Pressable`: the hook
  swallows the tap that ends a completed hold.
- Timing: feedback starts after `motion.holdDelay` (120 ms), so a scroll that
  begins on the card doesn't flash it. The fill then runs for `motion.hold`
  (500 ms). Releasing early rewinds it over `motion.holdRelease`.
- While held, the card scales to 0.97, a faint `destructive` tint appears, and a
  3 dp `destructive` bar fills along the bottom edge. Give the card
  `overflow: 'hidden'` so the bar follows its corners.
- On completion a medium haptic fires, then `onHold` runs.
- Under reduced motion the card doesn't scale; the fill still shows progress.
- Screen readers get the same action as an accessibility action named by
  `holdLabel`, alongside the normal activate action.
