/**
 * Statistical helper functions
 * Living Meta-Analysis Platform
 */

// Constants
export const PI = Math.PI;
export const E = Math.E;
export const SQRT2 = Math.SQRT2;
export const SQRT2PI = Math.sqrt(2 * PI);

/**
 * Standard normal CDF (cumulative distribution function)
 * Uses Abramowitz & Stegun approximation
 * @param {number} x
 * @returns {number}
 */
export function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / SQRT2;

  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Standard normal PDF (probability density function)
 * @param {number} x
 * @returns {number}
 */
export function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

/**
 * Standard normal quantile function (inverse CDF)
 * Uses Rational approximation for lower region
 * @param {number} p - Probability (0 < p < 1)
 * @returns {number}
 */
export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation for central region
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];

  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];

  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];

  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Chi-square CDF
 * @param {number} x
 * @param {number} df - Degrees of freedom
 * @returns {number}
 */
export function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  return gammaCDF(x / 2, df / 2);
}

/**
 * Chi-square quantile (inverse CDF)
 * Uses Newton-Raphson iteration
 * Reference: Best & Roberts (1975)
 * @param {number} p - Probability
 * @param {number} df - Degrees of freedom
 * @returns {number}
 */
export function chiSquareQuantile(p, df) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (df <= 0) return NaN;

  // Wilson-Hilferty approximation as initial guess
  // (x/df)^(1/3) ≈ 1 - 2/(9df) + z*sqrt(2/(9df))
  const z = normalQuantile(p);
  const term = 2 / (9 * df);
  let x;

  if (df < 2) {
    // For small df, use simpler approximation
    x = Math.max(0.01, df * Math.pow(z * Math.sqrt(term) + 1 - term, 3));
  } else {
    const approx = 1 - term + z * Math.sqrt(term);
    x = df * Math.pow(Math.max(0.01, approx), 3);
  }

  // Newton-Raphson iteration
  for (let iter = 0; iter < 50; iter++) {
    const fx = chiSquareCDF(x, df) - p;

    if (Math.abs(fx) < 1e-12) break;

    // Derivative of chi-square CDF (chi-square PDF)
    const fpx = chiSquarePDF(x, df);

    if (fpx < 1e-30) break;

    const dx = fx / fpx;
    const xNew = Math.max(1e-10, x - dx);

    if (Math.abs(xNew - x) < 1e-10 * x) {
      x = xNew;
      break;
    }
    x = xNew;
  }

  return x;
}

/**
 * Chi-square PDF
 * @param {number} x
 * @param {number} df - Degrees of freedom
 * @returns {number}
 */
export function chiSquarePDF(x, df) {
  if (x <= 0) return 0;
  const k = df / 2;
  return Math.pow(x, k - 1) * Math.exp(-x / 2) / (Math.pow(2, k) * gamma(k));
}

/**
 * Gamma CDF (regularized incomplete gamma function)
 * @param {number} x
 * @param {number} a
 * @returns {number}
 */
export function gammaCDF(x, a) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    return gammaIncLower(a, x) / gamma(a);
  } else {
    return 1 - gammaIncUpper(a, x) / gamma(a);
  }
}

/**
 * Lower incomplete gamma function (series)
 * @param {number} a
 * @param {number} x
 * @returns {number}
 */
function gammaIncLower(a, x) {
  let sum = 0;
  let term = 1 / a;
  sum = term;

  for (let n = 1; n < 100; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
  }

  return Math.pow(x, a) * Math.exp(-x) * sum;
}

/**
 * Upper incomplete gamma function (continued fraction)
 * @param {number} a
 * @param {number} x
 * @returns {number}
 */
function gammaIncUpper(a, x) {
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 100; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }

  return Math.exp(-x + a * Math.log(x)) * h;
}

/**
 * Gamma function using Lanczos approximation
 * @param {number} z
 * @returns {number}
 */
export function gamma(z) {
  if (z < 0.5) {
    return PI / (Math.sin(PI * z) * gamma(1 - z));
  }

  z -= 1;

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

  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return Math.sqrt(2 * PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Log gamma function
 * @param {number} x
 * @returns {number}
 */
export function logGamma(x) {
  const c = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Student's t CDF
 * @param {number} t
 * @param {number} df - Degrees of freedom
 * @returns {number}
 */
export function tCDF(t, df) {
  const x = df / (df + t * t);
  return 1 - 0.5 * betaInc(df / 2, 0.5, x);
}

/**
 * Student's t quantile (inverse CDF)
 * Uses Newton-Raphson iteration
 * @param {number} p - Probability
 * @param {number} df - Degrees of freedom
 * @returns {number}
 */
export function tQuantile(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Initial guess from normal approximation
  let x = normalQuantile(p);

  // Newton-Raphson refinement
  for (let i = 0; i < 10; i++) {
    const fx = tCDF(x, df) - p;
    const fpx = tPDF(x, df);
    const dx = fx / fpx;
    x -= dx;
    if (Math.abs(dx) < 1e-10) break;
  }

  return x;
}

/**
 * Student's t PDF
 * @param {number} t
 * @param {number} df
 * @returns {number}
 */
export function tPDF(t, df) {
  const coef = gamma((df + 1) / 2) / (Math.sqrt(df * PI) * gamma(df / 2));
  return coef * Math.pow(1 + t * t / df, -(df + 1) / 2);
}

/**
 * Incomplete beta function (regularized)
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @returns {number}
 */
export function betaInc(a, b, x) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(a, b, x) / a;
  } else {
    return 1 - bt * betaCF(b, a, 1 - x) / b;
  }
}

/**
 * Continued fraction for beta function
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @returns {number}
 */
function betaCF(a, b, x) {
  const maxIter = 100;
  const eps = 1e-12;

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

    // Even step
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    // Odd step
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
 * Convert p-value to z-score
 * @param {number} p
 * @returns {number}
 */
export function pToZ(p) {
  return normalQuantile(1 - p / 2);
}

/**
 * Convert z-score to p-value (two-tailed)
 * @param {number} z
 * @returns {number}
 */
export function zToP(z) {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

/**
 * Simple linear regression
 * @param {number[]} x
 * @param {number[]} y
 * @returns {Object}
 */
export function linearRegression(x, y) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Residuals and SE
  const residuals = y.map((yi, i) => yi - intercept - slope * x[i]);
  const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
  const ssx = sumX2 - sumX * sumX / n;

  const slope_se = Math.sqrt(mse / ssx);
  const intercept_se = Math.sqrt(mse * (1 / n + Math.pow(sumX / n, 2) / ssx));

  return {
    slope,
    intercept,
    slope_se,
    intercept_se,
    mse,
    r2: 1 - residuals.reduce((sum, r) => sum + r * r, 0) /
      y.reduce((sum, yi) => sum + Math.pow(yi - sumY / n, 2), 0)
  };
}

/**
 * Weighted linear regression
 * @param {number[]} x
 * @param {number[]} y
 * @param {number[]} w - Weights
 * @returns {Object}
 */
export function weightedRegression(x, y, w) {
  const n = x.length;
  const sumW = w.reduce((a, b) => a + b, 0);
  const sumWX = w.reduce((sum, wi, i) => sum + wi * x[i], 0);
  const sumWY = w.reduce((sum, wi, i) => sum + wi * y[i], 0);
  const sumWXY = w.reduce((sum, wi, i) => sum + wi * x[i] * y[i], 0);
  const sumWX2 = w.reduce((sum, wi, i) => sum + wi * x[i] * x[i], 0);

  const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWX2 - sumWX * sumWX);
  const intercept = (sumWY - slope * sumWX) / sumW;

  // Weighted residuals
  const residuals = y.map((yi, i) => yi - intercept - slope * x[i]);
  const mse = w.reduce((sum, wi, i) => sum + wi * residuals[i] * residuals[i], 0) / (n - 2);
  const sswx = sumWX2 - sumWX * sumWX / sumW;

  return {
    slope,
    intercept,
    slope_se: Math.sqrt(mse / sswx),
    intercept_se: Math.sqrt(mse * (1 / sumW + Math.pow(sumWX / sumW, 2) / sswx)),
    mse
  };
}

export default {
  normalCDF,
  normalPDF,
  normalQuantile,
  chiSquareCDF,
  chiSquareQuantile,
  chiSquarePDF,
  gamma,
  logGamma,
  tCDF,
  tPDF,
  tQuantile,
  betaInc,
  pToZ,
  zToP,
  linearRegression,
  weightedRegression
};
