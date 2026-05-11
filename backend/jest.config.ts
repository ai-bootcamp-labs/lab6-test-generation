import type { Config } from 'jest';

/**
 * Jest configuration for the auth backend.
 *
 * Uses ts-jest in ESM mode with three projects (unit / integration / e2e).
 * Coverage thresholds enforce Constitution Principle III (≥ 80% line + branch
 * on business-logic modules).
 */
const baseTransform: NonNullable<Config['transform']> = {
  '^.+\\.ts$': [
    'ts-jest',
    {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.json',
    },
  ],
};

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testTimeout: 60000,
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/auth/services/**/*.ts',
    'src/auth/domain/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
    'src/auth/services/': {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
    'src/auth/domain/': {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
  },
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
      testEnvironment: 'node',
      transform: baseTransform,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
      testEnvironment: 'node',
      transform: baseTransform,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.spec.ts'],
      testEnvironment: 'node',
      transform: baseTransform,
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    },
  ],
};

export default config;
