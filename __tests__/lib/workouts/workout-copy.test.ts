import { deleteWorkoutCopy, relativeDayLabel } from '@/features/workouts/workout-types';

describe('relativeDayLabel', () => {
  const today = new Date(2026, 8, 26, 9, 30);
  it.each([
    [new Date(2026, 8, 26, 23, 59), 'Today'],
    [new Date(2026, 8, 25, 0, 1), 'Yesterday'],
    [new Date(2026, 8, 27), 'Tomorrow'],
    [new Date(2026, 8, 24), '2 days ago'],
    [new Date(2026, 8, 13), '13 days ago'],
    [new Date(2026, 9, 1), 'In 5 days'],
    [new Date(2026, 8, 12), null],
    [new Date(2025, 11, 30), '2025'],
  ])('labels %s as %s', (date, label) => {
    expect(relativeDayLabel(date, today)).toBe(label);
  });

  it('counts calendar days across a daylight-saving change', () => {
    // Spans the UK clock change on 25 October 2026 in local-time environments that observe it.
    expect(relativeDayLabel(new Date(2026, 9, 24, 12), new Date(2026, 9, 26, 1))).toBe('2 days ago');
  });
});

describe('deleteWorkoutCopy', () => {
  const workout = { name: 'Push Day', completedAt: 1, exerciseCount: 4, setCount: 14 };

  it('says what will be lost and that it cannot be undone', () => {
    expect(deleteWorkoutCopy(workout)).toEqual({
      title: 'Delete Push Day?',
      message: '4 exercises and 14 sets will be deleted. PBs set in this workout will be recalculated. Videos stay in your gallery.',
      emphasis: 'This can’t be undone.',
      confirmLabel: 'Delete',
    });
    expect(deleteWorkoutCopy({ ...workout, exerciseCount: 1, setCount: 1 }).message).toMatch(/^1 exercise and 1 set will/);
  });

  it('offers to discard an in-progress workout with no sets', () => {
    expect(deleteWorkoutCopy({ ...workout, completedAt: null, exerciseCount: 0, setCount: 0 })).toMatchObject({
      title: 'Discard workout?', confirmLabel: 'Discard', emphasis: undefined,
    });
  });

  it('still deletes an in-progress workout that has sets, and a completed empty one', () => {
    expect(deleteWorkoutCopy({ ...workout, completedAt: null }).title).toBe('Delete Push Day?');
    expect(deleteWorkoutCopy({ ...workout, name: '', setCount: 0, exerciseCount: 0 })).toMatchObject({
      title: 'Delete Workout?', message: 'This workout has no logged sets. It will be removed from your history.',
    });
  });
});
