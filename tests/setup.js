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

// Test data: BCG vaccine meta-analysis (classic dataset).
//
// Source: metafor's `dat.bcg` (Colditz et al. 1994), then
//   escalc(measure="RR", ai=tpos, bi=tneg, ci=cpos, di=cneg)
// per-trial 2x2 tables:
//   tpos tneg cpos cneg
//      4  119  11  128
//      6  300  29  274
//      3  228  11  209
//     62 13536 248 12619
//     33  5036  47  5761
//    180  1361 372  1079
//      8  2537  10   619
//    505 87886 499 87892
//     29  7470  45  7232
//     17  1699  65  1600
//    186 50448 141 27197
//      5   2493  3  2338
//     27  16886 29 17825
//
// vi = 1/tp - 1/(tp+tn) + 1/cp - 1/(cp+cn)  per Cochrane Handbook §10.4.
// Earlier vi values in this fixture were ~8-10× too small (origin
// unknown), causing tau²_DL to come out at 0.486 instead of 0.309.
global.BCG_DATA = {
  yi: [-0.889311, -1.585389, -1.348073, -1.441551, -0.217547, -0.786116,
       -1.620898,  0.011952, -0.469418, -1.371345, -0.339359,  0.445913,
       -0.017314],
  vi: [ 0.325585,  0.194581,  0.415368,  0.020010,  0.051210,  0.006906,
        0.223017,  0.003962,  0.056434,  0.073025,  0.012412,  0.532506,
        0.071405],
  k: 13,
  // Expected values from R metafor's rma(yi, vi, method=...) on the
  // canonical inputs above.
  expected: {
    pooled_FE: -0.4361,
    pooled_RE_DL: -0.7141,
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
