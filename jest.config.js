/**
 * Jest configuration for Meta-Analysis Superapp
 */
export default {
  testEnvironment: 'node',

  // ES Modules support
  transform: {},

  // File extensions to consider
  moduleFileExtensions: ['js', 'mjs', 'json'],

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.test.mjs'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/validation/'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'js/engine/**/*.js',
    '!js/engine/**/*.worker.js',
    '!**/node_modules/**'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Coverage report formats
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage directory
  coverageDirectory: 'coverage',

  // Verbose output
  verbose: true,

  // Test timeout. Bumped to 90s — selection-models grid search +
  // bayesian MCMC chains both pushed past 30s on Windows. SIGTERM
  // exit-code 143 ("worker crashed") at the suite level traced back
  // here: jest hard-killed the worker on any test exceeding 30s.
  testTimeout: 90000,

  // Module isolation — under --runInBand all suites share one node
  // worker. Without resetModules, ESM module-level state in
  // advanced-methods.js leaks across suites and selection-models.test.js
  // sees wrong results (8 failures of 29 tests when run after the other
  // 6 suites; 0 failures when run alone). resetModules forces a fresh
  // import graph per test file — fixes the inter-suite leak.
  resetModules: true,
  clearMocks: true,

  // Setup files
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Module name mapper for imports
  moduleNameMapper: {
    '^@engine/(.*)$': '<rootDir>/js/engine/$1',
    '^@utils/(.*)$': '<rootDir>/js/utils/$1'
  }
};
