# Set rows

Part of the [LiftingLog design system](../README.md).

Reuse [`SetItem`](../../../components/lists/SetItem.tsx) for logged sets. Its
`workout` variant adapts the exercise-history pattern to slate surfaces, with a
numbered badge, aligned weight/reps columns, inline PB recognition, and notes
below.

- The status/date row of an exercise card belongs above the exercise name.
- PB indicators stay alongside their specific sets, including when narrow widths
  require units to sit below their values.
- Each exercise entry starts with its best set plus every set that achieved a PB,
  in original set order and with original numbering. Show a set only once when it
  belongs to both groups.
- A separate Show all / Show highlights control expands the entry without changing
  exercise or set navigation; omit it when every set is already visible.
- Best uses a `primary` label, while PBs retain gold (`pbGold`) recognition.
- Workout PB badges represent records achieved at the time, including records
  later beaten. Exercise history retains its current-record badge behavior.

Rows reserve an accessory column so optional badges, notes, and warm-up labels
never move the value columns; see
[alignment](../foundations/layout-and-type.md#alignment-is-visual-as-well-as-geometric).
