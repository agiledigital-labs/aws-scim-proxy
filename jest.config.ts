import type { Config } from '@jest/types';

export default async (): Promise<Config.InitialOptions> => ({
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '^.+\\.test\\.tsx?$',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 94.29,
      lines: 97.87,
      statements: 98.13,
    },
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  roots: ['src'],
  setupFiles: ['./.jest/setup.test.ts'],
});
