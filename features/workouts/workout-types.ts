import type { getWorkoutSessionDetail, listWorkoutSessionsForDate } from '@/lib/db/workoutSessions';

export type WorkoutSummary = Awaited<ReturnType<typeof listWorkoutSessionsForDate>>[number];
export type WorkoutDetail = NonNullable<Awaited<ReturnType<typeof getWorkoutSessionDetail>>>;
export type WorkoutExercise = WorkoutDetail['exercises'][number];

export function workoutTitle(workout: Pick<WorkoutSummary, 'name'>) {
  return workout.name?.trim() || 'Workout';
}

export function dateLabel(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
