-- 39cc234 fresh-install layout after 76c70e2 appended variation columns.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE __fixture_exercises (
  id INTEGER PRIMARY KEY NOT NULL,
  uid TEXT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  muscle_group TEXT,
  equipment TEXT,
  is_bodyweight INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  last_rest_seconds INTEGER,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  parent_exercise_id INTEGER,
  variation_label TEXT
);

INSERT INTO __fixture_exercises (
  id, uid, name, description, muscle_group, equipment, is_bodyweight,
  created_at, last_rest_seconds, is_pinned, parent_exercise_id, variation_label
)
SELECT
  id, uid, name, description, muscle_group, equipment, is_bodyweight,
  created_at, last_rest_seconds, is_pinned, parent_exercise_id, variation_label
FROM exercises;

DROP TABLE exercises;
ALTER TABLE __fixture_exercises RENAME TO exercises;
CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid);
CREATE INDEX idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);

COMMIT;
PRAGMA foreign_keys = ON;
