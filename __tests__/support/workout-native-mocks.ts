/* Native rendering boundaries; keep workout screen/controller behavior real. */
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../assets/branding/liftinglog-logo.svg', () => 1);
jest.mock('expo-blur', () => ({ BlurTargetView: 'BlurTargetView', BlurView: 'BlurView' }));
jest.mock('react-native-reanimated', () => {
  const animation = { duration: () => animation, delay: () => animation, reduceMotion: () => animation };
  return {
    __esModule: true, default: { View: 'View', ScrollView: 'ScrollView' }, FadeInDown: animation, LinearTransition: animation, ReduceMotion: { System: 'system' },
    useReducedMotion: () => false, useSharedValue: (value: unknown) => ({ value }), useAnimatedStyle: (style: () => unknown) => style(),
    withTiming: (value: unknown) => value, withDelay: (_delay: number, value: unknown) => value, withRepeat: (value: unknown) => value,
    cancelAnimation: () => undefined, runOnJS: (fn: unknown) => fn, Easing: { linear: 'linear', quad: 'quad', out: (value: unknown) => value },
  };
});
jest.mock('../../lib/design-system/use-scroll-edge-fades', () => ({
  useScrollEdgeFades: () => ({ topOpacity: { value: 0 }, bottomOpacity: { value: 0 }, scrollProps: {} }),
}));
jest.mock('../../components/workouts/scroll-fade', () => ({ ScrollFade: () => null }));
jest.mock('../../components/workouts/workout-calendar', () => ({ WorkoutCalendar: () => null }));
jest.mock('../../components/workouts/workout-theme', () => ({
  WorkoutThemeBoundary: ({ children }: { children: unknown }) => children,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
