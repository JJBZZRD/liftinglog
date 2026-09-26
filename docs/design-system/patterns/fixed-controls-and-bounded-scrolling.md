# Fixed controls and bounded scrolling

Part of the [LiftingLog design system](../README.md).

On Workouts, the brand header, date navigator, New Workout action, and Workouts
heading stay fixed. Only the list viewport scrolls. Give that viewport bounded
flex ancestors, with `flex: 1` and `minHeight: 0` where it must consume remaining
space. Keep its refresh control, empty/error content, active-workout banner, and
optional footer in the scrolling area. Changing the date resets the list position.

Scroll fades belong to the list viewport. They are plain gradients, so they need
no blur target. The full page remains the blur target for frosted dialogs. The docked tab bar
sits below the screen, so the list's own bottom padding is all it needs. A smaller screen must
reduce the viewport height, not turn the fixed controls into scroll content.

Related pages:

- [Scroll fades](../components/scroll-fades.md) for the fade behaviour itself
- [Dialogs and glass](../components/dialogs-and-glass.md) for the page blur target
- [Layout and type](../foundations/layout-and-type.md) for safe areas and responsive spacing
