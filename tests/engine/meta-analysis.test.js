/**
 * Direct unit tests for js/engine/meta-analysis.js effect-size functions.
 *
 * These production functions are imported by js/pages/analysis.js but had
 * zero direct test coverage (finding F2). Reference values are hand-derived
 * from the closed-form definitions and cross-checked against R metafor
 * escalc() conventions.
 */

import {
  calculateLogRR,
  calculateLogOR,
  calculateRD,
  calculateSMD,
  calculateMD,
  fixedEffects,
  randomEffectsDL,
  predictionInterval
} from '../../js/engine/meta-analysis.js';

describe('calculateLogRR', () => {
  it('computes logRR and SE for a clean 2x2 table', () => {
    // e1=10/100, e2=5/100 -> RR=2, logRR=ln(2)=0.6931472
    const r = calculateLogRR(10, 100, 5, 100);
    expect(r.yi).toBeCloseTo(Math.log(2), 1e-6);
    // se = sqrt((1/10 - 1/100) + (1/5 - 1/100)) = sqrt(0.28)
    expect(r.se).toBeCloseTo(Math.sqrt(0.28), 1e-6);
    expect(r.correctionApplied).toBe(false);
  });

  it('applies a 0.5 continuity correction when a cell is zero', () => {
    const r = calculateLogRR(0, 100, 5, 100);
    expect(r.correctionApplied).toBe(true);
    expect(Number.isFinite(r.yi)).toBe(true);
    expect(Number.isFinite(r.se)).toBe(true);
    // With a=0.5: p1 = 0.5/101, still finite and negative logRR
    expect(r.yi).toBeLessThan(0);
  });

  it('keeps a zero-event control finite via continuity correction (no NaN)', () => {
    // e2=0 triggers the 0.5 correction, so p2 becomes non-zero and the
    // result stays finite rather than dividing by zero.
    const r = calculateLogRR(10, 100, 0, 50);
    expect(r.correctionApplied).toBe(true);
    expect(Number.isFinite(r.yi)).toBe(true);
    expect(Number.isFinite(r.se)).toBe(true);
  });
});

describe('calculateLogOR', () => {
  it('computes logOR and SE for a clean 2x2 table', () => {
    // OR = (10*95)/(90*5) = 2.111111
    const r = calculateLogOR(10, 100, 5, 100);
    expect(r.yi).toBeCloseTo(Math.log((10 * 95) / (90 * 5)), 1e-6);
    // se = sqrt(1/10 + 1/90 + 1/5 + 1/95)
    expect(r.se).toBeCloseTo(Math.sqrt(1 / 10 + 1 / 90 + 1 / 5 + 1 / 95), 1e-6);
    expect(r.correctionApplied).toBe(false);
  });

  it('applies continuity correction for a zero-event arm', () => {
    const r = calculateLogOR(0, 50, 8, 50);
    expect(r.correctionApplied).toBe(true);
    expect(Number.isFinite(r.yi)).toBe(true);
    expect(Number.isFinite(r.se)).toBe(true);
  });
});

describe('calculateRD', () => {
  it('computes risk difference and SE', () => {
    const r = calculateRD(10, 100, 5, 100);
    expect(r.yi).toBeCloseTo(0.05, 1e-9);
    // se = sqrt(0.1*0.9/100 + 0.05*0.95/100)
    expect(r.se).toBeCloseTo(Math.sqrt(0.1 * 0.9 / 100 + 0.05 * 0.95 / 100), 1e-9);
  });
});

describe('calculateSMD (Hedges g)', () => {
  it('computes a small-sample-corrected g with the correct sign', () => {
    // m1=10 sd1=2 n1=20, m2=8 sd2=2 n2=20 -> cohen d = (10-8)/2 = 1
    const r = calculateSMD(10, 2, 20, 8, 2, 20);
    expect(r.cohenD).toBeCloseTo(1, 1e-9);
    // Hedges correction J ~= 1 - 3/(4*38-1) ~= 0.98013 -> g slightly < d
    expect(r.yi).toBeLessThan(r.cohenD);
    expect(r.yi).toBeCloseTo(1 * (1 - 3 / (4 * 38 - 1)), 1e-9);
    expect(r.se).toBeGreaterThan(0);
  });

  it('returns a guarded zero result when pooled SD is zero', () => {
    const r = calculateSMD(5, 0, 10, 5, 0, 10);
    expect(r.error).toBeDefined();
    expect(r.yi).toBe(0);
  });
});

describe('calculateMD', () => {
  it('computes an unstandardized mean difference and SE', () => {
    const r = calculateMD(10, 2, 25, 8, 3, 25);
    expect(r.yi).toBeCloseTo(2, 1e-9);
    expect(r.se).toBeCloseTo(Math.sqrt(4 / 25 + 9 / 25), 1e-9);
  });
});

describe('pooling on a known dataset', () => {
  // Simple 5-study set with easy inverse-variance arithmetic.
  const yi = [0.5, 0.3, 0.7, 0.4, 0.6];
  const vi = [0.04, 0.05, 0.03, 0.06, 0.04];

  it('fixedEffects matches the inverse-variance weighted mean', () => {
    const w = vi.map((v) => 1 / v);
    const expected =
      yi.reduce((s, y, i) => s + w[i] * y, 0) / w.reduce((s, x) => s + x, 0);
    const r = fixedEffects(yi, vi);
    expect(r.estimate).toBeCloseTo(expected, 1e-6);
    expect(r.se).toBeCloseTo(Math.sqrt(1 / w.reduce((s, x) => s + x, 0)), 1e-6);
  });

  it('randomEffectsDL returns finite tau2 >= 0 and a valid CI ordering', () => {
    const r = randomEffectsDL(yi, vi);
    expect(r.tau2).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.estimate)).toBe(true);
    expect(r.ci[0]).toBeLessThan(r.ci[1]);
  });

  it('predictionInterval widens (or equals) the CI and is ordered', () => {
    const re = randomEffectsDL(yi, vi);
    const pi = predictionInterval(re);
    expect(pi.lower).toBeLessThanOrEqual(pi.upper);
    // PI must be at least as wide as the CI for k >= 3
    expect(pi.upper - pi.lower).toBeGreaterThanOrEqual(re.ci[1] - re.ci[0] - 1e-9);
  });

  it('fixedEffects handles k=1 without dividing by zero', () => {
    const r = fixedEffects([0.5], [0.04]);
    expect(r.estimate).toBeCloseTo(0.5, 1e-9);
    expect(r.se).toBeCloseTo(0.2, 1e-9);
  });
});
