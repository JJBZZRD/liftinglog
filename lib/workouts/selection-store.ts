let selectedWorkoutId: number | null = null;
let pendingExerciseNavigation: number | null = null;
const listeners = new Set<() => void>();

export const getSelectedWorkoutId = () => selectedWorkoutId;
export function setSelectedWorkoutId(id: number | null) {
  selectedWorkoutId = id;
  listeners.forEach((listener) => listener());
}
export function subscribeWorkoutSelection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The root stack consumes this only after the return animation has finished. */
export function requestExerciseNavigation(workoutId: number) {
  setSelectedWorkoutId(workoutId);
  pendingExerciseNavigation = workoutId;
}
export function consumeExerciseNavigation() {
  const workoutId = pendingExerciseNavigation;
  pendingExerciseNavigation = null;
  return workoutId;
}
