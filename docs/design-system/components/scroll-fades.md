# Scrollable list edge fades

Part of the [LiftingLog design system](../README.md).

When a scrollable list uses edge fades, reuse `ScrollFade` and keep the overlays
mounted. Use `useScrollEdgeFades()` from `lib/design-system/use-scroll-edge-fades.ts`:
spread its `scrollProps` onto an `Animated.ScrollView` and pass `topOpacity` and
`bottomOpacity` to the two fades. The hook drives each opacity directly from the
distance scrolled away from the corresponding boundary:
`clamp(distance / sizes.scrollFade, 0, 1)`. The ramp spans the fade's height
(currently 36 dp). It updates on the UI thread using Reanimated's scroll handler,
so slow drags, fast swipes, momentum, and direction changes all track the content
without delay.

`ScrollFade` is a single `LinearGradient` in the page background colour with
eased ("scrim") stops, so it has no visible start or end line. Do not stack blur
layers or several gradients to build a fade: each layer's edge shows as a hard
line once opacity rises, and Android blur at partial opacity is unreliable. When
a screen scrolls under a system bar, pass `solidExtent` (for example
`insets.top`) to add an opaque band behind that bar before the gradient starts.

Scrolling speed therefore controls how quickly the fade changes: a faster swipe
traverses the opacity ramp faster, while a slower drag reveals it gradually. At
the same scroll position, opacity must be identical regardless of speed or elapsed
time. For example, 18 dp from an edge gives 50% opacity across the 36 dp ramp,
and pausing there keeps it at 50% without continuing to fade in.

Do not use a timed animation, spring, or binary scroll threshold for this effect.
Opacity must stop changing when scrolling stops and reverse immediately with the
gesture. This direct opacity mapping adds no autonomous motion or transforms,
including with reduced motion enabled.

Hide the corresponding fade at the start or end of the list, and hide both when
the content fits without scrolling. Keep fades inside the list viewport, outside
their blur target, and non-interactive. They must not shift content or obscure
the final item when the user reaches it. The Workouts list is the reference
implementation, and workout detail uses the same hook; apply this behaviour to
new or redesigned scrollable lists.

Where fades sit in a page with fixed controls is covered in
[Fixed controls and bounded scrolling](../patterns/fixed-controls-and-bounded-scrolling.md).
