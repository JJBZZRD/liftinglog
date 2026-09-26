import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useWorkoutDetail } from '@/features/workouts/hooks/use-workout-detail';
import { useWorkoutList } from '@/features/workouts/hooks/use-workout-list';
import { ActiveWorkoutConflictError, completeWorkoutSession, createWorkoutSession, deleteWorkoutSession, getWorkoutSessionDetail, listWorkoutSessionsForDate, resumeWorkoutSession, updateWorkoutSession } from '@/lib/db/workoutSessions';
import { getSelectedWorkoutId, setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import type { WorkoutDetail, WorkoutSummary } from '@/features/workouts/workout-types';
import { getActiveWorkout } from '@/lib/db/workouts';
import { useWorkoutDate } from '@/features/workouts/hooks/use-workout-date';
import { useLiveWorkout } from '@/features/workouts/hooks/use-live-workout';

let mockAppStateListener: (state: string) => void;
jest.mock('react-native', () => ({ AppState: {
  addEventListener: (_event: string, listener: (state: string) => void) => { mockAppStateListener = listener; return { remove: () => {} }; },
} }));
jest.mock('@/lib/db/workouts', () => ({ getActiveWorkout: jest.fn() }));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/lib/db/workoutSessions', () => ({
  getWorkoutSessionDetail: jest.fn(), listWorkoutSessionsForDate: jest.fn(),
  completeWorkoutSession: jest.fn(), createWorkoutSession: jest.fn(),
  resumeWorkoutSession: jest.fn(), updateWorkoutSession: jest.fn(), deleteWorkoutSession: jest.fn(),
  ActiveWorkoutConflictError: class extends Error {
    activeWorkoutId: number;
    constructor(id: number) { super('Another workout is active.'); this.activeWorkoutId = id; }
  },
}));

const summary = (id: number): WorkoutSummary => ({
  id, name: `Workout ${id}`, startedAt: 1_700_000_000_000, completedAt: null,
  note: null, exerciseCount: 0, setCount: 0, volumeKg: 0, inProgressCount: 0,
});
const detail = (id = 1): WorkoutDetail => ({ ...summary(id), exercises: [], unassignedSets: [] });
const recordedSet = (id: number): WorkoutDetail['exercises'][number]['sets'][number] => ({
  id, uid: `set-${id}`, workoutId: 1, exerciseId: 5, workoutExerciseId: id,
  setGroupId: null, setIndex: 0, weightKg: 0, reps: 5, rpe: null, rir: null,
  isWarmup: false, note: null, supersetGroupId: null, performedAt: 1_700_000_000_000,
});
let controller: ReturnType<typeof useWorkoutDetail>;
let listController: ReturnType<typeof useWorkoutList>;
let dateController: ReturnType<typeof useWorkoutDate>;
let tree: ReturnType<typeof renderer.create>;
function DetailHarness({ id = 1 }: { id?: number }) { controller = useWorkoutDetail(id); return null; }
function ListHarness({ day }: { day: number }) { listController = useWorkoutList(new Date(day)); return null; }
function DateHarness() { dateController = useWorkoutDate(); return null; }
let liveWorkout: WorkoutSummary | null;
function LiveHarness({ enabled }: { enabled: boolean }) { liveWorkout = useLiveWorkout(enabled); return null; }

describe('workout screen controllers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setSelectedWorkoutId(null);
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail());
    jest.mocked(listWorkoutSessionsForDate).mockResolvedValue([]);
    jest.mocked(getActiveWorkout).mockResolvedValue(null);
  });
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.useRealTimers(); });

  it('fetches the latest unfinished entries and waits for confirmation before completing', async () => {
    await act(async () => { tree = renderer.create(<DetailHarness />); });
    const latest = detail();
    latest.exercises = [
      { id: 11, exerciseId: 5, exerciseName: 'Bench press', completedAt: null, performedAt: null, note: null, sets: [recordedSet(11)] },
      { id: 12, exerciseId: 5, exerciseName: 'Bench press', completedAt: null, performedAt: null, note: null, sets: [recordedSet(12)] },
      { id: 13, exerciseId: 6, exerciseName: 'Row', completedAt: 123, performedAt: 123, note: null, sets: [recordedSet(13)] },
      { id: 14, exerciseId: 7, exerciseName: 'Unstarted exercise', completedAt: null, performedAt: null, note: null, sets: [] },
    ];
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(latest);
    await act(async () => { await controller.requestComplete(); });
    expect(controller.unfinished?.map((entry) => entry.id)).toEqual([11, 12]);
    expect(completeWorkoutSession).not.toHaveBeenCalled();
    await act(async () => { controller.cancelComplete(); });
    expect(completeWorkoutSession).not.toHaveBeenCalled();
    await act(async () => { await controller.requestComplete(); await controller.complete(); });
    expect(completeWorkoutSession).toHaveBeenCalledTimes(1);
    expect(completeWorkoutSession).toHaveBeenCalledWith(1);
    expect(controller.unfinished).toBeNull();
  });

  it('completes without an unfinished-exercise warning when there are only empty drafts', async () => {
    const latest = detail();
    latest.exercises = [{ id: 14, exerciseId: 7, exerciseName: 'Unstarted exercise',
      completedAt: null, performedAt: null, note: null, sets: [] }];
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(latest);
    await act(async () => { tree = renderer.create(<DetailHarness />); });
    await act(async () => { await controller.requestComplete(); });
    expect(controller.unfinished).toBeNull();
    expect(completeWorkoutSession).toHaveBeenCalledWith(1);
  });

  it('writes the workout name and note together and clears a blank note', async () => {
    await act(async () => { tree = renderer.create(<DetailHarness />); });
    await act(async () => { await controller.save('  Upper body  ', '  Felt strong  '); });
    expect(updateWorkoutSession).toHaveBeenCalledWith(1, { name: 'Upper body', note: 'Felt strong' });
    await act(async () => { await controller.save('Upper body', '   '); });
    expect(updateWorkoutSession).toHaveBeenLastCalledWith(1, { name: 'Upper body', note: null });
    jest.mocked(updateWorkoutSession).mockRejectedValueOnce(new Error('Could not save'));
    let saved = true;
    await act(async () => { saved = await controller.save('New name', 'note'); });
    expect(saved).toBe(false);
    expect(controller.error).toBe('Could not save');
  });

  it('keeps the selected active workout when resume conflicts', async () => {
    setSelectedWorkoutId(9);
    jest.mocked(resumeWorkoutSession).mockRejectedValue(new ActiveWorkoutConflictError(9));
    await act(async () => { tree = renderer.create(<DetailHarness />); });
    await act(async () => { expect(await controller.resume()).toBe(false); });
    expect(controller.conflictId).toBe(9);
    expect(getSelectedWorkoutId()).toBe(9);
  });

  it('does not allow a slow date response to overwrite the currently selected date', async () => {
    let finishOld!: (value: WorkoutSummary[]) => void;
    jest.mocked(listWorkoutSessionsForDate)
      .mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce([summary(2)]);
    await act(async () => { tree = renderer.create(<ListHarness day={100} />); });
    await act(async () => { tree.update(<ListHarness day={200} />); });
    expect(listController.workouts.map((workout) => workout.id)).toEqual([2]);
    await act(async () => { finishOld([summary(1)]); });
    expect(listController.workouts.map((workout) => workout.id)).toEqual([2]);
    expect(listController.loading).toBe(false);
  });

  it('surfaces the active-workout destination instead of creating another session', async () => {
    jest.mocked(createWorkoutSession).mockRejectedValue(new ActiveWorkoutConflictError(7));
    await act(async () => { tree = renderer.create(<ListHarness day={100} />); });
    await act(async () => { expect(await listController.create()).toBeNull(); });
    expect(listController.conflictId).toBe(7);
    expect(getSelectedWorkoutId()).toBeNull();
  });

  it('creates on the selected local day using the current clock time', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 23, 18, 42, 12, 50));
    jest.mocked(createWorkoutSession).mockResolvedValue(3);
    await act(async () => { tree = renderer.create(<ListHarness day={new Date(2026, 8, 10, 12).getTime()} />); });
    await act(async () => { await listController.create(); });
    expect(createWorkoutSession).toHaveBeenCalledWith(new Date(2026, 8, 10, 18, 42, 12, 50).getTime());
    expect(getSelectedWorkoutId()).toBe(3);
  });

  it('surfaces an active session from another day outside the selected date list', async () => {
    jest.mocked(getActiveWorkout).mockResolvedValue({ id: 7, uid: 'active', name: 'Yesterday', note: null, startedAt: 100, completedAt: null });
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail(7));
    await act(async () => { tree = renderer.create(<ListHarness day={200} />); });
    expect(listController.workouts).toEqual([]);
    expect(listController.activeElsewhere?.id).toBe(7);
    jest.mocked(listWorkoutSessionsForDate).mockResolvedValue([summary(7)]);
    await act(async () => { await listController.reload(); });
    expect(listController.activeElsewhere).toBeNull();
  });

  it('deletes from detail, clears a matching selection and reports failures without deleting twice', async () => {
    setSelectedWorkoutId(1);
    await act(async () => { tree = renderer.create(<DetailHarness />); });
    let finish!: () => void;
    jest.mocked(deleteWorkoutSession).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    let first!: Promise<boolean>;
    await act(async () => { first = controller.remove(); });
    expect(controller.busy).toBe(true);
    await act(async () => { expect(await controller.remove()).toBe(false); });
    await act(async () => { finish(); expect(await first).toBe(true); });
    expect(deleteWorkoutSession).toHaveBeenCalledTimes(1);
    expect(deleteWorkoutSession).toHaveBeenCalledWith(1);
    expect(getSelectedWorkoutId()).toBeNull();

    setSelectedWorkoutId(4);
    jest.mocked(deleteWorkoutSession).mockRejectedValueOnce(new Error('Could not delete'));
    await act(async () => { expect(await controller.remove()).toBe(false); });
    expect(controller.error).toBe('Could not delete');
    expect(getSelectedWorkoutId()).toBe(4);
    await act(async () => { controller.clearError(); });
    expect(controller.error).toBeNull();
  });

  it('deletes from the list, drops the card at once and keeps other selections', async () => {
    setSelectedWorkoutId(9);
    jest.mocked(listWorkoutSessionsForDate).mockResolvedValue([summary(1), summary(2)]);
    await act(async () => { tree = renderer.create(<ListHarness day={100} />); });
    jest.mocked(listWorkoutSessionsForDate).mockResolvedValue([summary(1)]);
    await act(async () => { expect(await listController.remove(2)).toBe(true); });
    expect(deleteWorkoutSession).toHaveBeenCalledWith(2);
    expect(listController.workouts.map((workout) => workout.id)).toEqual([1]);
    expect(getSelectedWorkoutId()).toBe(9);
    expect(listController.deleting).toBe(false);

    jest.mocked(deleteWorkoutSession).mockRejectedValueOnce(new Error('Could not delete'));
    await act(async () => { expect(await listController.remove(1)).toBe(false); });
    expect(listController.deleteError).toBe('Could not delete');
    expect(listController.workouts.map((workout) => workout.id)).toEqual([1]);
    await act(async () => { listController.clearDeleteError(); });
    expect(listController.deleteError).toBeNull();
  });

  it('reads the live workout only while enabled and drops it when completed or unreadable', async () => {
    jest.mocked(getActiveWorkout).mockResolvedValue({ id: 7, uid: 'active', name: null, note: null, startedAt: 100, completedAt: null });
    jest.mocked(getWorkoutSessionDetail).mockResolvedValue(detail(7));
    await act(async () => { tree = renderer.create(<LiveHarness enabled={false} />); });
    expect(liveWorkout).toBeNull();
    expect(getActiveWorkout).not.toHaveBeenCalled();

    await act(async () => { tree.update(<LiveHarness enabled />); });
    expect(liveWorkout?.id).toBe(7);

    // The app returning to the foreground re-reads: the workout was completed elsewhere.
    jest.mocked(getActiveWorkout).mockResolvedValue(null);
    await act(async () => { mockAppStateListener('active'); });
    expect(liveWorkout).toBeNull();

    jest.mocked(getActiveWorkout).mockRejectedValue(new Error('locked'));
    await act(async () => { mockAppStateListener('active'); });
    expect(liveWorkout).toBeNull();

    jest.mocked(getActiveWorkout).mockResolvedValue({ id: 7, uid: 'active', name: null, note: null, startedAt: 100, completedAt: null });
    await act(async () => { mockAppStateListener('active'); });
    expect(liveWorkout?.id).toBe(7);
    await act(async () => { tree.update(<LiveHarness enabled={false} />); });
    expect(liveWorkout).toBeNull();
  });

  it('follows today over midnight but preserves a deliberately selected historical day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 23, 23, 59));
    await act(async () => { tree = renderer.create(<DateHarness />); });
    jest.setSystemTime(new Date(2026, 8, 24, 0, 1));
    await act(async () => { mockAppStateListener('active'); });
    expect(dateController.date.getDate()).toBe(24);
    await act(async () => { dateController.setDate(new Date(2026, 8, 10)); });
    jest.setSystemTime(new Date(2026, 8, 25, 0, 1));
    await act(async () => { mockAppStateListener('active'); });
    expect(dateController.date.getDate()).toBe(10);
  });
});
