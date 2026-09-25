import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockPush = jest.fn();
const mockReload = jest.fn();
const mockCapabilities = { healthMetrics: false };
let mockWindow = { width: 448, height: 998, scale: 3, fontScale: 1 };
const mockWorkout = (id: number) => ({ id, name: `Session ${id}`, startedAt: new Date(2026, 8, 25).getTime() });
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
    };
  });

  afterEach(async () => { await act(async () => { tree?.unmount(); }); });

  it('keeps stable controls outside the only scroll view while the optional banner stays inside it', async () => {
    await act(async () => { tree = renderer.create(<WorkoutsHomeScreen />); });
    expect(find(tree!, 'ScrollView')).toHaveLength(1);
    const list = getList(tree!);
    expect(list.findAll((node: TestNode) => node.type === 'WorkoutHeader' || node.type === 'WorkoutDateSelector')).toHaveLength(0);
    expect(list.findAll((node: TestNode) => node.props.children === 'New Workout' || node.props.children === 'Workouts')).toHaveLength(0);
    expect(list.findAll((node: TestNode) => node.props.accessibilityLabel === 'Continue active workout')).toHaveLength(1);
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

  it('shows fades only at overflowing edges and targets the list without including its fades', async () => {
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
    const targets = find(tree!, 'BlurTargetView');
    expect(targets).toHaveLength(2);
    expect(targets[1].findAll((node: TestNode) => node.type === 'ScrollFade')).toHaveLength(0);
    expect(find(tree!, 'ScrollFade')[0].props.blurTarget).toBe(targets[1].props.ref);
    expect(find(tree!, 'ScrollFade')[0].props.blurTarget).not.toBe(find(tree!, 'WorkoutOverlays')[0].props.blurTarget);

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

describe('Workouts date navigator responsive layout', () => {
  let tree: Tree;
  const pastDate = new Date(2026, 8, 23);
  const onChange = jest.fn();
  const onCalendar = jest.fn();
  const renderSelector = (date: Date) => <WorkoutDateSelector date={date} onChange={onChange} onCalendar={onCalendar} />;
  const button = (label: string) => tree.root.find((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === label);
  const dateText = () => tree.root.find((node: TestNode) => node.type === 'Text' && node.props.accessibilityRole === 'header');

  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow = { width: 448, height: 998, scale: 3, fontScale: 1 };
  });
  afterEach(async () => { await act(async () => { tree?.unmount(); }); });

  it('preserves the wide date width, inline controls, and optical return-label adjustment', async () => {
    await act(async () => { tree = renderer.create(renderSelector(pastDate)); });
    const root = find(tree!, 'View')[0];
    expect(root.props.style).toMatchObject({ flexDirection: 'row', gap: 4 });
    expect(dateText().props.style).toMatchObject({ width: 112, flexShrink: 0 });
    const backLabel = button('Back to today').find((node: TestNode) => node.type === 'Text');
    expect(backLabel.props.style.transform).toEqual([{ translateX: 2 }]);
    expect(button('Choose workout date').parent).toBe(root);
    expect(button('Back to today').parent.props.style).toEqual({ flex: 1, minWidth: 88, minHeight: 44 });
  });

  it.each([[360, 1], [390, 1], [448, 1.3]])('fits a compact single row at width %s and font scale %s', async (width, fontScale) => {
    mockWindow = { ...mockWindow, width, fontScale };
    await act(async () => { tree = renderer.create(renderSelector(pastDate)); });
    const root = find(tree!, 'View')[0];
    expect(root.props.style.flexDirection).toBe('row');
    const calendar = button('Choose workout date');
    const today = button('Back to today');
    expect(calendar.parent).toBe(root);
    expect(today.find((node: TestNode) => node.type === 'Text').props.children).toBe('Today');
    expect(calendar.find((node: TestNode) => node.type === 'Text').props.children).toBe('Calendar');
    expect(dateText().props.style).toMatchObject({ width: 100 * fontScale, fontSize: 15 });
    const { contentWidth } = jest.requireActual('../../lib/design-system/responsive-layout').getResponsiveLayout(width);
    const requiredWidth = button('Previous day').props.style.width + dateText().props.style.width
      + button('Next day').props.style.width + today.parent.props.style.minWidth
      + calendar.props.style.width + root.props.style.gap;
    expect(requiredWidth).toBeLessThanOrEqual(contentWidth);
    expect(button('Previous day').props.style.width).toBe(44);
    expect(button('Next day').props.style.width).toBe(44);
    expect(calendar.props.style.minHeight).toBe(44);
    const reservedWidth = dateText().props.style.width;
    await act(async () => { tree.update(renderSelector(new Date(2026, 10, 11))); });
    expect(dateText().props.style.width).toBe(reservedWidth);
    expect(button('Choose workout date')).toBe(calendar);
    await act(async () => { tree.update(renderSelector(new Date())); });
    expect(button('Back to today')).toBe(today);
    expect(today.props.style.opacity).toBe(0);
    expect(today.props.disabled).toBe(true);
    expect(today.props.accessibilityElementsHidden).toBe(true);
  });

  it.each([[320, 1.3], [360, 1.3], [448, 2]])('uses stable two-row controls at width %s and font scale %s', async (width, fontScale) => {
    mockWindow = { ...mockWindow, width, fontScale };
    await act(async () => { tree = renderer.create(renderSelector(pastDate)); });
    const root = find(tree!, 'View')[0];
    const dateRow = dateText().parent.parent;
    const actionsRow = button('Choose workout date').parent;
    const todaySlot = button('Back to today').parent;
    expect(root.props.style).toMatchObject({ gap: 8 });
    expect(dateRow.props.style).toEqual({ alignItems: 'center' });
    expect(dateText().props.style).toMatchObject({ width: 112 * fontScale, flexShrink: 0 });
    expect(dateText().props.numberOfLines).toBeUndefined();
    expect(dateText().props.allowFontScaling).not.toBe(false);
    expect(actionsRow).not.toBe(dateRow);
    expect(todaySlot.parent).toBe(actionsRow);
    expect(button('Back to today').props.style.alignItems).toBe('flex-start');
    const slotStyle = todaySlot.props.style;
    await act(async () => { tree!.update(renderSelector(new Date())); });
    expect(dateText().parent.parent).toBe(dateRow);
    expect(button('Choose workout date').parent).toBe(actionsRow);
    expect(todaySlot.props.style).toEqual(slotStyle);
    expect(button('Back to today').parent).toBe(todaySlot);
    expect(button('Back to today').props.style.opacity).toBe(0);
    expect(button('Back to today').props.disabled).toBe(true);
    expect(button('Back to today').props.pointerEvents).toBe('none');
    expect(button('Back to today').props.accessibilityElementsHidden).toBe(true);
    expect(button('Back to today').props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('uses its measured container and recalculates presentation after resizing', async () => {
    await act(async () => { tree = renderer.create(renderSelector(pastDate)); });
    let root = find(tree!, 'View')[0];
    await act(async () => { root.props.onLayout({ nativeEvent: { layout: { width: 328 } } }); });
    expect(button('Back to today').find((node: TestNode) => node.type === 'Text').props.children).toBe('Today');
    await act(async () => { root.props.onLayout({ nativeEvent: { layout: { width: 280 } } }); });
    root = find(tree!, 'View')[0];
    expect(root.props.style.flexDirection).toBeUndefined();
    mockWindow = { ...mockWindow, width: 390 };
    await act(async () => { tree.update(renderSelector(pastDate)); });
    expect(find(tree!, 'View')[0].props.style.flexDirection).toBe('row');
    expect(button('Back to today').find((node: TestNode) => node.type === 'Text').props.children).toBe('Today');
  });

  it('bounds very large type within both arrow targets and retains date actions', async () => {
    mockWindow = { ...mockWindow, width: 320, fontScale: 2 };
    await act(async () => { tree = renderer.create(renderSelector(pastDate)); });
    expect(dateText().props.style).toMatchObject({ width: 200, flexShrink: 0 });
    const calendarWidth = button('Choose workout date').props.style.width;
    expect(calendarWidth).toBeGreaterThanOrEqual(44);
    expect(calendarWidth + button('Back to today').parent.props.style.minWidth + 4).toBeLessThanOrEqual(288);
    expect(button('Back to today').find((node: TestNode) => node.type === 'Text').props.children).toBe('Today');
    await act(async () => { button('Previous day').props.onPress(); });
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 22));
    await act(async () => { button('Next day').props.onPress(); });
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 24));
    await act(async () => { button('Choose workout date').props.onPress(); });
    expect(onCalendar).toHaveBeenCalledTimes(1);
  });
});
