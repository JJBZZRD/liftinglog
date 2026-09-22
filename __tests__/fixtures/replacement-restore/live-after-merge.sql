INSERT INTO settings (
  id,
  e1rm_formula,
  unit_preference,
  theme_preference,
  color_theme,
  show_all_tab_body_part_grouping
) VALUES (1, 'epley', 'kg', 'system', 'default', 1);

INSERT INTO user_checkins (
  id,
  uid,
  recorded_at,
  context,
  bodyweight_kg,
  fatigue_score,
  note,
  source
) VALUES
  (40, 'checkin-40', 1790000000000, 'live-before-restore', 99, 9, 'live value', 'manual'),
  (41, 'live-only-checkin', 1790200000000, 'live-only', 100, 10, 'must disappear', 'manual');

INSERT INTO exercises (
  id,
  uid,
  name,
  muscle_group,
  is_bodyweight,
  is_pinned
) VALUES
  (1, 'exercise-1', 'Bench Press', 'Chest', 0, 0),
  (2, 'exercise-2', 'Deadlift', 'Back', 0, 0),
  (3, 'live-only-exercise', 'Live Only Curl', 'Arms', 0, 0);

INSERT INTO workouts (id, uid, started_at, completed_at, note) VALUES
  (10, NULL, 1790010000000, 1790013600000, NULL),
  (11, NULL, 1790010000000, 1790013600000, NULL),
  (12, 'workout-12', 1790100000000, 1790103600000, 'live changed note'),
  (13, 'merge-duplicate-13', 1790010000000, 1790013600000, NULL),
  (14, 'merge-duplicate-14', 1790010000000, 1790013600000, NULL),
  (15, 'live-only-workout', 1790200000000, 1790203600000, 'must disappear');

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
  (22, 'entry-22', 12, 1, 1, 'live changed entry note', 1790103600000, 1790100000000),
  (23, 'merge-duplicate-entry-23', 13, 1, 1, NULL, 1790013600000, 1790010000000),
  (24, 'merge-duplicate-entry-24', 14, 2, 1, NULL, 1790013600000, 1790010000000),
  (25, 'live-only-entry', 15, 3, 1, 'must disappear', 1790203600000, 1790200000000);

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
  (32, 'set-32', 12, 1, 22, 1, 45, 5, 0, 'live changed set note', 1790100180000),
  (33, 'merge-duplicate-set-33', 13, 1, 23, 1, 55, 5, 1, NULL, 1790010180000),
  (34, 'merge-duplicate-set-34', 14, 2, 24, 1, 130, 5, 1, NULL, 1790010180000),
  (35, 'live-only-set', 15, 3, 25, 1, 25, 10, 0, 'must disappear', 1790200180000);

INSERT INTO pr_events (
  id,
  uid,
  set_id,
  exercise_id,
  type,
  metric_value,
  occurred_at
) VALUES (61, 'live-derived-event', 35, 3, '10rm', 25, 1790200180000);

INSERT INTO psl_programs (id, name, psl_source, is_active, units)
VALUES (99, 'Live-only program', 'program LiveOnly {}', 1, 'kg');

INSERT INTO program_calendar (
  id,
  program_id,
  psl_session_id,
  session_name,
  date_iso,
  sequence,
  status
) VALUES (100, 99, 'live-session', 'Live day', '2026-09-22', 1, 'pending');

INSERT INTO program_calendar_exercises (
  id,
  calendar_id,
  exercise_name,
  exercise_id,
  order_index,
  prescribed_sets_json,
  status,
  workout_exercise_id
) VALUES (101, 100, 'Live Only Curl', 3, 1, '[]', 'complete', 25);

INSERT INTO program_calendar_sets (
  id,
  calendar_exercise_id,
  set_index,
  prescribed_reps,
  actual_weight,
  actual_reps,
  is_user_added,
  is_logged,
  set_id
) VALUES (102, 101, 1, '10', 25, 10, 0, 1, 35);

INSERT INTO tags (id, name) VALUES (72, 'live-only-tag');
INSERT INTO taggings (id, tag_id, target_type, target_id)
VALUES (73, 72, 'set', 35);

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
) VALUES
  (
    80,
    'file:///untrusted/live-changed.mp4',
    'live-changed-asset',
    'video/mp4',
    30,
    10,
    'live changed media',
    1790010180000,
    'same-name.mp4',
    1790010179000,
    4200,
    'Other Album'
  ),
  (
    81,
    'file:///untrusted/live-only.mp4',
    'live-only-asset',
    'video/mp4',
    35,
    15,
    'must disappear',
    1790200180000,
    'candidate-80.mp4',
    1790010179000,
    4200,
    'LiftingLog'
  );

INSERT INTO exercise_formula_overrides (exercise_id, e1rm_formula)
VALUES (3, 'epley');
