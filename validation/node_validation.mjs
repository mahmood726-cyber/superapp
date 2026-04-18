/**
 * Node.js Validation for Meta-Analysis Superapp
 * Tests all major functions from advanced-methods.js
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the advanced-methods.js file
const jsPath = join(__dirname, '..', 'js', 'engine', 'advanced-methods.js');
const jsContent = readFileSync(jsPath, 'utf8');

// Create a mock module environment
const mockWindow = {};
const mockDocument = {};
global.window = mockWindow;
global.document = mockDocument;

// Execute the JavaScript in Node context
// We need to extract the function definitions
const functionCode = jsContent
  .replace(/^export\s+/gm, '')
  .replace(/^import\s+.*$/gm, '');

// Create function context
const context = {};
try {
  const wrappedCode = `
    (function(exports) {
      ${functionCode}

      // Export all functions
      exports.randomEffectsMeta = typeof randomEffectsMeta !== 'undefined' ? randomEffectsMeta : null;
      exports.tau2DerSimonianLaird = typeof tau2DerSimonianLaird !== 'undefined' ? tau2DerSimonianLaird : null;
      exports.tau2REML = typeof tau2REML !== 'undefined' ? tau2REML : null;
      exports.tau2PauleMandel = typeof tau2PauleMandel !== 'undefined' ? tau2PauleMandel : null;
      exports.eggerTest = typeof eggerTest !== 'undefined' ? eggerTest : null;
      exports.petPeese = typeof petPeese !== 'undefined' ? petPeese : null;
      exports.trimAndFill = typeof trimAndFill !== 'undefined' ? trimAndFill : null;
      exports.copasSelectionModel = typeof copasSelectionModel !== 'undefined' ? copasSelectionModel : null;
      exports.bayesianMetaAnalysis = typeof bayesianMetaAnalysis !== 'undefined' ? bayesianMetaAnalysis : null;
      exports.bivariateDTA = typeof bivariateDTA !== 'undefined' ? bivariateDTA : null;
      exports.dtaLeaveOneOut = typeof dtaLeaveOneOut !== 'undefined' ? dtaLeaveOneOut : null;
      exports.networkMetaAnalysis = typeof networkMetaAnalysis !== 'undefined' ? networkMetaAnalysis : null;
      exports.nodeSplitting = typeof nodeSplitting !== 'undefined' ? nodeSplitting : null;
      exports.designByTreatmentInteraction = typeof designByTreatmentInteraction !== 'undefined' ? designByTreatmentInteraction : null;
      exports.multiModeratorMetaRegression = typeof multiModeratorMetaRegression !== 'undefined' ? multiModeratorMetaRegression : null;
      exports.goshAnalysis = typeof goshAnalysis !== 'undefined' ? goshAnalysis : null;
      exports.threeLevelMetaAnalysis = typeof threeLevelMetaAnalysis !== 'undefined' ? threeLevelMetaAnalysis : null;
      exports.metaCART = typeof metaCART !== 'undefined' ? metaCART : null;
      exports.copasContourAnalysis = typeof copasContourAnalysis !== 'undefined' ? copasContourAnalysis : null;
    })(this);
  `;

  const fn = new Function(wrappedCode);
  fn.call(context);
} catch (e) {
  console.error('Error loading functions:', e.message);
}

// Test data
const testData = {
  yi: [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45],
  vi: [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05],
  studyNames: ['Study1', 'Study2', 'Study3', 'Study4', 'Study5',
               'Study6', 'Study7', 'Study8', 'Study9', 'Study10']
};

const dtaData = {
  tp: [66, 118, 48, 134, 24, 68, 64, 282],
  fp: [240, 10, 64, 28, 44, 48, 0, 20],
  fn: [4, 12, 20, 8, 6, 16, 18, 64],
  tn: [870, 110, 990, 152, 292, 154, 72, 286]
};

const nmaData = {
  treat1: ['A', 'A', 'B', 'A', 'B'],
  treat2: ['B', 'C', 'C', 'B', 'C'],
  yi: [0.5, 0.3, 0.2, 0.4, 0.1],
  vi: [0.04, 0.05, 0.04, 0.03, 0.05],
  studyId: ['s1', 's2', 's3', 's4', 's5']
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    const result = fn();
    if (result) {
      results.passed++;
      results.tests.push({ name, status: 'PASS', result: typeof result === 'object' ? JSON.stringify(result).slice(0, 100) : result });
      console.log(`✓ ${name}`);
    } else {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: 'No result returned' });
      console.log(`✗ ${name}: No result`);
    }
  } catch (e) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: e.message });
    console.log(`✗ ${name}: ${e.message}`);
  }
}

console.log('======================================================================');
console.log('META-ANALYSIS SUPERAPP - NODE.JS VALIDATION');
console.log('======================================================================\n');

// Test 1: Random Effects Meta-Analysis
test('randomEffectsMeta', () => {
  if (!context.randomEffectsMeta) throw new Error('Function not found');
  return context.randomEffectsMeta(testData.yi, testData.vi);
});

// Test 2: Tau² Estimators
test('tau2DerSimonianLaird', () => {
  if (!context.tau2DerSimonianLaird) throw new Error('Function not found');
  return context.tau2DerSimonianLaird(testData.yi, testData.vi);
});

test('tau2REML', () => {
  if (!context.tau2REML) throw new Error('Function not found');
  return context.tau2REML(testData.yi, testData.vi);
});

test('tau2PauleMandel', () => {
  if (!context.tau2PauleMandel) throw new Error('Function not found');
  return context.tau2PauleMandel(testData.yi, testData.vi);
});

// Test 3: Publication Bias
test('eggerTest', () => {
  if (!context.eggerTest) throw new Error('Function not found');
  return context.eggerTest(testData.yi, testData.vi);
});

test('petPeese', () => {
  if (!context.petPeese) throw new Error('Function not found');
  return context.petPeese(testData.yi, testData.vi);
});

test('trimAndFill', () => {
  if (!context.trimAndFill) throw new Error('Function not found');
  return context.trimAndFill(testData.yi, testData.vi);
});

// Test 4: Selection Models
test('copasSelectionModel', () => {
  if (!context.copasSelectionModel) throw new Error('Function not found');
  return context.copasSelectionModel(testData.yi, testData.vi);
});

test('copasContourAnalysis', () => {
  if (!context.copasContourAnalysis) throw new Error('Function not found');
  return context.copasContourAnalysis(testData.yi, testData.vi, { gammaGrid: [0.1, 0.5, 1.0], deltaGrid: [0.1, 0.5, 1.0] });
});

// Test 5: Bayesian Meta-Analysis
test('bayesianMetaAnalysis', () => {
  if (!context.bayesianMetaAnalysis) throw new Error('Function not found');
  return context.bayesianMetaAnalysis(testData.yi, testData.vi, { nIter: 1000, burnIn: 200 });
});

// Test 6: Bivariate DTA
test('bivariateDTA', () => {
  if (!context.bivariateDTA) throw new Error('Function not found');
  return context.bivariateDTA(dtaData.tp, dtaData.fp, dtaData.fn, dtaData.tn);
});

test('dtaLeaveOneOut', () => {
  if (!context.dtaLeaveOneOut) throw new Error('Function not found');
  return context.dtaLeaveOneOut(dtaData.tp, dtaData.fp, dtaData.fn, dtaData.tn);
});

// Test 7: Network Meta-Analysis
test('networkMetaAnalysis', () => {
  if (!context.networkMetaAnalysis) throw new Error('Function not found');
  return context.networkMetaAnalysis(nmaData.treat1, nmaData.treat2, nmaData.yi, nmaData.vi, nmaData.studyId);
});

test('nodeSplitting', () => {
  if (!context.nodeSplitting) throw new Error('Function not found');
  return context.nodeSplitting(nmaData.treat1, nmaData.treat2, nmaData.yi, nmaData.vi, nmaData.studyId);
});

test('designByTreatmentInteraction', () => {
  if (!context.designByTreatmentInteraction) throw new Error('Function not found');
  return context.designByTreatmentInteraction(nmaData.treat1, nmaData.treat2, nmaData.yi, nmaData.vi, nmaData.studyId);
});

// Test 8: Multi-Moderator Regression
test('multiModeratorMetaRegression', () => {
  if (!context.multiModeratorMetaRegression) throw new Error('Function not found');
  return context.multiModeratorMetaRegression(testData.yi, testData.vi, {
    continuousMods: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    modNames: ['year']
  });
});

// Test 9: GOSH Analysis
test('goshAnalysis', () => {
  if (!context.goshAnalysis) throw new Error('Function not found');
  return context.goshAnalysis(testData.yi.slice(0, 5), testData.vi.slice(0, 5), { nSubsets: 10 });
});

// Test 10: Three-Level MA
test('threeLevelMetaAnalysis', () => {
  if (!context.threeLevelMetaAnalysis) throw new Error('Function not found');
  const clusters = ['c1', 'c1', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'c5', 'c5'];
  return context.threeLevelMetaAnalysis(testData.yi, testData.vi, clusters);
});

// Test 11: MetaCART
test('metaCART', () => {
  if (!context.metaCART) throw new Error('Function not found');
  const moderators = {
    quality: [1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
    region: ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B']
  };
  return context.metaCART(testData.yi, testData.vi, moderators);
});

// Summary
console.log('\n======================================================================');
console.log(`SUMMARY: ${results.passed} passed, ${results.failed} failed`);
console.log('======================================================================');

if (results.failed > 0) {
  console.log('\nFailed tests:');
  results.tests.filter(t => t.status === 'FAIL').forEach(t => {
    console.log(`  - ${t.name}: ${t.error}`);
  });
}
