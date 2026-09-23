import renderer, { act } from 'react-test-renderer';

const mockList = jest.fn();
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('react-native', () => ({ ActivityIndicator: 'Spinner', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }));
jest.mock('react-native-calendars', () => ({ Calendar: 'Calendar' }));
jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn() } }));
jest.mock('../../components/modals/BaseModal', () => 'AppModal');
jest.mock('../../components/workouts/workout-theme', () => ({ useWorkoutTheme: () => ({ rawColors: new Proxy({}, { get: () => '#000' }) }) }));
jest.mock('../../lib/db/workoutSessions', () => ({ listWorkoutSessionsForDate: mockList }));

const WorkoutPicker = require('../../components/exercise/recording/workout-picker-modal').default;

describe('workout picker day and session selection', () => {
  const date = new Date('2026-09-20T12:00:00');
  const first = { id: 10, name: 'Morning workout', startedAt: date.getTime(), completedAt: null, exerciseCount: 2 };
  const second = { ...first, id: 11, name: 'Evening workout', completedAt: date.getTime(), exerciseCount: 4 };

  beforeEach(() => { jest.clearAllMocks(); mockList.mockResolvedValue([first, second]); });

  it('lists multiple workouts on the same day and requires a workout choice after changing the day', async () => {
    const onSelect = jest.fn().mockResolvedValue(undefined), onClose = jest.fn();
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => { tree = renderer.create(<WorkoutPicker visible date={date} workoutId={10} onSelect={onSelect} onClose={onClose} />); });
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Select Morning workout 10' })).toHaveLength(1);
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Select Evening workout 11' })).toHaveLength(1);
    await act(async () => { tree!.root.findByType('Calendar').props.onDayPress({ dateString: '2026-09-19' }); });
    expect(mockList).toHaveBeenLastCalledWith(new Date('2026-09-19T12:00:00').getTime());
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { await tree!.root.findByProps({ accessibilityLabel: 'Select Evening workout 11' }).props.onPress(); });
    expect(onSelect).toHaveBeenCalledWith(second);
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => tree!.unmount());
  });

  it('keeps the picker open and reports a failed move', async () => {
    const onSelect = jest.fn().mockRejectedValue(new Error('Resume the destination workout first.')), onClose = jest.fn();
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => { tree = renderer.create(<WorkoutPicker visible date={date} workoutId={10} onSelect={onSelect} onClose={onClose} />); });
    await act(async () => { await tree!.root.findByProps({ accessibilityLabel: 'Select Evening workout 11' }).props.onPress(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ accessibilityRole: 'alert' }).props.children).toBe('Resume the destination workout first.');
    await act(async () => tree!.unmount());
  });
});
