# Repository Context

Before changing anything that touches workout logging, program logging, workout history, exercise history, analytics, CSV export, PB events, backup/import, or DB schema/migrations, read [docs/database-ground-truth.md](docs/database-ground-truth.md).

Before changing DB connection/bootstrap structure or adding new database access functions, also read [docs/db-access-patterns.md](docs/db-access-patterns.md).

Treat that file as the source of truth for:

- how the database tables relate to each other
- which tables are authoritative for logged training history
- how manual logging and program logging must write into the main history tables
- which links are hard foreign keys vs soft application-managed links
- which downstream features break if persistence is changed incorrectly
- how DB files are layered and where raw SQL is acceptable vs not acceptable

Non-negotiable rules:

- Logged training history lives in `workouts`, `workout_exercises`, and `sets`.
- `psl_programs` and `program_calendar*` are program-definition and schedule/materialization tables, not a second history system.
- If a logged set should affect history, analytics, PBs, export, or media behavior, it must exist in `sets`.
- `program_calendar_exercises.workout_exercise_id` is a soft link and must be maintained by application code.
- `program_calendar_sets.set_id` links a programmed set to its real `sets` row and must be kept in sync on create, update, and delete.
- Do not add new persistence paths that only update `program_calendar_sets` without also considering the main history tables.
- Always search for plugins or libraries that can fulfill the users needs before creating an implemenation, especially when it comes to UI elements or features. Quite frequently the work has already been done by someone else and in an optimal way and you can save a lot of time.

## UI design system

Before adding or changing UI, read [docs/design-system/README.md](docs/design-system/README.md).
It defines the LiftingLog slate design system and its current migration scope.

- Use `lib/design-system/tokens.ts` for shared visual values and `components/design-system` for generic primitives.
- Wrap new or redesigned screens in `DesignSystemProvider` under the existing app theme provider; use `useTheme` in descendants so native styles and NativeWind classes share the same palette.
- Reuse `BaseModal` with a page `FrostedModalProvider` for redesigned dialogs. Do not duplicate blur, scrim, keyboard, or animation shells.
- Preserve light/dark mode, font scaling, safe areas, reduced motion, and accessible action labels.
- Keep primary values and controls aligned when optional badges, status labels, or actions appear. Reserve consistent accessory space or use shared columns; review both populated and absent states at narrow widths and larger text sizes.
- Keep feature behavior in `features/<feature>` and route files small. Shared visual primitives must not depend on workout or database state.
- Update the design-system document when changing a shared design rule. Keep legacy theme behavior intact outside the migrated scope.

UI consistency rule (modals and action buttons):

- For modal action rows, reuse the same class-based button styling pattern used in `components/AddExerciseModal.tsx`.
- Use `Pressable` className-based styles (not ad-hoc inline color/spacing tweaks) so light/dark theme tokens apply consistently.
- Preferred button classes:
  - Secondary: `flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary`
  - Primary: `flex-1 items-center justify-center p-3.5 rounded-lg bg-primary`
- Preferred button text classes:
  - Secondary text: `text-base font-semibold text-foreground-secondary`
  - Primary text: `text-base font-semibold text-primary-foreground`
