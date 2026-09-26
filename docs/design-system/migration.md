# Migration tracker

Part of the [LiftingLog design system](README.md). The phased plan for the
redesign, including which screens change next, is in
[docs/ui-redesign-plan.md](../ui-redesign-plan.md).

## Screen status

"Redesigned" screens follow these pages and their layouts mirror the approved
mockups. "Legacy" screens keep their older layouts, but since Phase 7 every
screen uses the Ink palette from the root `ThemeProvider`.

| Screen | Route | Status |
| --- | --- | --- |
| Workouts list | `app/(tabs)/index.tsx` | Redesigned |
| Workout detail | `app/workout-session/[id].tsx` | Redesigned |
| Exercises | `app/(tabs)/exercises.tsx` | Redesigned (Phase 6): grouped list, chip filters, "In this workout" group |
| Settings | `app/(tabs)/settings.tsx` | Redesigned (Phase 7): grouped lists, inline segmented controls, 1RM formula sheet, About |
| Programs | `app/(tabs)/programs.tsx`, `app/programs/**` | Legacy |
| Exercise page (record, history, analytics) | `app/exercise/**` | Legacy |
| Other screens: calculators, workout history, day workout, edit workout, set detail, user metrics, performance guide | `app/calculators/**`, `app/workout-history.tsx`, `app/workout/[dayKey].tsx`, `app/edit-workout.tsx`, `app/set/[id].tsx`, `app/user-metric*`, `app/performance-guide.tsx` | Legacy |

Update this table when a screen is migrated.

## Adoption and remaining work

| Area | State |
| --- | --- |
| Ink colors and provider | The root `ThemeProvider` applies `designColors` app-wide; `DesignSystemProvider` is a page boundary; previous Workouts exports remain compatibility aliases |
| Icon actions and metric summaries | Shared primitives used by the current Workouts UI |
| Button, StatusPill, MetricStrip, grouped list, SegmentedControl, ConfirmDialog, press-and-hold | Shared primitives (Phase 3), shown in the dev design catalog. Workouts and workout detail use Button, StatusPill, MetricStrip, ConfirmDialog and press-and-hold (Phase 4); other screens adopt them in Phases 5 to 7 |
| Frosted dialog shell | Shared, token-driven, opt-in through page scope |
| Workout set rows | Reuse the exercise-history `SetItem` with a slate variant and reserved accessory space |
| Exercise library | Grouped lists with chip filters and sort; the "In this workout" group and return pill replaced the floating shortcut (Phase 6). The sort, action and variation dialogs still use the older dialog pattern |
| Tab bar | Docked Ink bar with a live strip on Programs and Settings (Phase 5); see [Navigation](components/navigation.md) |
| Workouts, detail, exercise recording, calculators | Reference direction; some local spacing and typography still await token adoption |
| Brand header, workout/PB rows | Existing shared/domain components; retain their behavior and optical adjustments |
| Date navigator | Previous/next `IconButton`s around a date button that opens the calendar, with a relative caption. The calendar sheet holds Today |
| Selectable color themes | Retired in Phase 7. Legacy screens render in Ink; their layouts are migrated screen by screen |
| Component catalog | Dev-only route `liftinglog://dev/design-catalog`; add each new primitive to it |
| Accessibility audit | Follow-up work; not yet complete. Palette contrast is covered by `__tests__/design-system/contrast.test.ts` |

Adopt this system when adding or redesigning a feature. Migrate the surrounding
screen deliberately instead of mixing two palettes on the same surface. Do not
rewrite unrelated screens just to replace numeric literals. Extract a new shared
component when its visual and behavioral contract is actually reused.

## Checklist for a design-system change

For a design-system change, update the implementation and these pages together,
and note any exception beside the affected code. Before finishing, review light
and dark modes, narrow width and larger text, loading/empty/error/disabled states,
keyboard and hardware-back behavior for dialogs, reduced motion, and stable
alignment across changing content. Run typecheck, scoped lint, and relevant
behavioral tests, including the contrast test after any colour change. Visual
changes need a rendered review on the target platform; unit tests alone do not
establish visual correctness.
