# Active-workout shortcut

Part of the [LiftingLog design system](../README.md).

The Exercises library keeps a floating return action above the tab bar while a
workout is active. Use the shared slate surface, border, primary (ink) accent,
action radius and glass tokens in both light and dark modes. The workout name and
explicit active status sit on the left; the return label and arrow sit on the
right. Long names may truncate because the full name is available at the
destination and in the accessibility label. Keep the action readable at larger
text sizes rather than forcing the whole bar onto one text line.

The shortcut overlays the list without moving its rows. Reserve measured bottom
clearance so the final exercise can scroll fully above it, and hide it while the
search keyboard is open. Its blur samples the list only; the surrounding modal
blur target includes both the list and shortcut. Search and the library's Add
button share a row, with a reserved clear-search slot so typing does not move
the Add button or resize the input.

Navigate directly from workout detail to Exercises. Do not stage a return via
the Workouts tab or wait for one animation before starting another. The shortcut
uses the actual active workout, independently of a historical workout selection.

The [UI redesign plan](../../ui-redesign-plan.md) replaces this shortcut in Phase 6
with a return pill in the "In this workout" group heading. That pill uses the
green `live` roles; see [Color](../foundations/color.md).
