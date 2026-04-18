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

  // Test timeout (increased for MCMC tests)
  testTimeout: 30000,

  // Setup files
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Module name mapper for imports
  moduleNameMapper: {
    '^@engine/(.*)$': '<rootDir>/js/engine/$1',
    '^@utils/(.*)$': '<rootDir>/js/utils/$1'
  }
};
