# ADR: Production migration for duplicate exercise display names

- Status: Implemented on `mvp/MVP-003B-duplicate-name-migration`; integration remains gated on MVP-003C acceptance
- Date: 2026-09-21
- Production base: `956988647e13f6dd974fa1581a88b45e39535aeb`
- Accepted proof inputs: MVP-003A test proof `ff89170` and proof documentation `3eb2809`

## Decision

Production bootstrap removes only the table-level uniqueness constraint from
`exercises.name`. `exercises.id` and `exercises.uid` remain the stable identities,
`name` remains `NOT NULL`, and the UID index remains unique. The Drizzle schema and
fresh-install SQL both declare `name TEXT NOT NULL` without `.unique()`.

Existing databases use SQLite's generalized table rebuild. The migration selects
one of five evidenced input definitions, creates a new table with the same column
order and constraints except for name uniqueness, copies every column by name,
drops the old table, renames the new table, recreates explicit indexes and triggers,
checks the catalog and foreign keys, and commits. It never renames the old table.

## Historical shape ledger

The supported layouts come from the repository's real bootstrap history. The
fixture tests execute these layouts in file-backed SQLite databases populated with
all 15 application tables and the history, PB, media, formula, program, hard-link,
and soft-link rows from the accepted MVP-003A dataset.

| Shape | Historical evidence | Post-column-migration order | Fixture |
| --- | --- | --- | --- |
| Current canonical | `76c70e2f04f27a3112df8a214a958e30d37e6d8c` added parent and variation columns to fresh DDL; `0f25ee6fd07565b4c3e2541bd6f6a154364b9552` retained the exercise definition | `id, uid, name, parent_exercise_id, variation_label, description, muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned` | `production-current-canonical.sql` |
| UID-era fresh, later variation ALTERs | `39cc23418c249a2df49f789252b3541ad839c630` created fresh databases with `uid` second and no variation columns; `76c70e2f04f27a3112df8a214a958e30d37e6d8c` appended the variation columns on upgrade | `id, uid, name, description, muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned, parent_exercise_id, variation_label` | `production-uid-era-fresh.sql` |
| Pre-UID direct upgrade | `a97acf78f442c824fea9ad73148bc1238a8292d6` created the seven-column table. A direct jump to the current bootstrap appends `last_rest_seconds`, parent, variation, `is_pinned`, then `uid` according to the current migration sequence | `id, name, description, muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, parent_exercise_id, variation_label, is_pinned, uid` | `production-preuid-direct.sql` |
| Pre-UID sequential upgrade | `0923b8d058937bbbe3ac59d1224ce4602915a5f2` added `last_rest_seconds` and `is_pinned`; `3223ce9bbc95e8bb65dc55519a07bef4a203df26` appended `uid`; `76c70e2f04f27a3112df8a214a958e30d37e6d8c` appended parent and variation | `id, name, description, muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned, uid, parent_exercise_id, variation_label` | `production-preuid-sequential.sql` |
| `0923b8d` fresh direct upgrade | Fresh DDL at `0923b8d058937bbbe3ac59d1224ce4602915a5f2` already contained `last_rest_seconds` and `is_pinned`. A direct jump to current bootstrap appends parent and variation during column migration, then appends `uid` | `id, name, description, muscle_group, equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned, parent_exercise_id, variation_label, uid` | `production-0923b8d-direct.sql` |

Every definition keeps `id INTEGER PRIMARY KEY NOT NULL`, `name TEXT NOT NULL`,
`is_bodyweight INTEGER NOT NULL DEFAULT 0`, and
`is_pinned INTEGER NOT NULL DEFAULT 0`. No historical production definition has a
self-referential foreign-key clause for `parent_exercise_id`, so the migration does
not invent one.

## Bootstrap sequence

The bootstrap order is deliberate:

1. Fresh-install `CREATE TABLE IF NOT EXISTS` statements run with the target name definition.
2. Existing compatibility migrations append any missing historical columns.
3. UID columns are added where needed and existing null UIDs are backfilled. Exercise
   backfill errors propagate, and bootstrap requires every exercise UID to be non-null
   before entering the rebuild.
4. The exercise-name rebuild validates and migrates one supported post-column layout.
5. Bootstrap creates the normal UID and parent indexes.
6. A final catalog check requires both indexes and validates their exact definitions.

Steps 2 and 3 are existing compatibility work, not part of the table rebuild's
transaction or preservation promise. Successful `ALTER TABLE` statements and UID
updates from those steps can persist if a later compatibility operation fails. In
particular, an exercise UID failure after part of a batch leaves already assigned
UIDs in place; the next startup resumes only the remaining null rows. The rebuild
does not begin until all exercise rows have UIDs. The direct pre-UID fixtures
therefore permit UID backfill before the rebuild, while fixtures that already
contain exercise UIDs prove those values remain unchanged. Snapshots taken
immediately before and after the rebuild prove that the rebuild itself changes no
table values, foreign-key definitions, or catalog object other than the
`exercises` table definition and its implicit name autoindex.

## Atomicity and catalog policy

Validation completes before destructive migration SQL. The migration records the
caller's `PRAGMA foreign_keys`, disables it outside the transaction, begins with
`BEGIN IMMEDIATE`, performs the complete rebuild, runs `PRAGMA foreign_key_check`,
and commits. Every failure after `BEGIN IMMEDIATE` explicitly rolls back, and the
original foreign-key setting is restored in `finally`.

The known `idx_exercises_uid` and `idx_exercises_parent_exercise_id` indexes are
validated by catalog SQL, uniqueness, origin, partial flag, key-column order,
collation, and sort order. Extra explicit non-unique indexes and exercise triggers
are recreated from their catalog SQL and compared after recreation. An unknown
unique index is treated as an unproved constraint and rejected. Duplicate non-null
UIDs are rejected before mutation when an old database legitimately has not yet
created the UID index.

Views unrelated to `exercises` remain untouched and are covered by the catalog
comparison. A view whose SQL references `exercises` is an explicitly unsupported
catalog: the migration rejects it before disabling foreign keys or creating the
temporary table. No such view exists in the production source history. This avoids
depending on SQLite view reparse behavior without a historical input to prove.

Unknown columns, reordered columns outside the five layouts, altered defaults or
constraints, generated columns, `STRICT`, `WITHOUT ROWID`, altered known indexes,
unknown unique indexes, a pre-existing migration temporary table, and dependent
views all fail closed. They are not normalized by inference.

## Verification results

The production suite runs the real `initializeDatabase()` path through an adapter
over Node 22's file-backed SQLite engine. It covers:

- five populated historical fingerprints and a fresh database;
- all 15 tables and exact data, catalog, column metadata, and foreign-key snapshots;
- stable IDs and existing UIDs, permitted pre-UID backfill, parent links, workout
  history, sets, PB events, media, program hard links, and program soft links;
- exact recreation of known indexes, an additional non-unique index, and a trigger,
  while preserving an unrelated view;
- duplicate display-name insertion, UID uniqueness, name `NOT NULL`, tag
  uniqueness, and foreign-key restrictions;
- close/reopen, a second startup, database integrity, and normal writes;
- injected exercise UID failures before the first update and after a partial batch;
  both stop before rebuild, retain name uniqueness and all IDs/references, and
  succeed on retry without replacing UIDs already assigned by the partial batch;
- injected failures after create, copy, drop, rename, index recreation, and the
  foreign-key check, each restoring the exact pre-rebuild state;
- fail-closed cases for unknown columns, unknown constraints, partial/collated/
  descending/expression index drift, duplicate UIDs, and a dependent view.

The migration does not remove, rewrite, or reinterpret `psl_programs` or any
`program_calendar*` table. Duplicate-name product flows remain gated on MVP-003C's
identity-safe API changes and MVP-003D's UI work.
