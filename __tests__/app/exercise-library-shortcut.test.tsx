import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { LibrarySearchActions } from '@/features/exercises/components/library-search-actions';
import { ActiveWorkoutShortcut } from '@/features/workouts/components/active-workout-shortcut';
import ExerciseLibraryScreen from '@/features/exercises/screens/exercise-library-screen';
import { designColors } from '@/lib/design-system/tokens';
import type { WorkoutSummary } from '@/features/workouts/workout-types';

const mockOpen = jest.fn();
const mockAdd = jest.fn();
const mockKeyboardListeners = new Map<string, () => void>();
const mockSession = { id: 3, name: 'Bench & Squat', completedAt: null } as WorkoutSummary;
let mockWorkout: WorkoutSummary | null = mockSession;
let mockDark = false;
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
  Keyboard: {
    isVisible: () => false,
    addListener: (event: string, fn: () => void) => {
      mockKeyboardListeners.set(event, fn);
      return { remove: () => mockKeyboardListeners.delete(event) };
    },
  },
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) }));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({ isDark: mockDark, rawColors: jest.requireActual<typeof import('@/lib/design-system/tokens')>('@/lib/design-system/tokens').designColors[mockDark ? 'dark' : 'light'] }),
}));
jest.mock('@/components/design-system/design-system-provider', () => ({ DesignSystemProvider: 'DesignSystemProvider' }));
jest.mock('@/components/modals/frosted-modal-context', () => ({ FrostedModalProvider: 'FrostedModalProvider' }));
jest.mock('@/components/AddExerciseModal', () => 'AddExerciseModal');
jest.mock('@/features/workouts/hooks/use-active-workout-shortcut', () => ({
  useActiveWorkoutShortcut: () => ({ workout: mockWorkout, openWorkout: mockOpen }),
}));
jest.mock('@/features/exercises/hooks/use-library-controller', () => ({
  useLibraryController: () => ({ items: [], setAddModalVisible: mockAdd }),
}));
jest.mock('@/features/exercises/hooks/use-library-query', () => ({ useLibraryQuery: () => ({}) }));
jest.mock('@/features/exercises/components/library-header', () => ({ LibraryHeader: 'LibraryHeader' }));
jest.mock('@/features/exercises/components/library-sections', () => ({ LibrarySections: 'LibrarySections' }));
jest.mock('@/features/exercises/components/library-sort-dialog', () => ({ LibrarySortDialog: 'LibrarySortDialog' }));
jest.mock('@/features/exercises/components/library-exercise-dialogs', () => ({ LibraryExerciseDialogs: 'LibraryExerciseDialogs' }));
jest.mock('@/features/exercises/components/library-variation-manager', () => ({ LibraryVariationManager: 'LibraryVariationManager' }));
jest.mock('@/features/exercises/components/library-variation-dialogs', () => ({ LibraryVariationDialogs: 'LibraryVariationDialogs' }));

type Node = { type: unknown; props: Record<string, any> };
let tree: ReturnType<typeof renderer.create>;
const find = (type: string) => tree.root.findAll((node: Node) => node.type === type);
const button = (label: string) => tree.root.find((node: Node) => node.type === 'Pressable' && node.props.accessibilityLabel === label);
afterEach(async () => { await act(async () => tree?.unmount()); });
beforeEach(() => { jest.clearAllMocks(); mockWorkout = mockSession; mockDark = false; });

it('keeps search, its reserved clear action, and Add in a stable row', async () => {
  const change = jest.fn();
  await act(async () => { tree = renderer.create(<LibrarySearchActions value="" onChange={change} onAdd={mockAdd} />); });
  const add = button('Add exercise');
  const clear = button('Clear exercise search');
  const input = find('TextInput')[0];
  const inputStyle = input.props.style;
  expect(add.parent?.props.style).toMatchObject({ flexDirection: 'row', gap: 12 });
  expect(clear.props.disabled).toBe(true);
  expect(clear.props.importantForAccessibility).toBe('no-hide-descendants');
  await act(async () => { tree.update(<LibrarySearchActions value="bench" onChange={change} onAdd={mockAdd} />); });
  expect(button('Add exercise')).toBe(add);
  expect(find('TextInput')[0].props.style).toEqual(inputStyle);
  expect(clear.props.disabled).toBe(false);
  clear.props.onPress();
  add.props.onPress();
  expect(change).toHaveBeenCalledWith('');
  expect(mockAdd).toHaveBeenCalledTimes(1);
});

it.each([false, true])('uses shared glass colors and keeps the full name accessible (dark=%s)', async (dark) => {
  mockDark = dark;
  const workout = { ...mockSession, name: 'A very long workout name that will truncate on a narrow screen' };
  await act(async () => { tree = renderer.create(<ActiveWorkoutShortcut workout={workout} blurTarget={{ current: null }} onPress={mockOpen} onLayout={jest.fn()} />); });
  const action = button(`Return to active workout, ${workout.name}`);
  expect(action.props.style.borderColor).toBe(designColors[dark ? 'dark' : 'light'].border);
  expect(find('BlurView')[0].props.tint).toBe(dark ? 'dark' : 'light');
  expect(find('Text').find((node: Node) => node.props.children === workout.name)?.props.numberOfLines).toBe(1);
  expect(find('Text').find((node: Node) => node.props.children === 'Go to workout')?.props.numberOfLines).toBeUndefined();
  action.props.onPress();
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

it('floats outside scrolling, measures bottom clearance, and hides for keyboard/no active workout', async () => {
  await act(async () => { tree = renderer.create(<ExerciseLibraryScreen />); });
  const scroll = find('ScrollView')[0];
  expect(scroll.findAllByType(ActiveWorkoutShortcut)).toHaveLength(0);
  const shortcut = tree.root.findByType(ActiveWorkoutShortcut);
  const targets = find('BlurTargetView');
  expect(shortcut.props.blurTarget).toBe(targets[1].props.ref);
  expect(targets[1].findAllByType(ActiveWorkoutShortcut)).toHaveLength(0);
  expect(shortcut.parent?.parent?.props.style).toMatchObject({ position: 'absolute', bottom: 104 });
  await act(async () => { shortcut.props.onLayout({ nativeEvent: { layout: { height: 90 } } }); });
  expect(scroll.props.contentContainerStyle.paddingBottom).toBe(104 + 90 + 16);
  find('LibraryHeader')[0].props.onAdd();
  expect(mockAdd).toHaveBeenCalledWith(true);
  await act(async () => { mockKeyboardListeners.get('keyboardDidShow')!(); });
  expect(tree.root.findAllByType(ActiveWorkoutShortcut)).toHaveLength(0);
  await act(async () => { mockKeyboardListeners.get('keyboardDidHide')!(); });
  expect(tree.root.findAllByType(ActiveWorkoutShortcut)).toHaveLength(1);
  mockWorkout = null;
  await act(async () => { tree.update(<ExerciseLibraryScreen />); });
  expect(tree.root.findAllByType(ActiveWorkoutShortcut)).toHaveLength(0);
  expect(find('ScrollView')[0]).toBe(scroll);
  expect(scroll.props.contentContainerStyle.paddingBottom).toBe(120);
});
