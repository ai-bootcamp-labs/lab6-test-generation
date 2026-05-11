/**
 * Jest config used exclusively by Stryker mutation testing.
 *
 * Mirrors the `unit` project from jest.config.ts but flattened (no `projects`
 * key) so Stryker's jest-runner can run a single in-process Jest invocation.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testTimeout: 60000,
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  testMatch: ['**/tests/unit/**/*.spec.ts'],
};
