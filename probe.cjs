// Baseline probe for superapp meta-analysis engine.
//
// Runs estimateTau2 (REML, DL) and petPeese on the canonical BCG vaccine
// fixture and emits headline numerical signals as JSON. Deterministic.
//
// Run: node probe.cjs

'use strict';

(async () => {
    const path = require('path');
    const enginePath = 'file://' + path.join(__dirname, 'js', 'engine', 'advanced-methods.js').replace(/\\/g, '/');
    const engine = await import(enginePath);

    // BCG canonical fixture (yi=logRR, vi from 2x2 escalc)
    const yi = [-0.889311, -1.585389, -1.348073, -1.441551, -0.217547, -0.786116,
                -1.620898,  0.011952, -0.469418, -1.371345, -0.339359,  0.445913,
                -0.017314];
    const vi = [ 0.325585,  0.194581,  0.415368,  0.020010,  0.051210,  0.006906,
                 0.223017,  0.003962,  0.056434,  0.073025,  0.012412,  0.532506,
                 0.071405];

    const reml = engine.estimateTau2(yi, vi, 'REML');
    const dl   = engine.estimateTau2(yi, vi, 'DL');
    const pp   = engine.petPeese(yi, vi);

    const r6 = (x) => Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : null;

    console.log(JSON.stringify({
        n_studies: yi.length,
        tau2_REML: r6(reml.tau2),
        tau2_DL:   r6(dl.tau2),
        pet_intercept: r6(pp?.pet?.intercept ?? pp?.PET?.intercept ?? NaN),
        peese_intercept: r6(pp?.peese?.intercept ?? pp?.PEESE?.intercept ?? NaN),
    }));
})().catch(e => {
    console.error(e.stack || e.message || String(e));
    process.exit(1);
});
