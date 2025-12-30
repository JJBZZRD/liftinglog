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

// Global test timeout
jest.setTimeout(10000);
