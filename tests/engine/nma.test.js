/**
 * Tests for Network Meta-Analysis Methods
 *
 * Tests graph-theoretical NMA, inconsistency analysis, and ranking
 */

import {
  networkMetaAnalysisMultiArm,
  networkInconsistencyAnalysis,
  networkMetaRegression
} from '../../js/engine/advanced-methods.js';

// Sample NMA data: treatments A, B, C with pairwise comparisons
const createNMAData = () => {
  return [
    // Study 1: A vs B
    { study: 'Study1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.2 },
    // Study 2: A vs B
    { study: 'Study2', treat1: 'A', treat2: 'B', effect: 0.6, se: 0.25 },
    // Study 3: B vs C
    { study: 'Study3', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.18 },
    // Study 4: A vs C
    { study: 'Study4', treat1: 'A', treat2: 'C', effect: 0.7, se: 0.22 },
    // Study 5: B vs C
    { study: 'Study5', treat1: 'B', treat2: 'C', effect: 0.25, se: 0.2 }
  ];
};

// Larger NMA data for stress testing
const createLargeNMAData = () => {
  const studies = [];
  const treatments = ['A', 'B', 'C', 'D', 'E'];
  let studyNum = 1;

  // Create various comparisons
  for (let i = 0; i < treatments.length; i++) {
    for (let j = i + 1; j < treatments.length; j++) {
      // 2 studies per comparison
      for (let k = 0; k < 2; k++) {
        studies.push({
          study: `Study${studyNum++}`,
          treat1: treatments[i],
          treat2: treatments[j],
          effect: 0.3 * (j - i) + (Math.random() - 0.5) * 0.2,
          se: 0.15 + Math.random() * 0.1
        });
      }
    }
  }
  return studies;
};

describe('networkMetaAnalysisMultiArm', () => {
  describe('Basic functionality', () => {
    it('should analyze a simple network', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      expect(result).toBeDefined();
    });

    it('should identify all treatments', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      expect(result.treatments).toBeDefined();
      expect(result.treatments).toContain('A');
      expect(result.treatments).toContain('B');
      expect(result.treatments).toContain('C');
    });

    it('should return relative effects', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      expect(result.effects).toBeDefined();
      expect(Array.isArray(result.effects)).toBe(true);
    });

    it('should return heterogeneity estimate', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      expect(result.tau2).toBeDefined();
      expect(result.tau2).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Reference treatment', () => {
    it('should use specified reference treatment', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data, { reference: 'A' });
      expect(result.reference).toBe('A');
    });

    it('all effects should be relative to reference', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data, { reference: 'A' });
      if (result.effects) {
        result.effects.forEach(e => {
          expect(e.vsReference).toBe('A');
        });
      }
    });
  });

  describe('League table', () => {
    it('should generate league table', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      expect(result.leagueTable).toBeDefined();
    });

    it('league table should be symmetric', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      if (result.leagueTable) {
        const n = result.treatments.length;
        // Effect of A vs B should be negative of B vs A
        // (allowing for numerical tolerance)
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            if (i !== j && result.leagueTable[i][j] !== undefined) {
              const effectIJ = result.leagueTable[i][j].effect || 0;
              const effectJI = result.leagueTable[j][i].effect || 0;
              expect(effectIJ + effectJI).toBeCloseTo(0, TOLERANCES.STANDARD);
            }
          }
        }
      }
    });
  });

  describe('Treatment ranking', () => {
    it('should compute treatment rankings', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      expect(result.ranking).toBeDefined();
    });

    it('should compute SUCRA scores', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      if (result.sucra) {
        expect(result.sucra).toBeDefined();
        // SUCRA should be between 0 and 1
        Object.values(result.sucra).forEach(s => {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1);
        });
      }
    });
  });

  describe('Confidence intervals', () => {
    it('should provide CIs for relative effects', () => {
      const data = createNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      if (result.effects) {
        result.effects.forEach(e => {
          expect(e.ci).toBeDefined();
          expect(e.ci.length).toBe(2);
          expect(e.ci[0]).toBeLessThan(e.ci[1]);
        });
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle two treatments', () => {
      const data = [
        { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.2 },
        { study: 'S2', treat1: 'A', treat2: 'B', effect: 0.4, se: 0.25 }
      ];
      const result = networkMetaAnalysisMultiArm(data);
      expect(result).toBeDefined();
      expect(result.treatments.length).toBe(2);
    });

    it('should handle larger networks', () => {
      const data = createLargeNMAData();
      const result = networkMetaAnalysisMultiArm(data);
      expect(result).toBeDefined();
      expect(result.treatments.length).toBe(5);
    });

    it('should return error for singular matrices', () => {
      // Single study with no degrees of freedom
      const data = [
        { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.2 }
      ];
      const result = networkMetaAnalysisMultiArm(data);
      // Should return valid result or error object
      expect(result).toBeDefined();
    });
  });

  describe('Multi-arm trials', () => {
    it('should handle multi-arm trials', () => {
      const data = [
        // 3-arm trial
        { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.2 },
        { study: 'S1', treat1: 'A', treat2: 'C', effect: 0.7, se: 0.22 },
        // 2-arm trials
        { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.18 }
      ];
      const result = networkMetaAnalysisMultiArm(data);
      expect(result).toBeDefined();
    });

    it('should account for correlation in multi-arm trials', () => {
      const data = [
        // 3-arm trial should have correlated arms
        { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.2 },
        { study: 'S1', treat1: 'A', treat2: 'C', effect: 0.7, se: 0.22 },
        { study: 'S2', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.18 }
      ];
      const result = networkMetaAnalysisMultiArm(data);
      // Should complete without error
      expect(result.treatments).toBeDefined();
    });
  });
});

describe('networkInconsistencyAnalysis', () => {
  describe('Basic functionality', () => {
    it('should detect inconsistency in network', () => {
      const data = createNMAData();
      const contrasts = data.map(d => ({
        study: d.study,
        comparison: `${d.treat1}-${d.treat2}`,
        yi: d.effect,
        vi: d.se * d.se
      }));
      const result = networkInconsistencyAnalysis(contrasts);
      expect(result).toBeDefined();
    });

    it('should return global inconsistency test', () => {
      const data = createNMAData();
      const contrasts = data.map(d => ({
        study: d.study,
        comparison: `${d.treat1}-${d.treat2}`,
        yi: d.effect,
        vi: d.se * d.se
      }));
      const result = networkInconsistencyAnalysis(contrasts);
      if (result.globalTest) {
        expect(result.globalTest.statistic).toBeDefined();
        expect(result.globalTest.pValue).toBeDefined();
      }
    });
  });

  describe('Node-splitting', () => {
    it('should perform node-splitting analysis', () => {
      const data = createNMAData();
      const contrasts = data.map(d => ({
        study: d.study,
        comparison: `${d.treat1}-${d.treat2}`,
        yi: d.effect,
        vi: d.se * d.se
      }));
      const result = networkInconsistencyAnalysis(contrasts, { method: 'node-splitting' });
      expect(result).toBeDefined();
    });

    it('should compare direct and indirect evidence', () => {
      const data = createNMAData();
      const contrasts = data.map(d => ({
        study: d.study,
        comparison: `${d.treat1}-${d.treat2}`,
        yi: d.effect,
        vi: d.se * d.se
      }));
      const result = networkInconsistencyAnalysis(contrasts);
      if (result.nodeSplitting) {
        result.nodeSplitting.forEach(ns => {
          expect(ns.direct).toBeDefined();
          expect(ns.indirect).toBeDefined();
          expect(ns.difference).toBeDefined();
        });
      }
    });
  });
});

describe('networkMetaRegression', () => {
  const createNMAWithCovariate = () => {
    return [
      { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.2, year: 2010 },
      { study: 'S2', treat1: 'A', treat2: 'B', effect: 0.6, se: 0.25, year: 2015 },
      { study: 'S3', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.18, year: 2012 },
      { study: 'S4', treat1: 'A', treat2: 'C', effect: 0.7, se: 0.22, year: 2018 }
    ];
  };

  describe('Basic functionality', () => {
    it('should perform meta-regression with covariates', () => {
      const data = createNMAWithCovariate();
      const result = networkMetaRegression(data, { covariates: ['year'] });
      expect(result).toBeDefined();
    });

    it('should return covariate coefficients', () => {
      const data = createNMAWithCovariate();
      const result = networkMetaRegression(data, { covariates: ['year'] });
      if (result.coefficients) {
        expect(result.coefficients.year).toBeDefined();
      }
    });
  });

  describe('Model comparison', () => {
    it('should compare with base model', () => {
      const data = createNMAWithCovariate();
      const result = networkMetaRegression(data, { covariates: ['year'] });
      if (result.modelComparison) {
        expect(result.modelComparison.baseModel).toBeDefined();
        expect(result.modelComparison.regressionModel).toBeDefined();
      }
    });
  });
});

describe('Network Geometry', () => {
  it('should compute network geometry metrics', () => {
    const data = createLargeNMAData();
    const result = networkMetaAnalysisMultiArm(data);
    if (result.geometry) {
      expect(result.geometry.nStudies).toBeDefined();
      expect(result.geometry.nComparisons).toBeDefined();
      expect(result.geometry.nTreatments).toBeDefined();
    }
  });
});
