import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { filterAndSortGroups, groupExerciseSections } from '@/features/exercises/library-model';
import { useLibraryController } from '@/features/exercises/hooks/use-library-controller';
import { useLibraryQuery } from '@/features/exercises/hooks/use-library-query';
import { listExerciseLibraryGroups, type Exercise, type ExerciseLibraryGroup } from '@/lib/db/exercises';
import { setShowAllTabBodyPartGrouping } from '@/lib/db/settings';
import { getSelectedWorkoutId, setSelectedWorkoutId } from '@/lib/workouts/selection-store';

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockParams: { addExerciseRequest?: string | string[]; workoutId?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), setParams: (...args: unknown[]) => mockSetParams(...args) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  LayoutAnimation: { configureNext: jest.fn(), Presets: { easeInEaseOut: {} } },
}));
jest.mock('@/lib/utils/layoutAnimation', () => ({ enableLegacyAndroidLayoutAnimationsIfNeeded: jest.fn() }));
jest.mock('@/lib/db/exercises', () => ({
  listExerciseLibraryGroups: jest.fn(), lastPerformedAt: jest.fn(async () => null),
  createExerciseVariation: jest.fn(), deleteExercise: jest.fn(),
  deleteExerciseVariation: jest.fn(), renameExerciseVariation: jest.fn(),
}));
jest.mock('@/lib/db/settings', () => ({
  getShowAllTabBodyPartGrouping: () => true, setShowAllTabBodyPartGrouping: jest.fn(),
}));

function exercise(id: number, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id, uid: `exercise-${id}`, name: 'Bench Press', description: null, muscleGroup: 'Chest',
    equipment: 'Barbell', isBodyweight: false, isPinned: false, parentExerciseId: null,
    variationLabel: null, createdAt: null, lastRestSeconds: null, ...overrides,
  };
}
const parent = exercise(41);
const variation = exercise(43, { parentExerciseId: 41, variationLabel: 'Larson', name: 'Bench Press (Larson)' });
const groups: ExerciseLibraryGroup[] = [
  { exercise: parent, variations: [variation], familyLastPerformedAt: 100 },
  { exercise: exercise(42), variations: [], familyLastPerformedAt: 200 },
  { exercise: exercise(44, { name: 'Pull-up', isBodyweight: true, equipment: null, muscleGroup: 'Back' }), variations: [], familyLastPerformedAt: null },
];

let controller: ReturnType<typeof useLibraryController>;
let query: ReturnType<typeof useLibraryQuery>;
let tree: ReturnType<typeof renderer.create> | undefined;
function ControllerHarness() { controller = useLibraryController(); return null; }
function QueryHarness() { query = useLibraryQuery(groups); return null; }

describe('exercise library boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.addExerciseRequest;
    delete mockParams.workoutId;
    setSelectedWorkoutId(null);
    jest.mocked(listExerciseLibraryGroups).mockResolvedValue(groups);
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    setSelectedWorkoutId(null);
  });

  it('routes parent and variation IDs into the currently selected workout without capturing stale selection', async () => {
    setSelectedWorkoutId(7);
    mockParams.workoutId = '7';
    await act(async () => { tree = renderer.create(<ControllerHarness />); });
    controller.handleNavigateToExercise(parent);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/exercise/[id]', params: { id: '41', name: 'Bench Press', workoutId: '7' } });
    setSelectedWorkoutId(9);
    controller.handleNavigateToExercise(variation);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/exercise/[id]', params: { id: '43', name: 'Bench Press (Larson)', workoutId: '9' } });
    setSelectedWorkoutId(null);
    controller.handleNavigateToExercise(parent);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/exercise/[id]', params: { id: '41', name: 'Bench Press' } });
  });

  it('handles the tab add request and clears only that request when the editor closes', async () => {
    mockParams.addExerciseRequest = ['new-request'];
    setSelectedWorkoutId(7);
    await act(async () => { tree = renderer.create(<ControllerHarness />); });
    expect(controller.isAddModalVisible).toBe(true);
    await act(async () => { controller.closeAddExerciseModal(); });
    expect(controller.isAddModalVisible).toBe(false);
    expect(mockSetParams).toHaveBeenCalledWith({ addExerciseRequest: undefined });
    expect(getSelectedWorkoutId()).toBe(7);
  });

  it('finds a family by a variation label and preserves distinct same-name parents', () => {
    expect(filterAndSortGroups(groups, ' larson ', 'alphabetical', true).map((group) => group.exercise.id)).toEqual([41]);
    expect(filterAndSortGroups(groups, 'bench', 'lastCompleted', false).map((group) => group.exercise.id)).toEqual([42, 41]);
    expect(groups.map((group) => group.exercise.id)).toEqual([41, 42, 44]);
  });

  it('groups concrete equipment and persists the All-tab grouping control without affecting equipment grouping', async () => {
    await act(async () => { tree = renderer.create(<QueryHarness />); });
    expect(query.sections.map((section) => section.title)).toEqual(['Chest & Triceps', 'Back & Biceps']);
    await act(async () => { query.handleShowAllTabBodyPartGroupingChange(false); });
    expect(setShowAllTabBodyPartGrouping).toHaveBeenCalledWith(false);
    expect(query.sections).toHaveLength(1);
    expect(query.sections[0].title).toBe('');
    await act(async () => { query.setSearchScope('equipment'); });
    expect(query.sections.map((section) => section.title)).toEqual(['BARBELL', 'BODYWEIGHT']);
    expect(groupExerciseSections(groups, 'muscle', false).map((section) => section.title)).toEqual(['Back', 'Chest']);
  });
});
