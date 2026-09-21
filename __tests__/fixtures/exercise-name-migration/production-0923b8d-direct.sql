-- Exact 0923b8d fresh-install layout before a direct jump to current migrations.
-- Production bootstrap must append parent/variation, then uid, in the evidenced order.
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
  is_pinned INTEGER NOT NULL DEFAULT 0
);

INSERT INTO __fixture_exercises (
  id, name, description, muscle_group, equipment, is_bodyweight, created_at,
  last_rest_seconds, is_pinned
)
SELECT
  id, name, description, muscle_group, equipment, is_bodyweight, created_at,
  last_rest_seconds, is_pinned
FROM exercises;

DROP TABLE exercises;
ALTER TABLE __fixture_exercises RENAME TO exercises;

COMMIT;
PRAGMA foreign_keys = ON;
