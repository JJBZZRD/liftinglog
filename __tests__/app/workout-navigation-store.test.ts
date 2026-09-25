import {
  getSelectedWorkoutId,
  setSelectedWorkoutId,
  subscribeWorkoutSelection,
} from '@/lib/workouts/selection-store';

describe('workout selection', () => {
  beforeEach(() => {
    setSelectedWorkoutId(null);
  });

  it('selects the workout immediately for exercise logging', () => {
    const selected: (number | null)[] = [];
    const unsubscribe = subscribeWorkoutSelection(() => selected.push(getSelectedWorkoutId()));
    setSelectedWorkoutId(42);
    expect(selected).toEqual([42]);
    expect(getSelectedWorkoutId()).toBe(42);
    unsubscribe();
  });

  it('uses the latest selected workout', () => {
    setSelectedWorkoutId(4);
    setSelectedWorkoutId(8);
    expect(getSelectedWorkoutId()).toBe(8);
  });

  it('clears the selected workout', () => {
    setSelectedWorkoutId(17);
    setSelectedWorkoutId(null);
    expect(getSelectedWorkoutId()).toBeNull();
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
