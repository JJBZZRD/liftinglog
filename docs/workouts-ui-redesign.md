# Workouts redesign, phase one

The root tab is **Workouts**. A calendar day is a filter; a workout is a named
container with its own exercises, sets, note, and completion state. Multiple
workouts can share a day. The app opens on the current local day.

## Screen and module boundaries

- `app/(tabs)/index.tsx` and `app/workout-session/[id].tsx` are route entry points.
- `features/workouts/screens` composes the Home and detail views.
- `features/workouts/hooks` owns loading, request freshness, edits and lifecycle actions.
- `features/workouts/components` owns session rows, exercise/set rows and dialogs.
- `features/exercises` separates the exercise library's query/grouping logic,
  actions and dialogs from its route and screen composition.
- `lib/design-system` and `components/design-system` own shared visual tokens,
  the slate provider, icon actions and metric summaries. See the
  [design system](design-system.md) before adding or changing UI.
- `components/workouts` provides the brand header, calendar, frosted tools overlay
  and scroll-edge treatment; its theme exports remain compatibility aliases.
- `components/modals` owns the reusable frosted presentation and opt-in page scope.
- `components/exercise/recording` separates workout assignment, session loading,
  program persistence, input handling, actions and presentation.
- `lib/db/workoutSessions.ts` owns the container read models and transactional writes.
- `lib/workouts/selection-store.ts` carries the explicit workout selection across
  the exercise library. The database remains authoritative after app restart.

Adding an exercise queues the selected workout, dismisses the detail screen, and
switches to Exercises only after the native stack transition finishes. This keeps
the return-to-Workouts and tab transitions sequential without timing guesses.

## Visual scope

Light and dark slate palettes use a blue action accent, restrained borders and
rounded rectangular surfaces. This palette is scoped to Workouts, its detail and
recording flow, and calculators; existing theme choices still apply elsewhere
during this phased migration. Existing NativeWind class tokens are inherited by
dialogs. Modal action buttons retain the repository's shared class pattern.

The date navigator follows the LiftingLog header directly, with arrows grouped
around the date and a labeled Calendar button. The session list is titled Workouts.
Workouts and the workout picker list sessions newest first by start time, then ID;
default workout names retain their chronological numbering.

Calculators, quick stats, and dialogs in the redesigned workout/exercise flow
share `expo-blur` and Reanimated presentation. A page-level provider opts existing
modal consumers into the frosted treatment without changing legacy pages.
Android blur targets are explicit; devices below Android 12 receive the library's
translucent fallback. Modal action buttons remain opaque for readability.
The calendar uses the existing `react-native-calendars` dependency. No new native
package is needed. The pinned-exercises overlay is hidden on Workouts.

The legacy Workout History link is hidden in both release profiles. Exercise
history and chart actions open the named workout's detail page instead of the
old day-based view. The legacy history and day-view routes and their underlying
code remain in the repository; no history data is removed.

## Persistence and compatibility

The rules and migration details in [database-ground-truth.md](database-ground-truth.md)
remain authoritative. Names are an additive nullable column and workout notes use
the existing `workouts.note`. Existing set and exercise notes are preserved.
An exercise joins the workout when its first set is recorded. Opening the exercise,
choosing a workout, or opening its camera does not add it to the workout list.
Only entries with recorded sets count as exercises; they are in progress until
completed. Empty drafts and unconfirmed planned sets are excluded from this view.
Workout detail marks current PB sets using the same exercise-family scope and
current PB events as exercise history, including legacy sets without an entry.
Badges are read-only presentation of the existing PB records.
Completing a workout requires confirmation if any recorded exercise is unfinished.
The write closes those entries and the workout together. Resuming or creating a
workout cannot silently finish another active workout.

Old backups and named-workout backups have explicit restore schema profiles. The
new partial unique index is checked by its exact SQL, expression and predicate;
the change does not relax validation for arbitrary partial/expression indexes.

Legacy containers may span several dates. They appear on days with real logged
activity as well as their starting day. Their detail remains the full canonical
container, preserving IDs and history without an inferred split into sessions.
