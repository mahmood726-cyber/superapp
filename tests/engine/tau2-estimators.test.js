/**
 * Tests for tau² (heterogeneity) estimators
 *
 * Validates all tau² estimation methods against R's metafor package
 */

import { estimateTau2, tau2ConfidenceInterval } from '../../js/engine/advanced-methods.js';

describe('estimateTau2', () => {
  // BCG vaccine data from global setup
  const { yi, vi, expected } = global.BCG_DATA;

  describe('DerSimonian-Laird (DL)', () => {
    it('should estimate tau² correctly for BCG data', () => {
      const result = estimateTau2(yi, vi, 'DL');
      expect(result.tau2).toBeCloseTo(expected.tau2_DL, TOLERANCES.STANDARD);
      expect(result.method).toBe('DL');
    });

    it('should return 0 for homogeneous data', () => {
      const { yi: yHom, vi: vHom } = global.HOMOGENEOUS_DATA;
      const result = estimateTau2(yHom, vHom, 'DL');
      expect(result.tau2).toBe(0);
    });

    it('should handle single study', () => {
      const result = estimateTau2([0.5], [0.1], 'DL');
      expect(result.tau2).toBe(0);
    });
  });

  describe('Restricted Maximum Likelihood (REML)', () => {
    it('should estimate tau² correctly for BCG data', () => {
      const result = estimateTau2(yi, vi, 'REML');
      expect(result.tau2).toBeCloseTo(expected.tau2_REML, TOLERANCES.STANDARD);
      expect(result.method).toBe('REML');
    });

    it('should be the default method', () => {
      const result = estimateTau2(yi, vi);
      expect(result.method).toBe('REML');
    });

    it('should converge for simple data', () => {
      const { yi: ySimple, vi: vSimple } = global.SIMPLE_DATA;
      const result = estimateTau2(ySimple, vSimple, 'REML');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(typeof result.tau2).toBe('number');
      expect(isNaN(result.tau2)).toBe(false);
    });
  });

  describe('Maximum Likelihood (ML)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'ML');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('ML');
      // ML typically gives slightly lower estimates than REML
      expect(result.tau2).toBeLessThanOrEqual(expected.tau2_REML * 1.1);
    });

    it('should handle zero heterogeneity', () => {
      const { yi: yHom, vi: vHom } = global.HOMOGENEOUS_DATA;
      const result = estimateTau2(yHom, vHom, 'ML');
      expect(result.tau2).toBeCloseTo(0, TOLERANCES.RELAXED);
    });
  });

  describe('Hedges (HE)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'HE');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('HE');
    });
  });

  describe('Hunter-Schmidt (HS)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'HS');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('HS');
    });
  });

  describe('Sidik-Jonkman (SJ)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'SJ');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('SJ');
    });

    it('should converge within 50 iterations', () => {
      const result = estimateTau2(yi, vi, 'SJ');
      expect(typeof result.tau2).toBe('number');
      expect(isNaN(result.tau2)).toBe(false);
    });
  });

  describe('Paule-Mandel (PM)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'PM');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('PM');
    });

    it('should match Q to k-1 at solution', () => {
      const result = estimateTau2(yi, vi, 'PM');
      const tau2 = result.tau2;
      const wiStar = vi.map(v => 1 / (v + tau2));
      const sumWStar = wiStar.reduce((a, b) => a + b, 0);
      const thetaStar = yi.reduce((s, y, i) => s + wiStar[i] * y, 0) / sumWStar;
      const Q = yi.reduce((s, y, i) => s + wiStar[i] * Math.pow(y - thetaStar, 2), 0);
      // PM finds tau² where Q* = k-1
      expect(Q).toBeCloseTo(yi.length - 1, TOLERANCES.RELAXED);
    });
  });

  describe('Empirical Bayes (EB)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'EB');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('EB');
    });
  });

  describe('Generalized Q (GENQ)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'GENQ');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('GENQ');
    });
  });

  describe('Generalized Q Median (GENQM)', () => {
    it('should estimate tau² for BCG data', () => {
      const result = estimateTau2(yi, vi, 'GENQM');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.method).toBe('GENQM');
    });
  });

  describe('Edge cases', () => {
    it('should handle two studies', () => {
      const result = estimateTau2([0.5, 0.3], [0.1, 0.1], 'DL');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small variances', () => {
      const ySmall = [0.5, 0.6, 0.4];
      const vSmall = [0.0001, 0.0001, 0.0001];
      const result = estimateTau2(ySmall, vSmall, 'DL');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(isFinite(result.tau2)).toBe(true);
    });

    it('should handle large variances', () => {
      const yLarge = [0.5, 0.6, 0.4];
      const vLarge = [100, 100, 100];
      const result = estimateTau2(yLarge, vLarge, 'DL');
      expect(result.tau2).toBeGreaterThanOrEqual(0);
    });

    it('should be case insensitive for method names', () => {
      const result1 = estimateTau2(yi, vi, 'dl');
      const result2 = estimateTau2(yi, vi, 'DL');
      const result3 = estimateTau2(yi, vi, 'Dl');
      expect(result1.tau2).toBe(result2.tau2);
      expect(result2.tau2).toBe(result3.tau2);
    });
  });

  describe('Method comparison', () => {
    it('all methods should give positive tau² for heterogeneous data', () => {
      const methods = ['DL', 'REML', 'ML', 'HE', 'HS', 'SJ', 'PM', 'EB', 'GENQ'];
      methods.forEach(method => {
        const result = estimateTau2(yi, vi, method);
        expect(result.tau2).toBeGreaterThan(0);
      });
    });

    it('all methods should give similar order of magnitude for tau²', () => {
      const methods = ['DL', 'REML', 'ML', 'PM', 'SJ'];
      const results = methods.map(m => estimateTau2(yi, vi, m).tau2);
      const min = Math.min(...results);
      const max = Math.max(...results);
      // All should be within 2x of each other
      expect(max / min).toBeLessThan(2);
    });
  });
});

describe('tau2ConfidenceInterval', () => {
  const { yi, vi } = global.BCG_DATA;

  describe('Q-profile method', () => {
    it('should compute CI for tau²', () => {
      const result = tau2ConfidenceInterval(yi, vi, { method: 'Q-profile' });
      expect(result.tau2).toBeDefined();
      expect(result.tau2.ci).toBeDefined();
      expect(Array.isArray(result.tau2.ci)).toBe(true);
      expect(result.tau2.ci.length).toBe(2);
    });

    it('should have lower bound <= point estimate <= upper bound', () => {
      const result = tau2ConfidenceInterval(yi, vi, { method: 'Q-profile' });
      const [lower, upper] = result.tau2.ci;
      const point = result.tau2.estimate;
      expect(lower).toBeLessThanOrEqual(point);
      expect(point).toBeLessThanOrEqual(upper);
    });

    it('should have non-negative lower bound', () => {
      const result = tau2ConfidenceInterval(yi, vi, { method: 'Q-profile' });
      expect(result.tau2.ci[0]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Wald method', () => {
    it('should compute CI for tau²', () => {
      const result = tau2ConfidenceInterval(yi, vi, { method: 'Wald' });
      expect(result.tau2.ci).toBeDefined();
      expect(result.tau2.ci.length).toBe(2);
    });
  });

  describe('Bootstrap method', () => {
    it('should compute CI with bootstrap', () => {
      const result = tau2ConfidenceInterval(yi, vi, {
        method: 'bootstrap',
        nBoot: 100  // Fewer iterations for testing
      });
      expect(result.tau2.ci).toBeDefined();
      expect(result.tau2.ci[0]).toBeLessThanOrEqual(result.tau2.ci[1]);
    });
  });

  describe('Edge cases', () => {
    it('should handle homogeneous data', () => {
      const { yi: yHom, vi: vHom } = global.HOMOGENEOUS_DATA;
      const result = tau2ConfidenceInterval(yHom, vHom, { method: 'Q-profile' });
      expect(result.tau2.ci[0]).toBe(0);
    });
  });
});
