/**
 * Test chi-square quantiles from the actual module
 */
import * as methods from '../js/engine/advanced-methods.js';

// The module should export jStat or we can test via tau2ConfidenceInterval
// Let's access jStat indirectly

console.log('Testing chi-square quantile from actual implementation...\n');

// Get direct access to jStat by importing
// First let me check what's exported

const exports = Object.keys(methods);
console.log('Exported functions:', exports.slice(0, 10), '...');

// Let's test with a simple call to tau2ConfidenceInterval and add debugging
const yi = [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, 0.0120,
            -0.4717, -1.4012, -0.3408, 0.4459, -0.0173];
const vi = [0.0379, 0.0188, 0.0116, 0.0144, 0.0204, 0.0342, 0.0399, 0.0537,
            0.0731, 0.0072, 0.0138, 0.0177, 0.0283];

console.log('\nCalling tau2ConfidenceInterval with BCG data...');
const result = methods.tau2ConfidenceInterval(yi, vi, { method: 'Q-profile' });
console.log('\nResult:');
console.log('  tau2.ci[0] (lower):', result.tau2.ci[0]);
console.log('  tau2.ci[1] (upper):', result.tau2.ci[1]);
console.log('  Expected: [0.2252, 1.2954]');
