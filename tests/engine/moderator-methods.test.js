/**
 * Regression tests for moderator input contracts.
 */

import {
  metaCART,
  metaForest,
  multiModeratorMetaRegression
} from '../../js/engine/advanced-methods.js';

describe('Moderator method input contracts', () => {
  const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45];
  const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05];
  const moderatorColumns = {
    year: [2010, 2012, 2011, 2013, 2014, 2010, 2015, 2012, 2013, 2011],
    sampleSize: [100, 50, 200, 75, 150, 60, 180, 90, 120, 110]
  };
  const moderatorRows = yi.map((_, i) => [
    moderatorColumns.year[i],
    moderatorColumns.sampleSize[i]
  ]);

  it('multiModeratorMetaRegression accepts object-of-arrays moderators', () => {
    const result = multiModeratorMetaRegression(yi, vi, moderatorColumns, { method: 'fixed' });
    expect(result.coefficients.length).toBeGreaterThan(1);
    expect(result.nStudies).toBe(yi.length);
  });

  it('multiModeratorMetaRegression still accepts row-array moderators', () => {
    const result = multiModeratorMetaRegression(yi, vi, moderatorRows, { method: 'fixed' });
    expect(result.coefficients.length).toBeGreaterThan(1);
    expect(result.nStudies).toBe(yi.length);
  });

  it('metaCART accepts object-of-arrays moderators', () => {
    const result = metaCART(yi, vi, moderatorColumns, {
      maxDepth: 2,
      minNodeSize: 2,
      minSplit: 4,
      prune: false
    });
    expect(result.nLeaves).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.moderatorImportance)).toBe(true);
  });

  it('metaForest accepts object-of-arrays moderators', () => {
    const result = metaForest(yi, vi, moderatorColumns, {
      nTrees: 10,
      maxDepth: 2,
      minNodeSize: 2
    });
    expect(result.nTrees).toBe(10);
    expect(result.variableImportance.length).toBe(2);
  });
});
