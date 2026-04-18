/**
 * Jest setup file for Meta-Analysis Superapp tests
 */

// Custom matchers for statistical comparisons
expect.extend({
  /**
   * Matcher for comparing floating point numbers within tolerance
   * @param {number} received - The actual value
   * @param {number} expected - The expected value
   * @param {number} tolerance - Acceptable difference (default: 1e-6)
   */
  toBeCloseTo(received, expected, tolerance = 1e-6) {
    const pass = Math.abs(received - expected) <= tolerance;
    return {
      pass,
      message: () =>
        `expected ${received} to be close to ${expected} within tolerance ${tolerance}\n` +
        `Difference: ${Math.abs(received - expected)}`
    };
  },

  /**
   * Matcher for comparing arrays of numbers within tolerance
   * @param {number[]} received - The actual array
   * @param {number[]} expected - The expected array
   * @param {number} tolerance - Acceptable difference per element
   */
  toArrayBeCloseTo(received, expected, tolerance = 1e-4) {
    if (!Array.isArray(received) || !Array.isArray(expected)) {
      return {
        pass: false,
        message: () => 'Expected both values to be arrays'
      };
    }
    if (received.length !== expected.length) {
      return {
        pass: false,
        message: () =>
          `Array lengths differ: received ${received.length}, expected ${expected.length}`
      };
    }

    const differences = [];
    for (let i = 0; i < received.length; i++) {
      if (Math.abs(received[i] - expected[i]) > tolerance) {
        differences.push({
          index: i,
          received: received[i],
          expected: expected[i],
          diff: Math.abs(received[i] - expected[i])
        });
      }
    }

    const pass = differences.length === 0;
    return {
      pass,
      message: () => pass
        ? `Arrays match within tolerance ${tolerance}`
        : `Arrays differ at indices: ${JSON.stringify(differences, null, 2)}`
    };
  },

  /**
   * Matcher for checking if a value is within a confidence interval
   */
  toBeWithinCI(received, ci) {
    const [lower, upper] = ci;
    const pass = received >= lower && received <= upper;
    return {
      pass,
      message: () =>
        `expected ${received} to be within CI [${lower}, ${upper}]`
    };
  },

  /**
   * Matcher for checking statistical significance
   */
  toBeSignificant(received, alpha = 0.05) {
    const pass = received < alpha;
    return {
      pass,
      message: () =>
        `expected p-value ${received} to be ${pass ? '' : 'not '}significant at alpha=${alpha}`
    };
  }
});

// Tolerance levels for different test types
global.TOLERANCES = {
  STRICT: 1e-6,    // Point estimates
  STANDARD: 1e-4,  // Standard errors, CIs
  RELAXED: 1e-2,   // MCMC-based results
  BOOTSTRAP: 0.05  // Bootstrap results (higher variance)
};

// Test data: BCG vaccine meta-analysis (classic dataset)
global.BCG_DATA = {
  yi: [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, 0.0120,
       -0.4717, -1.4012, -0.3408, 0.4459, -0.0173],
  vi: [0.0379, 0.0188, 0.0116, 0.0144, 0.0204, 0.0342, 0.0399, 0.0537,
       0.0731, 0.0072, 0.0138, 0.0177, 0.0283],
  k: 13,
  // Expected values from R metafor
  expected: {
    pooled_FE: -0.7145,
    pooled_RE_DL: -0.7452,
    tau2_DL: 0.3088,
    tau2_REML: 0.3132,
    I2: 92.22,
    Q: 152.23
  }
};

// Test data: Simple 5-study meta-analysis
global.SIMPLE_DATA = {
  yi: [0.5, 0.3, 0.7, 0.4, 0.6],
  vi: [0.04, 0.05, 0.03, 0.06, 0.04],
  k: 5
};

// Test data: Zero heterogeneity case
global.HOMOGENEOUS_DATA = {
  yi: [0.5, 0.5, 0.5, 0.5],
  vi: [0.1, 0.1, 0.1, 0.1],
  k: 4
};

// Test data: DTA 2x2 tables
global.DTA_DATA = {
  tp: [47, 126, 60, 73, 144, 13, 82, 34],
  fp: [3, 8, 5, 11, 21, 2, 17, 5],
  fn: [14, 17, 14, 11, 23, 0, 35, 4],
  tn: [136, 149, 121, 105, 112, 35, 116, 57],
  k: 8
};

// Helper function to generate random seed for reproducible tests
global.setSeed = (seed) => {
  // Simple seeded random for testing
  let s = seed;
  return () => {
    s = Math.sin(s) * 10000;
    return s - Math.floor(s);
  };
};

// Console output suppression for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = () => {};
    console.warn = () => {};
  }
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});
