import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useWindowDimensions } from 'react-native';
import { Icon as DesignIcon } from '@/components/design-system/icon';
import SetItem from '@/components/lists/SetItem';
import { WorkoutExerciseEntry, WorkoutSetRow } from '@/features/workouts/components/workout-exercise-entry';
import { useWorkoutPBBadges } from '@/features/workouts/hooks/use-workout-pb-badges';
import { loadWorkoutPBBadges } from '@/features/workouts/workout-pb-badges';
import { dateLabel, timeLabel, type WorkoutDetail, type WorkoutExercise } from '@/features/workouts/workout-types';
import { getPBEventsBySetIds, type PBEvent } from '@/lib/db/pbEvents';
import type { SetRow } from '@/lib/db/workouts';

type TestNode = { type: unknown; props: Record<string, unknown> };
let mockUnitPreference: 'kg' | 'lb' = 'kg';

jest.mock('@/lib/db/pbEvents', () => ({ getPBEventsBySetIds: jest.fn() }));
jest.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  useWindowDimensions: jest.fn(() => ({ width: 448, height: 998, scale: 3, fontScale: 1 })),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('react-native-reanimated', () => {
  const animation = { duration: () => animation, delay: () => animation, reduceMotion: () => animation };
  return {
    __esModule: true, default: { View: 'View' }, FadeInDown: animation, LinearTransition: animation, ReduceMotion: { System: 'system' },
    useReducedMotion: () => false, useSharedValue: (value: unknown) => ({ value }), useAnimatedStyle: (style: () => unknown) => style(),
    withTiming: (value: unknown) => value, withDelay: (_delay: number, value: unknown) => value, withRepeat: (value: unknown) => value,
    cancelAnimation: () => undefined, runOnJS: (fn: unknown) => fn, Easing: { linear: 'linear', quad: 'quad', out: (value: unknown) => value },
  };
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
  jest.mocked(getPBEventsBySetIds).mockResolvedValue(new Map());
});

describe('workout achieved PB matching', () => {
  it('reads canonical set IDs together across exercises and repeated entries', async () => {
    jest.mocked(getPBEventsBySetIds).mockResolvedValue(new Map([[11, event(11, 1)], [21, event(21, 2)]]));
    const badges = await loadWorkoutPBBadges(workout([
      entry(1, [set(10, 1), set(11, 1)]), entry(1, [set(12, 1)], 3), entry(2, [set(21, 2)]),
    ]));
    expect(getPBEventsBySetIds).toHaveBeenCalledTimes(1);
    expect(getPBEventsBySetIds).toHaveBeenCalledWith([10, 11, 12, 21]);
    expect(badges).toEqual(new Map([[11, '5RM'], [21, '5RM']]));
    expect(badges.has(10)).toBe(false); // A matching performance alone does not create a PB event.
  });

  it('retains all three progressive records for the same rep count, excluding records outside the entry', async () => {
    jest.mocked(getPBEventsBySetIds).mockResolvedValue(new Map([
      [10, event(10, 1)], [11, event(11, 1)], [12, event(12, 1)], [99, event(99, 1)],
    ]));
    const badges = await loadWorkoutPBBadges(workout([
      entry(1, [set(10, 1, { weightKg: 100 }), set(11, 1, { weightKg: 110 }), set(12, 1), set(13, 1)]),
    ]));
    expect(badges).toEqual(new Map([[10, '5RM'], [11, '5RM'], [12, '5RM']]));
    expect(badges.has(13)).toBe(false); // Repeating the record is still not a new PB.
    expect(badges.has(99)).toBe(false);
  });

  it('includes legacy recorded sets and never assigns badges to planned placeholders', async () => {
    jest.mocked(getPBEventsBySetIds).mockResolvedValue(new Map([[81, event(81, 8)], [90, event(90, 9)]]));
    const badges = await loadWorkoutPBBadges(workout([
      entry(9, [set(90, 9, { note: '[PLANNED] 5 reps' })]),
    ], [{ ...set(81, 8, { workoutExerciseId: null, weightKg: 0 }), exerciseName: 'Bodyweight' }]));
    expect(getPBEventsBySetIds).toHaveBeenCalledWith([81]);
    expect(badges).toEqual(new Map([[81, '5RM']]));
  });

  it('skips empty sessions', async () => {
    expect(await loadWorkoutPBBadges(workout([]))).toEqual(new Map());
    expect(getPBEventsBySetIds).not.toHaveBeenCalled();
  });
});

describe('workout PB badge refresh', () => {
  let state: ReturnType<typeof useWorkoutPBBadges>;
  let tree: ReturnType<typeof renderer.create>;
  function Harness({ detail }: { detail: WorkoutDetail | null }) {
    state = useWorkoutPBBadges(detail);
    return null;
  }
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

  it('does not let an older workout response overwrite newer badges', async () => {
    let finishOld!: (value: Map<number, PBEvent>) => void;
    jest.mocked(getPBEventsBySetIds)
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

  it('refreshes achieved records when the same workout is reloaded and reports read failures', async () => {
    const detail = workout([entry(1, [set(10, 1)])]);
    jest.mocked(getPBEventsBySetIds).mockResolvedValueOnce(new Map([[10, event(10, 1)]]));
    await act(async () => { tree = renderer.create(<Harness detail={detail} />); });
    expect(state.pbBadges.get(10)).toBe('5RM');
    await act(async () => { tree.update(<Harness detail={{ ...detail }} />); });
    expect(state.pbBadges.size).toBe(0);
    jest.mocked(getPBEventsBySetIds).mockRejectedValueOnce(new Error('Database unavailable'));
    await act(async () => { tree.update(<Harness detail={{ ...detail }} />); });
    expect(state.pbBadges.size).toBe(0);
    expect(state.pbError).toBe('Personal bests could not be loaded.');
  });
});

describe('workout PB indicators', () => {
  let tree: ReturnType<typeof renderer.create>;
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

  it('starts with best plus all PB sets, preserves original numbers, and expands independently of navigation', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => set(index + 1, 1, { weightKg: 50 + index * 5, setIndex: index }));
    const exercise = entry(1, rows);
    const onSetPress = jest.fn();
    const onPress = jest.fn();
    const props = { entry: exercise, index: 0, onSetPress, onPress, pbBadges: new Map([[3, '5RM'], [6, '5RM'], [9, '5RM']]) };
    await act(async () => { tree = renderer.create(<WorkoutExerciseEntry {...props} />); });
    const visible = () => tree.root.findAllByType(WorkoutSetRow).map((row: any) => row.props.set.id);
    expect(visible()).toEqual([3, 6, 9, 12]);
    expect(tree.root.findAllByType(WorkoutSetRow).map((row: any) => row.props.index)).toEqual([2, 5, 8, 11]);
    expect(tree.root.findAll((node: TestNode) => node.type === 'Text' && node.props.children === '5RM')).toHaveLength(3);
    expect(tree.root.findAll((node: TestNode) => node.type === 'Text' && node.props.children === 'BEST')).toHaveLength(1);
    const toggle = tree.root.find((node: TestNode) => node.props.accessibilityLabel === 'Show all 12 sets for Exercise 1');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    await act(async () => { toggle.props.onPress(); });
    expect(visible()).toEqual(rows.map((row) => row.id));
    expect(toggle.props.accessibilityState).toEqual({ expanded: true });
    expect(onPress).not.toHaveBeenCalled();
    await act(async () => { tree.root.findAllByType(WorkoutSetRow)[4].props.onPress(); });
    expect(onSetPress).toHaveBeenCalledWith(5);
    // Refreshing PBs must not collapse an entry the user has expanded.
    await act(async () => { tree.update(<WorkoutExerciseEntry {...props} pbBadges={new Map([[3, '5RM'], [6, '5RM'], [12, '5RM']])} />); });
    expect(visible()).toHaveLength(12);
    await act(async () => { toggle.props.onPress(); });
    expect(visible()).toEqual([3, 6, 12]); // The best/PB overlap is rendered only once.
  });

  it('adds asynchronously loaded PB highlights and omits a toggle when every set is already visible', async () => {
    const exercise = entry(1, [set(1, 1, { weightKg: 100 }), set(2, 1, { weightKg: 110 }), set(3, 1)]);
    const props = { entry: exercise, index: 0, onSetPress: jest.fn(), onPress: jest.fn() };
    await act(async () => { tree = renderer.create(<WorkoutExerciseEntry {...props} />); });
    expect(tree.root.findAllByType(WorkoutSetRow).map((row: any) => row.props.set.id)).toEqual([3]);
    await act(async () => { tree.update(<WorkoutExerciseEntry {...props} pbBadges={new Map([[1, '5RM'], [2, '5RM'], [3, '5RM']])} />); });
    expect(tree.root.findAllByType(WorkoutSetRow).map((row: any) => row.props.set.id)).toEqual([1, 2, 3]);
    expect(tree.root.findAll((node: TestNode) => node.props.accessibilityState !== undefined)).toHaveLength(0);
  });

  it('labels only matching sets, summarizes that exercise, and keeps set navigation intact', async () => {
    const onSetPress = jest.fn();
    await act(async () => { tree = renderer.create(
      <WorkoutExerciseEntry entry={entry(1, [set(10, 1), set(11, 1)])} index={0}
        onPress={() => {}} onSetPress={onSetPress} pbBadges={new Map([[11, '5RM'], [99, '8RM']])} />,
    ); });
    const buttons = tree.root.findAll((node: TestNode) => node.type === 'Pressable');
    expect(buttons[0].props.accessibilityLabel).toBe('Open Exercise 1, completed, 1 personal best set achieved');
    expect(buttons[1].props.accessibilityLabel).not.toContain('personal best');
    expect(buttons[2].props.accessibilityLabel).toContain('personal best achieved, 5RM');
    await act(async () => { buttons[2].props.onPress(); });
    expect(onSetPress).toHaveBeenCalledWith(11);
    const pbText = tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === '5RM');
    expect(pbText.props.style.color).toBe('#C88730');
    expect(pbText.parent.props.style.backgroundColor).toBe('#C8873029');
    expect(pbText.props.numberOfLines).toBeUndefined();
    expect(pbText.props.allowFontScaling).not.toBe(false);
    for (const button of buttons) {
      expect(typeof button.props.style).not.toBe('function');
      expect(button.props.className).toContain('active:opacity-70');
    }
    // Set rows carry no trophy or chevron: the badge alone marks the PB.
    for (const button of buttons.slice(1)) {
      expect(button.findAllByType(DesignIcon)).toHaveLength(0);
      expect(button.findAll((node: TestNode) => node.type === 'Icon')).toHaveLength(0);
    }
    // Values are a bold number followed by a small unit.
    const matchingWeight = buttons[2].find((node: TestNode) => node.type === 'Text' && node.props.children === '120');
    expect(matchingWeight.parent.props.children[1]).toBe(' kg');
    const matchingReps = buttons[2].find((node: TestNode) => node.type === 'Text' && node.props.children === 5);
    expect(matchingReps.parent.props.children[1]).toBe(' reps');
    expect(pbText.parent.parent.parent).toBe(matchingWeight.parent.parent);
  });

  it('supports legacy rows without showing a badge on ordinary recorded sets', async () => {
    await act(async () => { tree = renderer.create(<WorkoutSetRow set={set(81, 8)} index={0} onPress={() => {}} />); });
    const texts = () => tree.root.findAll((node: TestNode) => node.type === 'Text').map((node: TestNode) => node.props.children);
    expect(texts()).not.toContain('BEST');
    expect(tree.root.findAllByType(DesignIcon)).toHaveLength(0);
    // The badge column is reserved even when empty so values never shift.
    const weight = tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === '120');
    const badgeColumn = weight.parent.parent.children[3];
    expect(badgeColumn.props.style.width).toBe(52);
    expect(badgeColumn.children).toHaveLength(0);
    await act(async () => { tree.update(<WorkoutSetRow set={set(81, 8)} index={0} onPress={() => {}} pbBadge="10RM" />); });
    expect(tree.root.find((node: TestNode) => node.type === 'Pressable').props.accessibilityLabel).toContain('personal best achieved, 10RM');
    expect(tree.root.find((node: TestNode) => node.type === 'Text' && node.props.children === '10RM')).toBeDefined();
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
    expect(header.props.accessibilityLabel).toBe('Open Exercise 1, in progress, 1 personal best set achieved');
    // No index number or arrow beside the name.
    expect(header.findAllByType(DesignIcon)).toHaveLength(0);
    expect(header.findAll((node: TestNode) => node.type === 'Icon')).toHaveLength(0);
    expect(header.findAll((node: TestNode) => node.type === 'Text' && (node.props.children === 1 || node.props.children === '1'))).toHaveLength(0);
    await act(async () => { tree.update(<WorkoutExerciseEntry entry={{ ...exercise, completedAt: 123 }} index={0}
      onPress={() => {}} onSetPress={() => {}} />); });
    expect(header.children[0].find((node: TestNode) => node.type === 'Text' && node.props.children === 'Completed')).toBeDefined();
    expect(header.props.accessibilityLabel).toBe('Open Exercise 1, completed');
  });

  it('captions the header with the time, or the day when logged on another day than the workout', async () => {
    const performedAt = new Date(2026, 8, 25, 18, 42).getTime();
    const exercise = { ...entry(1, [set(11, 1)]), performedAt };
    const caption = () => tree.root.findAll((node: TestNode) => node.type === 'Pressable')[0].children[0]
      .findAll((node: TestNode) => node.type === 'Text').map((node: TestNode) => node.props.children);
    await act(async () => { tree = renderer.create(<WorkoutExerciseEntry entry={exercise} index={0}
      workoutStartedAt={new Date(2026, 8, 25, 17).getTime()} onPress={() => {}} onSetPress={() => {}} />); });
    expect(caption()).toEqual(['Completed', timeLabel(performedAt)]);
    await act(async () => { tree.update(<WorkoutExerciseEntry entry={exercise} index={0}
      workoutStartedAt={new Date(2026, 8, 24, 17).getTime()} onPress={() => {}} onSetPress={() => {}} />); });
    expect(caption()).toEqual(['Completed', dateLabel(new Date(performedAt))]);
    expect(caption()[1]).toBe('Fri 25 Sep');
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
    expect(buttons[1].props.accessibilityLabel).toContain('warm-up, personal best achieved, 100RM');
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
