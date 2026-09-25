/** The Epley estimate used by exercise-history session highlights. */
export function calculateE1RM(weight: number | null, reps: number | null): number {
  if (weight === null || reps === null || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + 0.0333 * reps);
}
