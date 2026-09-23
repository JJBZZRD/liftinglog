import {
  consumeExerciseNavigation,
  getSelectedWorkoutId,
  requestExerciseNavigation,
  setSelectedWorkoutId,
  subscribeWorkoutSelection,
} from '@/lib/workouts/selection-store';

describe('workout to exercise navigation handoff', () => {
  beforeEach(() => {
    consumeExerciseNavigation();
    setSelectedWorkoutId(null);
  });

  it('selects the workout immediately and consumes the destination only once after the return transition', () => {
    const selected: (number | null)[] = [];
    const unsubscribe = subscribeWorkoutSelection(() => selected.push(getSelectedWorkoutId()));
    requestExerciseNavigation(42);
    expect(selected).toEqual([42]);
    expect(getSelectedWorkoutId()).toBe(42);
    // Native stacks can report both the outgoing and incoming transition ending.
    expect(consumeExerciseNavigation()).toBe(42);
    expect(consumeExerciseNavigation()).toBeNull();
    // Consuming a route must not remove the session needed by exercise logging.
    expect(getSelectedWorkoutId()).toBe(42);
    unsubscribe();
  });

  it('uses the latest requested workout if navigation is queued twice before completion', () => {
    requestExerciseNavigation(4);
    requestExerciseNavigation(8);
    expect(consumeExerciseNavigation()).toBe(8);
    expect(getSelectedWorkoutId()).toBe(8);
    expect(consumeExerciseNavigation()).toBeNull();
  });

  it('does not queue tab navigation when ordinary workout selection changes', () => {
    setSelectedWorkoutId(17);
    expect(consumeExerciseNavigation()).toBeNull();
    setSelectedWorkoutId(null);
    expect(getSelectedWorkoutId()).toBeNull();
    expect(consumeExerciseNavigation()).toBeNull();
  });

  it('stops notifying a screen when its workout-selection subscription is removed', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeWorkoutSelection(listener);
    setSelectedWorkoutId(1);
    unsubscribe();
    setSelectedWorkoutId(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
