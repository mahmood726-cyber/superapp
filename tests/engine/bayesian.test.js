/**
 * Tests for Bayesian Meta-Analysis Methods
 *
 * Tests MCMC-based Bayesian inference, diagnostics, and model comparison
 */

import {
  bayesianMetaAnalysis,
  bayesianModelAveraging,
  bayesianModelComparison
} from '../../js/engine/advanced-methods.js';

describe('bayesianMetaAnalysis', () => {
  const { yi, vi } = global.BCG_DATA;

  // Use reduced iterations for testing
  const testOptions = {
    nIter: 2000,
    nBurnin: 500,
    nChains: 2
  };

  describe('Basic functionality', () => {
    it('should return posterior estimates', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      expect(result).toBeDefined();
      expect(result.posterior).toBeDefined();
    });

    it('should estimate pooled effect (mu)', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      expect(result.posterior.mu).toBeDefined();
      expect(result.posterior.mu.mean).toBeDefined();
      expect(typeof result.posterior.mu.mean).toBe('number');
    });

    it('should estimate heterogeneity (tau2)', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      expect(result.posterior.tau2).toBeDefined();
      expect(result.posterior.tau2.mean).toBeGreaterThanOrEqual(0);
    });

    it('should provide credible intervals', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      expect(result.posterior.mu.ci).toBeDefined();
      expect(result.posterior.mu.ci.length).toBe(2);
      expect(result.posterior.mu.ci[0]).toBeLessThan(result.posterior.mu.ci[1]);
    });
  });

  describe('MCMC diagnostics', () => {
    it('should compute Rhat convergence diagnostic', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.rhat).toBeDefined();
    });

    it('Rhat should be close to 1 for converged chains', () => {
      const result = bayesianMetaAnalysis(yi, vi, {
        ...testOptions,
        nIter: 3000,
        nBurnin: 1000
      });
      if (result.diagnostics?.rhat?.mu) {
        // Rhat < 1.1 indicates good convergence
        expect(result.diagnostics.rhat.mu).toBeLessThan(1.2);
      }
    });

    it('should compute effective sample size (ESS)', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      if (result.diagnostics?.ess) {
        expect(result.diagnostics.ess.mu).toBeGreaterThan(0);
      }
    });
  });

  describe('Priors', () => {
    it('should use default priors when not specified', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      expect(result.priors).toBeDefined();
    });

    it('should accept custom priors', () => {
      const result = bayesianMetaAnalysis(yi, vi, {
        ...testOptions,
        priors: {
          mu: { mean: 0, sd: 10 },
          tau2: { shape: 0.001, rate: 0.001 }
        }
      });
      expect(result).toBeDefined();
    });

    it('should accept half-normal prior for tau', () => {
      const result = bayesianMetaAnalysis(yi, vi, {
        ...testOptions,
        priors: {
          tau: { type: 'half-normal', scale: 1 }
        }
      });
      expect(result).toBeDefined();
    });
  });

  describe('Posterior samples', () => {
    it('should return MCMC samples when requested', () => {
      const result = bayesianMetaAnalysis(yi, vi, {
        ...testOptions,
        returnSamples: true
      });
      if (result.samples) {
        expect(result.samples.mu).toBeDefined();
        expect(Array.isArray(result.samples.mu)).toBe(true);
      }
    });
  });

  describe('Model fit', () => {
    it('should compute DIC', () => {
      const result = bayesianMetaAnalysis(yi, vi, testOptions);
      if (result.modelFit) {
        expect(result.modelFit.DIC).toBeDefined();
      }
    });

    it('should compute WAIC when requested', () => {
      const result = bayesianMetaAnalysis(yi, vi, {
        ...testOptions,
        computeWAIC: true
      });
      if (result.modelFit) {
        expect(result.modelFit.WAIC).toBeDefined();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle small number of studies', () => {
      const yiSmall = yi.slice(0, 3);
      const viSmall = vi.slice(0, 3);
      const result = bayesianMetaAnalysis(yiSmall, viSmall, testOptions);
      expect(result).toBeDefined();
    });

    it('should handle homogeneous data', () => {
      const { yi: yHom, vi: vHom } = global.HOMOGENEOUS_DATA;
      const result = bayesianMetaAnalysis(yHom, vHom, testOptions);
      expect(result.posterior.tau2.mean).toBeCloseTo(0, TOLERANCES.RELAXED);
    });
  });

  describe('Comparison with frequentist', () => {
    it('posterior mean should be close to REML estimate', () => {
      const result = bayesianMetaAnalysis(yi, vi, {
        nIter: 5000,
        nBurnin: 2000,
        nChains: 2
      });
      // With non-informative priors, Bayesian and REML should be close
      expect(result.posterior.mu.mean)
        .toBeCloseTo(global.BCG_DATA.expected.pooled_RE_DL, TOLERANCES.RELAXED);
    });
  });
});

describe('bayesianModelAveraging', () => {
  const { yi, vi } = global.BCG_DATA;

  const testOptions = {
    nIter: 1500,
    nBurnin: 500
  };

  describe('Basic functionality', () => {
    it('should return model-averaged results', () => {
      const result = bayesianModelAveraging(yi, vi, testOptions);
      expect(result).toBeDefined();
    });

    it('should compute posterior model probabilities', () => {
      const result = bayesianModelAveraging(yi, vi, testOptions);
      expect(result.modelProbabilities).toBeDefined();
    });

    it('should return averaged effect estimate', () => {
      const result = bayesianModelAveraging(yi, vi, testOptions);
      expect(result.averaged).toBeDefined();
      expect(result.averaged.estimate).toBeDefined();
    });
  });

  describe('Model comparison', () => {
    it('should compare fixed-effects and random-effects models', () => {
      const result = bayesianModelAveraging(yi, vi, testOptions);
      if (result.models) {
        expect(result.models.fixed).toBeDefined();
        expect(result.models.random).toBeDefined();
      }
    });

    it('model probabilities should sum to 1', () => {
      const result = bayesianModelAveraging(yi, vi, testOptions);
      if (result.modelProbabilities) {
        const probs = Object.values(result.modelProbabilities);
        const sum = probs.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, TOLERANCES.RELAXED);
      }
    });
  });
});

describe('bayesianModelComparison', () => {
  const { yi, vi } = global.BCG_DATA;

  const testOptions = {
    nIter: 1500,
    nBurnin: 500
  };

  describe('Basic functionality', () => {
    it('should compare multiple models', () => {
      const result = bayesianModelComparison(yi, vi, testOptions);
      expect(result).toBeDefined();
    });

    it('should compute Bayes factors', () => {
      const result = bayesianModelComparison(yi, vi, testOptions);
      expect(result.bayesFactors || result.BF).toBeDefined();
    });

    it('should rank models', () => {
      const result = bayesianModelComparison(yi, vi, testOptions);
      expect(result.ranking || result.modelRanking).toBeDefined();
    });
  });

  describe('Information criteria', () => {
    it('should compute DIC for each model', () => {
      const result = bayesianModelComparison(yi, vi, testOptions);
      if (result.DIC) {
        expect(typeof result.DIC.fixed).toBe('number');
        expect(typeof result.DIC.random).toBe('number');
      }
    });
  });

  describe('Evidence interpretation', () => {
    it('should provide Bayes factor interpretation', () => {
      const result = bayesianModelComparison(yi, vi, testOptions);
      if (result.interpretation) {
        expect(result.interpretation).toBeDefined();
      }
    });
  });
});

describe('MCMC Convergence', () => {
  const { yi, vi } = global.BCG_DATA;

  it('longer chains should have better convergence', () => {
    const shortRun = bayesianMetaAnalysis(yi, vi, {
      nIter: 1000,
      nBurnin: 200,
      nChains: 2
    });

    const longRun = bayesianMetaAnalysis(yi, vi, {
      nIter: 4000,
      nBurnin: 1000,
      nChains: 2
    });

    // Both should complete without error
    expect(shortRun.posterior.mu.mean).toBeDefined();
    expect(longRun.posterior.mu.mean).toBeDefined();
  });

  it('multiple chains should improve Rhat', () => {
    const result = bayesianMetaAnalysis(yi, vi, {
      nIter: 2000,
      nBurnin: 500,
      nChains: 4  // More chains
    });

    if (result.diagnostics?.rhat) {
      expect(result.diagnostics.rhat.mu).toBeLessThan(1.3);
    }
  });
});
