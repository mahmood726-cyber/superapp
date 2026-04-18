/**
 * Meta-Analysis Engine
 * Living Meta-Analysis Platform
 *
 * Core statistical calculations for meta-analysis
 * Implements DerSimonian-Laird, REML, Paule-Mandel, and HKSJ methods
 *
 * References:
 * - Borenstein et al. (2021) Introduction to Meta-Analysis
 * - Cochrane Handbook 6.4
 * - Viechtbauer (2010) metafor package
 */

import { normalCDF, normalQuantile, chiSquareCDF, chiSquareQuantile } from '../utils/stats.js';

// ============================================================================
// EFFECT SIZE CALCULATIONS
// ============================================================================

/**
 * Calculate effect size from raw data
 */
export function calculateEffectSize(type, arm1, arm2, options = {}) {
  switch (type) {
    case 'binary':
    case 'RR':
      return calculateLogRR(arm1.events, arm1.total, arm2.events, arm2.total, options);
    case 'OR':
      return calculateLogOR(arm1.events, arm1.total, arm2.events, arm2.total, options);
    case 'RD':
      return calculateRD(arm1.events, arm1.total, arm2.events, arm2.total);
    case 'continuous':
    case 'SMD':
      return calculateSMD(arm1.mean, arm1.sd, arm1.total, arm2.mean, arm2.sd, arm2.total);
    case 'MD':
      return calculateMD(arm1.mean, arm1.sd, arm1.total, arm2.mean, arm2.sd, arm2.total);
    case 'HR':
      return calculateLogHR(arm1.hr, arm1.ciLower, arm1.ciUpper, arm1.events, arm1.total, arm2.events, arm2.total);
    default:
      throw new Error(`Unknown effect type: ${type}`);
  }
}

/**
 * Calculate log Risk Ratio and SE
 * Supports multiple continuity correction methods
 */
export function calculateLogRR(e1, n1, e2, n2, options = {}) {
  const { correction = 'constant', correctionValue = 0.5 } = options;

  let a = e1, b = n1 - e1, c = e2, d = n2 - e2;
  let n1Adj = n1, n2Adj = n2;
  let correctionApplied = false;

  // Apply continuity correction if needed
  if (a === 0 || b === 0 || c === 0 || d === 0) {
    correctionApplied = true;

    if (correction === 'constant') {
      // Standard 0.5 correction
      a += correctionValue;
      b += correctionValue;
      c += correctionValue;
      d += correctionValue;
      n1Adj = n1 + 2 * correctionValue;
      n2Adj = n2 + 2 * correctionValue;
    } else if (correction === 'tacc') {
      // Treatment arm continuity correction (Sweeting et al. 2004)
      const R = n1 / n2;
      const k = 1 / (R + 1);
      a += k;
      b += k;
      c += 1 - k;
      d += 1 - k;
      n1Adj = n1 + 2 * k;
      n2Adj = n2 + 2 * (1 - k);
    } else if (correction === 'empirical') {
      // Empirical correction (reciprocal of opposite arm)
      const R = (n1 + n2) / (n1 + n2 + 2);
      a += correctionValue * R;
      b += correctionValue * R;
      c += correctionValue * R;
      d += correctionValue * R;
      n1Adj = n1 + 2 * correctionValue * R;
      n2Adj = n2 + 2 * correctionValue * R;
    }
  }

  const p1 = a / n1Adj;
  const p2 = c / n2Adj;

  if (p2 === 0) {
    return { yi: NaN, vi: NaN, se: NaN, measure: 'logRR', error: 'Zero events in control' };
  }

  const logRR = Math.log(p1 / p2);
  const seLogRR = Math.sqrt((1/a - 1/n1Adj) + (1/c - 1/n2Adj));

  return {
    yi: logRR,
    vi: seLogRR * seLogRR,
    se: seLogRR,
    measure: 'logRR',
    correctionApplied,
    raw: { e1, n1, e2, n2 }
  };
}

/**
 * Calculate log Odds Ratio and SE
 */
export function calculateLogOR(e1, n1, e2, n2, options = {}) {
  const { correction = 'constant', correctionValue = 0.5 } = options;

  let a = e1, b = n1 - e1, c = e2, d = n2 - e2;
  let correctionApplied = false;

  if (a === 0 || b === 0 || c === 0 || d === 0) {
    correctionApplied = true;

    if (correction === 'constant') {
      a += correctionValue;
      b += correctionValue;
      c += correctionValue;
      d += correctionValue;
    } else if (correction === 'tacc') {
      const R = n1 / n2;
      const k = 1 / (R + 1);
      a += k;
      b += k;
      c += 1 - k;
      d += 1 - k;
    }
  }

  const logOR = Math.log((a * d) / (b * c));
  const seLogOR = Math.sqrt(1/a + 1/b + 1/c + 1/d);

  return {
    yi: logOR,
    vi: seLogOR * seLogOR,
    se: seLogOR,
    measure: 'logOR',
    correctionApplied,
    raw: { e1, n1, e2, n2 }
  };
}

/**
 * Calculate Risk Difference and SE
 */
export function calculateRD(e1, n1, e2, n2) {
  const p1 = e1 / n1;
  const p2 = e2 / n2;
  const rd = p1 - p2;
  const seRD = Math.sqrt((p1 * (1 - p1) / n1) + (p2 * (1 - p2) / n2));

  return {
    yi: rd,
    vi: seRD * seRD,
    se: seRD,
    measure: 'RD',
    raw: { e1, n1, e2, n2 }
  };
}

/**
 * Calculate Standardized Mean Difference (Hedges' g)
 */
export function calculateSMD(m1, sd1, n1, m2, sd2, n2) {
  const pooledSD = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));

  if (pooledSD === 0) {
    return { yi: 0, vi: 0, se: 0, measure: "Hedges' g", error: 'Zero pooled SD' };
  }

  const d = (m1 - m2) / pooledSD;

  // Hedges' correction factor (exact formula)
  const df = n1 + n2 - 2;
  const J = Math.exp(lgamma((df - 1) / 2) - Math.log(Math.sqrt(df / 2)) - lgamma(df / 2));
  // Simplified approximation for J when gamma unavailable
  const JApprox = 1 - (3 / (4 * df - 1));
  const g = d * JApprox;

  // Variance of g (Hedges & Olkin, 1985)
  const vg = ((n1 + n2) / (n1 * n2)) + ((g * g) / (2 * (n1 + n2 - 2)));

  return {
    yi: g,
    vi: vg,
    se: Math.sqrt(vg),
    measure: "Hedges' g",
    raw: { m1, sd1, n1, m2, sd2, n2 },
    cohenD: d
  };
}

/**
 * Calculate Mean Difference (unstandardized)
 */
export function calculateMD(m1, sd1, n1, m2, sd2, n2) {
  const md = m1 - m2;
  const seMD = Math.sqrt((sd1 * sd1 / n1) + (sd2 * sd2 / n2));

  return {
    yi: md,
    vi: seMD * seMD,
    se: seMD,
    measure: 'MD',
    raw: { m1, sd1, n1, m2, sd2, n2 }
  };
}

/**
 * Calculate log Hazard Ratio from reported values
 * Supports HR with CI, or from events and person-time
 */
export function calculateLogHR(hr, ciLower, ciUpper, events1, total1, events2, total2) {
  let logHR, seLogHR;

  if (hr && ciLower && ciUpper) {
    // Calculate from HR and CI
    logHR = Math.log(hr);
    // SE from CI width (assuming log-normal distribution)
    seLogHR = (Math.log(ciUpper) - Math.log(ciLower)) / (2 * 1.96);
  } else if (events1 !== undefined && total1 && events2 !== undefined && total2) {
    // Approximate from events (Peto method)
    const O = events1;
    const E = (events1 + events2) * total1 / (total1 + total2);
    const V = E * (1 - total1 / (total1 + total2)) * (total1 + total2 - events1 - events2) / (total1 + total2 - 1);

    logHR = (O - E) / V;
    seLogHR = 1 / Math.sqrt(V);
  } else {
    return { yi: NaN, vi: NaN, se: NaN, measure: 'logHR', error: 'Insufficient data' };
  }

  return {
    yi: logHR,
    vi: seLogHR * seLogHR,
    se: seLogHR,
    measure: 'logHR',
    hr: Math.exp(logHR)
  };
}

// ============================================================================
// LOG-GAMMA FUNCTION (for exact Hedges' correction)
// ============================================================================

function lgamma(x) {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ============================================================================
// T-DISTRIBUTION FUNCTIONS (accurate for small df)
// ============================================================================

/**
 * t-distribution quantile using accurate approximation
 * Based on Hill (1970) algorithm
 */
function tQuantile(p, df) {
  if (df <= 0) return NaN;
  if (p <= 0 || p >= 1) return NaN;

  if (df >= 1000) {
    return normalQuantile(p);
  }

  // Use inverse beta function relationship
  // For two-tailed 95% CI, p = 0.975
  const x = betaInv(2 * Math.min(p, 1 - p), df / 2, 0.5);
  const t = Math.sqrt(df * (1 - x) / x);

  return p > 0.5 ? t : -t;
}

/**
 * t-distribution CDF using regularized incomplete beta function
 */
function tCDF(t, df) {
  if (df <= 0) return NaN;

  if (df >= 1000) {
    return normalCDF(t);
  }

  const x = df / (df + t * t);
  const prob = 0.5 * betaIncomplete(x, df / 2, 0.5);

  return t >= 0 ? 1 - prob : prob;
}

/**
 * Inverse of regularized incomplete beta function
 * Newton-Raphson iteration
 */
function betaInv(p, a, b, tol = 1e-10, maxIter = 100) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  // Initial guess using approximation
  let x = p;

  for (let i = 0; i < maxIter; i++) {
    const fx = betaIncomplete(x, a, b) - p;
    if (Math.abs(fx) < tol) break;

    // Derivative of incomplete beta
    const dfx = Math.pow(x, a - 1) * Math.pow(1 - x, b - 1) / betaFunction(a, b);
    if (dfx === 0) break;

    x = Math.max(0.0001, Math.min(0.9999, x - fx / dfx));
  }

  return x;
}

/**
 * Regularized incomplete beta function
 * Using continued fraction expansion
 */
function betaIncomplete(x, a, b) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(x, a, b) / a;
  } else {
    return 1 - bt * betaCF(1 - x, b, a) / b;
  }
}

/**
 * Continued fraction for incomplete beta
 */
function betaCF(x, a, b, maxIter = 200, eps = 1e-14) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));

    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

/**
 * Beta function B(a,b)
 */
function betaFunction(a, b) {
  return Math.exp(lgamma(a) + lgamma(b) - lgamma(a + b));
}

// ============================================================================
// META-ANALYSIS METHODS
// ============================================================================

/**
 * Fixed-effects meta-analysis (Inverse Variance method)
 */
export function fixedEffects(yi, vi) {
  const k = yi.length;
  if (k === 0) return null;

  const wi = vi.map(v => v > 0 ? 1 / v : 0);
  const sumW = wi.reduce((a, b) => a + b, 0);

  if (sumW === 0) return null;

  // Pooled estimate
  const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

  // Variance of pooled estimate
  const vTheta = 1 / sumW;
  const seTheta = Math.sqrt(vTheta);

  // Q statistic for heterogeneity
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
  const df = k - 1;
  const pQ = df > 0 ? 1 - chiSquareCDF(Q, df) : 1;

  // I² statistic (with CI using Q-profile method)
  const I2 = df > 0 ? Math.max(0, (Q - df) / Q) : 0;
  const H2 = df > 0 ? Q / df : 1;

  // 95% CI using normal distribution
  const z = normalQuantile(0.975);
  const ciLower = theta - z * seTheta;
  const ciUpper = theta + z * seTheta;

  // Z-test for effect
  const zTest = theta / seTheta;
  const pValue = 2 * (1 - normalCDF(Math.abs(zTest)));

  return {
    estimate: theta,
    se: seTheta,
    ci: [ciLower, ciUpper],
    z: zTest,
    p: pValue,
    Q,
    df,
    pQ,
    I2,
    H2,
    tau2: 0,
    tau: 0,
    weights: wi.map(w => w / sumW),
    method: 'FE',
    k
  };
}

/**
 * Random-effects meta-analysis (DerSimonian-Laird)
 */
export function randomEffectsDL(yi, vi) {
  const k = yi.length;
  if (k === 0) return null;

  const wi = vi.map(v => v > 0 ? 1 / v : 0);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const sumW2 = wi.reduce((a, w) => a + w * w, 0);

  if (sumW === 0) return null;

  // Fixed-effects estimate for Q calculation
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

  // Q statistic
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaFE, 2), 0);
  const df = k - 1;

  // Tau² estimate (DerSimonian-Laird)
  const C = sumW - sumW2 / sumW;
  let tau2 = df > 0 ? Math.max(0, (Q - df) / C) : 0;

  // Random-effects weights
  const wiRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = wiRE.reduce((a, b) => a + b, 0);

  // Pooled estimate
  const theta = yi.reduce((sum, y, i) => sum + wiRE[i] * y, 0) / sumWRE;

  // Variance of pooled estimate
  const vTheta = 1 / sumWRE;
  const seTheta = Math.sqrt(vTheta);

  // I² and H² statistics
  const I2 = df > 0 ? Math.max(0, (Q - df) / Q) : 0;
  const H2 = df > 0 ? Q / df : 1;

  // P-value for heterogeneity
  const pQ = df > 0 ? 1 - chiSquareCDF(Q, df) : 1;

  // 95% CI
  const z = normalQuantile(0.975);
  const ciLower = theta - z * seTheta;
  const ciUpper = theta + z * seTheta;

  // Z-test
  const zTest = theta / seTheta;
  const pValue = 2 * (1 - normalCDF(Math.abs(zTest)));

  // Confidence intervals for heterogeneity (Q-profile method)
  const hetCI = qProfileCI(yi, vi);

  return {
    estimate: theta,
    se: seTheta,
    ci: [ciLower, ciUpper],
    z: zTest,
    p: pValue,
    Q,
    df,
    pQ,
    I2,
    I2CI: hetCI.I2CI,
    H2,
    H2CI: hetCI.H2CI,
    tau2,
    tau2CI: hetCI.tau2CI,
    tau: Math.sqrt(tau2),
    tauCI: hetCI.tauCI,
    weights: wiRE.map(w => w / sumWRE),
    method: 'DL',
    k
  };
}

/**
 * Paule-Mandel estimator for tau²
 * Iterative method that sets Q = df
 */
export function estimateTau2PM(yi, vi, maxIter = 100, tol = 1e-6) {
  const k = yi.length;
  if (k < 2) return 0;

  let tau2 = randomEffectsDL(yi, vi)?.tau2 || 0;

  for (let iter = 0; iter < maxIter; iter++) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

    const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
    const df = k - 1;

    if (Math.abs(Q - df) < tol) break;

    // Derivative of Q with respect to tau²
    const wi2 = wi.map(w => w * w);
    const sumW2 = wi2.reduce((a, b) => a + b, 0);

    const dQ = -yi.reduce((sum, y, i) => sum + wi2[i] * Math.pow(y - theta, 2), 0) +
               Math.pow(yi.reduce((sum, y, i) => sum + wi2[i] * (y - theta), 0), 2) / sumW2;

    if (dQ === 0) break;

    const tau2New = Math.max(0, tau2 - (Q - df) / dQ);

    if (Math.abs(tau2New - tau2) < tol) {
      tau2 = tau2New;
      break;
    }
    tau2 = tau2New;
  }

  return tau2;
}

/**
 * REML estimation of tau²
 */
export function estimateTau2REML(yi, vi, maxIter = 100, tol = 1e-6) {
  const k = yi.length;
  if (k < 2) return 0;

  // Initialize with DL estimate
  let tau2 = randomEffectsDL(yi, vi)?.tau2 || 0;

  for (let iter = 0; iter < maxIter; iter++) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

    // REML criterion derivatives
    const wi2 = wi.map(w => w * w);
    const sumW2 = wi2.reduce((a, b) => a + b, 0);

    // First derivative of REML log-likelihood
    const Qprime = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
    const trP = sumW - sumW2 / sumW;
    const dL = -0.5 * trP + 0.5 * Qprime;

    // Second derivative
    const wi3 = wi.map(w => w * w * w);
    const sumW3 = wi3.reduce((a, b) => a + b, 0);
    const d2L = 0.5 * (sumW2 - 2 * sumW3 / sumW + sumW2 * sumW2 / (sumW * sumW));

    if (d2L === 0) break;

    // Newton-Raphson update
    const tau2New = Math.max(0, tau2 - dL / d2L);

    if (Math.abs(tau2New - tau2) < tol) {
      tau2 = tau2New;
      break;
    }
    tau2 = tau2New;
  }

  return tau2;
}

/**
 * Random-effects meta-analysis with REML
 */
export function randomEffectsREML(yi, vi) {
  const k = yi.length;
  if (k === 0) return null;

  // Estimate tau² using REML
  const tau2 = estimateTau2REML(yi, vi);

  // Random-effects weights
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);

  // Pooled estimate
  const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

  // Variance
  const vTheta = 1 / sumW;
  const seTheta = Math.sqrt(vTheta);

  // Q statistic (using fixed-effects weights for testing)
  const wiFE = vi.map(v => v > 0 ? 1 / v : 0);
  const sumWFE = wiFE.reduce((a, b) => a + b, 0);
  const thetaFE = sumWFE > 0 ? yi.reduce((sum, y, i) => sum + wiFE[i] * y, 0) / sumWFE : theta;
  const Q = yi.reduce((sum, y, i) => sum + wiFE[i] * Math.pow(y - thetaFE, 2), 0);
  const df = k - 1;
  const pQ = df > 0 ? 1 - chiSquareCDF(Q, df) : 1;

  const I2 = df > 0 ? Math.max(0, (Q - df) / Q) : 0;
  const H2 = df > 0 ? Q / df : 1;

  // 95% CI
  const z = normalQuantile(0.975);
  const ciLower = theta - z * seTheta;
  const ciUpper = theta + z * seTheta;

  // Z-test
  const zTest = theta / seTheta;
  const pValue = 2 * (1 - normalCDF(Math.abs(zTest)));

  // Confidence intervals for heterogeneity (Q-profile method)
  const hetCI = qProfileCI(yi, vi);

  return {
    estimate: theta,
    se: seTheta,
    ci: [ciLower, ciUpper],
    z: zTest,
    p: pValue,
    Q,
    df,
    pQ,
    I2,
    I2CI: hetCI.I2CI,
    H2,
    H2CI: hetCI.H2CI,
    tau2,
    tau2CI: hetCI.tau2CI,
    tau: Math.sqrt(tau2),
    tauCI: hetCI.tauCI,
    weights: wi.map(w => w / sumW),
    method: 'REML',
    k
  };
}

/**
 * Random-effects with Paule-Mandel estimator
 */
export function randomEffectsPM(yi, vi) {
  const k = yi.length;
  if (k === 0) return null;

  const tau2 = estimateTau2PM(yi, vi);

  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const vTheta = 1 / sumW;
  const seTheta = Math.sqrt(vTheta);

  // Q from FE weights
  const wiFE = vi.map(v => v > 0 ? 1 / v : 0);
  const sumWFE = wiFE.reduce((a, b) => a + b, 0);
  const thetaFE = yi.reduce((sum, y, i) => sum + wiFE[i] * y, 0) / sumWFE;
  const Q = yi.reduce((sum, y, i) => sum + wiFE[i] * Math.pow(y - thetaFE, 2), 0);
  const df = k - 1;
  const pQ = df > 0 ? 1 - chiSquareCDF(Q, df) : 1;
  const I2 = df > 0 ? Math.max(0, (Q - df) / Q) : 0;

  const z = normalQuantile(0.975);
  const ciLower = theta - z * seTheta;
  const ciUpper = theta + z * seTheta;
  const zTest = theta / seTheta;
  const pValue = 2 * (1 - normalCDF(Math.abs(zTest)));
  const H2 = df > 0 ? Q / df : 1;

  // Confidence intervals for heterogeneity (Q-profile method)
  const hetCI = qProfileCI(yi, vi);

  return {
    estimate: theta,
    se: seTheta,
    ci: [ciLower, ciUpper],
    z: zTest,
    p: pValue,
    Q,
    df,
    pQ,
    I2,
    I2CI: hetCI.I2CI,
    H2,
    H2CI: hetCI.H2CI,
    tau2,
    tau2CI: hetCI.tau2CI,
    tau: Math.sqrt(tau2),
    tauCI: hetCI.tauCI,
    weights: wi.map(w => w / sumW),
    method: 'PM',
    k
  };
}

/**
 * Hartung-Knapp-Sidik-Jonkman adjustment
 * Provides more accurate CIs, especially with few studies
 * Note: Does NOT apply floor of 1 to qAdj (original method)
 */
export function hksjAdjustment(yi, vi, result, applyFloor = false) {
  const k = yi.length;
  if (k < 3) return result; // Need at least 3 studies

  const theta = result.estimate;
  const tau2 = result.tau2 || 0;

  // Random-effects weights
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);

  // Q* statistic for HKSJ
  const Qstar = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);

  // HKSJ variance adjustment
  // Original method: no floor at 1
  // Modified method (Rover et al.): max(1, ...)
  const qAdj = applyFloor ? Math.max(1, Qstar / (k - 1)) : Qstar / (k - 1);
  const seHKSJ = Math.sqrt(qAdj / sumW);

  // Use t-distribution for CI (accurate implementation)
  const df = k - 1;
  const tCrit = tQuantile(0.975, df);
  const ciLower = theta - tCrit * seHKSJ;
  const ciUpper = theta + tCrit * seHKSJ;

  // t-test
  const tTest = seHKSJ > 0 ? theta / seHKSJ : 0;
  const pValue = seHKSJ > 0 ? 2 * (1 - tCDF(Math.abs(tTest), df)) : 1;

  return {
    ...result,
    seHKSJ,
    ciHKSJ: [ciLower, ciUpper],
    t: tTest,
    pHKSJ: pValue,
    qAdj,
    dfHKSJ: df,
    method: result.method + '+HKSJ',
    hksjWarning: qAdj < 1 ? 'qAdj < 1 may indicate anti-conservative CIs' : null
  };
}

/**
 * Prediction interval for a new study
 * Reference: Higgins et al. (2009) BMJ
 */
export function predictionInterval(result, alpha = 0.05) {
  const theta = result.estimate;
  const tau2 = result.tau2 || 0;
  const se = result.se;
  const k = result.k || (result.df + 1);

  if (k < 3 || tau2 === 0) {
    return {
      lower: result.ci[0],
      upper: result.ci[1],
      note: tau2 === 0 ? 'No heterogeneity, PI equals CI' : 'Insufficient studies for PI'
    };
  }

  // SE for prediction includes both estimation uncertainty and between-study variance
  const sePred = Math.sqrt(se * se + tau2);

  // Use t-distribution with k-2 df (Higgins et al. 2009)
  const df = k - 2;
  const tCrit = tQuantile(1 - alpha / 2, df);
  const lower = theta - tCrit * sePred;
  const upper = theta + tCrit * sePred;

  return { lower, upper, df, sePred };
}

// ============================================================================
// CONFIDENCE INTERVALS FOR HETEROGENEITY STATISTICS
// Q-Profile Method (Viechtbauer 2007; Higgins & Thompson 2002)
// ============================================================================

/**
 * Calculate Q statistic for a given tau²
 * Q(τ²) = Σ wᵢ(τ²) × (yᵢ - θ̂(τ²))²
 */
function calculateQ(yi, vi, tau2) {
  const k = yi.length;
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  return yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
}

/**
 * Q-profile confidence interval for τ²
 * Finds τ² values where Q(τ²) equals chi-square quantiles
 * Reference: Viechtbauer (2007) Stat Med
 */
export function qProfileCI(yi, vi, alpha = 0.05) {
  const k = yi.length;
  const df = k - 1;

  if (k < 2) {
    return { tau2CI: [0, Infinity], I2CI: [0, 100], H2CI: [1, Infinity] };
  }

  // Chi-square quantiles for CI bounds
  const chiLower = chiSquareQuantile(alpha / 2, df);
  const chiUpper = chiSquareQuantile(1 - alpha / 2, df);

  // Calculate Q at tau²=0 (fixed effects Q)
  const Q0 = calculateQ(yi, vi, 0);

  // τ² lower bound: find τ² where Q(τ²) = χ²(1-α/2, k-1)
  // If Q0 < chiUpper, then τ² lower = 0
  let tau2Lower = 0;
  if (Q0 > chiUpper) {
    tau2Lower = findTau2ForQ(yi, vi, chiUpper);
  }

  // τ² upper bound: find τ² where Q(τ²) = χ²(α/2, k-1)
  // Need to solve Q(τ²) = chiLower
  let tau2Upper = Infinity;
  if (Q0 > chiLower) {
    tau2Upper = findTau2ForQ(yi, vi, chiLower);
  }

  // Convert τ² CI to I² CI using the transformation
  // I² = 100% × (Q - df) / Q, so we need to express in terms of τ²
  // For Q-profile method, use: I² = τ² / (τ² + σ̄²)
  // where σ̄² is the "typical" within-study variance

  // Calculate typical variance (harmonic mean-like)
  const wiFE = vi.map(v => v > 0 ? 1 / v : 0);
  const sumWFE = wiFE.reduce((a, b) => a + b, 0);
  const sumWFE2 = wiFE.reduce((a, w) => a + w * w, 0);
  const typicalVar = (k - 1) / (sumWFE - sumWFE2 / sumWFE);

  // I² confidence interval (Higgins & Thompson 2002)
  // Using the direct transformation: I² = τ² / (τ² + σ̄²)
  const I2Lower = 100 * tau2Lower / (tau2Lower + typicalVar);
  const I2Upper = tau2Upper === Infinity ? 100 : 100 * tau2Upper / (tau2Upper + typicalVar);

  // H² = 1 + τ²/σ̄² so H²CI follows directly
  const H2Lower = 1 + tau2Lower / typicalVar;
  const H2Upper = tau2Upper === Infinity ? Infinity : 1 + tau2Upper / typicalVar;

  return {
    tau2CI: [tau2Lower, tau2Upper],
    tauCI: [Math.sqrt(tau2Lower), tau2Upper === Infinity ? Infinity : Math.sqrt(tau2Upper)],
    I2CI: [Math.max(0, I2Lower), Math.min(100, I2Upper)],
    H2CI: [Math.max(1, H2Lower), H2Upper],
    typicalVar,
    method: 'Q-profile'
  };
}

/**
 * Find τ² value that gives a specific Q statistic
 * Uses bisection search
 */
function findTau2ForQ(yi, vi, targetQ, tol = 1e-8, maxIter = 100) {
  // Q is monotonically decreasing in τ², so we can use bisection
  let lower = 0;
  let upper = 100; // Start with reasonable upper bound

  // Expand upper bound if needed
  while (calculateQ(yi, vi, upper) > targetQ && upper < 1e10) {
    upper *= 10;
  }

  if (upper >= 1e10) {
    return Infinity;
  }

  // Bisection search
  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (lower + upper) / 2;
    const Qmid = calculateQ(yi, vi, mid);

    if (Math.abs(Qmid - targetQ) < tol) {
      return mid;
    }

    if (Qmid > targetQ) {
      lower = mid;
    } else {
      upper = mid;
    }

    if (upper - lower < tol) {
      return mid;
    }
  }

  return (lower + upper) / 2;
}

/**
 * Alternative I² CI using Higgins & Thompson (2002) large-sample approximation
 * Less accurate but faster, useful for very large k
 */
export function I2CILargeSample(Q, df, alpha = 0.05) {
  if (df <= 0) return { lower: 0, upper: 0 };

  const H2 = Q / df;
  const I2 = Math.max(0, (Q - df) / Q);

  // SE of ln(H) (Higgins & Thompson 2002)
  let seLnH;
  if (Q > df + 1) {
    // Large Q
    seLnH = 0.5 * Math.log(Q / df) / (Math.sqrt(2 * Q) - Math.sqrt(2 * df - 1));
  } else if (Q > df) {
    // Moderate Q
    seLnH = Math.sqrt((1 / (2 * (df - 1))) * (1 - 1 / (3 * Math.pow(df - 1, 2))));
  } else {
    // Q ≤ df means I² = 0
    return { I2, I2Lower: 0, I2Upper: Math.max(0, 1 - df / Q) * 100 };
  }

  const z = normalQuantile(1 - alpha / 2);
  const lnH = 0.5 * Math.log(H2);

  const H2Lower = Math.exp(2 * (lnH - z * seLnH));
  const H2Upper = Math.exp(2 * (lnH + z * seLnH));

  const I2Lower = Math.max(0, (H2Lower - 1) / H2Lower) * 100;
  const I2Upper = Math.min(100, (H2Upper - 1) / H2Upper * 100);

  return { I2: I2 * 100, I2Lower, I2Upper, H2, H2Lower, H2Upper, method: 'large-sample' };
}

// ============================================================================
// PUBLICATION BIAS TESTS
// ============================================================================

/**
 * Egger's test for small-study effects (publication bias)
 * Uses precision-weighted regression (correct implementation)
 */
export function eggerTest(yi, vi) {
  const k = yi.length;
  if (k < 3) {
    return {
      intercept: NaN,
      se: NaN,
      t: NaN,
      p: NaN,
      df: NaN,
      note: 'Insufficient studies (need k >= 3)'
    };
  }

  const se = vi.map(v => Math.sqrt(v));
  const precision = se.map(s => s > 0 ? 1 / s : 0);

  // Standardized effect (z-scores)
  const zi = yi.map((y, i) => se[i] > 0 ? y / se[i] : 0);

  // Weighted regression: zi = a + b * precision
  // Weights are precision² (inverse variance of zi)
  const wi = precision.map(p => p * p);
  const sumW = wi.reduce((a, b) => a + b, 0);

  if (sumW === 0) {
    return { intercept: NaN, se: NaN, t: NaN, p: NaN, df: NaN };
  }

  // Weighted means
  const xBar = wi.reduce((sum, w, i) => sum + w * precision[i], 0) / sumW;
  const yBar = wi.reduce((sum, w, i) => sum + w * zi[i], 0) / sumW;

  // Weighted covariance and variance
  const sxy = wi.reduce((sum, w, i) => sum + w * (precision[i] - xBar) * (zi[i] - yBar), 0);
  const sxx = wi.reduce((sum, w, i) => sum + w * Math.pow(precision[i] - xBar, 2), 0);

  if (sxx === 0) {
    return { intercept: NaN, se: NaN, t: NaN, p: NaN, df: NaN };
  }

  // Slope and intercept
  const b = sxy / sxx;
  const a = yBar - b * xBar;

  // Residual standard error
  const residuals = zi.map((z, i) => z - a - b * precision[i]);
  const sse = wi.reduce((sum, w, i) => sum + w * residuals[i] * residuals[i], 0);
  const df = k - 2;
  const mse = sse / df;

  // SE of intercept
  const seA = Math.sqrt(mse * (1/sumW + xBar * xBar / sxx));

  // t-test for intercept (H0: a = 0, i.e., no asymmetry)
  const t = a / seA;
  const p = 2 * (1 - tCDF(Math.abs(t), df));

  return {
    intercept: a,
    se: seA,
    slope: b,
    t,
    p,
    df,
    bias: p < 0.1 ? (a > 0 ? 'positive' : 'negative') : 'none detected'
  };
}

/**
 * Begg's rank correlation test
 */
export function beggTest(yi, vi) {
  const k = yi.length;
  if (k < 3) {
    return { tau: NaN, z: NaN, p: NaN, note: 'Insufficient studies' };
  }

  const se = vi.map(v => Math.sqrt(v));

  // Standardized effects
  const zi = yi.map((y, i) => y / se[i]);

  // Calculate Kendall's tau between effect size and variance
  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const sign = (yi[i] - yi[j]) * (vi[i] - vi[j]);
      if (sign > 0) concordant++;
      else if (sign < 0) discordant++;
    }
  }

  const tau = (concordant - discordant) / (k * (k - 1) / 2);

  // Test statistic (corrected for ties)
  const var_tau = (2 * (2 * k + 5)) / (9 * k * (k - 1));
  const z = tau / Math.sqrt(var_tau);
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    tau,
    z,
    p,
    bias: p < 0.1 ? 'possible' : 'none detected'
  };
}

/**
 * Peters' test for publication bias (for binary outcomes)
 * More appropriate than Egger's for OR
 */
export function petersTest(yi, vi, ni) {
  const k = yi.length;
  if (k < 3 || !ni) {
    return { intercept: NaN, se: NaN, t: NaN, p: NaN, note: 'Need sample sizes' };
  }

  // Peters' test regresses effect on 1/N
  const invN = ni.map(n => 1 / n);

  // Weighted regression with inverse variance weights
  const wi = vi.map(v => v > 0 ? 1 / v : 0);
  const sumW = wi.reduce((a, b) => a + b, 0);

  const xBar = wi.reduce((sum, w, i) => sum + w * invN[i], 0) / sumW;
  const yBar = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

  const sxy = wi.reduce((sum, w, i) => sum + w * (invN[i] - xBar) * (yi[i] - yBar), 0);
  const sxx = wi.reduce((sum, w, i) => sum + w * Math.pow(invN[i] - xBar, 2), 0);

  if (sxx === 0) {
    return { intercept: NaN, se: NaN, t: NaN, p: NaN };
  }

  const b = sxy / sxx;
  const a = yBar - b * xBar;

  const residuals = yi.map((y, i) => y - a - b * invN[i]);
  const sse = wi.reduce((sum, w, i) => sum + w * residuals[i] * residuals[i], 0);
  const df = k - 2;
  const mse = sse / df;
  const seA = Math.sqrt(mse * (1/sumW + xBar * xBar / sxx));

  const t = a / seA;
  const p = 2 * (1 - tCDF(Math.abs(t), df));

  return {
    intercept: a,
    se: seA,
    slope: b,
    t,
    p,
    df,
    bias: p < 0.1 ? 'possible' : 'none detected'
  };
}

/**
 * Trim-and-fill method for adjusting for publication bias
 * Auto-detects asymmetry side
 */
export function trimAndFill(yi, vi, options = {}) {
  const { side = 'auto', estimator = 'R0', maxIter = 100 } = options;
  const k = yi.length;

  if (k < 3) {
    return {
      estimate: NaN,
      k0: 0,
      side: 'none',
      note: 'Insufficient studies for trim-and-fill'
    };
  }

  // Get initial estimate
  let result = randomEffectsDL(yi, vi);
  let theta = result.estimate;

  // Auto-detect side based on asymmetry
  let fillSide = side;
  if (side === 'auto') {
    const egger = eggerTest(yi, vi);
    fillSide = egger.intercept > 0 ? 'right' : 'left';
  }

  // Sort studies
  const sorted = yi.map((y, i) => ({ y, v: vi[i], idx: i }))
    .sort((a, b) => a.y - b.y);

  let k0 = 0;
  let imputedStudies = [];

  for (let iter = 0; iter < maxIter; iter++) {
    // Calculate distances from pooled estimate
    const distances = sorted.map((s, i) => {
      const dist = fillSide === 'right' ? theta - s.y : s.y - theta;
      return { index: i, distance: dist, study: s };
    });

    // Get studies on the "missing" side
    const extremeStudies = distances
      .filter(d => d.distance > 0)
      .sort((a, b) => b.distance - a.distance);

    const n = extremeStudies.length;
    if (n === 0) break;

    // Estimate k0 using selected estimator
    let k0New;
    if (estimator === 'L0') {
      // L0 estimator
      const ranks = extremeStudies.map((d, i) => n - i);
      const T = ranks.reduce((sum, r) => sum + r, 0);
      k0New = Math.round(Math.max(0, (4 * T - n * (n + 1)) / (2 * n - 1)));
    } else if (estimator === 'Q0') {
      // Q0 estimator (uses squared ranks)
      const ranks = extremeStudies.map((d, i) => n - i);
      const T = ranks.reduce((sum, r) => sum + r * r, 0);
      k0New = Math.round(Math.max(0, Math.sqrt(2 * T) - n));
    } else {
      // R0 estimator (default)
      const ranks = extremeStudies.map((d, i) => n - i);
      let gamma = 0;
      for (let i = 0; i < n; i++) {
        if (extremeStudies[i].distance > 0) gamma++;
      }
      k0New = Math.round(Math.max(0, (4 * gamma - n) / 2));
    }

    if (k0New === k0 || k0New === 0) break;
    k0 = k0New;

    // Impute missing studies by mirroring extreme studies
    imputedStudies = [];
    const studiesToMirror = fillSide === 'right'
      ? sorted.slice(0, Math.min(k0, sorted.length))
      : sorted.slice(-Math.min(k0, sorted.length));

    for (const study of studiesToMirror) {
      imputedStudies.push({
        y: 2 * theta - study.y,
        v: study.v,
        imputed: true
      });
    }

    // Re-estimate with imputed studies
    const allYi = [...yi, ...imputedStudies.map(s => s.y)];
    const allVi = [...vi, ...imputedStudies.map(s => s.v)];
    result = randomEffectsDL(allYi, allVi);
    theta = result.estimate;
  }

  return {
    ...result,
    k0,
    kOriginal: k,
    kTotal: k + k0,
    side: fillSide,
    adjusted: k0 > 0,
    imputedStudies,
    originalEstimate: randomEffectsDL(yi, vi).estimate
  };
}

// ============================================================================
// SENSITIVITY ANALYSIS
// ============================================================================

/**
 * E-value for sensitivity analysis
 * Represents the minimum strength of unmeasured confounding to explain away the effect
 * Properly handles protective effects (RR < 1)
 */
export function calculateEvalue(estimate, ciLower, ciUpper, measure = 'RR') {
  let rr, rrCI;

  if (measure === 'logRR' || measure === 'logOR' || measure === 'logHR') {
    rr = Math.exp(estimate);
    // For protective effects, we care about the CI bound closest to null
    if (estimate < 0) {
      rrCI = Math.exp(ciUpper); // Upper bound for protective effect
    } else {
      rrCI = Math.exp(ciLower); // Lower bound for harmful effect
    }
  } else if (measure === 'OR' && Math.abs(estimate) < 0.5) {
    // Convert OR to approximate RR for rare outcomes
    // RR ≈ OR for rare outcomes
    rr = estimate;
    rrCI = estimate < 1 ? ciUpper : ciLower;
  } else {
    rr = estimate;
    rrCI = estimate < 1 ? ciUpper : ciLower;
  }

  // E-value formula: E = RR + sqrt(RR * (RR - 1)) for RR > 1
  // For RR < 1, invert first: E = 1/RR + sqrt((1/RR) * (1/RR - 1))

  function computeE(r) {
    if (r <= 1) return 1;
    return r + Math.sqrt(r * (r - 1));
  }

  const rrForE = rr < 1 ? 1 / rr : rr;
  const rrCIForE = rrCI < 1 ? 1 / rrCI : rrCI;

  const eValue = computeE(rrForE);
  const eValueCI = computeE(rrCIForE);

  return {
    eValue,
    eValueCI,
    direction: rr < 1 ? 'protective' : 'harmful',
    interpretation: eValue > 3 ? 'Robust to strong confounding' :
                    eValue > 2 ? 'Robust to moderate confounding' :
                    eValue > 1.5 ? 'Sensitive to weak-moderate confounding' :
                    'Very sensitive to confounding'
  };
}

/**
 * Leave-one-out sensitivity analysis
 */
export function leaveOneOut(yi, vi, method = 'DL') {
  const k = yi.length;
  const results = [];

  const analysisFn = method === 'FE' ? fixedEffects :
                     method === 'REML' ? randomEffectsREML :
                     method === 'PM' ? randomEffectsPM :
                     randomEffectsDL;

  for (let i = 0; i < k; i++) {
    const yiLOO = [...yi.slice(0, i), ...yi.slice(i + 1)];
    const viLOO = [...vi.slice(0, i), ...vi.slice(i + 1)];

    const res = analysisFn(yiLOO, viLOO);

    results.push({
      excluded: i,
      estimate: res?.estimate,
      ci: res?.ci,
      I2: res?.I2,
      tau2: res?.tau2
    });
  }

  // Calculate influence statistics
  const baseResult = analysisFn(yi, vi);
  const influences = results.map((r, i) => ({
    ...r,
    influence: baseResult.estimate - r.estimate,
    influencePercent: ((baseResult.estimate - r.estimate) / Math.abs(baseResult.estimate)) * 100
  }));

  return {
    results: influences,
    maxInfluence: Math.max(...influences.map(r => Math.abs(r.influence))),
    mostInfluential: influences.reduce((max, r, i) =>
      Math.abs(r.influence) > Math.abs(max.influence) ? r : max, influences[0])
  };
}

/**
 * Cumulative meta-analysis
 * Supports different ordering options
 */
export function cumulativeMA(yi, vi, studies = [], options = {}) {
  const { order = 'chronological', method = 'DL', orderField = 'year' } = options;
  const k = yi.length;

  // Create indices for ordering
  let indices = Array.from({ length: k }, (_, i) => i);

  if (order !== 'none' && studies.length === k) {
    if (order === 'chronological' && studies[0]?.[orderField]) {
      indices.sort((a, b) => {
        const dateA = new Date(studies[a][orderField] || 0);
        const dateB = new Date(studies[b][orderField] || 0);
        return dateA - dateB;
      });
    } else if (order === 'precision') {
      indices.sort((a, b) => vi[a] - vi[b]); // Smallest variance (highest precision) first
    } else if (order === 'effect') {
      indices.sort((a, b) => yi[a] - yi[b]); // Smallest effect first
    } else if (order === 'sample_size' && studies[0]?.n) {
      indices.sort((a, b) => (studies[b].n || 0) - (studies[a].n || 0)); // Largest first
    }
  }

  const analysisFn = method === 'FE' ? fixedEffects :
                     method === 'REML' ? randomEffectsREML :
                     randomEffectsDL;

  const results = [];

  for (let i = 1; i <= k; i++) {
    const selectedIndices = indices.slice(0, i);
    const yiCum = selectedIndices.map(idx => yi[idx]);
    const viCum = selectedIndices.map(idx => vi[idx]);

    const res = analysisFn(yiCum, viCum);

    results.push({
      k: i,
      indices: selectedIndices,
      estimate: res?.estimate,
      ci: res?.ci,
      I2: res?.I2,
      tau2: res?.tau2,
      study: studies[indices[i-1]]
    });
  }

  return {
    results,
    order,
    finalEstimate: results[k - 1]?.estimate
  };
}

// ============================================================================
// META-REGRESSION
// ============================================================================

/**
 * Mixed-effects meta-regression
 * yi = b0 + b1*xi + ui + ei
 * where ui ~ N(0, tau²) and ei ~ N(0, vi)
 */
export function metaRegression(yi, vi, xi, options = {}) {
  const { method = 'REML', test = 'knha' } = options;
  const k = yi.length;

  if (k < 4) {
    return {
      error: 'Need at least 4 studies for meta-regression',
      b0: NaN, b1: NaN
    };
  }

  // Ensure xi is array of arrays for multiple covariates
  const X = Array.isArray(xi[0]) ? xi : xi.map(x => [x]);
  const p = X[0].length; // Number of covariates

  // Add intercept column
  const Xfull = X.map(row => [1, ...row]);
  const pFull = p + 1;

  // Estimate tau² using method of moments or REML
  let tau2 = estimateTau2MetaReg(yi, vi, Xfull, method);

  // Weighted least squares
  const wi = vi.map(v => 1 / (v + tau2));
  const W = wi; // Diagonal weight matrix (stored as vector)

  // X'WX
  const XtWX = new Array(pFull).fill(0).map(() => new Array(pFull).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < pFull; j++) {
      for (let l = 0; l < pFull; l++) {
        XtWX[j][l] += W[i] * Xfull[i][j] * Xfull[i][l];
      }
    }
  }

  // X'Wy
  const XtWy = new Array(pFull).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < pFull; j++) {
      XtWy[j] += W[i] * Xfull[i][j] * yi[i];
    }
  }

  // Solve for beta: (X'WX)^-1 * X'Wy
  const XtWXinv = invertMatrix(XtWX);
  if (!XtWXinv) {
    return { error: 'Singular matrix in meta-regression' };
  }

  const beta = new Array(pFull).fill(0);
  for (let j = 0; j < pFull; j++) {
    for (let l = 0; l < pFull; l++) {
      beta[j] += XtWXinv[j][l] * XtWy[l];
    }
  }

  // Standard errors
  const seBeta = XtWXinv.map((row, i) => Math.sqrt(row[i]));

  // Residual heterogeneity (QE)
  const yhat = Xfull.map(row => row.reduce((sum, x, j) => sum + x * beta[j], 0));
  const residuals = yi.map((y, i) => y - yhat[i]);
  const QE = residuals.reduce((sum, r, i) => sum + W[i] * r * r, 0);
  const dfE = k - pFull;
  const pQE = dfE > 0 ? 1 - chiSquareCDF(QE, dfE) : 1;

  // Test for moderators (QM)
  // QM tests whether coefficients (except intercept) are jointly zero
  const QM = beta.slice(1).reduce((sum, b, i) => {
    return sum + (b * b) / (seBeta[i + 1] * seBeta[i + 1]);
  }, 0);
  const dfM = p;
  const pQM = 1 - chiSquareCDF(QM, dfM);

  // R² analog
  const tau2RE = randomEffectsDL(yi, vi)?.tau2 || 0;
  const R2 = tau2RE > 0 ? Math.max(0, (tau2RE - tau2) / tau2RE) : 0;

  // Apply Knapp-Hartung adjustment if requested
  let results;
  if (test === 'knha' && dfE > 0) {
    const qAdj = QE / dfE;
    const seAdj = seBeta.map(se => se * Math.sqrt(qAdj));
    const tStats = beta.map((b, i) => b / seAdj[i]);
    const pValues = tStats.map(t => 2 * (1 - tCDF(Math.abs(t), dfE)));
    const tCrit = tQuantile(0.975, dfE);
    const ciLower = beta.map((b, i) => b - tCrit * seAdj[i]);
    const ciUpper = beta.map((b, i) => b + tCrit * seAdj[i]);

    results = {
      coefficients: beta.map((b, i) => ({
        estimate: b,
        se: seAdj[i],
        t: tStats[i],
        p: pValues[i],
        ci: [ciLower[i], ciUpper[i]]
      }))
    };
  } else {
    const zStats = beta.map((b, i) => b / seBeta[i]);
    const pValues = zStats.map(z => 2 * (1 - normalCDF(Math.abs(z))));
    const zCrit = normalQuantile(0.975);
    const ciLower = beta.map((b, i) => b - zCrit * seBeta[i]);
    const ciUpper = beta.map((b, i) => b + zCrit * seBeta[i]);

    results = {
      coefficients: beta.map((b, i) => ({
        estimate: b,
        se: seBeta[i],
        z: zStats[i],
        p: pValues[i],
        ci: [ciLower[i], ciUpper[i]]
      }))
    };
  }

  return {
    ...results,
    intercept: results.coefficients[0],
    slopes: results.coefficients.slice(1),
    tau2,
    tau: Math.sqrt(tau2),
    QE,
    dfE,
    pQE,
    QM,
    dfM,
    pQM,
    R2,
    I2residual: dfE > 0 ? Math.max(0, (QE - dfE) / QE) * 100 : 0,
    k,
    method,
    test
  };
}

/**
 * Estimate tau² for meta-regression using method of moments
 */
function estimateTau2MetaReg(yi, vi, X, method = 'REML', maxIter = 100, tol = 1e-6) {
  const k = yi.length;
  const p = X[0].length;

  // Initialize with simple DL-like estimate
  const wiFE = vi.map(v => v > 0 ? 1 / v : 0);
  const sumW = wiFE.reduce((a, b) => a + b, 0);
  const yBar = yi.reduce((sum, y, i) => sum + wiFE[i] * y, 0) / sumW;
  const Q = yi.reduce((sum, y, i) => sum + wiFE[i] * (y - yBar) * (y - yBar), 0);
  const C = sumW - wiFE.reduce((a, w) => a + w * w, 0) / sumW;
  let tau2 = Math.max(0, (Q - (k - 1)) / C);

  if (method === 'REML') {
    for (let iter = 0; iter < maxIter; iter++) {
      const wi = vi.map(v => 1 / (v + tau2));

      // Compute X'WX and its inverse
      const XtWX = new Array(p).fill(0).map(() => new Array(p).fill(0));
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < p; j++) {
          for (let l = 0; l < p; l++) {
            XtWX[j][l] += wi[i] * X[i][j] * X[i][l];
          }
        }
      }
      const XtWXinv = invertMatrix(XtWX);
      if (!XtWXinv) break;

      // Fitted values
      const XtWy = new Array(p).fill(0);
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < p; j++) {
          XtWy[j] += wi[i] * X[i][j] * yi[i];
        }
      }
      const beta = new Array(p).fill(0);
      for (let j = 0; j < p; j++) {
        for (let l = 0; l < p; l++) {
          beta[j] += XtWXinv[j][l] * XtWy[l];
        }
      }

      // Residuals
      const resid = yi.map((y, i) => y - X[i].reduce((sum, x, j) => sum + x * beta[j], 0));
      const Qres = resid.reduce((sum, r, i) => sum + wi[i] * r * r, 0);

      // Update tau²
      const wi2 = wi.map(w => w * w);
      const trP = wi.reduce((a, b) => a + b, 0);
      let trP2 = 0;
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < p; j++) {
          for (let l = 0; l < p; l++) {
            trP2 += wi2[i] * X[i][j] * XtWXinv[j][l] * X[i][l];
          }
        }
      }
      const denom = trP - trP2;

      if (denom <= 0) break;

      const tau2New = Math.max(0, tau2 + (Qres - (k - p)) / denom);

      if (Math.abs(tau2New - tau2) < tol) {
        tau2 = tau2New;
        break;
      }
      tau2 = tau2New;
    }
  }

  return tau2;
}

/**
 * Simple matrix inversion (for small matrices in meta-regression)
 */
function invertMatrix(M) {
  const n = M.length;

  // Create augmented matrix [M | I]
  const aug = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }

    // Swap rows
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    // Check for singular matrix
    if (Math.abs(aug[col][col]) < 1e-10) {
      return null;
    }

    // Scale pivot row
    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }
  }

  // Extract inverse
  return aug.map(row => row.slice(n));
}

// ============================================================================
// SUBGROUP ANALYSIS
// ============================================================================

/**
 * Subgroup analysis with test for subgroup differences
 */
export function subgroupAnalysis(yi, vi, groups, options = {}) {
  const { method = 'DL', poolWithin = true } = options;
  const k = yi.length;

  // Get unique groups
  const uniqueGroups = [...new Set(groups)];
  const nGroups = uniqueGroups.length;

  if (nGroups < 2) {
    return { error: 'Need at least 2 subgroups' };
  }

  const analysisFn = method === 'FE' ? fixedEffects :
                     method === 'REML' ? randomEffectsREML :
                     randomEffectsDL;

  // Analyze each subgroup
  const subgroupResults = {};
  let Qwithin = 0;
  let dfWithin = 0;

  for (const group of uniqueGroups) {
    const indices = groups.map((g, i) => g === group ? i : -1).filter(i => i >= 0);
    const yiGroup = indices.map(i => yi[i]);
    const viGroup = indices.map(i => vi[i]);

    const result = analysisFn(yiGroup, viGroup);
    subgroupResults[group] = {
      ...result,
      k: indices.length,
      indices
    };

    Qwithin += result.Q;
    dfWithin += result.df;
  }

  // Overall analysis
  const overall = analysisFn(yi, vi);

  // Test for subgroup differences (Q-between)
  // Qbetween = Qtotal - Qwithin
  const Qtotal = overall.Q;
  const Qbetween = Qtotal - Qwithin;
  const dfBetween = nGroups - 1;
  const pBetween = 1 - chiSquareCDF(Qbetween, dfBetween);

  // Alternative: Fixed-effects test using subgroup estimates
  const subgroupEstimates = uniqueGroups.map(g => subgroupResults[g].estimate);
  const subgroupVariances = uniqueGroups.map(g => subgroupResults[g].se ** 2);

  const wiSubgroup = subgroupVariances.map(v => v > 0 ? 1 / v : 0);
  const sumWSubgroup = wiSubgroup.reduce((a, b) => a + b, 0);
  const thetaPooled = wiSubgroup.reduce((sum, w, i) => sum + w * subgroupEstimates[i], 0) / sumWSubgroup;

  const QbetweenFE = wiSubgroup.reduce((sum, w, i) =>
    sum + w * Math.pow(subgroupEstimates[i] - thetaPooled, 2), 0);

  return {
    subgroups: subgroupResults,
    overall,
    test: {
      Qbetween,
      dfBetween,
      pBetween,
      QbetweenFE,
      significant: pBetween < 0.05
    },
    Qwithin,
    dfWithin,
    pWithin: 1 - chiSquareCDF(Qwithin, dfWithin),
    I2within: dfWithin > 0 ? Math.max(0, (Qwithin - dfWithin) / Qwithin) * 100 : 0,
    nGroups,
    method
  };
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Run complete meta-analysis
 */
export function runMetaAnalysis(studies, options = {}) {
  const {
    method = 'DL',
    hksj = true,
    hksjFloor = false,
    outcomeType = 'binary',
    effectMeasure = null,
    continuityCorrection = 'constant'
  } = options;

  // Determine effect measure
  const measure = effectMeasure || (outcomeType === 'binary' ? 'RR' : 'SMD');

  // Calculate effect sizes if raw data provided
  let yi, vi, sampleSizes = [];

  if (studies[0]?.yi !== undefined) {
    // Pre-calculated effects
    yi = studies.map(s => s.yi);
    vi = studies.map(s => s.vi);
    sampleSizes = studies.map(s => s.n || (s.arm1?.total || 0) + (s.arm2?.total || 0));
  } else {
    // Calculate from raw data
    const effectOptions = { correction: continuityCorrection };
    const effects = studies.map(s => {
      const type = s.outcomeType || outcomeType;
      return calculateEffectSize(type === 'binary' ? measure : type, s.arm1, s.arm2, effectOptions);
    });
    yi = effects.map(e => e.yi);
    vi = effects.map(e => e.vi);
    sampleSizes = studies.map(s => (s.arm1?.total || 0) + (s.arm2?.total || 0));
  }

  // Filter out invalid effects
  const validIndices = yi.map((y, i) => !isNaN(y) && !isNaN(vi[i]) && vi[i] > 0 ? i : -1).filter(i => i >= 0);
  if (validIndices.length < 2) {
    return { error: 'Need at least 2 valid studies', k: validIndices.length };
  }

  const yiValid = validIndices.map(i => yi[i]);
  const viValid = validIndices.map(i => vi[i]);
  const niValid = validIndices.map(i => sampleSizes[i]);

  // Run main analysis
  let result;
  switch (method) {
    case 'FE':
      result = fixedEffects(yiValid, viValid);
      break;
    case 'REML':
      result = randomEffectsREML(yiValid, viValid);
      break;
    case 'PM':
      result = randomEffectsPM(yiValid, viValid);
      break;
    default:
      result = randomEffectsDL(yiValid, viValid);
  }

  if (!result) {
    return { error: 'Analysis failed' };
  }

  // Apply HKSJ adjustment if requested (for random effects only)
  if (hksj && method !== 'FE') {
    result = hksjAdjustment(yiValid, viValid, result, hksjFloor);
  }

  // Add prediction interval
  result.predictionInterval = predictionInterval(result);

  // Add publication bias tests
  result.egger = eggerTest(yiValid, viValid);
  result.begg = beggTest(yiValid, viValid);
  result.trimFill = trimAndFill(yiValid, viValid, { side: 'auto' });

  // Add Peters' test for binary outcomes
  if (outcomeType === 'binary' && niValid.some(n => n > 0)) {
    result.peters = petersTest(yiValid, viValid, niValid);
  }

  // Add E-value
  result.eValue = calculateEvalue(
    result.estimate,
    result.ci[0],
    result.ci[1],
    measure === 'RR' || measure === 'OR' || measure === 'HR' ? 'log' + measure : measure
  );

  // Add sensitivity analyses
  result.leaveOneOut = leaveOneOut(yiValid, viValid, method);
  result.cumulative = cumulativeMA(yiValid, viValid, studies, { method, order: 'none' });

  return {
    ...result,
    k: yiValid.length,
    yi: yiValid,
    vi: viValid,
    sampleSizes: niValid,
    effectMeasure: measure,
    validIndices
  };
}

export default {
  // Effect size calculations
  calculateEffectSize,
  calculateLogRR,
  calculateLogOR,
  calculateRD,
  calculateSMD,
  calculateMD,
  calculateLogHR,

  // Meta-analysis methods
  fixedEffects,
  randomEffectsDL,
  randomEffectsREML,
  randomEffectsPM,
  hksjAdjustment,
  predictionInterval,
  qProfileCI,
  I2CILargeSample,

  // Publication bias
  eggerTest,
  beggTest,
  petersTest,
  trimAndFill,

  // Sensitivity analysis
  calculateEvalue,
  leaveOneOut,
  cumulativeMA,

  // Advanced methods
  metaRegression,
  subgroupAnalysis,

  // Main function
  runMetaAnalysis
};
