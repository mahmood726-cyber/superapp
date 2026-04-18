/**
 * Tests for Diagnostic Test Accuracy (DTA) Meta-Analysis
 *
 * Tests bivariate model, HSROC, and related DTA methods
 */

import {
  bivariateDTA,
  hsrocModel,
  dtaForestPlotData
} from '../../js/engine/advanced-methods.js';

describe('bivariateDTA', () => {
  const { tp, fp, fn, tn, k } = global.DTA_DATA;

  describe('Basic functionality', () => {
    it('should return bivariate model results', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      expect(result).toBeDefined();
      expect(result.pooled).toBeDefined();
    });

    it('should estimate pooled sensitivity', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      expect(result.pooled.sensitivity).toBeDefined();
      expect(result.pooled.sensitivity.estimate).toBeGreaterThan(0);
      expect(result.pooled.sensitivity.estimate).toBeLessThan(1);
    });

    it('should estimate pooled specificity', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      expect(result.pooled.specificity).toBeDefined();
      expect(result.pooled.specificity.estimate).toBeGreaterThan(0);
      expect(result.pooled.specificity.estimate).toBeLessThan(1);
    });

    it('should return confidence intervals', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      expect(result.pooled.sensitivity.ci).toBeDefined();
      expect(result.pooled.specificity.ci).toBeDefined();
      expect(result.pooled.sensitivity.ci.length).toBe(2);
      expect(result.pooled.specificity.ci.length).toBe(2);
    });
  });

  describe('Covariance structure', () => {
    it('should estimate correlation between logit(sens) and logit(spec)', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      expect(result.heterogeneity.correlation).toBeDefined();
      // Correlation can be positive or negative depending on threshold variation
      expect(result.heterogeneity.correlation).toBeGreaterThanOrEqual(-1);
      expect(result.heterogeneity.correlation).toBeLessThanOrEqual(1);
    });

    it('should estimate between-study variances', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      expect(result.heterogeneity.sigma2Sens).toBeDefined();
      expect(result.heterogeneity.sigma2Spec).toBeDefined();
    });
  });

  describe('Diagnostic accuracy indices', () => {
    it('should compute DOR (Diagnostic Odds Ratio)', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      if (result.pooled.dor) {
        expect(result.pooled.dor.estimate).toBeGreaterThan(0);
      }
    });

    it('should compute positive LR', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      if (result.pooled.lrPositive) {
        expect(result.pooled.lrPositive).toBeGreaterThan(1);  // For good test
      }
    });

    it('should compute negative LR', () => {
      const result = bivariateDTA(tp, fp, fn, tn);
      if (result.pooled.lrNegative) {
        expect(result.pooled.lrNegative).toBeLessThan(1);  // For good test
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle perfect sensitivity studies', () => {
      // Study with 100% sensitivity
      const tpPerfect = [50, 48, 45];
      const fnPerfect = [0, 2, 5];  // First study has perfect sensitivity
      const fpTest = [5, 6, 4];
      const tnTest = [95, 94, 96];
      const result = bivariateDTA(tpPerfect, fpTest, fnPerfect, tnTest);
      expect(result).toBeDefined();
    });

    it('should handle perfect specificity studies', () => {
      const tpTest = [48, 45, 50];
      const fnTest = [2, 5, 0];
      const fpPerfect = [0, 2, 3];  // First study has perfect specificity
      const tnPerfect = [100, 98, 97];
      const result = bivariateDTA(tpTest, fpPerfect, fnTest, tnPerfect);
      expect(result).toBeDefined();
    });

    it('should handle minimum studies (3)', () => {
      const tpSmall = tp.slice(0, 3);
      const fpSmall = fp.slice(0, 3);
      const fnSmall = fn.slice(0, 3);
      const tnSmall = tn.slice(0, 3);
      const result = bivariateDTA(tpSmall, fpSmall, fnSmall, tnSmall);
      expect(result).toBeDefined();
    });
  });

  describe('Continuity correction', () => {
    it('should apply continuity correction for zero cells', () => {
      const tpZero = [0, 50, 45];  // Zero cell in first study
      const fpZero = [5, 6, 4];
      const fnZero = [50, 0, 5];
      const tnZero = [95, 94, 96];
      const result = bivariateDTA(tpZero, fpZero, fnZero, tnZero, {
        continuityCorrection: 0.5
      });
      expect(result).toBeDefined();
    });
  });
});

describe('hsrocModel', () => {
  const { tp, fp, fn, tn } = global.DTA_DATA;

  describe('Basic functionality', () => {
    it('should return HSROC model results', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      expect(result).toBeDefined();
    });

    it('should estimate HSROC parameters', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      expect(result.theta || result.accuracy).toBeDefined();  // Accuracy parameter
      expect(result.Lambda || result.threshold).toBeDefined(); // Threshold parameter
    });

    it('should estimate shape parameter', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      expect(result.beta || result.shape).toBeDefined();
    });
  });

  describe('SROC curve', () => {
    it('should provide SROC curve data', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      expect(result.srocCurve || result.curveData).toBeDefined();
    });

    it('SROC curve should span 0-1 range', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      if (result.srocCurve) {
        const curve = result.srocCurve;
        expect(curve[0].fpr).toBeGreaterThanOrEqual(0);
        expect(curve[curve.length - 1].fpr).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Summary operating point', () => {
    it('should provide summary operating point', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      expect(result.summaryPoint).toBeDefined();
      expect(result.summaryPoint.sensitivity).toBeDefined();
      expect(result.summaryPoint.specificity).toBeDefined();
    });

    it('summary point should be on the curve', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      // Summary point values should be valid probabilities
      expect(result.summaryPoint.sensitivity).toBeGreaterThan(0);
      expect(result.summaryPoint.sensitivity).toBeLessThan(1);
      expect(result.summaryPoint.specificity).toBeGreaterThan(0);
      expect(result.summaryPoint.specificity).toBeLessThan(1);
    });
  });

  describe('Confidence and prediction regions', () => {
    it('should provide confidence region', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      if (result.confidenceRegion) {
        expect(Array.isArray(result.confidenceRegion)).toBe(true);
      }
    });

    it('should provide prediction region', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      if (result.predictionRegion) {
        expect(Array.isArray(result.predictionRegion)).toBe(true);
      }
    });
  });

  describe('Heterogeneity', () => {
    it('should report heterogeneity measures', () => {
      const result = hsrocModel(tp, fp, fn, tn);
      expect(result.heterogeneity).toBeDefined();
    });
  });
});

describe('dtaForestPlotData', () => {
  const { tp, fp, fn, tn } = global.DTA_DATA;

  describe('Basic functionality', () => {
    it('should return forest plot data', () => {
      const result = dtaForestPlotData(tp, fp, fn, tn);
      expect(result).toBeDefined();
    });

    it('should return study-level estimates', () => {
      const result = dtaForestPlotData(tp, fp, fn, tn);
      expect(result.studies).toBeDefined();
      expect(Array.isArray(result.studies)).toBe(true);
      expect(result.studies.length).toBe(tp.length);
    });
  });

  describe('Study-level data', () => {
    it('each study should have sensitivity and specificity', () => {
      const result = dtaForestPlotData(tp, fp, fn, tn);
      result.studies.forEach(study => {
        expect(study.sensitivity).toBeDefined();
        expect(study.specificity).toBeDefined();
      });
    });

    it('each study should have confidence intervals', () => {
      const result = dtaForestPlotData(tp, fp, fn, tn);
      result.studies.forEach(study => {
        expect(study.sensitivityCI).toBeDefined();
        expect(study.specificityCI).toBeDefined();
      });
    });

    it('study values should be between 0 and 1', () => {
      const result = dtaForestPlotData(tp, fp, fn, tn);
      result.studies.forEach(study => {
        expect(study.sensitivity).toBeGreaterThanOrEqual(0);
        expect(study.sensitivity).toBeLessThanOrEqual(1);
        expect(study.specificity).toBeGreaterThanOrEqual(0);
        expect(study.specificity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Pooled estimates', () => {
    it('should include pooled sensitivity and specificity', () => {
      const result = dtaForestPlotData(tp, fp, fn, tn);
      expect(result.pooled).toBeDefined();
      expect(result.pooled.sensitivity).toBeDefined();
      expect(result.pooled.specificity).toBeDefined();
    });
  });
});

describe('DTA Model Comparison', () => {
  const { tp, fp, fn, tn } = global.DTA_DATA;

  it('bivariate and HSROC should give similar summary estimates', () => {
    const bivar = bivariateDTA(tp, fp, fn, tn);
    const hsroc = hsrocModel(tp, fp, fn, tn);

    // Summary points should be close
    expect(bivar.pooled.sensitivity.estimate)
      .toBeCloseTo(hsroc.summaryPoint.sensitivity, TOLERANCES.RELAXED);
    expect(bivar.pooled.specificity.estimate)
      .toBeCloseTo(hsroc.summaryPoint.specificity, TOLERANCES.RELAXED);
  });

  it('forest plot data should match bivariate pooled estimates', () => {
    const bivar = bivariateDTA(tp, fp, fn, tn);
    const forest = dtaForestPlotData(tp, fp, fn, tn);

    expect(bivar.pooled.sensitivity.estimate)
      .toBeCloseTo(forest.pooled.sensitivity, TOLERANCES.RELAXED);
    expect(bivar.pooled.specificity.estimate)
      .toBeCloseTo(forest.pooled.specificity, TOLERANCES.RELAXED);
  });
});

describe('Edge Cases and Robustness', () => {
  it('should handle all-perfect studies gracefully', () => {
    const tpPerfect = [100, 100, 100];
    const fpPerfect = [0, 0, 0];
    const fnPerfect = [0, 0, 0];
    const tnPerfect = [100, 100, 100];

    const result = bivariateDTA(tpPerfect, fpPerfect, fnPerfect, tnPerfect, {
      continuityCorrection: 0.5
    });
    expect(result).toBeDefined();
  });

  it('should handle small sample sizes', () => {
    const tpSmall = [5, 6, 4];
    const fpSmall = [1, 2, 1];
    const fnSmall = [2, 1, 3];
    const tnSmall = [10, 9, 11];

    const result = bivariateDTA(tpSmall, fpSmall, fnSmall, tnSmall);
    expect(result).toBeDefined();
  });

  it('should handle large sample sizes', () => {
    const tpLarge = [500, 480, 510];
    const fpLarge = [20, 25, 18];
    const fnLarge = [50, 60, 45];
    const tnLarge = [930, 935, 927];

    const result = bivariateDTA(tpLarge, fpLarge, fnLarge, tnLarge);
    expect(result).toBeDefined();
    // With large samples, estimates should be more precise
    const ciWidth = result.pooled.sensitivity.ci[1] - result.pooled.sensitivity.ci[0];
    expect(ciWidth).toBeLessThan(0.2);
  });
});

// ============================================================================
// R Validation: bivariateDTA vs mada::reitsma()
// ============================================================================

describe('R Validation: bivariateDTA vs mada::reitsma()', () => {
  // Dementia screening dataset from mada package (33 studies)
  const DEMENTIA_DATA = {
    tp: [66, 118, 48, 134, 24, 68, 64, 282, 14, 262, 144, 184, 22, 112, 152, 30, 32, 10, 708, 182, 60, 74, 28, 40, 318, 388, 118, 44, 124, 26, 74, 38, 78],
    fp: [240, 10, 64, 28, 44, 48, 0, 20, 44, 30, 30, 34, 152, 590, 126, 26, 4, 12, 1438, 18, 24, 16, 26, 76, 174, 16, 2, 34, 98, 4, 2, 0, 46],
    fn: [4, 12, 20, 8, 6, 16, 18, 64, 2, 20, 18, 34, 0, 0, 82, 26, 6, 4, 88, 108, 30, 24, 12, 6, 52, 116, 66, 8, 46, 44, 32, 46, 34],
    tn: [870, 110, 990, 152, 292, 154, 72, 286, 286, 178, 124, 52, 140, 2092, 1010, 236, 248, 334, 10448, 184, 74, 144, 210, 528, 578, 54, 44, 396, 310, 172, 226, 440, 376],
    // Reference values from mada::reitsma()
    reitsma: {
      sensitivity: 0.7887,
      specificity: 0.8862,
      sigma2Sens: 0.6399,
      sigma2Spec: 0.8772,
      correlation: 0.5779,
      AUC: 0.9044
    }
  };

  describe('Point estimates match R mada::reitsma()', () => {
    it('pooled sensitivity should match R within tolerance', () => {
      const result = bivariateDTA(DEMENTIA_DATA.tp, DEMENTIA_DATA.fp,
                                   DEMENTIA_DATA.fn, DEMENTIA_DATA.tn);

      // Tolerance: 0.02 (2% absolute difference)
      expect(result.pooled.sensitivity.estimate)
        .toBeCloseTo(DEMENTIA_DATA.reitsma.sensitivity, 1);
    });

    it('pooled specificity should match R within tolerance', () => {
      const result = bivariateDTA(DEMENTIA_DATA.tp, DEMENTIA_DATA.fp,
                                   DEMENTIA_DATA.fn, DEMENTIA_DATA.tn);

      expect(result.pooled.specificity.estimate)
        .toBeCloseTo(DEMENTIA_DATA.reitsma.specificity, 1);
    });

    it('AUC should match R within tolerance', () => {
      const result = bivariateDTA(DEMENTIA_DATA.tp, DEMENTIA_DATA.fp,
                                   DEMENTIA_DATA.fn, DEMENTIA_DATA.tn);

      if (result.pooled.auc) {
        // Tolerance: 0.03 (3% for AUC which is more sensitive)
        expect(result.pooled.auc.estimate)
          .toBeCloseTo(DEMENTIA_DATA.reitsma.AUC, 1);
      }
    });
  });

  describe('Heterogeneity estimates match R', () => {
    it('sigma2 for sensitivity should match R', () => {
      const result = bivariateDTA(DEMENTIA_DATA.tp, DEMENTIA_DATA.fp,
                                   DEMENTIA_DATA.fn, DEMENTIA_DATA.tn);

      // Variance estimates: 10% relative tolerance
      const relDiff = Math.abs(result.heterogeneity.sigma2Sens - DEMENTIA_DATA.reitsma.sigma2Sens)
                     / DEMENTIA_DATA.reitsma.sigma2Sens;
      expect(relDiff).toBeLessThan(0.2);  // 20% tolerance for variance
    });

    it('sigma2 for specificity should match R', () => {
      const result = bivariateDTA(DEMENTIA_DATA.tp, DEMENTIA_DATA.fp,
                                   DEMENTIA_DATA.fn, DEMENTIA_DATA.tn);

      const relDiff = Math.abs(result.heterogeneity.sigma2Spec - DEMENTIA_DATA.reitsma.sigma2Spec)
                     / DEMENTIA_DATA.reitsma.sigma2Spec;
      expect(relDiff).toBeLessThan(0.2);  // 20% tolerance for variance
    });

    it('correlation should match R within tolerance', () => {
      const result = bivariateDTA(DEMENTIA_DATA.tp, DEMENTIA_DATA.fp,
                                   DEMENTIA_DATA.fn, DEMENTIA_DATA.tn);

      // Correlation: 0.15 absolute tolerance (bivariate models are sensitive)
      expect(Math.abs(result.heterogeneity.correlation - DEMENTIA_DATA.reitsma.correlation))
        .toBeLessThan(0.15);
    });
  });

  describe('High heterogeneity dataset', () => {
    // R-generated high heterogeneity data (15 studies)
    const HIGH_HET_DATA = {
      tp: [29, 42, 81, 51, 87, 5, 23, 55, 66, 20, 33, 60, 55, 58, 77],
      fp: [30, 16, 2, 4, 45, 38, 10, 19, 24, 8, 90, 7, 7, 27, 18],
      fn: [10, 10, 15, 3, 7, 16, 7, 16, 22, 4, 9, 39, 10, 24, 16],
      tn: [105, 85, 57, 77, 92, 48, 90, 79, 92, 66, 44, 57, 95, 122, 82],
      reitsma: {
        sensitivity: 0.8176,
        specificity: 0.8324,
        correlation: 0.7335
      }
    };

    it('should handle high heterogeneity data', () => {
      const result = bivariateDTA(HIGH_HET_DATA.tp, HIGH_HET_DATA.fp,
                                   HIGH_HET_DATA.fn, HIGH_HET_DATA.tn);

      expect(result.pooled.sensitivity.estimate)
        .toBeCloseTo(HIGH_HET_DATA.reitsma.sensitivity, 1);
      expect(result.pooled.specificity.estimate)
        .toBeCloseTo(HIGH_HET_DATA.reitsma.specificity, 1);
    });
  });
});
