-- 76c70e2/0f25ee6 fresh-install exercises layout, after normal bootstrap indexes.
-- The extra non-unique index, trigger, and unrelated view exercise catalog preservation.
CREATE INDEX idx_exercises_name_lookup ON exercises(name);

CREATE TRIGGER trg_exercises_nonblank_name
BEFORE INSERT ON exercises
WHEN length(NEW.name) = 0
BEGIN
  SELECT RAISE(ABORT, 'exercise name must not be blank');
END;

CREATE VIEW fixture_completed_workouts AS
SELECT id, completed_at FROM workouts WHERE completed_at IS NOT NULL;
