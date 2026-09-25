import React, { useCallback } from 'react';
import { Text } from 'react-native';
import { router, Tabs, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { act, cleanup, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';
import RootLayout from '@/app/_layout';
import WorkoutDetailScreen from '@/features/workouts/screens/workout-detail-screen';
import { ActiveWorkoutConflictError } from '@/lib/db/workoutSessions';
import { getSelectedWorkoutId, setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { createProfileRouteHarness } from '../helpers/profileRouteHarness';
import { mockReadyStartupSnapshot } from '../helpers/profileRouteSetup';

const mockGetWorkoutSessionDetail = jest.fn();
const mockResumeWorkoutSession = jest.fn();

jest.mock('../../lib/db/connection', () => ({}));
jest.mock('../../lib/db/replacementRestoreLifecycle', () => ({
  getDatabaseStartupSnapshot: () => mockReadyStartupSnapshot,
  subscribeDatabaseStartup: () => () => undefined,
  performDatabaseStartupAction: jest.fn(),
}));
jest.mock('../../lib/db/workoutSessions', () => ({
  getWorkoutSessionDetail: (...args: unknown[]) => mockGetWorkoutSessionDetail(...args),
  resumeWorkoutSession: (...args: unknown[]) => mockResumeWorkoutSession(...args),
  completeWorkoutSession: jest.fn(),
  updateWorkoutSession: jest.fn(),
  ActiveWorkoutConflictError: class extends Error {
    activeWorkoutId: number;
    constructor(id: number) {
      super('Another workout is active.');
      this.activeWorkoutId = id;
    }
  },
}));
jest.mock('../../lib/theme/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ isDark: false, rawColors: {} }),
}));
jest.mock('../../lib/contexts/UnitPreferenceContext', () => ({
  UnitPreferenceProvider: ({ children }: { children: React.ReactNode }) => children,
  useUnitPreference: () => ({ unitPreference: 'kg' }),
}));
jest.mock('expo-blur', () => ({ BlurTargetView: jest.requireActual('react-native').View }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('../../components/modals/frosted-modal-context', () => ({
  FrostedModalProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/workouts/workout-theme', () => ({
  WorkoutThemeBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/workouts/workout-ui', () => ({
  IconButton: () => null, Metric: () => null, WorkoutStatus: () => null,
}));
jest.mock('../../components/workouts/scroll-fade', () => ({ ScrollFade: () => null }));
jest.mock('../../features/workouts/components/workout-exercise-entry', () => ({
  WorkoutExerciseEntry: () => null, WorkoutSetRow: () => null,
}));
jest.mock('../../features/workouts/components/workout-feedback', () => ({
  WorkoutEmpty: () => null, WorkoutError: () => null,
}));
jest.mock('../../features/workouts/components/workout-metadata-editor', () => ({
  WorkoutMetadataEditor: () => null,
}));
jest.mock('../../features/workouts/components/workout-dialogs', () => ({
  CompleteWorkoutDialog: () => null,
  ActiveWorkoutDialog: ({ visible }: { visible: boolean }) => visible
    ? jest.requireActual('react').createElement(jest.requireActual('react-native').Text, { testID: 'active-workout-conflict' }, 'Another workout is active')
    : null,
}));
jest.mock('../../features/workouts/hooks/use-workout-current-pb-badges', () => ({
  useWorkoutCurrentPBBadges: () => ({ pbBadges: new Map(), pbError: null }),
}));

function workout(completedAt: number | null = null) {
  return {
    id: 42, name: 'Workout 42', note: null, startedAt: 1000, completedAt,
    exerciseCount: 0, setCount: 0, volumeKg: 0, exercises: [], unassignedSets: [],
  };
}

function renderWorkoutNavigation(initialUrl = '/') {
  const onHomeFocus = jest.fn();
  const { context } = createProfileRouteHarness(RootLayout);
  context['(tabs)/_layout'] = {
    default: () => <Tabs screenOptions={{ animation: 'none' }} />,
  };
  context['(tabs)/index'] = {
    default: function Home() {
      useFocusEffect(useCallback(() => { onHomeFocus(); }, []));
      return <Text>Workouts home</Text>;
    },
  };
  context['(tabs)/exercises'] = {
    default: function Exercises() {
      const { workoutId } = useLocalSearchParams();
      return <Text testID="exercises-workout">{workoutId}</Text>;
    },
  };
  context['workout-session/[id]'] = { default: WorkoutDetailScreen };
  return { ...renderRouter(context, { initialUrl }), onHomeFocus };
}

async function openWorkout(result: ReturnType<typeof renderWorkoutNavigation>) {
  act(() => router.push('/workout-session/42'));
  await result.findByText('Add Exercise');
}

function appStackState(result: ReturnType<typeof renderWorkoutNavigation>) {
  const state = result.getRouterState()!;
  return state.routes.find(({ name }) => name === '__root')?.state ?? state;
}

describe('workout detail to exercise library navigation', () => {
  beforeEach(() => {
    setSelectedWorkoutId(null);
    mockGetWorkoutSessionDetail.mockResolvedValue(workout());
    mockResumeWorkoutSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('returns straight to Exercises in the existing tabs without focusing Home or accumulating detail screens', async () => {
    const result = renderWorkoutNavigation();
    let tabsKey: string | undefined;
    for (let visit = 0; visit < 2; visit += 1) {
      await openWorkout(result);
      if (visit === 0) tabsKey = appStackState(result).routes[0].key;
      expect(tabsKey).toEqual(expect.any(String));
      const homeFocusCount = result.onHomeFocus.mock.calls.length;
      fireEvent.press(result.getByText('Add Exercise'));

      await waitFor(() => expect(result.getPathname()).toBe('/exercises'));
      expect(result.getByTestId('exercises-workout').props.children).toBe('42');
      expect(getSelectedWorkoutId()).toBe(42);
      expect(appStackState(result).routes.map(({ name, key }) => ({ name, key })))
        .toEqual([{ name: '(tabs)', key: tabsKey }]);
      expect(result.onHomeFocus).toHaveBeenCalledTimes(homeFocusCount);
    }
    expect(mockResumeWorkoutSession).not.toHaveBeenCalled();
  });

  it('waits for a completed workout to resume before leaving its detail', async () => {
    mockGetWorkoutSessionDetail.mockResolvedValue(workout(2000));
    let finishResume!: () => void;
    mockResumeWorkoutSession.mockImplementation(() => new Promise<void>((resolve) => { finishResume = resolve; }));
    const result = renderWorkoutNavigation();
    await openWorkout(result);
    fireEvent.press(result.getByText('Add Exercise'));

    expect(mockResumeWorkoutSession).toHaveBeenCalledWith(42);
    expect(result.getPathname()).toBe('/workout-session/42');
    expect(getSelectedWorkoutId()).toBeNull();
    await act(async () => { finishResume(); });
    await waitFor(() => expect(result.getPathname()).toBe('/exercises'));
    expect(getSelectedWorkoutId()).toBe(42);
  });

  it('keeps the completed workout open and preserves selection when another workout prevents resuming', async () => {
    mockGetWorkoutSessionDetail.mockResolvedValue(workout(2000));
    mockResumeWorkoutSession.mockRejectedValue(new ActiveWorkoutConflictError(7));
    setSelectedWorkoutId(7);
    const result = renderWorkoutNavigation();
    await openWorkout(result);
    fireEvent.press(result.getByText('Add Exercise'));

    await result.findByTestId('active-workout-conflict');
    expect(result.getPathname()).toBe('/workout-session/42');
    expect(getSelectedWorkoutId()).toBe(7);
  });

  it('opens Exercises from a directly linked workout without requiring an existing tabs route', async () => {
    const result = renderWorkoutNavigation('/workout-session/42');
    fireEvent.press(await result.findByText('Add Exercise'));

    await waitFor(() => expect(result.getPathname()).toBe('/exercises'));
    expect(appStackState(result).routes.map(({ name }) => name)).toEqual(['(tabs)']);
    expect(getSelectedWorkoutId()).toBe(42);
  });
});
