# Repository Context

Before changing anything that touches workout logging, program logging, workout history, exercise history, analytics, CSV export, PR events, backup/import, or DB schema/migrations, read [docs/database-ground-truth.md](docs/database-ground-truth.md).

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
- If a logged set should affect history, analytics, PRs, export, or media behavior, it must exist in `sets`.
- `program_calendar_exercises.workout_exercise_id` is a soft link and must be maintained by application code.
- `program_calendar_sets.set_id` links a programmed set to its real `sets` row and must be kept in sync on create, update, and delete.
- Do not add new persistence paths that only update `program_calendar_sets` without also considering the main history tables.
