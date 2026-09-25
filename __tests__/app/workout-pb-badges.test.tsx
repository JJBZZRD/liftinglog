import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useWindowDimensions } from 'react-native';
import SetItem from '@/components/lists/SetItem';
import { WorkoutExerciseEntry, WorkoutSetRow } from '@/features/workouts/components/workout-exercise-entry';
import { useWorkoutCurrentPBBadges } from '@/features/workouts/hooks/use-workout-current-pb-badges';
import { loadWorkoutCurrentPBBadges } from '@/features/workouts/workout-pb-badges';
import type { WorkoutDetail, WorkoutExercise } from '@/features/workouts/workout-types';
import { getExerciseScopeIdsForView } from '@/lib/db/exercises';
import { getCurrentPBEventsForExercise, type PBEvent } from '@/lib/db/pbEvents';
import type { SetRow } from '@/lib/db/workouts';

type TestNode = { type: unknown; props: Record<string, unknown> };
let mockUnitPreference: 'kg' | 'lb' = 'kg';

jest.mock('@/lib/db/exercises', () => ({ getExerciseScopeIdsForView: jest.fn() }));
jest.mock('@/lib/db/pbEvents', () => ({ getCurrentPBEventsForExercise: jest.fn() }));
jest.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  useWindowDimensions: jest.fn(() => ({ width: 448, height: 998, scale: 3, fontScale: 1 })),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('react-native-reanimated', () => {
  const animation = { duration: () => animation, delay: () => animation, reduceMotion: () => animation };
  return { __esModule: true, default: { View: 'View' }, FadeInDown: animation, LinearTransition: animation, ReduceMotion: { System: 'system' } };
});
jest.mock('@/lib/contexts/UnitPreferenceContext', () => ({ useUnitPreference: () => ({ unitPreference: mockUnitPreference }) }));
jest.mock('@/lib/theme/ThemeContext', () => ({ useTheme: () => ({ rawColors: {
  foreground: '#14202C', foregroundSecondary: '#53606C', foregroundMuted: '#78838D',
  surface: '#FFFFFF', surfaceSecondary: '#EAEFF4', border: '#DCE3E8', borderLight: '#EDF1F4', pbGold: '#C88730', primary: '#475569',
} }) }));

function set(id: number, exerciseId: number, patch: Partial<SetRow> = {}): SetRow {
  return {
    id, uid: `set-${id}`, workoutId: 1, exerciseId, workoutExerciseId: exerciseId,
    setGroupId: null, setIndex: 0, weightKg: 120, reps: 5, rpe: null, rir: null,
    isWarmup: false, note: null, supersetGroupId: null, performedAt: 1_700_000_000_000,
    ...patch,
  };
}
function entry(exerciseId: number, sets: SetRow[], id = exerciseId): WorkoutExercise {
  return { id, exerciseId, exerciseName: `Exercise ${exerciseId}`, completedAt: 123, performedAt: 123, note: null, sets };
}
function workout(exercises: WorkoutExercise[], unassignedSets: WorkoutDetail['unassignedSets'] = []): WorkoutDetail {
  return {
    id: 1, name: 'Upper body', startedAt: 123, completedAt: null, note: null,
    exerciseCount: exercises.length, setCount: 0, volumeKg: 0, inProgressCount: 0,
    exercises, unassignedSets,
  };
}
function event(setId: number, exerciseId: number, type = '5rm'): PBEvent {
  return { id: setId, uid: `pb-${setId}`, setId, exerciseId, type, metricValue: 120, occurredAt: 123 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnitPreference = 'kg';
  jest.mocked(useWindowDimensions).mockReturnValue({ width: 448, height: 998, scale: 3, fontScale: 1 });
  jest.mocked(getExerciseScopeIdsForView).mockImplementation(async (id) => [id]);
  jest.mocked(getCurrentPBEventsForExercise).mockResolvedValue(new Map());
});

describe('workout current PB matching', () => {
  it('queries unrelated exercises independently and shares reads across repeated entries', async () => {
    jest.mocked(getCurrentPBEventsForExercise).mockImplementation(async (scope) => {
      expect(Array.isArray(scope)).toBe(true);
      return (scope as number[])[0] === 1
        ? new Map([[11, event(11, 1)]])
        : new Map([[21, event(21, 2)]]);
    });
    const badges = await loadWorkoutCurrentPBBadges(workout([
      entry(1, [set(10, 1), set(11, 1)]), entry(1, [set(12, 1)], 3), entry(2, [set(21, 2)]),
    ]));
    expect(getExerciseScopeIdsForView).toHaveBeenCalledTimes(2);
    expect(getCurrentPBEventsForExercise).toHaveBeenCalledTimes(2);
    expect(getCurrentPBEventsForExercise).toHaveBeenCalledWith([1]);
    expect(getCurrentPBEventsForExercise).toHaveBeenCalledWith([2]);
    expect(badges).toEqual(new Map([[11, '5RM'], [21, '5RM']]));
    expect(badges.has(10)).toBe(false); // Matching values or a former record do not establish a current PB.
    expect(badges.has(12)).toBe(false);
  });

  it('uses family PBs for a parent and concrete PBs for a variation, like HistoryTab', async () => {
    jest.mocked(getExerciseScopeIdsForView).mockImplementation(async (id) => id === 1 ? [1, 3, 4] : [3]);
    jest.mocked(getCurrentPBEventsForExercise).mockImplementation(async (scope) => (
      (scope as number[]).length > 1
        ? new Map([[99, event(99, 4)], [11, event(11, 1, '8rm')]])
        : new Map([[30, event(30, 3)]])
    ));
    const badges = await loadWorkoutCurrentPBBadges(workout([
      entry(1, [set(10, 1), set(11, 1)]), entry(3, [set(30, 3)]),
    ]));
    expect(getCurrentPBEventsForExercise).toHaveBeenCalledWith([1, 3, 4]);
    expect(getCurrentPBEventsForExercise).toHaveBeenCalledWith([3]);
    expect(badges).toEqual(new Map([[11, '8RM'], [30, '5RM']]));
    expect(badges.has(99)).toBe(false); // A PB elsewhere in the family is not a set in this workout.
  });

  it('includes legacy recorded sets and never assigns badges to planned placeholders', async () => {
    jest.mocked(getCurrentPBEventsForExercise).mockResolvedValue(new Map([
      [81, event(81, 8)], [90, event(90, 9)],
    ]));
    const badges = await loadWorkoutCurrentPBBadges(workout([
      entry(9, [set(90, 9, { note: '[PLANNED] 5 reps' })]),
    ], [{ ...set(81, 8, { workoutExerciseId: null, weightKg: 0 }), exerciseName: 'Bodyweight' }]));
    expect(getExerciseScopeIdsForView).toHaveBeenCalledTimes(1);
    expect(getExerciseScopeIdsForView).toHaveBeenCalledWith(8);
    expect(badges).toEqual(new Map([[81, '5RM']])); // The read API remains authoritative; no local PB calculation.
  });

  it('skips empty sessions and missing exercise scopes', async () => {
    expect(await loadWorkoutCurrentPBBadges(workout([]))).toEqual(new Map());
    expect(getExerciseScopeIdsForView).not.toHaveBeenCalled();
    jest.mocked(getExerciseScopeIdsForView).mockResolvedValue([]);
    expect(await loadWorkoutCurrentPBBadges(workout([entry(9, [set(90, 9)])]))).toEqual(new Map());
    expect(getCurrentPBEventsForExercise).not.toHaveBeenCalled();
  });
});

describe('workout PB badge refresh', () => {
  let state: ReturnType<typeof useWorkoutCurrentPBBadges>;
  let tree: ReturnType<typeof renderer.create>;
  function Harness({ detail }: { detail: WorkoutDetail | null }) {
    state = useWorkoutCurrentPBBadges(detail);
    return null;
  }
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

  it('does not let an older workout response overwrite newer badges', async () => {
    let finishOld!: (value: Map<number, PBEvent>) => void;
    jest.mocked(getCurrentPBEventsForExercise)
      .mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce(new Map([[20, event(20, 2)]]));
    await act(async () => { tree = renderer.create(<Harness detail={workout([entry(1, [set(10, 1)])])} />); });
    await act(async () => { tree.update(<Harness detail={workout([entry(2, [set(20, 2)])])} />); });
    expect(state.pbBadges).toEqual(new Map([[20, '5RM']]));
    await act(async () => { finishOld(new Map([[10, event(10, 1)]])); });
    expect(state.pbBadges).toEqual(new Map([[20, '5RM']]));
    await act(async () => { tree.update(<Harness detail={null} />); });
    expect(state.pbBadges.size).toBe(0);
  });

  it('refreshes current records when the same workout is reloaded and reports read failures', async () => {
    const detail = workout([entry(1, [set(10, 1)])]);
    jest.mocked(getCurrentPBEventsForExercise).mockResolvedValueOnce(new Map([[10, event(10, 1)]]));
    await act(async () => { tree = renderer.create(<Harness detail={detail} />); });
    expect(state.pbBadges.get(10)).toBe('5RM');
    await act(async () => { tree.update(<Harness detail={{ ...detail }} />); });
    expect(state.pbBadges.size).toBe(0);
    jest.mocked(getCurrentPBEventsForExercise).mockRejectedValueOnce(new Error('Database unavailable'));
    await act(async () => { tree.update(<Harness detail={{ ...detail }} />); });
    expect(state.pbBadges.size).toBe(0);
    expect(state.pbError).toBe('Personal bests could not be loaded.');
  });
});

describe('workout PB indicators', () => {
  let tree: ReturnType<typeof renderer.create>;
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

  it('labels only matching sets, summarizes that exercise, and keeps set navigation intact', async () => {
    const onSetPress = jest.fn();
    await act(async () => { tree = renderer.create(
      <WorkoutExerciseEntry entry={entry(1, [set(10, 1), set(11, 1)])} index={0}
        onPress={() => {}} onSetPress={onSetPress} pbBadges={new Map([[11, '5RM'], [99, '8RM']])} />,
    ); });
    const buttons = tree.root.findAll((node: TestNode) => node.type === 'Pressable');
    expect(buttons[0].props.accessibilityLabel).toBe('Open Exercise 1, 1 current personal best set');
    expect(buttons[1].props.accessibilityLabel).not.toContain('personal best');
    expect(buttons[2].props.accessibilityLabel).toContain('current personal best, 5RM');
    await act(async () => { buttons[2].props.onPress(); });
    expect(onSetPress).toHaveBeenCalledWith(11);
    const pbText = tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === '5RM');
    expect(pbText.props.style.color).toBe('#14202C');
    expect(pbText.props.numberOfLines).toBeUndefined();
    expect(pbText.props.allowFontScaling).not.toBe(false);
    for (const button of buttons) {
      expect(typeof button.props.style).not.toBe('function');
      expect(button.props.className).toContain('active:opacity-70');
    }
    expect(tree.root.findAll((node: TestNode) => node.type === 'Icon' && node.props.name === 'trophy-outline')).toHaveLength(1);
    const matchingWeight = buttons[2].find((node: TestNode) => node.type === 'Text' && node.props.children === '120 kg');
    expect(pbText.parent.parent.parent).toBe(matchingWeight.parent.parent);
  });

  it('supports legacy rows without showing a trophy on ordinary recorded sets', async () => {
    await act(async () => { tree = renderer.create(<WorkoutSetRow set={set(81, 8)} index={0} onPress={() => {}} />); });
    expect(tree.root.findAll((node: TestNode) => node.type === 'Icon' && node.props.name === 'trophy-outline')).toHaveLength(0);
    await act(async () => { tree.update(<WorkoutSetRow set={set(81, 8)} index={0} onPress={() => {}} pbBadge="10RM" />); });
    expect(tree.root.find((node: TestNode) => node.type === 'Pressable').props.accessibilityLabel).toContain('current personal best, 10RM');
  });

  it('displays missing measurements as em dashes without reporting zero reps', async () => {
    jest.mocked(useWindowDimensions).mockReturnValue({ width: 320, height: 800, scale: 3, fontScale: 1.3 });
    await act(async () => { tree = renderer.create(<WorkoutSetRow set={set(81, 8, { weightKg: null, reps: null })} index={0} onPress={() => {}} />); });
    expect(tree.root.findAll((node: TestNode) => node.type === 'Text' && node.props.children === '\u2014')).toHaveLength(2);
    expect(tree.root.find((node: TestNode) => node.type === 'Pressable').props.accessibilityLabel).toContain('not recorded reps');
  });

  it('puts status and date above the exercise name independently of PBs', async () => {
    const exercise = { ...entry(1, [set(11, 1)]), completedAt: null };
    await act(async () => { tree = renderer.create(<WorkoutExerciseEntry entry={exercise} index={0}
      onPress={() => {}} onSetPress={() => {}} pbBadges={new Map([[11, '5RM']])} />); });
    const header = tree.root.findAll((node: TestNode) => node.type === 'Pressable')[0];
    expect(header.children[0].find((node: TestNode) => node.type === 'Text' && node.props.children === 'In progress')).toBeDefined();
    expect(header.children[1].find((node: TestNode) => node.type === 'Text' && node.props.children === 'Exercise 1')).toBeDefined();
    expect(header.findAll((node: TestNode) => node.type === 'Icon' && node.props.name === 'trophy-outline')).toHaveLength(0);
    await act(async () => { tree.update(<WorkoutExerciseEntry entry={{ ...exercise, completedAt: 123 }} index={0}
      onPress={() => {}} onSetPress={() => {}} />); });
    expect(header.children[0].find((node: TestNode) => node.type === 'Text' && node.props.children === 'Completed')).toBeDefined();
  });

  it('keeps inline PB and value columns stable with warm-ups, notes and larger narrow-screen text', async () => {
    jest.mocked(useWindowDimensions).mockReturnValue({ width: 320, height: 800, scale: 3, fontScale: 1.3 });
    await act(async () => { tree = renderer.create(<WorkoutExerciseEntry
      entry={entry(1, [set(10, 1), set(11, 1, { isWarmup: true, note: 'Controlled tempo' })])}
      index={0} onPress={() => {}} onSetPress={() => {}} pbBadges={new Map([[11, '100RM']])} />); });
    const buttons = tree.root.findAll((node: TestNode) => node.type === 'Pressable').slice(1);
    const weights = buttons.map((button: any) => button.find((node: TestNode) => node.type === 'Text' && node.props.children === '120'));
    const mainRows = weights.map((weight: any) => weight.parent.parent);
    expect(mainRows[0].children.map((child: any) => child.props.style)).toEqual(mainRows[1].children.map((child: any) => child.props.style));
    const pbText = tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === '100RM');
    expect(pbText.parent.parent.parent).toBe(mainRows[1]);
    expect(pbText.parent.props.style.maxWidth).toBe('100%');
    expect(pbText.props.style.flexShrink).toBe(1);
    expect(buttons[1].props.accessibilityLabel).toContain('warm-up, current personal best, 100RM');
    expect(buttons[1].find((node: TestNode) => node.type === 'Text' && node.props.children === 'Controlled tempo')).toBeDefined();
    expect(mainRows[1].findAll((node: TestNode) => node.type === 'Text' && node.props.children === 'Warm-up')).toHaveLength(0);
  });

  it.each(['default', 'compact'] as const)('preserves %s history set interactions, units, note and media', async (variant) => {
    mockUnitPreference = 'lb';
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await act(async () => { tree = renderer.create(<SetItem index={2} weightKg={120} reps={5} variant={variant}
      note="Keep elbows tucked" pbBadge="5RM" isBestSet onPress={onPress} onLongPress={onLongPress}
      delayLongPress={600} rightActions={<React.Fragment>media action</React.Fragment>} />); });
    const button = tree.root.find((node: TestNode) => node.type === 'Pressable');
    expect(button.props.delayLongPress).toBe(600);
    expect(typeof button.props.style).not.toBe('function');
    await act(async () => { button.props.onPress(); button.props.onLongPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === '264.6 lb')).toBeDefined();
    expect(tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === '5RM')).toBeDefined();
    expect(tree.root.find((node: TestNode) => node.type === 'Icon' && node.props.name === 'trophy')).toBeDefined();
    expect(tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === 'Keep elbows tucked').props.numberOfLines)
      .toBe(variant === 'compact' ? 1 : undefined);
    expect(JSON.stringify(tree.toJSON())).toContain('media action');
  });
});
