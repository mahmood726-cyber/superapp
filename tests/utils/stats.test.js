/**
 * Tests for js/utils/stats.js distribution helpers.
 *
 * This suite exists partly as a regression guard for the tCDF/tQuantile
 * sign bug (finding F1): tCDF ignored the sign of t because x = df/(df+t^2)
 * depends only on t^2, so tCDF(-2,10) wrongly returned the upper-tail value
 * (~0.9633) instead of ~0.0367, and tQuantile(0.025,10) diverged to -Infinity.
 * Reference values are from R: pt(-2,10), qt(0.025,10), etc.
 */

import {
  normalCDF,
  normalQuantile,
  chiSquareCDF,
  chiSquareQuantile,
  tCDF,
  tQuantile,
  tPDF
} from '../../js/utils/stats.js';

describe('normalCDF / normalQuantile', () => {
  it('normalCDF(0) = 0.5', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 1e-6);
  });
  it('normalCDF(1.96) ~= 0.975', () => {
    expect(normalCDF(1.96)).toBeCloseTo(0.9750021, 1e-4);
  });
  it('normalCDF is symmetric: normalCDF(-x) = 1 - normalCDF(x)', () => {
    expect(normalCDF(-1.5)).toBeCloseTo(1 - normalCDF(1.5), 1e-6);
  });
  it('normalQuantile(0.975) ~= 1.959964', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 1e-4);
  });
  it('normalQuantile(0.025) ~= -1.959964', () => {
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959964, 1e-4);
  });
});

describe('tCDF (Student t CDF) — F1 sign regression', () => {
  it('tCDF(0, df) = 0.5 (median)', () => {
    expect(tCDF(0, 10)).toBeCloseTo(0.5, 1e-6);
  });

  it('tCDF(2, 10) ~= 0.9633 (upper tail, positive t)', () => {
    expect(tCDF(2, 10)).toBeCloseTo(0.9633060, 1e-5);
  });

  // The core F1 regression: negative t must NOT return the upper-tail value.
  it('tCDF(-2, 10) ~= 0.0367 (lower tail, negative t)', () => {
    expect(tCDF(-2, 10)).toBeCloseTo(0.0366940, 1e-5);
  });

  it('is antisymmetric: tCDF(-t, df) = 1 - tCDF(t, df)', () => {
    expect(tCDF(-2, 10)).toBeCloseTo(1 - tCDF(2, 10), 1e-9);
    expect(tCDF(-1.3, 7)).toBeCloseTo(1 - tCDF(1.3, 7), 1e-9);
  });

  it('matches R pt() at a few points', () => {
    // pt(1, 5) = 0.8183913, pt(-0.5, 20) = 0.3112538
    // (module uses an approximate incomplete-beta, so ~1e-4 accuracy)
    expect(tCDF(1, 5)).toBeCloseTo(0.8183913, 1e-4);
    expect(tCDF(-0.5, 20)).toBeCloseTo(0.3112538, 1e-4);
  });
});

describe('tQuantile (Student t inverse CDF) — F1 regression', () => {
  it('tQuantile(0.5, df) = 0', () => {
    expect(tQuantile(0.5, 10)).toBe(0);
  });

  it('tQuantile(0.975, 10) ~= 2.228139 (matches R qt)', () => {
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228139, 1e-4);
  });

  // Before the F1 fix this returned -Infinity because Newton iterated on
  // the broken tCDF starting from a negative normal quantile.
  it('tQuantile(0.025, 10) ~= -2.228139 (finite, matches R qt)', () => {
    const q = tQuantile(0.025, 10);
    expect(Number.isFinite(q)).toBe(true);
    expect(q).toBeCloseTo(-2.228139, 1e-4);
  });

  it('is symmetric: tQuantile(p) = -tQuantile(1-p)', () => {
    expect(tQuantile(0.05, 15)).toBeCloseTo(-tQuantile(0.95, 15), 1e-4);
  });

  it('round-trips with tCDF', () => {
    const q = tQuantile(0.1, 8);
    expect(tCDF(q, 8)).toBeCloseTo(0.1, 1e-4);
  });
});

describe('tPDF', () => {
  it('is symmetric and positive', () => {
    expect(tPDF(-1.5, 9)).toBeCloseTo(tPDF(1.5, 9), 1e-9);
    expect(tPDF(0, 9)).toBeGreaterThan(0);
  });
});

describe('chiSquareCDF / chiSquareQuantile', () => {
  it('chiSquareCDF(0, df) = 0', () => {
    expect(chiSquareCDF(0, 5)).toBe(0);
  });
  it('chiSquareCDF(3.84, 1) ~= 0.95 (matches R pchisq)', () => {
    expect(chiSquareCDF(3.841459, 1)).toBeCloseTo(0.95, 1e-3);
  });
  it('chiSquareQuantile(0.95, 1) ~= 3.841459 (matches R qchisq)', () => {
    expect(chiSquareQuantile(0.95, 1)).toBeCloseTo(3.841459, 1e-2);
  });
  it('chiSquareQuantile round-trips with chiSquareCDF', () => {
    const q = chiSquareQuantile(0.9, 10);
    expect(chiSquareCDF(q, 10)).toBeCloseTo(0.9, 1e-3);
  });
});
