import React from 'react';

export const mockSeedTestDataExercise = jest.fn(async () => undefined);
export const mockUseNotificationHandler = jest.fn();
export const mockLockAsync = jest.fn(() => Promise.resolve());
export const mockActivateWhenAppReady = jest.fn();
const mockReadyStartupSnapshot = {
  phase: 'ready' as const,
  connectionInitialized: true as const,
  canMountApp: true as const,
};

jest.mock('../../lib/timerStore', () => ({
  timerStore: { activateWhenAppReady: mockActivateWhenAppReady },
}));

export { mockReadyStartupSnapshot };
jest.mock('../../app/global.css', () => ({}));
jest.mock('../../lib/db/seedTestData', () => ({
  seedTestDataExercise: mockSeedTestDataExercise,
}));
jest.mock('../../lib/notificationHandler', () => ({
  useNotificationHandler: mockUseNotificationHandler,
}));
jest.mock('../../lib/theme/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ isDark: false }),
}));
jest.mock('../../lib/contexts/UnitPreferenceContext', () => ({
  UnitPreferenceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 'PORTRAIT_UP' },
  lockAsync: mockLockAsync,
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
// expo-router's testing library mocks Reanimated with `react-native-reanimated/mock`,
// which needs the worklets runtime. Without this it silently falls back to `{}`.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
