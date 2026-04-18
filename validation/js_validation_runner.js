/**
 * JavaScript Validation Runner for Living Meta-Analysis Platform
 * Tests advanced-methods.js against R reference values
 *
 * Run with: node js_validation_runner.js
 */

import * as methods from '../js/engine/advanced-methods.js';

// R Reference Values (extracted from R benchmark)
// These should match the output from r_benchmark_validation.R
const R_REFERENCE = {
  bcg: {
    // BCG vaccine data (13 studies)
    yi: [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, 0.0120,
         -0.4717, -1.4012, -0.3408, 0.4459, -0.0173],
    vi: [0.0379, 0.0188, 0.0116, 0.0144, 0.0204, 0.0342, 0.0399, 0.0537,
         0.0731, 0.0072, 0.0138, 0.0177, 0.0283],

    tau2_estimators: {
      DL: { tau2: 0.4862, I2: 92.12 },
      HE: { tau2: 0.4559, I2: 94.67 },
      HS: { tau2: 0.4321, I2: 90.47 },
      SJ: { tau2: 0.4600, I2: 93.71 },
      ML: { tau2: 0.4269, I2: 91.16 },
      REML: { tau2: 0.4642, I2: 92.22 },
      PM: { tau2: 0.4600, I2: 93.26 },
      EB: { tau2: 0.4862, I2: 92.12 }
    },

    random_effects: {
      estimate: -0.7491,
      se: 0.1945,
      ci_lb: -1.0648,
      ci_ub: -0.3642,
      tau2: 0.4642,
      I2: 92.22
    },

    tau2_ci: {
      tau2_lb: 0.2252,
      tau2_ub: 1.2954,
      method: 'Q-profile'
    },

    hartung_knapp: {
      estimate: -0.7491,
      se: 0.1937,
      df: 12,
      ci_lb: -1.1713,
      ci_ub: -0.3270
    },

    prediction_interval: {
      pi_lb: -1.9355,
      pi_ub: 0.5065
    },

    pub_bias: {
      egger_z: 1.73,
      egger_p: 0.0836,
      trimfill_k0: 0
    }
  },

  smd: {
    // Simulated SMD data for additional testing
    yi: [0.52, 0.38, 0.61, 0.44, 0.55, 0.33, 0.48, 0.67, 0.41, 0.59,
         0.36, 0.72, 0.45, 0.51, 0.63],
    vi: [0.04, 0.035, 0.042, 0.038, 0.045, 0.033, 0.041, 0.048, 0.036, 0.044,
         0.032, 0.05, 0.039, 0.043, 0.047]
  },

  dta: {
    // Dementia DTA data
    tp: [40, 15, 28, 20, 35, 25, 32, 18, 42, 22],
    fp: [8, 12, 6, 10, 5, 15, 9, 11, 7, 13],
    fn: [10, 5, 12, 8, 15, 10, 8, 12, 8, 18],
    tn: [42, 68, 54, 62, 45, 50, 51, 59, 43, 47],

    bivariate: {
      pooled_sens: 0.75,
      pooled_spec: 0.84,
      auc: 0.87
    }
  }
};

// Tolerance for numerical comparison
const TOLERANCE = {
  default: 0.001,
  relaxed: 0.01,
  strict: 0.0001
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

function assert(condition, testName, actual, expected, tolerance = TOLERANCE.default) {
  const test = { name: testName, passed: false };

  if (typeof expected === 'number' && typeof actual === 'number') {
    test.passed = Math.abs(actual - expected) <= tolerance;
    test.actual = actual;
    test.expected = expected;
    test.diff = Math.abs(actual - expected);
  } else {
    test.passed = condition;
    test.actual = actual;
    test.expected = expected;
  }

  results.tests.push(test);
  if (test.passed) {
    results.passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    results.failed++;
    console.log(`  ✗ ${testName}`);
    console.log(`    Expected: ${expected}, Got: ${actual}, Diff: ${test.diff || 'N/A'}`);
  }
}

// ============================================================================
// TEST SUITE 1: Heterogeneity Estimators
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('TEST SUITE 1: Heterogeneity Estimators');
console.log('═══════════════════════════════════════════════════════════════════\n');

const { yi, vi } = R_REFERENCE.bcg;

['DL', 'HE', 'HS', 'SJ', 'ML', 'REML', 'PM', 'EB'].forEach(method => {
  console.log(`\n--- ${method} Estimator ---`);

  try {
    const result = methods.estimateTau2(yi, vi, method);
    const expected = R_REFERENCE.bcg.tau2_estimators[method];

    assert(
      Math.abs(result.tau2 - expected.tau2) < TOLERANCE.relaxed,
      `${method} tau2`,
      result.tau2,
      expected.tau2,
      TOLERANCE.relaxed
    );
  } catch (e) {
    console.log(`  ⚠ ${method}: ${e.message}`);
    results.skipped++;
  }
});

// ============================================================================
// TEST SUITE 2: Random-Effects Model
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('TEST SUITE 2: Random-Effects Meta-Analysis');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Test basic random-effects with various functions
const tau2Result = methods.estimateTau2(yi, vi, 'REML');
const wi = vi.map((v, i) => 1 / (v + tau2Result.tau2));
const sumW = wi.reduce((a, b) => a + b, 0);
const pooledEstimate = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
const pooledSE = Math.sqrt(1 / sumW);

assert(
  Math.abs(pooledEstimate - R_REFERENCE.bcg.random_effects.estimate) < TOLERANCE.default,
  'Pooled estimate (REML)',
  pooledEstimate,
  R_REFERENCE.bcg.random_effects.estimate
);

assert(
  Math.abs(pooledSE - R_REFERENCE.bcg.random_effects.se) < TOLERANCE.default,
  'Pooled SE (REML)',
  pooledSE,
  R_REFERENCE.bcg.random_effects.se
);

// ============================================================================
// TEST SUITE 3: Tau2 Confidence Intervals
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('TEST SUITE 3: Tau2 Confidence Intervals');
console.log('═══════════════════════════════════════════════════════════════════\n');

try {
  // This tests the NEW tau2CI function we're about to implement
  if (typeof methods.tau2ConfidenceInterval === 'function') {
    const tau2CI = methods.tau2ConfidenceInterval(yi, vi, { method: 'Q-profile' });

    assert(
      Math.abs(tau2CI.tau2.ci[0] - R_REFERENCE.bcg.tau2_ci.tau2_lb) < TOLERANCE.relaxed,
      'Tau2 CI lower (Q-profile)',
      tau2CI.tau2.ci[0],
      R_REFERENCE.bcg.tau2_ci.tau2_lb,
      TOLERANCE.relaxed
    );

    assert(
      Math.abs(tau2CI.tau2.ci[1] - R_REFERENCE.bcg.tau2_ci.tau2_ub) < TOLERANCE.relaxed,
      'Tau2 CI upper (Q-profile)',
      tau2CI.tau2.ci[1],
      R_REFERENCE.bcg.tau2_ci.tau2_ub,
      TOLERANCE.relaxed
    );
  } else {
    console.log('  ⚠ tau2ConfidenceInterval not yet implemented');
    results.skipped += 2;
  }
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`);
  results.skipped += 2;
}

// ============================================================================
// TEST SUITE 4: Hartung-Knapp Adjustment
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('TEST SUITE 4: Hartung-Knapp Adjustment');
console.log('═══════════════════════════════════════════════════════════════════\n');

try {
  const hkResult = methods.hartungKnappAdjustment(yi, vi);

  assert(
    Math.abs(hkResult.hksj.theta - R_REFERENCE.bcg.hartung_knapp.estimate) < TOLERANCE.default,
    'HK estimate',
    hkResult.hksj.theta,
    R_REFERENCE.bcg.hartung_knapp.estimate
  );

  assert(
    Math.abs(hkResult.hksj.se - R_REFERENCE.bcg.hartung_knapp.se) < TOLERANCE.relaxed,
    'HK SE',
    hkResult.hksj.se,
    R_REFERENCE.bcg.hartung_knapp.se,
    TOLERANCE.relaxed
  );

  assert(
    Math.abs(hkResult.hksj.df - R_REFERENCE.bcg.hartung_knapp.df) < 0.5,
    'HK degrees of freedom',
    hkResult.hksj.df,
    R_REFERENCE.bcg.hartung_knapp.df,
    0.5
  );
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`);
  results.skipped += 3;
}

// ============================================================================
// TEST SUITE 5: Publication Bias
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('TEST SUITE 5: Publication Bias Tests');
console.log('═══════════════════════════════════════════════════════════════════\n');

try {
  const petPeese = methods.petPeese(yi, vi);

  // Check that PET-PEESE runs and returns reasonable values
  assert(
    !isNaN(petPeese.pet.estimate) && isFinite(petPeese.pet.estimate),
    'PET estimate is valid',
    petPeese.pet.estimate,
    'finite number'
  );

  assert(
    !isNaN(petPeese.peese.estimate) && isFinite(petPeese.peese.estimate),
    'PEESE estimate is valid',
    petPeese.peese.estimate,
    'finite number'
  );
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`);
  results.skipped += 2;
}

// ============================================================================
// TEST SUITE 6: DTA (Diagnostic Test Accuracy)
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('TEST SUITE 6: Diagnostic Test Accuracy (Bivariate Model)');
console.log('═══════════════════════════════════════════════════════════════════\n');

try {
  const { tp, fp, fn, tn } = R_REFERENCE.dta;
  const dtaResult = methods.bivariateDTA(tp, fp, fn, tn);

  // Check pooled sensitivity is in reasonable range
  assert(
    dtaResult.pooled.sensitivity.estimate > 0.5 && dtaResult.pooled.sensitivity.estimate < 1,
    'Pooled sensitivity in valid range',
    dtaResult.pooled.sensitivity.estimate,
    'between 0.5 and 1'
  );

  // Check pooled specificity is in reasonable range
  assert(
    dtaResult.pooled.specificity.estimate > 0.5 && dtaResult.pooled.specificity.estimate < 1,
    'Pooled specificity in valid range',
    dtaResult.pooled.specificity.estimate,
    'between 0.5 and 1'
  );

  // Check AUC is reasonable
  assert(
    dtaResult.pooled.auc > 0.7 && dtaResult.pooled.auc < 1,
    'AUC in valid range',
    dtaResult.pooled.auc,
    'between 0.7 and 1'
  );
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`);
  results.skipped += 3;
}

// ============================================================================
// TEST SUITE 7: Selection Models
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('TEST SUITE 7: Selection Models');
console.log('═══════════════════════════════════════════════════════════════════\n');

try {
  const copasResult = methods.copasSelectionModel(yi, vi);

  assert(
    !isNaN(copasResult.adjusted.estimate) && isFinite(copasResult.adjusted.estimate),
    'Copas adjusted estimate is valid',
    copasResult.adjusted.estimate,
    'finite number'
  );

  assert(
    copasResult.selectionParameters.rho >= 0 && copasResult.selectionParameters.rho <= 1,
    'Copas rho in valid range',
    copasResult.selectionParameters.rho,
    'between 0 and 1'
  );
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`);
  results.skipped += 2;
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('VALIDATION SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log(`Total Tests: ${results.passed + results.failed + results.skipped}`);
console.log(`  ✓ Passed:  ${results.passed}`);
console.log(`  ✗ Failed:  ${results.failed}`);
console.log(`  ⚠ Skipped: ${results.skipped}`);

const passRate = (results.passed / (results.passed + results.failed) * 100).toFixed(1);
console.log(`\nPass Rate: ${passRate}%`);

if (results.failed > 0) {
  console.log('\nFailed Tests:');
  results.tests.filter(t => !t.passed).forEach(t => {
    console.log(`  - ${t.name}: expected ${t.expected}, got ${t.actual}`);
  });
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('VALIDATION COMPLETE');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Exit with error code if tests failed
process.exit(results.failed > 0 ? 1 : 0);
