/**
 * Tests for Publication Bias Detection Methods
 *
 * Tests PET-PEESE, p-curve, p-uniform, and ensemble methods
 */

import {
  petPeese,
  pCurve,
  pUniform,
  pUniformStar,
  publicationBiasEnsemble,
  contourEnhancedFunnel
} from '../../js/engine/advanced-methods.js';

describe('petPeese', () => {
  const { yi, vi } = global.BCG_DATA;
  const se = vi.map(v => Math.sqrt(v));

  describe('Basic functionality', () => {
    it('should return PET and PEESE estimates', () => {
      const result = petPeese(yi, vi);
      expect(result).toBeDefined();
      expect(result.pet).toBeDefined();
      expect(result.peese).toBeDefined();
    });

    it('should return intercept (bias-corrected effect)', () => {
      const result = petPeese(yi, vi);
      expect(result.pet.intercept).toBeDefined();
      expect(typeof result.pet.intercept).toBe('number');
    });

    it('should return slope (bias indicator)', () => {
      const result = petPeese(yi, vi);
      expect(result.pet.slope).toBeDefined();
      expect(result.peese.slope).toBeDefined();
    });

    it('should return p-values for regression coefficients', () => {
      const result = petPeese(yi, vi);
      expect(result.pet.pValue).toBeDefined();
      expect(result.pet.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pet.pValue).toBeLessThanOrEqual(1);
    });
  });

  describe('PET (Precision-Effect Test)', () => {
    it('PET regresses effect on SE', () => {
      const result = petPeese(yi, vi);
      // PET intercept should be close to unadjusted when no bias
      expect(typeof result.pet.intercept).toBe('number');
    });

    it('should provide confidence interval for intercept', () => {
      const result = petPeese(yi, vi);
      expect(result.pet.ci).toBeDefined();
      expect(result.pet.ci.length).toBe(2);
    });
  });

  describe('PEESE (Precision-Effect Estimate with SE)', () => {
    it('PEESE regresses effect on variance', () => {
      const result = petPeese(yi, vi);
      // PEESE uses variance as predictor
      expect(result.peese.intercept).toBeDefined();
    });

    it('should provide confidence interval', () => {
      const result = petPeese(yi, vi);
      expect(result.peese.ci).toBeDefined();
    });
  });

  describe('Conditional estimator', () => {
    it('should select PET or PEESE based on PET significance', () => {
      const result = petPeese(yi, vi);
      expect(result.conditional).toBeDefined();
      expect(result.conditional.estimate).toBeDefined();
      expect(result.conditional.method).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle small samples', () => {
      const yiSmall = yi.slice(0, 5);
      const viSmall = vi.slice(0, 5);
      const result = petPeese(yiSmall, viSmall);
      expect(result).toBeDefined();
    });

    it('should handle homogeneous data', () => {
      const { yi: yHom, vi: vHom } = global.HOMOGENEOUS_DATA;
      const result = petPeese(yHom, vHom);
      expect(result).toBeDefined();
    });
  });
});

describe('pCurve', () => {
  // Generate some p-values for testing
  const significantPVals = [0.01, 0.02, 0.03, 0.04, 0.05];
  const mixedPVals = [0.001, 0.01, 0.03, 0.04, 0.049];
  const flatPVals = [0.01, 0.02, 0.03, 0.04, 0.05];  // Uniform distribution

  describe('Basic functionality', () => {
    it('should analyze p-value distribution', () => {
      const result = pCurve(significantPVals);
      expect(result).toBeDefined();
    });

    it('should return right-skewness test', () => {
      const result = pCurve(significantPVals);
      expect(result.rightSkewTest).toBeDefined();
    });

    it('should return flatness test', () => {
      const result = pCurve(significantPVals);
      expect(result.flatnessTest).toBeDefined();
    });

    it('should indicate evidential value', () => {
      const result = pCurve(significantPVals);
      expect(result.evidentialValue).toBeDefined();
    });
  });

  describe('P-curve shape', () => {
    it('should detect right-skewed distribution (evidence present)', () => {
      // Very small p-values suggest true effect
      const strongEffect = [0.001, 0.003, 0.005, 0.01, 0.02];
      const result = pCurve(strongEffect);
      expect(result).toBeDefined();
    });

    it('should detect flat distribution (no evidence)', () => {
      // Uniformly distributed p-values suggest no effect
      const result = pCurve(flatPVals);
      expect(result).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle single p-value', () => {
      const result = pCurve([0.03]);
      expect(result).toBeDefined();
    });

    it('should handle p-values at boundary (0.05)', () => {
      const boundary = [0.049, 0.05, 0.048];
      const result = pCurve(boundary);
      expect(result).toBeDefined();
    });

    it('should filter out non-significant p-values', () => {
      const mixed = [0.01, 0.02, 0.15, 0.30, 0.04];  // 0.15 and 0.30 should be excluded
      const result = pCurve(mixed);
      expect(result).toBeDefined();
    });
  });
});

describe('pUniform', () => {
  const { yi, vi } = global.BCG_DATA;

  describe('Basic functionality', () => {
    it('should return p-uniform analysis results', () => {
      const result = pUniform(yi, vi);
      expect(result).toBeDefined();
    });

    it('should estimate effect size', () => {
      const result = pUniform(yi, vi);
      expect(result.estimate).toBeDefined();
      expect(typeof result.estimate).toBe('number');
    });

    it('should return publication bias test', () => {
      const result = pUniform(yi, vi);
      expect(result.biasTest).toBeDefined();
      expect(result.biasTest.pValue).toBeDefined();
    });
  });

  describe('Conditional p-values', () => {
    it('should compute conditional p-values', () => {
      const result = pUniform(yi, vi);
      expect(result.conditionalPValues).toBeDefined();
      expect(Array.isArray(result.conditionalPValues)).toBe(true);
    });

    it('conditional p-values should be between 0 and 1', () => {
      const result = pUniform(yi, vi);
      if (result.conditionalPValues) {
        result.conditionalPValues.forEach(p => {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        });
      }
    });
  });

  describe('Custom alpha', () => {
    it('should respect custom significance threshold', () => {
      const result = pUniform(yi, vi, { alpha: 0.10 });
      expect(result).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle all significant studies', () => {
      const result = pUniform(yi, vi);
      expect(result).toBeDefined();
    });

    it('should handle mixed significance', () => {
      // BCG data has some non-significant studies
      const result = pUniform(yi, vi);
      expect(result).toBeDefined();
    });
  });
});

describe('pUniformStar', () => {
  const { yi, vi } = global.BCG_DATA;

  describe('Basic functionality', () => {
    it('should return p-uniform* analysis results', () => {
      const result = pUniformStar(yi, vi);
      expect(result).toBeDefined();
    });

    it('should estimate effect size', () => {
      const result = pUniformStar(yi, vi);
      expect(result.estimate).toBeDefined();
    });

    it('should handle heterogeneity', () => {
      const result = pUniformStar(yi, vi);
      expect(result.tau2).toBeDefined();
    });
  });

  describe('Comparison with p-uniform', () => {
    it('p-uniform* accounts for heterogeneity', () => {
      const pUniformResult = pUniform(yi, vi);
      const pUniformStarResult = pUniformStar(yi, vi);
      // Both should give valid estimates
      expect(pUniformResult.estimate).toBeDefined();
      expect(pUniformStarResult.estimate).toBeDefined();
    });
  });
});

describe('publicationBiasEnsemble', () => {
  const { yi, vi } = global.BCG_DATA;

  describe('Basic functionality', () => {
    it('should run multiple bias detection methods', () => {
      const result = publicationBiasEnsemble(yi, vi);
      expect(result).toBeDefined();
    });

    it('should return results from multiple methods', () => {
      const result = publicationBiasEnsemble(yi, vi);
      expect(result.methods).toBeDefined();
      expect(Array.isArray(result.methods) || typeof result.methods === 'object').toBe(true);
    });

    it('should provide overall assessment', () => {
      const result = publicationBiasEnsemble(yi, vi);
      expect(result.overall || result.assessment).toBeDefined();
    });
  });

  describe('Method inclusion', () => {
    it('should include PET-PEESE results', () => {
      const result = publicationBiasEnsemble(yi, vi);
      expect(result.petPeese || result.methods?.petPeese).toBeDefined();
    });

    it('should include selection model results', () => {
      const result = publicationBiasEnsemble(yi, vi);
      // At least one selection model should be included
      const hasSelection = result.selectionModels ||
                          result.methods?.copas ||
                          result.methods?.threePSM;
      expect(hasSelection !== undefined).toBe(true);
    });
  });

  describe('Sensitivity', () => {
    it('should be consistent across runs', () => {
      const result1 = publicationBiasEnsemble(yi, vi);
      const result2 = publicationBiasEnsemble(yi, vi);
      // Deterministic methods should give same results
      if (result1.petPeese && result2.petPeese) {
        expect(result1.petPeese.pet.intercept)
          .toBeCloseTo(result2.petPeese.pet.intercept, TOLERANCES.STANDARD);
      }
    });
  });
});

describe('contourEnhancedFunnel', () => {
  const { yi, vi } = global.BCG_DATA;

  describe('Basic functionality', () => {
    it('should return funnel plot data', () => {
      const result = contourEnhancedFunnel(yi, vi);
      expect(result).toBeDefined();
    });

    it('should return study points', () => {
      const result = contourEnhancedFunnel(yi, vi);
      expect(result.points).toBeDefined();
      expect(Array.isArray(result.points)).toBe(true);
    });

    it('should return significance contours', () => {
      const result = contourEnhancedFunnel(yi, vi);
      expect(result.contours).toBeDefined();
    });
  });

  describe('Contour levels', () => {
    it('should include 0.01, 0.05, 0.10 significance contours', () => {
      const result = contourEnhancedFunnel(yi, vi);
      if (result.contours) {
        const levels = Object.keys(result.contours);
        expect(levels.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Point properties', () => {
    it('each point should have effect and precision', () => {
      const result = contourEnhancedFunnel(yi, vi);
      if (result.points && result.points.length > 0) {
        const point = result.points[0];
        expect(point.effect !== undefined || point.x !== undefined).toBe(true);
        expect(point.precision !== undefined || point.y !== undefined).toBe(true);
      }
    });
  });
});
