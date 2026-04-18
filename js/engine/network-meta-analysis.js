/**
 * Network Meta-Analysis Engine
 * Living Meta-Analysis Platform
 *
 * Implements frequentist NMA using graph-theoretical approach
 * Based on netmeta (Rucker & Schwarzer) methodology
 *
 * References:
 * - Rucker & Schwarzer (2014) Netmeta: Network Meta-Analysis using Frequentist Methods
 * - Salanti et al. (2012) Evaluating the quality of evidence from network meta-analysis
 * - Dias et al. (2010) Checking consistency in mixed treatment comparison meta-analysis
 */

import { normalCDF, normalQuantile, chiSquareCDF } from '../utils/stats.js';
import { randomEffectsDL, randomEffectsREML } from './meta-analysis.js';

// ============================================================================
// NETWORK CONSTRUCTION
// ============================================================================

/**
 * Build network from pairwise comparisons
 * Accepts data in contrast format: { treat1, treat2, yi, vi, studyId }
 */
export function buildNetwork(contrasts) {
  const treatments = new Set();
  const comparisons = new Map(); // "A:B" -> array of contrasts
  const studyArms = new Map(); // studyId -> Set of treatments

  for (const c of contrasts) {
    treatments.add(c.treat1);
    treatments.add(c.treat2);

    // Standardize comparison key (alphabetically ordered)
    const [t1, t2] = [c.treat1, c.treat2].sort();
    const key = `${t1}:${t2}`;

    if (!comparisons.has(key)) {
      comparisons.set(key, []);
    }
    comparisons.get(key).push({
      ...c,
      direction: c.treat1 === t1 ? 1 : -1 // Flip effect if needed
    });

    // Track study arms
    if (!studyArms.has(c.studyId)) {
      studyArms.set(c.studyId, new Set());
    }
    studyArms.get(c.studyId).add(c.treat1);
    studyArms.get(c.studyId).add(c.treat2);
  }

  const treatmentList = Array.from(treatments).sort();
  const nTreatments = treatmentList.length;
  const nStudies = studyArms.size;
  const nComparisons = comparisons.size;

  // Build adjacency matrix for network connectivity
  const adjacency = new Array(nTreatments).fill(0).map(() => new Array(nTreatments).fill(0));
  for (const [key, data] of comparisons) {
    const [t1, t2] = key.split(':');
    const i = treatmentList.indexOf(t1);
    const j = treatmentList.indexOf(t2);
    adjacency[i][j] = data.length;
    adjacency[j][i] = data.length;
  }

  // Check network connectivity
  const connected = isNetworkConnected(adjacency);

  // Calculate node degrees
  const degrees = adjacency.map(row => row.reduce((a, b) => a + (b > 0 ? 1 : 0), 0));

  // Multi-arm study detection
  const multiArmStudies = Array.from(studyArms.entries())
    .filter(([_, arms]) => arms.size > 2)
    .map(([id, arms]) => ({ id, arms: Array.from(arms), nArms: arms.size }));

  return {
    treatments: treatmentList,
    nTreatments,
    nStudies,
    nComparisons,
    comparisons,
    adjacency,
    degrees,
    connected,
    multiArmStudies,
    studyArms,
    hasMultiArm: multiArmStudies.length > 0
  };
}

/**
 * Check if network is connected using BFS
 */
function isNetworkConnected(adjacency) {
  const n = adjacency.length;
  if (n === 0) return true;

  const visited = new Array(n).fill(false);
  const queue = [0];
  visited[0] = true;
  let count = 1;

  while (queue.length > 0) {
    const current = queue.shift();
    for (let i = 0; i < n; i++) {
      if (adjacency[current][i] > 0 && !visited[i]) {
        visited[i] = true;
        queue.push(i);
        count++;
      }
    }
  }

  return count === n;
}

// ============================================================================
// DESIGN MATRIX CONSTRUCTION
// ============================================================================

/**
 * Create design matrix for NMA
 * Uses graph-theoretical approach with B matrix (edge incidence)
 */
export function createDesignMatrix(network, reference = null) {
  const { treatments, nTreatments, comparisons } = network;
  const ref = reference || treatments[0];
  const refIdx = treatments.indexOf(ref);

  if (refIdx === -1) {
    throw new Error(`Reference treatment "${ref}" not found in network`);
  }

  // Create list of all contrasts for design matrix rows
  const contrastList = [];
  for (const [key, data] of comparisons) {
    for (const contrast of data) {
      contrastList.push({
        key,
        ...contrast,
        treat1Idx: treatments.indexOf(contrast.treat1),
        treat2Idx: treatments.indexOf(contrast.treat2)
      });
    }
  }

  const nRows = contrastList.length;
  const nCols = nTreatments - 1; // Basic parameters (vs reference)

  // Design matrix X: each row is a contrast, columns are basic parameters
  // X[i,j] = 1 if treatment j+1 is treat2, -1 if treat1, 0 otherwise
  // (adjusting indices for reference exclusion)
  const X = new Array(nRows).fill(0).map(() => new Array(nCols).fill(0));
  const y = new Array(nRows).fill(0);
  const v = new Array(nRows).fill(0);

  for (let i = 0; i < nRows; i++) {
    const c = contrastList[i];
    y[i] = c.yi * c.direction;
    v[i] = c.vi;

    // Map treatment indices to column indices (excluding reference)
    const getColIdx = (treatIdx) => {
      if (treatIdx === refIdx) return -1; // Reference
      return treatIdx < refIdx ? treatIdx : treatIdx - 1;
    };

    const col1 = getColIdx(c.treat1Idx);
    const col2 = getColIdx(c.treat2Idx);

    // d_treat2_ref - d_treat1_ref = d_treat2_treat1
    // So X encodes: treat2 effect - treat1 effect
    if (col2 >= 0) X[i][col2] = c.direction;
    if (col1 >= 0) X[i][col1] = -c.direction;
  }

  return {
    X,
    y,
    v,
    contrastList,
    reference: ref,
    referenceIdx: refIdx,
    treatments,
    nTreatments
  };
}

// ============================================================================
// NMA ESTIMATION
// ============================================================================

/**
 * Run frequentist NMA using weighted least squares
 * Implements both fixed and random effects models
 */
export function runNMA(network, options = {}) {
  const {
    reference = null,
    model = 'random',
    method = 'REML',
    smallSampleCorrection = true
  } = options;

  const design = createDesignMatrix(network, reference);
  const { X, y, v, treatments, nTreatments, contrastList } = design;
  const n = y.length;
  const p = nTreatments - 1;

  if (n < p) {
    return { error: 'Insufficient data: need more contrasts than treatments' };
  }

  // Estimate heterogeneity for random effects model
  let tau2 = 0;
  if (model === 'random') {
    tau2 = estimateTau2NMA(y, v, X, method);
  }

  // Total variance (sampling + heterogeneity)
  const vTotal = v.map(vi => vi + tau2);
  const W = vTotal.map(vt => 1 / vt);

  // Weighted least squares: (X'WX)^-1 X'Wy
  const XtWX = matrixMultiply(
    matrixTranspose(X),
    matrixDiagMultiply(W, X)
  );
  const XtWy = matrixVectorMultiply(
    matrixTranspose(X),
    y.map((yi, i) => W[i] * yi)
  );

  const XtWXinv = invertMatrix(XtWX);
  if (!XtWXinv) {
    return { error: 'Singular matrix - network may be disconnected' };
  }

  // Basic parameters (treatments vs reference)
  const d = matrixVectorMultiply(XtWXinv, XtWy);

  // Standard errors
  const seD = XtWXinv.map((row, i) => Math.sqrt(row[i]));

  // Q statistic for heterogeneity
  const fitted = matrixVectorMultiply(X, d);
  const residuals = y.map((yi, i) => yi - fitted[i]);
  const Q = residuals.reduce((sum, r, i) => sum + W[i] * r * r, 0);
  const dfQ = n - p;
  const pQ = dfQ > 0 ? 1 - chiSquareCDF(Q, dfQ) : 1;

  // I² for network
  const I2 = dfQ > 0 ? Math.max(0, (Q - dfQ) / Q) * 100 : 0;

  // Build results for all treatment comparisons
  const basicParams = treatments
    .filter((_, i) => i !== design.referenceIdx)
    .map((treat, i) => ({
      treatment: treat,
      vsReference: design.reference,
      estimate: d[i],
      se: seD[i],
      z: d[i] / seD[i],
      p: 2 * (1 - normalCDF(Math.abs(d[i] / seD[i]))),
      ci: [
        d[i] - normalQuantile(0.975) * seD[i],
        d[i] + normalQuantile(0.975) * seD[i]
      ]
    }));

  // Generate league table (all pairwise comparisons)
  const leagueTable = generateLeagueTable(d, XtWXinv, treatments, design.referenceIdx);

  // Calculate P-scores (frequentist analog of SUCRA)
  const pScores = calculatePScores(d, XtWXinv, treatments, design.referenceIdx);

  // Node-splitting for inconsistency
  const inconsistency = testInconsistency(network, design, d, tau2);

  return {
    model,
    method: model === 'random' ? method : 'FE',
    reference: design.reference,
    treatments,
    nTreatments,
    nStudies: network.nStudies,
    nComparisons: network.nComparisons,
    basicParams,
    d,
    seD,
    varCov: XtWXinv,
    leagueTable,
    pScores,
    ranking: pScores.sort((a, b) => b.pScore - a.pScore),
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      Q,
      df: dfQ,
      pQ,
      I2
    },
    inconsistency,
    network,
    design
  };
}

/**
 * Estimate tau² for NMA using method of moments or REML
 */
function estimateTau2NMA(y, v, X, method = 'REML', maxIter = 100, tol = 1e-6) {
  const n = y.length;
  const p = X[0].length;

  // Initialize with method of moments estimate
  const W0 = v.map(vi => 1 / vi);
  const XtW0X = matrixMultiply(matrixTranspose(X), matrixDiagMultiply(W0, X));
  const XtW0Xinv = invertMatrix(XtW0X);
  if (!XtW0Xinv) return 0;

  const XtW0y = matrixVectorMultiply(matrixTranspose(X), y.map((yi, i) => W0[i] * yi));
  const d0 = matrixVectorMultiply(XtW0Xinv, XtW0y);
  const fitted0 = matrixVectorMultiply(X, d0);
  const Q0 = y.reduce((sum, yi, i) => sum + W0[i] * Math.pow(yi - fitted0[i], 2), 0);

  // DerSimonian-Laird-type estimate for NMA
  const trP = W0.reduce((a, b) => a + b, 0) -
    trace(matrixMultiply(XtW0Xinv, matrixMultiply(matrixTranspose(X), matrixDiagMultiply(W0.map(w => w * w), X))));

  let tau2 = Math.max(0, (Q0 - (n - p)) / trP);

  if (method === 'REML') {
    // REML iteration
    for (let iter = 0; iter < maxIter; iter++) {
      const W = v.map(vi => 1 / (vi + tau2));
      const XtWX = matrixMultiply(matrixTranspose(X), matrixDiagMultiply(W, X));
      const XtWXinv = invertMatrix(XtWX);
      if (!XtWXinv) break;

      const XtWy = matrixVectorMultiply(matrixTranspose(X), y.map((yi, i) => W[i] * yi));
      const d = matrixVectorMultiply(XtWXinv, XtWy);
      const fitted = matrixVectorMultiply(X, d);

      const Q = y.reduce((sum, yi, i) => sum + W[i] * Math.pow(yi - fitted[i], 2), 0);

      // Trace of P matrix
      const W2 = W.map(w => w * w);
      const trPnew = W.reduce((a, b) => a + b, 0) -
        trace(matrixMultiply(XtWXinv, matrixMultiply(matrixTranspose(X), matrixDiagMultiply(W2, X))));

      const tau2New = Math.max(0, tau2 + (Q - (n - p)) / trPnew);

      if (Math.abs(tau2New - tau2) < tol) {
        tau2 = tau2New;
        break;
      }
      tau2 = tau2New;
    }
  }

  return tau2;
}

// ============================================================================
// LEAGUE TABLE
// ============================================================================

/**
 * Generate league table with all pairwise comparisons
 */
function generateLeagueTable(d, varCov, treatments, refIdx) {
  const n = treatments.length;
  const table = {};

  // Helper to get parameter index
  const getParamIdx = (treatIdx) => {
    if (treatIdx === refIdx) return -1;
    return treatIdx < refIdx ? treatIdx : treatIdx - 1;
  };

  for (let i = 0; i < n; i++) {
    table[treatments[i]] = {};

    for (let j = 0; j < n; j++) {
      if (i === j) {
        table[treatments[i]][treatments[j]] = {
          estimate: 0,
          se: 0,
          ci: [0, 0],
          z: 0,
          p: 1
        };
        continue;
      }

      // d_ij = d_i - d_j (where d_ref = 0)
      const pi = getParamIdx(i);
      const pj = getParamIdx(j);

      let estimate, variance;

      if (pi === -1 && pj === -1) {
        // Both reference - shouldn't happen
        estimate = 0;
        variance = 0;
      } else if (pi === -1) {
        // i is reference: d_ref_j = -d_j
        estimate = -d[pj];
        variance = varCov[pj][pj];
      } else if (pj === -1) {
        // j is reference: d_i_ref = d_i
        estimate = d[pi];
        variance = varCov[pi][pi];
      } else {
        // Neither is reference: d_i_j = d_i - d_j
        estimate = d[pi] - d[pj];
        variance = varCov[pi][pi] + varCov[pj][pj] - 2 * varCov[pi][pj];
      }

      const se = Math.sqrt(Math.max(0, variance));
      const z = se > 0 ? estimate / se : 0;
      const pVal = 2 * (1 - normalCDF(Math.abs(z)));
      const zCrit = normalQuantile(0.975);

      table[treatments[i]][treatments[j]] = {
        estimate,
        se,
        ci: [estimate - zCrit * se, estimate + zCrit * se],
        z,
        p: pVal
      };
    }
  }

  return table;
}

// ============================================================================
// P-SCORES (RANKING)
// ============================================================================

/**
 * Calculate P-scores (frequentist probability of being best)
 * Based on Rucker & Schwarzer (2015)
 */
function calculatePScores(d, varCov, treatments, refIdx) {
  const n = treatments.length;
  const pScores = [];

  const getParamIdx = (treatIdx) => {
    if (treatIdx === refIdx) return -1;
    return treatIdx < refIdx ? treatIdx : treatIdx - 1;
  };

  for (let i = 0; i < n; i++) {
    let sumP = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;

      const pi = getParamIdx(i);
      const pj = getParamIdx(j);

      let dij, varij;

      if (pi === -1 && pj === -1) {
        dij = 0;
        varij = 0;
      } else if (pi === -1) {
        dij = -d[pj];
        varij = varCov[pj][pj];
      } else if (pj === -1) {
        dij = d[pi];
        varij = varCov[pi][pi];
      } else {
        dij = d[pi] - d[pj];
        varij = varCov[pi][pi] + varCov[pj][pj] - 2 * varCov[pi][pj];
      }

      const seij = Math.sqrt(Math.max(0, varij));
      // P(i better than j) = P(d_ij > 0) = Phi(d_ij / se_ij)
      // Assuming larger effect is better (adjust if lower is better)
      sumP += seij > 0 ? normalCDF(dij / seij) : (dij > 0 ? 1 : 0.5);
    }

    const pScore = sumP / (n - 1);
    pScores.push({
      treatment: treatments[i],
      pScore,
      rank: 0 // Will be assigned after sorting
    });
  }

  // Assign ranks
  pScores.sort((a, b) => b.pScore - a.pScore);
  pScores.forEach((p, i) => { p.rank = i + 1; });

  return pScores;
}

/**
 * Calculate SUCRA (Surface Under Cumulative Ranking)
 * For Bayesian NMA - uses ranking probabilities
 */
export function calculateSUCRA(rankProbabilities) {
  // rankProbabilities[i][r] = P(treatment i has rank r)
  const n = rankProbabilities.length;
  const sucra = [];

  for (let i = 0; i < n; i++) {
    let cumSum = 0;
    for (let r = 0; r < n - 1; r++) {
      cumSum += rankProbabilities[i].slice(0, r + 1).reduce((a, b) => a + b, 0);
    }
    sucra.push(cumSum / (n - 1));
  }

  return sucra;
}

// ============================================================================
// INCONSISTENCY TESTING
// ============================================================================

/**
 * Test for inconsistency using proper node-splitting
 * Re-fits NMA excluding direct evidence to obtain true indirect estimates
 *
 * References:
 * - Dias et al. (2010) Checking consistency in mixed treatment comparison meta-analysis
 * - van Valkenhoef et al. (2016) Automated generation of node-splitting models
 * - Rucker et al. (2020) Network meta-analysis using R
 */
function testInconsistency(network, design, d, tau2) {
  const { comparisons, treatments } = network;
  const results = [];

  for (const [key, data] of comparisons) {
    const [t1, t2] = key.split(':');

    // Check if indirect evidence exists (alternative paths in network)
    if (!hasIndirectEvidence(network, t1, t2)) {
      results.push({
        comparison: key,
        treatments: [t1, t2],
        hasIndirect: false,
        direct: null,
        indirect: null,
        difference: null,
        p: null
      });
      continue;
    }

    // === DIRECT EVIDENCE ===
    // Pool direct comparisons between t1 and t2
    const directData = data;
    const yDirect = directData.map(c => c.yi * c.direction);
    const vDirect = directData.map(c => c.vi);

    // Use random effects pooling with common tau2
    const wDirect = vDirect.map(v => 1 / (v + tau2));
    const sumWDirect = wDirect.reduce((a, b) => a + b, 0);
    const directEstimate = yDirect.reduce((sum, y, i) => sum + wDirect[i] * y, 0) / sumWDirect;
    const directVar = 1 / sumWDirect;
    const directSE = Math.sqrt(directVar);

    // === INDIRECT EVIDENCE ===
    // Re-fit NMA excluding direct evidence between t1 and t2
    const indirectResult = fitIndirectModel(network, design, t1, t2, tau2);

    if (!indirectResult.success) {
      // Network becomes disconnected without direct evidence
      results.push({
        comparison: key,
        treatments: [t1, t2],
        hasIndirect: false,
        direct: {
          estimate: directEstimate,
          se: directSE,
          ci: [
            directEstimate - normalQuantile(0.975) * directSE,
            directEstimate + normalQuantile(0.975) * directSE
          ],
          k: directData.length
        },
        indirect: null,
        difference: null,
        p: null,
        note: 'Network disconnected without direct evidence'
      });
      continue;
    }

    const { indirectEstimate, indirectVar: indirectVariance } = indirectResult;
    const indirectSE = Math.sqrt(Math.max(0, indirectVariance));

    // === INCONSISTENCY TEST ===
    // Difference between direct and indirect (Wald test)
    const diff = directEstimate - indirectEstimate;

    // Variance of difference: Var(direct - indirect)
    // For proper node-splitting, these are independent by construction
    const varDiff = directVar + indirectVariance;
    const seDiff = Math.sqrt(varDiff);
    const z = seDiff > 0 ? diff / seDiff : 0;
    const p = 2 * (1 - normalCDF(Math.abs(z)));

    results.push({
      comparison: key,
      treatments: [t1, t2],
      hasIndirect: true,
      direct: {
        estimate: directEstimate,
        se: directSE,
        ci: [
          directEstimate - normalQuantile(0.975) * directSE,
          directEstimate + normalQuantile(0.975) * directSE
        ],
        k: directData.length
      },
      indirect: {
        estimate: indirectEstimate,
        se: indirectSE,
        ci: [
          indirectEstimate - normalQuantile(0.975) * indirectSE,
          indirectEstimate + normalQuantile(0.975) * indirectSE
        ]
      },
      difference: {
        estimate: diff,
        se: seDiff,
        ci: [
          diff - normalQuantile(0.975) * seDiff,
          diff + normalQuantile(0.975) * seDiff
        ],
        z,
        p
      },
      inconsistent: p < 0.05
    });
  }

  // Global inconsistency test (design-by-treatment interaction)
  const globalTest = testGlobalInconsistency(network, design, d, tau2);

  // SIDE splitting method (alternative approach using all comparisons)
  const sideTest = testSIDEInconsistency(network, design, d, tau2);

  return {
    nodeSplitting: results,
    side: sideTest,
    global: globalTest,
    hasInconsistency: results.some(r => r.inconsistent) || globalTest.p < 0.05
  };
}

/**
 * Fit indirect model by excluding direct evidence between two treatments
 * This is the core of proper node-splitting
 */
function fitIndirectModel(network, design, t1, t2, tau2) {
  const { comparisons, treatments } = network;
  const { reference } = design;

  // Build a new contrast list excluding direct comparisons between t1 and t2
  const excludeKey = [t1, t2].sort().join(':');
  const filteredContrasts = [];

  for (const [key, data] of comparisons) {
    if (key === excludeKey) continue; // Skip direct evidence

    for (const contrast of data) {
      filteredContrasts.push(contrast);
    }
  }

  if (filteredContrasts.length === 0) {
    return { success: false };
  }

  // Build network from filtered contrasts
  const filteredNetwork = buildNetworkFromContrasts(filteredContrasts);

  // Check if t1 and t2 are still connected
  const i1 = filteredNetwork.treatments.indexOf(t1);
  const i2 = filteredNetwork.treatments.indexOf(t2);

  if (i1 === -1 || i2 === -1 || !pathExists(filteredNetwork.adjacency, i1, i2)) {
    return { success: false };
  }

  // Create design matrix for filtered network
  const filteredDesign = createDesignMatrixInternal(filteredNetwork, reference);
  const { X, y, v, treatments: treatList } = filteredDesign;

  const n = y.length;
  const p = X[0].length;

  if (n <= p) {
    return { success: false };
  }

  // Fit model with fixed tau2 (using tau2 from full model)
  const vTotal = v.map(vi => vi + tau2);
  const W = vTotal.map(vt => 1 / vt);

  const XtWX = matrixMultiply(
    matrixTranspose(X),
    matrixDiagMultiply(W, X)
  );
  const XtWy = matrixVectorMultiply(
    matrixTranspose(X),
    y.map((yi, i) => W[i] * yi)
  );

  const XtWXinv = invertMatrix(XtWX);
  if (!XtWXinv) {
    return { success: false };
  }

  // Get basic parameters
  const dFiltered = matrixVectorMultiply(XtWXinv, XtWy);

  // Extract indirect estimate for t1 vs t2
  const refIdx = treatList.indexOf(reference);
  const idx1 = treatList.indexOf(t1);
  const idx2 = treatList.indexOf(t2);

  const getParamIdx = (treatIdx) => {
    if (treatIdx === refIdx) return -1;
    return treatIdx < refIdx ? treatIdx : treatIdx - 1;
  };

  const p1 = getParamIdx(idx1);
  const p2 = getParamIdx(idx2);

  let indirectEstimate, indirectVar;

  if (p1 === -1 && p2 === -1) {
    // Both are reference - shouldn't happen
    return { success: false };
  } else if (p1 === -1) {
    // t1 is reference: d_ref_t2 = -d_t2
    indirectEstimate = -dFiltered[p2];
    indirectVar = XtWXinv[p2][p2];
  } else if (p2 === -1) {
    // t2 is reference: d_t1_ref = d_t1
    indirectEstimate = dFiltered[p1];
    indirectVar = XtWXinv[p1][p1];
  } else {
    // Neither is reference: d_t1_t2 = d_t1 - d_t2
    indirectEstimate = dFiltered[p1] - dFiltered[p2];
    indirectVar = XtWXinv[p1][p1] + XtWXinv[p2][p2] - 2 * XtWXinv[p1][p2];
  }

  return {
    success: true,
    indirectEstimate,
    indirectVar,
    dFiltered,
    varCov: XtWXinv
  };
}

/**
 * Build network from list of contrasts (helper for node-splitting)
 */
function buildNetworkFromContrasts(contrasts) {
  const treatments = new Set();
  const comparisons = new Map();

  for (const c of contrasts) {
    treatments.add(c.treat1);
    treatments.add(c.treat2);

    const [t1, t2] = [c.treat1, c.treat2].sort();
    const key = `${t1}:${t2}`;

    if (!comparisons.has(key)) {
      comparisons.set(key, []);
    }
    comparisons.get(key).push({
      ...c,
      direction: c.treat1 === t1 ? 1 : -1
    });
  }

  const treatmentList = Array.from(treatments).sort();
  const nTreatments = treatmentList.length;

  // Build adjacency matrix
  const adjacency = new Array(nTreatments).fill(0).map(() =>
    new Array(nTreatments).fill(0)
  );

  for (const [key, data] of comparisons) {
    const [t1, t2] = key.split(':');
    const i = treatmentList.indexOf(t1);
    const j = treatmentList.indexOf(t2);
    adjacency[i][j] = data.length;
    adjacency[j][i] = data.length;
  }

  return {
    treatments: treatmentList,
    nTreatments,
    comparisons,
    adjacency
  };
}

/**
 * Internal design matrix creation for node-splitting
 */
function createDesignMatrixInternal(network, reference) {
  const { treatments, nTreatments, comparisons } = network;
  const ref = reference && treatments.includes(reference) ? reference : treatments[0];
  const refIdx = treatments.indexOf(ref);

  const contrastList = [];
  for (const [key, data] of comparisons) {
    for (const contrast of data) {
      contrastList.push({
        key,
        ...contrast,
        treat1Idx: treatments.indexOf(contrast.treat1),
        treat2Idx: treatments.indexOf(contrast.treat2)
      });
    }
  }

  const nRows = contrastList.length;
  const nCols = nTreatments - 1;

  const X = new Array(nRows).fill(0).map(() => new Array(nCols).fill(0));
  const y = new Array(nRows).fill(0);
  const v = new Array(nRows).fill(0);

  for (let i = 0; i < nRows; i++) {
    const c = contrastList[i];
    y[i] = c.yi * c.direction;
    v[i] = c.vi;

    const getColIdx = (treatIdx) => {
      if (treatIdx === refIdx) return -1;
      return treatIdx < refIdx ? treatIdx : treatIdx - 1;
    };

    const col1 = getColIdx(c.treat1Idx);
    const col2 = getColIdx(c.treat2Idx);

    if (col2 >= 0) X[i][col2] = c.direction;
    if (col1 >= 0) X[i][col1] = -c.direction;
  }

  return { X, y, v, contrastList, reference: ref, referenceIdx: refIdx, treatments };
}

/**
 * Check if path exists between two nodes (BFS)
 */
function pathExists(adjacency, start, end) {
  const n = adjacency.length;
  if (start === end) return true;

  const visited = new Array(n).fill(false);
  const queue = [start];
  visited[start] = true;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === end) return true;

    for (let i = 0; i < n; i++) {
      if (adjacency[current][i] > 0 && !visited[i]) {
        visited[i] = true;
        queue.push(i);
      }
    }
  }

  return false;
}

/**
 * SIDE (Separating Indirect from Direct Evidence) method
 * Tests all comparisons simultaneously using extended NMA model
 * Reference: König et al. (2013)
 */
function testSIDEInconsistency(network, design, d, tau2) {
  const { comparisons, treatments } = network;
  const { y, v, X, contrastList } = design;
  const n = y.length;
  const p = X[0].length;

  // Count comparisons with both direct and indirect evidence
  const splitComparisons = [];
  for (const [key, data] of comparisons) {
    const [t1, t2] = key.split(':');
    if (hasIndirectEvidence(network, t1, t2)) {
      splitComparisons.push({ key, t1, t2, nDirect: data.length });
    }
  }

  if (splitComparisons.length === 0) {
    return {
      Q: 0,
      df: 0,
      p: 1,
      nSplits: 0,
      note: 'No comparisons with both direct and indirect evidence'
    };
  }

  // Build extended design matrix with inconsistency parameters
  // X_full = [X | Z] where Z has columns for each direct comparison
  const nInconsParams = splitComparisons.length;
  const Xfull = X.map((row, i) => {
    const extraCols = new Array(nInconsParams).fill(0);

    // Find if this contrast is a direct comparison for any split
    const c = contrastList[i];
    const cKey = [c.treat1, c.treat2].sort().join(':');

    splitComparisons.forEach((split, j) => {
      if (split.key === cKey) {
        // This contrast contributes to direct evidence for split j
        extraCols[j] = c.direction;
      }
    });

    return [...row, ...extraCols];
  });

  // Fit extended model
  const vTotal = v.map(vi => vi + tau2);
  const W = vTotal.map(vt => 1 / vt);

  const XtWX = matrixMultiply(
    matrixTranspose(Xfull),
    matrixDiagMultiply(W, Xfull)
  );
  const XtWy = matrixVectorMultiply(
    matrixTranspose(Xfull),
    y.map((yi, i) => W[i] * yi)
  );

  const XtWXinv = invertMatrix(XtWX);
  if (!XtWXinv) {
    return {
      Q: NaN,
      df: 0,
      p: NaN,
      nSplits: splitComparisons.length,
      note: 'Singular matrix in SIDE model'
    };
  }

  const betaFull = matrixVectorMultiply(XtWXinv, XtWy);

  // Extract inconsistency parameters (last nInconsParams elements)
  const omega = betaFull.slice(p);
  const omegaVarCov = XtWXinv.slice(p).map(row => row.slice(p));

  // Wald test for H0: omega = 0
  const omegaVarCovInv = invertMatrix(omegaVarCov);
  if (!omegaVarCovInv) {
    return {
      Q: NaN,
      df: nInconsParams,
      p: NaN,
      nSplits: splitComparisons.length,
      note: 'Singular covariance matrix for inconsistency parameters'
    };
  }

  // Q = omega' * Var(omega)^-1 * omega
  const Qincon = omega.reduce((sum, oi, i) =>
    sum + oi * omegaVarCovInv[i].reduce((s, vij, j) => s + vij * omega[j], 0), 0
  );

  const pIncon = 1 - chiSquareCDF(Qincon, nInconsParams);

  // Individual inconsistency tests
  const individualTests = splitComparisons.map((split, i) => ({
    comparison: split.key,
    treatments: [split.t1, split.t2],
    omega: omega[i],
    se: Math.sqrt(omegaVarCov[i][i]),
    z: omega[i] / Math.sqrt(omegaVarCov[i][i]),
    p: 2 * (1 - normalCDF(Math.abs(omega[i] / Math.sqrt(omegaVarCov[i][i]))))
  }));

  return {
    Q: Qincon,
    df: nInconsParams,
    p: pIncon,
    nSplits: splitComparisons.length,
    inconsistencyParams: omega,
    individualTests,
    note: 'SIDE method: simultaneous test of all inconsistency parameters'
  };
}

/**
 * Check if comparison has indirect evidence (alternative paths exist)
 */
function hasIndirectEvidence(network, t1, t2) {
  const { adjacency, treatments } = network;
  const i1 = treatments.indexOf(t1);
  const i2 = treatments.indexOf(t2);

  // Remove direct edge and check if still connected
  const adjCopy = adjacency.map(row => [...row]);
  adjCopy[i1][i2] = 0;
  adjCopy[i2][i1] = 0;

  // BFS from t1 to t2
  const n = treatments.length;
  const visited = new Array(n).fill(false);
  const queue = [i1];
  visited[i1] = true;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === i2) return true;

    for (let i = 0; i < n; i++) {
      if (adjCopy[current][i] > 0 && !visited[i]) {
        visited[i] = true;
        queue.push(i);
      }
    }
  }

  return false;
}

/**
 * Global test for inconsistency using design-by-treatment interaction
 * Implements the full inconsistency model comparing consistency vs full model
 *
 * Reference: Higgins et al. (2012) Consistency and inconsistency in NMA
 */
function testGlobalInconsistency(network, design, d, tau2) {
  const { y, v, X, contrastList } = design;
  const { studyArms, comparisons } = network;
  const n = y.length;
  const p = X[0].length;

  // Q total from consistency model
  const W = v.map(vi => 1 / (vi + tau2));
  const fitted = matrixVectorMultiply(X, d);
  const Qcons = y.reduce((sum, yi, i) => sum + W[i] * Math.pow(yi - fitted[i], 2), 0);
  const dfCons = n - p;

  // Build full unstructured model (saturated for direct comparisons)
  // Each unique comparison gets its own parameter
  const comparisonList = Array.from(comparisons.keys());
  const nComps = comparisonList.length;

  // Design matrix for unstructured model
  const Xunstr = new Array(n).fill(0).map(() => new Array(nComps).fill(0));

  for (let i = 0; i < n; i++) {
    const c = contrastList[i];
    const key = [c.treat1, c.treat2].sort().join(':');
    const compIdx = comparisonList.indexOf(key);
    if (compIdx >= 0) {
      Xunstr[i][compIdx] = c.direction;
    }
  }

  // Fit unstructured model
  const XtWX_unstr = matrixMultiply(
    matrixTranspose(Xunstr),
    matrixDiagMultiply(W, Xunstr)
  );
  const XtWy_unstr = matrixVectorMultiply(
    matrixTranspose(Xunstr),
    y.map((yi, i) => W[i] * yi)
  );

  const XtWX_unstr_inv = invertMatrix(XtWX_unstr);

  if (!XtWX_unstr_inv) {
    // Fall back to residual Q
    return {
      Q: Qcons,
      df: dfCons,
      p: dfCons > 0 ? 1 - chiSquareCDF(Qcons, dfCons) : 1,
      method: 'residual',
      note: 'Global test based on residual heterogeneity (unstructured model singular)'
    };
  }

  const d_unstr = matrixVectorMultiply(XtWX_unstr_inv, XtWy_unstr);
  const fitted_unstr = matrixVectorMultiply(Xunstr, d_unstr);
  const Qunstr = y.reduce((sum, yi, i) =>
    sum + W[i] * Math.pow(yi - fitted_unstr[i], 2), 0
  );
  const dfUnstr = n - nComps;

  // Q for inconsistency = Qcons - Qunstr
  // This tests whether the consistency model fits as well as the unstructured model
  const Qincon = Math.max(0, Qcons - Qunstr);
  const dfIncon = nComps - p; // df = parameters in unstructured - parameters in consistency

  if (dfIncon <= 0) {
    return {
      Q: Qcons,
      df: dfCons,
      p: dfCons > 0 ? 1 - chiSquareCDF(Qcons, dfCons) : 1,
      method: 'residual',
      note: 'Insufficient df for design-by-treatment test (using residual Q)'
    };
  }

  const pIncon = 1 - chiSquareCDF(Qincon, dfIncon);

  // Also compute I² for inconsistency
  const I2incon = dfIncon > 0 ? Math.max(0, (Qincon - dfIncon) / Qincon) * 100 : 0;

  return {
    Q: Qincon,
    df: dfIncon,
    p: pIncon,
    I2: I2incon,
    Qcons,
    dfCons,
    pCons: dfCons > 0 ? 1 - chiSquareCDF(Qcons, dfCons) : 1,
    Qunstr,
    dfUnstr,
    method: 'design-by-treatment',
    note: 'Global test comparing consistency vs unstructured model'
  };
}

// ============================================================================
// COMPONENT NMA
// ============================================================================

/**
 * Component NMA for complex interventions
 * Decomposes treatments into additive components
 */
export function componentNMA(network, components, options = {}) {
  const { treatments, comparisons } = network;

  // Build component design matrix
  // Each treatment is decomposed into binary indicators for components
  const allComponents = new Set();
  for (const comp of Object.values(components)) {
    for (const c of comp) allComponents.add(c);
  }
  const componentList = Array.from(allComponents).sort();

  // Create component matrix
  const Z = treatments.map(treat => {
    const treatComponents = components[treat] || [];
    return componentList.map(c => treatComponents.includes(c) ? 1 : 0);
  });

  // Modify design matrix for component effects
  // This requires re-parameterization of the model

  return {
    components: componentList,
    decomposition: Z,
    note: 'Component NMA decomposes treatment effects into additive components'
  };
}

// ============================================================================
// NETWORK PLOT DATA
// ============================================================================

/**
 * Generate data for network visualization
 */
export function getNetworkPlotData(network, results = null) {
  const { treatments, adjacency, degrees, comparisons } = network;
  const n = treatments.length;

  // Node positions (circular layout)
  const nodes = treatments.map((treat, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const radius = 200;

    return {
      id: treat,
      label: treat,
      x: Math.cos(angle) * radius + 250,
      y: Math.sin(angle) * radius + 250,
      degree: degrees[i],
      size: Math.sqrt(degrees[i]) * 10 + 20,
      pScore: results?.pScores?.find(p => p.treatment === treat)?.pScore,
      rank: results?.pScores?.find(p => p.treatment === treat)?.rank
    };
  });

  // Edges with thickness based on number of studies
  const edges = [];
  for (const [key, data] of comparisons) {
    const [t1, t2] = key.split(':');
    const i1 = treatments.indexOf(t1);
    const i2 = treatments.indexOf(t2);

    edges.push({
      source: t1,
      target: t2,
      weight: data.length,
      thickness: Math.sqrt(data.length) * 2 + 1,
      label: `${data.length}`,
      direct: results?.inconsistency?.nodeSplitting?.find(
        ns => ns.comparison === key
      )?.direct?.estimate
    });
  }

  return { nodes, edges };
}

// ============================================================================
// COMPARISON-ADJUSTED FUNNEL PLOT
// ============================================================================

/**
 * Generate data for comparison-adjusted funnel plot
 */
export function comparisonAdjustedFunnel(results) {
  const { design, d, heterogeneity } = results;
  const { y, v, X, contrastList } = design;

  const fitted = matrixVectorMultiply(X, d);
  const residuals = y.map((yi, i) => yi - fitted[i]);
  const se = v.map(vi => Math.sqrt(vi));

  const points = contrastList.map((c, i) => ({
    study: c.studyId,
    comparison: `${c.treat1} vs ${c.treat2}`,
    residual: residuals[i],
    se: se[i],
    precision: 1 / se[i]
  }));

  return {
    points,
    xLabel: 'Residual (observed - expected)',
    yLabel: 'Standard Error',
    reference: 0
  };
}

// ============================================================================
// NETWORK META-REGRESSION
// ============================================================================

/**
 * Network Meta-Regression with covariates
 * Beyond R's netmeta: supports multiple covariate types and interaction models
 *
 * References:
 * - Dias et al. 2013 (extension to meta-regression)
 * - Salanti et al. 2009 (covariate adjustment in NMA)
 *
 * @param {Array} contrasts - Pairwise comparison data
 * @param {Object} covariates - { covariateName: { studyId: value } } or treatment-level covariates
 * @param {Object} options - Configuration options
 * @returns {Object} Meta-regression results with covariate effects
 */
export function networkMetaRegression(contrasts, covariates, options = {}) {
  const {
    reference = null,          // Reference treatment (first alphabetically if null)
    covariateType = 'study',   // 'study' or 'treatment'
    interactionModel = false,  // Test treatment-covariate interactions
    method = 'REML',           // Tau2 estimation method
    alpha = 0.05               // Significance level
  } = options;

  // Build basic network
  const network = buildNetwork(contrasts);
  if (!network.connected) {
    return { error: 'Network is disconnected. Cannot perform meta-regression.' };
  }

  const treatments = network.treatments;
  const nTreatments = treatments.length;
  const ref = reference || treatments[0];
  const refIdx = treatments.indexOf(ref);

  if (refIdx === -1) {
    return { error: `Reference treatment ${ref} not found in network` };
  }

  // Get covariate names
  const covariateNames = Object.keys(covariates);
  if (covariateNames.length === 0) {
    return { error: 'No covariates provided' };
  }

  // Build design matrix with covariates
  // For each contrast, we need: treatment effects + covariate effects
  const X = [];
  const y = [];
  const W = []; // Weights (inverse variance)
  const studyInfo = [];

  for (const [compKey, compData] of network.comparisons) {
    const [t1, t2] = compKey.split(':');
    const t1Idx = treatments.indexOf(t1);
    const t2Idx = treatments.indexOf(t2);

    for (const contrast of compData) {
      // Basic NMA contrast coding
      const row = new Array(nTreatments - 1).fill(0);

      // Contrast coding: effect of t2 vs t1 (adjusted for direction)
      if (t1Idx !== refIdx) {
        const idx = t1Idx > refIdx ? t1Idx - 1 : t1Idx;
        row[idx] = -contrast.direction;
      }
      if (t2Idx !== refIdx) {
        const idx = t2Idx > refIdx ? t2Idx - 1 : t2Idx;
        row[idx] = contrast.direction;
      }

      // Add covariate columns
      const covRow = [];
      for (const covName of covariateNames) {
        const covData = covariates[covName];

        if (covariateType === 'study') {
          // Study-level covariate (same for both arms)
          const covValue = covData[contrast.studyId];
          if (covValue === undefined) {
            covRow.push(0); // Missing covariate - use 0 (centered)
          } else {
            covRow.push(covValue);
          }
        } else {
          // Treatment-level covariate (difference between treatments)
          const cov1 = covData[t1] || 0;
          const cov2 = covData[t2] || 0;
          covRow.push((cov2 - cov1) * contrast.direction);
        }
      }

      // Add interaction terms if requested
      if (interactionModel && covariateType === 'study') {
        for (const covName of covariateNames) {
          const covValue = covariates[covName][contrast.studyId] || 0;
          // Interaction with each treatment contrast
          for (let k = 0; k < nTreatments - 1; k++) {
            covRow.push(row[k] * covValue);
          }
        }
      }

      X.push([...row, ...covRow]);
      y.push(contrast.yi * contrast.direction);
      W.push(1 / contrast.vi);
      studyInfo.push({
        studyId: contrast.studyId,
        treat1: t1,
        treat2: t2,
        yi: contrast.yi,
        vi: contrast.vi
      });
    }
  }

  const n = y.length;
  const p = X[0].length;
  const nTreatmentParams = nTreatments - 1;
  const nCovParams = covariateNames.length;
  const nInteractionParams = interactionModel ? nCovParams * nTreatmentParams : 0;

  // Estimate tau2 using moment estimator
  let tau2 = estimateNMATau2(X, y, W, method);
  tau2 = Math.max(0, tau2);

  // Adjust weights for random effects
  const Wadj = W.map(w => 1 / (1 / w + tau2));

  // Weighted least squares: (X'WX)^-1 X'Wy
  const XtWX = matrixCreate(p, p);
  const XtWy = new Array(p).fill(0);

  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * Wadj[k] * X[k][j];
      }
      XtWX[i][j] = sum;
    }
    for (let k = 0; k < n; k++) {
      XtWy[i] += X[k][i] * Wadj[k] * y[k];
    }
  }

  const invXtWX = invertMatrix(XtWX);
  if (!invXtWX) {
    return { error: 'Design matrix is singular. Cannot estimate parameters.' };
  }

  // Solve for beta
  const beta = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      beta[i] += invXtWX[i][j] * XtWy[j];
    }
  }

  // Standard errors
  const se = invXtWX.map((row, i) => Math.sqrt(Math.max(0, row[i])));

  // Z statistics and p-values
  const zCrit = normalQuantile(1 - alpha / 2);
  const zStats = beta.map((b, i) => b / se[i]);
  const pValues = zStats.map(z => 2 * (1 - normalCDF(Math.abs(z))));

  // Parse results
  const treatmentEffects = [];
  for (let i = 0; i < nTreatmentParams; i++) {
    const treatIdx = i >= refIdx ? i + 1 : i;
    treatmentEffects.push({
      treatment: treatments[treatIdx],
      vsReference: ref,
      effect: beta[i],
      se: se[i],
      ci: [beta[i] - zCrit * se[i], beta[i] + zCrit * se[i]],
      z: zStats[i],
      p: pValues[i]
    });
  }

  const covariateEffects = [];
  for (let i = 0; i < nCovParams; i++) {
    const idx = nTreatmentParams + i;
    covariateEffects.push({
      covariate: covariateNames[i],
      coefficient: beta[idx],
      se: se[idx],
      ci: [beta[idx] - zCrit * se[idx], beta[idx] + zCrit * se[idx]],
      z: zStats[idx],
      p: pValues[idx],
      significant: pValues[idx] < alpha
    });
  }

  // Interaction effects if present
  let interactionEffects = null;
  if (interactionModel) {
    interactionEffects = [];
    let intIdx = nTreatmentParams + nCovParams;
    for (let c = 0; c < nCovParams; c++) {
      for (let t = 0; t < nTreatmentParams; t++) {
        const treatIdx = t >= refIdx ? t + 1 : t;
        interactionEffects.push({
          covariate: covariateNames[c],
          treatment: treatments[treatIdx],
          coefficient: beta[intIdx],
          se: se[intIdx],
          ci: [beta[intIdx] - zCrit * se[intIdx], beta[intIdx] + zCrit * se[intIdx]],
          z: zStats[intIdx],
          p: pValues[intIdx]
        });
        intIdx++;
      }
    }
  }

  // Model fit statistics
  let residualSS = 0;
  const fitted = [];
  for (let k = 0; k < n; k++) {
    let pred = 0;
    for (let j = 0; j < p; j++) {
      pred += X[k][j] * beta[j];
    }
    fitted.push(pred);
    residualSS += Wadj[k] * Math.pow(y[k] - pred, 2);
  }

  // Q statistic for model fit
  const Q = residualSS;
  const dfResid = n - p;
  const pQ = dfResid > 0 ? 1 - chiSquareCDF(Q, dfResid) : 1;

  // Test for covariate effects (omnibus test)
  let covariateTest = null;
  if (nCovParams > 0) {
    // Wald test for all covariate coefficients = 0
    let waldStat = 0;
    for (let i = nTreatmentParams; i < nTreatmentParams + nCovParams; i++) {
      waldStat += Math.pow(beta[i] / se[i], 2);
    }
    covariateTest = {
      statistic: waldStat,
      df: nCovParams,
      p: 1 - chiSquareCDF(waldStat, nCovParams),
      significant: (1 - chiSquareCDF(waldStat, nCovParams)) < alpha
    };
  }

  // R-squared (proportion of heterogeneity explained)
  // Compare to model without covariates
  const baseNMA = runNMA(contrasts, { reference: ref, method });
  const tau2Base = baseNMA.heterogeneity.tau2;
  const rSquared = tau2Base > 0 ? Math.max(0, 1 - tau2 / tau2Base) : 0;

  // Generate bubble plot data (for visualization)
  const bubblePlotData = covariateNames.map(covName => {
    const covData = covariates[covName];
    return studyInfo.map((info, i) => ({
      x: covariateType === 'study' ? (covData[info.studyId] || 0) : 0,
      y: y[i],
      fitted: fitted[i],
      residual: y[i] - fitted[i],
      studyId: info.studyId,
      comparison: `${info.treat1} vs ${info.treat2}`,
      weight: Wadj[i]
    }));
  });

  return {
    treatmentEffects,
    covariateEffects,
    interactionEffects,
    covariateTest,
    modelFit: {
      Q,
      df: dfResid,
      p: pQ,
      tau2,
      tau2Reduction: tau2Base - tau2,
      rSquared,
      rSquaredPct: (rSquared * 100).toFixed(1)
    },
    parameters: {
      reference: ref,
      covariateType,
      interactionModel,
      nObservations: n,
      nParameters: p
    },
    bubblePlotData,
    fitted,
    residuals: y.map((yi, i) => yi - fitted[i]),
    summary: {
      significantCovariates: covariateEffects.filter(c => c.significant).map(c => c.covariate),
      heterogeneityExplained: `${(rSquared * 100).toFixed(1)}% of heterogeneity explained by covariates`
    },
    method: 'Network Meta-Regression'
  };
}

// Helper: Create zero matrix
function matrixCreate(rows, cols) {
  return new Array(rows).fill(0).map(() => new Array(cols).fill(0));
}

// Helper: Estimate tau2 for NMA regression
function estimateNMATau2(X, y, W, method) {
  const n = y.length;
  const p = X[0].length;

  // Simple moment estimator
  const XtWX = matrixCreate(p, p);
  const XtWy = new Array(p).fill(0);

  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * W[k] * X[k][j];
      }
      XtWX[i][j] = sum;
    }
    for (let k = 0; k < n; k++) {
      XtWy[i] += X[k][i] * W[k] * y[k];
    }
  }

  const invXtWX = invertMatrix(XtWX);
  if (!invXtWX) return 0;

  const beta = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      beta[i] += invXtWX[i][j] * XtWy[j];
    }
  }

  // Calculate Q statistic
  let Q = 0;
  for (let k = 0; k < n; k++) {
    let pred = 0;
    for (let j = 0; j < p; j++) {
      pred += X[k][j] * beta[j];
    }
    Q += W[k] * Math.pow(y[k] - pred, 2);
  }

  // DerSimonian-Laird type estimator
  let c = 0;
  const H = matrixCreate(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let a = 0; a < p; a++) {
        for (let b = 0; b < p; b++) {
          sum += X[i][a] * invXtWX[a][b] * X[j][b];
        }
      }
      H[i][j] = W[i] * sum;
    }
  }

  for (let i = 0; i < n; i++) {
    c += W[i] * (1 - H[i][i]);
  }

  const tau2 = (Q - (n - p)) / c;
  return Math.max(0, tau2);
}

// ============================================================================
// MATRIX UTILITIES
// ============================================================================

function matrixMultiply(A, B) {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const C = new Array(m).fill(0).map(() => new Array(n).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < p; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }

  return C;
}

function matrixTranspose(A) {
  const m = A.length;
  const n = A[0].length;
  const T = new Array(n).fill(0).map(() => new Array(m).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      T[j][i] = A[i][j];
    }
  }

  return T;
}

function matrixDiagMultiply(diag, B) {
  // Multiply diagonal matrix (as vector) with matrix B
  return B.map((row, i) => row.map(val => diag[i] * val));
}

function matrixVectorMultiply(A, v) {
  return A.map(row => row.reduce((sum, val, j) => sum + val * v[j], 0));
}

function trace(A) {
  return A.reduce((sum, row, i) => sum + row[i], 0);
}

function invertMatrix(M) {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }

    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) return null;

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }
  }

  return aug.map(row => row.slice(n));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildNetwork,
  createDesignMatrix,
  runNMA,
  componentNMA,
  calculateSUCRA,
  getNetworkPlotData,
  comparisonAdjustedFunnel,
  networkMetaRegression
};
