PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  id INTEGER PRIMARY KEY NOT NULL,
  e1rm_formula TEXT NOT NULL DEFAULT 'epley',
  unit_preference TEXT NOT NULL DEFAULT 'kg',
  theme_preference TEXT NOT NULL DEFAULT 'system',
  color_theme TEXT NOT NULL DEFAULT 'default',
  show_all_tab_body_part_grouping INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE user_checkins (
  id INTEGER PRIMARY KEY NOT NULL,
  uid TEXT,
  recorded_at INTEGER NOT NULL,
  context TEXT,
  bodyweight_kg REAL,
  waist_cm REAL,
  sleep_start_at INTEGER,
  sleep_end_at INTEGER,
  sleep_hours REAL,
  resting_hr_bpm INTEGER,
  fatigue_score INTEGER,
  soreness_score INTEGER,
  stress_score INTEGER,
  steps INTEGER,
  note TEXT,
  source TEXT
);

-- Exact post-bootstrap legacy shape at pinned base 5892c323.
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY NOT NULL,
  uid TEXT,
  name TEXT NOT NULL UNIQUE,
  parent_exercise_id INTEGER,
  variation_label TEXT,
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
  uid TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  note TEXT
);

CREATE TABLE workout_exercises (
  id INTEGER PRIMARY KEY NOT NULL,
  uid TEXT,
  workout_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  order_index INTEGER,
  note TEXT,
  current_weight REAL,
  current_reps INTEGER,
  completed_at INTEGER,
  performed_at INTEGER,
  FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
);

CREATE TABLE sets (
  id INTEGER PRIMARY KEY NOT NULL,
  uid TEXT,
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

CREATE TABLE psl_programs (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  psl_source TEXT NOT NULL,
  compiled_hash TEXT,
  percent_intensity_config_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  units TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE program_calendar (
  id INTEGER PRIMARY KEY NOT NULL,
  program_id INTEGER NOT NULL,
  psl_session_id TEXT NOT NULL,
  session_name TEXT NOT NULL,
  date_iso TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at INTEGER,
  completion_override_exercise_ids_json TEXT,
  FOREIGN KEY(program_id) REFERENCES psl_programs(id) ON DELETE CASCADE
);

CREATE TABLE program_calendar_exercises (
  id INTEGER PRIMARY KEY NOT NULL,
  calendar_id INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  exercise_id INTEGER,
  order_index INTEGER NOT NULL,
  prescribed_sets_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  workout_exercise_id INTEGER,
  FOREIGN KEY(calendar_id) REFERENCES program_calendar(id) ON DELETE CASCADE,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
);

CREATE TABLE program_calendar_sets (
  id INTEGER PRIMARY KEY NOT NULL,
  calendar_exercise_id INTEGER NOT NULL,
  set_index INTEGER NOT NULL,
  prescribed_reps TEXT,
  prescribed_intensity_json TEXT,
  prescribed_role TEXT,
  actual_weight REAL,
  actual_reps INTEGER,
  actual_rpe REAL,
  is_user_added INTEGER NOT NULL DEFAULT 0,
  is_logged INTEGER NOT NULL DEFAULT 0,
  set_id INTEGER,
  logged_at INTEGER,
  FOREIGN KEY(calendar_exercise_id) REFERENCES program_calendar_exercises(id) ON DELETE CASCADE,
  FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE SET NULL
);

CREATE TABLE pr_events (
  id INTEGER PRIMARY KEY NOT NULL,
  uid TEXT,
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
  asset_id TEXT,
  mime TEXT,
  set_id INTEGER,
  workout_id INTEGER,
  note TEXT,
  created_at INTEGER,
  original_filename TEXT,
  media_created_at INTEGER,
  duration_ms INTEGER,
  album_name TEXT,
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
CREATE INDEX idx_sets_workout_exercise_id ON sets(workout_exercise_id);
CREATE INDEX idx_user_checkins_recorded_at ON user_checkins(recorded_at);
CREATE INDEX idx_workout_exercises_order ON workout_exercises(workout_id, order_index);
CREATE INDEX idx_pr_events_exercise_time ON pr_events(exercise_id, occurred_at);
CREATE INDEX idx_program_calendar_date ON program_calendar(date_iso);
CREATE INDEX idx_program_calendar_program ON program_calendar(program_id);
CREATE INDEX idx_program_calendar_exercises_cal ON program_calendar_exercises(calendar_id);
CREATE INDEX idx_program_calendar_sets_exercise ON program_calendar_sets(calendar_exercise_id);
CREATE UNIQUE INDEX idx_exercises_uid ON exercises(uid);
CREATE INDEX idx_exercises_parent_exercise_id ON exercises(parent_exercise_id);

INSERT INTO settings (
  id, e1rm_formula, unit_preference, theme_preference, color_theme,
  show_all_tab_body_part_grouping
) VALUES (1, 'brzycki', 'kg', 'dark', 'ocean', 0);

INSERT INTO user_checkins (
  id, uid, recorded_at, context, bodyweight_kg, waist_cm, sleep_start_at,
  sleep_end_at, sleep_hours, resting_hr_bpm, fatigue_score, soreness_score,
  stress_score, steps, note, source
) VALUES (
  1, 'checkin-uid-1', 1735603200000, 'morning', 82.35, 84.2, 1735567200000,
  1735594200000, 7.5, 54, 3, 2, 4, 9876, 'fixture check-in', 'manual'
);

INSERT INTO exercises (
  id, uid, name, parent_exercise_id, variation_label, description, muscle_group,
  equipment, is_bodyweight, created_at, last_rest_seconds, is_pinned
) VALUES
  (10, 'exercise-parent-uid', 'Bench Press', NULL, NULL, 'barbell parent', 'chest', 'barbell', 0, 1700000000010, 180, 1),
  (11, 'exercise-variation-uid', 'Bench Press (Tempo)', 10, 'Tempo', 'three-second eccentric', 'chest', 'barbell', 0, 1700000000011, 150, 0),
  (20, 'exercise-bodyweight-uid', 'Pull Up', NULL, NULL, 'strict pull-up', 'back', 'pull-up bar', 1, 1700000000020, 120, 1);

INSERT INTO workouts (id, uid, started_at, completed_at, note)
VALUES (100, 'workout-uid-100', 1735689600000, 1735693200000, 'fixture workout');

INSERT INTO workout_exercises (
  id, uid, workout_id, exercise_id, order_index, note, current_weight,
  current_reps, completed_at, performed_at
) VALUES (
  200, 'workout-exercise-uid-200', 100, 11, 2, 'tempo work', 87.5,
  5, 1735693000000, 1735692000000
);

INSERT INTO sets (
  id, uid, workout_id, exercise_id, workout_exercise_id, set_group_id, set_index,
  weight_kg, reps, rpe, rir, is_warmup, note, superset_group_id, performed_at
) VALUES (
  300, 'set-uid-300', 100, 11, 200, 'working-a', 3,
  87.5, 5, 8.5, 1.5, 0, 'preserved set', 'superset-x', 1735692100000
);

INSERT INTO psl_programs (
  id, name, description, psl_source, compiled_hash, percent_intensity_config_json,
  is_active, start_date, end_date, units, created_at, updated_at
) VALUES (
  600, 'Migration Fixture Program', 'retained program definition',
  'program "Migration Fixture Program" { week 1 { day "A" { Bench Press (Tempo): 1x5 } } }',
  'fixture-hash', '{"Bench Press (Tempo)":{"formula":"brzycki"}}',
  1, '2025-01-01', '2025-01-31', 'kg', 1735600000000, 1735601000000
);

INSERT INTO program_calendar (
  id, program_id, psl_session_id, session_name, date_iso, sequence, status,
  completed_at, completion_override_exercise_ids_json
) VALUES (
  700, 600, 'week1-dayA', 'Day A', '2025-01-01', 1, 'complete',
  1735693000000, '[11]'
);

INSERT INTO program_calendar_exercises (
  id, calendar_id, exercise_name, exercise_id, order_index, prescribed_sets_json,
  status, workout_exercise_id
) VALUES (
  800, 700, 'Bench Press (Tempo)', 11, 0,
  '[{"reps":"5","intensity":{"type":"weight","value":87.5}}]',
  'complete', 200
);

INSERT INTO program_calendar_sets (
  id, calendar_exercise_id, set_index, prescribed_reps, prescribed_intensity_json,
  prescribed_role, actual_weight, actual_reps, actual_rpe, is_user_added,
  is_logged, set_id, logged_at
) VALUES (
  900, 800, 0, '5', '{"type":"weight","value":87.5}', 'work',
  87.5, 5, 8.5, 0, 1, 300, 1735692100000
);

INSERT INTO pr_events (
  id, uid, set_id, exercise_id, type, metric_value, occurred_at
) VALUES (400, 'pr-event-uid-400', 300, 11, '5rm', 87.5, 1735692100000);

INSERT INTO media (
  id, local_uri, asset_id, mime, set_id, workout_id, note, created_at,
  original_filename, media_created_at, duration_ms, album_name
) VALUES (
  500, 'file:///fixture/tempo-set.mp4', 'asset-fixture-500', 'video/mp4', 300, 100,
  'side angle', 1735692200000, 'tempo-set.mp4', 1735692150000, 18400, 'Workout Log'
);

INSERT INTO exercise_formula_overrides (exercise_id, e1rm_formula)
VALUES (11, 'wathan');

INSERT INTO tags (id, name) VALUES (1, 'strength');
INSERT INTO taggings (id, tag_id, target_type, target_id)
VALUES (1, 1, 'exercise', 11);
