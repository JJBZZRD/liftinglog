-- Exact fresh-install physical schema produced by e9ee8ed7:lib/db/connection.ts.
CREATE TABLE settings (
  id INTEGER PRIMARY KEY NOT NULL,
  e1rm_formula TEXT NOT NULL,
  unit_preference TEXT NOT NULL,
  theme_preference TEXT NOT NULL DEFAULT 'system'
);
CREATE TABLE exercises (
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
CREATE TABLE workouts (
  id INTEGER PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  note TEXT
);
CREATE TABLE workout_exercises (
  id INTEGER PRIMARY KEY NOT NULL,
  workout_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  order_index INTEGER,
  note TEXT,
  current_weight REAL,
  current_reps INTEGER,
  FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
);
CREATE TABLE sets (
  id INTEGER PRIMARY KEY NOT NULL,
  workout_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  workout_exercise_id INTEGER,
  set_group_id TEXT,
  set_index INTEGER,
  weight_kg REAL,
  reps INTEGER,
  rpe REAL,
  rir REAL,
  is_warmup INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  superset_group_id TEXT,
  performed_at INTEGER,
  FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT,
  FOREIGN KEY(workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE SET NULL
);
CREATE TABLE programs (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER
);
CREATE TABLE program_days (
  id INTEGER PRIMARY KEY NOT NULL,
  program_id INTEGER NOT NULL,
  schedule TEXT NOT NULL,
  day_of_week INTEGER,
  interval_days INTEGER,
  note TEXT,
  FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE CASCADE
);
CREATE TABLE program_exercises (
  id INTEGER PRIMARY KEY NOT NULL,
  program_day_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  order_index INTEGER,
  prescription_json TEXT,
  FOREIGN KEY(program_day_id) REFERENCES program_days(id) ON DELETE CASCADE,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
);
CREATE TABLE progressions (
  id INTEGER PRIMARY KEY NOT NULL,
  program_exercise_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  cadence TEXT NOT NULL,
  cap_kg REAL,
  FOREIGN KEY(program_exercise_id) REFERENCES program_exercises(id) ON DELETE CASCADE
);
CREATE TABLE planned_workouts (
  id INTEGER PRIMARY KEY NOT NULL,
  program_id INTEGER NOT NULL,
  program_day_id INTEGER NOT NULL,
  planned_for INTEGER NOT NULL,
  note TEXT,
  FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE CASCADE,
  FOREIGN KEY(program_day_id) REFERENCES program_days(id) ON DELETE CASCADE
);
CREATE TABLE pr_events (
  id INTEGER PRIMARY KEY NOT NULL,
  set_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  metric_value REAL NOT NULL,
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE CASCADE,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE taggings (
  id INTEGER PRIMARY KEY NOT NULL,
  tag_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE TABLE media (
  id INTEGER PRIMARY KEY NOT NULL,
  local_uri TEXT NOT NULL,
  mime TEXT,
  set_id INTEGER,
  workout_id INTEGER,
  note TEXT,
  created_at INTEGER,
  FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE CASCADE,
  FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);
CREATE TABLE exercise_formula_overrides (
  exercise_id INTEGER PRIMARY KEY NOT NULL,
  e1rm_formula TEXT NOT NULL,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
CREATE INDEX idx_sets_workout_id ON sets(workout_id);
CREATE INDEX idx_sets_exercise_id ON sets(exercise_id);
CREATE INDEX idx_sets_performed_at ON sets(performed_at);
CREATE INDEX idx_sets_group ON sets(set_group_id);
CREATE INDEX idx_sets_exercise_reps ON sets(exercise_id, reps);
CREATE INDEX idx_workout_exercises_order ON workout_exercises(workout_id, order_index);
CREATE INDEX idx_pr_events_exercise_time ON pr_events(exercise_id, occurred_at);
CREATE INDEX idx_planned_workouts_date ON planned_workouts(planned_for);
