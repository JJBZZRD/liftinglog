import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { LibrarySearchActions } from '@/features/exercises/components/library-search-actions';
import { LibrarySearchScope, sortSummaryLabel } from '@/features/exercises/components/library-search-scope';
import { exerciseSubtitle, LibrarySections } from '@/features/exercises/components/library-sections';
import { LibraryWorkoutGroup } from '@/features/exercises/components/library-workout-group';
import { ListRow } from '@/components/design-system/grouped-list';
import ExerciseLibraryScreen from '@/features/exercises/screens/exercise-library-screen';
import type { Exercise, ExerciseLibraryGroup } from '@/lib/db/exercises';
import type { WorkoutDetail } from '@/features/workouts/workout-types';
import { getSelectedWorkoutId, setSelectedWorkoutId } from '@/lib/workouts/selection-store';

const mockPush = jest.fn();
const mockOpenWorkout = jest.fn();
let mockWorkout: WorkoutDetail | null = null;

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
  useWindowDimensions: () => ({ width: 448, height: 998, scale: 3, fontScale: 1 }),
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true, default: { View: 'AnimatedView', ScrollView: 'ScrollView' },
    useReducedMotion: () => true, useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => unknown) => style(), withRepeat: (value: unknown) => value, withTiming: (value: unknown) => value,
    cancelAnimation: () => undefined, Easing: { out: (value: unknown) => value, quad: 'quad' },
  };
});
jest.mock('expo-blur', () => ({ BlurTargetView: 'BlurTargetView' }));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, rawColors: jest.requireActual<typeof import('@/lib/design-system/tokens')>('@/lib/design-system/tokens').designColors.light }),
}));
jest.mock('@/lib/design-system/use-scroll-edge-fades', () => ({
  useScrollEdgeFades: () => ({ topOpacity: { value: 0 }, bottomOpacity: { value: 0 }, scrollProps: {} }),
}));
jest.mock('@/components/workouts/scroll-fade', () => ({ ScrollFade: 'ScrollFade' }));
jest.mock('@/components/design-system/design-system-provider', () => ({ DesignSystemProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/modals/frosted-modal-context', () => ({ FrostedModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/AddExerciseModal', () => 'AddExerciseModal');
jest.mock('@/features/workouts/hooks/use-active-workout-shortcut', () => ({
  useActiveWorkoutShortcut: () => ({ workout: mockWorkout, openWorkout: mockOpenWorkout }),
}));
jest.mock('@/features/exercises/hooks/use-library-controller', () => ({ useLibraryController: () => ({ items: [], setAddModalVisible: jest.fn() }) }));
jest.mock('@/features/exercises/hooks/use-library-query', () => ({ useLibraryQuery: () => ({ sections: [], searchScope: 'all' }) }));
jest.mock('@/features/exercises/components/library-header', () => ({ LibraryHeader: 'LibraryHeader' }));
jest.mock('@/features/exercises/components/library-sort-dialog', () => ({ LibrarySortDialog: 'LibrarySortDialog' }));
jest.mock('@/features/exercises/components/library-exercise-dialogs', () => ({ LibraryExerciseDialogs: 'LibraryExerciseDialogs' }));
jest.mock('@/features/exercises/components/library-variation-manager', () => ({ LibraryVariationManager: 'LibraryVariationManager' }));
jest.mock('@/features/exercises/components/library-variation-dialogs', () => ({ LibraryVariationDialogs: 'LibraryVariationDialogs' }));

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[]; findAllByType(type: unknown): Node[] };
let tree: ReturnType<typeof renderer.create> | undefined;
const root = () => tree!.root;
const find = (type: unknown) => root().findAll((node: Node) => node.type === type);
const pressable = (label: string) => root().find((node: Node) => node.type === 'Pressable' && node.props.accessibilityLabel === label);
const texts = () => find('Text').map((node: Node) => node.props.children);

const exercise = (id: number, name: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, uid: null, name, parentExerciseId: null, variationLabel: null, description: null, muscleGroup: 'Chest',
  equipment: 'Barbell', isBodyweight: false, createdAt: null, lastRestSeconds: null, isPinned: false, ...extra,
});
const group = (item: Exercise, variations: Exercise[] = []): ExerciseLibraryGroup => ({ exercise: item, variations, familyLastPerformedAt: null });
type Entry = WorkoutDetail['exercises'][number];
const entry = (id: number, name: string, completedAt: number | null, setCount: number): Entry => ({
  id, exerciseId: id + 100, exerciseName: name, completedAt, performedAt: null, note: null,
  sets: Array.from({ length: setCount }, (_, index) => ({ id: id * 10 + index }) as Entry['sets'][number]),
});
const workout = (exercises: Entry[]): WorkoutDetail => ({
  id: 7, name: 'Push Day', startedAt: 0, completedAt: null, note: null, exerciseCount: exercises.length,
  setCount: 0, volumeKg: 0, inProgressCount: 0, exercises, unassignedSets: [],
});

async function render(element: React.ReactElement) {
  await act(async () => { if (tree) tree.update(element); else tree = renderer.create(element); });
}

afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; });
beforeEach(() => { jest.clearAllMocks(); mockWorkout = null; setSelectedWorkoutId(null); });

describe('library search row', () => {
  it('keeps search, its reserved clear action and a square Add button in a stable row', async () => {
    const change = jest.fn();
    const add = jest.fn();
    await render(<LibrarySearchActions value="" onChange={change} onAdd={add} />);
    const addButton = pressable('Add exercise');
    const clear = pressable('Clear exercise search');
    expect(addButton.props.style).toMatchObject({ width: 44, minHeight: 44 });
    expect(find('TextInput')[0].props.placeholder).toBe('Search exercises');
    expect(clear.props.disabled).toBe(true);
    expect(clear.props.importantForAccessibility).toBe('no-hide-descendants');
    await render(<LibrarySearchActions value="bench" onChange={change} onAdd={add} />);
    expect(pressable('Add exercise')).toBe(addButton);
    expect(clear.props.disabled).toBe(false);
    clear.props.onPress();
    addButton.props.onPress();
    expect(change).toHaveBeenCalledWith('');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('shows the scope chips as radios with the sort control at the end', async () => {
    const change = jest.fn();
    const sort = jest.fn();
    await render(<LibrarySearchScope value="muscle" onChange={change} sortLabel="A–Z" onSort={sort} />);
    const chips = root().findAll((node: Node) => node.props.accessibilityRole === 'radio');
    expect(chips.map((node: Node) => [node.props.accessibilityLabel, node.props.accessibilityState.checked]))
      .toEqual([['All', false], ['Muscle', true], ['Equipment', false]]);
    chips[2].props.onPress();
    expect(change).toHaveBeenCalledWith('equipment');
    pressable('Sort: A–Z. Change order').props.onPress();
    expect(sort).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['alphabetical', true, 'A–Z'], ['alphabetical', false, 'Z–A'], ['lastCompleted', false, 'Recent'], ['lastCompleted', true, 'Oldest'],
  ] as const)('labels %s ascending=%s as %s', (option, ascending, label) => {
    expect(sortSummaryLabel(option, ascending)).toBe(label);
  });
});

describe('library sections', () => {
  const bench = group(exercise(1, 'Bench Press'), [exercise(11, 'Close-Grip Bench', { parentExerciseId: 1 }), exercise(12, 'Paused Bench', { parentExerciseId: 1 })]);
  const fly = group(exercise(2, 'Cable Fly', { equipment: 'Cable' }));
  const dips = group(exercise(3, 'Dips', { isBodyweight: true, equipment: null, muscleGroup: null }));
  let controller: Record<string, any>;
  const renderSections = (sections: { key: string; title: string; items: ExerciseLibraryGroup[] }[]) =>
    render(<LibrarySections controller={controller as never} query={{ sections, searchScope: 'all' } as never} />);

  beforeEach(() => {
    controller = {
      items: [bench, fly], expandedExerciseId: null, setAddModalVisible: jest.fn(),
      handleNavigateToExercise: jest.fn(), handleOpenActions: jest.fn(), handleToggleExpanded: jest.fn(),
    };
  });

  it('describes equipment and variations, or the muscle group in the Equipment scope', () => {
    expect(exerciseSubtitle(bench, 'all')).toBe('Barbell · 2 variations');
    expect(exerciseSubtitle(fly, 'muscle')).toBe('Cable');
    expect(exerciseSubtitle(dips, 'all')).toBe('Bodyweight');
    expect(exerciseSubtitle(fly, 'equipment')).toBe('Chest');
  });

  it('renders each section as a labelled group of rows that open the exercise or its actions', async () => {
    await renderSections([{ key: 'chest', title: 'Chest', items: [bench, fly] }]);
    expect(texts()).toEqual(expect.arrayContaining(['Chest', '2', 'Bench Press', 'Barbell · 2 variations', 'Cable Fly']));
    const rows = root().findAllByType(ListRow);
    expect(rows.map((row: Node) => [row.props.title, row.props.chevron])).toEqual([['Bench Press', false], ['Cable Fly', true]]);
    rows[1].props.onPress();
    expect(controller.handleNavigateToExercise).toHaveBeenCalledWith(fly.exercise);
    rows[1].props.onLongPress();
    expect(controller.handleOpenActions).toHaveBeenCalledWith(fly);
    // Screen readers reach the actions and the (hidden) expand toggle through the row.
    rows[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'expand' } });
    expect(controller.handleToggleExpanded).toHaveBeenCalledWith(1);
    expect(rows[1].props.accessibilityActions.map((action: { name: string }) => action.name)).toEqual(['longpress']);
  });

  it('shows the variation count toggle and indented variation rows when expanded', async () => {
    await renderSections([{ key: 'chest', title: 'Chest', items: [bench, fly] }]);
    const toggle = root().find((node: Node) => node.type === 'Pressable' && node.props.accessible === false);
    expect(toggle.findAll((node: Node) => node.type === 'Text').map((node: Node) => node.props.children)).toEqual([2]);
    toggle.props.onPress();
    expect(controller.handleToggleExpanded).toHaveBeenCalledWith(1);
    controller.expandedExerciseId = 1;
    await renderSections([{ key: 'chest', title: 'Chest', items: [bench, fly] }]);
    const rows = root().findAllByType(ListRow);
    expect(rows.map((row: Node) => [row.props.title, Boolean(row.props.indent)])).toEqual([
      ['Bench Press', false], ['Close-Grip Bench', true], ['Paused Bench', true], ['Cable Fly', false],
    ]);
    rows[2].props.onPress();
    expect(controller.handleNavigateToExercise).toHaveBeenCalledWith(bench.variations[1]);
  });

  it('labels the ungrouped All list and explains empty results', async () => {
    await renderSections([{ key: 'all-exercises', title: '', items: [fly] }]);
    expect(texts()).toContain('All exercises');
    await renderSections([]);
    expect(texts()).toContain('No matches found');
    controller.items = [];
    await renderSections([]);
    expect(texts()).toContain('No exercises yet');
    pressable('Add exercise').props.onPress();
    expect(controller.setAddModalVisible).toHaveBeenCalledWith(true);
  });
});

describe('In this workout', () => {
  it('lists only in-progress exercises with sets, with a return pill in the heading', async () => {
    const onReturn = jest.fn();
    const onOpen = jest.fn();
    const detail = workout([entry(1, 'Incline DB Press', null, 3), entry(2, 'Cable Fly', null, 1), entry(3, 'Squat', 123, 5), entry(4, 'Draft', null, 0)]);
    await render(<LibraryWorkoutGroup workout={detail} onReturn={onReturn} onOpenEntry={onOpen} />);
    expect(texts()).toEqual(expect.arrayContaining(['In this workout', 'Push Day', '3 sets logged', '1 set logged']));
    const rows = root().findAllByType(ListRow);
    expect(rows.map((row: Node) => row.props.title)).toEqual(['Incline DB Press', 'Cable Fly']);
    rows[0].props.onPress();
    expect(onOpen).toHaveBeenCalledWith(detail.exercises[0]);
    pressable('Return to Push Day').props.onPress();
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('says nothing is logged yet rather than leaving the heading on its own', async () => {
    await render(<LibraryWorkoutGroup workout={workout([])} onReturn={jest.fn()} onOpenEntry={jest.fn()} />);
    expect(root().findAllByType(ListRow).map((row: Node) => row.props.title)).toEqual(['Nothing logged yet']);
  });
});

describe('Exercise library screen', () => {
  it('keeps the header fixed, and shows the workout group only while a workout is active', async () => {
    await render(<ExerciseLibraryScreen />);
    const scroll = find('ScrollView')[0];
    expect(scroll.findAll((node: Node) => node.type === 'LibraryHeader')).toHaveLength(0);
    expect(find('LibraryHeader')).toHaveLength(1);
    expect(root().findAllByType(LibraryWorkoutGroup)).toHaveLength(0);
    expect(find('ScrollFade').map((node: Node) => node.props.edge)).toEqual(['top', 'bottom']);

    mockWorkout = workout([entry(1, 'Incline DB Press', null, 3)]);
    await render(<ExerciseLibraryScreen />);
    const workoutGroup = root().findByType(LibraryWorkoutGroup);
    expect(scroll.findAllByType(LibraryWorkoutGroup)).toHaveLength(1);
    await act(async () => workoutGroup.props.onOpenEntry(mockWorkout!.exercises[0]));
    expect(getSelectedWorkoutId()).toBe(7);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/exercise/[id]', params: { id: '101', name: 'Incline DB Press', weId: '1', workoutId: '7' } });
    workoutGroup.props.onReturn();
    expect(mockOpenWorkout).toHaveBeenCalledTimes(1);
  });
});
