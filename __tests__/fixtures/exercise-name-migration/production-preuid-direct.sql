-- a97acf7 layout after a direct jump to the current column migrations.
-- uid is present but null here so production backfill runs before the rebuild.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE __fixture_exercises (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  muscle_group TEXT,
  equipment TEXT,
  is_bodyweight INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  last_rest_seconds INTEGER,
  parent_exercise_id INTEGER,
  variation_label TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  uid TEXT
);

INSERT INTO __fixture_exercises (
  id, name, description, muscle_group, equipment, is_bodyweight, created_at,
  last_rest_seconds, parent_exercise_id, variation_label, is_pinned, uid
)
SELECT
  id, name, description, muscle_group, equipment, is_bodyweight, created_at,
  last_rest_seconds, parent_exercise_id, variation_label, is_pinned, NULL
FROM exercises;

DROP TABLE exercises;
ALTER TABLE __fixture_exercises RENAME TO exercises;

COMMIT;
PRAGMA foreign_keys = ON;
