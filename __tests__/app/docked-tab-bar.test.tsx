import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockPush = jest.fn();
const mockReportHeight = jest.fn();
const mockUseLiveWorkout = jest.fn();
const mockCapabilities = { programsExperience: 'coming-soon' as 'coming-soon' | 'full' };
let mockKeyboardListeners: Record<string, () => void> = {};

jest.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  Keyboard: {
    isVisible: () => false,
    addListener: (event: string, listener: () => void) => { mockKeyboardListeners[event] = listener; return { remove: () => {} }; },
  },
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('expo-router/js-tabs', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { BottomTabBarHeightCallbackContext: React.createContext<unknown>(undefined) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/components/design-system/design-system-provider', () => ({ DesignSystemProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/theme/ThemeContext', () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: (_target, key) => String(key) }) }) }));
jest.mock('@/lib/config/releaseProfile', () => ({ appCapabilities: mockCapabilities }));
jest.mock('@/features/workouts/hooks/use-live-workout', () => ({ useLiveWorkout: (enabled: boolean) => mockUseLiveWorkout(enabled) }));
jest.mock('@/features/workouts/components/live-workout-strip', () => ({ LiveWorkoutStrip: 'LiveWorkoutStrip' }));

const { BottomTabBarHeightCallbackContext } = jest.requireMock('expo-router/js-tabs');
const { DockedTabBar } = jest.requireActual('@/features/navigation/components/docked-tab-bar');
const { getSelectedWorkoutId, setSelectedWorkoutId } = jest.requireActual('@/lib/workouts/selection-store');

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[] };
const names = ['index', 'exercises', 'programs', 'settings'];
const titles = ['Workouts', 'Exercises', 'Programs', 'Settings'];
const routes = names.map((name) => ({ key: `${name}-key`, name, params: undefined }));
const descriptors = Object.fromEntries(routes.map((route, index) => [route.key, { options: { title: titles[index] } }]));
let tree: ReturnType<typeof renderer.create>;
let navigation: { emit: jest.Mock; navigate: jest.Mock };

async function render(index: number) {
  const element = <BottomTabBarHeightCallbackContext.Provider value={mockReportHeight}>
    <DockedTabBar state={{ index, routes }} descriptors={descriptors} navigation={navigation} insets={{ top: 0, bottom: 24, left: 0, right: 0 }} />
  </BottomTabBarHeightCallbackContext.Provider>;
  await act(async () => { if (tree) tree.update(element); else tree = renderer.create(element); });
}
const tabs = () => tree.root.findAll((node: Node) => node.props.accessibilityRole === 'tab');
const tab = (label: string) => tabs().find((node: Node) => node.props.accessibilityLabel === label)!;

describe('DockedTabBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeyboardListeners = {};
    mockCapabilities.programsExperience = 'coming-soon';
    mockUseLiveWorkout.mockReturnValue(null);
    navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
    setSelectedWorkoutId(null);
  });
  afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined as never; });

  it('renders the four tabs, marks the focused one and flags Programs as coming soon in mvp', async () => {
    await render(0);
    expect(tabs().map((node: Node) => node.props.accessibilityLabel)).toEqual(['Workouts', 'Exercises', 'Programs, coming soon', 'Settings']);
    expect(tabs().map((node: Node) => node.props.accessibilityState.selected)).toEqual([true, false, false, false]);
    expect(tree.root.findAll((node: Node) => node.type === 'Text' && node.props.children === 'SOON')).toHaveLength(1);

    mockCapabilities.programsExperience = 'full';
    await render(0);
    expect(tab('Programs')).toBeDefined();
    expect(tree.root.findAll((node: Node) => node.props.children === 'SOON')).toHaveLength(0);
  });

  it('navigates on press unless the tab is focused or the press was prevented', async () => {
    await render(0);
    await act(async () => tab('Settings').props.onPress());
    expect(navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'settings-key', canPreventDefault: true });
    expect(navigation.navigate).toHaveBeenCalledWith('settings', undefined);

    await act(async () => tab('Workouts').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledTimes(1);

    navigation.emit.mockReturnValueOnce({ defaultPrevented: true });
    await act(async () => tab('Exercises').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
  });

  it('shows the live strip only on Programs and Settings, and Return opens the workout', async () => {
    const workout = { id: 7, name: 'Push Day', startedAt: 0, completedAt: null, exerciseCount: 2 };
    mockUseLiveWorkout.mockImplementation((enabled: boolean) => enabled ? workout : null);
    for (const [index, shown] of [[0, false], [1, false], [2, true], [3, true]] as const) {
      await render(index);
      expect(mockUseLiveWorkout).toHaveBeenLastCalledWith(shown);
      expect(tree.root.findAll((node: Node) => node.type === 'LiveWorkoutStrip')).toHaveLength(shown ? 1 : 0);
    }
    await act(async () => tree.root.find((node: Node) => node.type === 'LiveWorkoutStrip').props.onPress());
    expect(getSelectedWorkoutId()).toBe(7);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/workout-session/[id]', params: { id: '7' } });
  });

  it('reports its height and hides while the keyboard is open', async () => {
    await render(1);
    const root = tree.root.find((node: Node) => node.props.onLayout !== undefined);
    await act(async () => root.props.onLayout({ nativeEvent: { layout: { height: 106 } } }));
    expect(mockReportHeight).toHaveBeenCalledWith(106);
    await act(async () => mockKeyboardListeners.keyboardDidShow());
    expect(tabs()).toHaveLength(0);
    await act(async () => mockKeyboardListeners.keyboardDidHide());
    expect(tabs()).toHaveLength(4);
  });
});
