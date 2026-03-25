// Jest setup file for WorkoutLog tests
// Minimal setup for pure unit tests

// Mock console.warn to suppress Expo warnings in tests
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Notifications') || args[0].includes('Expo'))
  ) {
    return;
  }
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('react-test-renderer is deprecated')
  ) {
    return;
  }
  originalError(...args);
};

// Global test timeout
jest.setTimeout(10000);

// Match the React Native global used in app code.
(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;
(global as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
