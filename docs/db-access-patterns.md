# DB Access Patterns

This document defines how database code should be structured in this repo.

It complements [database-ground-truth.md](./database-ground-truth.md):

- `database-ground-truth.md` defines data ownership and persistence invariants.
- This file defines where DB code should live and how it should be written.

## 1. File Responsibilities

### `lib/db/connection.ts`

Keep this file thin.

- Open the SQLite database.
- Apply connection-level PRAGMAs.
- Call DB initialization/bootstrap.
- Export `sqlite` and `db`.

Do not put normal app queries, CRUD functions, or reporting queries here.

### `lib/db/bootstrap.ts`

This is the home for database initialization concerns.

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN` compatibility migrations
- one-time backfills and repair queries needed during startup
- index creation
- removal of obsolete legacy tables

Raw SQL is expected here because this layer is about DDL and migration-style work.

### `lib/db/schema.ts`

This is the Drizzle schema source for application code.

- Define every app-owned table here, including singleton/config tables.
- Keep column names and defaults aligned with bootstrap SQL.
- Query modules should import tables from here instead of hand-writing column names.

If a table is queried by application code, it should generally exist in `schema.ts`.

### `lib/db/introspection.ts`

Use this for schema-inspection helpers such as `hasColumn()`.

- `PRAGMA table_info(...)`
- cached column checks

Do not mix introspection helpers into app query modules unless the helper is specific to that module alone.

### `lib/db/*.ts` access modules

Files like `exercises.ts`, `workouts.ts`, `programCalendar.ts`, `settings.ts`, etc. are the application query layer.

- Group functions by domain/table ownership.
- Export small, named functions that express app operations.
- Use Drizzle by default for selects/inserts/updates/deletes.
- Keep cross-table invariants close to the write path that owns them.

## 2. Query Rules

### Default rule

Use Drizzle for normal application queries.

That includes:

- CRUD
- lookups by id/name
- join-based reads
- updates that maintain app invariants
- singleton settings reads/writes

### Allowed raw SQL exceptions

Raw SQL is still acceptable when it is the better tool for the job:

- bootstrap/migrations in `lib/db/bootstrap.ts`
- `PRAGMA` / schema introspection
- backup/import code that needs dynamic table/column handling
- SQLite-specific reporting queries where Drizzle would be materially less clear

If you use raw SQL in an access module, keep it localized, comment why Drizzle was not a good fit, and do not move it into `connection.ts`.

## 3. Write-Path Rules

Before changing anything that touches workout history or program logging, read [database-ground-truth.md](./database-ground-truth.md).

Important structural rules:

- Logged history must be written to `workouts`, `workout_exercises`, and `sets`.
- `program_calendar*` tables can mirror/link logging state but are not the source of truth for completed history.
- Deleting a real `workout_exercise` must clear `program_calendar_exercises.workout_exercise_id` first because it is a soft link.
- Deleting or editing a real set must keep `program_calendar_sets.set_id` linkage synchronized.

Prefer reusing existing helper functions that already maintain these invariants instead of duplicating partial delete/update logic in another file.

## 4. Adding New DB Code

When adding a new DB function:

1. Put the table definition in `schema.ts` if it is missing.
2. Put bootstrap/migration SQL in `bootstrap.ts` if schema/storage needs to change.
3. Add the query function to the domain file under `lib/db/`.
4. Use Drizzle unless there is a clear SQLite-specific reason not to.
5. Check whether the write path must also update PR events, media links, or program-calendar links.

## 5. Smells To Avoid

- New app queries in `connection.ts`
- new raw SQL CRUD for tables already modeled in Drizzle
- deleting history rows without clearing soft program links
- storing logged history only in `program_calendar*`
- defining a new table in bootstrap SQL but not in `schema.ts`
