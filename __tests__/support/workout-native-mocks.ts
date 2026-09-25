/* Native rendering boundaries; keep workout screen/controller behavior real. */
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../assets/branding/liftinglog-logo.svg', () => 1);
jest.mock('expo-blur', () => ({ BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path', Rect: 'Rect' }));
jest.mock('react-native-reanimated', () => {
  const animation = { duration: () => animation, delay: () => animation, reduceMotion: () => animation };
  return { __esModule: true, default: { View: 'View' }, FadeInDown: animation, LinearTransition: animation, ReduceMotion: { System: 'system' }, useReducedMotion: () => false };
});
jest.mock('../../components/workouts/scroll-fade', () => ({ ScrollFade: () => null }));
jest.mock('../../components/workouts/workout-calendar', () => ({ WorkoutCalendar: () => null }));
jest.mock('../../components/workouts/workout-theme', () => ({
  WorkoutThemeBoundary: ({ children }: { children: unknown }) => children,
}));
