# Motion

Part of the [LiftingLog design system](../README.md).

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
Follow the [scrollable list edge fade guidelines](../components/scroll-fades.md)
for their visibility transitions and boundary behaviour.
