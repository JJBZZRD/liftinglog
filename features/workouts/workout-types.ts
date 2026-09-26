import type { getWorkoutSessionDetail, listWorkoutSessionsForDate } from '@/lib/db/workoutSessions';

export type WorkoutSummary = Awaited<ReturnType<typeof listWorkoutSessionsForDate>>[number];
export type WorkoutDetail = NonNullable<Awaited<ReturnType<typeof getWorkoutSessionDetail>>>;
export type WorkoutExercise = WorkoutDetail['exercises'][number];

export function workoutTitle(workout: Pick<WorkoutSummary, 'name'>) {
  return workout.name?.trim() || 'Workout';
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** “Wed 24 Sep”, as in the mockups and default workout names. */
export function dateLabel(date: Date) {
  return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

/** “6:42 PM”. */
export function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const dayMs = 24 * 60 * 60 * 1000;

/** A caption relative to today: “Today”, “Yesterday”, “3 days ago”, or the year for distant dates. */
export function relativeDayLabel(date: Date, today = new Date()) {
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  // Rounding absorbs the hour lost or gained across a daylight-saving change.
  const days = Math.round((startOf(today) - startOf(date)) / dayMs);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days === -1) return 'Tomorrow';
  if (days > 1 && days < 14) return `${days} days ago`;
  if (days < -1 && days > -14) return `In ${-days} days`;
  return date.getFullYear() === today.getFullYear() ? null : String(date.getFullYear());
}

const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

/**
 * Confirmation copy for deleting a workout. An in-progress workout with no sets is
 * discarded rather than deleted, because nothing has been recorded yet.
 */
export function deleteWorkoutCopy(workout: Pick<WorkoutSummary, 'name' | 'completedAt' | 'exerciseCount' | 'setCount'>) {
  if (workout.completedAt === null && workout.setCount === 0) {
    return { title: 'Discard workout?', message: 'Nothing has been logged in this workout yet. It will be removed.', emphasis: undefined, confirmLabel: 'Discard' };
  }
  return {
    title: `Delete ${workoutTitle(workout)}?`,
    message: workout.setCount === 0
      ? 'This workout has no logged sets. It will be removed from your history.'
      : `${count(workout.exerciseCount, 'exercise')} and ${count(workout.setCount, 'set')} will be deleted. PBs set in this workout will be recalculated. Videos stay in your gallery.`,
    emphasis: 'This can’t be undone.',
    confirmLabel: 'Delete',
  };
}

/** How long a workout has been running: “just started”, “12 min”, “1 h 5 min”, or its start day once it passes a day. */
export function elapsedLabel(startedAt: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60000));
  if (minutes < 1) return 'just started';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return `since ${dateLabel(new Date(startedAt))}`;
}
