let selectedWorkoutId: number | null = null;
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
/** Forget the selection when it points at a workout that no longer exists. */
export function clearSelectedWorkoutIf(id: number) {
  if (selectedWorkoutId === id) setSelectedWorkoutId(null);
}
