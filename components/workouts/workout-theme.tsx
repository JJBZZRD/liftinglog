/** Compatibility exports for existing Workouts consumers. */
export { designColors as workoutColors } from '@/lib/design-system/tokens';
export {
  DesignSystemProvider as WorkoutThemeBoundary,
  useDesignSystemTheme as useWorkoutTheme,
} from '@/components/design-system/design-system-provider';
