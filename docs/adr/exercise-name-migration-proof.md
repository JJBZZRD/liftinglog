# ADR: Exercise-name uniqueness migration proof

- Status: Proof complete for review; production migration not authorized
- Date: 2026-09-21
- Fixture/schema source: pinned base `5892c323797a85d86a60ae09c9058b37f0808ab5`; relevant bootstrap and schema definitions verified unchanged through `aa6b6715ffea28ba0094ffed6ed7aa184cd6610c`
- Final proof execution base: `932139855c0a6d17b703313130311153ce1bc420`
- Runtime used by the proof: Node 22.19.0 `node:sqlite`, SQLite 3.50.4

## Context

Exercise identity is the stable `exercises.id`/`uid`, while `name` is a display value. Duplicate display names must therefore be legal. At the pinned base, two independent sources still declare name uniqueness:

- `SCHEMA_BOOTSTRAP_SQL` creates `name TEXT NOT NULL UNIQUE`.
- the Drizzle schema declares `text("name").notNull().unique()`.

The actual legacy SQLite constraint is an implicit table constraint represented by a `sqlite_autoindex_exercises_*` index. Drizzle metadata does not prove which DDL exists in an already-created user database, so the proof reads `sqlite_schema` and SQLite PRAGMAs from a real database.

SQLite cannot drop this `UNIQUE` constraint with a direct `ALTER TABLE`, and an implicit autoindex cannot be removed with `DROP INDEX`. SQLite's documented solution for removing a `UNIQUE` constraint is the generalized table-rebuild procedure. See [SQLite ALTER TABLE: Making Other Kinds Of Table Schema Changes](https://www.sqlite.org/lang_altertable.html#making_other_kinds_of_table_schema_changes).

The full and MVP applications share this schema. Program tables remain present. They contain durable definitions and materialized schedules and must retain their links to the main history tables; this migration does not remove or reinterpret them.

## Decision for the proof

Use a dependency-free, test-only worker backed by Node's real SQLite engine. The worker rebuilds only `exercises`, copies every column explicitly, and removes only the table-level uniqueness of `name`. It does not alter production bootstrap, Drizzle schema, exercise APIs, or a live database.

The populated fixture reproduces the pinned post-bootstrap `exercises` DDL and the related tables from `SCHEMA_BOOTSTRAP_SQL`. It contains:

- stable exercise IDs and UIDs, including a parent and variation link;
- a completed workout entry and real set history;
- PB, media, and formula-override references;
- PSL program, calendar exercise, calendar set, real-set, and soft workout-entry links;
- explicit UID and parent indexes on `exercises`;
- values in every material column needed to detect a lossy copy.

The fixture is executed into an on-disk temporary `.sqlite` database for each test. SQL strings and mocked database methods are not used as substitutes for migration execution.

## Exact rebuild sequence

The proven sequence is:

1. Read the `exercises` table SQL and index catalog while the connection is in autocommit mode.
2. Accept only the exact pinned post-bootstrap legacy definition or the exact target definition. Reject any other table body.
3. Verify the legacy implicit uniqueness source through `PRAGMA index_list`/`PRAGMA index_info`.
4. Accept the UID index only when `index_list` reports a non-partial explicit unique index and its normalized catalog SQL is exactly `CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid)`. Fail closed for every other explicit unique definition, including expression, partial, collation, and sort-order variants.
5. Save all explicit indexes and triggers owned by `exercises` from `sqlite_schema`. Implicit autoindexes have no SQL and are intentionally not saved.
6. Record the connection's `PRAGMA foreign_keys` value.
7. Set `PRAGMA foreign_keys = OFF` before beginning a transaction.
8. Start `BEGIN IMMEDIATE`.
9. Create `__mvp003a_exercises_new` with the exact target definition. The only definition change is `name TEXT NOT NULL UNIQUE` to `name TEXT NOT NULL`.
10. Copy all twelve columns by name, including IDs, UIDs, parent IDs, variation labels, nullable values, flags, timestamps, and rest values.
11. Compare source and copied row counts.
12. Drop the legacy `exercises` table.
13. Rename the new table to `exercises`.
14. Recreate the saved explicit indexes and triggers from their catalog SQL.
15. Run `PRAGMA foreign_key_check` and require zero rows.
16. Commit.
17. Restore the connection's original `foreign_keys` value outside the transaction.

If any statement after `BEGIN IMMEDIATE` fails, the worker explicitly rolls back and then restores the original foreign-key setting. SQLite documents that changing `foreign_keys` during a transaction is a no-op, which is why steps 7 and 17 are outside the transaction. See [SQLite PRAGMA foreign_keys](https://www.sqlite.org/pragma.html#pragma_foreign_keys) and [SQLite foreign-key support](https://www.sqlite.org/foreignkeys.html#fk_enable).

Creating the new table before dropping the old one follows SQLite's safe ordering. Renaming the old table first is specifically discouraged because rename propagation can rewrite references in foreign keys, triggers, and views. The DDL and data copy are protected by one explicit transaction; SQLite transactions are atomic, and an application should explicitly roll back after an error to obtain a known state. See [SQLite transactions](https://www.sqlite.org/lang_transaction.html) and [SQLite is transactional](https://www.sqlite.org/transactional.html).

## Proof results

The test proves these behaviors against the populated database:

- all pre-existing table rows compare exactly before and after the rebuild;
- exercise IDs, UIDs, parent/variation links, and every exercise column value are unchanged;
- workout entries, sets, PB events, media, formula overrides, program rows, calendar rows, hard foreign keys, and soft program links are unchanged;
- every schema object other than the `exercises` table definition is byte-for-byte unchanged in the catalog snapshot;
- the explicit unique UID index and parent index are recreated;
- the implicit name autoindex is absent;
- a second exercise with display name `Bench Press` inserts successfully under a different ID and UID;
- `name NOT NULL`, UID uniqueness, tag uniqueness, and foreign-key restrictions still reject invalid writes;
- `PRAGMA foreign_key_check` returns no rows and `PRAGMA integrity_check` returns `ok`;
- a second migration run is a deterministic no-op with identical data and schema;
- injected failures after create, copy, drop, rename, index recreation, and foreign-key check all restore the complete legacy schema and data;
- after each injected failure, foreign-key enforcement is back on, the original name uniqueness still applies, integrity checks pass, and normal writes still work;
- a caller that began with foreign keys disabled gets that setting back after success;
- unsupported table definitions and unproven unique index definitions are rejected before mutation;
- rejection is executed against real SQLite for a `lower(name)` expression index and same-name `idx_exercises_uid` replacements using `WHERE uid IS NOT NULL` and `uid COLLATE NOCASE DESC`;
- each index-drift rejection preserves the exact catalog, all data, every foreign-key definition, foreign-key enforcement, and database integrity.

## Supported input and drift policy

This proof accepts one evidenced legacy table fingerprint: the exact current post-bootstrap `CREATE TABLE exercises` body at the pinned base. It also recognizes the exact target body so reruns are safe.

Existing `runColumnMigrations` calls show that older installations may have acquired `last_rest_seconds`, `parent_exercise_id`, `variation_label`, and `is_pinned` through separate `ALTER TABLE ... ADD COLUMN` statements. SQLite preserves appended column order and original catalog text, so such databases can have a semantically similar but different definition after startup. Those historical fingerprints have not been enumerated with real fixtures in this ticket. The proof deliberately rejects them rather than silently rebuilding an untested shape.

The exact `CREATE TABLE` body matcher in this proof must not be copied blindly into production. MVP-003B must inventory and prove each supported historical post-migration shape, including its column order, defaults, constraints, indexes, and references, before rollout.

Likewise, the proof does not claim support for:

- extra, missing, reordered, renamed, generated, or differently constrained columns;
- `STRICT` or `WITHOUT ROWID` variants;
- every explicit unique index except the exact known `CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid)` catalog definition, including same-name partial, collation, sort-order, or expression variants;
- table-level checks, foreign keys, or other constraints not in the pinned definition;
- dependent view arrangements not present in the pinned schema.

Rejecting these cases is part of the result: a schema that the migration has not proved is left untouched with its original foreign-key setting.

## Production recommendation

Before rollout, collect or construct fixtures for every evidenced historical `exercises` fingerprint that can remain after the existing column migrations. Add each fingerprint explicitly to the validator and run the same preservation, rollback, and duplicate-insert matrix. Do not normalize unknown schemas by inference.

After those fixtures pass, production work should:

1. change both bootstrap DDL and the Drizzle declaration so new databases do not recreate name uniqueness;
2. add a dedicated bootstrap migration worker after existing column normalization and UID backfill, and before final index creation;
3. keep the rebuild in one explicit transaction with `foreign_keys` toggled only outside it;
4. preserve and recreate known explicit schema objects and abort on unproved drift;
5. record completion with an explicit schema version or equivalent deterministic predicate;
6. retain all program tables and all stable ID-based references;
7. update or deprecate name-singular APIs before duplicate names become reachable in product flows.

The final point is required because `getExerciseByName` currently returns the first matching row without an ordering rule, and variation availability calls it as a global name check. `listExercisesByNames` can return multiple rows but consumers may still assume one match per requested name. Removing the storage constraint makes those assumptions visible; stable IDs must be used wherever a single exercise identity is required. This API work is outside the migration proof and must precede or accompany the production rollout.

## Consequences

The spike demonstrates that SQLite can remove only exercise-name uniqueness while preserving the app's ID-based history and program graph, and that a transactional rebuild recovers cleanly at every meaningful stage tested. It also establishes that the pinned new-database shape alone is not enough evidence for a universal migration across historical installations. Production implementation remains blocked on explicit historical-shape coverage and the name-based API audit, rather than on SQLite capability or a new dependency.
