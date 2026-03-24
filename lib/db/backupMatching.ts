interface HasId {
  id: number;
}

interface BackupWorkoutMatchInput {
  completed_at: number | null;
  note: string | null;
}

interface WorkoutCandidate extends HasId {
  completed_at: number | null;
  note: string | null;
}

interface BackupWorkoutExerciseMatchInput {
  order_index: number | null;
  note: string | null;
  completed_at: number | null;
  performed_at: number | null;
}

interface WorkoutExerciseCandidate extends HasId {
  order_index: number | null;
  note: string | null;
  completed_at: number | null;
  performed_at: number | null;
}

interface BackupSetMatchInput {
  workout_exercise_id: number | null;
  set_group_id: string | null;
  set_index: number | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  is_warmup: number;
  note: string | null;
  superset_group_id: string | null;
  performed_at: number | null;
}

interface SetCandidate extends HasId {
  workout_exercise_id: number | null;
  set_group_id: string | null;
  set_index: number | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  is_warmup: number;
  note: string | null;
  superset_group_id: string | null;
  performed_at: number | null;
}

interface BackupMediaMatchInput {
  asset_id: string | null;
  local_uri: string;
  original_filename: string | null;
  media_created_at: number | null;
  duration_ms: number | null;
  album_name: string | null;
  note: string | null;
}

interface MediaCandidate extends HasId {
  asset_id: string | null;
  local_uri: string;
  original_filename: string | null;
  media_created_at: number | null;
  duration_ms: number | null;
  album_name: string | null;
  note: string | null;
}

function preferMatchingCandidates<T>(
  candidates: T[],
  value: string | number | null | undefined,
  selector: (candidate: T) => string | number | null
): T[] {
  if (value === null || value === undefined) {
    return candidates;
  }

  const matches = candidates.filter((candidate) => selector(candidate) === value);
  return matches.length > 0 ? matches : candidates;
}

export function pickMatchingWorkoutId(
  row: BackupWorkoutMatchInput,
  candidates: WorkoutCandidate[]
): number | null {
  let remaining = candidates;

  remaining = preferMatchingCandidates(remaining, row.completed_at, (candidate) => candidate.completed_at);
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.note, (candidate) => candidate.note);
  }

  return remaining.length === 1 ? remaining[0].id : null;
}

export function pickMatchingWorkoutExerciseId(
  row: BackupWorkoutExerciseMatchInput,
  candidates: WorkoutExerciseCandidate[]
): number | null {
  let remaining = candidates;

  remaining = preferMatchingCandidates(remaining, row.order_index, (candidate) => candidate.order_index);
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.performed_at, (candidate) => candidate.performed_at);
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.completed_at, (candidate) => candidate.completed_at);
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.note, (candidate) => candidate.note);
  }

  return remaining.length === 1 ? remaining[0].id : null;
}

export function pickMatchingSetId(
  row: BackupSetMatchInput,
  candidates: SetCandidate[]
): number | null {
  let remaining = candidates;

  remaining = preferMatchingCandidates(
    remaining,
    row.workout_exercise_id,
    (candidate) => candidate.workout_exercise_id
  );
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.set_index, (candidate) => candidate.set_index);
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.performed_at, (candidate) => candidate.performed_at);
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.is_warmup, (candidate) => candidate.is_warmup);
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(
      remaining,
      row.set_group_id,
      (candidate) => candidate.set_group_id
    );
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(
      remaining,
      row.superset_group_id,
      (candidate) => candidate.superset_group_id
    );
  }

  if (remaining.length > 1 && row.set_index === null) {
    remaining = preferMatchingCandidates(remaining, row.weight_kg, (candidate) => candidate.weight_kg);
  }
  if (remaining.length > 1 && row.set_index === null) {
    remaining = preferMatchingCandidates(remaining, row.reps, (candidate) => candidate.reps);
  }
  if (remaining.length > 1 && row.set_index === null) {
    remaining = preferMatchingCandidates(remaining, row.rpe, (candidate) => candidate.rpe);
  }
  if (remaining.length > 1 && row.set_index === null) {
    remaining = preferMatchingCandidates(remaining, row.rir, (candidate) => candidate.rir);
  }
  if (remaining.length > 1 && row.set_index === null) {
    remaining = preferMatchingCandidates(remaining, row.note, (candidate) => candidate.note);
  }

  return remaining.length === 1 ? remaining[0].id : null;
}

export function pickMatchingMediaId(
  row: BackupMediaMatchInput,
  candidates: MediaCandidate[]
): number | null {
  let remaining = candidates;

  remaining = preferMatchingCandidates(remaining, row.asset_id, (candidate) => candidate.asset_id);
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(
      remaining,
      row.original_filename,
      (candidate) => candidate.original_filename
    );
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(
      remaining,
      row.media_created_at,
      (candidate) => candidate.media_created_at
    );
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(
      remaining,
      row.duration_ms,
      (candidate) => candidate.duration_ms
    );
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.album_name, (candidate) => candidate.album_name);
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.local_uri, (candidate) => candidate.local_uri);
  }
  if (remaining.length > 1) {
    remaining = preferMatchingCandidates(remaining, row.note, (candidate) => candidate.note);
  }

  return remaining.length === 1 ? remaining[0].id : null;
}
