const routerProject = require('./jest.router.config');

const unitProject = {
  displayName: 'unit',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.codex-artifacts/',
    '<rootDir>/__tests__/setup.ts',
    '<rootDir>/__tests__/routing/profile-route-guards.test.tsx',
    '<rootDir>/__tests__/routing/replacement-restore-native-intent.test.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { configFile: './babel.test.config.js' },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(drizzle-orm|program-specification-language|@noble/hashes)/)',
  ],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    '!lib/**/*.d.ts',
    '!**/node_modules/**',
  ],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

module.exports = {
  projects: [unitProject, routerProject],
};
