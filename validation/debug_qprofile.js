/**
 * Debug Q-profile CI calculation
 */

// ============ Copy of jStatFallback implementation ============
function gammaFunction(z) {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaFunction(1 - z));
  }
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function gammaIncomplete(a, x) {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;

  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
    }
    return Math.exp(-x + a * Math.log(x) - Math.log(gammaFunction(a))) * sum;
  } else {
    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-10) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - Math.log(gammaFunction(a))) * h;
  }
}

const jStat = {
  chisquare: {
    cdf: (x, df) => {
      if (x <= 0) return 0;
      return gammaIncomplete(df / 2, x / 2);
    },
    inv: (p, df) => {
      if (p <= 0) return 0;
      if (p >= 1) return Infinity;
      let x = df;
      for (let i = 0; i < 100; i++) {
        const cdf = jStat.chisquare.cdf(x, df);
        const pdf = jStat.chisquare.pdf(x, df);
        if (pdf < 1e-15) break;
        const delta = (cdf - p) / pdf;
        x = Math.max(0.001, x - delta);
        if (Math.abs(delta) < 1e-10) break;
      }
      return x;
    },
    pdf: (x, df) => {
      if (x <= 0) return 0;
      const k = df / 2;
      return Math.pow(x, k - 1) * Math.exp(-x / 2) / (Math.pow(2, k) * gammaFunction(k));
    }
  }
};

// ============ Test chi-square quantiles ============
console.log('=== Chi-square Quantile Tests ===\n');

const alpha = 0.05;
const k = 13;
const df = k - 1;

const chiCritHigh = jStat.chisquare.inv(1 - alpha / 2, df);
const chiCritLow = jStat.chisquare.inv(alpha / 2, df);

console.log('alpha:', alpha);
console.log('df:', df);
console.log('chi²_{0.975, 12}:', chiCritHigh, '(expected: 23.34)');
console.log('chi²_{0.025, 12}:', chiCritLow, '(expected: 4.40)');

// ============ Test Q* calculation ============
console.log('\n=== Q* Calculation Tests ===\n');

const yi = [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, 0.0120,
            -0.4717, -1.4012, -0.3408, 0.4459, -0.0173];
const vi = [0.0379, 0.0188, 0.0116, 0.0144, 0.0204, 0.0342, 0.0399, 0.0537,
            0.0731, 0.0072, 0.0138, 0.0177, 0.0283];

const Qstar = (tau2Val) => {
  if (tau2Val < 0) return Infinity;
  const wiStar = vi.map(v => 1 / (v + tau2Val));
  const sumWStar = wiStar.reduce((a, b) => a + b, 0);
  const thetaStar = yi.reduce((sum, y, i) => sum + wiStar[i] * y, 0) / sumWStar;
  return yi.reduce((sum, y, i) => sum + wiStar[i] * Math.pow(y - thetaStar, 2), 0);
};

console.log('Q* at various tau² values:');
[0, 0.1, 0.2252, 0.5, 1.0, 1.2954, 2.0].forEach(tau2 => {
  console.log(`  tau² = ${tau2.toFixed(4)} -> Q* = ${Qstar(tau2).toFixed(2)}`);
});

// ============ Test bisection search ============
console.log('\n=== Bisection Search Tests ===\n');

const findTau2ForQ = (targetQ) => {
  console.log(`  Searching for tau² where Q* = ${targetQ.toFixed(2)}`);

  // First, find an upper bound where Q* < targetQ
  let high = 0.1;
  let iter = 0;
  while (Qstar(high) > targetQ && high < 1000) {
    console.log(`    Expanding: high=${high.toFixed(4)}, Q*(high)=${Qstar(high).toFixed(2)}`);
    high *= 2;
    iter++;
  }
  console.log(`    Final high=${high.toFixed(4)}, Q*(high)=${Qstar(high).toFixed(2)}`);

  if (high >= 1000) {
    console.log('    WARNING: high reached 1000, returning high');
    return high;
  }

  let low = 0;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const Qmid = Qstar(mid);
    console.log(`    Iter ${i}: low=${low.toFixed(4)}, mid=${mid.toFixed(4)}, high=${high.toFixed(4)}, Q*(mid)=${Qmid.toFixed(2)}`);

    if (Math.abs(Qmid - targetQ) < 0.0001) {
      console.log(`    Converged at mid=${mid.toFixed(4)}`);
      return mid;
    }
    if (high - low < 1e-10) {
      console.log(`    Interval too small, returning mid=${mid.toFixed(4)}`);
      return mid;
    }

    if (Qmid > targetQ) {
      low = mid;
    } else {
      high = mid;
    }
  }
  console.log(`    Max iterations, returning ${((low + high) / 2).toFixed(4)}`);
  return (low + high) / 2;
};

// Lower CI: find tau² where Q* = chiCritHigh
console.log('\nLower CI bound (Q* = chiCritHigh):');
const Q0 = Qstar(0);
console.log(`  Q*(0) = ${Q0.toFixed(2)}, chiCritHigh = ${chiCritHigh.toFixed(2)}`);

let ciLower;
if (Q0 <= chiCritHigh) {
  ciLower = 0;
  console.log('  Q0 <= chiCritHigh, so ciLower = 0');
} else {
  ciLower = findTau2ForQ(chiCritHigh);
  console.log(`  ciLower = ${ciLower.toFixed(4)} (expected: 0.2252)`);
}

// Upper CI: find tau² where Q* = chiCritLow
console.log('\nUpper CI bound (Q* = chiCritLow):');
const ciUpper = findTau2ForQ(chiCritLow);
console.log(`  ciUpper = ${ciUpper.toFixed(4)} (expected: 1.2954)`);

console.log('\n=== SUMMARY ===');
console.log(`Lower CI: ${ciLower.toFixed(4)} (expected: 0.2252)`);
console.log(`Upper CI: ${ciUpper.toFixed(4)} (expected: 1.2954)`);
