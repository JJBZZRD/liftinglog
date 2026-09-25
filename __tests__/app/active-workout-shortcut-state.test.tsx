import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { router } from 'expo-router';
import { useActiveWorkoutShortcut } from '@/features/workouts/hooks/use-active-workout-shortcut';
import type { WorkoutDetail } from '@/features/workouts/workout-types';
import { getWorkoutSessionDetail } from '@/lib/db/workoutSessions';
import { getActiveWorkout, type Workout } from '@/lib/db/workouts';
import { getSelectedWorkoutId, setSelectedWorkoutId } from '@/lib/workouts/selection-store';

let mockFocused = true;
let mockAppStateListener: ((state: string) => void) | null = null;
const mockRemoveAppStateListener = jest.fn();
jest.mock('react-native', () => ({ AppState: {
  currentState: 'active',
  addEventListener: (_event: string, listener: (state: string) => void) => {
    mockAppStateListener = listener;
    return { remove: () => { mockRemoveAppStateListener(); mockAppStateListener = null; } };
  },
} }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => {
      const focused = mockFocused;
      useEffect(() => focused ? callback() : undefined, [callback, focused]);
    },
  };
});
jest.mock('@/lib/db/workouts', () => ({ getActiveWorkout: jest.fn() }));
jest.mock('@/lib/db/workoutSessions', () => ({ getWorkoutSessionDetail: jest.fn() }));

const active = (id = 7): Workout => ({
  id, uid: `workout-${id}`, name: null, startedAt: 1_700_000_000_000,
  completedAt: null, note: null,
});
const detail = (id = 7): WorkoutDetail => ({
  ...active(id), name: 'Workout 2 Tue 14 Nov', exerciseCount: 2, setCount: 6,
  volumeKg: 900, inProgressCount: 1, exercises: [], unassignedSets: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

let shortcut: ReturnType<typeof useActiveWorkoutShortcut>;
let tree: ReturnType<typeof renderer.create> | undefined;
function Harness() { shortcut = useActiveWorkoutShortcut(); return null; }
async function mount() { await act(async () => { tree = renderer.create(<Harness />); }); }
async function focus(focused: boolean) {
  await act(async () => { mockFocused = focused; tree!.update(<Harness />); });
}

describe('active workout library shortcut state', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockFocused = true;
    mockAppStateListener = null;
    setSelectedWorkoutId(null);
    jest.mocked(getActiveWorkout).mockResolvedValue(active());
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail());
  });
  afterEach(async () => {
    await act(async () => { tree?.unmount(); });
    tree = undefined;
  });

  it('uses the canonical active summary even when a historical workout is selected', async () => {
    setSelectedWorkoutId(99);
    await mount();
    expect(getWorkoutSessionDetail).toHaveBeenCalledWith(7);
    expect(shortcut.workout?.name).toBe('Workout 2 Tue 14 Nov');
    expect(getSelectedWorkoutId()).toBe(99);
    await act(async () => { shortcut.openWorkout(); });
    expect(getSelectedWorkoutId()).toBe(7);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout-session/[id]', params: { id: '7' } });
  });

  it('hides when there is no active workout without reading the historical selection', async () => {
    setSelectedWorkoutId(99);
    jest.mocked(getActiveWorkout).mockResolvedValue(null);
    await mount();
    expect(shortcut.workout).toBeNull();
    expect(getWorkoutSessionDetail).not.toHaveBeenCalled();
    await act(async () => { shortcut.openWorkout(); });
    expect(router.push).not.toHaveBeenCalled();
    expect(getSelectedWorkoutId()).toBe(99);
  });

  it.each([
    ['deleted', null],
    ['completed', { ...detail(), completedAt: 123 }],
  ])('hides a workout that was %s before its detail was read', async (_state, result) => {
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(result);
    await mount();
    expect(shortcut.workout).toBeNull();
    await act(async () => { shortcut.openWorkout(); });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('clears on blur and stays hidden until the next active workout finishes loading', async () => {
    await mount();
    await focus(false);
    expect(shortcut.workout).toBeNull();
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
    const next = deferred<Workout | null>();
    jest.mocked(getActiveWorkout).mockReturnValueOnce(next.promise);
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail(8));
    await focus(true);
    expect(shortcut.workout).toBeNull();
    await act(async () => { next.resolve(active(8)); });
    expect(shortcut.workout?.id).toBe(8);
  });

  it('rejects old detail results after blur and a newer focus response', async () => {
    const old = deferred<WorkoutDetail | null>();
    jest.mocked(getWorkoutSessionDetail).mockReturnValueOnce(old.promise);
    await mount();
    await focus(false);
    jest.mocked(getActiveWorkout).mockResolvedValue(active(8));
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail(8));
    await focus(true);
    expect(shortcut.workout?.id).toBe(8);
    await act(async () => { old.resolve(detail()); });
    expect(shortcut.workout?.id).toBe(8);
  });

  it('refreshes on foreground and ignores requests from before backgrounding', async () => {
    const old = deferred<Workout | null>();
    jest.mocked(getActiveWorkout).mockReturnValueOnce(old.promise);
    await mount();
    await act(async () => { mockAppStateListener!('background'); });
    expect(shortcut.workout).toBeNull();
    jest.mocked(getActiveWorkout).mockResolvedValue(active(8));
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail(8));
    await act(async () => { mockAppStateListener!('active'); });
    expect(shortcut.workout?.id).toBe(8);
    await act(async () => { old.resolve(active()); });
    expect(shortcut.workout?.id).toBe(8);
    expect(getWorkoutSessionDetail).not.toHaveBeenCalledWith(7);
  });

  it('opens the currently active workout if it changes before the press', async () => {
    await mount();
    jest.mocked(getActiveWorkout).mockResolvedValue(active(8));
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail(8));
    await act(async () => { shortcut.openWorkout(); });
    expect(getSelectedWorkoutId()).toBe(8);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout-session/[id]', params: { id: '8' } });
  });

  it('does not navigate if the active workout changes during press validation', async () => {
    await mount();
    jest.mocked(getActiveWorkout).mockResolvedValueOnce(active()).mockResolvedValueOnce(active(8));
    await act(async () => { shortcut.openWorkout(); });
    expect(shortcut.workout).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(getSelectedWorkoutId()).toBeNull();
  });

  it('does not navigate when the workout has completed since the shortcut was displayed', async () => {
    await mount();
    jest.mocked(getActiveWorkout).mockResolvedValue(null);
    await act(async () => { shortcut.openWorkout(); });
    expect(shortcut.workout).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('cancels a pending press when the library loses focus', async () => {
    await mount();
    const pressed = deferred<Workout | null>();
    jest.mocked(getActiveWorkout).mockReturnValueOnce(pressed.promise);
    await act(async () => { shortcut.openWorkout(); });
    await focus(false);
    await act(async () => { pressed.resolve(active()); });
    expect(shortcut.workout).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(getSelectedWorkoutId()).toBeNull();
  });

  it('handles read failures and does not let an old rejection hide newer state', async () => {
    const old = deferred<Workout | null>();
    jest.mocked(getActiveWorkout).mockReturnValueOnce(old.promise);
    await mount();
    await focus(false);
    await focus(true);
    await act(async () => { old.reject(new Error('Old DB read failed')); });
    expect(shortcut.workout?.id).toBe(7);
    jest.mocked(getActiveWorkout).mockRejectedValue(new Error('Current DB read failed'));
    await act(async () => { shortcut.openWorkout(); });
    expect(shortcut.workout).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});
