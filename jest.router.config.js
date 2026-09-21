const jestExpo = require('jest-expo/jest-preset');

module.exports = {
  ...jestExpo,
  displayName: 'router',
  setupFilesAfterEnv: [
    ...(jestExpo.setupFilesAfterEnv ?? []),
    '<rootDir>/__tests__/helpers/profileRouteSetup.ts',
  ],
  testMatch: ['<rootDir>/__tests__/routing/profile-route-guards.test.tsx'],
  moduleNameMapper: {
    ...(jestExpo.moduleNameMapper ?? {}),
    '^@/(.*)$': '<rootDir>/$1',
  },
};
