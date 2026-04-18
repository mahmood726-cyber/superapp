// Test chi-square quantiles
import jStat from 'jstat';

const alpha = 0.05;
const k = 13;
const df = k - 1;

const chiCritHigh = jStat.chisquare.inv(1 - alpha / 2, df);
const chiCritLow = jStat.chisquare.inv(alpha / 2, df);

console.log('alpha:', alpha);
console.log('df:', df);
console.log('chi²_{0.975, 12}:', chiCritHigh);
console.log('chi²_{0.025, 12}:', chiCritLow);

// Expected: chi²_{0.975, 12} ≈ 23.34, chi²_{0.025, 12} ≈ 4.40
