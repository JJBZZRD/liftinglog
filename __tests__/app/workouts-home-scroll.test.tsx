import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockPush = jest.fn();
const mockReload = jest.fn();
const mockCapabilities = { healthMetrics: false };
let mockWindow = { width: 448, height: 998, scale: 3, fontScale: 1 };
const mockWorkout = (id: number) => ({ id, name: `Session ${id}`, startedAt: new Date(2026, 8, 25).getTime(), completedAt: 1 as number | null, exerciseCount: 2, setCount: 5 });
let mockList: {
  workouts: ReturnType<typeof mockWorkout>[];
  activeElsewhere: ReturnType<typeof mockWorkout> | null;
  loading: boolean;
  creating: boolean;
  error: string | null;
  conflictId: number | null;
  setConflictId: jest.Mock;
  reload: jest.Mock;
  create: jest.Mock;
  deleting: boolean;
  deleteError: string | null;
  clearDeleteError: jest.Mock;
  remove: jest.Mock;
};

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  useWindowDimensions: () => mockWindow,
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { ScrollView: 'ScrollView' },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useDerivedValue: (derive: () => number) => {
      const deriveRef = React.useRef(derive);
      deriveRef.current = derive;
      return React.useRef({ get value() { return deriveRef.current(); } }).current;
    },
    useAnimatedScrollHandler: (handler: (event: unknown) => void) =>
      (event: { nativeEvent: unknown }) => handler(event.nativeEvent),
  };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('expo-blur', () => ({ BlurTargetView: 'BlurTargetView' }));
jest.mock('expo-router', () => ({ router: { push: mockPush }, Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('../../lib/theme/ThemeContext', () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: () => '#000000' }) }) }));
jest.mock('../../lib/config/releaseProfile', () => ({ appCapabilities: mockCapabilities }));
jest.mock('../../lib/workouts/selection-store', () => ({ setSelectedWorkoutId: jest.fn() }));
jest.mock('../../components/modals/frosted-modal-context', () => ({ FrostedModalProvider: 'FrostedModalProvider' }));
jest.mock('../../components/workouts/workout-theme', () => ({ WorkoutThemeBoundary: 'WorkoutThemeBoundary' }));
jest.mock('../../components/workouts/workout-header', () => ({ WorkoutHeader: 'WorkoutHeader' }));
jest.mock('../../components/workouts/workout-calendar', () => ({ WorkoutCalendar: 'WorkoutCalendar' }));
jest.mock('../../components/workouts/workout-overlays', () => ({ WorkoutOverlays: 'WorkoutOverlays' }));
jest.mock('../../components/workouts/scroll-fade', () => ({ ScrollFade: 'ScrollFade' }));
jest.mock('../../features/workouts/components/workout-dialogs', () => ({ ActiveWorkoutDialog: 'ActiveWorkoutDialog' }));
jest.mock('../../components/design-system/confirm-dialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('../../components/design-system/status-pill', () => ({ LiveDot: 'LiveDot', StatusPill: 'StatusPill' }));
jest.mock('../../features/workouts/components/workout-date-selector', () => ({ WorkoutDateSelector: 'WorkoutDateSelector' }));
jest.mock('../../features/workouts/components/workout-session-row', () => ({ WorkoutSessionRow: 'WorkoutSessionRow' }));
jest.mock('../../features/workouts/components/workout-feedback', () => ({ WorkoutEmpty: 'WorkoutEmpty', WorkoutError: 'WorkoutError' }));
jest.mock('../../features/workouts/hooks/use-workout-list', () => ({ useWorkoutList: () => mockList }));
jest.mock('../../features/workouts/hooks/use-workout-date', () => ({
  useWorkoutDate: () => {
    const [date, setDate] = jest.requireActual<typeof React>('react').useState(new Date(2026, 8, 25));
    return { date, setDate };
  },
}));

const WorkoutsHomeScreen = jest.requireActual('../../features/workouts/screens/workouts-home-screen').default;
const { Icon } = jest.requireActual('../../components/design-system/icon');
const WorkoutDateSelector = jest.requireActual('../../features/workouts/components/workout-date-selector').WorkoutDateSelector;
type Tree = ReturnType<typeof renderer.create>;
type TestNode = { type: unknown; props: Record<string, any> };

const find = (tree: Tree, type: string) => tree.root.findAll((node: TestNode) => node.type === type);
const getList = (tree: Tree) => find(tree, 'ScrollView')[0];
const fadeEdges = (tree: Tree) => find(tree, 'ScrollFade').filter((node: TestNode) => node.props.opacity.value > 0).map((node: TestNode) => node.props.edge);
const fadeOpacities = (tree: Tree) => Object.fromEntries(find(tree, 'ScrollFade').map((node: TestNode) => [node.props.edge, node.props.opacity.value]));

describe('Workouts Home list viewport', () => {
  let tree: Tree;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCapabilities.healthMetrics = false;
    mockList = {
      workouts: [mockWorkout(3), mockWorkout(2), mockWorkout(1)], activeElsewhere: mockWorkout(4),
      loading: false, creating: false, error: null, conflictId: null,
      setConflictId: jest.fn(), reload: mockReload, create: jest.fn(),
      deleting: false, deleteError: null, clearDeleteError: jest.fn(), remove: jest.fn(async () => true),
    };
  });

  afterEach(async () => { await act(async () => { tree?.unmount(); }); });

  it('keeps stable controls outside the only scroll view while the optional banner stays inside it', async () => {
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    expect(find(tree!, 'ScrollView')).toHaveLength(1);
    const list = getList(tree!);
    expect(list.findAll((node: TestNode) => node.type === 'WorkoutHeader' || node.type === 'WorkoutDateSelector')).toHaveLength(0);
    expect(list.findAll((node: TestNode) => node.props.children === 'New Workout' || node.props.children === 'Workouts')).toHaveLength(0);
    const banner = list.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Continue active workout, Session 4, in progress since Fri 25 Sep');
    expect(banner).toHaveLength(1);
    expect(banner[0].findAll((node: TestNode) => node.type === 'LiveDot')).toHaveLength(1);
    expect(list.findAll((node: TestNode) => node.type === 'WorkoutSessionRow').map((node: TestNode) => node.props.workout.id)).toEqual([3, 2, 1]);
    expect(list.props.style).toMatchObject({ flex: 1, minHeight: 0 });
    expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
    expect(list.props.contentContainerStyle.paddingTop).toBeUndefined();

    const header = find(tree!, 'WorkoutHeader')[0];
    const dateSelector = find(tree!, 'WorkoutDateSelector')[0];
    const heading = tree!.root.find((node: TestNode) => node.type === 'Text' && node.props.children === 'Workouts');
    const controls = header.parent;
    mockList.activeElsewhere = null;
    await act(async () => { tree!.update(<WorkoutsHomeScreen />); });
    expect(find(tree!, 'WorkoutHeader')[0]).toBe(header);
    expect(find(tree!, 'WorkoutDateSelector')[0]).toBe(dateSelector);
    expect(heading.parent?.parent).toBe(controls);
    expect(controls?.props.style).toMatchObject({ flexShrink: 0 });
    expect(getList(tree!)).toBe(list);

    await act(async () => { getList(tree!).props.refreshControl.props.onRefresh(); });
    expect(mockReload).toHaveBeenCalledTimes(1);
    await act(async () => { find(tree!, 'WorkoutSessionRow')[0].props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/workout-session/[id]', params: { id: '3' } });
  });

  it('shows fades only at overflowing edges and keeps both mounted', async () => {
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    const list = getList(tree!);
    const fades = find(tree!, 'ScrollFade');
    expect(fades).toHaveLength(2);
    expect(fadeEdges(tree!)).toEqual([]);
    await act(async () => {
      list.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
      list.props.onContentSizeChange(350, 1000);
    });
    expect(fadeEdges(tree!)).toEqual(['bottom']);
    await act(async () => { list.props.onScroll({ nativeEvent: { contentOffset: { y: 100 } } }); });
    expect(fadeEdges(tree!)).toEqual(['top', 'bottom']);
    expect(find(tree!, 'ScrollFade')).toEqual(fades);
    // Fades are plain gradients: the only blur target is the page one used by dialogs.
    expect(find(tree!, 'BlurTargetView')).toHaveLength(1);
    expect(find(tree!, 'ScrollFade')[0].props.blurTarget).toBeUndefined();

    await act(async () => { list.props.onScroll({ nativeEvent: { contentOffset: { y: 600 } } }); });
    expect(fadeEdges(tree!)).toEqual(['top']);
    await act(async () => {
      list.props.onContentSizeChange(350, 250);
      list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    expect(fadeEdges(tree!)).toEqual([]);
    // Both overlays stay mounted at either boundary.
    expect(find(tree!, 'ScrollFade')).toEqual(fades);
  });

  it('tracks partial scrolls, fast jumps, and reversals immediately at both edges', async () => {
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    const list = getList(tree!);
    await act(async () => {
      list.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
      list.props.onContentSizeChange(350, 1000);
    });

    // Read the live opacity on each event without a timer or React rerender.
    for (const [offset, top, bottom] of [
      [0, 0, 1], [9, 0.25, 1], [18, 0.5, 1], [36, 1, 1],
      [582, 1, 0.5], [600, 1, 0], [591, 1, 0.25], [564, 1, 1],
      [18, 0.5, 1], [0, 0, 1], [-80, 0, 1], [680, 1, 0],
    ]) {
      list.props.onScroll({ nativeEvent: { contentOffset: { y: offset } } });
      expect(fadeOpacities(tree!)).toEqual({ top, bottom });
    }

    await act(async () => { tree!.update(<WorkoutsHomeScreen />); });
    expect(fadeOpacities(tree!)).toEqual({ top: 1, bottom: 0 });
  });

  it('hides unmeasured or fitting content and recalculates fades when dimensions change', async () => {
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    const list = getList(tree!);
    await act(async () => {
      list.props.onContentSizeChange(350, 1000);
      list.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } });
    });
    expect(fadeOpacities(tree!)).toEqual({ top: 0, bottom: 0 });
    await act(async () => { list.props.onLayout({ nativeEvent: { layout: { height: 400 } } }); });
    expect(fadeOpacities(tree!)).toEqual({ top: 1, bottom: 1 });

    // A content shrink must hide both fades even before a correcting scroll event.
    await act(async () => { list.props.onContentSizeChange(350, 250); });
    expect(fadeOpacities(tree!)).toEqual({ top: 0, bottom: 0 });
    await act(async () => { list.props.onContentSizeChange(350, 400); });
    expect(fadeOpacities(tree!)).toEqual({ top: 0, bottom: 0 });
    await act(async () => {
      list.props.onContentSizeChange(350, 418);
      list.props.onScroll({ nativeEvent: { contentOffset: { y: 9 } } });
    });
    expect(fadeOpacities(tree!)).toEqual({ top: 0.25, bottom: 0.25 });
    await act(async () => { list.props.onScroll({ nativeEvent: { contentOffset: { y: 60 } } }); });
    expect(fadeOpacities(tree!)).toEqual({ top: 0.5, bottom: 0 });
    await act(async () => { list.props.onLayout({ nativeEvent: { layout: { height: 500 } } }); });
    expect(fadeOpacities(tree!)).toEqual({ top: 0, bottom: 0 });
  });

  it('resets the native scroll view and fade state when the selected date changes', async () => {
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    const oldList = getList(tree!);
    await act(async () => {
      oldList.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
      oldList.props.onContentSizeChange(350, 1000);
      oldList.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } });
    });
    expect(fadeEdges(tree!)).toContain('top');
    await act(async () => { find(tree!, 'WorkoutDateSelector')[0].props.onChange(new Date(2026, 8, 24)); });
    expect(getList(tree!)).not.toBe(oldList);
    expect(fadeEdges(tree!)).toEqual([]);
  });

  it('asks before deleting a held card and closes only after the delete succeeds', async () => {
    mockList.workouts[1] = { ...mockList.workouts[1], completedAt: null, exerciseCount: 0, setCount: 0 };
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    const dialog = () => find(tree!, 'ConfirmDialog')[0];
    expect(dialog().props.visible).toBe(false);
    await act(async () => { find(tree!, 'WorkoutSessionRow')[1].props.onHold(); });
    expect(mockList.clearDeleteError).toHaveBeenCalledTimes(1);
    expect(dialog().props).toMatchObject({ visible: true, title: 'Discard workout?', confirmLabel: 'Discard' });
    expect(mockList.remove).not.toHaveBeenCalled();

    mockList.remove.mockResolvedValueOnce(false);
    await act(async () => { dialog().props.onConfirm(); });
    expect(mockList.remove).toHaveBeenCalledWith(2);
    expect(dialog().props.visible).toBe(true);
    await act(async () => { dialog().props.onConfirm(); });
    expect(dialog().props.visible).toBe(false);
    // The text stays while the dialog fades out.
    expect(dialog().props.title).toBe('Discard workout?');

    await act(async () => { find(tree!, 'WorkoutSessionRow')[0].props.onHold(); });
    expect(dialog().props).toMatchObject({ visible: true, title: 'Delete Session 3?', emphasis: 'This can’t be undone.' });
    await act(async () => { dialog().props.onCancel(); });
    expect(dialog().props.visible).toBe(false);
    expect(mockList.remove).toHaveBeenCalledTimes(2);
  });

  it('retains loading, empty, retry, and full-profile health navigation within the list', async () => {
    mockList.workouts = [];
    mockList.activeElsewhere = null;
    mockList.loading = true;
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    expect(getList(tree!).findAll((node: TestNode) => node.type === 'ActivityIndicator')).toHaveLength(1);
    expect(find(tree!, 'WorkoutEmpty')).toHaveLength(0);
    mockList.loading = false;
    await act(async () => { tree!.update(<WorkoutsHomeScreen />); });
    expect(find(tree!, 'WorkoutEmpty')).toHaveLength(1);
    mockList.error = 'Try again';
    mockCapabilities.healthMetrics = true;
    await act(async () => { tree!.update(<WorkoutsHomeScreen />); });
    expect(find(tree!, 'WorkoutEmpty')).toHaveLength(0);
    await act(async () => { find(tree!, 'WorkoutError')[0].props.onRetry(); });
    expect(mockReload).toHaveBeenCalledTimes(1);
    const metrics = getList(tree!).find((node: TestNode) => node.type === 'Text' && node.props.children === 'Health metrics');
    await act(async () => { metrics.parent!.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/user-metrics');
  });
});

describe('Workouts date navigator', () => {
  let tree: Tree;
  const onChange = jest.fn();
  const onCalendar = jest.fn();
  const renderSelector = (date: Date) => <WorkoutDateSelector date={date} onChange={onChange} onCalendar={onCalendar} />;
  const pressables = () => find(tree, 'Pressable');
  const button = (label: string) => pressables().find((node: TestNode) => node.props.accessibilityLabel === label)!;
  const texts = (node: TestNode & { findAll: Tree['root']['findAll'] }) => node.findAll((child: TestNode) => child.type === 'Text').map((child: TestNode) => child.props.children);

  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 8, 25, 10)); });
  afterEach(async () => { await act(async () => { tree?.unmount(); }); jest.useRealTimers(); });

  it('makes the date the calendar button, with a relative caption and no Today button', async () => {
    await act(async () => { tree = renderer.create(renderSelector(new Date(2026, 8, 23))); });
    expect(pressables().map((node: TestNode) => node.props.accessibilityLabel)).toEqual(['Previous day', 'Wed 23 Sep, 2 days ago', 'Next day']);
    const dateButton = button('Wed 23 Sep, 2 days ago');
    expect(texts(dateButton as never)).toEqual(['Wed 23 Sep', '2 days ago']);
    expect(dateButton.findAll((node: TestNode) => node.type === Icon).map((node: TestNode) => node.props.name)).toEqual(['calendar']);
    expect(dateButton.props.style).toMatchObject({ flex: 1, minWidth: 0, minHeight: 44, flexWrap: 'wrap' });
    expect(tree.root.findAll((node: TestNode) => node.props.children === 'Today' || node.props.accessibilityLabel === 'Back to today')).toHaveLength(0);
    await act(async () => { dateButton.props.onPress(); });
    expect(onCalendar).toHaveBeenCalledTimes(1);
  });

  it('keeps the same three controls whatever the date', async () => {
    await act(async () => { tree = renderer.create(renderSelector(new Date(2026, 8, 25))); });
    const [previous, , next] = pressables();
    expect(button('Fri 25 Sep, Today')).toBeDefined();
    await act(async () => { tree.update(renderSelector(new Date(2026, 5, 1))); });
    // A distant date in the same year has no caption; the controls stay mounted.
    expect(button('Mon 1 Jun')).toBeDefined();
    expect(pressables()[0]).toBe(previous);
    expect(pressables()[2]).toBe(next);
  });

  it('moves one day at a time', async () => {
    await act(async () => { tree = renderer.create(renderSelector(new Date(2026, 8, 23))); });
    await act(async () => { button('Previous day').props.onPress(); });
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 22));
    await act(async () => { button('Next day').props.onPress(); });
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 24));
  });
});
