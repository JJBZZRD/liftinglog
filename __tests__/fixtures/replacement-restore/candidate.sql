CREATE TABLE programs (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);

INSERT INTO programs (id, name) VALUES (900, 'Known obsolete table');

INSERT INTO settings (
  id,
  e1rm_formula,
  unit_preference,
  theme_preference,
  color_theme,
  show_all_tab_body_part_grouping
) VALUES (1, 'brzycki', 'lb', 'dark', 'ocean', 0);

INSERT INTO user_checkins (
  id,
  uid,
  recorded_at,
  context,
  bodyweight_kg,
  fatigue_score,
  note,
  source
) VALUES (40, 'checkin-40', 1790000000000, 'restored', 82.5, 3, 'candidate health note', 'manual');

INSERT INTO exercises (
  id,
  uid,
  name,
  muscle_group,
  is_bodyweight,
  is_pinned
) VALUES
  (1, 'exercise-1', 'Bench Press', 'Chest', 0, 1),
  (2, 'exercise-2', 'Deadlift', 'Back', 0, 0);

-- These two workout envelopes deliberately have the same legacy matching fields.
-- A merge cannot decide which UID-less row is which; replacement must keep both IDs.
INSERT INTO workouts (id, uid, started_at, completed_at, note) VALUES
  (10, NULL, 1790010000000, 1790013600000, NULL),
  (11, NULL, 1790010000000, 1790013600000, NULL),
  (12, 'workout-12', 1790100000000, 1790103600000, 'candidate workout note');

INSERT INTO workout_exercises (
  id,
  uid,
  workout_id,
  exercise_id,
  order_index,
  note,
  completed_at,
  performed_at
) VALUES
  (20, NULL, 10, 1, 1, NULL, 1790013600000, 1790010000000),
  (21, NULL, 11, 2, 1, NULL, 1790013600000, 1790010000000),
  (22, 'entry-22', 12, 1, 1, 'candidate entry note', 1790103600000, 1790100000000);

INSERT INTO sets (
  id,
  uid,
  workout_id,
  exercise_id,
  workout_exercise_id,
  set_index,
  weight_kg,
  reps,
  is_warmup,
  note,
  performed_at
) VALUES
  (30, NULL, 10, 1, 20, 1, 55, 5, 1, NULL, 1790010180000),
  (31, NULL, 11, 2, 21, 1, 130, 5, 1, NULL, 1790010180000),
  (32, 'set-32', 12, 1, 22, 1, 60, 5, 0, 'candidate set note', 1790100180000);

-- This row is intentionally wrong. Replacement must derive PB events from sets.
INSERT INTO pr_events (
  id,
  uid,
  set_id,
  exercise_id,
  type,
  metric_value,
  occurred_at
) VALUES (60, 'stale-derived-event', 30, 1, '5rm', 999, 1790010180000);

INSERT INTO psl_programs (
  id,
  name,
  description,
  psl_source,
  compiled_hash,
  percent_intensity_config_json,
  is_active,
  start_date,
  end_date,
  units,
  created_at,
  updated_at
) VALUES (
  50,
  'Candidate program',
  'replacement fixture',
  'program Candidate {}',
  'candidate-hash',
  '{"trainingMax":100}',
  1,
  '2026-09-21',
  '2026-10-21',
  'lb',
  1790000000000,
  1790000000000
);

INSERT INTO program_calendar (
  id,
  program_id,
  psl_session_id,
  session_name,
  date_iso,
  sequence,
  status,
  completed_at,
  completion_override_exercise_ids_json
) VALUES (51, 50, 'session-a', 'Candidate day', '2026-09-21', 1, 'complete', 1790013600000, '[1]');

INSERT INTO program_calendar_exercises (
  id,
  calendar_id,
  exercise_name,
  exercise_id,
  order_index,
  prescribed_sets_json,
  status,
  workout_exercise_id
) VALUES (52, 51, 'Bench Press', 1, 1, '[]', 'complete', 20);

INSERT INTO program_calendar_sets (
  id,
  calendar_exercise_id,
  set_index,
  prescribed_reps,
  actual_weight,
  actual_reps,
  is_user_added,
  is_logged,
  set_id,
  logged_at
) VALUES (53, 52, 1, '5', 55, 5, 0, 1, 30, 1790010180000);

INSERT INTO tags (id, name) VALUES (70, 'candidate-tag');
INSERT INTO taggings (id, tag_id, target_type, target_id)
VALUES (71, 70, 'set', 30);

INSERT INTO media (
  id,
  local_uri,
  asset_id,
  mime,
  set_id,
  workout_id,
  note,
  created_at,
  original_filename,
  media_created_at,
  duration_ms,
  album_name
) VALUES (
  80,
  'file:///data/user/0/com.anonymous.LiftingLog/files/videos/candidate-80.mp4',
  'candidate-asset-80',
  'video/mp4',
  30,
  10,
  'candidate media note',
  1790010180000,
  'candidate-80.mp4',
  1790010179000,
  4200,
  'LiftingLog'
);

INSERT INTO exercise_formula_overrides (exercise_id, e1rm_formula)
VALUES (1, 'wathan');
