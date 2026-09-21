import React from 'react';

export const mockSeedTestDataExercise = jest.fn(async () => undefined);
export const mockUseNotificationHandler = jest.fn();
export const mockLockAsync = jest.fn(() => Promise.resolve());

jest.mock('../../lib/db/connection', () => ({}));
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
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
