/**
 * Direct unit tests for js/engine/network-meta-analysis.js.
 *
 * This module is imported by js/pages/nma.js but had zero direct test
 * coverage (finding F2). Tests exercise network construction, connectivity,
 * multi-arm detection, and the WLS estimator against a hand-computed
 * fixed-effect pairwise result.
 */

import {
  buildNetwork,
  createDesignMatrix,
  runNMA
} from '../../js/engine/network-meta-analysis.js';

describe('buildNetwork', () => {
  it('detects a connected A-B-C network', () => {
    const contrasts = [
      { studyId: 's1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.04 },
      { studyId: 's2', treat1: 'B', treat2: 'C', yi: 0.3, vi: 0.05 }
    ];
    const net = buildNetwork(contrasts);
    expect(net.treatments).toEqual(['A', 'B', 'C']);
    expect(net.nTreatments).toBe(3);
    expect(net.connected).toBe(true);
    expect(net.hasMultiArm).toBe(false);
  });

  it('detects a disconnected network', () => {
    const contrasts = [
      { studyId: 's1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.04 },
      { studyId: 's2', treat1: 'C', treat2: 'D', yi: 0.3, vi: 0.05 }
    ];
    const net = buildNetwork(contrasts);
    expect(net.connected).toBe(false);
  });

  it('detects a multi-arm study (>2 arms in one study)', () => {
    const contrasts = [
      { studyId: 's1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.04 },
      { studyId: 's1', treat1: 'A', treat2: 'C', yi: 0.6, vi: 0.04 }
    ];
    const net = buildNetwork(contrasts);
    expect(net.hasMultiArm).toBe(true);
    expect(net.multiArmStudies[0].nArms).toBe(3);
  });
});

describe('createDesignMatrix', () => {
  it('encodes a single A-B contrast against reference A', () => {
    const net = buildNetwork([
      { studyId: 's1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.04 }
    ]);
    const design = createDesignMatrix(net, 'A');
    expect(design.reference).toBe('A');
    expect(design.y).toEqual([0.5]);
    expect(design.X).toEqual([[1]]); // B (col 0) vs reference A
  });

  it('throws on an unknown reference treatment', () => {
    const net = buildNetwork([
      { studyId: 's1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.04 }
    ]);
    expect(() => createDesignMatrix(net, 'Z')).toThrow();
  });
});

describe('runNMA (fixed effect) vs hand-computed pairwise pooling', () => {
  it('recovers the inverse-variance mean for two A-B studies', () => {
    const contrasts = [
      { studyId: 's1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.04 },
      { studyId: 's2', treat1: 'A', treat2: 'B', yi: 0.3, vi: 0.04 }
    ];
    const net = buildNetwork(contrasts);
    const res = runNMA(net, { reference: 'A', model: 'fixed' });
    // FE pooled = (0.5/0.04 + 0.3/0.04)/(1/0.04 + 1/0.04) = 0.4
    // se = sqrt(1/(25+25)) = 0.141421
    const b = res.basicParams.find((p) => p.treatment === 'B');
    expect(b.estimate).toBeCloseTo(0.4, 1e-6);
    expect(b.se).toBeCloseTo(Math.sqrt(1 / 50), 1e-6);
    expect(b.vsReference).toBe('A');
  });

  it('produces a finite estimate for a connected 3-treatment network', () => {
    const contrasts = [
      { studyId: 's1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.04 },
      { studyId: 's2', treat1: 'B', treat2: 'C', yi: 0.3, vi: 0.05 },
      { studyId: 's3', treat1: 'A', treat2: 'C', yi: 0.7, vi: 0.06 }
    ];
    const net = buildNetwork(contrasts);
    const res = runNMA(net, { reference: 'A', model: 'fixed' });
    expect(res.error).toBeUndefined();
    expect(res.treatments).toEqual(['A', 'B', 'C']);
    for (const p of res.basicParams) {
      expect(Number.isFinite(p.estimate)).toBe(true);
      expect(p.se).toBeGreaterThan(0);
    }
  });
});
