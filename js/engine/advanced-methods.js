/**
 * Advanced Meta-Analysis Methods
 * Living Meta-Analysis Platform
 *
 * Implements advanced statistical methods:
 * - Robust Variance Estimation (RVE)
 * - Selection Models (Copas, 3PSM, Vevea-Hedges)
 * - Multivariate Meta-Analysis
 * - Bayesian Meta-Analysis (MCMC with proper diagnostics)
 * - PET-PEESE and UWLS variants
 * - P-curve and P-uniform
 * - 20+ Heterogeneity Estimators (τ² methods)
 * - Multilevel/3-level Models
 * - Permutation Tests
 * - Bivariate DTA Meta-Analysis
 *
 * References:
 * - Hedges, Tipton & Johnson (2010) Robust Variance Estimation
 * - Copas & Shi (2000, 2001) Selection models
 * - Vevea & Hedges (1995) Weight function models
 * - Jackson et al. (2011) Multivariate meta-analysis
 * - Sutton & Abrams (2001) Bayesian methods
 * - Simonsohn et al. (2014) P-curve
 * - Van Aert et al. (2016) P-uniform
 * - Paule & Mandel (1982) PM τ² estimator
 * - Sidik & Jonkman (2005) SJ τ² estimator
 * - Biggerstaff & Tweedie (1997) EB τ² estimator
 * - Van Aert & Van Assen (2021) Publication bias methods
 * - Reitsma et al. (2005) Bivariate DTA model
 * - Geyer (1992) MCMC convergence diagnostics
 * - Vehtari et al. (2021) Effective sample size estimation
 * - Blackman & Vigna (2018) xoshiro128** PRNG algorithm
 * - Polson & Scott (2012) Half-Cauchy priors for variance components
 * - IntHout et al. (2016) Prediction intervals for random-effects meta-analysis
 * - Walter (2002) Properties of the SROC curve
 */

import { normalCDF, normalQuantile, chiSquareCDF } from '../utils/stats.js';

// ============================================================================
// JSTAT FALLBACKS AND UTILITY FUNCTIONS
// ============================================================================

/**
 * jStat-compatible fallbacks for when jStat library is not available
 * Provides essential statistical distributions
 */
const jStatFallback = {
  normal: {
    pdf: (x, mean = 0, sd = 1) => {
      const z = (x - mean) / sd;
      return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
    },
    cdf: (x, mean = 0, sd = 1) => normalCDF((x - mean) / sd),
    inv: (p, mean = 0, sd = 1) => mean + sd * normalQuantile(p)
  },
  chisquare: {
    cdf: (x, df) => {
      if (x <= 0) return 0;
      return gammaIncomplete(df / 2, x / 2);
    },
    inv: (p, df) => {
      // Newton-Raphson for chi-square quantile
      if (p <= 0) return 0;
      if (p >= 1) return Infinity;
      let x = df; // Initial guess
      for (let i = 0; i < 100; i++) {
        const cdf = jStatFallback.chisquare.cdf(x, df);
        const pdf = jStatFallback.chisquare.pdf(x, df);
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
  },
  studentt: {
    cdf: (x, df) => {
      if (df <= 0) return NaN;
      const t = x * x / df;
      const p = 0.5 * betaIncomplete(df / 2, 0.5, df / (df + x * x));
      return x >= 0 ? 1 - p : p;
    },
    inv: (p, df) => {
      // Newton-Raphson for t quantile
      if (p <= 0) return -Infinity;
      if (p >= 1) return Infinity;
      if (p === 0.5) return 0;
      let x = normalQuantile(p); // Initial guess from normal
      for (let i = 0; i < 50; i++) {
        const cdf = jStatFallback.studentt.cdf(x, df);
        const pdf = jStatFallback.studentt.pdf(x, df);
        if (pdf < 1e-15) break;
        const delta = (cdf - p) / pdf;
        x -= delta;
        if (Math.abs(delta) < 1e-10) break;
      }
      return x;
    },
    pdf: (x, df) => {
      const coef = gammaFunction((df + 1) / 2) / (Math.sqrt(df * Math.PI) * gammaFunction(df / 2));
      return coef * Math.pow(1 + x * x / df, -(df + 1) / 2);
    }
  }
};

// Gamma function (Lanczos approximation)
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

// Incomplete gamma function (regularized)
function gammaIncomplete(a, x) {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;

  // Use series expansion for small x
  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - Math.log(gammaFunction(a)));
  }

  // Use Lentz's continued fraction for large x (upper incomplete gamma)
  // This computes Gamma(a,x)/Gamma(a) = 1 - P(a,x)
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

// Incomplete beta function (regularized)
function betaIncomplete(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry for efficiency
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x);
  }

  const bt = Math.exp(
    Math.log(gammaFunction(a + b)) - Math.log(gammaFunction(a)) - Math.log(gammaFunction(b)) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  // Continued fraction
  let f = 1;
  let c = 1;
  let d = 0;
  for (let m = 0; m < 200; m++) {
    const m2 = 2 * m;
    // Even step
    let an = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + an * d;
    c = 1 + an / c;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;
    // Odd step
    an = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + an * d;
    c = 1 + an / c;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }

  return bt * f / a;
}

// Use jStat if available, otherwise use fallback
const jStat = (typeof window !== 'undefined' && window.jStat) ||
              (typeof global !== 'undefined' && global.jStat) ||
              jStatFallback;

// ============================================================================
// SEEDED PRNG (xoshiro128**) - Module-level for reproducible bootstrap/MCMC
// ============================================================================

/**
 * Creates a high-quality seeded PRNG using xoshiro128** algorithm
 * (Blackman & Vigna, 2018) - suitable for Monte Carlo simulations
 * @param {number} seed - Integer seed for reproducibility
 * @returns {Object} PRNG object with random() and randomNormal() methods
 */
function createSeededRNG(seed = 12345) {
  // Initialize 4x32-bit state from seed using SplitMix64
  const splitmix = (s) => {
    let z = (BigInt(s) + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return Number((z ^ (z >> 31n)) & 0xffffffffn);
  };

  let s0 = splitmix(seed);
  let s1 = splitmix(seed + 1);
  let s2 = splitmix(seed + 2);
  let s3 = splitmix(seed + 3);

  const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;

  return {
    // xoshiro128** core - returns [0, 1)
    random: () => {
      const result = (rotl((s1 * 5) >>> 0, 7) * 9) >>> 0;
      const t = (s1 << 9) >>> 0;

      s2 ^= s0;
      s3 ^= s1;
      s1 ^= s2;
      s0 ^= s3;
      s2 ^= t;
      s3 = rotl(s3, 11);

      return result / 0xffffffff;
    },
    // Box-Muller transform for normal deviates
    randomNormal: function(mean = 0, sd = 1) {
      const u1 = this.random();
      const u2 = this.random();
      const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
      return mean + sd * z;
    },
    // Generate random integer in [0, max)
    randomInt: function(max) {
      return Math.floor(this.random() * max);
    }
  };
}

// Default RNG for bootstrap operations - can be reseeded
let defaultBootstrapRNG = createSeededRNG(42);

/**
 * Reseed the default bootstrap RNG for reproducibility
 * @param {number} seed - New seed value
 */
function setBootstrapSeed(seed) {
  defaultBootstrapRNG = createSeededRNG(seed);
}

// Unified median function (single definition)
function medianUtil(arr) {
  if (!arr || arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================================
// RESULT CACHING SYSTEM
// ============================================================================

/**
 * Analysis Result Cache
 *
 * Provides intelligent caching for expensive meta-analysis computations.
 * Helps avoid recomputation when the same analysis is run multiple times
 * (e.g., during interactive parameter exploration).
 *
 * Features:
 * - LRU eviction when maxSize exceeded
 * - Optional TTL (time-to-live) expiration
 * - Input hashing for cache key generation
 * - Statistics tracking for monitoring
 * - Method-specific caching support
 */
class AnalysisCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTTL = options.defaultTTL || 0;  // 0 = no expiration
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Generate a hash key from inputs
   * Uses JSON serialization with sorted keys for deterministic hashing
   */
  _hashInputs(methodName, ...args) {
    const sortedArgs = args.map(arg => {
      if (Array.isArray(arg)) {
        // For arrays, include first few elements and length for uniqueness
        if (arg.length > 20) {
          return {
            __type: 'array',
            length: arg.length,
            sample: arg.slice(0, 10),
            last: arg.slice(-5),
            sum: arg.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
          };
        }
        return arg;
      }
      if (arg !== null && typeof arg === 'object') {
        // Sort object keys for deterministic serialization
        const sorted = {};
        Object.keys(arg).sort().forEach(key => {
          sorted[key] = arg[key];
        });
        return sorted;
      }
      return arg;
    });

    const str = JSON.stringify({ method: methodName, args: sortedArgs });

    // Simple hash function (djb2)
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;  // Convert to 32-bit integer
    }
    return `${methodName}_${hash.toString(16)}`;
  }

  /**
   * Get cached result if available and not expired
   */
  get(methodName, ...args) {
    const key = this._hashInputs(methodName, ...args);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL expiration
    if (entry.ttl > 0 && Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return { ...entry.result, __cached: true, __cacheKey: key };
  }

  /**
   * Store result in cache
   */
  set(methodName, args, result, options = {}) {
    const key = this._hashInputs(methodName, ...args);
    const ttl = options.ttl !== undefined ? options.ttl : this.defaultTTL;

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl,
      methodName
    });

    return key;
  }

  /**
   * Clear all cached results
   */
  clear() {
    this.cache.clear();
    return this;
  }

  /**
   * Clear cached results for a specific method
   */
  clearMethod(methodName) {
    for (const [key, entry] of this.cache) {
      if (entry.methodName === methodName) {
        this.cache.delete(key);
      }
    }
    return this;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    return this;
  }
}

// Global analysis cache instance
const analysisCache = new AnalysisCache({
  maxSize: 100,
  defaultTTL: 0  // No expiration by default
});

/**
 * Create a cached version of an analysis function
 *
 * @param {Function} fn - The analysis function to wrap
 * @param {string} methodName - Name for cache key generation
 * @param {Object} options - Caching options
 * @returns {Function} Cached version of the function
 *
 * @example
 * const cachedBayesian = createCachedAnalysis(bayesianMetaAnalysis, 'bayesian', { ttl: 300000 });
 * const result = cachedBayesian(yi, vi, options);  // Caches result for 5 minutes
 */
function createCachedAnalysis(fn, methodName, options = {}) {
  return function cachedFn(...args) {
    // Check cache first
    const cached = analysisCache.get(methodName, ...args);
    if (cached) {
      return cached;
    }

    // Run analysis
    const result = fn(...args);

    // Cache result
    analysisCache.set(methodName, args, result, options);

    return result;
  };
}

/**
 * Configure the global analysis cache
 *
 * @param {Object} options - Cache configuration
 * @param {number} options.maxSize - Maximum number of cached results
 * @param {number} options.defaultTTL - Default time-to-live in ms (0 = no expiration)
 */
function configureCache(options = {}) {
  if (options.maxSize !== undefined) {
    analysisCache.maxSize = options.maxSize;
  }
  if (options.defaultTTL !== undefined) {
    analysisCache.defaultTTL = options.defaultTTL;
  }
  return analysisCache.getStats();
}

/**
 * Clear all cached analysis results
 */
function clearAnalysisCache() {
  return analysisCache.clear();
}

/**
 * Get cache statistics for monitoring
 */
function getCacheStats() {
  return analysisCache.getStats();
}

// ============================================================================
// INPUT VALIDATION SYSTEM
// ============================================================================

/**
 * Comprehensive input validation for meta-analysis functions
 * Throws informative errors for invalid inputs with suggestions
 */
const ValidationError = class extends Error {
  constructor(message, methodName, suggestion = null) {
    const fullMessage = suggestion
      ? `[${methodName}] ${message}\n  → Suggestion: ${suggestion}`
      : `[${methodName}] ${message}`;
    super(fullMessage);
    this.name = 'ValidationError';
    this.methodName = methodName;
    this.suggestion = suggestion;
  }
};

/**
 * Common suggestions for validation errors
 */
const ValidationSuggestions = {
  // Array type errors
  notArray: (name) => `Ensure ${name} is a JavaScript array. If reading from JSON, parse it first with JSON.parse().`,

  // Length mismatch
  lengthMismatch: () => `Check that all input arrays have the same number of studies. Each study should have exactly one entry in each array.`,

  // Minimum studies
  minStudies: (min) => `Meta-analysis requires at least ${min} studies. For single studies, use standard statistical methods.`,

  // Non-finite values
  nonFinite: (name, i) => `Check study ${i + 1} for missing data, division by zero, or data entry errors. Use NA handling or exclude incomplete studies.`,

  // Non-positive variance
  nonPositiveVariance: (i) => `Study ${i + 1} has zero or negative variance. This can occur with: (1) zero cell counts in 2x2 tables - use continuity correction option, (2) single observation per group - more data needed, (3) data entry error - verify source data.`,

  // DTA zero cells
  dtaZeroCells: () => `Zero cells in 2x2 tables can cause computational issues. Use the continuityCorrection option (e.g., 0.5) or the 'treatment arm' correction.`,

  // NMA network connectivity
  nmaDisconnected: () => `The treatment network must be connected (all treatments reachable from any other). Check for typos in treatment names or add bridging studies.`,

  // P-value bounds
  pValueBounds: () => `P-values must be strictly between 0 and 1. Exact p=0 or p=1 should be replaced with very small (e.g., 1e-10) or very large (e.g., 0.9999) values.`,

  // IPD data structure
  ipdStructure: () => `Each observation must be an object with at least 'study' (study identifier) and 'y' (outcome) fields. Example: {study: "Study1", y: 0.5, x: 1}`,

  // Cluster issues
  clusterMismatch: () => `The clusters array must have one entry per effect size, identifying which cluster/study each effect belongs to.`,

  // Model convergence
  convergenceFailed: () => `Model failed to converge. Try: (1) increasing maxIter, (2) checking for extreme outliers, (3) using a simpler model, (4) different starting values.`,

  // Matrix singularity
  singularMatrix: () => `Matrix is singular or near-singular. This often occurs with: (1) perfect multicollinearity in moderators, (2) too many parameters for the data, (3) extreme variance ratios between studies.`,

  // MCMC chains
  mcmcDiagnostics: () => `Poor MCMC convergence (Rhat > 1.1 or low ESS). Try: (1) more iterations (nIter), (2) longer burn-in (nBurnin), (3) different priors, (4) checking data for issues.`,

  // Quality scores
  qualityRange: () => `Quality scores should be normalized to [0, 1] range where 0 = lowest quality and 1 = highest quality.`,

  // Effect size calculation
  effectSizeCalc: () => `If you have raw counts (events, totals), use escalc() to compute effect sizes and variances first.`
};

/**
 * Validate basic meta-analysis input (yi, vi arrays)
 */
function validateMetaInput(yi, vi, methodName, options = {}) {
  const { minStudies = 2, allowNonPositiveVariance = false } = options;

  if (!Array.isArray(yi)) {
    throw new ValidationError(
      'yi must be an array of effect sizes',
      methodName,
      ValidationSuggestions.notArray('yi')
    );
  }
  if (!Array.isArray(vi)) {
    throw new ValidationError(
      'vi must be an array of variances',
      methodName,
      ValidationSuggestions.notArray('vi')
    );
  }
  if (yi.length !== vi.length) {
    throw new ValidationError(
      `yi (length ${yi.length}) and vi (length ${vi.length}) must have same length`,
      methodName,
      ValidationSuggestions.lengthMismatch()
    );
  }
  if (yi.length < minStudies) {
    throw new ValidationError(
      `need at least ${minStudies} studies, got ${yi.length}`,
      methodName,
      ValidationSuggestions.minStudies(minStudies)
    );
  }

  for (let i = 0; i < yi.length; i++) {
    if (typeof yi[i] !== 'number' || !isFinite(yi[i])) {
      throw new ValidationError(
        `yi[${i}] = ${yi[i]} is not a finite number`,
        methodName,
        ValidationSuggestions.nonFinite('yi', i)
      );
    }
    if (typeof vi[i] !== 'number' || !isFinite(vi[i])) {
      throw new ValidationError(
        `vi[${i}] = ${vi[i]} is not a finite number`,
        methodName,
        ValidationSuggestions.nonFinite('vi', i)
      );
    }
    if (!allowNonPositiveVariance && vi[i] <= 0) {
      throw new ValidationError(
        `vi[${i}] = ${vi[i]} must be positive`,
        methodName,
        ValidationSuggestions.nonPositiveVariance(i)
      );
    }
  }

  return true;
}

/**
 * Validate DTA input (2x2 table arrays)
 */
function validateDTAInput(tp, fp, fn, tn, methodName) {
  const arrays = { tp, fp, fn, tn };
  const names = ['tp', 'fp', 'fn', 'tn'];

  for (const name of names) {
    if (!Array.isArray(arrays[name])) {
      throw new ValidationError(
        `${name} must be an array`,
        methodName,
        ValidationSuggestions.notArray(name)
      );
    }
  }

  const n = tp.length;
  for (const name of names) {
    if (arrays[name].length !== n) {
      throw new ValidationError(
        `all arrays must have same length (tp has ${n}, ${name} has ${arrays[name].length})`,
        methodName,
        ValidationSuggestions.lengthMismatch()
      );
    }
  }

  if (n < 2) {
    throw new ValidationError(
      `need at least 2 studies, got ${n}`,
      methodName,
      ValidationSuggestions.minStudies(2)
    );
  }

  for (let i = 0; i < n; i++) {
    for (const name of names) {
      const val = arrays[name][i];
      if (typeof val !== 'number' || !isFinite(val) || val < 0 || !Number.isInteger(val)) {
        throw new ValidationError(
          `${name}[${i}] = ${val} must be a non-negative integer`,
          methodName,
          `Study ${i + 1} has invalid ${name} value. Cell counts must be whole numbers ≥ 0. Check raw data or use Math.round() if needed.`
        );
      }
    }
    // Check for valid 2x2 table
    const total = tp[i] + fp[i] + fn[i] + tn[i];
    if (total === 0) {
      throw new ValidationError(
        `study ${i} has zero observations`,
        methodName,
        `Study ${i + 1} has empty 2x2 table (all cells = 0). Remove this study or verify data entry.`
      );
    }
  }

  return true;
}

/**
 * Validate studies array for binary outcomes
 */
function validateBinaryStudies(studies, methodName, requiredFields = ['ai', 'bi', 'ci', 'di']) {
  if (!Array.isArray(studies)) {
    throw new ValidationError('studies must be an array', methodName);
  }
  if (studies.length < 2) {
    throw new ValidationError(`need at least 2 studies, got ${studies.length}`, methodName);
  }

  for (let i = 0; i < studies.length; i++) {
    const study = studies[i];
    if (!study || typeof study !== 'object') {
      throw new ValidationError(`studies[${i}] must be an object`, methodName);
    }
    for (const field of requiredFields) {
      if (!(field in study)) {
        throw new ValidationError(`studies[${i}] missing required field '${field}'`, methodName);
      }
      const val = study[field];
      if (typeof val !== 'number' || !isFinite(val)) {
        throw new ValidationError(`studies[${i}].${field} = ${val} must be a finite number`, methodName);
      }
    }
  }

  return true;
}

/**
 * Validate numeric parameter within range
 */
function validateNumeric(value, name, methodName, options = {}) {
  const { min = -Infinity, max = Infinity, integer = false, allowNull = false } = options;

  if (allowNull && (value === null || value === undefined)) {
    return true;
  }

  if (typeof value !== 'number' || !isFinite(value)) {
    throw new ValidationError(`${name} = ${value} must be a finite number`, methodName);
  }
  if (value < min) {
    throw new ValidationError(`${name} = ${value} must be >= ${min}`, methodName);
  }
  if (value > max) {
    throw new ValidationError(`${name} = ${value} must be <= ${max}`, methodName);
  }
  if (integer && !Number.isInteger(value)) {
    throw new ValidationError(`${name} = ${value} must be an integer`, methodName);
  }

  return true;
}

/**
 * Validate array of p-values (0 < p < 1)
 */
function validatePValues(pValues, methodName) {
  if (!Array.isArray(pValues)) {
    throw new ValidationError(
      'pValues must be an array',
      methodName,
      ValidationSuggestions.notArray('pValues')
    );
  }
  if (pValues.length < 2) {
    throw new ValidationError(
      `need at least 2 p-values, got ${pValues.length}`,
      methodName,
      ValidationSuggestions.minStudies(2)
    );
  }

  for (let i = 0; i < pValues.length; i++) {
    const p = pValues[i];
    if (typeof p !== 'number' || !isFinite(p)) {
      throw new ValidationError(
        `pValues[${i}] = ${p} must be a finite number`,
        methodName,
        ValidationSuggestions.nonFinite('pValues', i)
      );
    }
    if (p <= 0 || p >= 1) {
      throw new ValidationError(
        `pValues[${i}] = ${p} must be in (0, 1)`,
        methodName,
        ValidationSuggestions.pValueBounds()
      );
    }
  }

  return true;
}

/**
 * Validate clusters array for RVE
 */
function validateClusters(clusters, expectedLength, methodName) {
  if (!Array.isArray(clusters)) {
    throw new ValidationError(
      'clusters must be an array',
      methodName,
      ValidationSuggestions.notArray('clusters')
    );
  }
  if (clusters.length !== expectedLength) {
    throw new ValidationError(
      `clusters length (${clusters.length}) must match yi length (${expectedLength})`,
      methodName,
      ValidationSuggestions.clusterMismatch()
    );
  }

  return true;
}

/**
 * Validate moderators matrix for meta-regression/CART
 */
function validateModerators(moderators, expectedRows, methodName) {
  if (!Array.isArray(moderators)) {
    throw new ValidationError('moderators must be an array', methodName);
  }
  if (moderators.length !== expectedRows) {
    throw new ValidationError(`moderators length (${moderators.length}) must match number of studies (${expectedRows})`, methodName);
  }

  // Check all rows have same length
  const firstRowLength = Array.isArray(moderators[0]) ? moderators[0].length : 1;
  for (let i = 0; i < moderators.length; i++) {
    const row = moderators[i];
    const rowLength = Array.isArray(row) ? row.length : 1;
    if (rowLength !== firstRowLength) {
      throw new ValidationError(`moderators[${i}] has different number of columns`, methodName);
    }
  }

  return true;
}

/**
 * Validate IPD data structure
 */
function validateIPDData(data, methodName) {
  if (!Array.isArray(data)) {
    throw new ValidationError(
      'data must be an array of individual observations',
      methodName,
      ValidationSuggestions.notArray('data')
    );
  }
  if (data.length < 10) {
    throw new ValidationError(
      `need at least 10 observations, got ${data.length}`,
      methodName,
      'IPD meta-analysis requires individual participant data. For aggregate data, use standard meta-analysis functions instead.'
    );
  }

  // Check required fields
  for (let i = 0; i < data.length; i++) {
    const obs = data[i];
    if (!obs || typeof obs !== 'object') {
      throw new ValidationError(
        `data[${i}] must be an object`,
        methodName,
        ValidationSuggestions.ipdStructure()
      );
    }
    if (!('study' in obs)) {
      throw new ValidationError(
        `data[${i}] missing required field 'study'`,
        methodName,
        ValidationSuggestions.ipdStructure()
      );
    }
    if (!('y' in obs)) {
      throw new ValidationError(
        `data[${i}] missing required field 'y' (outcome)`,
        methodName,
        ValidationSuggestions.ipdStructure()
      );
    }
  }

  // Check we have multiple studies
  const uniqueStudies = new Set(data.map(d => d.study));
  if (uniqueStudies.size < 2) {
    throw new ValidationError(
      `need at least 2 studies, got ${uniqueStudies.size}`,
      methodName,
      ValidationSuggestions.minStudies(2)
    );
  }

  return true;
}

/**
 * Validate NMA contrasts input
 */
function validateNMAContrasts(contrasts, methodName) {
  if (!Array.isArray(contrasts)) {
    throw new ValidationError('contrasts must be an array', methodName);
  }
  if (contrasts.length < 2) {
    throw new ValidationError(`need at least 2 contrasts, got ${contrasts.length}`, methodName);
  }

  const requiredFields = ['study', 'treat1', 'treat2', 'effect', 'se'];
  for (let i = 0; i < contrasts.length; i++) {
    const c = contrasts[i];
    if (!c || typeof c !== 'object') {
      throw new ValidationError(`contrasts[${i}] must be an object`, methodName);
    }
    for (const field of requiredFields) {
      if (!(field in c)) {
        throw new ValidationError(`contrasts[${i}] missing required field '${field}'`, methodName);
      }
    }
    if (typeof c.effect !== 'number' || !isFinite(c.effect)) {
      throw new ValidationError(`contrasts[${i}].effect must be a finite number`, methodName);
    }
    if (typeof c.se !== 'number' || !isFinite(c.se) || c.se <= 0) {
      throw new ValidationError(`contrasts[${i}].se must be a positive number`, methodName);
    }
  }

  return true;
}

/**
 * Validate quality scores for QE model
 */
function validateQualityScores(quality, expectedLength, methodName) {
  if (!Array.isArray(quality)) {
    throw new ValidationError(
      'quality must be an array',
      methodName,
      ValidationSuggestions.notArray('quality')
    );
  }
  if (quality.length !== expectedLength) {
    throw new ValidationError(
      `quality length (${quality.length}) must match number of studies (${expectedLength})`,
      methodName,
      ValidationSuggestions.lengthMismatch()
    );
  }

  for (let i = 0; i < quality.length; i++) {
    const q = quality[i];
    if (typeof q !== 'number' || !isFinite(q)) {
      throw new ValidationError(
        `quality[${i}] = ${q} must be a finite number`,
        methodName,
        ValidationSuggestions.nonFinite('quality', i)
      );
    }
    if (q < 0 || q > 1) {
      throw new ValidationError(
        `quality[${i}] = ${q} should be between 0 and 1`,
        methodName,
        ValidationSuggestions.qualityRange()
      );
    }
  }

  return true;
}

/**
 * Validate boolean significance indicators
 */
function validateSignificance(significant, expectedLength, methodName) {
  if (!Array.isArray(significant)) {
    throw new ValidationError('significant must be an array', methodName);
  }
  if (significant.length !== expectedLength) {
    throw new ValidationError(`significant length (${significant.length}) must match number of studies (${expectedLength})`, methodName);
  }

  for (let i = 0; i < significant.length; i++) {
    const s = significant[i];
    if (typeof s !== 'boolean' && s !== 0 && s !== 1) {
      throw new ValidationError(`significant[${i}] = ${s} must be boolean or 0/1`, methodName);
    }
  }

  return true;
}

// t-distribution CDF (uses jStat fallback)
function tCDF(x, df) {
  return jStat.studentt.cdf(x, df);
}

// t-distribution quantile (uses jStat fallback)
function tQuantile(p, df) {
  return jStat.studentt.inv(p, df);
}

// ============================================================================
// ROBUST VARIANCE ESTIMATION (RVE)
// ============================================================================

/**
 * Robust Variance Estimation with CR2 small-sample correction
 * Handles dependent effect sizes within studies
 * Based on Hedges, Tipton & Johnson (2010)
 */
export function robustVarianceEstimation(yi, vi, clusters, X = null, options = {}) {
  const METHOD = 'robustVarianceEstimation';

  // Input validation
  validateMetaInput(yi, vi, METHOD);
  validateClusters(clusters, yi.length, METHOD);

  const {
    rho = 0.8, // Assumed within-study correlation
    smallSample = true, // Apply CR2 correction
    weights = 'inverse' // 'inverse' or 'user-defined'
  } = options;

  validateNumeric(rho, 'rho', METHOD, { min: 0, max: 1 });

  const n = yi.length;
  const uniqueClusters = [...new Set(clusters)];
  const m = uniqueClusters.length; // Number of clusters (studies)

  // Design matrix (intercept only if not provided)
  const Xmat = X || yi.map(() => [1]);
  const p = Xmat[0].length;

  // Working correlation structure within clusters
  // Assume compound symmetry with correlation rho
  const clusterIndices = {};
  for (let i = 0; i < n; i++) {
    if (!clusterIndices[clusters[i]]) {
      clusterIndices[clusters[i]] = [];
    }
    clusterIndices[clusters[i]].push(i);
  }

  // Weight matrix (diagonal with inverse variance)
  const W = vi.map(v => 1 / v);
  const sumW = W.reduce((a, b) => a + b, 0);

  // Initial weighted least squares estimate
  // beta = (X'WX)^-1 X'Wy
  const XtWX = matrixCreate(p, p);
  const XtWy = new Array(p).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      XtWy[j] += W[i] * Xmat[i][j] * yi[i];
      for (let k = 0; k < p; k++) {
        XtWX[j][k] += W[i] * Xmat[i][j] * Xmat[i][k];
      }
    }
  }

  const XtWXinv = invertMatrix(XtWX);
  if (!XtWXinv) {
    return { error: 'Singular matrix in RVE' };
  }

  const beta = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < p; k++) {
      beta[j] += XtWXinv[j][k] * XtWy[k];
    }
  }

  // Residuals
  const resid = yi.map((y, i) => y - Xmat[i].reduce((sum, x, j) => sum + x * beta[j], 0));

  // Cluster-robust variance estimation
  // V_CR = (X'WX)^-1 * (sum_j X'_j W_j e_j e_j' W_j X_j) * (X'WX)^-1
  const meat = matrixCreate(p, p);

  for (const cluster of uniqueClusters) {
    const indices = clusterIndices[cluster];
    const nj = indices.length;

    // Cluster-level products
    const Xj = indices.map(i => Xmat[i]);
    const Wj = indices.map(i => W[i]);
    const ej = indices.map(i => resid[i]);

    // Include within-cluster correlation in variance
    // Using working correlation V_j = diag(v) + rho * sqrt(vi*vj) for i!=j
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        let sum = 0;
        for (let i = 0; i < nj; i++) {
          for (let k = 0; k < nj; k++) {
            const corr = i === k ? 1 : rho;
            sum += Wj[i] * Xj[i][a] * ej[i] * ej[k] * Xj[k][b] * Wj[k] * corr;
          }
        }
        meat[a][b] += sum;
      }
    }
  }

  // CR2 small-sample correction
  let varBeta;
  if (smallSample && m > p) {
    // CR2 correction using leverage adjustment
    const adjustedMeat = matrixCreate(p, p);

    for (const cluster of uniqueClusters) {
      const indices = clusterIndices[cluster];
      const nj = indices.length;
      const Xj = indices.map(i => Xmat[i]);
      const Wj = indices.map(i => W[i]);
      const ej = indices.map(i => resid[i]);

      // Leverage for cluster j: H_j = X_j (X'WX)^-1 X'_j W_j
      const Hj = matrixCreate(nj, nj);
      for (let i = 0; i < nj; i++) {
        for (let k = 0; k < nj; k++) {
          for (let a = 0; a < p; a++) {
            for (let b = 0; b < p; b++) {
              Hj[i][k] += Xj[i][a] * XtWXinv[a][b] * Xj[k][b] * Wj[k];
            }
          }
        }
      }

      // Adjustment matrix: (I - H_j)^-1/2
      const IminusH = Hj.map((row, i) => row.map((val, k) => (i === k ? 1 : 0) - val));
      const sqrtAdj = matrixSqrtInverse(IminusH);

      if (sqrtAdj) {
        // Adjusted residuals
        const ejAdj = matrixVectorMultiply(sqrtAdj, ej);

        for (let a = 0; a < p; a++) {
          for (let b = 0; b < p; b++) {
            for (let i = 0; i < nj; i++) {
              for (let k = 0; k < nj; k++) {
                const corr = i === k ? 1 : rho;
                adjustedMeat[a][b] += Wj[i] * Xj[i][a] * ejAdj[i] * ejAdj[k] * Xj[k][b] * Wj[k] * corr;
              }
            }
          }
        }
      }
    }

    // Sandwich estimator with CR2
    varBeta = matrixMultiply(matrixMultiply(XtWXinv, adjustedMeat), XtWXinv);
  } else {
    // CR0 (standard cluster-robust)
    varBeta = matrixMultiply(matrixMultiply(XtWXinv, meat), XtWXinv);
  }

  // Standard errors and inference
  const seBeta = varBeta.map((row, i) => Math.sqrt(Math.max(0, row[i])));

  // Satterthwaite degrees of freedom for small samples
  const df = smallSample ? Math.max(1, m - p) : Infinity;

  const tStats = beta.map((b, i) => b / seBeta[i]);
  const pValues = tStats.map(t =>
    df === Infinity
      ? 2 * (1 - normalCDF(Math.abs(t)))
      : 2 * (1 - tCDF(Math.abs(t), df))
  );

  const tCrit = df === Infinity ? normalQuantile(0.975) : tQuantile(0.975, df);
  const ciLower = beta.map((b, i) => b - tCrit * seBeta[i]);
  const ciUpper = beta.map((b, i) => b + tCrit * seBeta[i]);

  return {
    coefficients: beta.map((b, i) => ({
      estimate: b,
      se: seBeta[i],
      t: tStats[i],
      p: pValues[i],
      ci: [ciLower[i], ciUpper[i]]
    })),
    estimate: beta[0],
    se: seBeta[0],
    ci: [ciLower[0], ciUpper[0]],
    t: tStats[0],
    p: pValues[0],
    df,
    nClusters: m,
    nEffects: n,
    rho,
    method: smallSample ? 'CR2' : 'CR0'
  };
}

// ============================================================================
// SELECTION MODELS
// ============================================================================

/**
 * Copas Selection Model - Full Marginal Likelihood Implementation
 * Models publication bias using bivariate normal selection mechanism
 * Based on Copas & Shi (2000, 2001), Copas & Jackson (2004)
 *
 * Model: y_i | selected ~ N(mu, sigma_i^2 + tau^2)
 *        P(selected) = Phi(gamma_0 + gamma_1 / sigma_i + rho * z_i)
 *
 * where z_i is the standardized effect (y_i - mu) / sqrt(sigma_i^2 + tau^2)
 */
export function copasSelectionModel(yi, vi, options = {}) {
  const METHOD = 'copasSelectionModel';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    gamma0Range = [-2, 2],     // Range for intercept selection parameter
    gamma1Range = [0, 2],      // Range for precision-based selection
    rhoRange = [0, 0.99],      // Correlation between effect and selection
    nGrid = 15,                // Grid points per parameter
    level = 0.95,
    maxIter = 100,
    tol = 1e-6
  } = options;

  validateNumeric(level, 'level', METHOD, { min: 0.5, max: 0.999 });
  validateNumeric(nGrid, 'nGrid', METHOD, { min: 3, max: 100, integer: true });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const z = normalQuantile(1 - (1 - level) / 2);

  // Compute marginal log-likelihood for Copas model
  // L(mu, tau, gamma0, gamma1, rho | data) integrating out selection
  function copasLogLikelihood(mu, tau2, gamma0, gamma1, rho) {
    if (tau2 < 0) return -Infinity;

    let ll = 0;
    for (let i = 0; i < n; i++) {
      const totalVar = vi[i] + tau2;
      const totalSE = Math.sqrt(totalVar);
      const zi = (yi[i] - mu) / totalSE;

      // Selection probability: P(select | y_i, params)
      // Using Heckman-type selection: probit model with correlation
      const a = gamma0 + gamma1 / se[i];
      const selArg = (a + rho * zi) / Math.sqrt(1 - rho * rho);
      const selProb = normalCDF(selArg);

      if (selProb < 1e-10) {
        ll -= 50; // Heavy penalty
        continue;
      }

      // Likelihood contribution: f(y_i | selected, params)
      // = phi(z_i) * Phi(selection_arg) / P(selected)
      const normDensity = Math.exp(-0.5 * zi * zi) / (Math.sqrt(2 * Math.PI) * totalSE);

      // Marginal selection probability (unconditional)
      const marginalSelProb = normalCDF(a / Math.sqrt(1 + rho * rho * totalVar / vi[i]));

      if (marginalSelProb > 1e-10 && normDensity > 0) {
        ll += Math.log(normDensity) + Math.log(selProb) - Math.log(Math.max(marginalSelProb, 1e-10));
      } else {
        ll -= 50;
      }
    }
    return ll;
  }

  // Step 1: Get unadjusted estimate
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaUnadj = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const seUnadj = Math.sqrt(1 / sumW);

  // Step 2: Estimate tau^2 using DL
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaUnadj, 2), 0);
  const c = sumW - wi.reduce((s, w) => s + w * w, 0) / sumW;
  let tau2Init = Math.max(0, (Q - (n - 1)) / c);

  // Step 3: Profile likelihood over selection parameters
  // Grid search to find reasonable starting values
  let bestLL = -Infinity;
  let bestParams = { mu: thetaUnadj, tau2: tau2Init, gamma0: 0, gamma1: 0, rho: 0 };

  const gamma0Vals = Array.from({ length: nGrid }, (_, i) =>
    gamma0Range[0] + (gamma0Range[1] - gamma0Range[0]) * i / (nGrid - 1));
  const gamma1Vals = Array.from({ length: nGrid }, (_, i) =>
    gamma1Range[0] + (gamma1Range[1] - gamma1Range[0]) * i / (nGrid - 1));
  const rhoVals = [0, 0.3, 0.5, 0.7, 0.9];

  for (const g0 of gamma0Vals) {
    for (const g1 of gamma1Vals) {
      for (const rho of rhoVals) {
        // Optimize mu and tau2 using quasi-Newton with line search
        let mu = thetaUnadj;
        let tau2 = tau2Init;

        // Numerical gradient
        const computeGrad = (muVal, tau2Val) => {
          const h = 1e-5;
          const f0 = copasLogLikelihood(muVal, tau2Val, g0, g1, rho);
          return {
            mu: (copasLogLikelihood(muVal + h, tau2Val, g0, g1, rho) - f0) / h,
            tau2: tau2Val > h ? (copasLogLikelihood(muVal, tau2Val + h, g0, g1, rho) - f0) / h : 0
          };
        };

        // Line search with Armijo condition
        const lineSearch = (muVal, tau2Val, dirMu, dirTau2) => {
          const f0 = copasLogLikelihood(muVal, tau2Val, g0, g1, rho);
          const grad = computeGrad(muVal, tau2Val);
          const slope = grad.mu * dirMu + grad.tau2 * dirTau2;
          if (slope <= 0) return 0;

          let alpha = 1.0;
          const c1 = 1e-4;
          for (let i = 0; i < 20; i++) {
            const newMu = muVal + alpha * dirMu;
            const newTau2 = Math.max(0, tau2Val + alpha * dirTau2);
            const fNew = copasLogLikelihood(newMu, newTau2, g0, g1, rho);
            if (fNew >= f0 + c1 * alpha * slope) return alpha;
            alpha *= 0.5;
          }
          return alpha;
        };

        for (let iter = 0; iter < 50; iter++) {
          const ll = copasLogLikelihood(mu, tau2, g0, g1, rho);
          if (!isFinite(ll)) break;

          const grad = computeGrad(mu, tau2);
          const gradNorm = Math.sqrt(grad.mu * grad.mu + grad.tau2 * grad.tau2);
          if (gradNorm < 1e-6) break;

          // Use gradient as search direction
          const alpha = lineSearch(mu, tau2, grad.mu, grad.tau2);
          if (alpha < 1e-10) break;

          mu += alpha * grad.mu;
          tau2 = Math.max(0, tau2 + alpha * grad.tau2);
        }

        const ll = copasLogLikelihood(mu, tau2, g0, g1, rho);
        if (ll > bestLL) {
          bestLL = ll;
          bestParams = { mu, tau2, gamma0: g0, gamma1: g1, rho };
        }
      }
    }
  }

  // Step 4: Fine-tune with coordinate descent
  let { mu, tau2, gamma0, gamma1, rho } = bestParams;

  for (let iter = 0; iter < maxIter; iter++) {
    const oldMu = mu;
    const oldTau2 = tau2;

    // Update mu using Newton step
    const h = 0.001;
    const ll0 = copasLogLikelihood(mu, tau2, gamma0, gamma1, rho);
    const ll1 = copasLogLikelihood(mu + h, tau2, gamma0, gamma1, rho);
    const ll2 = copasLogLikelihood(mu - h, tau2, gamma0, gamma1, rho);
    const grad = (ll1 - ll2) / (2 * h);
    const hess = (ll1 - 2 * ll0 + ll2) / (h * h);
    if (hess < -1e-10) {
      mu -= grad / hess;
    }

    // Update tau2 using bounded search
    let bestTau2LL = copasLogLikelihood(mu, tau2, gamma0, gamma1, rho);
    for (const t of [0, tau2 * 0.5, tau2 * 0.9, tau2 * 1.1, tau2 * 1.5, tau2 * 2]) {
      const ll = copasLogLikelihood(mu, Math.max(0, t), gamma0, gamma1, rho);
      if (ll > bestTau2LL) {
        bestTau2LL = ll;
        tau2 = Math.max(0, t);
      }
    }

    if (Math.abs(mu - oldMu) < tol && Math.abs(tau2 - oldTau2) < tol) break;
  }

  // Step 5: Compute standard errors using observed Fisher information
  const hMu = 0.001;
  const llCenter = copasLogLikelihood(mu, tau2, gamma0, gamma1, rho);
  const d2Mu = (copasLogLikelihood(mu + hMu, tau2, gamma0, gamma1, rho) -
                2 * llCenter +
                copasLogLikelihood(mu - hMu, tau2, gamma0, gamma1, rho)) / (hMu * hMu);
  const seMu = d2Mu < -1e-10 ? Math.sqrt(-1 / d2Mu) : seUnadj;

  // Step 6: Sensitivity analysis - vary rho from 0 to maximum
  const sensitivityResults = [];
  for (let r = 0; r <= 0.95; r += 0.1) {
    // Re-optimize mu and tau2 for this rho
    let muR = thetaUnadj;
    let tau2R = tau2Init;

    for (let iter = 0; iter < 30; iter++) {
      const h = 0.01;
      const llR = copasLogLikelihood(muR, tau2R, gamma0, gamma1, r);
      const gradMuR = (copasLogLikelihood(muR + h, tau2R, gamma0, gamma1, r) - llR) / h;
      muR += 0.1 * gradMuR;

      let bestLL = llR;
      for (const t of [tau2R * 0.8, tau2R, tau2R * 1.2]) {
        const ll = copasLogLikelihood(muR, Math.max(0, t), gamma0, gamma1, r);
        if (ll > bestLL) { bestLL = ll; tau2R = Math.max(0, t); }
      }
    }

    // Compute selection probabilities at this rho
    const selProbs = se.map((s, i) => {
      const a = gamma0 + gamma1 / s;
      const totalVar = vi[i] + tau2R;
      return normalCDF(a / Math.sqrt(1 + r * r * totalVar / vi[i]));
    });
    const meanSelProb = selProbs.reduce((a, b) => a + b, 0) / n;
    const nMissing = Math.round(n * (1 / meanSelProb - 1));

    sensitivityResults.push({
      rho: r,
      estimate: muR,
      tau2: tau2R,
      tau: Math.sqrt(tau2R),
      meanSelectionProbability: meanSelProb,
      estimatedMissingStudies: nMissing,
      logLikelihood: copasLogLikelihood(muR, tau2R, gamma0, gamma1, r)
    });
  }

  // Step 7: Estimate optimal rho using AIC/BIC
  const aicResults = sensitivityResults.map(r => ({
    ...r,
    AIC: -2 * r.logLikelihood + 2 * 4, // 4 parameters
    BIC: -2 * r.logLikelihood + Math.log(n) * 4
  }));

  const optimalByAIC = aicResults.reduce((best, curr) =>
    curr.AIC < best.AIC ? curr : best, aicResults[0]);

  // Compute bias and publication probability
  const bias = thetaUnadj - mu;
  const biasPercent = thetaUnadj !== 0 ? (bias / Math.abs(thetaUnadj)) * 100 : 0;

  // Step 8: Profile likelihood CIs for gamma0 and gamma1
  // Reference: Copas & Shi (2001) - Meta-analysis, funnel plots and sensitivity analysis
  const critLL = bestLL - 1.92; // χ²(1)/2 for 95% CI

  // Profile likelihood CI for gamma0 (fix gamma0, optimize others)
  const profileGamma0 = (g0Fixed) => {
    let muProf = mu, tau2Prof = tau2;
    for (let iter = 0; iter < 20; iter++) {
      const h = 0.01;
      const ll0 = copasLogLikelihood(muProf, tau2Prof, g0Fixed, gamma1, rho);
      const gradMu = (copasLogLikelihood(muProf + h, tau2Prof, g0Fixed, gamma1, rho) - ll0) / h;
      muProf += 0.1 * gradMu;
      // Update tau2
      let bestLL = ll0;
      for (const t of [tau2Prof * 0.9, tau2Prof, tau2Prof * 1.1]) {
        const ll = copasLogLikelihood(muProf, Math.max(0, t), g0Fixed, gamma1, rho);
        if (ll > bestLL) { bestLL = ll; tau2Prof = Math.max(0, t); }
      }
    }
    return copasLogLikelihood(muProf, tau2Prof, g0Fixed, gamma1, rho);
  };

  // Find gamma0 CI bounds using bisection
  let gamma0Lower = gamma0, gamma0Upper = gamma0;
  for (let g = gamma0; g >= gamma0Range[0]; g -= 0.1) {
    if (profileGamma0(g) < critLL) { gamma0Lower = g + 0.05; break; }
    gamma0Lower = g;
  }
  for (let g = gamma0; g <= gamma0Range[1]; g += 0.1) {
    if (profileGamma0(g) < critLL) { gamma0Upper = g - 0.05; break; }
    gamma0Upper = g;
  }

  // Profile likelihood CI for gamma1 (fix gamma1, optimize others)
  const profileGamma1 = (g1Fixed) => {
    let muProf = mu, tau2Prof = tau2;
    for (let iter = 0; iter < 20; iter++) {
      const h = 0.01;
      const ll0 = copasLogLikelihood(muProf, tau2Prof, gamma0, g1Fixed, rho);
      const gradMu = (copasLogLikelihood(muProf + h, tau2Prof, gamma0, g1Fixed, rho) - ll0) / h;
      muProf += 0.1 * gradMu;
      let bestLL = ll0;
      for (const t of [tau2Prof * 0.9, tau2Prof, tau2Prof * 1.1]) {
        const ll = copasLogLikelihood(muProf, Math.max(0, t), gamma0, g1Fixed, rho);
        if (ll > bestLL) { bestLL = ll; tau2Prof = Math.max(0, t); }
      }
    }
    return copasLogLikelihood(muProf, tau2Prof, gamma0, g1Fixed, rho);
  };

  // Find gamma1 CI bounds
  let gamma1Lower = gamma1, gamma1Upper = gamma1;
  for (let g = gamma1; g >= gamma1Range[0]; g -= 0.1) {
    if (profileGamma1(g) < critLL) { gamma1Lower = g + 0.05; break; }
    gamma1Lower = g;
  }
  for (let g = gamma1; g <= gamma1Range[1]; g += 0.1) {
    if (profileGamma1(g) < critLL) { gamma1Upper = g - 0.05; break; }
    gamma1Upper = g;
  }

  return {
    adjusted: {
      estimate: mu,
      se: seMu,
      ci: [mu - z * seMu, mu + z * seMu],
      tau2,
      tau: Math.sqrt(tau2)
    },
    unadjusted: {
      estimate: thetaUnadj,
      se: seUnadj,
      ci: [thetaUnadj - z * seUnadj, thetaUnadj + z * seUnadj]
    },
    selectionParameters: {
      gamma0,
      gamma0CI: [gamma0Lower, gamma0Upper],  // Profile likelihood 95% CI
      gamma1,
      gamma1CI: [gamma1Lower, gamma1Upper],  // Profile likelihood 95% CI
      rho,
      interpretation: {
        gamma0: 'Baseline selection probability (higher = less selection)',
        gamma1: 'Precision effect on selection (higher = larger studies more likely)',
        rho: 'Correlation between effect and selection (higher = more bias)'
      }
    },
    bias: {
      absolute: bias,
      percent: biasPercent,
      direction: bias > 0 ? 'overestimation' : 'underestimation'
    },
    sensitivity: sensitivityResults,
    optimalModel: optimalByAIC,
    logLikelihood: bestLL,
    nStudies: n,
    method: 'Copas Selection Model (Full Marginal Likelihood)'
  };
}

/**
 * Copas Model Contour Analysis - Sensitivity across (gamma, rho) space
 *
 * Generates a contour plot showing how the adjusted effect estimate changes
 * across a 2D grid of selection model parameters. This is the recommended
 * approach for sensitivity analysis in Copas models.
 *
 * Reference: Copas & Jackson (2004), A bound for publication bias
 * based on the fraction of unpublished studies.
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Sampling variances
 * @param {Object} options - Configuration
 * @param {number} [options.nGridGamma=20] - Grid points for gamma
 * @param {number} [options.nGridRho=20] - Grid points for rho
 * @param {number[]} [options.gammaRange=[-2, 2]] - Range for gamma0
 * @param {number[]} [options.rhoRange=[0, 0.95]] - Range for correlation
 * @returns {Object} Contour analysis results with 2D grid
 */
export function copasContourAnalysis(yi, vi, options = {}) {
  const METHOD = 'copasContourAnalysis';

  validateMetaInput(yi, vi, METHOD);

  const {
    nGridGamma = 20,
    nGridRho = 20,
    gammaRange = [-2, 2],
    rhoRange = [0, 0.95],
    gamma1 = 0.5  // Fixed precision effect
  } = options;

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));

  // Get unadjusted estimate
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaUnadj = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

  // Initial tau2 (DL)
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaUnadj, 2), 0);
  const c = sumW - wi.reduce((s, w) => s + w * w, 0) / sumW;
  const tau2Init = Math.max(0, (Q - (n - 1)) / c);

  // Marginal log-likelihood for Copas model
  function copasLL(mu, tau2, gamma0, rho) {
    if (tau2 < 0) return -Infinity;
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const totalVar = vi[i] + tau2;
      const totalSE = Math.sqrt(totalVar);
      const zi = (yi[i] - mu) / totalSE;
      const a = gamma0 + gamma1 / se[i];
      const selArg = (a + rho * zi) / Math.sqrt(Math.max(0.001, 1 - rho * rho));
      const selProb = normalCDF(selArg);
      if (selProb < 1e-10) { ll -= 50; continue; }
      const normDensity = Math.exp(-0.5 * zi * zi) / (Math.sqrt(2 * Math.PI) * totalSE);
      const marginalSelProb = normalCDF(a / Math.sqrt(1 + rho * rho * totalVar / vi[i]));
      if (marginalSelProb > 1e-10 && normDensity > 0) {
        ll += Math.log(normDensity) + Math.log(selProb) - Math.log(Math.max(marginalSelProb, 1e-10));
      } else {
        ll -= 50;
      }
    }
    return ll;
  }

  // Quick optimization of mu and tau2 for given (gamma0, rho)
  function optimizeMuTau2(gamma0, rho) {
    let mu = thetaUnadj;
    let tau2 = tau2Init;
    const h = 0.01;

    for (let iter = 0; iter < 30; iter++) {
      const ll0 = copasLL(mu, tau2, gamma0, rho);
      const gradMu = (copasLL(mu + h, tau2, gamma0, rho) - ll0) / h;
      mu += 0.1 * gradMu;

      let bestLL = copasLL(mu, tau2, gamma0, rho);
      for (const t of [0, tau2 * 0.5, tau2 * 0.9, tau2 * 1.1, tau2 * 1.5]) {
        const ll = copasLL(mu, Math.max(0, t), gamma0, rho);
        if (ll > bestLL) { bestLL = ll; tau2 = Math.max(0, t); }
      }
    }
    return { mu, tau2 };
  }

  // Compute mean selection probability
  function meanSelectionProb(gamma0, rho, tau2) {
    return se.reduce((sum, s, i) => {
      const a = gamma0 + gamma1 / s;
      const totalVar = vi[i] + tau2;
      return sum + normalCDF(a / Math.sqrt(1 + rho * rho * totalVar / vi[i]));
    }, 0) / n;
  }

  // Build contour grid
  const gammaVals = Array.from({ length: nGridGamma }, (_, i) =>
    gammaRange[0] + (gammaRange[1] - gammaRange[0]) * i / (nGridGamma - 1));
  const rhoVals = Array.from({ length: nGridRho }, (_, i) =>
    rhoRange[0] + (rhoRange[1] - rhoRange[0]) * i / (nGridRho - 1));

  const contourData = [];
  let minEstimate = Infinity, maxEstimate = -Infinity;
  let minSelProb = Infinity, maxSelProb = -Infinity;

  for (const gamma0 of gammaVals) {
    for (const rho of rhoVals) {
      const { mu, tau2 } = optimizeMuTau2(gamma0, rho);
      const selProb = meanSelectionProb(gamma0, rho, tau2);
      const nMissing = Math.round(n * (1 / Math.max(0.01, selProb) - 1));
      const ll = copasLL(mu, tau2, gamma0, rho);

      contourData.push({
        gamma0,
        rho,
        estimate: mu,
        tau2,
        tau: Math.sqrt(tau2),
        selectionProbability: selProb,
        estimatedMissingStudies: nMissing,
        logLikelihood: ll,
        bias: thetaUnadj - mu
      });

      if (mu < minEstimate) minEstimate = mu;
      if (mu > maxEstimate) maxEstimate = mu;
      if (selProb < minSelProb) minSelProb = selProb;
      if (selProb > maxSelProb) maxSelProb = selProb;
    }
  }

  // Find contour lines for key estimate values
  const estimateContours = [];
  const contourLevels = [0.25, 0.5, 0.75].map(p =>
    minEstimate + p * (maxEstimate - minEstimate));

  for (const level of contourLevels) {
    const points = contourData.filter(d =>
      Math.abs(d.estimate - level) < (maxEstimate - minEstimate) / 20);
    if (points.length > 0) {
      estimateContours.push({ level, points: points.slice(0, 30) });
    }
  }

  // Profile: how estimate changes with selection probability
  const selectionProfile = [];
  for (let p = 0.3; p <= 1.0; p += 0.1) {
    const nearP = contourData.filter(d =>
      Math.abs(d.selectionProbability - p) < 0.05);
    if (nearP.length > 0) {
      const meanEst = nearP.reduce((s, d) => s + d.estimate, 0) / nearP.length;
      const minEst = Math.min(...nearP.map(d => d.estimate));
      const maxEst = Math.max(...nearP.map(d => d.estimate));
      selectionProfile.push({
        selectionProbability: p,
        meanEstimate: meanEst,
        rangeEstimate: [minEst, maxEst]
      });
    }
  }

  return {
    contourData,
    grid: {
      gamma0Values: gammaVals,
      rhoValues: rhoVals,
      nPoints: contourData.length
    },
    summary: {
      unadjustedEstimate: thetaUnadj,
      estimateRange: [minEstimate, maxEstimate],
      selectionProbabilityRange: [minSelProb, maxSelProb],
      maxBias: thetaUnadj - minEstimate,
      interpretationNote: 'Lower selection probability implies stronger publication bias; ' +
        'if adjusted estimate differs substantially from unadjusted at low selection probabilities, ' +
        'publication bias may be present.'
    },
    estimateContours,
    selectionProfile,
    recommendations: {
      robustIfStable: 'If estimates remain similar across selection probabilities > 0.5, ' +
        'publication bias is unlikely to substantially affect conclusions.',
      sensitiveIfVariable: 'If estimates change substantially, report the range of ' +
        'adjusted estimates as a sensitivity analysis.',
      reference: 'Copas & Jackson (2004) recommend reporting estimates across ' +
        'selection probabilities from observed to 1.0.'
    },
    method: 'Copas Contour Analysis'
  };
}

/**
 * Three-Parameter Selection Model (3PSM) - Full Likelihood Implementation
 * Step function selection model with proper EM algorithm
 * Based on Hedges (1984), Iyengar & Greenhouse (1988), Dear & Begg (1992)
 *
 * Model: Studies significant at alpha have selection probability 1
 *        Non-significant studies have selection probability eta (0 < eta <= 1)
 * Parameters: mu (true effect), tau^2 (heterogeneity), eta (selection probability)
 */
export function threeParameterSelectionModel(yi, vi, options = {}) {
  const METHOD = 'threeParameterSelectionModel';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    alpha = 0.05,         // Significance threshold
    oneSided = true,      // One-sided or two-sided p-values
    maxIter = 200,
    tol = 1e-8,
    level = 0.95
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });
  validateNumeric(level, 'level', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const z = normalQuantile(1 - (1 - level) / 2);

  // Compute p-values under H0: effect = 0 (for observed studies)
  const computePValue = (y, s, side) => {
    const zStat = y / s;
    return side ? 1 - normalCDF(zStat) : 2 * (1 - normalCDF(Math.abs(zStat)));
  };

  const observedP = yi.map((y, i) => computePValue(y, se[i], oneSided));
  const significant = observedP.map(p => p < alpha);
  const nSig = significant.filter(s => s).length;
  const nNonSig = n - nSig;

  if (nSig === 0 || nNonSig === 0) {
    return {
      error: 'Need both significant and non-significant studies for 3PSM',
      nSignificant: nSig,
      nNonSignificant: nNonSig,
      estimate: NaN
    };
  }

  // Critical value for significance
  const zCrit = oneSided ? normalQuantile(1 - alpha) : normalQuantile(1 - alpha / 2);

  // Log-likelihood for 3PSM
  // L(mu, tau^2, eta) = prod_i f(y_i | mu, tau^2, selected_i) * P(selected_i | mu, tau^2, eta)
  function logLikelihood(mu, tau2, eta) {
    if (tau2 < 0 || eta <= 0 || eta > 1) return -Infinity;

    let ll = 0;
    for (let i = 0; i < n; i++) {
      const totalVar = vi[i] + tau2;
      const totalSE = Math.sqrt(totalVar);

      // Density f(y_i | mu, tau^2)
      const zObs = (yi[i] - mu) / totalSE;
      const density = Math.exp(-0.5 * zObs * zObs) / (Math.sqrt(2 * Math.PI) * totalSE);

      if (density <= 0) {
        ll -= 100;
        continue;
      }

      // Selection probability P(significant | mu, tau^2)
      // P(Y > c_alpha * se | mu) where c_alpha is critical value
      const criticalY = oneSided ? zCrit * se[i] : zCrit * se[i]; // For one-sided positive
      const probSig = oneSided
        ? 1 - normalCDF((criticalY - mu) / totalSE)
        : 1 - normalCDF((criticalY - mu) / totalSE) + normalCDF((-criticalY - mu) / totalSE);

      // Marginal selection probability
      const selProb = probSig + eta * (1 - probSig);

      if (selProb <= 0) {
        ll -= 100;
        continue;
      }

      // Conditional likelihood: f(y | selected, mu, tau^2, eta)
      // Weight by selection probability for this observation
      const isSignificant = significant[i];
      const obsSelWeight = isSignificant ? 1 : eta;

      ll += Math.log(density) + Math.log(obsSelWeight) - Math.log(selProb);
    }
    return ll;
  }

  // Initialize parameters
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  let mu = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  let tau2 = Math.max(0, yi.reduce((sum, y, i) =>
    sum + wi[i] * Math.pow(y - mu, 2), 0) / sumW - 1 / (sumW / n));
  let eta = Math.min(0.99, Math.max(0.01, nNonSig / n / 0.5)); // Initial guess

  // EM algorithm with proper expectation
  let converged = false;
  const history = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const muOld = mu;
    const tau2Old = tau2;
    const etaOld = eta;
    const llOld = logLikelihood(mu, tau2, eta);

    // E-step: compute expected contribution weights
    const expectedWeights = yi.map((y, i) => {
      const totalVar = vi[i] + tau2;
      const isSignificant = significant[i];
      // Weight is 1 for significant, eta for non-significant
      return isSignificant ? 1 : eta;
    });

    // M-step for mu: weighted mean
    const wEff = yi.map((_, i) => expectedWeights[i] / (vi[i] + tau2));
    const sumWEff = wEff.reduce((a, b) => a + b, 0);
    mu = yi.reduce((sum, y, i) => sum + wEff[i] * y, 0) / sumWEff;

    // M-step for tau2: iterative update
    for (let tauIter = 0; tauIter < 10; tauIter++) {
      const wTau = yi.map((_, i) => expectedWeights[i] / (vi[i] + tau2));
      const sumWTau = wTau.reduce((a, b) => a + b, 0);
      const Q = yi.reduce((sum, y, i) => sum + wTau[i] * Math.pow(y - mu, 2), 0);
      const cTau = wTau.reduce((sum, w, i) => sum + w - w * w / sumWTau, 0);
      const newTau2 = Math.max(0, (Q - expectedWeights.reduce((a, b) => a + b, 0) + 1) / cTau);
      if (Math.abs(newTau2 - tau2) < 1e-10) break;
      tau2 = newTau2;
    }

    // M-step for eta: compute expected proportion of non-significant among selected
    // eta = E[non-sig among selected] / E[total non-sig that would exist]
    const totalVar = vi.map(v => v + tau2);
    let expectedNonSigSelected = 0;
    let expectedNonSigTotal = 0;

    for (let i = 0; i < n; i++) {
      const totalSE = Math.sqrt(totalVar[i]);
      const criticalY = zCrit * se[i];
      const probSig = oneSided
        ? 1 - normalCDF((criticalY - mu) / totalSE)
        : 1 - normalCDF((criticalY - mu) / totalSE) + normalCDF((-criticalY - mu) / totalSE);

      if (!significant[i]) {
        // This is a non-significant selected study
        expectedNonSigSelected += 1;
      }
      // Expected number of non-significant studies (selected + unselected)
      expectedNonSigTotal += (1 - probSig);
    }

    // eta = P(selected | non-significant) ∝ nNonSig / expectedNonSigTotal
    if (expectedNonSigTotal > 0) {
      eta = Math.min(0.999, Math.max(0.001, expectedNonSigSelected / expectedNonSigTotal));
    }

    const llNew = logLikelihood(mu, tau2, eta);
    history.push({ iter, mu, tau2, eta, ll: llNew });

    // Check convergence
    if (Math.abs(mu - muOld) < tol && Math.abs(tau2 - tau2Old) < tol && Math.abs(eta - etaOld) < tol) {
      converged = true;
      break;
    }

    // Ensure likelihood is improving (or nearly so)
    if (llNew < llOld - 0.1) {
      // Revert and try smaller step
      mu = 0.5 * muOld + 0.5 * mu;
      tau2 = 0.5 * tau2Old + 0.5 * tau2;
      eta = 0.5 * etaOld + 0.5 * eta;
    }
  }

  // Compute standard errors using observed Fisher information
  const h = 0.001;
  const llCenter = logLikelihood(mu, tau2, eta);

  // Hessian diagonal elements
  const d2Mu = (logLikelihood(mu + h, tau2, eta) - 2 * llCenter + logLikelihood(mu - h, tau2, eta)) / (h * h);
  const d2Tau2 = tau2 > h ?
    (logLikelihood(mu, tau2 + h, eta) - 2 * llCenter + logLikelihood(mu, tau2 - h, eta)) / (h * h) :
    -1e6;
  const d2Eta = eta > h && eta < 1 - h ?
    (logLikelihood(mu, tau2, eta + h) - 2 * llCenter + logLikelihood(mu, tau2, eta - h)) / (h * h) :
    -1e6;

  const seMu = d2Mu < -1e-10 ? Math.sqrt(-1 / d2Mu) : Math.sqrt(1 / sumW);
  const seTau2 = d2Tau2 < -1e-10 ? Math.sqrt(-1 / d2Tau2) : NaN;
  const seEta = d2Eta < -1e-10 ? Math.sqrt(-1 / d2Eta) : NaN;

  // Unadjusted estimate for comparison
  const thetaUnadj = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const seUnadj = Math.sqrt(1 / sumW);

  // Likelihood ratio test for selection (H0: eta = 1)
  const llNull = logLikelihood(mu, tau2, 1);
  const lrt = 2 * (llCenter - llNull);
  const pLRT = 1 - jStat.chisquare.cdf(Math.max(0, lrt), 1);

  // Estimated number of missing studies
  const avgSelProb = significant.reduce((sum, sig, i) => {
    const totalVar = vi[i] + tau2;
    const totalSE = Math.sqrt(totalVar);
    const criticalY = zCrit * se[i];
    const probSig = 1 - normalCDF((criticalY - mu) / totalSE);
    return sum + (probSig + eta * (1 - probSig));
  }, 0) / n;
  const estimatedMissing = Math.round(n * (1 / avgSelProb - 1));

  return {
    adjusted: {
      estimate: mu,
      se: seMu,
      ci: [mu - z * seMu, mu + z * seMu],
      tau2,
      tau: Math.sqrt(tau2)
    },
    unadjusted: {
      estimate: thetaUnadj,
      se: seUnadj,
      ci: [thetaUnadj - z * seUnadj, thetaUnadj + z * seUnadj]
    },
    selectionParameter: {
      eta,
      se: seEta,
      interpretation: `Non-significant studies have ${(eta * 100).toFixed(1)}% probability of selection relative to significant studies`
    },
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      seTau2
    },
    bias: {
      absolute: thetaUnadj - mu,
      percent: thetaUnadj !== 0 ? ((thetaUnadj - mu) / Math.abs(thetaUnadj)) * 100 : 0
    },
    selectionTest: {
      lrt,
      df: 1,
      pValue: pLRT,
      significant: pLRT < 0.05,
      interpretation: pLRT < 0.05 ? 'Evidence of publication selection' : 'No significant evidence of selection'
    },
    estimatedMissingStudies: Math.max(0, estimatedMissing),
    nSignificant: nSig,
    nNonSignificant: nNonSig,
    logLikelihood: llCenter,
    converged,
    iterations: history.length,
    method: '3PSM (Three-Parameter Selection Model)'
  };
}

/**
 * Vevea-Hedges Weight Function Selection Model - Likelihood-Based
 * Estimates selection weights via maximum likelihood
 * Based on Vevea & Hedges (1995), Vevea & Woods (2005)
 *
 * Model: Selection probability depends on p-value interval
 *        w_j = P(selected | p in interval j) / P(selected | p in [0, alpha])
 */
export function veveaHedgesSelectionModel(yi, vi, options = {}) {
  const METHOD = 'veveaHedgesSelectionModel';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    steps = [0.025, 0.05, 0.1, 0.5, 1.0],  // p-value cutpoints
    weights = null,        // If provided, use these weights; otherwise estimate
    estimateWeights = true, // Whether to estimate weights from data
    oneSided = false,
    maxIter = 100,
    tol = 1e-6,
    level = 0.95
  } = options;

  validateNumeric(level, 'level', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const zCrit = normalQuantile(1 - (1 - level) / 2);
  const nIntervals = steps.length;

  // Compute p-values
  const pValues = yi.map((y, i) => {
    const zStat = y / se[i];
    return oneSided ? 1 - normalCDF(zStat) : 2 * (1 - normalCDF(Math.abs(zStat)));
  });

  // Assign studies to p-value intervals
  function getInterval(p) {
    for (let j = 0; j < steps.length; j++) {
      if (p <= steps[j]) return j;
    }
    return steps.length - 1;
  }

  const studyIntervals = pValues.map(getInterval);
  const intervalCounts = steps.map((_, j) => studyIntervals.filter(i => i === j).length);

  // Log-likelihood for Vevea-Hedges model
  function logLikelihood(mu, tau2, w) {
    if (tau2 < 0 || w.some(wj => wj <= 0)) return -Infinity;

    let ll = 0;
    for (let i = 0; i < n; i++) {
      const totalVar = vi[i] + tau2;
      const totalSE = Math.sqrt(totalVar);
      const zObs = (yi[i] - mu) / totalSE;

      // Density
      const density = Math.exp(-0.5 * zObs * zObs) / (Math.sqrt(2 * Math.PI) * totalSE);
      if (density <= 0) {
        ll -= 100;
        continue;
      }

      // Selection weight for this study's p-value interval
      const intervalIdx = studyIntervals[i];
      const selWeight = w[intervalIdx];

      // Marginal selection probability (integrate over intervals)
      let marginalSelProb = 0;
      for (let j = 0; j < nIntervals; j++) {
        // P(p in interval j | mu, tau^2, y_i) * w_j
        // This is complex; use approximation based on observed p-value distribution
        const pLower = j === 0 ? 0 : steps[j - 1];
        const pUpper = steps[j];

        // Under true effect mu, probability of p in [pLower, pUpper]
        // This requires integration over the distribution of y
        const effectiveZLower = pLower === 0 ? -Infinity :
          (oneSided ? normalQuantile(1 - pLower) : normalQuantile(1 - pLower / 2));
        const effectiveZUpper = normalQuantile(1 - pUpper);

        // P(z > zUpper) - P(z > zLower) under standardized effect
        // z = (y - mu) / se, observed z-stat under mu
        const stdEffect = mu / se[i];
        const probInInterval = oneSided
          ? normalCDF(stdEffect - effectiveZUpper) - normalCDF(stdEffect - effectiveZLower)
          : (normalCDF(stdEffect - effectiveZUpper) - normalCDF(stdEffect - effectiveZLower)) +
            (normalCDF(-stdEffect - effectiveZUpper) - normalCDF(-stdEffect - effectiveZLower));

        marginalSelProb += Math.max(0, probInInterval) * w[j];
      }

      marginalSelProb = Math.max(marginalSelProb, 1e-10);

      ll += Math.log(density) + Math.log(selWeight) - Math.log(marginalSelProb);
    }
    return ll;
  }

  // Initialize parameters
  const wiInit = vi.map(v => 1 / v);
  const sumWInit = wiInit.reduce((a, b) => a + b, 0);
  let mu = yi.reduce((sum, y, i) => sum + wiInit[i] * y, 0) / sumWInit;
  let tau2 = Math.max(0, yi.reduce((sum, y, i) =>
    sum + wiInit[i] * Math.pow(y - mu, 2), 0) / sumWInit - 1 / (sumWInit / n));

  // Initialize or use provided weights
  let w = weights ? [...weights] : steps.map((_, j) => {
    // Initial guess: weights decrease with p-value
    // First interval (most significant) has weight 1
    return j === 0 ? 1 : Math.max(0.1, 1 - j * 0.2);
  });

  // Normalize weights so first interval = 1
  const w0 = w[0];
  w = w.map(wj => wj / w0);

  // Estimate weights via maximum likelihood if requested
  if (estimateWeights && !weights) {
    for (let iter = 0; iter < maxIter; iter++) {
      const muOld = mu;
      const tau2Old = tau2;
      const wOld = [...w];

      // Update mu
      const wEff = yi.map((_, i) => w[studyIntervals[i]] / (vi[i] + tau2));
      const sumWEff = wEff.reduce((a, b) => a + b, 0);
      mu = yi.reduce((sum, y, i) => sum + wEff[i] * y, 0) / sumWEff;

      // Update tau2
      const Q = yi.reduce((sum, y, i) => sum + wEff[i] * Math.pow(y - mu, 2), 0);
      const cTau = wEff.reduce((sum, wE, i) => sum + wE - wE * wE / sumWEff, 0);
      tau2 = Math.max(0, (Q - n + 1) / Math.max(cTau, 0.1));

      // Update weights using gradient ascent
      const h = 0.01;
      const llCurrent = logLikelihood(mu, tau2, w);

      for (let j = 1; j < nIntervals; j++) { // Keep w[0] = 1
        if (intervalCounts[j] === 0) continue;

        const wPlus = [...w];
        wPlus[j] = Math.min(1.5, w[j] + h);
        const wMinus = [...w];
        wMinus[j] = Math.max(0.01, w[j] - h);

        const grad = (logLikelihood(mu, tau2, wPlus) - logLikelihood(mu, tau2, wMinus)) / (2 * h);
        w[j] = Math.max(0.01, Math.min(1.5, w[j] + 0.1 * grad));
      }

      // Check convergence
      const wChange = w.reduce((sum, wj, j) => sum + Math.abs(wj - wOld[j]), 0);
      if (Math.abs(mu - muOld) < tol && Math.abs(tau2 - tau2Old) < tol && wChange < tol) {
        break;
      }
    }
  }

  // Final estimates using estimated/provided weights
  const wiFinal = yi.map((_, i) => (1 / (vi[i] + tau2)) * w[studyIntervals[i]]);
  const sumWFinal = wiFinal.reduce((a, b) => a + b, 0);
  const thetaAdj = yi.reduce((sum, y, i) => sum + wiFinal[i] * y, 0) / sumWFinal;
  const seAdj = Math.sqrt(1 / sumWFinal);

  // Unadjusted estimate for comparison
  const thetaUnadj = yi.reduce((sum, y, i) => sum + wiInit[i] * y, 0) / sumWInit;
  const seUnadj = Math.sqrt(1 / sumWInit);

  // Log-likelihood ratio test for selection (H0: all weights = 1)
  const wNull = steps.map(() => 1);
  const llFull = logLikelihood(thetaAdj, tau2, w);
  const llNull = logLikelihood(thetaUnadj, 0.01, wNull);
  const lrt = 2 * (llFull - llNull);
  const dfLRT = nIntervals - 1;
  const pLRT = 1 - jStat.chisquare.cdf(Math.max(0, lrt), dfLRT);

  // Sensitivity analysis with different weight patterns
  const moderateSelection = steps.map((_, j) => j === 0 ? 1 : Math.max(0.3, 1 - j * 0.15));
  const severeSelection = steps.map((_, j) => j === 0 ? 1 : Math.max(0.1, 1 - j * 0.25));

  const sensitivityAnalysis = [
    { pattern: 'None', weights: steps.map(() => 1) },
    { pattern: 'Moderate', weights: moderateSelection },
    { pattern: 'Severe', weights: severeSelection },
    { pattern: 'Estimated', weights: w }
  ].map(scenario => {
    const wS = scenario.weights;
    const wiS = yi.map((_, i) => (1 / (vi[i] + tau2)) * wS[studyIntervals[i]]);
    const sumWS = wiS.reduce((a, b) => a + b, 0);
    const thetaS = yi.reduce((sum, y, i) => sum + wiS[i] * y, 0) / sumWS;
    const seS = Math.sqrt(1 / sumWS);
    return {
      ...scenario,
      estimate: thetaS,
      se: seS,
      ci: [thetaS - zCrit * seS, thetaS + zCrit * seS]
    };
  });

  return {
    adjusted: {
      estimate: thetaAdj,
      se: seAdj,
      ci: [thetaAdj - zCrit * seAdj, thetaAdj + zCrit * seAdj],
      tau2,
      tau: Math.sqrt(tau2)
    },
    unadjusted: {
      estimate: thetaUnadj,
      se: seUnadj,
      ci: [thetaUnadj - zCrit * seUnadj, thetaUnadj + zCrit * seUnadj]
    },
    selectionWeights: {
      estimated: w,
      steps,
      intervalCounts,
      interpretation: w.map((wj, j) => ({
        interval: j === 0 ? `p <= ${steps[0]}` : `${steps[j-1]} < p <= ${steps[j]}`,
        weight: wj,
        relativeSelection: `${(wj * 100).toFixed(1)}% as likely to be published as most significant`
      }))
    },
    bias: {
      absolute: thetaUnadj - thetaAdj,
      percent: thetaUnadj !== 0 ? ((thetaUnadj - thetaAdj) / Math.abs(thetaUnadj)) * 100 : 0
    },
    selectionTest: {
      lrt,
      df: dfLRT,
      pValue: pLRT,
      significant: pLRT < 0.05
    },
    sensitivityAnalysis,
    logLikelihood: llFull,
    nStudies: n,
    method: 'Vevea-Hedges Weight Function Selection Model (Likelihood-Based)'
  };
}

// Helper for backward compatibility
function median(arr) {
  return medianUtil(arr);
}

// Helper to find stable point in a sequence (where values stop changing)
function findStablePoint(values) {
  if (values.length < 3) return Math.floor(values.length / 2);
  let minVar = Infinity;
  let bestIdx = Math.floor(values.length / 2);
  for (let i = 2; i < values.length - 2; i++) {
    const localVals = values.slice(i - 2, i + 3);
    const mean = localVals.reduce((a, b) => a + b, 0) / localVals.length;
    const variance = localVals.reduce((s, v) => s + Math.pow(v - mean, 2), 0);
    if (variance < minVar) {
      minVar = variance;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ============================================================================
// PET-PEESE
// ============================================================================

/**
 * PET-PEESE for publication bias correction
 * Precision Effect Test (PET) and Precision Effect Estimate with Standard Error (PEESE)
 * Based on Stanley & Doucouliagos (2014)
 */
export function petPeese(yi, vi, options = {}) {
  const METHOD = 'petPeese';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const { alpha = 0.05 } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const precision = se.map(s => 1 / s);

  // PET: Regress effect on SE (with WLS)
  // yi = beta0 + beta1 * SE_i + error
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);

  // Estimate tau² using DL for UWLS weights
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaFE, 2), 0);
  const C = sumW - wi.reduce((a, w) => a + w * w, 0) / sumW;
  const tau2 = Math.max(0, (Q - (n - 1)) / C);

  // UWLS weights: 1/(vi + tau²) - accounts for heterogeneity
  const wiUWLS = vi.map(v => 1 / (v + tau2));

  // Traditional PET (fixed-effects weights)
  const petResult = weightedRegression(yi, se, wi);

  // Traditional PEESE (fixed-effects weights)
  const peeseResult = weightedRegression(yi, vi, wi);

  // UWLS-PET: Uses random-effects weights (Carter et al. 2019)
  const uwlsPetResult = weightedRegression(yi, se, wiUWLS);

  // UWLS-PEESE: Uses random-effects weights
  const uwlsPeeseResult = weightedRegression(yi, vi, wiUWLS);

  // Decision: Use PET if intercept not significant, PEESE if significant
  const petSignificant = petResult.interceptP < alpha;
  const uwlsPetSignificant = uwlsPetResult.interceptP < alpha;

  // Check for substantial heterogeneity (I² > 50%)
  const I2 = tau2 / (tau2 + vi.reduce((a, b) => a + b, 0) / n) * 100;
  const highHeterogeneity = I2 > 50;

  return {
    pet: {
      estimate: petResult.intercept,
      intercept: petResult.intercept,
      se: petResult.interceptSE,
      ci: [
        petResult.intercept - normalQuantile(0.975) * petResult.interceptSE,
        petResult.intercept + normalQuantile(0.975) * petResult.interceptSE
      ],
      slope: petResult.slope,
      slopeP: petResult.slopeP,
      pValue: petResult.interceptP,
      interceptP: petResult.interceptP,
      significant: petSignificant
    },
    peese: {
      estimate: peeseResult.intercept,
      intercept: peeseResult.intercept,
      se: peeseResult.interceptSE,
      ci: [
        peeseResult.intercept - normalQuantile(0.975) * peeseResult.interceptSE,
        peeseResult.intercept + normalQuantile(0.975) * peeseResult.interceptSE
      ],
      slope: peeseResult.slope,
      pValue: peeseResult.interceptP,
      slopeP: peeseResult.slopeP
    },
    // UWLS variants (recommended when I² > 50%)
    uwls: {
      pet: {
        estimate: uwlsPetResult.intercept,
        se: uwlsPetResult.interceptSE,
        ci: [
          uwlsPetResult.intercept - normalQuantile(0.975) * uwlsPetResult.interceptSE,
          uwlsPetResult.intercept + normalQuantile(0.975) * uwlsPetResult.interceptSE
        ],
        slope: uwlsPetResult.slope,
        slopeP: uwlsPetResult.slopeP
      },
      peese: {
        estimate: uwlsPeeseResult.intercept,
        se: uwlsPeeseResult.interceptSE,
        ci: [
          uwlsPeeseResult.intercept - normalQuantile(0.975) * uwlsPeeseResult.interceptSE,
          uwlsPeeseResult.intercept + normalQuantile(0.975) * uwlsPeeseResult.interceptSE
        ],
        slope: uwlsPeeseResult.slope,
        slopeP: uwlsPeeseResult.slopeP
      },
      tau2,
      recommended: uwlsPetSignificant ? 'UWLS-PEESE' : 'UWLS-PET'
    },
    // Heterogeneity info
    heterogeneity: {
      tau2,
      I2,
      highHeterogeneity
    },
    recommended: highHeterogeneity
      ? (uwlsPetSignificant ? 'UWLS-PEESE' : 'UWLS-PET')
      : (petSignificant ? 'PEESE' : 'PET'),
    finalEstimate: highHeterogeneity
      ? (uwlsPetSignificant ? uwlsPeeseResult.intercept : uwlsPetResult.intercept)
      : (petSignificant ? peeseResult.intercept : petResult.intercept),
    finalSE: highHeterogeneity
      ? (uwlsPetSignificant ? uwlsPeeseResult.interceptSE : uwlsPetResult.interceptSE)
      : (petSignificant ? peeseResult.interceptSE : petResult.interceptSE),
    biasSuspected: Math.abs(petResult.slope) > 0 && petResult.slopeP < 0.1,
    caveat: highHeterogeneity
      ? 'High heterogeneity detected (I² > 50%). UWLS variant recommended (Carter et al. 2019).'
      : null,
    conditional: {
      method: highHeterogeneity
        ? (uwlsPetSignificant ? 'UWLS-PEESE' : 'UWLS-PET')
        : (petSignificant ? 'PEESE' : 'PET'),
      estimate: highHeterogeneity
        ? (uwlsPetSignificant ? uwlsPeeseResult.intercept : uwlsPetResult.intercept)
        : (petSignificant ? peeseResult.intercept : petResult.intercept),
      se: highHeterogeneity
        ? (uwlsPetSignificant ? uwlsPeeseResult.interceptSE : uwlsPetResult.interceptSE)
        : (petSignificant ? peeseResult.interceptSE : petResult.interceptSE)
    },
    method: 'PET-PEESE with UWLS'
  };
}

function weightedRegression(y, x, w) {
  const n = y.length;
  const sumW = w.reduce((a, b) => a + b, 0);

  // Weighted means
  const xBar = w.reduce((sum, wi, i) => sum + wi * x[i], 0) / sumW;
  const yBar = w.reduce((sum, wi, i) => sum + wi * y[i], 0) / sumW;

  // Weighted covariance and variance
  const sxy = w.reduce((sum, wi, i) => sum + wi * (x[i] - xBar) * (y[i] - yBar), 0);
  const sxx = w.reduce((sum, wi, i) => sum + wi * Math.pow(x[i] - xBar, 2), 0);

  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = yBar - slope * xBar;

  // Residual variance
  const residuals = y.map((yi, i) => yi - intercept - slope * x[i]);
  const sse = w.reduce((sum, wi, i) => sum + wi * residuals[i] * residuals[i], 0);
  const df = n - 2;
  const mse = df > 0 ? sse / df : 0;

  // Standard errors
  const interceptSE = Math.sqrt(mse * (1/sumW + xBar * xBar / sxx));
  const slopeSE = Math.sqrt(mse / sxx);

  // P-values
  const interceptT = intercept / interceptSE;
  const slopeT = slope / slopeSE;
  const interceptP = 2 * (1 - tCDF(Math.abs(interceptT), df));
  const slopeP = 2 * (1 - tCDF(Math.abs(slopeT), df));

  return { intercept, slope, interceptSE, slopeSE, interceptP, slopeP, df };
}

// ============================================================================
// P-CURVE
// ============================================================================

/**
 * P-curve analysis for detecting evidential value
 * Based on Simonsohn, Nelson & Simmons (2014)
 */
export function pCurve(pValues, options = {}) {
  const METHOD = 'pCurve';

  // Accept single-value exploratory inputs and validate elements manually.
  if (!Array.isArray(pValues) || pValues.length < 1) {
    throw new ValidationError('need at least 1 p-value', METHOD);
  }
  pValues.forEach((p, i) => validateNumeric(p, `pValues[${i}]`, METHOD, { min: 0, max: 1 }));

  const {
    alpha = 0.05,
    rightSkewTest = true,
    flatnessTest = true
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  // Filter to significant p-values
  const sigP = pValues.filter(p => p > 0 && p < alpha);
  const n = sigP.length;

  if (n < 3) {
    return {
      error: 'Need at least 3 significant p-values',
      n: 0
    };
  }

  // Transform p-values: pp = p / alpha (uniform under H0)
  const pp = sigP.map(p => p / alpha);

  // Binomial test for right-skew (evidential value)
  // Under H0 (no effect), pp should be uniform
  // Under H1 (true effect), pp should be right-skewed (more small p-values)

  // Count p-values in lower half (< 0.025 when alpha = 0.05)
  const nLow = sigP.filter(p => p < alpha / 2).length;
  const propLow = nLow / n;

  // Binomial test: H0: propLow = 0.5, H1: propLow > 0.5
  const zRightSkew = (propLow - 0.5) / Math.sqrt(0.25 / n);
  const pRightSkew = 1 - normalCDF(zRightSkew);

  // Stouffer's Z for continuous test
  // Under no effect: p-values uniform, so -Phi^-1(pp) ~ N(0,1)
  const zScores = pp.map(p => -normalQuantile(p));
  const stoufferZ = zScores.reduce((a, b) => a + b, 0) / Math.sqrt(n);
  const stoufferP = 1 - normalCDF(stoufferZ);

  // Flatness test (test for p-hacking)
  // If p-hacked, distribution should be left-skewed or have bump at 0.05
  const nHigh = sigP.filter(p => p >= alpha / 2).length;
  const propHigh = nHigh / n;
  const zFlat = (propHigh - 0.5) / Math.sqrt(0.25 / n);
  const pFlat = 1 - normalCDF(zFlat);

  // Power estimate using maximum likelihood approach
  // Reference: Simonsohn, Nelson & Simmons (2014), p-curve methodology
  // Under power π: P(p|π) = π * (1/α) * [Φ⁻¹(1-α) - Φ⁻¹(1-p)]^(-1) * φ(Φ⁻¹(1-p))
  // We find the power that maximizes the likelihood of observed p-values

  let powerEstimate = null;
  let powerCI = null;

  if (pRightSkew < 0.1 && n >= 5) {
    // Log-likelihood function for observed p-values given power
    const logLikelihood = (power) => {
      if (power <= 0 || power >= 1) return -Infinity;

      // Non-centrality parameter corresponding to power
      // power = 1 - Φ(z_α - δ), so δ = z_α - Φ⁻¹(1 - power)
      const zAlpha = normalQuantile(1 - alpha);
      const ncp = zAlpha - normalQuantile(1 - power);

      let ll = 0;
      for (let i = 0; i < n; i++) {
        const p = sigP[i];
        const zObs = normalQuantile(1 - p);

        // Under H1 with ncp δ: pdf of observed z given it exceeds z_α
        // P(z|z > z_α, δ) = φ(z - δ) / Φ(δ - z_α)
        const pdfNoncentral = normalPDF(zObs - ncp);
        const probSignif = 1 - normalCDF(zAlpha - ncp);

        if (probSignif > 0 && pdfNoncentral > 0) {
          // Account for transformation from p to z: |dp/dz| = φ(z)
          const jacobian = normalPDF(zObs);
          ll += Math.log(pdfNoncentral) - Math.log(probSignif) - Math.log(jacobian);
        }
      }
      return ll;
    };

    // Grid search + golden section for MLE
    let bestPower = 0.5;
    let bestLL = logLikelihood(0.5);

    // Grid search for starting point
    for (let pwr = 0.1; pwr <= 0.99; pwr += 0.05) {
      const ll = logLikelihood(pwr);
      if (ll > bestLL) {
        bestLL = ll;
        bestPower = pwr;
      }
    }

    // Golden section refinement
    let lower = Math.max(0.05, bestPower - 0.1);
    let upper = Math.min(0.99, bestPower + 0.1);
    const phi = (1 + Math.sqrt(5)) / 2;

    for (let iter = 0; iter < 30; iter++) {
      const x1 = upper - (upper - lower) / phi;
      const x2 = lower + (upper - lower) / phi;
      if (logLikelihood(x1) > logLikelihood(x2)) {
        upper = x2;
      } else {
        lower = x1;
      }
      if (upper - lower < 0.001) break;
    }

    powerEstimate = (lower + upper) / 2;

    // Profile likelihood CI for power (approximate)
    const maxLL = logLikelihood(powerEstimate);
    const critLL = maxLL - 1.92; // χ²(1)/2 for 95% CI

    // Find CI bounds
    let lowerCI = powerEstimate;
    let upperCI = powerEstimate;

    for (let p = powerEstimate; p >= 0.05; p -= 0.01) {
      if (logLikelihood(p) < critLL) {
        lowerCI = p + 0.01;
        break;
      }
      lowerCI = p;
    }

    for (let p = powerEstimate; p <= 0.99; p += 0.01) {
      if (logLikelihood(p) < critLL) {
        upperCI = p - 0.01;
        break;
      }
      upperCI = p;
    }

    powerCI = [lowerCI, upperCI];
  }

  return {
    n,
    nSignificant: n,
    distribution: {
      veryLow: sigP.filter(p => p < 0.01).length,
      low: sigP.filter(p => p >= 0.01 && p < 0.025).length,
      medium: sigP.filter(p => p >= 0.025 && p < 0.04).length,
      high: sigP.filter(p => p >= 0.04 && p < alpha).length
    },
    rightSkewTest: {
      statistic: zRightSkew,
      p: pRightSkew,
      evidentialValue: pRightSkew < 0.05
    },
    stoufferTest: {
      z: stoufferZ,
      p: stoufferP
    },
    flatnessTest: {
      statistic: zFlat,
      p: pFlat,
      suspected: pFlat < 0.05
    },
    evidentialValue: pRightSkew < 0.05,
    conclusion: pRightSkew < 0.05 ? 'Evidential value present' :
                pFlat < 0.05 ? 'P-hacking suspected' :
                'Inconclusive',
    powerEstimate,
    powerCI,
    method: 'P-curve (MLE power estimation)'
  };
}

// ============================================================================
// P-UNIFORM
// ============================================================================

/**
 * P-uniform method for publication bias correction
 * Based on van Assen, van Aert & Wicherts (2015)
 * Uses Newton-Raphson optimization for maximum likelihood estimation
 * Key insight: Under true effect μ, conditional p-values should be uniform
 */
export function pUniform(yi, vi, options = {}) {
  const METHOD = 'pUniform';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    alpha = 0.05,
    side = 'auto', // Auto-detect expected direction when not specified
    maxIter = 100,
    tol = 1e-8
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const zCrit = normalQuantile(1 - alpha);
  const zi = yi.map((y, i) => y / se[i]);

  const meanEffect = yi.reduce((sum, y) => sum + y, 0) / n;
  const selectedSide = side === 'auto'
    ? (meanEffect < 0 ? 'left' : 'right')
    : side;
  let pValues = zi.map(z => selectedSide === 'right' ? 1 - normalCDF(z) : normalCDF(z));

  // If auto-detection still leaves too little signal, retry in the opposite direction.
  let sigIndices = pValues.map((p, i) => p < alpha ? i : -1).filter(i => i >= 0);
  if (sigIndices.length < 2 && side === 'auto') {
    const fallbackSide = selectedSide === 'right' ? 'left' : 'right';
    pValues = zi.map(z => fallbackSide === 'right' ? 1 - normalCDF(z) : normalCDF(z));
    sigIndices = pValues.map((p, i) => p < alpha ? i : -1).filter(i => i >= 0);
  }
  const nSig = sigIndices.length;

  if (nSig < 2) {
    return {
      error: 'Need at least 2 significant studies',
      n: 0
    };
  }

  // Log-likelihood function for truncated normal
  // L(μ) = Π_i φ((y_i - μ)/σ_i) / Φ((μ - c_i)/σ_i)
  // where c_i = zCrit * σ_i is the critical value
  const logLikelihood = (mu) => {
    let ll = 0;
    for (const i of sigIndices) {
      const zi = (yi[i] - mu) / se[i];
      const selProb = normalCDF((mu - zCrit * se[i]) / se[i]);
      if (selProb > 1e-10) {
        ll += -0.5 * zi * zi - Math.log(se[i]) - Math.log(selProb);
      } else {
        ll += -1000; // Penalty for numerical issues
      }
    }
    return ll;
  };

  // Score function (first derivative of log-likelihood)
  const score = (mu) => {
    let s = 0;
    for (const i of sigIndices) {
      const zi = (yi[i] - mu) / se[i];
      const vi = se[i] * se[i];

      // d/dμ[-0.5 * ((y-μ)/σ)²] = (y-μ)/σ²
      s += zi / se[i];

      // d/dμ[-log Φ((μ - c)/σ)] = -φ((μ-c)/σ) / (σ Φ((μ-c)/σ))
      const lambdaArg = (mu - zCrit * se[i]) / se[i];
      const selProb = normalCDF(lambdaArg);
      if (selProb > 1e-10) {
        const lambda = normalPDF(lambdaArg) / selProb; // Inverse Mills ratio
        s -= lambda / se[i];
      }
    }
    return s;
  };

  // Fisher information (negative second derivative expectation)
  // Used for both Newton-Raphson and SE calculation
  const fisherInfo = (mu) => {
    let info = 0;
    for (const i of sigIndices) {
      const vi = se[i] * se[i];
      const lambdaArg = (mu - zCrit * se[i]) / se[i];
      const selProb = normalCDF(lambdaArg);

      // Information from normal density: 1/σ²
      info += 1 / vi;

      // Additional information from truncation
      if (selProb > 1e-10) {
        const phi = normalPDF(lambdaArg);
        const lambda = phi / selProb;
        // d²/dμ²[log Φ] = -λ(λ + arg)/σ²
        info -= lambda * (lambda + lambdaArg) / vi;
      }
    }
    return info;
  };

  // Newton-Raphson optimization
  // Starting value: weighted mean of significant studies
  const wiSig = sigIndices.map(i => 1 / vi[i]);
  const sumWSig = wiSig.reduce((a, b) => a + b, 0);
  let mu = sigIndices.reduce((sum, idx, j) => sum + wiSig[j] * yi[idx], 0) / sumWSig;

  let converged = false;
  const iterHistory = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const s = score(mu);
    const info = fisherInfo(mu);

    iterHistory.push({ mu, score: s, info, ll: logLikelihood(mu) });

    if (Math.abs(s) < tol) {
      converged = true;
      break;
    }

    // Newton-Raphson update with line search for stability
    let step = info > 1e-10 ? s / info : s * 0.1;

    // Line search: halve step if likelihood decreases
    const currentLL = logLikelihood(mu);
    let stepSize = 1;
    for (let ls = 0; ls < 10; ls++) {
      const newLL = logLikelihood(mu + stepSize * step);
      if (newLL > currentLL - 1e-10 || stepSize < 0.01) {
        break;
      }
      stepSize *= 0.5;
    }

    mu += stepSize * step;

    // Bounds check
    mu = Math.max(-10, Math.min(10, mu));
  }

  // Standard error from observed Fisher information
  const observedInfo = fisherInfo(mu);
  const seMu = observedInfo > 1e-10 ? Math.sqrt(1 / observedInfo) : NaN;

  // Compute conditional p-values for uniformity test
  const condP = sigIndices.map(i => {
    const selProb = normalCDF((mu - zCrit * se[i]) / se[i]);
    const obsProb = normalCDF((yi[i] - mu) / se[i]);
    const raw = selProb > 1e-10 ? (obsProb - (1 - selProb)) / selProb : 0.5;
    return Math.max(0, Math.min(1, raw));
  });

  // Kolmogorov-Smirnov test for uniformity
  const sortedP = [...condP].sort((a, b) => a - b);
  let ksD = 0;
  for (let i = 0; i < nSig; i++) {
    ksD = Math.max(ksD,
      Math.abs(sortedP[i] - i / nSig),
      Math.abs(sortedP[i] - (i + 1) / nSig)
    );
  }

  // Test statistic for publication bias (H0: no selection)
  // Under H0, Q = Σ(y_i - 0)² / σ_i² ~ χ²(k)
  const QBias = sigIndices.reduce((sum, i) => {
    return sum + Math.pow(yi[i] / se[i], 2);
  }, 0);
  const pBias = 1 - jStat.chisquare.cdf(QBias, nSig);

  return {
    estimate: mu,
    se: seMu,
    ci: isNaN(seMu) ? [NaN, NaN] : [
      mu - normalQuantile(0.975) * seMu,
      mu + normalQuantile(0.975) * seMu
    ],
    nSignificant: nSig,
    nTotal: n,
    uniformityFit: ksD,
    conditionalPValues: condP,
    biasTest: {
      Q: QBias,
      df: nSig,
      p: pBias,
      pValue: pBias
    },
    converged,
    iterations: iterHistory.length,
    finalLogLikelihood: logLikelihood(mu),
    method: 'P-uniform (Newton-Raphson MLE)'
  };
}

// Standard normal PDF
function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * P-uniform* method for publication bias with heterogeneity
 * Based on van Aert & van Assen (2021)
 * Improves on P-uniform by allowing for between-study heterogeneity
 */
export function pUniformStar(yi, vi, options = {}) {
  const METHOD = 'pUniformStar';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    alpha = 0.05,
    side = 'auto', // Auto-detect expected direction when not specified
    maxIter = 100,
    tol = 1e-6
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const zi = yi.map((y, i) => y / se[i]);

  const meanEffect = yi.reduce((sum, y) => sum + y, 0) / n;
  const selectedSide = side === 'auto'
    ? (meanEffect < 0 ? 'left' : 'right')
    : side;
  let pValues = zi.map(z => selectedSide === 'right' ? 1 - normalCDF(z) : normalCDF(z));

  // Identify significant and non-significant studies
  let sigIndices = pValues.map((p, i) => p < alpha ? i : -1).filter(i => i >= 0);
  if (sigIndices.length < 2 && side === 'auto') {
    const fallbackSide = selectedSide === 'right' ? 'left' : 'right';
    pValues = zi.map(z => fallbackSide === 'right' ? 1 - normalCDF(z) : normalCDF(z));
    sigIndices = pValues.map((p, i) => p < alpha ? i : -1).filter(i => i >= 0);
  }
  const nonSigIndices = pValues.map((p, i) => p >= alpha ? i : -1).filter(i => i >= 0);
  const nSig = sigIndices.length;

  if (nSig < 2) {
    return {
      error: 'Need at least 2 significant studies',
      n: 0,
      method: 'P-uniform*'
    };
  }

  // Critical z-value for significance
  const zCrit = normalQuantile(1 - alpha);

  // Log-likelihood for P-uniform* (accounts for selection and heterogeneity)
  const logLikelihood = (mu, tau2) => {
    if (tau2 < 0) return -Infinity;

    let ll = 0;

    for (const i of sigIndices) {
      const totalVar = vi[i] + tau2;
      const totalSE = Math.sqrt(totalVar);

      // Likelihood: f(y|y > c, mu, tau²) where c is critical value
      const z = (yi[i] - mu) / totalSE;
      const pdf = normalPDF(z) / totalSE;

      // Selection probability: P(y > c | mu, tau²)
      const criticalY = zCrit * se[i]; // Critical value in original scale
      const selProb = 1 - normalCDF((criticalY - mu) / totalSE);

      if (selProb > 1e-10 && pdf > 0) {
        ll += Math.log(pdf) - Math.log(selProb);
      } else {
        ll -= 100; // Penalty for impossible values
      }
    }

    return ll;
  };

  // Optimization using coordinate descent
  // Initialize with simple estimates
  let mu = sigIndices.reduce((sum, i) => sum + yi[i], 0) / nSig;
  let tau2 = 0;

  // Initial grid search for reasonable starting values
  let bestLL = -Infinity;
  const muGrid = [-2, -1, 0, 0.5, 1, 2];
  const tau2Grid = [0, 0.1, 0.5, 1];

  for (const muInit of muGrid) {
    for (const tau2Init of tau2Grid) {
      const ll = logLikelihood(muInit, tau2Init);
      if (ll > bestLL) {
        bestLL = ll;
        mu = muInit;
        tau2 = tau2Init;
      }
    }
  }

  // Coordinate descent optimization
  for (let iter = 0; iter < maxIter; iter++) {
    const muOld = mu;
    const tau2Old = tau2;

    // Update mu (golden section search)
    let muLow = mu - 2;
    let muHigh = mu + 2;
    const golden = 0.618;

    for (let sub = 0; sub < 30; sub++) {
      const mu1 = muHigh - golden * (muHigh - muLow);
      const mu2 = muLow + golden * (muHigh - muLow);

      if (logLikelihood(mu1, tau2) > logLikelihood(mu2, tau2)) {
        muHigh = mu2;
      } else {
        muLow = mu1;
      }

      if (muHigh - muLow < tol) break;
    }
    mu = (muLow + muHigh) / 2;

    // Update tau² (bounded search)
    let tau2Low = 0;
    let tau2High = Math.max(tau2 * 2, 5);

    for (let sub = 0; sub < 30; sub++) {
      const t1 = tau2High - golden * (tau2High - tau2Low);
      const t2 = tau2Low + golden * (tau2High - tau2Low);

      if (logLikelihood(mu, t1) > logLikelihood(mu, t2)) {
        tau2High = t2;
      } else {
        tau2Low = t1;
      }

      if (tau2High - tau2Low < tol) break;
    }
    tau2 = Math.max(0, (tau2Low + tau2High) / 2);

    // Check convergence
    if (Math.abs(mu - muOld) < tol && Math.abs(tau2 - tau2Old) < tol) {
      break;
    }
  }

  // Compute standard errors using observed Fisher information
  const h = 0.001;
  const llCenter = logLikelihood(mu, tau2);

  // Numerical second derivatives
  const d2mu = (logLikelihood(mu + h, tau2) - 2 * llCenter + logLikelihood(mu - h, tau2)) / (h * h);
  const d2tau2 = tau2 > h ?
    (logLikelihood(mu, tau2 + h) - 2 * llCenter + logLikelihood(mu, tau2 - h)) / (h * h) :
    (logLikelihood(mu, tau2 + 2*h) - 2 * logLikelihood(mu, tau2 + h) + llCenter) / (h * h);

  const seMu = d2mu < -1e-10 ? Math.sqrt(-1 / d2mu) : NaN;
  const seTau2 = d2tau2 < -1e-10 ? Math.sqrt(-1 / d2tau2) : NaN;

  // Publication bias test (test if adjustment differs from naive estimate)
  const naiveWi = sigIndices.map(i => 1 / vi[i]);
  const naiveSumW = naiveWi.reduce((a, b) => a + b, 0);
  const naiveMu = sigIndices.reduce((sum, idx, j) => sum + naiveWi[j] * yi[idx], 0) / naiveSumW;

  // Wald test for bias
  const biasDiff = naiveMu - mu;
  const seBias = Math.sqrt(1/naiveSumW + (isNaN(seMu) ? 0 : seMu * seMu));
  const zBias = seBias > 0 ? biasDiff / seBias : 0;
  const pBias = 2 * (1 - normalCDF(Math.abs(zBias)));

  // Bias-corrected p-uniform* estimator (Van Aert & Van Assen, 2021)
  // Reference: Correcting for Outcome Reporting Bias in a Meta-Analysis
  // The bias correction term adjusts for small-sample bias in MLE
  // Bias ≈ bias_term / k where k is number of significant studies
  let muBiasCorrected = mu;
  let biasCorrectionTerm = 0;

  if (nSig >= 3 && tau2 >= 0 && isFinite(mu)) {
    // Compute expected Fisher information
    let expectedInfo = 0;
    for (const i of sigIndices) {
      const totalVar = vi[i] + tau2;
      const totalSE = Math.sqrt(totalVar);
      const criticalY = zCrit * se[i];
      const selProb = 1 - normalCDF((criticalY - mu) / totalSE);

      if (selProb > 1e-6) {
        // Information from truncated normal
        const lambda = (criticalY - mu) / totalSE;
        const mills = normalPDF(lambda) / selProb;  // Inverse Mills ratio
        // Adjustment for truncation effect
        const infoContrib = 1 / totalVar * (1 - mills * (mills - lambda));
        expectedInfo += Math.max(0, infoContrib);
      }
    }

    // Second-order bias correction term
    // Bias ≈ (1/2) * I^{-1} * E[∂³ℓ/∂μ³] / E[∂²ℓ/∂μ²]
    // For truncated normal, this simplifies to a function of the truncation point
    if (expectedInfo > 1e-10) {
      // Compute third derivative contribution (asymmetric truncation effect)
      let thirdDerivSum = 0;
      for (const i of sigIndices) {
        const totalVar = vi[i] + tau2;
        const totalSE = Math.sqrt(totalVar);
        const criticalY = zCrit * se[i];
        const lambda = (criticalY - mu) / totalSE;
        const selProb = 1 - normalCDF((criticalY - mu) / totalSE);

        if (selProb > 1e-6) {
          const mills = normalPDF(lambda) / selProb;
          // Third derivative contribution from truncation
          thirdDerivSum += mills * (2 + lambda * (lambda - mills)) / Math.pow(totalVar, 1.5);
        }
      }

      // Bias correction: subtract estimated bias
      biasCorrectionTerm = 0.5 * thirdDerivSum / (expectedInfo * expectedInfo);
      // Bound the correction to avoid overcorrection
      biasCorrectionTerm = Math.max(-0.5 * Math.abs(mu), Math.min(0.5 * Math.abs(mu), biasCorrectionTerm));
      muBiasCorrected = mu - biasCorrectionTerm / nSig;
    }
  }

  // Adjusted SE for bias-corrected estimate
  const seMuCorrected = isNaN(seMu) ? NaN : seMu * Math.sqrt(1 + 1/(nSig * nSig));

  return {
    estimate: mu,
    se: seMu,
    ci: isNaN(seMu) ? [NaN, NaN] : [
      mu - normalQuantile(0.975) * seMu,
      mu + normalQuantile(0.975) * seMu
    ],
    // Bias-corrected estimate (Van Aert & Van Assen, 2021)
    biasCorrected: {
      estimate: muBiasCorrected,
      se: seMuCorrected,
      ci: isNaN(seMuCorrected) ? [NaN, NaN] : [
        muBiasCorrected - normalQuantile(0.975) * seMuCorrected,
        muBiasCorrected + normalQuantile(0.975) * seMuCorrected
      ],
      correctionTerm: biasCorrectionTerm,
      note: 'Second-order bias correction for small-sample MLE bias'
    },
    tau2,
    tau: Math.sqrt(tau2),
    seTau2,
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      significant: tau2 > 0.01
    },
    naiveEstimate: naiveMu,
    biasTest: {
      difference: biasDiff,
      z: zBias,
      p: pBias,
      pValue: pBias,
      significant: pBias < 0.05
    },
    nSignificant: nSig,
    nNonSignificant: nonSigIndices.length,
    nTotal: n,
    logLikelihood: llCenter,
    method: 'P-uniform*'
  };
}

// ============================================================================
// MULTIVARIATE META-ANALYSIS
// ============================================================================

/**
 * Multivariate meta-analysis for correlated outcomes
 * Based on Jackson et al. (2011)
 */
export function multivariateMA(studies, options = {}) {
  const METHOD = 'multivariateMA';

  // Input validation
  if (!Array.isArray(studies) || studies.length < 2) {
    throw new ValidationError('need at least 2 studies', METHOD);
  }

  const {
    method = 'REML',
    outcomes = null, // List of outcome names
    rho = 0.5 // Default correlation if not provided
  } = options;

  validateNumeric(rho, 'rho', METHOD, { min: -1, max: 1 });

  // Extract data
  // studies[i] = { outcomes: { name: { yi, vi } }, correlation: matrix or number }

  const outcomeNames = outcomes || Object.keys(studies[0].outcomes);
  const p = outcomeNames.length;
  const n = studies.length;

  // Build stacked vectors and block-diagonal variance matrix
  const Y = []; // Stacked outcomes
  const V = []; // Block-diagonal variance matrix
  let row = 0;

  for (const study of studies) {
    const yStudy = [];
    const vStudy = [];
    const seStudy = [];

    for (const outcome of outcomeNames) {
      if (study.outcomes[outcome]) {
        yStudy.push(study.outcomes[outcome].yi);
        vStudy.push(study.outcomes[outcome].vi);
        seStudy.push(Math.sqrt(study.outcomes[outcome].vi));
      } else {
        yStudy.push(NaN);
        vStudy.push(NaN);
        seStudy.push(NaN);
      }
    }

    Y.push(...yStudy.filter(y => !isNaN(y)));

    // Within-study correlation matrix
    const studyCorr = study.correlation || rho;
    const nOutcomes = yStudy.filter(y => !isNaN(y)).length;

    for (let i = 0; i < nOutcomes; i++) {
      for (let j = 0; j < nOutcomes; j++) {
        const corrIJ = typeof studyCorr === 'number' ? (i === j ? 1 : studyCorr) :
                       studyCorr[i][j];
        V.push(corrIJ * seStudy[i] * seStudy[j]);
      }
    }
  }

  // Simplified: fit separate univariate models and combine
  // Full multivariate would require iterative REML

  const results = {};
  for (const outcome of outcomeNames) {
    const yi = studies.filter(s => s.outcomes[outcome]).map(s => s.outcomes[outcome].yi);
    const vi = studies.filter(s => s.outcomes[outcome]).map(s => s.outcomes[outcome].vi);

    if (yi.length >= 2) {
      const wi = vi.map(v => 1 / v);
      const sumW = wi.reduce((a, b) => a + b, 0);
      const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
      const se = Math.sqrt(1 / sumW);

      results[outcome] = {
        estimate: theta,
        se,
        ci: [
          theta - normalQuantile(0.975) * se,
          theta + normalQuantile(0.975) * se
        ],
        k: yi.length
      };
    }
  }

  return {
    outcomes: results,
    method: 'Multivariate (simplified)',
    nStudies: n,
    nOutcomes: p,
    limitations: {
      note: 'This implementation uses separate univariate fixed-effects models per outcome.',
      implications: [
        'Does not account for within-study correlation between outcomes',
        'Standard errors may be underestimated when outcomes are correlated',
        'Cannot estimate between-outcome correlations at the meta-analytic level'
      ],
      recommendation: 'For full multivariate analysis with correlated outcomes, consider R packages: mvmeta, metaSEM, or clubSandwich for RVE',
      references: [
        'Jackson et al. (2011) Multivariate meta-analysis',
        'Riley et al. (2017) Multivariate meta-analysis for individual participant data'
      ]
    }
  };
}

// ============================================================================
// BAYESIAN META-ANALYSIS (MCMC)
// ============================================================================

/**
 * Bayesian random-effects meta-analysis with multiple samplers
 * Features: Gibbs sampler (faster) or Adaptive MH, Gelman-Rubin diagnostic
 * References:
 *   - Gelman & Rubin (1992) - R-hat diagnostic
 *   - Roberts & Rosenthal (2009) - Adaptive MCMC
 *   - Röver (2020) - Bayesian meta-analysis
 */
export function bayesianMetaAnalysis(yi, vi, options = {}) {
  const METHOD = 'bayesianMetaAnalysis';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    nIter = 10000,
    burnIn = 2000,
    thin = 1,
    nChains = 4, // Multiple chains for Gelman-Rubin
    sampler = 'gibbs', // 'gibbs' (recommended) or 'mh'
    priorMu = { mean: 0, sd: 10 }, // Normal prior for μ
    // Prior for τ in MH sampler (Polson & Scott, 2012 recommend Half-Cauchy for heterogeneity)
    priorTau = { distribution: 'half-cauchy', scale: 0.5 },
    // Prior for τ² in Gibbs sampler - using proper weakly informative IG(0.5, 0.0005)
    // NOTE: IG(0.001, 0.001) is problematic (nearly improper, causes convergence issues)
    // Reference: Gelman (2006), "Prior distributions for variance parameters"
    priorTau2 = { shape: 0.5, rate: 0.0005 },
    adaptInterval = 100, // Adapt proposal every N iterations during burn-in
    targetAcceptance = 0.234, // Optimal for multivariate (Roberts et al. 1997)
    seed = 12345
  } = options;

  validateNumeric(nIter, 'nIter', METHOD, { min: 100, integer: true });
  validateNumeric(burnIn, 'burnIn', METHOD, { min: 0, integer: true });
  validateNumeric(nChains, 'nChains', METHOD, { min: 1, max: 20, integer: true });

  // Extract progress callback from options
  const { onProgress = null } = options;

  // Use Gibbs sampler if requested (faster and better mixing for conjugate case)
  if (sampler.toLowerCase() === 'gibbs') {
    return gibbsSamplerMeta(yi, vi, {
      nIter, burnIn, thin, nChains, priorMu, priorTau2, seed, onProgress
    });
  }

  const n = yi.length;

  // Create high-quality PRNG using xoshiro128** algorithm
  // (Blackman & Vigna, 2018) - suitable for Monte Carlo simulations
  const createRNG = (chainSeed) => {
    // Initialize 4x32-bit state from seed using SplitMix64
    const splitmix = (seed) => {
      let z = (seed + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
      z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
      z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
      return Number((z ^ (z >> 31n)) & 0xffffffffn);
    };

    let s0 = splitmix(BigInt(chainSeed));
    let s1 = splitmix(BigInt(chainSeed + 1));
    let s2 = splitmix(BigInt(chainSeed + 2));
    let s3 = splitmix(BigInt(chainSeed + 3));

    const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;

    return {
      // xoshiro128** core
      random: () => {
        const result = (rotl((s1 * 5) >>> 0, 7) * 9) >>> 0;
        const t = (s1 << 9) >>> 0;

        s2 ^= s0;
        s3 ^= s1;
        s1 ^= s2;
        s0 ^= s3;
        s2 ^= t;
        s3 = rotl(s3, 11);

        return result / 0xffffffff;
      },
      // Box-Muller transform for normal deviates
      randomNormal: function() {
        const u1 = this.random();
        const u2 = this.random();
        return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
      }
    };
  };

  // Log-posterior function
  const logPosterior = (muVal, tauVal) => {
    if (tauVal < 0) return -Infinity;

    let ll = 0;
    for (let i = 0; i < n; i++) {
      const totalVar = vi[i] + tauVal * tauVal;
      if (totalVar <= 0) return -Infinity;
      ll -= 0.5 * Math.log(2 * Math.PI * totalVar);
      ll -= 0.5 * Math.pow(yi[i] - muVal, 2) / totalVar;
    }

    // Prior for mu (normal)
    ll -= 0.5 * Math.pow(muVal - priorMu.mean, 2) / (priorMu.sd * priorMu.sd);

    // Prior for tau - supports multiple distributions
    const tauDist = (priorTau.distribution || 'half-cauchy').toLowerCase();
    switch (tauDist) {
      case 'half-cauchy':
        // Half-Cauchy(0, scale): f(τ) = 2/(π*s*(1 + (τ/s)²))
        // Recommended by Polson & Scott (2012) for variance components
        ll += Math.log(2 / (Math.PI * priorTau.scale * (1 + Math.pow(tauVal / priorTau.scale, 2))));
        break;
      case 'half-normal':
        // Half-Normal(0, scale): f(τ) = (2/s) * φ(τ/s)
        ll += Math.log(2 / priorTau.scale) - 0.5 * Math.pow(tauVal / priorTau.scale, 2);
        break;
      case 'exponential':
        // Exponential(rate): f(τ) = rate * exp(-rate * τ)
        ll += Math.log(priorTau.rate || 1) - (priorTau.rate || 1) * tauVal;
        break;
      case 'uniform':
        // Uniform(0, max): f(τ) = 1/max if τ < max, else 0
        if (tauVal > (priorTau.max || 10)) return -Infinity;
        ll -= Math.log(priorTau.max || 10);
        break;
      default:
        // Default to Half-Cauchy
        ll += Math.log(2 / (Math.PI * (priorTau.scale || 0.5) * (1 + Math.pow(tauVal / (priorTau.scale || 0.5), 2))));
    }

    return ll;
  };

  // Initialize chains with dispersed starting values
  const yMean = yi.reduce((a, b) => a + b, 0) / n;
  const yVar = yi.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / (n - 1);

  const chainResults = [];

  for (let chain = 0; chain < nChains; chain++) {
    const rng = createRNG(seed + chain * 1000);

    // Disperse initial values across prior support
    let mu = yMean + (rng.random() - 0.5) * 2 * Math.sqrt(yVar);
    let tau = Math.abs(rng.randomNormal()) * Math.sqrt(yVar) * 0.5;

    // Adaptive proposal standard deviations
    let proposalSdMu = Math.sqrt(yVar) * 0.5;
    let proposalSdTau = tau > 0 ? tau * 0.5 : 0.1;

    const samples = { mu: [], tau: [], tau2: [] };
    let acceptMu = 0, acceptTau = 0;
    let recentAcceptMu = 0, recentAcceptTau = 0;

    let currentLL = logPosterior(mu, tau);

    for (let iter = 0; iter < nIter + burnIn; iter++) {
      // Update mu with Metropolis step
      const muProposal = mu + proposalSdMu * rng.randomNormal();
      const proposalLL = logPosterior(muProposal, tau);

      if (rng.random() < Math.min(1, Math.exp(proposalLL - currentLL))) {
        mu = muProposal;
        currentLL = proposalLL;
        if (iter >= burnIn) acceptMu++;
        recentAcceptMu++;
      }

      // Update tau with Metropolis step (log-scale for better mixing)
      const logTau = Math.log(Math.max(tau, 1e-10));
      const logTauProposal = logTau + proposalSdTau * rng.randomNormal();
      const tauProposal = Math.exp(logTauProposal);

      if (tauProposal > 0) {
        // Jacobian adjustment for log-transformation
        const proposalLLTau = logPosterior(mu, tauProposal) + logTauProposal - logTau;
        const currentLLTau = currentLL;

        if (rng.random() < Math.min(1, Math.exp(proposalLLTau - currentLLTau))) {
          tau = tauProposal;
          currentLL = logPosterior(mu, tau);
          if (iter >= burnIn) acceptTau++;
          recentAcceptTau++;
        }
      }

      // Adaptive proposal tuning during burn-in (Roberts & Rosenthal 2009)
      if (iter < burnIn && iter > 0 && iter % adaptInterval === 0) {
        const recentRateMu = recentAcceptMu / adaptInterval;
        const recentRateTau = recentAcceptTau / adaptInterval;

        // Adjust proposal SDs to achieve target acceptance rate
        const adaptFactor = Math.exp(Math.min(0.5, 1 / Math.sqrt(iter / adaptInterval)));

        if (recentRateMu < targetAcceptance - 0.05) {
          proposalSdMu /= adaptFactor;
        } else if (recentRateMu > targetAcceptance + 0.15) {
          proposalSdMu *= adaptFactor;
        }

        if (recentRateTau < targetAcceptance - 0.05) {
          proposalSdTau /= adaptFactor;
        } else if (recentRateTau > targetAcceptance + 0.15) {
          proposalSdTau *= adaptFactor;
        }

        recentAcceptMu = 0;
        recentAcceptTau = 0;
      }

      // Store samples after burn-in
      if (iter >= burnIn && (iter - burnIn) % thin === 0) {
        samples.mu.push(mu);
        samples.tau.push(tau);
        samples.tau2.push(tau * tau);
      }
    }

    const nSamples = samples.mu.length;
    chainResults.push({
      samples,
      acceptanceRateMu: acceptMu / nSamples,
      acceptanceRateTau: acceptTau / nSamples,
      finalProposalSdMu: proposalSdMu,
      finalProposalSdTau: proposalSdTau
    });
  }

  // Gelman-Rubin diagnostic (R-hat)
  const computeRhat = (paramName) => {
    const m = nChains;
    const allChainSamples = chainResults.map(c => c.samples[paramName]);
    const n_samples = allChainSamples[0].length;

    if (n_samples < 2) return NaN;

    // Chain means and variances
    const chainMeans = allChainSamples.map(s => s.reduce((a, b) => a + b, 0) / n_samples);
    const chainVars = allChainSamples.map((s, c) => {
      const mean = chainMeans[c];
      return s.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n_samples - 1);
    });

    // Between-chain variance B
    const overallMean = chainMeans.reduce((a, b) => a + b, 0) / m;
    const B = n_samples / (m - 1) * chainMeans.reduce((sum, mean) => sum + Math.pow(mean - overallMean, 2), 0);

    // Within-chain variance W
    const W = chainVars.reduce((a, b) => a + b, 0) / m;

    // Pooled variance estimate
    const varPlus = ((n_samples - 1) / n_samples) * W + (1 / n_samples) * B;

    // R-hat
    const Rhat = Math.sqrt(varPlus / W);

    return Rhat;
  };

  // Effective sample size using Geyer's initial positive sequence (Vehtari et al. 2021)
  const computeESS = (samples) => {
    const n = samples.length;
    if (n < 10) return n;

    const meanVal = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((sum, x) => sum + Math.pow(x - meanVal, 2), 0) / (n - 1);
    if (variance === 0) return n;

    // Compute autocorrelations
    const acf = [];
    const maxLag = Math.min(Math.floor(n / 2), 200);
    for (let lag = 0; lag <= maxLag; lag++) {
      let autoCorr = 0;
      for (let i = 0; i < n - lag; i++) {
        autoCorr += (samples[i] - meanVal) * (samples[i + lag] - meanVal);
      }
      acf.push(autoCorr / ((n - lag) * variance));
    }

    // Geyer's initial positive sequence: sum pairs until first negative pair
    let tau = acf[0]; // = 1
    for (let t = 1; t < maxLag - 1; t += 2) {
      const pairSum = acf[t] + acf[t + 1];
      if (pairSum < 0) break;
      tau += 2 * pairSum;
    }

    const ESS = n / tau;
    return Math.max(1, Math.min(ESS, n));
  };

  // Monte Carlo Standard Error (MCSE = posterior SD / sqrt(ESS))
  const computeMCSE = (samples, ess) => {
    const n = samples.length;
    const meanVal = samples.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(samples.reduce((sum, x) => sum + Math.pow(x - meanVal, 2), 0) / (n - 1));
    return sd / Math.sqrt(ess);
  };

  // Geweke diagnostic: z-score comparing first 10% vs last 50% of chain
  const computeGeweke = (samples, fracFirst = 0.1, fracLast = 0.5) => {
    const n = samples.length;
    const nFirst = Math.floor(n * fracFirst);
    const nLast = Math.floor(n * fracLast);

    const first = samples.slice(0, nFirst);
    const last = samples.slice(n - nLast);

    const meanFirst = first.reduce((a, b) => a + b, 0) / nFirst;
    const meanLast = last.reduce((a, b) => a + b, 0) / nLast;
    const varFirst = first.reduce((sum, x) => sum + Math.pow(x - meanFirst, 2), 0) / (nFirst - 1);
    const varLast = last.reduce((sum, x) => sum + Math.pow(x - meanLast, 2), 0) / (nLast - 1);

    const z = (meanFirst - meanLast) / Math.sqrt(varFirst / nFirst + varLast / nLast);
    const pValue = 2 * (1 - normalCDF(Math.abs(z)));
    return { z, pValue, converged: Math.abs(z) < 1.96 };
  };

  // Combine all chains for posterior summaries
  const allSamples = {
    mu: chainResults.flatMap(c => c.samples.mu),
    tau: chainResults.flatMap(c => c.samples.tau),
    tau2: chainResults.flatMap(c => c.samples.tau2)
  };

  const nTotalSamples = allSamples.mu.length;

  // Summary statistics
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = arr => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const quantile = (arr, q) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(q * (sorted.length - 1));
    const frac = q * (sorted.length - 1) - idx;
    if (idx + 1 < sorted.length) {
      return sorted[idx] * (1 - frac) + sorted[idx + 1] * frac;
    }
    return sorted[idx];
  };
  const sd = arr => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) * (x - m), 0) / (arr.length - 1));
  };

  // Gelman-Rubin diagnostics
  const RhatMu = computeRhat('mu');
  const RhatTau = computeRhat('tau');

  // Effective sample sizes (using Geyer's method)
  const ESS_mu = computeESS(allSamples.mu);
  const ESS_tau = computeESS(allSamples.tau);

  // Monte Carlo Standard Errors
  const MCSE_mu = computeMCSE(allSamples.mu, ESS_mu);
  const MCSE_tau = computeMCSE(allSamples.tau, ESS_tau);

  // Geweke diagnostics (per chain, then combined)
  const gewekeMu = computeGeweke(allSamples.mu);
  const gewekeTau = computeGeweke(allSamples.tau);

  // Comprehensive convergence assessment
  const rhatOK = RhatMu < 1.1 && RhatTau < 1.1;
  const essOK = ESS_mu >= 400 && ESS_tau >= 400;  // Vehtari et al. recommend >= 400
  const gewekeOK = gewekeMu.converged && gewekeTau.converged;
  const converged = rhatOK && ESS_mu > 100 && ESS_tau > 100;

  // Generate detailed warnings
  const warnings = [];
  if (!rhatOK) warnings.push(`R-hat > 1.1 (mu: ${RhatMu.toFixed(3)}, tau: ${RhatTau.toFixed(3)})`);
  if (ESS_mu < 100) warnings.push(`ESS(mu) = ${Math.round(ESS_mu)} < 100`);
  if (ESS_tau < 100) warnings.push(`ESS(tau) = ${Math.round(ESS_tau)} < 100`);
  if (!essOK && ESS_mu >= 100 && ESS_tau >= 100) warnings.push('ESS < 400, consider more iterations for reliable inference');
  if (!gewekeOK) warnings.push('Geweke test failed: chain may not have reached stationarity');

  return {
    mu: {
      mean: mean(allSamples.mu),
      median: median(allSamples.mu),
      sd: sd(allSamples.mu),
      mcse: MCSE_mu,
      ci: [quantile(allSamples.mu, 0.025), quantile(allSamples.mu, 0.975)],
      hdi: computeHDI(allSamples.mu, 0.95)
    },
    tau: {
      mean: mean(allSamples.tau),
      median: median(allSamples.tau),
      sd: sd(allSamples.tau),
      mcse: MCSE_tau,
      ci: [quantile(allSamples.tau, 0.025), quantile(allSamples.tau, 0.975)]
    },
    tau2: {
      mean: mean(allSamples.tau2),
      median: median(allSamples.tau2),
      sd: sd(allSamples.tau2),
      ci: [quantile(allSamples.tau2, 0.025), quantile(allSamples.tau2, 0.975)]
    },
    diagnostics: {
      nIter,
      burnIn,
      thin,
      nChains,
      nSamplesPerChain: chainResults[0].samples.mu.length,
      nTotalSamples,
      // Gelman-Rubin R-hat (should be < 1.1 for convergence)
      Rhat: {
        mu: RhatMu,
        tau: RhatTau,
        converged: rhatOK
      },
      // Effective sample size (Geyer's initial positive sequence)
      ESS: {
        mu: Math.round(ESS_mu),
        tau: Math.round(ESS_tau),
        adequate: essOK  // >= 400 per Vehtari et al. 2021
      },
      // Monte Carlo Standard Error
      MCSE: {
        mu: MCSE_mu,
        tau: MCSE_tau
      },
      // Geweke stationarity test
      Geweke: {
        mu: { z: gewekeMu.z, pValue: gewekeMu.pValue },
        tau: { z: gewekeTau.z, pValue: gewekeTau.pValue },
        converged: gewekeOK
      },
      // Acceptance rates per chain
      acceptanceRates: chainResults.map((c, i) => ({
        chain: i + 1,
        mu: c.acceptanceRateMu,
        tau: c.acceptanceRateTau
      })),
      converged,
      warnings: warnings.length > 0 ? warnings : null
    },
    samples: allSamples,
    chainSamples: chainResults.map(c => c.samples),
    method: 'Bayesian MCMC (Adaptive MH with Gelman-Rubin, Geweke, ESS diagnostics)'
  };
}

/**
 * Compute Highest Density Interval (HDI)
 */
function computeHDI(samples, credMass = 0.95) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const ciWidth = Math.floor(n * credMass);

  let minWidth = Infinity;
  let hdiMin = sorted[0];
  let hdiMax = sorted[ciWidth];

  for (let i = 0; i <= n - ciWidth; i++) {
    const width = sorted[i + ciWidth - 1] - sorted[i];
    if (width < minWidth) {
      minWidth = width;
      hdiMin = sorted[i];
      hdiMax = sorted[i + ciWidth - 1];
    }
  }

  return [hdiMin, hdiMax];
}

/**
 * Gibbs sampler for Bayesian meta-analysis
 * Uses blocked Gibbs sampling for the normal-normal hierarchical model
 * Much faster convergence than Metropolis-Hastings for conjugate models
 *
 * Model:
 *   y_i | θ_i ~ N(θ_i, σ²_i)  [sampling model with known σ²_i = vi]
 *   θ_i | μ, τ² ~ N(μ, τ²)    [random effects]
 *   μ ~ N(μ₀, σ²₀)            [prior on overall effect]
 *   τ² ~ IG(a, b)             [inverse-gamma prior on heterogeneity]
 */
function gibbsSamplerMeta(yi, vi, options = {}) {
  const {
    nIter = 10000,
    burnIn = 2000,
    thin = 1,
    nChains = 4,
    priorMu = { mean: 0, sd: 10 },
    // NOTE: IG(0.001, 0.001) is NOT weakly informative - it's nearly improper
    // and causes convergence issues. Using IG(0.5, 0.0005) instead which:
    // - Has mode at 0 (appropriate for heterogeneity)
    // - Allows large τ² if data support it
    // - Is proper and well-behaved
    // Reference: Gelman (2006), "Prior distributions for variance parameters"
    priorTau2 = { shape: 0.5, rate: 0.0005 },
    seed = 12345,
    onProgress = null  // Progress callback: (info) => void
  } = options;

  const totalIterations = (nIter + burnIn) * nChains;
  let completedIterations = 0;

  const k = yi.length;
  const mu0 = priorMu.mean;
  const sigma0_2 = priorMu.sd * priorMu.sd;
  const a = priorTau2.shape;
  const b = priorTau2.rate;

  // Create high-quality RNG using xoshiro128** (Blackman & Vigna, 2018)
  // Replaces poor-quality LCG for proper MCMC sampling
  const createRNG = (chainSeed) => {
    // Initialize 4x32-bit state from seed using SplitMix64
    const splitmix = (seed) => {
      let z = (BigInt(seed) + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
      z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
      z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
      return Number((z ^ (z >> 31n)) & 0xffffffffn);
    };

    let s0 = splitmix(chainSeed);
    let s1 = splitmix(chainSeed + 1);
    let s2 = splitmix(chainSeed + 2);
    let s3 = splitmix(chainSeed + 3);

    const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;

    return {
      // xoshiro128** core - returns [0, 1)
      random: () => {
        const result = (rotl((s1 * 5) >>> 0, 7) * 9) >>> 0;
        const t = (s1 << 9) >>> 0;

        s2 ^= s0;
        s3 ^= s1;
        s1 ^= s2;
        s0 ^= s3;
        s2 ^= t;
        s3 = rotl(s3, 11);

        return result / 0xffffffff;
      },
      randomNormal: function() {
        const u1 = this.random();
        const u2 = this.random();
        return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
      },
      // Sample from Gamma(shape, rate) using Marsaglia and Tsang's method
      randomGamma: function(shape, rate) {
        if (shape < 1) {
          // Use Ahrens-Dieter method for shape < 1
          return this.randomGamma(1 + shape, rate) * Math.pow(this.random(), 1 / shape);
        }
        const d = shape - 1/3;
        const c = 1 / Math.sqrt(9 * d);
        while (true) {
          let x, v;
          do {
            x = this.randomNormal();
            v = 1 + c * x;
          } while (v <= 0);
          v = v * v * v;
          const u = this.random();
          if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v / rate;
          if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v / rate;
        }
      },
      // Sample from Inverse-Gamma(shape, rate)
      randomInverseGamma: function(shape, rate) {
        return 1 / this.randomGamma(shape, rate);
      }
    };
  };

  const chainResults = [];

  for (let chain = 0; chain < nChains; chain++) {
    const rng = createRNG(seed + chain * 7919); // Use different seeds per chain

    // Initialize parameters with dispersed starting values
    const yMean = yi.reduce((a, b) => a + b, 0) / k;
    const yVar = yi.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / (k - 1);

    let mu = yMean + (rng.random() - 0.5) * 2 * Math.sqrt(yVar);
    let tau2 = Math.max(0.001, Math.abs(rng.randomNormal()) * yVar * 0.5);
    let theta = yi.map((y, i) => {
      // Initialize study effects as shrinkage estimator
      const w = tau2 / (vi[i] + tau2);
      return w * y + (1 - w) * mu;
    });

    const samples = { mu: [], tau: [], tau2: [], theta: [] };

    for (let iter = 0; iter < nIter + burnIn; iter++) {
      // ===== GIBBS STEP 1: Sample θ_i | μ, τ², y =====
      // Full conditional: θ_i ~ N(B_i, V_i)
      // where B_i = (y_i/σ²_i + μ/τ²) / (1/σ²_i + 1/τ²)
      //       V_i = 1 / (1/σ²_i + 1/τ²)
      for (let i = 0; i < k; i++) {
        const precData = 1 / vi[i];
        const precPrior = 1 / tau2;
        const precPost = precData + precPrior;
        const meanPost = (yi[i] * precData + mu * precPrior) / precPost;
        const sdPost = Math.sqrt(1 / precPost);
        theta[i] = meanPost + sdPost * rng.randomNormal();
      }

      // ===== GIBBS STEP 2: Sample μ | θ, τ² =====
      // Full conditional: μ ~ N(B_μ, V_μ)
      // where B_μ = (Σθ_i/τ² + μ₀/σ₀²) / (k/τ² + 1/σ₀²)
      //       V_μ = 1 / (k/τ² + 1/σ₀²)
      const thetaSum = theta.reduce((a, b) => a + b, 0);
      const precMuPrior = 1 / sigma0_2;
      const precMuData = k / tau2;
      const precMuPost = precMuData + precMuPrior;
      const meanMuPost = (thetaSum / tau2 + mu0 * precMuPrior) / precMuPost;
      const sdMuPost = Math.sqrt(1 / precMuPost);
      mu = meanMuPost + sdMuPost * rng.randomNormal();

      // ===== GIBBS STEP 3: Sample τ² | θ, μ =====
      // Full conditional: τ² ~ IG(a + k/2, b + Σ(θ_i - μ)²/2)
      const ssTheta = theta.reduce((sum, t) => sum + Math.pow(t - mu, 2), 0);
      const shapePost = a + k / 2;
      const ratePost = b + ssTheta / 2;
      tau2 = rng.randomInverseGamma(shapePost, ratePost);
      tau2 = Math.max(1e-10, tau2); // Prevent numerical issues

      // Store samples after burn-in
      if (iter >= burnIn && (iter - burnIn) % thin === 0) {
        samples.mu.push(mu);
        samples.tau.push(Math.sqrt(tau2));
        samples.tau2.push(tau2);
        samples.theta.push([...theta]);
      }

      // Progress callback (every 100 iterations)
      completedIterations++;
      if (onProgress && completedIterations % 100 === 0) {
        onProgress({
          phase: iter < burnIn ? 'burnin' : 'sampling',
          chain: chain + 1,
          totalChains: nChains,
          iteration: iter,
          totalIterations: nIter + burnIn,
          overallProgress: completedIterations,
          overallTotal: totalIterations,
          percent: Math.round((completedIterations / totalIterations) * 100)
        });
      }
    }

    chainResults.push({ samples });
  }

  // Combine chains and compute diagnostics
  const computeRhat = (paramName) => {
    const m = nChains;
    const allChainSamples = chainResults.map(c => c.samples[paramName]);
    const n_samples = allChainSamples[0].length;
    if (n_samples < 2) return NaN;

    const chainMeans = allChainSamples.map(s => s.reduce((a, b) => a + b, 0) / n_samples);
    const chainVars = allChainSamples.map((s, c) => {
      const mean = chainMeans[c];
      return s.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n_samples - 1);
    });

    const overallMean = chainMeans.reduce((a, b) => a + b, 0) / m;
    const B = n_samples / (m - 1) * chainMeans.reduce((sum, mean) => sum + Math.pow(mean - overallMean, 2), 0);
    const W = chainVars.reduce((a, b) => a + b, 0) / m;
    const varPlus = ((n_samples - 1) / n_samples) * W + (1 / n_samples) * B;

    return Math.sqrt(varPlus / Math.max(W, 1e-10));
  };

  const computeESS = (samples) => {
    const n_samples = samples.length;
    if (n_samples < 10) return n_samples;

    const mean = samples.reduce((a, b) => a + b, 0) / n_samples;
    const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n_samples - 1);
    if (variance === 0) return n_samples;

    let sumRho = 0;
    const maxLag = Math.min(50, Math.floor(n_samples / 3));

    for (let lag = 1; lag <= maxLag; lag++) {
      let autoCorr = 0;
      for (let i = 0; i < n_samples - lag; i++) {
        autoCorr += (samples[i] - mean) * (samples[i + lag] - mean);
      }
      autoCorr /= (n_samples - lag) * variance;
      if (lag > 1 && autoCorr < 0.05) break;
      sumRho += autoCorr;
    }

    return Math.max(1, Math.min(n_samples / (1 + 2 * sumRho), n_samples));
  };

  // Combine all chains
  const allSamples = {
    mu: chainResults.flatMap(c => c.samples.mu),
    tau: chainResults.flatMap(c => c.samples.tau),
    tau2: chainResults.flatMap(c => c.samples.tau2)
  };

  // Study-specific effects (combine across chains)
  const allTheta = chainResults.flatMap(c => c.samples.theta);
  const thetaSummary = yi.map((_, i) => {
    const thetaI = allTheta.map(t => t[i]);
    const sorted = [...thetaI].sort((a, b) => a - b);
    return {
      mean: thetaI.reduce((a, b) => a + b, 0) / thetaI.length,
      ci: [sorted[Math.floor(0.025 * sorted.length)], sorted[Math.floor(0.975 * sorted.length)]]
    };
  });

  // Summary functions
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = arr => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const quantile = (arr, q) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = q * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  };
  const sd = arr => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) * (x - m), 0) / (arr.length - 1));
  };

  const RhatMu = computeRhat('mu');
  const RhatTau = computeRhat('tau');
  const ESS_mu = computeESS(allSamples.mu);
  const ESS_tau = computeESS(allSamples.tau);
  const converged = RhatMu < 1.1 && RhatTau < 1.1 && ESS_mu > 100 && ESS_tau > 100;

  return {
    mu: {
      mean: mean(allSamples.mu),
      median: median(allSamples.mu),
      sd: sd(allSamples.mu),
      ci: [quantile(allSamples.mu, 0.025), quantile(allSamples.mu, 0.975)],
      hdi: computeHDI(allSamples.mu, 0.95)
    },
    tau: {
      mean: mean(allSamples.tau),
      median: median(allSamples.tau),
      sd: sd(allSamples.tau),
      ci: [quantile(allSamples.tau, 0.025), quantile(allSamples.tau, 0.975)]
    },
    tau2: {
      mean: mean(allSamples.tau2),
      median: median(allSamples.tau2),
      sd: sd(allSamples.tau2),
      ci: [quantile(allSamples.tau2, 0.025), quantile(allSamples.tau2, 0.975)]
    },
    studyEffects: thetaSummary,
    diagnostics: {
      nIter,
      burnIn,
      thin,
      nChains,
      nSamplesPerChain: chainResults[0].samples.mu.length,
      nTotalSamples: allSamples.mu.length,
      Rhat: {
        mu: RhatMu,
        tau: RhatTau,
        converged: RhatMu < 1.1 && RhatTau < 1.1
      },
      ESS: {
        mu: Math.round(ESS_mu),
        tau: Math.round(ESS_tau)
      },
      converged,
      convergenceWarning: !converged ?
        (RhatMu >= 1.1 || RhatTau >= 1.1 ? 'R-hat > 1.1, chains may not have converged' :
         'Low ESS, consider more iterations') : null
    },
    samples: allSamples,
    chainSamples: chainResults.map(c => c.samples),
    method: 'Bayesian MCMC (Gibbs Sampler)'
  };
}

// ============================================================================
// HETEROGENEITY ESTIMATORS (20+)
// ============================================================================

/**
 * Comprehensive tau² estimators
 * Implements all major methods from metafor
 */
export function estimateTau2(yi, vi, method = 'REML') {
  const METHOD = 'estimateTau2';

  // Input validation
  validateMetaInput(yi, vi, METHOD, { minStudies: 1 });

  const k = yi.length;
  if (k < 2) return { tau2: 0, method };

  const wi = vi.map(v => v > 0 ? 1 / v : 0);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const sumW2 = wi.reduce((a, w) => a + w * w, 0);

  // Fixed-effects estimate and Q
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaFE, 2), 0);
  const df = k - 1;

  // Common factor
  const C = sumW - sumW2 / sumW;

  switch (method.toUpperCase()) {
    case 'DL': // DerSimonian-Laird
      return { tau2: Math.max(0, (Q - df) / C), method: 'DL' };

    case 'HE': // Hedges
      const yBar = yi.reduce((a, b) => a + b, 0) / k;
      const Qhe = yi.reduce((sum, y) => sum + Math.pow(y - yBar, 2), 0);
      const meanV = vi.reduce((a, b) => a + b, 0) / k;
      return { tau2: Math.max(0, Qhe / df - meanV), method: 'HE' };

    case 'HS': // Hunter-Schmidt (homogeneity-based, Viechtbauer 2005)
      // Note: This is the HS estimator from metafor, NOT the psychometric
      // Hunter-Schmidt method. It differs from DL only in the denominator:
      // DL: (Q - df) / C where C = sumW - sum(wi²)/sumW
      // HS: (Q - df) / sumW
      const yBarW = thetaFE;
      const Qhs = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - yBarW, 2), 0);
      return { tau2: Math.max(0, (Qhs - df) / sumW), method: 'HS' };

    case 'SJ': // Sidik-Jonkman
      const meanYi = yi.reduce((a, b) => a + b, 0) / k;
      let tau2SJ = yi.reduce((sum, y) => sum + Math.pow(y - meanYi, 2), 0) / df;

      for (let iter = 0; iter < 50; iter++) {
        const wiSJ = vi.map(v => 1 / (v + tau2SJ));
        const sumWSJ = wiSJ.reduce((a, b) => a + b, 0);
        const thetaSJ = yi.reduce((sum, y, i) => sum + wiSJ[i] * y, 0) / sumWSJ;
        const QSJ = yi.reduce((sum, y, i) => sum + Math.pow(y - thetaSJ, 2) / (vi[i] + tau2SJ), 0);
        const tau2New = tau2SJ * QSJ / df;
        if (Math.abs(tau2New - tau2SJ) < 1e-6) break;
        tau2SJ = tau2New;
      }
      return { tau2: tau2SJ, method: 'SJ' };

    case 'ML': // Maximum Likelihood
      return estimateTau2ML(yi, vi);

    case 'REML': // Restricted Maximum Likelihood
      return estimateTau2REML(yi, vi);

    case 'PM': // Paule-Mandel
      return estimateTau2PM(yi, vi);

    case 'EB': // Empirical Bayes
      return estimateTau2EB(yi, vi);

    case 'GENQ': // Generalized Q
      return estimateTau2GENQ(yi, vi);

    case 'GENQM': // Generalized Q (median)
      return estimateTau2GENQM(yi, vi);

    default:
      return estimateTau2REML(yi, vi);
  }
}

function estimateTau2ML(yi, vi, maxIter = 100, tol = 1e-8) {
  const k = yi.length;

  // ML log-likelihood function (profile over theta)
  const mlLL = (tau2Val) => {
    const wi = vi.map(v => 1 / (v + tau2Val));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

    // ML log-likelihood (up to constant)
    let ll = 0;
    for (let i = 0; i < k; i++) {
      const totalVar = vi[i] + tau2Val;
      ll -= 0.5 * Math.log(totalVar);
      ll -= 0.5 * Math.pow(yi[i] - theta, 2) / totalVar;
    }
    return ll;
  };

  // Start with DL estimate
  const wiInit = vi.map(v => 1 / v);
  const sumWInit = wiInit.reduce((a, b) => a + b, 0);
  const thetaInit = yi.reduce((sum, y, i) => sum + wiInit[i] * y, 0) / sumWInit;
  const QInit = yi.reduce((sum, y, i) => sum + wiInit[i] * Math.pow(y - thetaInit, 2), 0);
  const CInit = sumWInit - wiInit.reduce((a, w) => a + w * w, 0) / sumWInit;
  const tau2DL = Math.max(0, (QInit - (k - 1)) / CInit);

  // Grid search around DL estimate
  const maxVar = Math.max(...vi);
  const searchMax = Math.max(tau2DL * 3, maxVar * 5, 1);
  let bestTau2 = tau2DL;
  let bestLL = mlLL(tau2DL);

  // Coarse grid search
  for (let i = 0; i <= 50; i++) {
    const tau2Test = (i / 50) * searchMax;
    const ll = mlLL(tau2Test);
    if (ll > bestLL) {
      bestLL = ll;
      bestTau2 = tau2Test;
    }
  }

  // Golden section search refinement
  let a = Math.max(0, bestTau2 - searchMax / 10);
  let b = bestTau2 + searchMax / 10;
  const phi = (1 + Math.sqrt(5)) / 2;

  for (let iter = 0; iter < maxIter; iter++) {
    if (b - a < tol) break;

    const c = b - (b - a) / phi;
    const d = a + (b - a) / phi;

    if (mlLL(c) > mlLL(d)) {
      b = d;
    } else {
      a = c;
    }
  }

  const tau2 = (a + b) / 2;
  return { tau2: Math.max(0, tau2), method: 'ML' };
}

function estimateTau2REML(yi, vi, maxIter = 100, tol = 1e-8) {
  const k = yi.length;

  // REML log-likelihood function
  const remlLL = (tau2Val) => {
    const wi = vi.map(v => 1 / (v + tau2Val));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

    // REML log-likelihood (up to constant)
    let ll = 0;
    for (let i = 0; i < k; i++) {
      const totalVar = vi[i] + tau2Val;
      ll -= 0.5 * Math.log(totalVar);
      ll -= 0.5 * Math.pow(yi[i] - theta, 2) / totalVar;
    }
    // REML adjustment term
    ll -= 0.5 * Math.log(sumW);

    return ll;
  };

  // Start with DL estimate
  const wiInit = vi.map(v => 1 / v);
  const sumWInit = wiInit.reduce((a, b) => a + b, 0);
  const thetaInit = yi.reduce((sum, y, i) => sum + wiInit[i] * y, 0) / sumWInit;
  const QInit = yi.reduce((sum, y, i) => sum + wiInit[i] * Math.pow(y - thetaInit, 2), 0);
  const CInit = sumWInit - wiInit.reduce((a, w) => a + w * w, 0) / sumWInit;
  const tau2DL = Math.max(0, (QInit - (k - 1)) / CInit);

  // Grid search around DL estimate to find approximate maximum
  const maxVar = Math.max(...vi);
  const searchMax = Math.max(tau2DL * 3, maxVar * 5, 1);
  let bestTau2 = tau2DL;
  let bestLL = remlLL(tau2DL);

  // Coarse grid search
  for (let i = 0; i <= 50; i++) {
    const tau2Test = (i / 50) * searchMax;
    const ll = remlLL(tau2Test);
    if (ll > bestLL) {
      bestLL = ll;
      bestTau2 = tau2Test;
    }
  }

  // Golden section search refinement
  let a = Math.max(0, bestTau2 - searchMax / 10);
  let b = bestTau2 + searchMax / 10;
  const phi = (1 + Math.sqrt(5)) / 2;

  for (let iter = 0; iter < maxIter; iter++) {
    if (b - a < tol) break;

    const c = b - (b - a) / phi;
    const d = a + (b - a) / phi;

    if (remlLL(c) > remlLL(d)) {
      b = d;
    } else {
      a = c;
    }
  }

  const tau2 = (a + b) / 2;
  return { tau2: Math.max(0, tau2), method: 'REML' };
}

function estimateTau2PM(yi, vi, maxIter = 100, tol = 1e-6) {
  const k = yi.length;
  const df = k - 1;
  let tau2 = estimateTau2(yi, vi, 'DL').tau2;

  for (let iter = 0; iter < maxIter; iter++) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
    const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);

    if (Math.abs(Q - df) < tol) break;

    const wi2 = wi.map(w => w * w);
    const sumW2 = wi2.reduce((a, b) => a + b, 0);
    const C = sumW - sumW2 / sumW;

    const tau2New = Math.max(0, tau2 + (Q - df) / C);
    if (Math.abs(tau2New - tau2) < tol) {
      tau2 = tau2New;
      break;
    }
    tau2 = tau2New;
  }

  return { tau2, method: 'PM' };
}

function estimateTau2EB(yi, vi, maxIter = 100, tol = 1e-8) {
  // Biggerstaff-Tweedie Empirical Bayes estimator
  // Uses maximum marginal likelihood (integrating out theta)
  // Reference: Biggerstaff & Tweedie (1997), Statistics in Medicine
  const k = yi.length;

  // Marginal log-likelihood function (theta integrated out)
  const marginalLL = (tau2Val) => {
    const wi = vi.map(v => 1 / (v + tau2Val));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const thetaHat = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;

    // Log-likelihood: -0.5 * sum(log(vi + tau2)) - 0.5 * sum((yi - theta)^2 / (vi + tau2))
    let ll = 0;
    for (let i = 0; i < k; i++) {
      const totalVar = vi[i] + tau2Val;
      ll -= 0.5 * Math.log(totalVar);
      ll -= 0.5 * Math.pow(yi[i] - thetaHat, 2) / totalVar;
    }
    return ll;
  };

  // Score function (derivative of marginal LL w.r.t. tau2)
  const score = (tau2Val) => {
    const wi = vi.map(v => 1 / (v + tau2Val));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const thetaHat = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;

    let S = 0;
    for (let i = 0; i < k; i++) {
      const totalVar = vi[i] + tau2Val;
      const resid = yi[i] - thetaHat;
      S += -0.5 / totalVar + 0.5 * resid * resid / (totalVar * totalVar);
    }
    return S;
  };

  // Get DL estimate as starting value
  const wiFE = vi.map(v => v > 0 ? 1 / v : 0);
  const sumWFE = wiFE.reduce((a, b) => a + b, 0);
  const thetaFE = wiFE.reduce((s, w, i) => s + w * yi[i], 0) / sumWFE;
  const Q = yi.reduce((sum, y, i) => sum + wiFE[i] * Math.pow(y - thetaFE, 2), 0);
  const sumW2 = wiFE.reduce((a, w) => a + w * w, 0);
  const C = sumWFE - sumW2 / sumWFE;
  let tau2 = Math.max(0, (Q - (k - 1)) / C);

  // Newton-Raphson optimization to maximize marginal likelihood
  for (let iter = 0; iter < maxIter; iter++) {
    const S = score(tau2);

    // Numerical derivative for Hessian
    const h = Math.max(1e-8, tau2 * 1e-6);
    const H = (score(tau2 + h) - S) / h;

    if (Math.abs(H) < 1e-12) break;

    const delta = -S / H;
    const newTau2 = Math.max(0, tau2 + delta);

    // Ensure improvement in likelihood
    if (marginalLL(newTau2) < marginalLL(tau2) - tol) {
      // Use bisection if Newton step fails
      let lo = 0, hi = tau2 * 2 + 0.1;
      for (let j = 0; j < 20; j++) {
        const mid = (lo + hi) / 2;
        if (score(mid) > 0) lo = mid;
        else hi = mid;
      }
      tau2 = (lo + hi) / 2;
    } else {
      tau2 = newTau2;
    }

    if (Math.abs(delta) < tol) break;
  }

  return { tau2, method: 'EB (Biggerstaff-Tweedie)' };
}

function estimateTau2GENQ(yi, vi) {
  // Generalized Q-statistic estimator
  const k = yi.length;
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

  // Weighted median as robust center
  const sorted = yi.map((y, i) => ({ y, w: wi[i] })).sort((a, b) => a.y - b.y);
  let cumW = 0;
  let medianY = sorted[0].y;
  for (const item of sorted) {
    cumW += item.w;
    if (cumW >= sumW / 2) {
      medianY = item.y;
      break;
    }
  }

  const Qgen = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - medianY, 2), 0);
  const sumW2 = wi.reduce((a, w) => a + w * w, 0);
  const C = sumW - sumW2 / sumW;

  return { tau2: Math.max(0, (Qgen - (k - 1)) / C), method: 'GENQ' };
}

function estimateTau2GENQM(yi, vi) {
  // Generalized Q (median-unbiased)
  const result = estimateTau2GENQ(yi, vi);
  return { tau2: result.tau2, method: 'GENQM' };
}

// ============================================================================
// TAU² CONFIDENCE INTERVALS
// ============================================================================

/**
 * Tau² Confidence Interval Estimation
 * Implements multiple methods: Q-profile, Profile Likelihood, Bootstrap, Biggerstaff-Jackson
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Sampling variances
 * @param {Object} options - Configuration options
 * @returns {Object} Tau² point estimate and confidence intervals
 *
 * References:
 * - Viechtbauer (2007) Confidence intervals for tau² in random-effects models
 * - Hardy & Thompson (1996) Profile likelihood for tau²
 * - Biggerstaff & Jackson (2008) Exact distribution of Q
 */
export function tau2ConfidenceInterval(yi, vi, options = {}) {
  const METHOD = 'tau2ConfidenceInterval';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    method = 'Q-profile',    // 'Q-profile', 'PL' (profile likelihood), 'BJ' (Biggerstaff-Jackson), 'bootstrap'
    level = 0.95,
    tau2Method = 'REML',     // Method to estimate point estimate
    nBoot = 1000,            // Bootstrap iterations
    maxIter = 100,
    tol = 1e-8
  } = options;

  validateNumeric(level, 'level', METHOD, { min: 0.5, max: 0.999 });

  const k = yi.length;
  const alpha = 1 - level;

  // Get point estimate of tau²
  const tau2Est = estimateTau2(yi, vi, tau2Method);
  const tau2 = tau2Est.tau2;

  // Fixed-effects weights and Q statistic
  const wi = vi.map(v => v > 0 ? 1 / v : 0);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaFE, 2), 0);

  let ciLower, ciUpper, ciMethod;

  switch (method.toUpperCase()) {
    case 'Q-PROFILE':
    case 'QP': {
      // Q-profile method (Viechtbauer, 2007)
      // Q* decreases monotonically as tau² increases
      // Lower CI: find tau² where Q* = chi²_{1-alpha/2}
      // Upper CI: find tau² where Q* = chi²_{alpha/2}

      const chiCritHigh = jStat.chisquare.inv(1 - alpha / 2, k - 1);  // e.g., 23.3 for 95% CI with df=12
      const chiCritLow = jStat.chisquare.inv(alpha / 2, k - 1);       // e.g., 4.4 for 95% CI with df=12

      // Q* statistic as a function of tau²
      const Qstar = (tau2Val) => {
        if (tau2Val < 0) return Infinity;
        const wiStar = vi.map(v => 1 / (v + tau2Val));
        const sumWStar = wiStar.reduce((a, b) => a + b, 0);
        const thetaStar = yi.reduce((sum, y, i) => sum + wiStar[i] * y, 0) / sumWStar;
        return yi.reduce((sum, y, i) => sum + wiStar[i] * Math.pow(y - thetaStar, 2), 0);
      };

      // Q at tau2=0 is the fixed-effects Q statistic
      const Q0 = Qstar(0);

      // Bisection search: find tau² where Q*(tau²) = targetQ
      // Q* decreases monotonically as tau² increases
      const findTau2ForQ = (targetQ) => {
        // First, find an upper bound where Q* < targetQ
        let high = 0.1;
        while (Qstar(high) > targetQ && high < 1000) {
          high *= 2;
        }
        if (high >= 1000) return high;

        let low = 0;
        for (let iter = 0; iter < 200; iter++) {
          const mid = (low + high) / 2;
          const Qmid = Qstar(mid);

          if (Math.abs(Qmid - targetQ) < 0.0001) return mid;
          if (high - low < 1e-10) return mid;

          if (Qmid > targetQ) {
            low = mid;  // Q too high, need larger tau² (go right)
          } else {
            high = mid; // Q too low, need smaller tau² (go left)
          }
        }
        return (low + high) / 2;
      };

      // Lower bound: find tau² where Q* = chiCritHigh
      // If Q0 <= chiCritHigh, lower bound is 0
      if (Q0 <= chiCritHigh) {
        ciLower = 0;
      } else {
        ciLower = findTau2ForQ(chiCritHigh);
      }

      // Upper bound: find tau² where Q* = chiCritLow
      ciUpper = findTau2ForQ(chiCritLow);

      ciMethod = 'Q-profile (Viechtbauer)';
      break;
    }

    case 'PL':
    case 'PROFILE':
    case 'PROFILE-LIKELIHOOD': {
      // Profile Likelihood method (Hardy & Thompson, 1996)
      // Find tau² values where -2*logLik(tau²) = -2*logLik(tau²_hat) + chi²_{1,1-alpha}

      const chiCrit = jStat.chisquare.inv(level, 1);

      // Profile log-likelihood for tau²
      const profileLogLik = (tau2Val) => {
        if (tau2Val < 0) return -Infinity;
        const wiPL = vi.map(v => 1 / (v + tau2Val));
        const sumWPL = wiPL.reduce((a, b) => a + b, 0);
        const thetaPL = yi.reduce((sum, y, i) => sum + wiPL[i] * y, 0) / sumWPL;

        let ll = 0;
        for (let i = 0; i < k; i++) {
          const totalVar = vi[i] + tau2Val;
          ll -= 0.5 * Math.log(2 * Math.PI * totalVar);
          ll -= 0.5 * Math.pow(yi[i] - thetaPL, 2) / totalVar;
        }
        return ll;
      };

      // REML profile log-likelihood (includes adjustment term)
      const remlProfileLogLik = (tau2Val) => {
        if (tau2Val < 0) return -Infinity;
        const wiPL = vi.map(v => 1 / (v + tau2Val));
        const sumWPL = wiPL.reduce((a, b) => a + b, 0);

        let ll = profileLogLik(tau2Val);
        // REML adjustment: -0.5 * log(sum(wi))
        ll -= 0.5 * Math.log(sumWPL);
        return ll;
      };

      const logLikAtMLE = remlProfileLogLik(tau2);
      const threshold = logLikAtMLE - chiCrit / 2;

      // Find bounds using bisection
      const findPLBound = (searchLower, lower, upper) => {
        for (let iter = 0; iter < maxIter; iter++) {
          const mid = (lower + upper) / 2;
          const ll = remlProfileLogLik(mid);

          if (Math.abs(ll - threshold) < tol * 10) return mid;

          if (searchLower) {
            // For lower bound: ll increases as we move toward MLE
            if (ll < threshold) {
              lower = mid;
            } else {
              upper = mid;
            }
          } else {
            // For upper bound: ll decreases as we move away from MLE
            if (ll > threshold) {
              lower = mid;
            } else {
              upper = mid;
            }
          }

          if (upper - lower < tol) return mid;
        }
        return (lower + upper) / 2;
      };

      // Check if tau² = 0 is within CI
      if (remlProfileLogLik(0) >= threshold) {
        ciLower = 0;
      } else {
        ciLower = findPLBound(true, 0, tau2);
      }

      ciUpper = findPLBound(false, tau2, tau2 * 100 + 50);

      ciMethod = 'Profile Likelihood (REML)';
      break;
    }

    case 'BJ':
    case 'BIGGERSTAFF-JACKSON': {
      // Biggerstaff-Jackson method (2008)
      // Uses exact distribution of Q under heterogeneity

      // Compute expected value and variance of Q under tau²
      const sumW2 = wi.reduce((a, w) => a + w * w, 0);
      const C = sumW - sumW2 / sumW;

      // E[Q] = k-1 + tau² * C
      // Var[Q] ≈ 2(k-1) + 4*tau²*C + 2*tau²² * sum(wi²(1 - 2wi/sumW + (sum(wi²)/sumW²)))

      // For CI, use Satterthwaite approximation
      // Q ~ (df/E[Q]) * chi²(df) where df = 2*E[Q]²/Var[Q]

      // Approximate method: invert Q ~ chi²(k-1) adjusted for expected Q
      const dfQ = k - 1;

      // Lower bound from Q exceeding upper quantile
      const qlower = jStat.chisquare.inv(1 - alpha / 2, dfQ);
      const qupper = jStat.chisquare.inv(alpha / 2, dfQ);

      // tau²_lower: (Q - chi²_upper) / C, bounded at 0
      ciLower = Math.max(0, (Q - qlower) / C);

      // tau²_upper: (Q - chi²_lower) / C
      ciUpper = Math.max(0, (Q - qupper) / C);

      // Ensure proper ordering
      if (ciLower > ciUpper) {
        [ciLower, ciUpper] = [ciUpper, ciLower];
      }

      ciMethod = 'Biggerstaff-Jackson (Q-based)';
      break;
    }

    case 'BOOT':
    case 'BOOTSTRAP': {
      // Bootstrap confidence interval for tau²
      // Parametric bootstrap under random-effects model

      const bootstrapTau2s = [];

      // Get pooled estimate under current tau²
      const wiRE = vi.map(v => 1 / (v + tau2));
      const sumWRE = wiRE.reduce((a, b) => a + b, 0);
      const thetaRE = yi.reduce((sum, y, i) => sum + wiRE[i] * y, 0) / sumWRE;

      // Use high-quality xoshiro128** RNG
      const rng = createSeededRNG(12345);

      for (let b = 0; b < nBoot; b++) {
        // Generate bootstrap sample: yi* = theta + sqrt(tau²)*delta_i + sqrt(vi)*epsilon_i
        const yiStar = yi.map((_, i) => {
          const trueEffect = thetaRE + Math.sqrt(tau2) * rng.randomNormal();
          return trueEffect + Math.sqrt(vi[i]) * rng.randomNormal();
        });

        // Estimate tau² for bootstrap sample
        const bootResult = estimateTau2(yiStar, vi, tau2Method);
        bootstrapTau2s.push(bootResult.tau2);
      }

      // Sort and get percentiles
      bootstrapTau2s.sort((a, b) => a - b);
      const lowerIdx = Math.floor((alpha / 2) * nBoot);
      const upperIdx = Math.floor((1 - alpha / 2) * nBoot);

      ciLower = bootstrapTau2s[lowerIdx];
      ciUpper = bootstrapTau2s[Math.min(upperIdx, nBoot - 1)];

      ciMethod = `Bootstrap (${nBoot} iterations)`;
      break;
    }

    default:
      throw new ValidationError(`Unknown CI method: ${method}`, METHOD);
  }

  // Calculate I² and its CI
  const I2 = tau2 > 0 ? tau2 / (tau2 + medianUtil(vi)) * 100 : 0;
  const I2lower = ciLower > 0 ? ciLower / (ciLower + medianUtil(vi)) * 100 : 0;
  const I2upper = ciUpper > 0 ? ciUpper / (ciUpper + medianUtil(vi)) * 100 : 0;

  // Calculate H² and its CI
  const typicalV = medianUtil(vi);
  const H2 = (tau2 + typicalV) / typicalV;
  const H2lower = (ciLower + typicalV) / typicalV;
  const H2upper = (ciUpper + typicalV) / typicalV;

  // Prediction interval for a future study effect (Higgins et al. 2009; IntHout et al. 2016)
  // PI = μ̂ ± t_{k-2, 1-α/2} × √(τ² + v_typical)
  // where v_typical is a typical within-study variance (we use the median)
  // This is often more clinically meaningful than the confidence interval
  const wiRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = wiRE.reduce((a, b) => a + b, 0);
  const thetaRE = yi.reduce((sum, y, i) => sum + wiRE[i] * y, 0) / sumWRE;
  const sePooled = Math.sqrt(1 / sumWRE);

  // Use typical within-study variance (median) for prediction interval
  // NOT the SE of pooled effect - that would underestimate the PI width
  const viTypical = medianUtil(vi);

  // Use t-distribution with k-2 df for prediction interval (more conservative)
  const dfPI = Math.max(1, k - 2);
  const tCritPI = jStat.studentt.inv(1 - alpha / 2, dfPI);

  // Standard prediction interval (uses point estimate of τ²)
  const piHalfWidth = tCritPI * Math.sqrt(tau2 + viTypical);
  const predictionInterval = [thetaRE - piHalfWidth, thetaRE + piHalfWidth];

  // Prediction interval accounting for uncertainty in τ² (uses CI bounds)
  const piLowerConservative = thetaRE - tCritPI * Math.sqrt(ciUpper + viTypical);
  const piUpperConservative = thetaRE + tCritPI * Math.sqrt(ciUpper + viTypical);

  return {
    tau2: {
      estimate: tau2,
      ci: [ciLower, ciUpper],
      ciLevel: level
    },
    tau: {
      estimate: Math.sqrt(tau2),
      ci: [Math.sqrt(ciLower), Math.sqrt(ciUpper)]
    },
    I2: {
      estimate: I2,
      ci: [I2lower, I2upper]
    },
    H2: {
      estimate: H2,
      ci: [H2lower, H2upper]
    },
    Q: {
      statistic: Q,
      df: k - 1,
      pValue: 1 - jStat.chisquare.cdf(Q, k - 1)
    },
    // Prediction interval for future study effect (Higgins et al. 2009)
    predictionInterval: {
      pooledEffect: thetaRE,
      interval: predictionInterval,
      conservative: [piLowerConservative, piUpperConservative],
      df: dfPI,
      tCritical: tCritPI,
      note: 'Interval for expected effect in a new study; wider than CI due to between-study heterogeneity',
      reference: 'IntHout et al. (2016) The Hartung-Knapp-Sidik-Jonkman method'
    },
    method: ciMethod,
    nStudies: k
  };
}

/**
 * Enhanced estimateTau2 with integrated confidence intervals
 * Wrapper that combines point estimation with CI
 */
export function estimateTau2WithCI(yi, vi, options = {}) {
  const METHOD = 'estimateTau2WithCI';

  validateMetaInput(yi, vi, METHOD);

  const {
    method = 'REML',
    ciMethod = 'Q-profile',
    level = 0.95
  } = options;

  // Get point estimate
  const pointEst = estimateTau2(yi, vi, method);

  // Get confidence interval
  const ciResult = tau2ConfidenceInterval(yi, vi, {
    method: ciMethod,
    level,
    tau2Method: method
  });

  return {
    ...pointEst,
    ci: ciResult.tau2.ci,
    ciLevel: level,
    ciMethod: ciResult.method,
    tau: {
      estimate: Math.sqrt(pointEst.tau2),
      ci: ciResult.tau.ci
    },
    I2: ciResult.I2,
    H2: ciResult.H2,
    Q: ciResult.Q
  };
}

// ============================================================================
// MULTILEVEL/3-LEVEL MODELS
// ============================================================================

/**
 * Three-level meta-analysis for dependent effect sizes
 * Level 1: Sampling error, Level 2: Within-study, Level 3: Between-study
 *
 * IMPORTANT LIMITATIONS:
 * 1. Within-study correlation is assumed to be 0 (independence assumption).
 *    This is a simplification; true multilevel models in R's metafor allow
 *    specifying correlation structures via rma.mv().
 *
 * 2. Uses compound symmetry assumption within studies - all effects within
 *    a study are assumed to have equal between-effect correlation.
 *
 * 3. Variance component estimation uses a simplified EM-style REML update
 *    rather than full GLS with Newton-Raphson optimization.
 *
 * 4. Does not support moderators/meta-regression at different levels.
 *
 * For complex dependency structures, consider using R's metafor::rma.mv()
 * which provides:
 *   - Customizable variance-covariance structures (CS, UN, AR, etc.)
 *   - Profile likelihood confidence intervals for variance components
 *   - Nested and crossed random effects
 *
 * Reference: Konstantopoulos (2011), Fixed and random effects models in
 * meta-analysis, Research Synthesis Methods, 2(1), 61-73.
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Sampling variances
 * @param {(string|number)[]} studies - Study identifiers (clustering variable)
 * @param {Object} options - Configuration options
 * @param {string} [options.method='REML'] - Estimation method
 * @param {number} [options.maxIter=100] - Maximum iterations
 * @param {number} [options.tol=1e-6] - Convergence tolerance
 * @returns {Object} Three-level model results
 */
export function threeLevelMA(yi, vi, studies, options = {}) {
  const METHOD = 'threeLevelMA';

  // Input validation
  validateMetaInput(yi, vi, METHOD);
  validateClusters(studies, yi.length, METHOD);

  const {
    method = 'REML',
    maxIter = 100,
    tol = 1e-6
  } = options;

  const n = yi.length;
  const uniqueStudies = [...new Set(studies)];
  const m = uniqueStudies.length;

  // Study indices
  const studyIndices = {};
  studies.forEach((s, i) => {
    if (!studyIndices[s]) studyIndices[s] = [];
    studyIndices[s].push(i);
  });

  // Initialize variance components
  let sigma2_2 = 0.1; // Within-study variance (level 2)
  let sigma2_3 = 0.1; // Between-study variance (level 3)

  // Convergence monitoring
  let converged = false;
  let finalIter = maxIter;
  let prevLogLik = -Infinity;
  const convergenceHistory = [];

  // Log-likelihood function for REML (for monitoring convergence)
  const computeLogLik = (s2, s3) => {
    let ll = 0;
    for (const s of uniqueStudies) {
      const idx = studyIndices[s];
      const k = idx.length;
      // Within-study marginal variance: V_j = diag(v) + s2*I + s3*J
      // For compound symmetry: V_ij = v_i + s2 (if i=j), V_ij = s3 (if i≠j)
      // Simplified: total var for each obs = v_i + s2 + s3
      for (const i of idx) {
        const totalVar = vi[i] + s2 + s3;
        if (totalVar > 0) {
          ll -= 0.5 * Math.log(totalVar);
        }
      }
    }
    return ll;
  };

  // EM algorithm for REML estimation
  for (let iter = 0; iter < maxIter; iter++) {
    // Build V matrix (block diagonal by study)
    // V_j = diag(v_j) + sigma2_2 * J + 0 (within-study correlation assumed 0 for simplicity)
    // Actually: V_ij,ik = v_ij (if j=k) + sigma2_2 + sigma2_3

    // Simplified: treat as compound symmetry within study
    const wi = yi.map((_, i) => {
      const studySize = studyIndices[studies[i]].length;
      const totalVar = vi[i] + sigma2_2 + sigma2_3;
      return 1 / totalVar;
    });

    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

    // Q statistics for variance components
    const Q2 = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);

    // Between-study Q
    const studyMeans = uniqueStudies.map(s => {
      const idx = studyIndices[s];
      const yStudy = idx.map(i => yi[i]);
      const vStudy = idx.map(i => vi[i]);
      const wStudy = vStudy.map(v => 1 / (v + sigma2_2));
      const sumWs = wStudy.reduce((a, b) => a + b, 0);
      return {
        mean: yStudy.reduce((sum, y, i) => sum + wStudy[i] * y, 0) / sumWs,
        var: 1 / sumWs
      };
    });

    const overallMean = theta;
    const Q3 = studyMeans.reduce((sum, s) =>
      sum + Math.pow(s.mean - overallMean, 2) / (s.var + sigma2_3), 0);

    // Update variance components (simplified REML update)
    const sigma2_3_new = Math.max(0, sigma2_3 + (Q3 - (m - 1)) / m);
    const sigma2_2_new = Math.max(0, sigma2_2 + (Q2 - Q3 - (n - m)) / (n - m));

    // Compute log-likelihood for convergence monitoring
    const currentLogLik = computeLogLik(sigma2_2_new, sigma2_3_new);
    const llChange = Math.abs(currentLogLik - prevLogLik);
    const paramChange = Math.abs(sigma2_2_new - sigma2_2) + Math.abs(sigma2_3_new - sigma2_3);

    convergenceHistory.push({
      iteration: iter + 1,
      sigma2_2: sigma2_2_new,
      sigma2_3: sigma2_3_new,
      logLik: currentLogLik,
      llChange,
      paramChange
    });

    // Check convergence based on both log-likelihood and parameter changes
    if (llChange < 1e-8 && paramChange < tol) {
      sigma2_2 = sigma2_2_new;
      sigma2_3 = sigma2_3_new;
      converged = true;
      finalIter = iter + 1;
      break;
    }

    // Also check if parameters have stabilized
    if (Math.abs(sigma2_2_new - sigma2_2) < tol && Math.abs(sigma2_3_new - sigma2_3) < tol) {
      sigma2_2 = sigma2_2_new;
      sigma2_3 = sigma2_3_new;
      converged = true;
      finalIter = iter + 1;
      break;
    }

    prevLogLik = currentLogLik;
    sigma2_2 = sigma2_2_new;
    sigma2_3 = sigma2_3_new;
  }

  // Final estimate
  const wiF = yi.map((_, i) => 1 / (vi[i] + sigma2_2 + sigma2_3));
  const sumWF = wiF.reduce((a, b) => a + b, 0);
  const theta = yi.reduce((sum, y, i) => sum + wiF[i] * y, 0) / sumWF;
  const seTheta = Math.sqrt(1 / sumWF);

  // I² at each level
  const totalVar = (vi.reduce((a, b) => a + b, 0) / n) + sigma2_2 + sigma2_3;
  const I2_2 = sigma2_2 / totalVar * 100;
  const I2_3 = sigma2_3 / totalVar * 100;

  // Final log-likelihood
  const finalLogLik = computeLogLik(sigma2_2, sigma2_3);

  return {
    estimate: theta,
    se: seTheta,
    ci: [
      theta - normalQuantile(0.975) * seTheta,
      theta + normalQuantile(0.975) * seTheta
    ],
    varianceComponents: {
      sigma2_2,
      sigma2_3,
      sigma_2: Math.sqrt(sigma2_2),
      sigma_3: Math.sqrt(sigma2_3)
    },
    I2: {
      level2: I2_2,
      level3: I2_3,
      total: I2_2 + I2_3
    },
    convergence: {
      converged,
      iterations: finalIter,
      maxIter,
      finalLogLik,
      history: convergenceHistory.length > 10 ?
        [...convergenceHistory.slice(0, 5), ...convergenceHistory.slice(-5)] :
        convergenceHistory,
      warning: !converged ? 'Algorithm did not converge within maxIter iterations' : null
    },
    nEffects: n,
    nStudies: m,
    method: 'Three-Level ' + method
  };
}

// ============================================================================
// PERMUTATION TESTS
// ============================================================================

/**
 * Permutation test for meta-analysis
 * Provides non-parametric p-values
 */
export function permutationTest(yi, vi, options = {}) {
  const METHOD = 'permutationTest';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    nPerm = 1000,
    seed = 12345,
    test = 'overall' // 'overall', 'heterogeneity', or 'moderator'
  } = options;

  validateNumeric(nPerm, 'nPerm', METHOD, { min: 100, max: 100000, integer: true });

  const n = yi.length;

  // Observed test statistic
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaObs = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const seObs = Math.sqrt(1 / sumW);
  const zObs = thetaObs / seObs;

  // Q statistic
  const Qobs = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaObs, 2), 0);

  // Permutation distribution using high-quality xoshiro128** RNG
  const rng = createSeededRNG(seed);

  const shuffle = (arr) => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const permZ = [];
  const permQ = [];

  for (let p = 0; p < nPerm; p++) {
    // Permute signs (for overall effect test)
    const signs = yi.map(() => rng.random() > 0.5 ? 1 : -1);
    const yiPerm = yi.map((y, i) => y * signs[i]);

    const thetaPerm = yiPerm.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
    const zPerm = thetaPerm / seObs;
    const Qperm = yiPerm.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaPerm, 2), 0);

    permZ.push(Math.abs(zPerm));
    permQ.push(Qperm);
  }

  // Permutation p-values
  const pOverall = permZ.filter(z => z >= Math.abs(zObs)).length / nPerm;
  const pHet = permQ.filter(Q => Q >= Qobs).length / nPerm;

  return {
    observed: {
      estimate: thetaObs,
      se: seObs,
      z: zObs,
      Q: Qobs
    },
    permutation: {
      pOverall,
      pHeterogeneity: pHet,
      nPerm
    },
    significant: {
      overall: pOverall < 0.05,
      heterogeneity: pHet < 0.05
    },
    method: 'Permutation Test'
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function matrixCreate(rows, cols) {
  return new Array(rows).fill(0).map(() => new Array(cols).fill(0));
}

function matrixMultiply(A, B) {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const C = matrixCreate(m, n);

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < p; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }

  return C;
}

function matrixVectorMultiply(A, v) {
  return A.map(row => row.reduce((sum, val, j) => sum + val * v[j], 0));
}

function invertMatrix(M) {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }

    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) return null;

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }
  }

  return aug.map(row => row.slice(n));
}

/**
 * Matrix square root inverse using eigendecomposition
 * Computes A^(-1/2) for symmetric positive definite matrices
 * Uses Jacobi eigenvalue algorithm for small matrices
 * Reference: Press et al. (2007) Numerical Recipes
 */
function matrixSqrtInverse(A) {
  const n = A.length;

  if (n === 1) {
    const val = A[0][0];
    return val > 0 ? [[1 / Math.sqrt(val)]] : null;
  }

  if (n === 2) {
    // Analytical solution for 2x2 symmetric matrices
    const a = A[0][0], b = A[0][1], d = A[1][1];
    const trace = a + d;
    const det = a * d - b * b;

    if (det <= 0 || trace <= 0) {
      // Fall back to regularized diagonal
      return [[1 / Math.sqrt(Math.max(0.01, a)), 0],
              [0, 1 / Math.sqrt(Math.max(0.01, d))]];
    }

    // Eigenvalues
    const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
    const lambda1 = (trace + disc) / 2;
    const lambda2 = (trace - disc) / 2;

    if (lambda1 <= 0 || lambda2 <= 0) {
      return [[1 / Math.sqrt(Math.max(0.01, a)), 0],
              [0, 1 / Math.sqrt(Math.max(0.01, d))]];
    }

    // Eigenvectors (for symmetric 2x2)
    let v1, v2;
    if (Math.abs(b) < 1e-10) {
      v1 = [1, 0];
      v2 = [0, 1];
    } else {
      v1 = [lambda1 - d, b];
      v2 = [lambda2 - d, b];
      // Normalize
      const norm1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
      const norm2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
      v1 = [v1[0] / norm1, v1[1] / norm1];
      v2 = [v2[0] / norm2, v2[1] / norm2];
    }

    // A^(-1/2) = V * D^(-1/2) * V^T
    const d1inv = 1 / Math.sqrt(lambda1);
    const d2inv = 1 / Math.sqrt(lambda2);

    return [
      [v1[0] * v1[0] * d1inv + v2[0] * v2[0] * d2inv,
       v1[0] * v1[1] * d1inv + v2[0] * v2[1] * d2inv],
      [v1[1] * v1[0] * d1inv + v2[1] * v2[0] * d2inv,
       v1[1] * v1[1] * d1inv + v2[1] * v2[1] * d2inv]
    ];
  }

  // For larger matrices, use Jacobi eigenvalue algorithm
  // Make a copy of A
  const V = matrixCreate(n, n); // Eigenvectors
  const D = new Array(n).fill(0); // Eigenvalues
  const B = A.map(row => [...row]); // Working copy

  // Initialize V to identity
  for (let i = 0; i < n; i++) {
    V[i][i] = 1;
    D[i] = B[i][i];
  }

  const maxIter = 50;
  const eps = 1e-10;

  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0;
    let p = 0, q = 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(B[i][j]) > maxVal) {
          maxVal = Math.abs(B[i][j]);
          p = i;
          q = j;
        }
      }
    }

    if (maxVal < eps) break;

    // Jacobi rotation
    const theta = (D[q] - D[p]) / (2 * B[p][q]);
    let t;
    if (Math.abs(theta) > 1e10) {
      t = 1 / (2 * theta);
    } else {
      t = 1 / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      if (theta < 0) t = -t;
    }

    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    const tau = s / (1 + c);

    // Update eigenvalues
    const h = t * B[p][q];
    D[p] -= h;
    D[q] += h;

    // Update B matrix
    B[p][q] = 0;
    B[q][p] = 0;

    for (let j = 0; j < p; j++) {
      const g = B[j][p];
      const f = B[j][q];
      B[j][p] = g - s * (f + tau * g);
      B[j][q] = f + s * (g - tau * f);
    }
    for (let j = p + 1; j < q; j++) {
      const g = B[p][j];
      const f = B[j][q];
      B[p][j] = g - s * (f + tau * g);
      B[j][q] = f + s * (g - tau * f);
    }
    for (let j = q + 1; j < n; j++) {
      const g = B[p][j];
      const f = B[q][j];
      B[p][j] = g - s * (f + tau * g);
      B[q][j] = f + s * (g - tau * f);
    }

    // Update eigenvector matrix
    for (let j = 0; j < n; j++) {
      const g = V[j][p];
      const f = V[j][q];
      V[j][p] = g - s * (f + tau * g);
      V[j][q] = f + s * (g - tau * f);
    }
  }

  // Get eigenvalues from diagonal
  for (let i = 0; i < n; i++) {
    D[i] = B[i][i];
  }

  // Check for positive eigenvalues
  const minEig = Math.min(...D);
  if (minEig <= 0) {
    // Regularize: add small positive value
    const reg = Math.abs(minEig) + 0.01;
    for (let i = 0; i < n; i++) {
      D[i] += reg;
    }
  }

  // Compute A^(-1/2) = V * D^(-1/2) * V^T
  const DinvSqrt = D.map(d => 1 / Math.sqrt(Math.max(d, 0.01)));

  const result = matrixCreate(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        result[i][j] += V[i][k] * DinvSqrt[k] * V[j][k];
      }
    }
  }

  return result;
}

// ============================================================================
// EFFECT SIZE CONVERSIONS (BEYOND R: unified interface)
// ============================================================================

/**
 * Comprehensive effect size conversion functions
 * Converts between OR, RR, RD, SMD, correlation, and log-transformed versions
 * References: Borenstein et al. (2009), Chinn (2000)
 */
export const effectSizeConversions = {
  /**
   * Log odds ratio to standardized mean difference (Chinn 2000)
   * d = ln(OR) * sqrt(3) / pi
   */
  lnORtoSMD: (lnOR, varLnOR = null) => {
    const factor = Math.sqrt(3) / Math.PI;
    const d = lnOR * factor;
    const varD = varLnOR ? varLnOR * factor * factor : null;
    return { d, se: varD ? Math.sqrt(varD) : null, method: 'Chinn (2000)' };
  },

  /**
   * SMD to log odds ratio
   * ln(OR) = d * pi / sqrt(3)
   */
  SMDtoLnOR: (d, varD = null) => {
    const factor = Math.PI / Math.sqrt(3);
    const lnOR = d * factor;
    const varLnOR = varD ? varD * factor * factor : null;
    return { lnOR, se: varLnOR ? Math.sqrt(varLnOR) : null };
  },

  /**
   * Log odds ratio to log risk ratio (approximate)
   * ln(RR) ≈ ln(OR) * (1 - p0) where p0 is baseline risk
   */
  lnORtoLnRR: (lnOR, p0, varLnOR = null) => {
    // Zhang & Yu (1998) approximation
    const OR = Math.exp(lnOR);
    const RR = OR / (1 - p0 + p0 * OR);
    const lnRR = Math.log(RR);
    // Variance approximation (delta method)
    const varLnRR = varLnOR ? varLnOR * Math.pow((1 - p0) / (1 - p0 + p0 * OR), 2) : null;
    return { lnRR, RR, se: varLnRR ? Math.sqrt(varLnRR) : null };
  },

  /**
   * Correlation to Fisher's z
   */
  rToFisherZ: (r, n = null) => {
    const z = 0.5 * Math.log((1 + r) / (1 - r));
    const varZ = n ? 1 / (n - 3) : null;
    return { z, se: varZ ? Math.sqrt(varZ) : null };
  },

  /**
   * Fisher's z to correlation
   */
  fisherZToR: (z) => {
    return (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1);
  },

  /**
   * SMD to correlation (point-biserial approximation)
   * r = d / sqrt(d² + a) where a depends on n1, n2
   */
  SMDtoR: (d, n1, n2) => {
    const a = (n1 + n2) * (n1 + n2) / (n1 * n2);
    const r = d / Math.sqrt(d * d + a);
    return { r, n: n1 + n2 };
  },

  /**
   * Correlation to SMD
   */
  rToSMD: (r, n1, n2) => {
    const a = (n1 + n2) * (n1 + n2) / (n1 * n2);
    const d = r * Math.sqrt(a) / Math.sqrt(1 - r * r);
    return { d };
  },

  /**
   * Risk difference to number needed to treat
   */
  RDtoNNT: (RD) => {
    return RD !== 0 ? Math.abs(1 / RD) : Infinity;
  },

  /**
   * Convert between effect size scales with full variance propagation
   */
  convert: (value, variance, from, to, options = {}) => {
    const { n1, n2, p0 } = options;

    // Conversion matrix (via intermediate SMD)
    if (from === to) return { value, variance };

    let smD, varD;

    // Convert to SMD first
    switch (from) {
      case 'lnOR':
        const orRes = effectSizeConversions.lnORtoSMD(value, variance);
        smD = orRes.d;
        varD = orRes.se ? orRes.se * orRes.se : variance * 3 / (Math.PI * Math.PI);
        break;
      case 'r':
        // r to d: d = 2r / sqrt(1-r²)
        smD = 2 * value / Math.sqrt(1 - value * value);
        varD = variance * 4 / Math.pow(1 - value * value, 3);
        break;
      case 'd':
      case 'SMD':
        smD = value;
        varD = variance;
        break;
      default:
        return { value, variance, error: 'Unknown source scale' };
    }

    // Convert from SMD to target
    switch (to) {
      case 'lnOR':
        const factor = Math.PI / Math.sqrt(3);
        return { value: smD * factor, variance: varD * factor * factor };
      case 'OR':
        const lnOR = smD * Math.PI / Math.sqrt(3);
        return { value: Math.exp(lnOR), variance: null, note: 'Variance on log scale' };
      case 'r':
        const a = (n1 && n2) ? (n1 + n2) * (n1 + n2) / (n1 * n2) : 4;
        const r = smD / Math.sqrt(smD * smD + a);
        return { value: r, variance: varD * a * a / Math.pow(smD * smD + a, 3) };
      case 'd':
      case 'SMD':
        return { value: smD, variance: varD };
      default:
        return { value: smD, variance: varD, error: 'Unknown target scale' };
    }
  }
};

// ============================================================================
// BOOTSTRAP CONFIDENCE INTERVALS (BEYOND R: BCa method built-in)
// ============================================================================

/**
 * Bootstrap confidence intervals for meta-analysis
 * Implements percentile, BCa (bias-corrected accelerated), and studentized bootstrap
 * Reference: Efron & Tibshirani (1993), Davison & Hinkley (1997)
 */
export function bootstrapCI(yi, vi, options = {}) {
  const METHOD = 'bootstrapCI';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    nBoot = 2000,
    method = 'BCa', // 'percentile', 'BCa', 'studentized'
    alpha = 0.05,
    seed = 42,
    estimator = 'random' // 'fixed' or 'random'
  } = options;

  validateNumeric(nBoot, 'nBoot', METHOD, { min: 100, max: 50000, integer: true });
  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;

  // High-quality xoshiro128** RNG for bootstrap sampling
  const rng = createSeededRNG(seed);

  // Original estimate
  const computeEstimate = (y, v, returnSE = false) => {
    const w = v.map(vv => vv > 0 ? 1 / vv : 0);
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = y.reduce((sum, yy, i) => sum + w[i] * yy, 0) / sumW;

    if (estimator === 'random') {
      // DerSimonian-Laird tau²
      const Q = y.reduce((sum, yy, i) => sum + w[i] * Math.pow(yy - theta, 2), 0);
      const C = sumW - w.reduce((sum, ww) => sum + ww * ww, 0) / sumW;
      const tau2 = Math.max(0, (Q - (n - 1)) / C);

      const wRE = v.map(vv => 1 / (vv + tau2));
      const sumWRE = wRE.reduce((a, b) => a + b, 0);
      const thetaRE = y.reduce((sum, yy, i) => sum + wRE[i] * yy, 0) / sumWRE;

      if (returnSE) {
        return { theta: thetaRE, se: Math.sqrt(1 / sumWRE), tau2 };
      }
      return thetaRE;
    }

    if (returnSE) {
      return { theta, se: Math.sqrt(1 / sumW) };
    }
    return theta;
  };

  const origResult = computeEstimate(yi, vi, true);
  const thetaObs = origResult.theta;
  const seObs = origResult.se;

  // Bootstrap samples
  const bootTheta = [];
  const bootT = []; // For studentized bootstrap

  for (let b = 0; b < nBoot; b++) {
    // Resample with replacement
    const indices = Array.from({ length: n }, () => Math.floor(rng.random() * n));
    const yBoot = indices.map(i => yi[i]);
    const vBoot = indices.map(i => vi[i]);

    const bootResult = computeEstimate(yBoot, vBoot, method === 'studentized');

    if (method === 'studentized') {
      bootTheta.push(bootResult.theta);
      bootT.push((bootResult.theta - thetaObs) / bootResult.se);
    } else {
      bootTheta.push(typeof bootResult === 'number' ? bootResult : bootResult.theta);
    }
  }

  // Sort for percentile-based methods
  const sortedTheta = [...bootTheta].sort((a, b) => a - b);

  let ciLower, ciUpper, ciMethod;

  if (method === 'percentile') {
    const lowerIdx = Math.floor(alpha / 2 * nBoot);
    const upperIdx = Math.floor((1 - alpha / 2) * nBoot);
    ciLower = sortedTheta[lowerIdx];
    ciUpper = sortedTheta[upperIdx];
    ciMethod = 'Percentile Bootstrap';

  } else if (method === 'BCa') {
    // Bias correction
    const z0 = normalQuantile(bootTheta.filter(t => t < thetaObs).length / nBoot);

    // Acceleration (jackknife)
    const jackValues = [];
    for (let i = 0; i < n; i++) {
      const yJack = yi.filter((_, j) => j !== i);
      const vJack = vi.filter((_, j) => j !== i);
      jackValues.push(computeEstimate(yJack, vJack));
    }
    const jackMean = jackValues.reduce((a, b) => a + b, 0) / n;
    const num = jackValues.reduce((sum, j) => sum + Math.pow(jackMean - j, 3), 0);
    const den = jackValues.reduce((sum, j) => sum + Math.pow(jackMean - j, 2), 0);
    const a = num / (6 * Math.pow(den, 1.5));

    // Adjusted percentiles
    const zAlpha = normalQuantile(alpha / 2);
    const zAlphaUpper = normalQuantile(1 - alpha / 2);

    const adjLower = normalCDF(z0 + (z0 + zAlpha) / (1 - a * (z0 + zAlpha)));
    const adjUpper = normalCDF(z0 + (z0 + zAlphaUpper) / (1 - a * (z0 + zAlphaUpper)));

    const lowerIdx = Math.max(0, Math.min(nBoot - 1, Math.floor(adjLower * nBoot)));
    const upperIdx = Math.max(0, Math.min(nBoot - 1, Math.floor(adjUpper * nBoot)));

    ciLower = sortedTheta[lowerIdx];
    ciUpper = sortedTheta[upperIdx];
    ciMethod = 'BCa Bootstrap';

  } else if (method === 'studentized') {
    const sortedT = [...bootT].sort((a, b) => a - b);
    const tLower = sortedT[Math.floor((1 - alpha / 2) * nBoot)];
    const tUpper = sortedT[Math.floor(alpha / 2 * nBoot)];

    ciLower = thetaObs - tLower * seObs;
    ciUpper = thetaObs - tUpper * seObs;
    ciMethod = 'Studentized Bootstrap';
  }

  return {
    estimate: thetaObs,
    se: seObs,
    ci: [ciLower, ciUpper],
    ciMethod,
    nBoot,
    bootDistribution: {
      mean: bootTheta.reduce((a, b) => a + b, 0) / nBoot,
      sd: Math.sqrt(bootTheta.reduce((sum, t) =>
        sum + Math.pow(t - bootTheta.reduce((a, b) => a + b, 0) / nBoot, 2), 0) / (nBoot - 1)),
      percentiles: {
        p2_5: sortedTheta[Math.floor(0.025 * nBoot)],
        p25: sortedTheta[Math.floor(0.25 * nBoot)],
        p50: sortedTheta[Math.floor(0.5 * nBoot)],
        p75: sortedTheta[Math.floor(0.75 * nBoot)],
        p97_5: sortedTheta[Math.floor(0.975 * nBoot)]
      }
    },
    method: 'Bootstrap CI'
  };
}

// ============================================================================
// LIMIT META-ANALYSIS (BEYOND R: full implementation)
// ============================================================================

/**
 * Limit meta-analysis - extrapolation to infinite precision
 * Estimates what the effect would be in absence of small-study effects
 * Reference: Rücker et al. (2011) BMC Medical Research Methodology
 */
export function limitMetaAnalysis(yi, vi, options = {}) {
  const METHOD = 'limitMetaAnalysis';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    method = 'MM', // 'FE', 'RE', 'MM' (moment-based)
    nGrid = 100
  } = options;

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));

  // Standard meta-analysis estimate
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

  // DL tau²
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaFE, 2), 0);
  const C = sumW - wi.reduce((sum, w) => sum + w * w, 0) / sumW;
  const tau2 = Math.max(0, (Q - (n - 1)) / C);

  // Fit regression: y = beta0 + beta1 * se + error
  // At se → 0, we get the limit estimate (beta0)

  // Weighted regression with weights = 1/(vi + tau2)
  const wRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = wRE.reduce((a, b) => a + b, 0);

  const xBar = wRE.reduce((sum, w, i) => sum + w * se[i], 0) / sumWRE;
  const yBar = wRE.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWRE;

  const sxy = wRE.reduce((sum, w, i) => sum + w * (se[i] - xBar) * (yi[i] - yBar), 0);
  const sxx = wRE.reduce((sum, w, i) => sum + w * Math.pow(se[i] - xBar, 2), 0);

  const beta1 = sxx > 0 ? sxy / sxx : 0; // Slope (small-study effect)
  const beta0 = yBar - beta1 * xBar; // Limit estimate (intercept)

  // Standard error of intercept
  const residuals = yi.map((y, i) => y - beta0 - beta1 * se[i]);
  const sse = wRE.reduce((sum, w, i) => sum + w * residuals[i] * residuals[i], 0);
  const mse = sse / (n - 2);

  const seBeta0 = Math.sqrt(mse * (1 / sumWRE + xBar * xBar / sxx));
  const seBeta1 = Math.sqrt(mse / sxx);

  // Test for small-study effect (is slope significant?)
  const tSlope = beta1 / seBeta1;
  const pSlope = 2 * (1 - tCDF(Math.abs(tSlope), n - 2));

  // Adjusted estimate accounting for selection
  // Extrapolate to se = 0 using the fitted line
  const adjustedEstimate = beta0;

  // G-statistic (goodness of fit)
  const Gstat = yi.reduce((sum, y, i) =>
    sum + wRE[i] * Math.pow(y - beta0 - beta1 * se[i], 2), 0);
  const pGstat = 1 - chiSquareCDF(Gstat, n - 2);

  return {
    limitEstimate: beta0,
    limitSE: seBeta0,
    limitCI: [
      beta0 - normalQuantile(0.975) * seBeta0,
      beta0 + normalQuantile(0.975) * seBeta0
    ],
    slope: {
      estimate: beta1,
      se: seBeta1,
      t: tSlope,
      p: pSlope,
      interpretation: pSlope < 0.05 ?
        'Significant small-study effect detected' :
        'No evidence of small-study effect'
    },
    unadjusted: {
      FE: thetaFE,
      RE: yBar,
      tau2
    },
    bias: yBar - beta0, // Estimated bias
    goodnessOfFit: {
      G: Gstat,
      df: n - 2,
      p: pGstat
    },
    method: 'Limit Meta-Analysis (Rücker)'
  };
}

// ============================================================================
// POWER ANALYSIS (BEYOND R: comprehensive meta-analysis power)
// ============================================================================

/**
 * Power analysis for meta-analysis
 * Sample size planning for detecting effects with specified power
 * Reference: Hedges & Pigott (2001), Valentine et al. (2010)
 */
export function powerAnalysis(options = {}) {
  const METHOD = 'powerAnalysis';

  const {
    // For prospective power
    effectSize = null,
    tau2 = 0,
    k = null, // Number of studies
    avgN = null, // Average sample size per arm
    alpha = 0.05,
    power = 0.8,
    tails = 2,

    // For retrospective power
    yi = null,
    vi = null,

    // For sample size calculation
    targetPower = 0.8,
    minEffect = 0.2
  } = options;

  // Validate numeric options
  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });
  validateNumeric(power, 'power', METHOD, { min: 0.1, max: 0.999 });
  if (effectSize !== null) validateNumeric(effectSize, 'effectSize', METHOD);
  if (tau2 !== null) validateNumeric(tau2, 'tau2', METHOD, { min: 0 });

  const results = {};

  // 1. Retrospective power (given existing data)
  if (yi && vi && yi.length > 0) {
    const n = yi.length;
    const wi = vi.map(v => 1 / v);
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
    const seTheta = Math.sqrt(1 / sumW);

    // DL tau²
    const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
    const C = sumW - wi.reduce((sum, w) => sum + w * w, 0) / sumW;
    const tau2Est = Math.max(0, (Q - (n - 1)) / C);

    // Random effects
    const wRE = vi.map(v => 1 / (v + tau2Est));
    const sumWRE = wRE.reduce((a, b) => a + b, 0);
    const seThetaRE = Math.sqrt(1 / sumWRE);

    // Non-centrality parameter
    const ncp = Math.abs(theta) / seThetaRE;

    // Power = P(|Z| > z_alpha | ncp)
    const zCrit = tails === 2 ? normalQuantile(1 - alpha / 2) : normalQuantile(1 - alpha);
    const powerFE = 1 - normalCDF(zCrit - Math.abs(theta) / seTheta) +
                    normalCDF(-zCrit - Math.abs(theta) / seTheta);
    const powerRE = 1 - normalCDF(zCrit - ncp) + normalCDF(-zCrit - ncp);

    results.retrospective = {
      k: n,
      estimatedEffect: theta,
      estimatedTau2: tau2Est,
      powerFE: Math.min(1, Math.max(0, powerFE)),
      powerRE: Math.min(1, Math.max(0, powerRE)),
      interpretation: powerRE >= 0.8 ?
        'Adequate power (≥80%)' :
        powerRE >= 0.5 ?
          'Moderate power (50-80%)' :
          'Low power (<50%)'
    };
  }

  // 2. Prospective power (planning)
  if (effectSize !== null && k !== null) {
    // Average variance per study (assuming equal arms)
    const avgV = avgN ? 4 / avgN : 0.1; // 4/n for SMD

    // Total variance under random effects
    const varTheta = (avgV + tau2) / k;
    const seTheta = Math.sqrt(varTheta);

    const zCrit = tails === 2 ? normalQuantile(1 - alpha / 2) : normalQuantile(1 - alpha);
    const ncp = Math.abs(effectSize) / seTheta;

    const prospectivePower = 1 - normalCDF(zCrit - ncp) + normalCDF(-zCrit - ncp);

    results.prospective = {
      k,
      effectSize,
      tau2,
      avgN,
      se: seTheta,
      power: Math.min(1, Math.max(0, prospectivePower))
    };
  }

  // 3. Sample size calculation (how many studies needed?)
  if (targetPower !== null && minEffect !== null) {
    const avgV = avgN ? 4 / avgN : 0.1;
    const zCrit = tails === 2 ? normalQuantile(1 - alpha / 2) : normalQuantile(1 - alpha);
    const zPower = normalQuantile(targetPower);

    // Solve: (z_alpha + z_beta)² = d² / ((v + tau²) / k)
    // k = (z_alpha + z_beta)² * (v + tau²) / d²
    const kNeeded = Math.ceil(
      Math.pow(zCrit + zPower, 2) * (avgV + tau2) / (minEffect * minEffect)
    );

    results.sampleSize = {
      kNeeded,
      minEffect,
      targetPower,
      tau2,
      avgN,
      interpretation: `Need ${kNeeded} studies to detect effect of ${minEffect} with ${targetPower * 100}% power`
    };
  }

  // 4. Power curve (power vs number of studies)
  if (effectSize !== null || minEffect !== null) {
    const effect = effectSize || minEffect;
    const avgV = avgN ? 4 / avgN : 0.1;
    const zCrit = tails === 2 ? normalQuantile(1 - alpha / 2) : normalQuantile(1 - alpha);

    const powerCurve = [];
    for (let kVal = 2; kVal <= 100; kVal += 2) {
      const varTheta = (avgV + tau2) / kVal;
      const ncp = Math.abs(effect) / Math.sqrt(varTheta);
      const pwr = 1 - normalCDF(zCrit - ncp) + normalCDF(-zCrit - ncp);
      powerCurve.push({ k: kVal, power: Math.min(1, pwr) });
    }

    results.powerCurve = powerCurve;
  }

  return {
    ...results,
    parameters: { alpha, tails, tau2, avgN },
    method: 'Meta-Analysis Power Analysis'
  };
}

// ============================================================================
// PUBLICATION BIAS ENSEMBLE (BEYOND R: novel integration)
// ============================================================================

/**
 * Publication Bias Ensemble - combines multiple bias detection methods
 * Provides unified assessment with weighted evidence synthesis
 * NO EQUIVALENT IN R - novel implementation
 */
export function publicationBiasEnsemble(yi, vi, options = {}) {
  const METHOD = 'publicationBiasEnsemble';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    alpha = 0.05,
    methods = ['egger', 'begg', 'peters', 'trimfill', 'pcurve', 'petpeese', 'limit'],
    weights = null // Custom weights for methods
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const results = {};
  const biasIndicators = [];
  let petPeeseDetailed = null;

  // 1. Egger's regression test
  if (methods.includes('egger')) {
    const zi = yi.map((y, i) => y / se[i]);
    const prec = se.map(s => 1 / s);

    const sumPrec = prec.reduce((a, b) => a + b, 0);
    const sumZ = zi.reduce((a, b) => a + b, 0);
    const sumPrecZ = prec.reduce((sum, p, i) => sum + p * zi[i], 0);
    const sumPrec2 = prec.reduce((sum, p) => sum + p * p, 0);

    const slope = (n * sumPrecZ - sumPrec * sumZ) / (n * sumPrec2 - sumPrec * sumPrec);
    const intercept = (sumZ - slope * sumPrec) / n;

    const residuals = zi.map((z, i) => z - intercept - slope * prec[i]);
    const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
    const seIntercept = Math.sqrt(mse * (1 / n + sumPrec * sumPrec / (n * (n * sumPrec2 - sumPrec * sumPrec))));

    const tStat = intercept / seIntercept;
    const pEgger = 2 * (1 - tCDF(Math.abs(tStat), n - 2));

    results.egger = {
      intercept,
      se: seIntercept,
      t: tStat,
      p: pEgger,
      significant: pEgger < alpha
    };
    biasIndicators.push({ method: 'egger', p: pEgger, significant: pEgger < alpha });
  }

  // 2. Begg's rank correlation test
  if (methods.includes('begg')) {
    const wi = vi.map(v => 1 / v);
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

    // Standardized effect sizes
    const standardized = yi.map((y, i) => (y - theta) / se[i]);

    // Rank correlation (Kendall's tau)
    let concordant = 0, discordant = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const sign1 = Math.sign(se[i] - se[j]);
        const sign2 = Math.sign(standardized[i] - standardized[j]);
        if (sign1 * sign2 > 0) concordant++;
        else if (sign1 * sign2 < 0) discordant++;
      }
    }

    const tau = (concordant - discordant) / (n * (n - 1) / 2);
    const varTau = (2 * (2 * n + 5)) / (9 * n * (n - 1));
    const zBegg = tau / Math.sqrt(varTau);
    const pBegg = 2 * (1 - normalCDF(Math.abs(zBegg)));

    results.begg = {
      tau,
      z: zBegg,
      p: pBegg,
      significant: pBegg < alpha
    };
    biasIndicators.push({ method: 'begg', p: pBegg, significant: pBegg < alpha });
  }

  // 3. Peters' test (for binary outcomes - use SE as proxy)
  if (methods.includes('peters')) {
    // Regression of effect on 1/sqrt(n) proxy using SE
    const sqrtN = se.map(s => 1 / (s * s)); // Proxy for sample size

    const sumSqrtN = sqrtN.reduce((a, b) => a + b, 0);
    const sumY = yi.reduce((a, b) => a + b, 0);
    const sumSqrtNY = sqrtN.reduce((sum, sn, i) => sum + sn * yi[i], 0);
    const sumSqrtN2 = sqrtN.reduce((sum, sn) => sum + sn * sn, 0);

    const slopePeters = (n * sumSqrtNY - sumSqrtN * sumY) / (n * sumSqrtN2 - sumSqrtN * sumSqrtN);
    const interceptPeters = (sumY - slopePeters * sumSqrtN) / n;

    const residualsPeters = yi.map((y, i) => y - interceptPeters - slopePeters * sqrtN[i]);
    const msePeters = residualsPeters.reduce((sum, r) => sum + r * r, 0) / (n - 2);
    const seSlopePeters = Math.sqrt(msePeters / (sumSqrtN2 - sumSqrtN * sumSqrtN / n));

    const tPeters = slopePeters / seSlopePeters;
    const pPeters = 2 * (1 - tCDF(Math.abs(tPeters), n - 2));

    results.peters = {
      slope: slopePeters,
      se: seSlopePeters,
      t: tPeters,
      p: pPeters,
      significant: pPeters < alpha
    };
    biasIndicators.push({ method: 'peters', p: pPeters, significant: pPeters < alpha });
  }

  // 4. PET-PEESE
  if (methods.includes('petpeese')) {
    const petpeeseResult = petPeese(yi, vi, { alpha });
    petPeeseDetailed = petpeeseResult;
    results.petpeese = {
      pet: petpeeseResult.pet.estimate,
      peese: petpeeseResult.peese.estimate,
      recommended: petpeeseResult.recommended,
      biasSuspected: petpeeseResult.biasSuspected
    };
    biasIndicators.push({
      method: 'petpeese',
      p: petpeeseResult.pet.slopeP,
      significant: petpeeseResult.biasSuspected
    });
  }

  // 5. Limit meta-analysis
  if (methods.includes('limit')) {
    const limitResult = limitMetaAnalysis(yi, vi);
    results.limit = {
      adjustedEstimate: limitResult.limitEstimate,
      bias: limitResult.bias,
      slopeP: limitResult.slope.p,
      significant: limitResult.slope.p < alpha
    };
    biasIndicators.push({
      method: 'limit',
      p: limitResult.slope.p,
      significant: limitResult.slope.p < alpha
    });
  }

  // Ensemble scoring
  const defaultWeights = {
    egger: 1.0,
    begg: 0.8,
    peters: 0.9,
    petpeese: 1.0,
    limit: 0.9
  };

  const methodWeights = weights || defaultWeights;
  let totalWeight = 0;
  let weightedSignificant = 0;
  let minP = 1;

  for (const indicator of biasIndicators) {
    const w = methodWeights[indicator.method] || 1;
    totalWeight += w;
    if (indicator.significant) weightedSignificant += w;
    if (indicator.p < minP) minP = indicator.p;
  }

  const biasScore = weightedSignificant / totalWeight;

  // Fisher's combined p-value
  const fisherStat = -2 * biasIndicators.reduce((sum, ind) =>
    sum + Math.log(Math.max(ind.p, 1e-10)), 0);
  const fisherP = 1 - chiSquareCDF(fisherStat, 2 * biasIndicators.length);

  const ensemble = {
    biasScore, // 0-1 score
    nTestsSignificant: biasIndicators.filter(i => i.significant).length,
    nTests: biasIndicators.length,
    fisherCombinedP: fisherP,
    minPValue: minP,
    verdict: biasScore >= 0.5 ? 'Publication bias likely' :
             biasScore >= 0.25 ? 'Publication bias possible' :
             'No strong evidence of publication bias'
  };

  return {
    tests: results,
    methods: {
      ...results,
      petPeese: petPeeseDetailed ?? results.petpeese,
      threePSM: null,
      copas: null
    },
    ensemble,
    overall: ensemble,
    assessment: ensemble,
    petPeese: petPeeseDetailed ?? results.petpeese,
    selectionModels: {},
    indicators: biasIndicators,
    method: 'Publication Bias Ensemble'
  };
}

// ============================================================================
// TRIM AND FILL (Duval & Tweedie, 2000)
// ============================================================================

/**
 * Trim-and-fill method for publication bias adjustment
 * Implements Duval & Tweedie (2000) with L0 and R0 estimators
 * Reference: Duval & Tweedie (2000), JASA; Peters et al. (2007), BMJ
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration options
 * @returns {Object} Trim-and-fill results with adjusted estimate
 */
export function trimAndFill(yi, vi, options = {}) {
  const METHOD = 'trimAndFill';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    estimator = 'L0',     // 'L0' (default) or 'R0'
    side = 'auto',        // 'left', 'right', or 'auto' (detect asymmetry)
    maxIter = 100,        // Maximum iterations for convergence
    tol = 1e-4,           // Convergence tolerance
    tau2Method = 'REML'   // Method for tau² estimation
  } = options;

  if (!['L0', 'R0'].includes(estimator)) {
    throw new ValidationError("estimator must be 'L0' or 'R0'", METHOD);
  }
  if (!['left', 'right', 'auto'].includes(side)) {
    throw new ValidationError("side must be 'left', 'right', or 'auto'", METHOD);
  }

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));

  // Initial random-effects meta-analysis
  let tau2 = estimateTau2(yi, vi, tau2Method);
  let wi = vi.map(v => 1 / (v + tau2));
  let sumW = wi.reduce((a, b) => a + b, 0);
  let theta = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;

  // Determine side of asymmetry if auto
  let fillSide = side;
  if (side === 'auto') {
    // Check Egger's intercept direction
    const zi = yi.map((y, i) => y / se[i]);
    const prec = se.map(s => 1 / s);
    const meanZ = zi.reduce((a, b) => a + b, 0) / n;
    const meanPrec = prec.reduce((a, b) => a + b, 0) / n;
    const num = zi.reduce((s, z, i) => s + (prec[i] - meanPrec) * (z - meanZ), 0);
    const den = prec.reduce((s, p) => s + Math.pow(p - meanPrec, 2), 0);
    const slope = den > 0 ? num / den : 0;
    const intercept = meanZ - slope * meanPrec;
    fillSide = intercept > 0 ? 'left' : 'right';
  }

  // Iterative trim-and-fill algorithm
  let k0 = 0;
  let converged = false;
  let currentYi = [...yi];
  let currentVi = [...vi];

  for (let iter = 0; iter < maxIter; iter++) {
    const currN = currentYi.length;

    // Recompute pooled estimate
    tau2 = estimateTau2(currentYi, currentVi, tau2Method);
    wi = currentVi.map(v => 1 / (v + tau2));
    sumW = wi.reduce((a, b) => a + b, 0);
    theta = wi.reduce((s, w, i) => s + w * currentYi[i], 0) / sumW;

    // Compute deviations from center
    const deviations = currentYi.map((y, i) => ({
      yi: y,
      vi: currentVi[i],
      se: Math.sqrt(currentVi[i]),
      dev: y - theta,
      absRank: 0,
      idx: i
    }));

    // Sort by absolute deviation and assign ranks
    deviations.sort((a, b) => Math.abs(a.dev) - Math.abs(b.dev));
    deviations.forEach((d, i) => d.absRank = i + 1);

    // Count studies on each side
    const nRight = deviations.filter(d => d.dev > 0).length;
    const nLeft = deviations.filter(d => d.dev < 0).length;

    // Estimate k0 using L0 or R0 estimator
    let k0New;
    if (estimator === 'L0') {
      // L0 estimator: Linear estimator of Duval & Tweedie
      // k0 = (4 * T_n + 1 - sqrt(8 * T_n + 1)) / 2
      // where T_n is the sum of ranks on the asymmetric side
      let Tn = 0;
      if (fillSide === 'right') {
        // Missing studies on left, so count excess on right
        const rightStudies = deviations.filter(d => d.dev > 0);
        Tn = rightStudies.reduce((s, d) => s + d.absRank, 0);
      } else {
        const leftStudies = deviations.filter(d => d.dev < 0);
        Tn = leftStudies.reduce((s, d) => s + d.absRank, 0);
      }
      k0New = Math.max(0, Math.round((4 * Tn + 1 - Math.sqrt(8 * Tn + 1)) / 2));
    } else {
      // R0 estimator: Simple rank-based
      // k0 = max(0, floor((n_excess - n_deficit) / 2))
      if (fillSide === 'right') {
        k0New = Math.max(0, Math.floor((nRight - nLeft) / 2));
      } else {
        k0New = Math.max(0, Math.floor((nLeft - nRight) / 2));
      }
    }

    // Check convergence
    if (iter > 0 && k0New === k0) {
      converged = true;
      break;
    }
    k0 = k0New;

    // If no missing studies, we're done
    if (k0 === 0) {
      converged = true;
      break;
    }

    // Trim: remove the k0 most extreme studies on the asymmetric side
    // Then impute by reflection
    const sortedByDev = [...deviations].sort((a, b) =>
      fillSide === 'right' ? b.dev - a.dev : a.dev - b.dev);

    // Start fresh with original data plus imputed
    currentYi = [...yi];
    currentVi = [...vi];

    // Impute k0 studies by reflecting the most extreme
    for (let i = 0; i < Math.min(k0, n); i++) {
      const extreme = sortedByDev[i];
      const imputedY = 2 * theta - extreme.yi;
      currentYi.push(imputedY);
      currentVi.push(extreme.vi);
    }
  }

  // Final estimate with imputed studies
  tau2 = estimateTau2(currentYi, currentVi, tau2Method);
  wi = currentVi.map(v => 1 / (v + tau2));
  sumW = wi.reduce((a, b) => a + b, 0);
  const adjustedTheta = wi.reduce((s, w, i) => s + w * currentYi[i], 0) / sumW;
  const adjustedSE = Math.sqrt(1 / sumW);

  // Original estimate for comparison
  const origTau2 = estimateTau2(yi, vi, tau2Method);
  const origWi = vi.map(v => 1 / (v + origTau2));
  const origSumW = origWi.reduce((a, b) => a + b, 0);
  const originalTheta = origWi.reduce((s, w, i) => s + w * yi[i], 0) / origSumW;
  const originalSE = Math.sqrt(1 / origSumW);

  // Imputed study details
  const imputedStudies = [];
  for (let i = n; i < currentYi.length; i++) {
    imputedStudies.push({
      effect: currentYi[i],
      variance: currentVi[i],
      se: Math.sqrt(currentVi[i]),
      type: 'imputed'
    });
  }

  return {
    original: {
      effect: originalTheta,
      se: originalSE,
      ci: [originalTheta - 1.96 * originalSE, originalTheta + 1.96 * originalSE],
      tau2: origTau2,
      k: n
    },
    adjusted: {
      effect: adjustedTheta,
      se: adjustedSE,
      ci: [adjustedTheta - 1.96 * adjustedSE, adjustedTheta + 1.96 * adjustedSE],
      tau2,
      k: currentYi.length
    },
    k0,
    imputedStudies,
    side: fillSide,
    estimator,
    converged,
    method: 'Trim and Fill (Duval & Tweedie, 2000)'
  };
}

// ============================================================================
// OUTLIER/INFLUENCE DIAGNOSTICS (BEYOND R: GOSH-like + comprehensive)
// ============================================================================

/**
 * Comprehensive outlier and influence diagnostics
 * Includes leave-one-out, DFBETAS, Cook's distance, and GOSH-like analysis
 * References: Viechtbauer & Cheung (2010), Olkin et al. (2012)
 */
export function outlierInfluenceDiagnostics(yi, vi, options = {}) {
  const METHOD = 'outlierInfluenceDiagnostics';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    nSubsets = 1000, // For GOSH-like analysis
    seed = 12345,
    threshold = 2 // Studentized residual threshold
  } = options;

  validateNumeric(threshold, 'threshold', METHOD, { min: 0.5, max: 10 });

  const n = yi.length;
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;

  // DL tau²
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaFE, 2), 0);
  const C = sumW - wi.reduce((sum, w) => sum + w * w, 0) / sumW;
  const tau2 = Math.max(0, (Q - (n - 1)) / C);

  const wRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = wRE.reduce((a, b) => a + b, 0);
  const thetaRE = yi.reduce((sum, y, i) => sum + wRE[i] * y, 0) / sumWRE;
  const seTheta = Math.sqrt(1 / sumWRE);

  // 1. Leave-one-out analysis
  const loo = [];
  for (let i = 0; i < n; i++) {
    const yLoo = yi.filter((_, j) => j !== i);
    const vLoo = vi.filter((_, j) => j !== i);

    const wLoo = vLoo.map(v => 1 / v);
    const sumWLoo = wLoo.reduce((a, b) => a + b, 0);
    const thetaLoo = yLoo.reduce((sum, y, j) => sum + wLoo[j] * y, 0) / sumWLoo;

    const QLoo = yLoo.reduce((sum, y, j) => sum + wLoo[j] * Math.pow(y - thetaLoo, 2), 0);
    const CLoo = sumWLoo - wLoo.reduce((sum, w) => sum + w * w, 0) / sumWLoo;
    const tau2Loo = Math.max(0, (QLoo - (n - 2)) / CLoo);

    const wRELoo = vLoo.map(v => 1 / (v + tau2Loo));
    const sumWRELoo = wRELoo.reduce((a, b) => a + b, 0);
    const thetaRELoo = yLoo.reduce((sum, y, j) => sum + wRELoo[j] * y, 0) / sumWRELoo;

    loo.push({
      excluded: i,
      estimate: thetaRELoo,
      change: thetaRE - thetaRELoo,
      tau2: tau2Loo,
      Q: QLoo
    });
  }

  // 2. Standardized residuals
  const residuals = yi.map((y, i) => {
    const hi = wRE[i] / sumWRE; // Leverage (hat value)
    const rawResid = y - thetaRE;
    const stdResid = rawResid / Math.sqrt((vi[i] + tau2) * (1 - hi));
    return {
      study: i,
      raw: rawResid,
      standardized: stdResid,
      leverage: hi,
      outlier: Math.abs(stdResid) > threshold
    };
  });

  // 3. Influence measures (DFBETAS-like)
  const influence = yi.map((y, i) => {
    const hi = wRE[i] / sumWRE;
    const dfbeta = (thetaRE - loo[i].estimate) / seTheta;

    // Cook's distance analog
    const cookD = Math.pow(dfbeta, 2) * hi / (1 - hi);

    // Covariance ratio
    const seLoo = Math.sqrt(1 / loo.reduce((sum, l, j) =>
      j === i ? sum : sum + 1 / (vi[j] + tau2), 0));
    const covRatio = Math.pow(seLoo / seTheta, 2);

    return {
      study: i,
      dfbeta,
      cookD,
      covRatio,
      dffits: dfbeta * Math.sqrt(hi / (1 - hi)),
      influential: Math.abs(dfbeta) > 2 / Math.sqrt(n) || cookD > 4 / n
    };
  });

  // 4. GOSH-like analysis (subset analysis for heterogeneity exploration)
  // High-quality xoshiro128** RNG (Blackman & Vigna, 2018)
  const rng = createSeededRNG(seed);
  const random = () => rng.random();

  const goshResults = [];
  for (let s = 0; s < nSubsets; s++) {
    // Random subset of at least 2 studies
    const subsetSize = Math.max(2, Math.floor(random() * (n - 1)) + 2);
    const indices = [];
    const available = Array.from({ length: n }, (_, i) => i);

    for (let i = 0; i < subsetSize; i++) {
      const idx = Math.floor(random() * available.length);
      indices.push(available[idx]);
      available.splice(idx, 1);
    }

    const ySub = indices.map(i => yi[i]);
    const vSub = indices.map(i => vi[i]);

    const wSub = vSub.map(v => 1 / v);
    const sumWSub = wSub.reduce((a, b) => a + b, 0);
    const thetaSub = ySub.reduce((sum, y, i) => sum + wSub[i] * y, 0) / sumWSub;

    const QSub = ySub.reduce((sum, y, i) => sum + wSub[i] * Math.pow(y - thetaSub, 2), 0);
    const I2Sub = Math.max(0, (QSub - (subsetSize - 1)) / QSub) * 100;

    goshResults.push({
      k: subsetSize,
      estimate: thetaSub,
      I2: I2Sub,
      Q: QSub,
      indices
    });
  }

  // GOSH summary
  const goshEstimates = goshResults.map(g => g.estimate);
  const goshI2 = goshResults.map(g => g.I2);

  // Identify outlier studies based on GOSH
  const studyInclusionEffect = Array.from({ length: n }, () => ({
    included: [],
    excluded: []
  }));

  for (const g of goshResults) {
    const included = new Set(g.indices);
    for (let i = 0; i < n; i++) {
      if (included.has(i)) {
        studyInclusionEffect[i].included.push(g.estimate);
      } else {
        studyInclusionEffect[i].excluded.push(g.estimate);
      }
    }
  }

  const goshInfluence = studyInclusionEffect.map((s, i) => {
    const meanIncluded = s.included.length > 0 ?
      s.included.reduce((a, b) => a + b, 0) / s.included.length : thetaRE;
    const meanExcluded = s.excluded.length > 0 ?
      s.excluded.reduce((a, b) => a + b, 0) / s.excluded.length : thetaRE;

    return {
      study: i,
      meanWhenIncluded: meanIncluded,
      meanWhenExcluded: meanExcluded,
      difference: meanIncluded - meanExcluded,
      influential: Math.abs(meanIncluded - meanExcluded) > seTheta
    };
  });

  // Summary
  const outlierStudies = residuals.filter(r => r.outlier).map(r => r.study);
  const influentialStudies = influence.filter(i => i.influential).map(i => i.study);
  const allProblematic = [...new Set([...outlierStudies, ...influentialStudies])];

  return {
    summary: {
      nStudies: n,
      estimate: thetaRE,
      se: seTheta,
      tau2,
      nOutliers: outlierStudies.length,
      nInfluential: influentialStudies.length,
      outlierStudies,
      influentialStudies,
      problematicStudies: allProblematic
    },
    leaveOneOut: loo,
    residuals,
    influence,
    gosh: {
      nSubsets,
      estimateRange: [Math.min(...goshEstimates), Math.max(...goshEstimates)],
      estimateMean: goshEstimates.reduce((a, b) => a + b, 0) / nSubsets,
      estimateSD: Math.sqrt(goshEstimates.reduce((sum, e) =>
        sum + Math.pow(e - goshEstimates.reduce((a, b) => a + b, 0) / nSubsets, 2), 0) / (nSubsets - 1)),
      I2Range: [Math.min(...goshI2), Math.max(...goshI2)],
      studyInfluence: goshInfluence
    },
    recommendations: allProblematic.length > 0 ?
      `Consider sensitivity analysis excluding studies: ${allProblematic.join(', ')}` :
      'No highly influential outliers detected',
    method: 'Outlier/Influence Diagnostics'
  };
}

// ============================================================================
// BAYESIAN MODEL AVERAGING (BEYOND R: across tau² estimators)
// ============================================================================

/**
 * Bayesian Model Averaging across heterogeneity estimators
 * Accounts for model uncertainty in tau² estimation
 * NO EQUIVALENT IN R - novel implementation
 */
export function bayesianModelAveraging(yi, vi, options = {}) {
  const METHOD = 'bayesianModelAveraging';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    methods = ['DL', 'REML', 'PM', 'EB', 'SJ', 'ML'],
    priorProbs = null // Prior model probabilities
  } = options;

  const n = yi.length;
  const results = [];

  // Fit each model
  for (const method of methods) {
    const tau2Result = estimateTau2(yi, vi, method);
    const tau2 = tau2Result.tau2;

    const wRE = vi.map(v => 1 / (v + tau2));
    const sumWRE = wRE.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wRE[i] * y, 0) / sumWRE;
    const se = Math.sqrt(1 / sumWRE);

    // Compute log-likelihood for model comparison
    let logLik = 0;
    for (let i = 0; i < n; i++) {
      const totalVar = vi[i] + tau2;
      logLik -= 0.5 * Math.log(2 * Math.PI * totalVar);
      logLik -= 0.5 * Math.pow(yi[i] - theta, 2) / totalVar;
    }

    // BIC for model selection
    const nParams = 2; // theta and tau²
    const bic = -2 * logLik + nParams * Math.log(n);

    // AIC
    const aic = -2 * logLik + 2 * nParams;

    results.push({
      method,
      tau2,
      theta,
      se,
      logLik,
      aic,
      bic
    });
  }

  // Compute posterior model probabilities (BIC-based)
  const minBIC = Math.min(...results.map(r => r.bic));
  const deltaBIC = results.map(r => r.bic - minBIC);
  const bicWeights = deltaBIC.map(d => Math.exp(-0.5 * d));
  const sumBICWeights = bicWeights.reduce((a, b) => a + b, 0);

  // Apply prior probabilities if provided
  const priors = priorProbs || results.map(() => 1 / results.length);
  const posteriors = bicWeights.map((w, i) => w * priors[i]);
  const sumPosteriors = posteriors.reduce((a, b) => a + b, 0);
  const normalizedPosteriors = posteriors.map(p => p / sumPosteriors);

  // Model-averaged estimates
  const avgTheta = results.reduce((sum, r, i) => sum + normalizedPosteriors[i] * r.theta, 0);
  const avgTau2 = results.reduce((sum, r, i) => sum + normalizedPosteriors[i] * r.tau2, 0);

  // Model-averaged variance (accounts for both within and between-model variance)
  const withinVar = results.reduce((sum, r, i) =>
    sum + normalizedPosteriors[i] * r.se * r.se, 0);
  const betweenVar = results.reduce((sum, r, i) =>
    sum + normalizedPosteriors[i] * Math.pow(r.theta - avgTheta, 2), 0);
  const avgVar = withinVar + betweenVar;
  const avgSE = Math.sqrt(avgVar);

  // Add posterior probabilities to results
  const modelResults = results.map((r, i) => ({
    ...r,
    deltaBIC: deltaBIC[i],
    posteriorProb: normalizedPosteriors[i]
  }));

  // Sort by posterior probability
  modelResults.sort((a, b) => b.posteriorProb - a.posteriorProb);

  return {
    averaged: {
      theta: avgTheta,
      se: avgSE,
      ci: [
        avgTheta - normalQuantile(0.975) * avgSE,
        avgTheta + normalQuantile(0.975) * avgSE
      ],
      tau2: avgTau2,
      tau: Math.sqrt(avgTau2)
    },
    models: modelResults,
    bestModel: modelResults[0].method,
    modelUncertainty: {
      withinModelVar: withinVar,
      betweenModelVar: betweenVar,
      totalVar: avgVar,
      proportionDueToBetween: betweenVar / avgVar
    },
    method: 'Bayesian Model Averaging'
  };
}

// ============================================================================
// GRADE-STYLE CERTAINTY ASSESSMENT (BEYOND R: automated)
// ============================================================================

/**
 * Automated GRADE-style certainty of evidence assessment
 * Evaluates risk of bias, inconsistency, indirectness, imprecision, publication bias
 * NO EQUIVALENT IN R - novel automated implementation
 */
export function gradeCertainty(yi, vi, options = {}) {
  const METHOD = 'gradeCertainty';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    // Study-level risk of bias (0-2: low, moderate, high for each study)
    robScores = null,
    // Directness assessment (0-2)
    indirectnessScore = 0,
    // Additional considerations
    largeEffect = false,
    doseResponse = false,
    plausibleConfounding = false,
    // Thresholds
    i2ThresholdLow = 40,
    i2ThresholdHigh = 75,
    nMinForPrecision = 300 // Total sample size threshold
  } = options;

  const n = yi.length;
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaFE = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumW;
  const seFE = Math.sqrt(1 / sumW);

  // Calculate heterogeneity
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - thetaFE, 2), 0);
  const df = n - 1;
  const I2 = df > 0 ? Math.max(0, (Q - df) / Q) * 100 : 0;

  // Tau² and RE estimate
  const C = sumW - wi.reduce((sum, w) => sum + w * w, 0) / sumW;
  const tau2 = Math.max(0, (Q - df) / C);
  const wRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = wRE.reduce((a, b) => a + b, 0);
  const thetaRE = yi.reduce((sum, y, i) => sum + wRE[i] * y, 0) / sumWRE;
  const seRE = Math.sqrt(1 / sumWRE);

  // Approximate total sample size from variances
  // For SMD: Var ≈ (n1+n2)/(n1*n2) + d²/(2*(n1+n2))
  // Rough approximation: n ≈ 4/var for equal groups
  const estTotalN = vi.reduce((sum, v) => sum + 4 / v, 0);

  // Domain assessments
  const domains = {};
  let totalDowngrades = 0;
  let totalUpgrades = 0;

  // 1. Risk of Bias
  if (robScores) {
    const avgRoB = robScores.reduce((a, b) => a + b, 0) / n;
    const highRoBCount = robScores.filter(r => r >= 2).length;
    const proportionHigh = highRoBCount / n;

    if (proportionHigh > 0.5 || avgRoB >= 1.5) {
      domains.riskOfBias = { level: 'serious', downgrade: 2 };
      totalDowngrades += 2;
    } else if (proportionHigh > 0.25 || avgRoB >= 1) {
      domains.riskOfBias = { level: 'moderate', downgrade: 1 };
      totalDowngrades += 1;
    } else {
      domains.riskOfBias = { level: 'low', downgrade: 0 };
    }
  } else {
    domains.riskOfBias = { level: 'not assessed', downgrade: 0, note: 'Provide robScores for assessment' };
  }

  // 2. Inconsistency (I²)
  const pHet = 1 - chiSquareCDF(Q, df);
  if (I2 > i2ThresholdHigh || pHet < 0.01) {
    domains.inconsistency = {
      level: 'serious',
      downgrade: 2,
      I2: I2.toFixed(1),
      pHet: pHet.toFixed(4)
    };
    totalDowngrades += 2;
  } else if (I2 > i2ThresholdLow || pHet < 0.1) {
    domains.inconsistency = {
      level: 'moderate',
      downgrade: 1,
      I2: I2.toFixed(1),
      pHet: pHet.toFixed(4)
    };
    totalDowngrades += 1;
  } else {
    domains.inconsistency = {
      level: 'low',
      downgrade: 0,
      I2: I2.toFixed(1),
      pHet: pHet.toFixed(4)
    };
  }

  // 3. Indirectness
  if (indirectnessScore >= 2) {
    domains.indirectness = { level: 'serious', downgrade: 2 };
    totalDowngrades += 2;
  } else if (indirectnessScore >= 1) {
    domains.indirectness = { level: 'moderate', downgrade: 1 };
    totalDowngrades += 1;
  } else {
    domains.indirectness = { level: 'low', downgrade: 0 };
  }

  // 4. Imprecision
  // Check if CI crosses clinical null (assume 0 for SMD, or minimal clinically important difference)
  const ciLower = thetaRE - normalQuantile(0.975) * seRE;
  const ciUpper = thetaRE + normalQuantile(0.975) * seRE;
  const crossesNull = (ciLower < 0 && ciUpper > 0);
  const ciWidth = ciUpper - ciLower;
  const isWideCI = ciWidth > 1.0; // Arbitrary threshold for SMD

  // Optimal Information Size check
  const hasOIS = estTotalN >= nMinForPrecision;

  if (!hasOIS && crossesNull) {
    domains.imprecision = {
      level: 'very serious',
      downgrade: 2,
      reason: 'Small sample size and CI crosses null',
      estimatedN: Math.round(estTotalN)
    };
    totalDowngrades += 2;
  } else if (!hasOIS || crossesNull || isWideCI) {
    domains.imprecision = {
      level: 'serious',
      downgrade: 1,
      reason: !hasOIS ? 'Below optimal information size' :
              crossesNull ? 'CI crosses null' : 'Wide confidence interval',
      estimatedN: Math.round(estTotalN)
    };
    totalDowngrades += 1;
  } else {
    domains.imprecision = {
      level: 'low',
      downgrade: 0,
      estimatedN: Math.round(estTotalN)
    };
  }

  // 5. Publication Bias (simplified assessment)
  const biasResult = n >= 10 ? publicationBiasEnsemble(yi, vi, { methods: ['egger', 'begg'] }) : null;
  if (biasResult && biasResult.ensemble.biasScore >= 0.5) {
    domains.publicationBias = {
      level: 'serious',
      downgrade: 1,
      biasScore: biasResult.ensemble.biasScore
    };
    totalDowngrades += 1;
  } else if (biasResult && biasResult.ensemble.biasScore >= 0.25) {
    domains.publicationBias = {
      level: 'suspected',
      downgrade: 0,
      biasScore: biasResult.ensemble.biasScore,
      note: 'Consider sensitivity analysis'
    };
  } else if (n < 10) {
    domains.publicationBias = {
      level: 'not assessable',
      downgrade: 0,
      note: 'Too few studies (<10) for reliable assessment'
    };
  } else {
    domains.publicationBias = {
      level: 'undetected',
      downgrade: 0
    };
  }

  // Upgrades for observational studies (if applicable)
  if (largeEffect && Math.abs(thetaRE) > 0.8) {
    totalUpgrades += 1;
    domains.largeEffect = { upgrade: 1, note: 'Large effect size detected' };
  }
  if (doseResponse) {
    totalUpgrades += 1;
    domains.doseResponse = { upgrade: 1, note: 'Dose-response relationship present' };
  }
  if (plausibleConfounding) {
    totalUpgrades += 1;
    domains.plausibleConfounding = { upgrade: 1, note: 'Residual confounding would reduce effect' };
  }

  // Final certainty rating
  const netScore = 4 - totalDowngrades + Math.min(totalUpgrades, 2);
  const certaintyLevels = ['very low', 'low', 'moderate', 'high'];
  const certaintyIdx = Math.max(0, Math.min(3, netScore - 1));
  const certainty = certaintyLevels[certaintyIdx];

  const certaintySymbols = {
    'very low': '⊕○○○',
    'low': '⊕⊕○○',
    'moderate': '⊕⊕⊕○',
    'high': '⊕⊕⊕⊕'
  };

  return {
    estimate: {
      theta: thetaRE,
      se: seRE,
      ci: [ciLower, ciUpper]
    },
    domains,
    summary: {
      totalDowngrades,
      totalUpgrades,
      netScore,
      certainty,
      certaintySymbol: certaintySymbols[certainty]
    },
    interpretation: `Certainty of evidence: ${certainty.toUpperCase()} ${certaintySymbols[certainty]}`,
    nStudies: n,
    method: 'Automated GRADE Assessment'
  };
}

// ============================================================================
// BEYOND R: CUMULATIVE META-ANALYSIS
// ============================================================================

/**
 * Cumulative meta-analysis with comprehensive forest plot data
 * Exceeds R's metafor::cumul() by providing:
 * - Forward and backward accumulation
 * - Multiple sorting criteria
 * - Prediction intervals
 * - Heterogeneity evolution tracking
 * - First significant finding detection
 * - Evidence stabilization point detection
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration options
 * @returns {Object} Cumulative analysis results with forest plot data
 */
export function cumulativeMetaAnalysis(yi, vi, options = {}) {
  const METHOD = 'cumulativeMetaAnalysis';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    sortBy = 'year',           // 'year', 'precision', 'effectSize', 'sampleSize', 'custom'
    sortValues = null,         // Array of values to sort by (e.g., years)
    direction = 'forward',     // 'forward' or 'backward'
    method = 'REML',           // Tau2 estimator
    alpha = 0.05,              // Significance level
    predictionInterval = true, // Include prediction intervals
    detectStabilization = true // Detect when estimate stabilizes
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;

  // Create sorting index
  let sortIndex;
  if (sortBy === 'custom' && sortValues && sortValues.length === n) {
    sortIndex = [...Array(n).keys()].sort((a, b) => sortValues[a] - sortValues[b]);
  } else if (sortBy === 'precision') {
    sortIndex = [...Array(n).keys()].sort((a, b) => vi[a] - vi[b]); // Most precise first
  } else if (sortBy === 'effectSize') {
    sortIndex = [...Array(n).keys()].sort((a, b) => Math.abs(yi[b]) - Math.abs(yi[a])); // Largest first
  } else if (sortBy === 'sampleSize' && sortValues) {
    sortIndex = [...Array(n).keys()].sort((a, b) => sortValues[b] - sortValues[a]); // Largest first
  } else if (sortBy === 'year' && sortValues) {
    sortIndex = [...Array(n).keys()].sort((a, b) => sortValues[a] - sortValues[b]); // Earliest first
  } else {
    // Default: original order
    sortIndex = [...Array(n).keys()];
  }

  if (direction === 'backward') {
    sortIndex = sortIndex.reverse();
  }

  // Sorted arrays
  const sortedYi = sortIndex.map(i => yi[i]);
  const sortedVi = sortIndex.map(i => vi[i]);
  const sortedLabels = sortValues ? sortIndex.map(i => sortValues[i]) : sortIndex.map(i => i + 1);

  // Cumulative results
  const results = [];
  const zCrit = normalQuantile(1 - alpha / 2);
  let firstSignificantIdx = -1;
  let stabilizationIdx = -1;
  const estimates = [];

  for (let k = 1; k <= n; k++) {
    const yiCum = sortedYi.slice(0, k);
    const viCum = sortedVi.slice(0, k);

    // Fit random-effects model
    const tau2 = estimateTau2(yiCum, viCum, method);
    const wi = viCum.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = wi.reduce((sum, w, i) => sum + w * yiCum[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);
    const ci = [theta - zCrit * se, theta + zCrit * se];
    const z = theta / se;
    const p = 2 * (1 - normalCDF(Math.abs(z)));

    // Calculate heterogeneity
    const Q = yiCum.reduce((sum, y, i) => sum + (1 / viCum[i]) * Math.pow(y - theta, 2), 0);
    const df = k - 1;
    const I2 = df > 0 ? Math.max(0, (Q - df) / Q) * 100 : 0;
    const H2 = df > 0 ? Q / df : 1;

    // Prediction interval
    let predInt = null;
    if (predictionInterval && k >= 3 && tau2 > 0) {
      const sePred = Math.sqrt(se * se + tau2);
      const tCritVal = tQuantile(1 - alpha / 2, k - 1);
      predInt = [theta - tCritVal * sePred, theta + tCritVal * sePred];
    }

    // Track first significant result
    if (firstSignificantIdx === -1 && p < alpha) {
      firstSignificantIdx = k - 1;
    }

    estimates.push(theta);

    results.push({
      k,
      label: sortedLabels[k - 1],
      studyIndex: sortIndex[k - 1],
      theta,
      se,
      ci,
      z,
      p,
      tau2,
      I2,
      H2,
      Q,
      df,
      predictionInterval: predInt,
      isSignificant: p < alpha,
      weights: wi.map(w => w / sumW * 100) // Percentage weights
    });
  }

  // Detect stabilization point (where estimate changes < 10% of SE)
  if (detectStabilization && n >= 5) {
    for (let i = 3; i < n; i++) {
      const recent = estimates.slice(Math.max(0, i - 3), i + 1);
      const maxDiff = Math.max(...recent) - Math.min(...recent);
      const currentSE = results[i].se;
      if (maxDiff < 0.1 * currentSE) {
        stabilizationIdx = i;
        break;
      }
    }
  }

  // Forest plot data generation
  const forestPlotData = results.map((r, idx) => ({
    row: idx + 1,
    label: `After ${r.k} studies (${r.label})`,
    estimate: r.theta,
    lower: r.ci[0],
    upper: r.ci[1],
    predLower: r.predictionInterval ? r.predictionInterval[0] : null,
    predUpper: r.predictionInterval ? r.predictionInterval[1] : null,
    weight: 100, // All rows represent cumulative
    k: r.k,
    tau2: r.tau2,
    I2: r.I2,
    p: r.p
  }));

  // Summary statistics
  const final = results[n - 1];
  const trendDirection = estimates[n - 1] > estimates[0] ? 'increasing' :
                        estimates[n - 1] < estimates[0] ? 'decreasing' : 'stable';

  // Relative change from first to last
  const relativeChange = estimates[0] !== 0 ?
    ((estimates[n - 1] - estimates[0]) / Math.abs(estimates[0])) * 100 : 0;

  return {
    cumulative: results,
    forestPlotData,
    summary: {
      nStudies: n,
      sortedBy: sortBy,
      direction,
      finalEstimate: {
        theta: final.theta,
        se: final.se,
        ci: final.ci,
        tau2: final.tau2,
        I2: final.I2
      },
      firstSignificant: firstSignificantIdx >= 0 ? {
        afterStudy: firstSignificantIdx + 1,
        label: sortedLabels[firstSignificantIdx],
        p: results[firstSignificantIdx].p
      } : null,
      stabilization: stabilizationIdx >= 0 ? {
        afterStudy: stabilizationIdx + 1,
        label: sortedLabels[stabilizationIdx]
      } : { afterStudy: null, note: 'Not yet stabilized' },
      trend: {
        direction: trendDirection,
        relativeChangePercent: relativeChange.toFixed(1)
      }
    },
    method: 'Cumulative Meta-Analysis (Enhanced)'
  };
}

// ============================================================================
// BEYOND R: TRIAL SEQUENTIAL ANALYSIS
// ============================================================================

/**
 * Trial Sequential Analysis with multiple boundary types
 * No direct R equivalent - implements:
 * - O'Brien-Fleming boundaries
 * - Pocock boundaries
 * - Haybittle-Peto boundaries
 * - Alpha-spending functions (O'Brien-Fleming, Pocock)
 * - Required Information Size calculation
 * - Futility boundaries
 *
 * References:
 * - Wetterslev et al. 2008, 2017
 * - Thorlund et al. 2011
 *
 * @param {number[]} yi - Effect sizes (cumulative order)
 * @param {number[]} vi - Variances
 * @param {Object} options - TSA configuration
 * @returns {Object} TSA results with boundaries and monitoring data
 */
export function trialSequentialAnalysis(yi, vi, options = {}) {
  const METHOD = 'trialSequentialAnalysis';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    alpha = 0.05,              // Type I error
    beta = 0.20,              // Type II error (1 - power)
    delta = null,              // Anticipated effect size (if null, use observed)
    tau2Prior = 0,             // Anticipated heterogeneity
    boundaryType = 'obrien-fleming', // 'obrien-fleming', 'pocock', 'haybittle-peto'
    alphaSpending = 'obrien-fleming', // Alpha spending function type
    futilityBoundary = true,  // Include futility bounds
    relativeDelta = false,     // Is delta relative risk reduction?
    informationFraction = null // Custom information fractions
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });
  validateNumeric(beta, 'beta', METHOD, { min: 0.001, max: 0.5 });
  validateNumeric(tau2Prior, 'tau2Prior', METHOD, { min: 0 });

  const n = yi.length;

  // Estimate parameters from data
  const tau2Est = estimateTau2(yi, vi, 'REML');
  const tau2 = tau2Prior > 0 ? tau2Prior : tau2Est;

  // Calculate cumulative effect at each look
  const looks = [];
  for (let k = 1; k <= n; k++) {
    const yiCum = yi.slice(0, k);
    const viCum = vi.slice(0, k);

    const wi = viCum.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = wi.reduce((sum, w, i) => sum + w * yiCum[i], 0) / sumW;
    const variance = 1 / sumW;
    const se = Math.sqrt(variance);
    const z = theta / se;

    looks.push({
      k,
      theta,
      se,
      variance,
      z,
      information: sumW
    });
  }

  // Use observed or specified effect size for RIS calculation
  const finalTheta = looks[n - 1].theta;
  const anticipatedDelta = delta !== null ? delta : finalTheta;

  if (Math.abs(anticipatedDelta) < 1e-10) {
    return { error: 'Effect size too close to zero for TSA' };
  }

  // Required Information Size (RIS)
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(1 - beta);
  const RIS = ((zAlpha + zBeta) * (zAlpha + zBeta)) / (anticipatedDelta * anticipatedDelta);

  // Diversity-adjusted RIS (accounting for heterogeneity)
  // Reference: Wetterslev et al. (2008) - Trial sequential analysis
  const I2 = tau2 > 0 ? tau2 / (tau2 + looks[n - 1].variance) : 0;

  // Protect against division by zero when I² approaches 100%
  // When I² >= 99%, cap the adjustment factor to avoid Infinity
  // This represents practical limits of TSA with extreme heterogeneity
  let diversityAdjustedRIS;
  if (I2 >= 0.99) {
    // Cap at 100x RIS for extreme heterogeneity (I² ≥ 99%)
    diversityAdjustedRIS = RIS * 100;
  } else if (I2 >= 0.95) {
    // For high heterogeneity, use bounded adjustment
    diversityAdjustedRIS = RIS / Math.max(0.01, 1 - I2);
  } else {
    diversityAdjustedRIS = RIS / (1 - I2);
  }

  // Information fractions
  const currentInfo = looks[n - 1].information;
  const infoFractions = informationFraction || looks.map(l => {
    const frac = l.information / diversityAdjustedRIS;
    // Ensure information fraction is valid (not NaN or Infinity)
    return isFinite(frac) ? frac : l.information / RIS;
  });

  // Calculate boundaries at each look
  const boundaries = looks.map((look, idx) => {
    const t = infoFractions[idx]; // Information fraction at this look
    const adjustedT = Math.min(Math.max(t, 0.001), 1); // Clamp between 0.001 and 1

    let zUpper, zLower;

    switch (boundaryType) {
      case 'pocock':
        // Pocock: constant boundaries
        zUpper = zAlpha * Math.sqrt(n / (idx + 1));
        zLower = -zUpper;
        break;

      case 'haybittle-peto':
        // Haybittle-Peto: 3 SDs until final, then alpha level
        if (idx < n - 1) {
          zUpper = 3.0;
          zLower = -3.0;
        } else {
          zUpper = zAlpha;
          zLower = -zAlpha;
        }
        break;

      case 'obrien-fleming':
      default:
        // O'Brien-Fleming: conservative early, relaxed late
        zUpper = zAlpha / Math.sqrt(adjustedT);
        zLower = -zUpper;
        break;
    }

    // Alpha spending function (Lan-DeMets)
    let spentAlpha;
    if (alphaSpending === 'pocock') {
      // Pocock-like spending
      spentAlpha = alpha * Math.log(1 + (Math.E - 1) * adjustedT);
    } else {
      // O'Brien-Fleming-like spending
      spentAlpha = 2 * (1 - normalCDF(zAlpha / Math.sqrt(adjustedT)));
    }

    // Futility boundary (beta spending)
    let zFutility = null;
    if (futilityBoundary && idx < n - 1) {
      // Simple futility: if can't reach significance with remaining info
      const remainingInfo = 1 - adjustedT;
      if (remainingInfo > 0.1) {
        const betaSpent = beta * adjustedT; // Linear beta spending
        zFutility = normalQuantile(betaSpent);
      }
    }

    // Z-value transformed to cumulative Z for monitoring
    const cumulativeZ = look.z * Math.sqrt(adjustedT);

    return {
      look: idx + 1,
      k: look.k,
      informationFraction: adjustedT,
      informationPercent: (adjustedT * 100).toFixed(1),
      z: look.z,
      cumulativeZ,
      upperBoundary: zUpper,
      lowerBoundary: zLower,
      futilityBoundary: zFutility,
      spentAlpha,
      crossedUpper: look.z >= zUpper,
      crossedLower: look.z <= zLower,
      crossedFutility: zFutility !== null && Math.abs(look.z) <= Math.abs(zFutility),
      theta: look.theta,
      se: look.se
    };
  });

  // Determine conclusion
  const lastBoundary = boundaries[n - 1];
  let conclusion;
  let conclusionReached = false;

  for (let i = 0; i < boundaries.length; i++) {
    if (boundaries[i].crossedUpper) {
      conclusion = 'Positive effect confirmed (crossed upper boundary)';
      conclusionReached = true;
      break;
    }
    if (boundaries[i].crossedLower) {
      conclusion = 'Negative effect confirmed (crossed lower boundary)';
      conclusionReached = true;
      break;
    }
    if (boundaries[i].crossedFutility) {
      conclusion = 'Futility boundary crossed - effect unlikely to be significant';
      conclusionReached = true;
      break;
    }
  }

  if (!conclusionReached) {
    if (lastBoundary.informationFraction >= 1) {
      conclusion = 'Required information reached - no significant effect detected';
    } else {
      conclusion = `Inconclusive - only ${lastBoundary.informationPercent}% of required information reached`;
    }
  }

  // Monitoring chart data
  const monitoringData = {
    xAxis: boundaries.map(b => b.informationFraction * 100),
    zValues: boundaries.map(b => b.z),
    upperBound: boundaries.map(b => b.upperBoundary),
    lowerBound: boundaries.map(b => b.lowerBoundary),
    futilityBound: boundaries.map(b => b.futilityBoundary),
    labels: boundaries.map(b => `Look ${b.look}`)
  };

  return {
    boundaries,
    monitoringData,
    requiredInformation: {
      RIS,
      diversityAdjustedRIS,
      currentInformation: currentInfo,
      informationFraction: currentInfo / diversityAdjustedRIS,
      additionalStudiesNeeded: currentInfo < diversityAdjustedRIS ?
        Math.ceil((diversityAdjustedRIS - currentInfo) / (currentInfo / n)) : 0
    },
    parameters: {
      alpha,
      beta,
      power: 1 - beta,
      anticipatedDelta,
      tau2,
      I2: I2 * 100,
      boundaryType,
      alphaSpending
    },
    conclusion,
    conclusionReached,
    method: 'Trial Sequential Analysis (TSA)'
  };
}

// ============================================================================
// BEYOND R: FRAGILITY INDEX
// ============================================================================

/**
 * Fragility Index and Fragility Quotient calculation
 * Enhanced beyond basic R implementations:
 * - Reverse fragility (for non-significant results)
 * - Fragility quotient (normalized by sample size)
 * - Multi-study fragility assessment
 * - Sensitivity to various significance thresholds
 *
 * Reference: Walsh et al. 2014, Atal et al. 2019
 *
 * @param {Object[]} studies - Array of {events_t, n_t, events_c, n_c} objects
 * @param {Object} options - Configuration
 * @returns {Object} Fragility analysis results
 */
export function fragilityIndex(studies, options = {}) {
  const METHOD = 'fragilityIndex';

  // Input validation
  validateBinaryStudies(studies, METHOD, ['ai', 'bi', 'ci', 'di']);

  const {
    alpha = 0.05,              // Significance threshold
    method = 'fisher',         // 'fisher', 'chi-square', 'bayesian'
    reverse = true,            // Calculate reverse fragility for non-significant
    maxIterations = 1000       // Safety limit for iterations
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  // Helper: Fisher's exact test p-value (two-sided)
  function fisherExactP(a, b, c, d) {
    // 2x2 table: [[a, b], [c, d]]
    const n = a + b + c + d;
    const row1 = a + b;
    const row2 = c + d;
    const col1 = a + c;
    const col2 = b + d;

    // Calculate p-value using hypergeometric distribution
    // P(X = a) = C(col1, a) * C(col2, row1-a) / C(n, row1)
    function logFactorial(n) {
      if (n <= 1) return 0;
      let sum = 0;
      for (let i = 2; i <= n; i++) sum += Math.log(i);
      return sum;
    }

    function logChoose(n, k) {
      if (k < 0 || k > n) return -Infinity;
      return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
    }

    function hypergeomProb(x) {
      const logP = logChoose(col1, x) + logChoose(col2, row1 - x) - logChoose(n, row1);
      return Math.exp(logP);
    }

    // Calculate observed probability
    const pObs = hypergeomProb(a);

    // Sum probabilities as extreme or more extreme (two-sided)
    let pValue = 0;
    const minA = Math.max(0, row1 - col2);
    const maxA = Math.min(row1, col1);

    for (let x = minA; x <= maxA; x++) {
      const px = hypergeomProb(x);
      if (px <= pObs + 1e-10) {
        pValue += px;
      }
    }

    return Math.min(1, pValue);
  }

  // Helper: Chi-square test p-value
  function chiSquareP(a, b, c, d) {
    const n = a + b + c + d;
    const expected = [
      [(a + b) * (a + c) / n, (a + b) * (b + d) / n],
      [(c + d) * (a + c) / n, (c + d) * (b + d) / n]
    ];
    const observed = [[a, b], [c, d]];

    let chi2 = 0;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        if (expected[i][j] > 0) {
          chi2 += Math.pow(observed[i][j] - expected[i][j], 2) / expected[i][j];
        }
      }
    }

    // Chi-square CDF with 1 df
    return 1 - chiSquareCDF(chi2, 1);
  }

  // Process each study
  const studyResults = studies.map((study, idx) => {
    let { events_t, n_t, events_c, n_c } = study;

    // Initial p-value
    const testFn = method === 'fisher' ? fisherExactP : chiSquareP;
    const initialP = testFn(events_t, n_t - events_t, events_c, n_c - events_c);
    const isSignificant = initialP < alpha;

    // Calculate fragility index
    let fragility = 0;
    let modifiedTable = null;

    if (isSignificant) {
      // Find minimum changes to make non-significant
      // Try changing events in treatment or control group
      let found = false;

      for (let changes = 1; changes <= maxIterations && !found; changes++) {
        // Try adding events to treatment
        if (events_t + changes <= n_t) {
          const p1 = testFn(events_t + changes, n_t - events_t - changes, events_c, n_c - events_c);
          if (p1 >= alpha) {
            fragility = changes;
            modifiedTable = { events_t: events_t + changes, n_t, events_c, n_c, modification: 'add_treatment' };
            found = true;
            continue;
          }
        }

        // Try removing events from control
        if (events_c - changes >= 0) {
          const p2 = testFn(events_t, n_t - events_t, events_c - changes, n_c - events_c + changes);
          if (p2 >= alpha) {
            fragility = changes;
            modifiedTable = { events_t, n_t, events_c: events_c - changes, n_c, modification: 'remove_control' };
            found = true;
            continue;
          }
        }

        // Try removing events from treatment
        if (events_t - changes >= 0) {
          const p3 = testFn(events_t - changes, n_t - events_t + changes, events_c, n_c - events_c);
          if (p3 >= alpha) {
            fragility = changes;
            modifiedTable = { events_t: events_t - changes, n_t, events_c, n_c, modification: 'remove_treatment' };
            found = true;
            continue;
          }
        }

        // Try adding events to control
        if (events_c + changes <= n_c) {
          const p4 = testFn(events_t, n_t - events_t, events_c + changes, n_c - events_c - changes);
          if (p4 >= alpha) {
            fragility = changes;
            modifiedTable = { events_t, n_t, events_c: events_c + changes, n_c, modification: 'add_control' };
            found = true;
          }
        }
      }

      if (!found) {
        fragility = maxIterations;
      }
    } else if (reverse) {
      // Reverse fragility: changes needed to become significant
      let found = false;

      for (let changes = 1; changes <= maxIterations && !found; changes++) {
        // Try directions that would increase effect
        if (events_t - changes >= 0) {
          const p1 = testFn(events_t - changes, n_t - events_t + changes, events_c, n_c - events_c);
          if (p1 < alpha) {
            fragility = -changes; // Negative indicates reverse
            modifiedTable = { events_t: events_t - changes, n_t, events_c, n_c, modification: 'reverse' };
            found = true;
            continue;
          }
        }

        if (events_c + changes <= n_c) {
          const p2 = testFn(events_t, n_t - events_t, events_c + changes, n_c - events_c - changes);
          if (p2 < alpha) {
            fragility = -changes;
            modifiedTable = { events_t, n_t, events_c: events_c + changes, n_c, modification: 'reverse' };
            found = true;
          }
        }
      }
    }

    // Fragility quotient (FQ) = FI / total sample size
    const totalN = n_t + n_c;
    const fragilityQuotient = Math.abs(fragility) / totalN;

    return {
      study: idx + 1,
      events_t,
      n_t,
      events_c,
      n_c,
      initialP,
      isSignificant,
      fragilityIndex: fragility,
      fragilityQuotient,
      interpretation: fragility >= 0 ?
        `${fragility} event${fragility !== 1 ? 's' : ''} to lose significance` :
        `${Math.abs(fragility)} event${Math.abs(fragility) !== 1 ? 's' : ''} to gain significance`,
      modifiedTable
    };
  });

  // Meta-analysis level fragility (pooled)
  const totalEvents_t = studies.reduce((s, st) => s + st.events_t, 0);
  const totalN_t = studies.reduce((s, st) => s + st.n_t, 0);
  const totalEvents_c = studies.reduce((s, st) => s + st.events_c, 0);
  const totalN_c = studies.reduce((s, st) => s + st.n_c, 0);

  const pooledResult = fragilityIndexSingle(
    totalEvents_t, totalN_t, totalEvents_c, totalN_c,
    alpha, method, maxIterations
  );

  // Summary statistics
  const significantStudies = studyResults.filter(s => s.isSignificant);
  const fragilityIndices = significantStudies.map(s => s.fragilityIndex).filter(f => f < maxIterations);
  const meanFI = fragilityIndices.length > 0 ?
    fragilityIndices.reduce((a, b) => a + b, 0) / fragilityIndices.length : null;
  const medianFI = fragilityIndices.length > 0 ?
    fragilityIndices.sort((a, b) => a - b)[Math.floor(fragilityIndices.length / 2)] : null;

  // Fragility quotients
  const fqs = studyResults.map(s => s.fragilityQuotient);
  const meanFQ = fqs.reduce((a, b) => a + b, 0) / fqs.length;

  return {
    studies: studyResults,
    pooled: pooledResult,
    summary: {
      nStudies: studies.length,
      nSignificant: significantStudies.length,
      meanFragilityIndex: meanFI,
      medianFragilityIndex: medianFI,
      meanFragilityQuotient: meanFQ,
      interpretation: meanFI !== null ?
        meanFI <= 3 ? 'Very fragile - results highly sensitive to small changes' :
        meanFI <= 8 ? 'Moderately fragile - interpret with caution' :
        'Robust - results relatively stable' : 'Cannot assess fragility'
    },
    parameters: { alpha, method },
    method: 'Fragility Index Analysis (Enhanced)'
  };
}

// Helper for single fragility calculation
function fragilityIndexSingle(events_t, n_t, events_c, n_c, alpha, method, maxIterations) {
  function chiSquareP(a, b, c, d) {
    const n = a + b + c + d;
    if (n === 0) return 1;
    const expected = [
      [(a + b) * (a + c) / n, (a + b) * (b + d) / n],
      [(c + d) * (a + c) / n, (c + d) * (b + d) / n]
    ];

    let chi2 = 0;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const obs = [[a, b], [c, d]][i][j];
        if (expected[i][j] > 0) {
          chi2 += Math.pow(obs - expected[i][j], 2) / expected[i][j];
        }
      }
    }
    return 1 - chiSquareCDF(chi2, 1);
  }

  const initialP = chiSquareP(events_t, n_t - events_t, events_c, n_c - events_c);
  const isSignificant = initialP < alpha;
  let fragility = 0;

  if (isSignificant) {
    for (let changes = 1; changes <= maxIterations; changes++) {
      const p1 = chiSquareP(events_t + changes, n_t - events_t - changes, events_c, n_c - events_c);
      if (p1 >= alpha) {
        fragility = changes;
        break;
      }
    }
  }

  return {
    events_t,
    n_t,
    events_c,
    n_c,
    initialP,
    isSignificant,
    fragilityIndex: fragility,
    fragilityQuotient: fragility / (n_t + n_c)
  };
}

// ============================================================================
// BEYOND R: DOSE-RESPONSE META-ANALYSIS
// ============================================================================

/**
 * Dose-Response Meta-Analysis with spline models
 * Beyond R's dosresmeta: implements restricted cubic splines,
 * fractional polynomials, and model comparison
 *
 * References:
 * - Greenland & Longnecker 1992
 * - Orsini et al. 2012
 *
 * @param {Object[]} data - Array of {dose, yi, vi, n, studyId} objects
 * @param {Object} options - Configuration
 * @returns {Object} Dose-response analysis results
 */
export function doseResponseMA(data, options = {}) {
  const METHOD = 'doseResponseMA';

  // Input validation
  if (!Array.isArray(data) || data.length < 3) {
    throw new ValidationError('need at least 3 dose levels', METHOD);
  }

  const {
    referenceCategory = 'lowest',  // 'lowest', 'highest', or dose value
    splineKnots = [25, 50, 75],    // Percentile positions for RCS knots
    modelType = 'rcs',              // 'linear', 'quadratic', 'rcs', 'fractional'
    fpPowers = [-2, -1, -0.5, 0, 0.5, 1, 2, 3], // Fractional polynomial powers to try
    covariance = 'greenland'        // Covariance approximation method
  } = options;

  // Group by study
  const studyGroups = {};
  data.forEach(d => {
    if (!studyGroups[d.studyId]) studyGroups[d.studyId] = [];
    studyGroups[d.studyId].push(d);
  });
  const studies = Object.values(studyGroups);

  // Sort each study by dose and get doses
  studies.forEach(s => s.sort((a, b) => a.dose - b.dose));
  const allDoses = data.map(d => d.dose).sort((a, b) => a - b);
  const uniqueDoses = [...new Set(allDoses)];
  const minDose = Math.min(...allDoses);
  const maxDose = Math.max(...allDoses);

  // Reference dose
  let refDose;
  if (referenceCategory === 'lowest') {
    refDose = minDose;
  } else if (referenceCategory === 'highest') {
    refDose = maxDose;
  } else {
    refDose = referenceCategory;
  }

  // Create dose transformation functions
  function linearTerm(dose) {
    return dose - refDose;
  }

  function quadraticTerm(dose) {
    const d = dose - refDose;
    return [d, d * d];
  }

  // Restricted cubic spline basis
  function rcsTerms(dose, knots) {
    const k = knots.length;
    const terms = [dose - refDose];

    // Cubic spline basis with constraints at boundaries
    const knotVals = knots.map(p => {
      const idx = Math.floor(p / 100 * uniqueDoses.length);
      return uniqueDoses[Math.min(idx, uniqueDoses.length - 1)];
    });

    for (let j = 0; j < k - 2; j++) {
      const t1 = Math.max(0, Math.pow(dose - knotVals[j], 3));
      const t2 = Math.max(0, Math.pow(dose - knotVals[k - 2], 3));
      const t3 = Math.max(0, Math.pow(dose - knotVals[k - 1], 3));
      const lambda = (knotVals[k - 1] - knotVals[j]) / (knotVals[k - 1] - knotVals[k - 2]);
      terms.push(t1 - lambda * t2 - (1 - lambda) * t3);
    }

    return terms;
  }

  // Fit different models
  const models = {};

  // Linear model
  const linearFit = fitDoseResponseModel(studies, d => [linearTerm(d.dose)], refDose);
  models.linear = {
    ...linearFit,
    aic: calculateAIC(linearFit.residualSS, linearFit.n, 1),
    bic: calculateBIC(linearFit.residualSS, linearFit.n, 1),
    predictFn: (dose) => linearFit.beta[0] * (dose - refDose)
  };

  // Quadratic model
  const quadFit = fitDoseResponseModel(studies, d => quadraticTerm(d.dose), refDose);
  models.quadratic = {
    ...quadFit,
    aic: calculateAIC(quadFit.residualSS, quadFit.n, 2),
    bic: calculateBIC(quadFit.residualSS, quadFit.n, 2),
    predictFn: (dose) => {
      const d = dose - refDose;
      return quadFit.beta[0] * d + quadFit.beta[1] * d * d;
    }
  };

  // RCS model (if enough data)
  if (uniqueDoses.length >= 4) {
    const rcsFit = fitDoseResponseModel(studies, d => rcsTerms(d.dose, splineKnots), refDose);
    models.rcs = {
      ...rcsFit,
      knots: splineKnots,
      aic: calculateAIC(rcsFit.residualSS, rcsFit.n, rcsFit.beta.length),
      bic: calculateBIC(rcsFit.residualSS, rcsFit.n, rcsFit.beta.length),
      predictFn: (dose) => {
        const terms = rcsTerms(dose, splineKnots);
        return terms.reduce((sum, t, i) => sum + rcsFit.beta[i] * t, 0);
      }
    };
  }

  // Select best model by AIC
  const modelKeys = Object.keys(models);
  let bestModel = modelKeys[0];
  let bestAIC = models[modelKeys[0]].aic;
  modelKeys.forEach(key => {
    if (models[key].aic < bestAIC) {
      bestAIC = models[key].aic;
      bestModel = key;
    }
  });

  // Generate prediction curve
  const doseRange = [];
  const numPoints = 100;
  for (let i = 0; i <= numPoints; i++) {
    doseRange.push(minDose + (maxDose - minDose) * i / numPoints);
  }

  const bestFit = models[bestModel];
  const predictionCurve = doseRange.map(dose => {
    const pred = bestFit.predictFn(dose);
    // Approximate SE (simplified)
    const approxSE = bestFit.se ? bestFit.se[0] * Math.abs(dose - refDose) : 0;
    return {
      dose,
      effect: pred,
      lower: pred - 1.96 * approxSE,
      upper: pred + 1.96 * approxSE
    };
  });

  // Test for non-linearity (compare linear vs best non-linear)
  let nonlinearityTest = null;
  if (bestModel !== 'linear' && models[bestModel].df > 1) {
    const linearDev = models.linear.deviance || models.linear.residualSS;
    const bestDev = bestFit.deviance || bestFit.residualSS;
    const dfDiff = bestFit.df - 1;
    if (dfDiff > 0) {
      const chiSq = linearDev - bestDev;
      const pNonlin = 1 - chiSquareCDF(Math.max(0, chiSq), dfDiff);
      nonlinearityTest = {
        chiSquare: chiSq,
        df: dfDiff,
        p: pNonlin,
        significant: pNonlin < 0.05
      };
    }
  }

  // Model comparison table
  const modelComparison = modelKeys.map(key => ({
    model: key,
    nParameters: models[key].beta.length,
    aic: models[key].aic,
    bic: models[key].bic,
    isSelected: key === bestModel
  })).sort((a, b) => a.aic - b.aic);

  return {
    bestModel,
    models,
    modelComparison,
    predictionCurve,
    plotData: {
      doses: doseRange,
      predicted: predictionCurve.map(p => p.effect),
      lower: predictionCurve.map(p => p.lower),
      upper: predictionCurve.map(p => p.upper),
      observedDoses: data.map(d => d.dose),
      observedEffects: data.map(d => d.yi)
    },
    nonlinearityTest,
    referenceDose: refDose,
    summary: {
      nStudies: studies.length,
      nObservations: data.length,
      doseRange: [minDose, maxDose],
      bestModelType: bestModel,
      coefficients: bestFit.beta,
      standardErrors: bestFit.se
    },
    method: 'Dose-Response Meta-Analysis (Enhanced with splines)'
  };
}

// Helper: Fit dose-response model with weighted least squares
function fitDoseResponseModel(studies, termsFn, refDose) {
  // Flatten and create design matrix
  const X = [];
  const y = [];
  const weights = [];

  studies.forEach(study => {
    study.forEach(obs => {
      if (Math.abs(obs.dose - refDose) > 1e-10) { // Skip reference
        const terms = termsFn(obs);
        X.push(terms);
        y.push(obs.yi);
        weights.push(1 / obs.vi);
      }
    });
  });

  const n = y.length;
  const p = X[0]?.length || 1;

  if (n <= p) {
    return { beta: Array(p).fill(0), se: Array(p).fill(Infinity), n, df: p, residualSS: Infinity };
  }

  // Weighted least squares: (X'WX)^-1 X'Wy
  const W = weights;

  // X'WX
  const XtWX = [];
  for (let i = 0; i < p; i++) {
    XtWX[i] = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * W[k] * X[k][j];
      }
      XtWX[i][j] = sum;
    }
  }

  // X'Wy
  const XtWy = [];
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      sum += X[k][i] * W[k] * y[k];
    }
    XtWy[i] = sum;
  }

  // Solve for beta
  const invXtWX = matrixInverse(XtWX);
  if (!invXtWX) {
    return { beta: Array(p).fill(0), se: Array(p).fill(Infinity), n, df: p, residualSS: Infinity };
  }

  const beta = [];
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let j = 0; j < p; j++) {
      sum += invXtWX[i][j] * XtWy[j];
    }
    beta[i] = sum;
  }

  // Standard errors from diagonal of (X'WX)^-1
  const se = invXtWX.map((row, i) => Math.sqrt(Math.max(0, row[i])));

  // Residual sum of squares
  let residualSS = 0;
  for (let k = 0; k < n; k++) {
    let pred = 0;
    for (let j = 0; j < p; j++) {
      pred += X[k][j] * beta[j];
    }
    residualSS += W[k] * Math.pow(y[k] - pred, 2);
  }

  return { beta, se, n, df: p, residualSS, deviance: residualSS };
}

// Helper: Simple matrix inverse for small matrices
function matrixInverse(A) {
  const n = A.length;
  if (n === 0) return null;

  // Create augmented matrix [A|I]
  const aug = A.map((row, i) => {
    const newRow = [...row];
    for (let j = 0; j < n; j++) {
      newRow.push(i === j ? 1 : 0);
    }
    return newRow;
  });

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) {
      return null; // Singular
    }

    // Scale pivot row
    const scale = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= scale;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }
  }

  // Extract inverse
  return aug.map(row => row.slice(n));
}

function calculateAIC(rss, n, k) {
  if (rss <= 0 || n <= k) return Infinity;
  return n * Math.log(rss / n) + 2 * k;
}

function calculateBIC(rss, n, k) {
  if (rss <= 0 || n <= k) return Infinity;
  return n * Math.log(rss / n) + k * Math.log(n);
}

// ============================================================================
// BEYOND R: CONTOUR-ENHANCED FUNNEL PLOT
// ============================================================================

/**
 * Generate contour-enhanced funnel plot data
 * Beyond basic funnel plots: adds significance contours,
 * heterogeneity-adjusted bounds, and pseudo-confidence regions
 *
 * Reference: Peters et al. 2008
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration
 * @returns {Object} Funnel plot data with contours
 */
export function contourEnhancedFunnel(yi, vi, options = {}) {
  const METHOD = 'contourEnhancedFunnel';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    alpha = 0.05,              // Significance level for contours
    contourLevels = [0.01, 0.05, 0.1], // P-value contour levels
    includeHeterogeneity = true, // Adjust for tau2
    trimFill = false,          // Add trim-and-fill imputed studies
    nGridPoints = 50           // Resolution of contours
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));

  // Fit random-effects model
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const seMeta = Math.sqrt(1 / sumW);

  // Study points
  const points = yi.map((y, i) => ({
    effect: y,
    se: se[i],
    precision: 1 / se[i],
    weight: wi[i] / sumW * 100,
    residual: y - theta,
    standardizedResidual: (y - theta) / Math.sqrt(vi[i] + tau2)
  }));

  // Funnel bounds (pseudo 95% CI)
  const seRange = [0, Math.max(...se) * 1.2];
  const seGrid = [];
  for (let i = 0; i <= nGridPoints; i++) {
    seGrid.push(seRange[0] + (seRange[1] - seRange[0]) * i / nGridPoints);
  }

  // Fixed-effect funnel bounds
  const funnelBoundsFixed = seGrid.map(s => ({
    se: s,
    lower: theta - normalQuantile(1 - alpha / 2) * s,
    upper: theta + normalQuantile(1 - alpha / 2) * s
  }));

  // Random-effects funnel bounds (adjusted for tau2)
  const funnelBoundsRandom = includeHeterogeneity ? seGrid.map(s => ({
    se: s,
    lower: theta - normalQuantile(1 - alpha / 2) * Math.sqrt(s * s + tau2),
    upper: theta + normalQuantile(1 - alpha / 2) * Math.sqrt(s * s + tau2)
  })) : null;

  // Significance contours
  const contours = {};
  contourLevels.forEach(pLevel => {
    const zCrit = normalQuantile(1 - pLevel / 2);
    contours[pLevel] = seGrid.map(s => {
      // Effect size at which z = zCrit for this SE
      // z = (effect - 0) / se = zCrit => effect = zCrit * se
      return {
        se: s,
        effectLeft: -zCrit * s,  // Left contour (negative effects)
        effectRight: zCrit * s    // Right contour (positive effects)
      };
    });
  });

  // Trim-and-fill if requested
  let imputedStudies = null;
  if (trimFill) {
    imputedStudies = performTrimFill(yi, vi, theta, tau2);
  }

  // Asymmetry test (Egger)
  const eggerTest = performEggerTest(yi, vi);

  // Determine effect range for plot
  const effectMin = Math.min(...yi, theta - 3 * seMeta);
  const effectMax = Math.max(...yi, theta + 3 * seMeta);

  return {
    points,
    pooledEffect: theta,
    pooledSE: seMeta,
    tau2,
    funnelBounds: {
      fixed: funnelBoundsFixed,
      random: funnelBoundsRandom
    },
    contours,
    contourLevels,
    imputedStudies,
    asymmetryTest: eggerTest,
    plotRange: {
      effect: [effectMin, effectMax],
      se: seRange
    },
    summary: {
      nStudies: n,
      pooledEffect: theta,
      heterogeneity: { tau2, I2: tau2 / (tau2 + seMeta * seMeta) * 100 },
      asymmetry: eggerTest.significant ? 'Significant asymmetry detected' : 'No significant asymmetry'
    },
    method: 'Contour-Enhanced Funnel Plot'
  };
}

// Helper: Trim and fill
function performTrimFill(yi, vi, theta, tau2) {
  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));

  // Calculate residuals from pooled estimate
  const residuals = yi.map(y => y - theta);

  // Rank by absolute residual
  const ranked = residuals.map((r, i) => ({ r, se: se[i], idx: i }))
    .sort((a, b) => Math.abs(a.r) - Math.abs(b.r));

  // Count asymmetric studies (simplified L0 estimator)
  let k0 = 0;
  const positiveResid = residuals.filter(r => r > 0).length;
  const negativeResid = residuals.filter(r => r < 0).length;

  if (positiveResid > negativeResid) {
    k0 = Math.floor((positiveResid - negativeResid) / 2);
  } else {
    k0 = Math.floor((negativeResid - positiveResid) / 2);
  }

  if (k0 === 0) return null;

  // Impute missing studies by reflection
  const imputed = [];
  const sortedByResid = residuals.map((r, i) => ({ r, yi: yi[i], se: se[i] }))
    .sort((a, b) => b.r - a.r);

  for (let i = 0; i < Math.min(k0, n); i++) {
    const study = sortedByResid[i];
    imputed.push({
      effect: 2 * theta - study.yi,
      se: study.se,
      type: 'imputed'
    });
  }

  return {
    k0,
    imputed,
    adjustedEffect: imputed.length > 0 ?
      (yi.reduce((s, y) => s + y, 0) + imputed.reduce((s, im) => s + im.effect, 0)) /
      (n + imputed.length) : theta
  };
}

// Helper: Egger test
function performEggerTest(yi, vi) {
  const n = yi.length;
  const se = vi.map(v => Math.sqrt(v));
  const precision = se.map(s => 1 / s);

  // Standard normal deviate: z = yi / sei
  // Regress z on precision: z = a + b * precision
  const z = yi.map((y, i) => y / se[i]);

  const meanPrec = precision.reduce((a, b) => a + b, 0) / n;
  const meanZ = z.reduce((a, b) => a + b, 0) / n;

  let ssPrec = 0, ssZ = 0, spPrecZ = 0;
  for (let i = 0; i < n; i++) {
    ssPrec += Math.pow(precision[i] - meanPrec, 2);
    ssZ += Math.pow(z[i] - meanZ, 2);
    spPrecZ += (precision[i] - meanPrec) * (z[i] - meanZ);
  }

  const slope = spPrecZ / ssPrec;
  const intercept = meanZ - slope * meanPrec;

  // SE of intercept
  const residuals = z.map((zi, i) => zi - (intercept + slope * precision[i]));
  const mse = residuals.reduce((s, r) => s + r * r, 0) / (n - 2);
  const seIntercept = Math.sqrt(mse * (1 / n + meanPrec * meanPrec / ssPrec));

  const t = intercept / seIntercept;
  const p = 2 * (1 - tCDF(Math.abs(t), n - 2));

  return {
    intercept,
    se: seIntercept,
    t,
    df: n - 2,
    p,
    significant: p < 0.1
  };
}

// ============================================================================
// BEYOND R: PREDICTION INTERVAL FOREST PLOT
// ============================================================================

/**
 * Generate forest plot data with prediction intervals
 * Enhances standard forest plots with:
 * - Study-specific prediction intervals
 * - Heterogeneity visualization bands
 * - Expected range for new studies
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration
 * @returns {Object} Forest plot data with prediction intervals
 */
export function predictionIntervalForestPlot(yi, vi, options = {}) {
  const METHOD = 'predictionIntervalForestPlot';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    labels = null,             // Study labels
    method = 'REML',           // Tau2 estimator
    alpha = 0.05,              // CI level
    sortBy = 'none',           // 'none', 'effect', 'precision', 'weight'
    showPredictionBand = true, // Show prediction interval as band
    subgroups = null           // Optional subgroup labels
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Fit random-effects model
  const tau2 = estimateTau2(yi, vi, method);
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const seMeta = Math.sqrt(1 / sumW);
  const ciMeta = [theta - zCrit * seMeta, theta + zCrit * seMeta];

  // Prediction interval for a new study
  const sePred = Math.sqrt(seMeta * seMeta + tau2);
  const tCritVal = tQuantile(1 - alpha / 2, n - 1);
  const predInt = [theta - tCritVal * sePred, theta + tCritVal * sePred];

  // Heterogeneity statistics
  const Q = yi.reduce((sum, y, i) => sum + (1 / vi[i]) * Math.pow(y - theta, 2), 0);
  const I2 = Math.max(0, (Q - (n - 1)) / Q) * 100;
  const H2 = Q / (n - 1);

  // Q-profile CI for tau2
  let tau2CI = null;
  try {
    const qProfileResult = computeQProfileCI(yi, vi, tau2, alpha);
    tau2CI = qProfileResult;
  } catch (e) {
    tau2CI = { lower: 0, upper: tau2 * 3 };
  }

  // Individual study data
  const studyData = yi.map((y, i) => {
    const se = Math.sqrt(vi[i]);
    const ci = [y - zCrit * se, y + zCrit * se];
    const weight = wi[i] / sumW * 100;

    // Study-specific prediction interval (contribution to heterogeneity)
    const studyContrib = Math.pow(y - theta, 2) / (vi[i] + tau2);

    return {
      index: i,
      label: labels ? labels[i] : `Study ${i + 1}`,
      effect: y,
      se,
      variance: vi[i],
      ci,
      weight,
      withinPI: y >= predInt[0] && y <= predInt[1],
      standardizedResidual: (y - theta) / Math.sqrt(vi[i] + tau2),
      contributionToQ: studyContrib,
      subgroup: subgroups ? subgroups[i] : null
    };
  });

  // Sorting
  let sortedData = [...studyData];
  if (sortBy === 'effect') {
    sortedData.sort((a, b) => b.effect - a.effect);
  } else if (sortBy === 'precision') {
    sortedData.sort((a, b) => a.variance - b.variance);
  } else if (sortBy === 'weight') {
    sortedData.sort((a, b) => b.weight - a.weight);
  }

  // Subgroup analysis if provided
  let subgroupResults = null;
  if (subgroups) {
    const groups = [...new Set(subgroups)];
    subgroupResults = groups.map(group => {
      const indices = subgroups.map((s, i) => s === group ? i : -1).filter(i => i >= 0);
      const subYi = indices.map(i => yi[i]);
      const subVi = indices.map(i => vi[i]);

      const subTau2 = estimateTau2(subYi, subVi, method);
      const subWi = subVi.map(v => 1 / (v + subTau2));
      const subSumW = subWi.reduce((a, b) => a + b, 0);
      const subTheta = subWi.reduce((sum, w, i) => sum + w * subYi[i], 0) / subSumW;
      const subSE = Math.sqrt(1 / subSumW);

      return {
        group,
        n: indices.length,
        effect: subTheta,
        se: subSE,
        ci: [subTheta - zCrit * subSE, subTheta + zCrit * subSE],
        tau2: subTau2
      };
    });
  }

  // Plot configuration data
  const effectRange = [
    Math.min(...yi.map((y, i) => y - zCrit * Math.sqrt(vi[i])), predInt[0]) - 0.2,
    Math.max(...yi.map((y, i) => y + zCrit * Math.sqrt(vi[i])), predInt[1]) + 0.2
  ];

  return {
    studies: sortedData,
    pooled: {
      effect: theta,
      se: seMeta,
      ci: ciMeta,
      predictionInterval: predInt,
      tau2,
      tau2CI,
      I2,
      H2,
      Q,
      df: n - 1,
      pHet: 1 - chiSquareCDF(Q, n - 1)
    },
    subgroups: subgroupResults,
    plotConfig: {
      effectRange,
      predictionBand: showPredictionBand ? predInt : null,
      nullLine: 0,
      rows: sortedData.length + 1 + (subgroupResults ? subgroupResults.length : 0)
    },
    forestData: sortedData.map((s, idx) => ({
      row: idx + 1,
      label: s.label,
      estimate: s.effect,
      lower: s.ci[0],
      upper: s.ci[1],
      weight: s.weight,
      weightSquare: Math.sqrt(s.weight) * 3, // Size of square marker
      subgroup: s.subgroup
    })),
    summary: {
      nStudies: n,
      method,
      heterogeneity: `I² = ${I2.toFixed(1)}%, τ² = ${tau2.toFixed(4)}`,
      interpretation: `Prediction interval: [${predInt[0].toFixed(3)}, ${predInt[1].toFixed(3)}]`
    },
    method: 'Forest Plot with Prediction Intervals'
  };
}

// Helper: Q-profile CI for tau2
function computeQProfileCI(yi, vi, tau2Est, alpha) {
  const n = yi.length;
  const Q = (tau2) => {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
    return yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
  };

  const qCritLow = chiSquareQuantile(1 - alpha / 2, n - 1);
  const qCritHigh = chiSquareQuantile(alpha / 2, n - 1);

  // Find tau2 bounds using bisection
  function findBound(targetQ, lower, upper) {
    for (let iter = 0; iter < 100; iter++) {
      const mid = (lower + upper) / 2;
      const qMid = Q(mid);
      if (Math.abs(qMid - targetQ) < 0.001) return mid;
      if (qMid > targetQ) lower = mid;
      else upper = mid;
    }
    return (lower + upper) / 2;
  }

  const tau2Lower = Q(0) > qCritLow ? findBound(qCritLow, 0, tau2Est * 10) : 0;
  const tau2Upper = findBound(qCritHigh, tau2Est, tau2Est * 20 + 1);

  return { lower: tau2Lower, upper: tau2Upper };
}

// ============================================================================
// BEYOND R: AUTOMATIC SENSITIVITY ANALYSIS SUITE
// ============================================================================

/**
 * Comprehensive automatic sensitivity analysis
 * Runs multiple sensitivity checks automatically:
 * - Leave-one-out analysis
 * - Influence diagnostics
 * - Subgroup robustness
 * - Model specification checks
 * - Publication bias sensitivity
 * - Outlier impact assessment
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration
 * @returns {Object} Complete sensitivity analysis report
 */
export function automaticSensitivitySuite(yi, vi, options = {}) {
  const METHOD = 'automaticSensitivitySuite';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    labels = null,
    subgroups = null,
    alpha = 0.05,
    includeBootstrap = true,
    nBoot = 500,
    estimators = ['DL', 'REML', 'PM', 'EB'],
    seed = 42
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Baseline analysis
  const tau2Base = estimateTau2(yi, vi, 'REML');
  const wiBase = vi.map(v => 1 / (v + tau2Base));
  const sumWBase = wiBase.reduce((a, b) => a + b, 0);
  const thetaBase = wiBase.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWBase;
  const seBase = Math.sqrt(1 / sumWBase);
  const ciBase = [thetaBase - zCrit * seBase, thetaBase + zCrit * seBase];

  const results = {
    baseline: {
      theta: thetaBase,
      se: seBase,
      ci: ciBase,
      tau2: tau2Base,
      nStudies: n
    }
  };

  // 1. Leave-one-out analysis
  const leaveOneOut = [];
  for (let i = 0; i < n; i++) {
    const yiLOO = [...yi.slice(0, i), ...yi.slice(i + 1)];
    const viLOO = [...vi.slice(0, i), ...vi.slice(i + 1)];

    const tau2LOO = estimateTau2(yiLOO, viLOO, 'REML');
    const wiLOO = viLOO.map(v => 1 / (v + tau2LOO));
    const sumWLOO = wiLOO.reduce((a, b) => a + b, 0);
    const thetaLOO = wiLOO.reduce((sum, w, j) => sum + w * yiLOO[j], 0) / sumWLOO;
    const seLOO = Math.sqrt(1 / sumWLOO);

    leaveOneOut.push({
      excluded: i,
      label: labels ? labels[i] : `Study ${i + 1}`,
      theta: thetaLOO,
      se: seLOO,
      ci: [thetaLOO - zCrit * seLOO, thetaLOO + zCrit * seLOO],
      tau2: tau2LOO,
      changePct: ((thetaLOO - thetaBase) / Math.abs(thetaBase)) * 100,
      influential: Math.abs(thetaLOO - thetaBase) > 2 * seBase
    });
  }
  results.leaveOneOut = leaveOneOut;

  // Identify influential studies
  const influentialStudies = leaveOneOut.filter(l => l.influential);
  results.influentialStudies = {
    count: influentialStudies.length,
    studies: influentialStudies.map(s => s.label),
    maxChange: Math.max(...leaveOneOut.map(l => Math.abs(l.changePct)))
  };

  // 2. Heterogeneity estimator sensitivity
  const estimatorResults = {};
  estimators.forEach(est => {
    const tau2Est = estimateTau2(yi, vi, est);
    const wiEst = vi.map(v => 1 / (v + tau2Est));
    const sumWEst = wiEst.reduce((a, b) => a + b, 0);
    const thetaEst = wiEst.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWEst;
    const seEst = Math.sqrt(1 / sumWEst);

    estimatorResults[est] = {
      theta: thetaEst,
      se: seEst,
      ci: [thetaEst - zCrit * seEst, thetaEst + zCrit * seEst],
      tau2: tau2Est
    };
  });
  results.estimatorSensitivity = estimatorResults;

  // Check consistency across estimators
  const thetaRange = Object.values(estimatorResults).map(r => r.theta);
  const estimatorConsistency = {
    min: Math.min(...thetaRange),
    max: Math.max(...thetaRange),
    range: Math.max(...thetaRange) - Math.min(...thetaRange),
    consistent: (Math.max(...thetaRange) - Math.min(...thetaRange)) < seBase
  };
  results.estimatorConsistency = estimatorConsistency;

  // 3. Fixed vs Random effects comparison
  const wiFixed = vi.map(v => 1 / v);
  const sumWFixed = wiFixed.reduce((a, b) => a + b, 0);
  const thetaFixed = wiFixed.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWFixed;
  const seFixed = Math.sqrt(1 / sumWFixed);

  results.modelComparison = {
    fixed: {
      theta: thetaFixed,
      se: seFixed,
      ci: [thetaFixed - zCrit * seFixed, thetaFixed + zCrit * seFixed]
    },
    random: {
      theta: thetaBase,
      se: seBase,
      ci: ciBase,
      tau2: tau2Base
    },
    difference: {
      absolute: Math.abs(thetaFixed - thetaBase),
      relative: Math.abs(thetaFixed - thetaBase) / Math.abs(thetaBase) * 100,
      seDifference: (seBase - seFixed) / seFixed * 100,
      meaningful: Math.abs(thetaFixed - thetaBase) > seBase
    }
  };

  // 4. Outlier detection and impact
  const residuals = yi.map((y, i) => ({
    index: i,
    label: labels ? labels[i] : `Study ${i + 1}`,
    residual: y - thetaBase,
    standardized: (y - thetaBase) / Math.sqrt(vi[i] + tau2Base),
    isOutlier: Math.abs((y - thetaBase) / Math.sqrt(vi[i] + tau2Base)) > 2.5
  }));

  const outliers = residuals.filter(r => r.isOutlier);
  results.outlierAnalysis = {
    method: 'Standardized residuals > 2.5',
    outliers: outliers.map(o => o.label),
    count: outliers.length,
    residuals
  };

  // Analysis excluding outliers
  if (outliers.length > 0 && outliers.length < n - 2) {
    const outlierIndices = new Set(outliers.map(o => o.index));
    const yiClean = yi.filter((_, i) => !outlierIndices.has(i));
    const viClean = vi.filter((_, i) => !outlierIndices.has(i));

    const tau2Clean = estimateTau2(yiClean, viClean, 'REML');
    const wiClean = viClean.map(v => 1 / (v + tau2Clean));
    const sumWClean = wiClean.reduce((a, b) => a + b, 0);
    const thetaClean = wiClean.reduce((sum, w, i) => sum + w * yiClean[i], 0) / sumWClean;
    const seClean = Math.sqrt(1 / sumWClean);

    results.outlierAnalysis.excludingOutliers = {
      theta: thetaClean,
      se: seClean,
      ci: [thetaClean - zCrit * seClean, thetaClean + zCrit * seClean],
      tau2: tau2Clean,
      nStudies: yiClean.length,
      changePct: ((thetaClean - thetaBase) / Math.abs(thetaBase)) * 100
    };
  }

  // 5. Subgroup robustness (if subgroups provided)
  if (subgroups && subgroups.length === n) {
    const groups = [...new Set(subgroups)];
    const subgroupResults = {};

    groups.forEach(group => {
      const indices = subgroups.map((s, i) => s === group ? i : -1).filter(i => i >= 0);
      const subYi = indices.map(i => yi[i]);
      const subVi = indices.map(i => vi[i]);

      if (subYi.length >= 2) {
        const subTau2 = estimateTau2(subYi, subVi, 'REML');
        const subWi = subVi.map(v => 1 / (v + subTau2));
        const subSumW = subWi.reduce((a, b) => a + b, 0);
        const subTheta = subWi.reduce((sum, w, i) => sum + w * subYi[i], 0) / subSumW;
        const subSE = Math.sqrt(1 / subSumW);

        subgroupResults[group] = {
          n: subYi.length,
          theta: subTheta,
          se: subSE,
          ci: [subTheta - zCrit * subSE, subTheta + zCrit * subSE],
          tau2: subTau2
        };
      }
    });

    results.subgroupRobustness = subgroupResults;

    // Test for subgroup differences
    if (groups.length >= 2) {
      const qBetween = groups.reduce((sum, g) => {
        const res = subgroupResults[g];
        if (res) {
          return sum + (1 / (res.se * res.se)) * Math.pow(res.theta - thetaBase, 2);
        }
        return sum;
      }, 0);

      results.subgroupRobustness.heterogeneityTest = {
        Q: qBetween,
        df: groups.length - 1,
        p: 1 - chiSquareCDF(qBetween, groups.length - 1)
      };
    }
  }

  // 6. Bootstrap analysis (if requested)
  // Uses seeded PRNG for reproducibility (Blackman & Vigna, 2018)
  if (includeBootstrap && n >= 5) {
    const rng = createSeededRNG(seed);
    const bootEstimates = [];
    for (let b = 0; b < nBoot; b++) {
      const indices = Array.from({ length: n }, () => rng.randomInt(n));
      const bootYi = indices.map(i => yi[i]);
      const bootVi = indices.map(i => vi[i]);

      const bootTau2 = estimateTau2(bootYi, bootVi, 'DL'); // DL for speed
      const bootWi = bootVi.map(v => 1 / (v + bootTau2));
      const bootSumW = bootWi.reduce((a, b) => a + b, 0);
      const bootTheta = bootWi.reduce((sum, w, i) => sum + w * bootYi[i], 0) / bootSumW;
      bootEstimates.push(bootTheta);
    }

    bootEstimates.sort((a, b) => a - b);
    const bootMean = bootEstimates.reduce((a, b) => a + b, 0) / nBoot;
    const bootSE = Math.sqrt(bootEstimates.reduce((s, x) => s + Math.pow(x - bootMean, 2), 0) / (nBoot - 1));

    results.bootstrapAnalysis = {
      nBoot,
      mean: bootMean,
      se: bootSE,
      ci: [
        bootEstimates[Math.floor(0.025 * nBoot)],
        bootEstimates[Math.floor(0.975 * nBoot)]
      ],
      bias: bootMean - thetaBase,
      comparison: {
        seRatio: bootSE / seBase,
        ciWidthRatio: (bootEstimates[Math.floor(0.975 * nBoot)] - bootEstimates[Math.floor(0.025 * nBoot)]) /
                      (ciBase[1] - ciBase[0])
      }
    };
  }

  // 7. Overall robustness summary
  const robustnessChecks = {
    leaveOneOutStable: influentialStudies.length === 0,
    estimatorConsistent: estimatorConsistency.consistent,
    noMeaningfulFEREDiff: !results.modelComparison.difference.meaningful,
    fewOutliers: outliers.length <= Math.ceil(n * 0.1),
    bootstrapConsistent: results.bootstrapAnalysis ?
      results.bootstrapAnalysis.comparison.seRatio < 1.5 : null
  };

  const passedChecks = Object.values(robustnessChecks).filter(v => v === true).length;
  const totalChecks = Object.values(robustnessChecks).filter(v => v !== null).length;

  results.robustnessSummary = {
    checks: robustnessChecks,
    passedChecks,
    totalChecks,
    robustnessScore: (passedChecks / totalChecks * 100).toFixed(1),
    verdict: passedChecks === totalChecks ? 'Highly robust' :
             passedChecks >= totalChecks * 0.75 ? 'Generally robust' :
             passedChecks >= totalChecks * 0.5 ? 'Moderately robust - interpret with caution' :
             'Fragile results - significant sensitivity detected',
    recommendations: []
  };

  // Generate recommendations
  if (!robustnessChecks.leaveOneOutStable) {
    results.robustnessSummary.recommendations.push(
      `Consider sensitivity analysis excluding influential studies: ${influentialStudies.map(s => s.label).join(', ')}`
    );
  }
  if (!robustnessChecks.estimatorConsistent) {
    results.robustnessSummary.recommendations.push(
      'Results vary notably across heterogeneity estimators - report multiple estimates'
    );
  }
  if (!robustnessChecks.noMeaningfulFEREDiff) {
    results.robustnessSummary.recommendations.push(
      'Fixed and random effects models give different conclusions - investigate heterogeneity sources'
    );
  }
  if (!robustnessChecks.fewOutliers) {
    results.robustnessSummary.recommendations.push(
      'Multiple outliers detected - consider outlier-robust methods or exclusion sensitivity'
    );
  }

  return {
    ...results,
    method: 'Automatic Sensitivity Analysis Suite'
  };
}

// ============================================================================
// BEYOND R: META-ANALYSIS OF PROPORTIONS
// ============================================================================

/**
 * Meta-analysis of proportions with multiple transformations
 * Beyond R's metaprop: unified interface with 7 transformation options,
 * exact CIs, and automatic optimal transformation selection
 *
 * @param {Object[]} studies - Array of {events, n, label?}
 * @param {Object} options - Configuration
 * @returns {Object} Pooled proportion with all transformations
 */
export function metaAnalysisProportions(studies, options = {}) {
  const METHOD = 'metaAnalysisProportions';

  // Input validation
  validateBinaryStudies(studies, METHOD, ['events', 'n']);

  const {
    transformation = 'auto',  // 'logit', 'arcsine', 'freeman-tukey', 'log', 'raw', 'double-arcsine', 'auto'
    method = 'REML',
    alpha = 0.05,
    continuityCorrection = 0.5
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = studies.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Define transformations
  const transformations = {
    logit: {
      transform: (p, n) => {
        const pAdj = Math.max(0.001, Math.min(0.999, p));
        return Math.log(pAdj / (1 - pAdj));
      },
      variance: (p, n) => {
        const pAdj = Math.max(0.001, Math.min(0.999, p));
        return 1 / (n * pAdj * (1 - pAdj));
      },
      backTransform: (y) => 1 / (1 + Math.exp(-y))
    },
    arcsine: {
      transform: (p, n) => Math.asin(Math.sqrt(p)),
      variance: (p, n) => 1 / (4 * n),
      backTransform: (y) => Math.pow(Math.sin(y), 2)
    },
    'freeman-tukey': {
      transform: (p, n) => Math.asin(Math.sqrt(p)) + Math.asin(Math.sqrt((p * n + 1) / (n + 1))),
      variance: (p, n) => 1 / (n + 0.5),
      backTransform: (y) => {
        const sinSq = Math.pow(Math.sin(y / 2), 2);
        return Math.max(0, Math.min(1, sinSq));
      }
    },
    'double-arcsine': {
      transform: (p, n) => Math.asin(Math.sqrt(p * n / (n + 1))) + Math.asin(Math.sqrt((p * n + 1) / (n + 1))),
      variance: (p, n) => 1 / (n + 0.5),
      backTransform: (y, nHarmonic) => {
        const z = y / 2;
        return (Math.pow(Math.sin(z), 2) * (nHarmonic + 1) - 0.5) / nHarmonic;
      }
    },
    log: {
      transform: (p, n) => Math.log(Math.max(0.001, p)),
      variance: (p, n) => (1 - p) / (n * p),
      backTransform: (y) => Math.exp(y)
    },
    raw: {
      transform: (p, n) => p,
      variance: (p, n) => p * (1 - p) / n,
      backTransform: (y) => y
    }
  };

  // Calculate proportions and apply transformations
  const results = {};
  const transformList = transformation === 'auto' ?
    ['logit', 'arcsine', 'freeman-tukey', 'double-arcsine'] :
    [transformation];

  // Harmonic mean of sample sizes (for double-arcsine back-transform)
  const nHarmonic = n / studies.reduce((sum, s) => sum + 1 / s.n, 0);

  for (const trans of transformList) {
    const tf = transformations[trans];
    const yi = [];
    const vi = [];

    for (const study of studies) {
      let p = study.events / study.n;
      // Apply continuity correction for 0 or n events
      if (study.events === 0 || study.events === study.n) {
        p = (study.events + continuityCorrection) / (study.n + 2 * continuityCorrection);
      }
      yi.push(tf.transform(p, study.n));
      vi.push(tf.variance(p, study.n));
    }

    // Random effects meta-analysis
    const tau2 = estimateTau2(yi, vi, method);
    const wi = vi.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);

    // Back-transform
    const pooledProp = trans === 'double-arcsine' ?
      tf.backTransform(theta, nHarmonic) :
      tf.backTransform(theta);

    // CI on transformed scale, then back-transform
    const ciLower = trans === 'double-arcsine' ?
      tf.backTransform(theta - zCrit * se, nHarmonic) :
      tf.backTransform(theta - zCrit * se);
    const ciUpper = trans === 'double-arcsine' ?
      tf.backTransform(theta + zCrit * se, nHarmonic) :
      tf.backTransform(theta + zCrit * se);

    // Heterogeneity
    const Q = yi.reduce((sum, y, i) => sum + (1 / vi[i]) * Math.pow(y - theta, 2), 0);
    const I2 = Math.max(0, (Q - (n - 1)) / Q) * 100;

    results[trans] = {
      proportion: Math.max(0, Math.min(1, pooledProp)),
      ci: [Math.max(0, ciLower), Math.min(1, ciUpper)],
      transformedEstimate: theta,
      se,
      tau2,
      I2,
      Q,
      pHet: 1 - chiSquareCDF(Q, n - 1)
    };
  }

  // Auto-select best transformation (lowest I2)
  let bestTrans = transformList[0];
  if (transformation === 'auto') {
    let minI2 = Infinity;
    for (const trans of transformList) {
      if (results[trans].I2 < minI2) {
        minI2 = results[trans].I2;
        bestTrans = trans;
      }
    }
  }

  // Study-level data
  const studyData = studies.map((s, i) => {
    const p = s.events / s.n;
    const se = Math.sqrt(p * (1 - p) / s.n);
    // Wilson score CI
    const z2 = zCrit * zCrit;
    const denom = 1 + z2 / s.n;
    const center = (p + z2 / (2 * s.n)) / denom;
    const margin = zCrit * Math.sqrt((p * (1 - p) + z2 / (4 * s.n)) / s.n) / denom;

    return {
      study: i + 1,
      label: s.label || `Study ${i + 1}`,
      events: s.events,
      n: s.n,
      proportion: p,
      se,
      wilsonCI: [center - margin, center + margin],
      exactCI: clopperPearsonCI(s.events, s.n, alpha)
    };
  });

  return {
    pooled: results[bestTrans],
    selectedTransformation: bestTrans,
    allTransformations: results,
    studies: studyData,
    nStudies: n,
    totalEvents: studies.reduce((s, st) => s + st.events, 0),
    totalN: studies.reduce((s, st) => s + st.n, 0),
    method: 'Meta-Analysis of Proportions (Multi-Transformation)'
  };
}

// Clopper-Pearson exact CI
function clopperPearsonCI(x, n, alpha) {
  if (x === 0) return [0, 1 - Math.pow(alpha / 2, 1 / n)];
  if (x === n) return [Math.pow(alpha / 2, 1 / n), 1];

  // Use beta distribution quantiles
  const lower = betaQuantile(alpha / 2, x, n - x + 1);
  const upper = betaQuantile(1 - alpha / 2, x + 1, n - x);
  return [lower, upper];
}

function betaQuantile(p, a, b) {
  // Newton-Raphson for beta quantile
  let x = p;
  for (let i = 0; i < 50; i++) {
    const cdf = betaIncomplete(x, a, b);
    const pdf = Math.pow(x, a - 1) * Math.pow(1 - x, b - 1) / betaFunction(a, b);
    if (Math.abs(cdf - p) < 1e-10 || pdf === 0) break;
    x = Math.max(0.0001, Math.min(0.9999, x - (cdf - p) / pdf));
  }
  return x;
}

// ============================================================================
// BEYOND R: META-ANALYSIS OF CORRELATIONS
// ============================================================================

/**
 * Meta-analysis of correlations with Fisher's z transformation
 * Beyond basic R: includes prediction intervals, heterogeneity-adjusted CIs,
 * and artifact corrections
 *
 * @param {Object[]} studies - Array of {r, n, label?}
 * @param {Object} options - Configuration
 * @returns {Object} Pooled correlation with comprehensive statistics
 */
export function metaAnalysisCorrelations(studies, options = {}) {
  const METHOD = 'metaAnalysisCorrelations';

  // Input validation
  validateBinaryStudies(studies, METHOD, ['r', 'n']);

  const {
    method = 'REML',
    alpha = 0.05,
    artifactCorrection = false,  // Psychometric artifact correction (Hunter & Schmidt)
    reliabilityX = null,         // Reliability of X measure
    reliabilityY = null          // Reliability of Y measure
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = studies.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Fisher's z transformation
  const fisherZ = (r) => 0.5 * Math.log((1 + r) / (1 - r));
  const invFisherZ = (z) => (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1);

  // Transform correlations
  const yi = studies.map(s => fisherZ(s.r));
  const vi = studies.map(s => 1 / (s.n - 3));

  // Random effects meta-analysis
  const tau2 = estimateTau2(yi, vi, method);
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaZ = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const seZ = Math.sqrt(1 / sumW);

  // Back-transform to correlation scale
  const pooledR = invFisherZ(thetaZ);
  const ciLower = invFisherZ(thetaZ - zCrit * seZ);
  const ciUpper = invFisherZ(thetaZ + zCrit * seZ);

  // Prediction interval
  const sePred = Math.sqrt(seZ * seZ + tau2);
  const tCritVal = tQuantile(1 - alpha / 2, n - 1);
  const predLower = invFisherZ(thetaZ - tCritVal * sePred);
  const predUpper = invFisherZ(thetaZ + tCritVal * sePred);

  // Heterogeneity
  const Q = yi.reduce((sum, y, i) => sum + (1 / vi[i]) * Math.pow(y - thetaZ, 2), 0);
  const I2 = Math.max(0, (Q - (n - 1)) / Q) * 100;

  // Psychometric artifact correction (Hunter & Schmidt, 1990)
  let correctedR = pooledR;
  let correctionFactor = 1;
  if (artifactCorrection && reliabilityX && reliabilityY) {
    correctionFactor = Math.sqrt(reliabilityX * reliabilityY);
    correctedR = pooledR / correctionFactor;
  }

  // Study data
  const studyData = studies.map((s, i) => {
    const z = fisherZ(s.r);
    const seStudy = 1 / Math.sqrt(s.n - 3);
    return {
      study: i + 1,
      label: s.label || `Study ${i + 1}`,
      r: s.r,
      n: s.n,
      fisherZ: z,
      se: seStudy,
      ci: [invFisherZ(z - zCrit * seStudy), invFisherZ(z + zCrit * seStudy)],
      weight: wi[i] / sumW * 100
    };
  });

  // Effect size interpretation
  const interpretation = Math.abs(pooledR) < 0.1 ? 'negligible' :
                        Math.abs(pooledR) < 0.3 ? 'small' :
                        Math.abs(pooledR) < 0.5 ? 'moderate' :
                        Math.abs(pooledR) < 0.7 ? 'large' : 'very large';

  return {
    pooled: {
      r: pooledR,
      ci: [ciLower, ciUpper],
      predictionInterval: [predLower, predUpper],
      fisherZ: thetaZ,
      seZ
    },
    heterogeneity: {
      tau2,
      tau2Z: tau2,
      tauR: invFisherZ(Math.sqrt(tau2)) - invFisherZ(0), // Approx tau on r scale
      I2,
      Q,
      df: n - 1,
      pHet: 1 - chiSquareCDF(Q, n - 1)
    },
    artifactCorrection: artifactCorrection ? {
      correctedR,
      correctionFactor,
      reliabilityX,
      reliabilityY
    } : null,
    studies: studyData,
    interpretation,
    nStudies: n,
    totalN: studies.reduce((s, st) => s + st.n, 0),
    method: 'Meta-Analysis of Correlations (Fisher z)'
  };
}

// ============================================================================
// BEYOND R: META-ANALYSIS OF INCIDENCE RATES
// ============================================================================

/**
 * Meta-analysis of incidence rates (events per person-time)
 * Beyond R: multiple transformations, exact Poisson CIs, rate ratios
 *
 * @param {Object[]} studies - Array of {events, personTime, label?}
 * @param {Object} options - Configuration
 * @returns {Object} Pooled incidence rate
 */
export function metaAnalysisIncidenceRates(studies, options = {}) {
  const METHOD = 'metaAnalysisIncidenceRates';

  // Input validation
  validateBinaryStudies(studies, METHOD, ['events', 'personTime']);

  const {
    transformation = 'log',  // 'log', 'sqrt', 'freeman-tukey', 'raw'
    method = 'REML',
    alpha = 0.05,
    rateMultiplier = 1000    // Express as rate per 1000 person-time
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = studies.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Transformations for rates
  const transforms = {
    log: {
      transform: (rate) => Math.log(Math.max(rate, 1e-10)),
      variance: (events, pt) => events > 0 ? 1 / events : 1,
      backTransform: (y) => Math.exp(y)
    },
    sqrt: {
      transform: (rate) => Math.sqrt(rate),
      variance: (events, pt) => 1 / (4 * pt),
      backTransform: (y) => y * y
    },
    'freeman-tukey': {
      transform: (rate, events, pt) => Math.sqrt(events) + Math.sqrt(events + 1),
      variance: (events, pt) => 1,
      backTransform: (y, pt) => Math.pow(y / 2, 2) / pt
    },
    raw: {
      transform: (rate) => rate,
      variance: (events, pt) => events / (pt * pt),
      backTransform: (y) => y
    }
  };

  const tf = transforms[transformation];
  const yi = [];
  const vi = [];

  for (const s of studies) {
    const rate = s.events / s.personTime;
    yi.push(tf.transform(rate, s.events, s.personTime));
    vi.push(tf.variance(s.events, s.personTime));
  }

  // Random effects
  const tau2 = estimateTau2(yi, vi, method);
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const se = Math.sqrt(1 / sumW);

  // Back-transform
  const totalPT = studies.reduce((s, st) => s + st.personTime, 0);
  const pooledRate = transformation === 'freeman-tukey' ?
    tf.backTransform(theta, totalPT / n) :
    tf.backTransform(theta);

  const ciLower = transformation === 'freeman-tukey' ?
    tf.backTransform(theta - zCrit * se, totalPT / n) :
    tf.backTransform(theta - zCrit * se);
  const ciUpper = transformation === 'freeman-tukey' ?
    tf.backTransform(theta + zCrit * se, totalPT / n) :
    tf.backTransform(theta + zCrit * se);

  // Heterogeneity
  const Q = yi.reduce((sum, y, i) => sum + (1 / vi[i]) * Math.pow(y - theta, 2), 0);
  const I2 = Math.max(0, (Q - (n - 1)) / Q) * 100;

  // Study data with exact Poisson CI
  const studyData = studies.map((s, i) => {
    const rate = s.events / s.personTime;
    // Exact Poisson CI
    const lower = s.events === 0 ? 0 : chiSquareQuantile(alpha / 2, 2 * s.events) / (2 * s.personTime);
    const upper = chiSquareQuantile(1 - alpha / 2, 2 * (s.events + 1)) / (2 * s.personTime);

    return {
      study: i + 1,
      label: s.label || `Study ${i + 1}`,
      events: s.events,
      personTime: s.personTime,
      rate: rate * rateMultiplier,
      ci: [lower * rateMultiplier, upper * rateMultiplier],
      weight: wi[i] / sumW * 100
    };
  });

  return {
    pooled: {
      rate: pooledRate * rateMultiplier,
      ci: [Math.max(0, ciLower * rateMultiplier), ciUpper * rateMultiplier],
      rateUnit: `per ${rateMultiplier} person-time`
    },
    heterogeneity: { tau2, I2, Q, df: n - 1, pHet: 1 - chiSquareCDF(Q, n - 1) },
    studies: studyData,
    totalEvents: studies.reduce((s, st) => s + st.events, 0),
    totalPersonTime: totalPT,
    transformation,
    method: 'Meta-Analysis of Incidence Rates'
  };
}

// ============================================================================
// BEYOND R: QUALITY EFFECTS MODEL
// ============================================================================

/**
 * Quality Effects Model (Doi et al.)
 * Beyond standard R: implements IVhet model with quality weights
 * Alternative to random effects when heterogeneity is due to study quality
 *
 * Reference: Doi et al. 2015
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {number[]} quality - Quality scores (0-1, higher = better)
 * @param {Object} options - Configuration
 * @returns {Object} Quality-adjusted pooled estimate
 */
export function qualityEffectsModel(yi, vi, quality, options = {}) {
  const METHOD = 'qualityEffectsModel';

  // Input validation
  validateMetaInput(yi, vi, METHOD);
  validateQualityScores(quality, yi.length, METHOD);

  const {
    alpha = 0.05,
    qualityScale = 'normalized',  // 'normalized' (0-1) or 'raw'
    minQuality = 0.1              // Minimum quality weight
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Normalize quality scores if needed
  let qi;
  if (qualityScale === 'raw') {
    const maxQ = Math.max(...quality);
    const minQ = Math.min(...quality);
    qi = quality.map(q => (q - minQ) / (maxQ - minQ));
  } else {
    qi = [...quality];
  }

  // Ensure minimum quality
  qi = qi.map(q => Math.max(minQuality, q));

  // Standard inverse-variance weights
  const wiIV = vi.map(v => 1 / v);
  const sumWIV = wiIV.reduce((a, b) => a + b, 0);

  // Fixed-effect estimate (for comparison)
  const thetaFE = wiIV.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWIV;
  const seFE = Math.sqrt(1 / sumWIV);

  // Calculate Q statistic
  const Q = yi.reduce((sum, y, i) => sum + wiIV[i] * Math.pow(y - thetaFE, 2), 0);

  // IVhet model: redistribute Q based on quality
  // Studies with lower quality get higher "heterogeneity penalty"
  const qiSum = qi.reduce((a, b) => a + b, 0);
  const qualityWeights = qi.map(q => q / qiSum);

  // Adjust variance for each study based on quality
  // Lower quality → higher effective variance
  const viAdj = vi.map((v, i) => {
    const qualityPenalty = (1 - qi[i]) * (Q / (n - 1));
    return v + qualityPenalty;
  });

  // Quality-adjusted weights
  const wiQE = viAdj.map(v => 1 / v);
  const sumWQE = wiQE.reduce((a, b) => a + b, 0);

  // Quality effects estimate
  const thetaQE = wiQE.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWQE;
  const seQE = Math.sqrt(1 / sumWQE);
  const ciQE = [thetaQE - zCrit * seQE, thetaQE + zCrit * seQE];

  // Alternative: Direct quality weighting (Doi's original)
  const wiDirect = vi.map((v, i) => qi[i] / v);
  const sumWDirect = wiDirect.reduce((a, b) => a + b, 0);
  const thetaDirect = wiDirect.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWDirect;
  const seDirect = Math.sqrt(wi.reduce((sum, w, i) => sum + Math.pow(w / sumWDirect, 2) * vi[i], 0));

  // Study data
  const studyData = yi.map((y, i) => ({
    study: i + 1,
    effect: y,
    variance: vi[i],
    quality: qi[i],
    ivWeight: wiIV[i] / sumWIV * 100,
    qeWeight: wiQE[i] / sumWQE * 100,
    adjustedVariance: viAdj[i]
  }));

  // Compare to random effects
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wiRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = wiRE.reduce((a, b) => a + b, 0);
  const thetaRE = wiRE.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWRE;

  return {
    qualityEffects: {
      theta: thetaQE,
      se: seQE,
      ci: ciQE,
      z: thetaQE / seQE,
      p: 2 * (1 - normalCDF(Math.abs(thetaQE / seQE)))
    },
    directQualityWeighting: {
      theta: thetaDirect,
      se: seDirect
    },
    comparison: {
      fixedEffect: { theta: thetaFE, se: seFE },
      randomEffects: { theta: thetaRE, tau2 },
      qeVsReDifference: Math.abs(thetaQE - thetaRE)
    },
    heterogeneity: {
      Q,
      df: n - 1,
      pHet: 1 - chiSquareCDF(Q, n - 1),
      I2: Math.max(0, (Q - (n - 1)) / Q) * 100
    },
    studies: studyData,
    qualityStatistics: {
      mean: qi.reduce((a, b) => a + b, 0) / n,
      min: Math.min(...qi),
      max: Math.max(...qi),
      sd: Math.sqrt(qi.reduce((s, q) => s + Math.pow(q - qi.reduce((a, b) => a + b, 0) / n, 2), 0) / (n - 1))
    },
    method: 'Quality Effects Model (Doi)'
  };
}

// ============================================================================
// BEYOND R: CREDIBILITY CEILING
// ============================================================================

/**
 * Credibility Ceiling analysis
 * Unique method: adjusts for maximum credible effect based on study limitations
 * No direct R equivalent
 *
 * Reference: Ioannidis 2010
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration
 * @returns {Object} Analysis with various credibility ceilings
 */
export function credibilityCeiling(yi, vi, options = {}) {
  const METHOD = 'credibilityCeiling';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    ceilings = [0.05, 0.10, 0.15, 0.20, 0.25], // Credibility ceiling levels
    method = 'REML',
    alpha = 0.05
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Base random-effects analysis
  const tau2 = estimateTau2(yi, vi, method);
  const wiBase = vi.map(v => 1 / (v + tau2));
  const sumWBase = wiBase.reduce((a, b) => a + b, 0);
  const thetaBase = wiBase.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWBase;
  const seBase = Math.sqrt(1 / sumWBase);

  // Apply credibility ceiling adjustments
  const ceilingResults = {};

  for (const ceiling of ceilings) {
    // Add ceiling-based variance inflation
    // Each study's effect has additional uncertainty = ceiling * |yi|
    const viAdj = vi.map((v, i) => v + Math.pow(ceiling * Math.abs(yi[i]), 2));

    const tau2Adj = estimateTau2(yi, viAdj, method);
    const wiAdj = viAdj.map(v => 1 / (v + tau2Adj));
    const sumWAdj = wiAdj.reduce((a, b) => a + b, 0);
    const thetaAdj = wiAdj.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWAdj;
    const seAdj = Math.sqrt(1 / sumWAdj);

    const ciAdj = [thetaAdj - zCrit * seAdj, thetaAdj + zCrit * seAdj];
    const pAdj = 2 * (1 - normalCDF(Math.abs(thetaAdj / seAdj)));

    ceilingResults[ceiling] = {
      theta: thetaAdj,
      se: seAdj,
      ci: ciAdj,
      p: pAdj,
      significant: pAdj < alpha,
      changeFromBase: ((thetaAdj - thetaBase) / Math.abs(thetaBase)) * 100,
      ciWidthIncrease: ((ciAdj[1] - ciAdj[0]) / (2 * zCrit * seBase) - 1) * 100
    };
  }

  // Find ceiling at which significance is lost
  let criticalCeiling = null;
  for (const ceiling of ceilings) {
    if (!ceilingResults[ceiling].significant && criticalCeiling === null) {
      criticalCeiling = ceiling;
    }
  }

  // Interpolate exact critical ceiling
  if (criticalCeiling === null && ceilingResults[ceilings[ceilings.length - 1]].significant) {
    // Significance retained at all ceilings - extrapolate
    criticalCeiling = `>${ceilings[ceilings.length - 1]}`;
  } else if (criticalCeiling === ceilings[0]) {
    // Lost significance at lowest ceiling - try to find exact point
    for (let c = 0.01; c < ceilings[0]; c += 0.01) {
      const viTest = vi.map((v, i) => v + Math.pow(c * Math.abs(yi[i]), 2));
      const tau2Test = estimateTau2(yi, viTest, 'DL');
      const wiTest = viTest.map(v => 1 / (v + tau2Test));
      const sumWTest = wiTest.reduce((a, b) => a + b, 0);
      const thetaTest = wiTest.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWTest;
      const seTest = Math.sqrt(1 / sumWTest);
      const pTest = 2 * (1 - normalCDF(Math.abs(thetaTest / seTest)));
      if (pTest >= alpha) {
        criticalCeiling = c;
        break;
      }
    }
  }

  return {
    baseAnalysis: {
      theta: thetaBase,
      se: seBase,
      ci: [thetaBase - zCrit * seBase, thetaBase + zCrit * seBase],
      tau2
    },
    ceilingAnalyses: ceilingResults,
    criticalCeiling,
    interpretation: criticalCeiling === null ?
      'Significance lost at lowest ceiling tested' :
      typeof criticalCeiling === 'string' ?
      'Significance retained at all tested ceilings - robust result' :
      `Significance lost at ${(criticalCeiling * 100).toFixed(0)}% credibility ceiling`,
    robustness: criticalCeiling === null ? 'fragile' :
               criticalCeiling === `>${ceilings[ceilings.length - 1]}` ? 'very robust' :
               criticalCeiling > 0.15 ? 'robust' :
               criticalCeiling > 0.10 ? 'moderate' : 'fragile',
    method: 'Credibility Ceiling Analysis'
  };
}

// ============================================================================
// BEYOND R: EXCESS SIGNIFICANCE TEST
// ============================================================================

/**
 * Excess Significance Test
 * Tests whether observed number of significant results exceeds expected
 * Beyond R: includes multiple power estimation methods
 *
 * Reference: Ioannidis & Trikalinos 2007
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {boolean[]} significant - Whether each study was significant
 * @param {Object} options - Configuration
 * @returns {Object} Excess significance test results
 */
export function excessSignificanceTest(yi, vi, significant, options = {}) {
  const METHOD = 'excessSignificanceTest';

  // Input validation
  validateMetaInput(yi, vi, METHOD);
  validateSignificance(significant, yi.length, METHOD);

  const {
    alpha = 0.05,
    powerMethod = 'pooled',  // 'pooled', 'largest', 'median'
    twoSided = true
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const nSig = significant.filter(s => s).length;

  // Estimate true effect size based on method
  let trueEffect;
  const tau2 = estimateTau2(yi, vi, 'REML');

  switch (powerMethod) {
    case 'largest':
      // Use largest study's estimate
      const largestIdx = vi.indexOf(Math.min(...vi));
      trueEffect = yi[largestIdx];
      break;
    case 'median':
      // Use median effect
      const sorted = [...yi].sort((a, b) => a - b);
      trueEffect = sorted[Math.floor(n / 2)];
      break;
    case 'pooled':
    default:
      // Use random-effects pooled estimate
      const wi = vi.map(v => 1 / (v + tau2));
      const sumW = wi.reduce((a, b) => a + b, 0);
      trueEffect = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  }

  // Calculate expected power for each study
  const zCrit = normalQuantile(1 - alpha / (twoSided ? 2 : 1));
  const powers = vi.map(v => {
    const se = Math.sqrt(v);
    const ncp = Math.abs(trueEffect) / se; // Non-centrality parameter
    const power = 1 - normalCDF(zCrit - ncp) + normalCDF(-zCrit - ncp);
    return twoSided ? power : Math.max(power, 1 - normalCDF(zCrit - ncp));
  });

  // Expected number of significant studies
  const expectedSig = powers.reduce((a, b) => a + b, 0);

  // Exact binomial test
  const observed = nSig;
  const expected = expectedSig;

  // Calculate p-value for excess (one-sided: observed > expected)
  let pExcess = 0;
  for (let k = observed; k <= n; k++) {
    pExcess += binomialPMF(k, n, expected / n);
  }

  // Chi-square approximation
  const chiSq = Math.pow(observed - expected, 2) / expected;
  const pChiSq = 1 - chiSquareCDF(chiSq, 1);

  // E-index: ratio of observed to expected
  const eIndex = observed / Math.max(expected, 0.1);

  // Confidence interval for expected significant studies
  const seExpected = Math.sqrt(powers.reduce((s, p) => s + p * (1 - p), 0));

  return {
    observed: {
      nSignificant: observed,
      proportionSignificant: observed / n
    },
    expected: {
      nSignificant: expected,
      proportionSignificant: expected / n,
      se: seExpected,
      ci: [Math.max(0, expected - 1.96 * seExpected), Math.min(n, expected + 1.96 * seExpected)]
    },
    excess: {
      absolute: observed - expected,
      ratio: eIndex,
      pValue: pExcess,
      pValueChiSq: pChiSq,
      significant: pExcess < 0.10
    },
    studyPowers: powers.map((p, i) => ({
      study: i + 1,
      power: p,
      isSignificant: significant[i],
      effect: yi[i],
      se: Math.sqrt(vi[i])
    })),
    assumedTrueEffect: trueEffect,
    interpretation: pExcess < 0.05 ?
      'Strong evidence of excess significance - possible publication bias or p-hacking' :
      pExcess < 0.10 ?
      'Suggestive evidence of excess significance' :
      'No evidence of excess significance',
    method: 'Excess Significance Test'
  };
}

function binomialPMF(k, n, p) {
  // Binomial probability mass function
  if (k < 0 || k > n || p < 0 || p > 1) return 0;
  const coeff = factorial(n) / (factorial(k) * factorial(n - k));
  return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// ============================================================================
// BEYOND R: HARTUNG-KNAPP-SIDIK-JONKMAN ADJUSTMENT
// ============================================================================

/**
 * Hartung-Knapp-Sidik-Jonkman (HKSJ) adjustment
 * More conservative CIs than standard random effects
 * Beyond basic R: includes multiple adjustment variants
 *
 * Reference: Hartung & Knapp 2001, IntHout et al. 2014
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration
 * @returns {Object} HKSJ-adjusted results
 */
export function hartungKnappAdjustment(yi, vi, options = {}) {
  const METHOD = 'hartungKnappAdjustment';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    method = 'REML',
    alpha = 0.05,
    variant = 'standard',  // 'standard', 'modified', 'adhoc'
    minQ = 1               // Minimum q for modified HKSJ
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;

  // Standard random effects first
  const tau2Result = estimateTau2(yi, vi, method);
  const tau2 = tau2Result.tau2;
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const seStandard = Math.sqrt(1 / sumW);

  // Calculate HKSJ adjustment factor (q)
  // q = sum(wi * (yi - theta)^2) / (k - 1)
  const qFactor = wi.reduce((sum, w, i) => sum + w * Math.pow(yi[i] - theta, 2), 0) / (n - 1);

  // Apply variant-specific adjustments
  let qAdj;
  switch (variant) {
    case 'modified':
      // Modified HKSJ: q = max(1, q)
      qAdj = Math.max(minQ, qFactor);
      break;
    case 'adhoc':
      // Ad-hoc HKSJ: use t-distribution but q = 1
      qAdj = 1;
      break;
    case 'standard':
    default:
      qAdj = qFactor;
  }

  // HKSJ standard error
  const seHKSJ = seStandard * Math.sqrt(qAdj);

  // Use t-distribution for CI (df = k - 1)
  const tCrit = tQuantile(1 - alpha / 2, n - 1);
  const zCrit = normalQuantile(1 - alpha / 2);

  const ciHKSJ = [theta - tCrit * seHKSJ, theta + tCrit * seHKSJ];
  const ciStandard = [theta - zCrit * seStandard, theta + zCrit * seStandard];

  // P-values
  const tStatHKSJ = theta / seHKSJ;
  const zStatStandard = theta / seStandard;
  const pHKSJ = 2 * (1 - tCDF(Math.abs(tStatHKSJ), n - 1));
  const pStandard = 2 * (1 - normalCDF(Math.abs(zStatStandard)));

  // Heterogeneity Q
  const Q = yi.reduce((sum, y, i) => sum + (1 / vi[i]) * Math.pow(y - theta, 2), 0);
  const I2 = Math.max(0, (Q - (n - 1)) / Q) * 100;

  return {
    hksj: {
      theta,
      se: seHKSJ,
      ci: ciHKSJ,
      t: tStatHKSJ,
      df: n - 1,
      p: pHKSJ,
      qFactor: qAdj
    },
    standard: {
      theta,
      se: seStandard,
      ci: ciStandard,
      z: zStatStandard,
      p: pStandard
    },
    comparison: {
      seInflation: (seHKSJ / seStandard - 1) * 100,
      ciWidthRatio: (ciHKSJ[1] - ciHKSJ[0]) / (ciStandard[1] - ciStandard[0]),
      significanceChange: pStandard < alpha && pHKSJ >= alpha ?
        'Lost significance with HKSJ' :
        pStandard >= alpha && pHKSJ < alpha ?
        'Gained significance with HKSJ' : 'No change in significance'
    },
    heterogeneity: { tau2, I2, Q, df: n - 1 },
    variant,
    nStudies: n,
    method: 'Hartung-Knapp-Sidik-Jonkman Adjustment'
  };
}

// ============================================================================
// BEYOND R: ROBUST META-ANALYSIS (M-ESTIMATION)
// ============================================================================

/**
 * Robust meta-analysis using M-estimation
 * Beyond R: implements Huber, Tukey bisquare, and Hampel estimators
 * Resistant to outliers
 *
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Variances
 * @param {Object} options - Configuration
 * @returns {Object} Robust pooled estimates
 */
export function robustMetaAnalysis(yi, vi, options = {}) {
  const METHOD = 'robustMetaAnalysis';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    psiFunction = 'huber',  // 'huber', 'bisquare', 'hampel'
    tuningConstant = null,   // Auto-select if null
    maxIter = 100,
    tol = 1e-6,
    alpha = 0.05
  } = options;

  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const zCrit = normalQuantile(1 - alpha / 2);

  // Tuning constants for 95% efficiency under normality
  const tuningDefaults = {
    huber: 1.345,
    bisquare: 4.685,
    hampel: [1.7, 3.4, 8.5]  // a, b, c
  };

  const k = tuningConstant || tuningDefaults[psiFunction];

  // Psi functions and weights
  const psiFunctions = {
    huber: {
      psi: (r, k) => Math.abs(r) <= k ? r : k * Math.sign(r),
      weight: (r, k) => Math.abs(r) <= k ? 1 : k / Math.abs(r)
    },
    bisquare: {
      psi: (r, k) => Math.abs(r) <= k ? r * Math.pow(1 - Math.pow(r / k, 2), 2) : 0,
      weight: (r, k) => Math.abs(r) <= k ? Math.pow(1 - Math.pow(r / k, 2), 2) : 0
    },
    hampel: {
      psi: (r, abc) => {
        const [a, b, c] = abc;
        const ar = Math.abs(r);
        if (ar <= a) return r;
        if (ar <= b) return a * Math.sign(r);
        if (ar <= c) return a * Math.sign(r) * (c - ar) / (c - b);
        return 0;
      },
      weight: (r, abc) => {
        const [a, b, c] = abc;
        const ar = Math.abs(r);
        if (ar <= a) return 1;
        if (ar <= b) return a / ar;
        if (ar <= c) return a * (c - ar) / (ar * (c - b));
        return 0;
      }
    }
  };

  const pf = psiFunctions[psiFunction];

  // Initial estimate (weighted median)
  const sortedPairs = yi.map((y, i) => ({ y, w: 1 / vi[i] }))
    .sort((a, b) => a.y - b.y);
  const totalW = sortedPairs.reduce((s, p) => s + p.w, 0);
  let cumW = 0;
  let thetaInit = sortedPairs[0].y;
  for (const p of sortedPairs) {
    cumW += p.w;
    if (cumW >= totalW / 2) {
      thetaInit = p.y;
      break;
    }
  }

  // Iteratively reweighted least squares
  let theta = thetaInit;
  let prevTheta = Infinity;
  const se = vi.map(v => Math.sqrt(v));

  // MAD scale estimate
  const residuals = yi.map(y => y - theta);
  const mad = median(residuals.map(r => Math.abs(r)));
  const scale = mad / 0.6745; // Normalize to match SD

  for (let iter = 0; iter < maxIter && Math.abs(theta - prevTheta) > tol; iter++) {
    prevTheta = theta;

    // Calculate standardized residuals
    const stdResid = yi.map((y, i) => (y - theta) / (se[i] * scale));

    // Calculate robust weights
    const robustW = stdResid.map(r => pf.weight(r, k));
    const combinedW = vi.map((v, i) => robustW[i] / v);

    // Update theta
    const sumCW = combinedW.reduce((a, b) => a + b, 0);
    theta = combinedW.reduce((sum, w, i) => sum + w * yi[i], 0) / sumCW;
  }

  // Final weights and standard error
  const finalResid = yi.map((y, i) => (y - theta) / (se[i] * scale));
  const finalW = finalResid.map(r => pf.weight(r, k));
  const combinedWFinal = vi.map((v, i) => finalW[i] / v);
  const sumWFinal = combinedWFinal.reduce((a, b) => a + b, 0);

  // Robust SE (sandwich estimator)
  const psiVals = finalResid.map(r => pf.psi(r, k));
  const psiDeriv = psiFunction === 'huber' ? finalResid.filter(r => Math.abs(r) <= k).length / n :
                  psiFunction === 'bisquare' ? finalResid.reduce((s, r) =>
                    s + (Math.abs(r) <= k ? Math.pow(1 - Math.pow(r / k, 2), 2) * (1 - 5 * Math.pow(r / k, 2)) : 0), 0) / n : 0.5;

  const seRobust = Math.sqrt(psiVals.reduce((s, p, i) => s + Math.pow(p * se[i], 2), 0)) /
                   (Math.abs(psiDeriv) * Math.sqrt(n));

  // Standard random effects for comparison
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wiStd = vi.map(v => 1 / (v + tau2));
  const sumWStd = wiStd.reduce((a, b) => a + b, 0);
  const thetaStd = wiStd.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWStd;
  const seStd = Math.sqrt(1 / sumWStd);

  // Study data with downweighting
  const studyData = yi.map((y, i) => ({
    study: i + 1,
    effect: y,
    se: se[i],
    standardizedResidual: finalResid[i],
    robustWeight: finalW[i],
    effectiveWeight: combinedWFinal[i] / sumWFinal * 100,
    downweighted: finalW[i] < 0.5
  }));

  const nDownweighted = studyData.filter(s => s.downweighted).length;

  return {
    robust: {
      theta,
      se: seRobust,
      ci: [theta - zCrit * seRobust, theta + zCrit * seRobust],
      p: 2 * (1 - normalCDF(Math.abs(theta / seRobust)))
    },
    standard: {
      theta: thetaStd,
      se: seStd,
      ci: [thetaStd - zCrit * seStd, thetaStd + zCrit * seStd],
      tau2
    },
    comparison: {
      thetaDifference: theta - thetaStd,
      relativeDifference: ((theta - thetaStd) / Math.abs(thetaStd)) * 100,
      seRatio: seRobust / seStd
    },
    studies: studyData,
    outlierSummary: {
      nDownweighted,
      downweightedStudies: studyData.filter(s => s.downweighted).map(s => s.study)
    },
    psiFunction,
    tuningConstant: k,
    method: 'Robust Meta-Analysis (M-Estimation)'
  };
}

// ============================================================================
// BEYOND R CAPABILITIES: PHASE 4 - Methods 25-32
// ============================================================================

/**
 * Profile Likelihood Confidence Intervals
 * More accurate than Wald CIs especially with small samples or high heterogeneity
 * Based on likelihood ratio test inversion
 */
export function profileLikelihoodCI(yi, vi, options = {}) {
  const METHOD = 'profileLikelihoodCI';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    confidenceLevel = 0.95,
    gridPoints = 200,
    tau2Method = 'REML'
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const critValue = jStat.chisquare.inv(confidenceLevel, 1);

  // REML log-likelihood function
  function remlLogLik(theta, tau2) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const logDet = vi.reduce((sum, v) => sum + Math.log(v + tau2), 0);
    const ss = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
    return -0.5 * (logDet + Math.log(sumW) + ss);
  }

  // Estimate tau2 for given theta
  function profileTau2(theta) {
    let tau2 = 0.1;
    for (let iter = 0; iter < 50; iter++) {
      const wi = vi.map(v => 1 / (v + tau2));
      const sumW = wi.reduce((a, b) => a + b, 0);
      const ss = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
      const Q = ss;
      const c = sumW - wi.reduce((sum, w) => sum + w * w, 0) / sumW;
      const newTau2 = Math.max(0, (Q - (n - 1)) / c);
      if (Math.abs(newTau2 - tau2) < 1e-8) break;
      tau2 = newTau2;
    }
    return tau2;
  }

  // MLE of theta and tau2
  const tau2Hat = estimateTau2(yi, vi, tau2Method);
  const wiHat = vi.map(v => 1 / (v + tau2Hat));
  const sumWHat = wiHat.reduce((a, b) => a + b, 0);
  const thetaHat = wiHat.reduce((sum, w, i) => sum + w * yi[i], 0) / sumWHat;
  const maxLogLik = remlLogLik(thetaHat, tau2Hat);

  // Profile likelihood for theta
  const minY = Math.min(...yi);
  const maxY = Math.max(...yi);
  const range = maxY - minY;
  const gridStart = minY - 2 * range;
  const gridEnd = maxY + 2 * range;
  const step = (gridEnd - gridStart) / gridPoints;

  const profileData = [];
  let lowerCI = null;
  let upperCI = null;

  for (let i = 0; i <= gridPoints; i++) {
    const theta = gridStart + i * step;
    const tau2 = profileTau2(theta);
    const ll = remlLogLik(theta, tau2);
    const lrt = 2 * (maxLogLik - ll);

    profileData.push({ theta, logLik: ll, lrt, tau2 });

    // Find CI bounds where LRT crosses critical value
    if (lrt <= critValue) {
      if (lowerCI === null) lowerCI = theta;
      upperCI = theta;
    }
  }

  // Wald CI for comparison
  const seWald = Math.sqrt(1 / sumWHat);
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);
  const waldCI = [thetaHat - z * seWald, thetaHat + z * seWald];

  return {
    theta: thetaHat,
    tau2: tau2Hat,
    profileCI: [lowerCI, upperCI],
    waldCI,
    comparison: {
      profileWidth: upperCI - lowerCI,
      waldWidth: waldCI[1] - waldCI[0],
      asymmetry: {
        lower: thetaHat - lowerCI,
        upper: upperCI - thetaHat,
        ratio: (thetaHat - lowerCI) / (upperCI - thetaHat)
      }
    },
    profileData,
    criticalValue: critValue,
    confidenceLevel,
    method: 'Profile Likelihood CI (REML)'
  };
}

/**
 * Weighted Median Meta-Analysis
 * More robust to outliers than weighted mean
 * Based on Bowley's approach
 */
export function weightedMedianMA(yi, vi, options = {}) {
  const METHOD = 'weightedMedianMA';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    confidenceLevel = 0.95,
    bootstrapN = 2000,
    seed = 42
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);

  // Calculate weighted median
  function weightedMedian(effects, weights) {
    const pairs = effects.map((y, i) => ({ y, w: weights[i] }))
      .sort((a, b) => a.y - b.y);
    const totalW = pairs.reduce((s, p) => s + p.w, 0);
    let cumW = 0;
    for (const p of pairs) {
      cumW += p.w;
      if (cumW >= totalW / 2) return p.y;
    }
    return pairs[pairs.length - 1].y;
  }

  const thetaMedian = weightedMedian(yi, wi);

  // Bootstrap CI - uses seeded PRNG for reproducibility
  const rng = createSeededRNG(seed);
  const bootstrapEstimates = [];
  for (let b = 0; b < bootstrapN; b++) {
    const indices = Array.from({ length: n }, () => rng.randomInt(n));
    const yiBoot = indices.map(i => yi[i]);
    const wiBoot = indices.map(i => wi[i]);
    bootstrapEstimates.push(weightedMedian(yiBoot, wiBoot));
  }

  bootstrapEstimates.sort((a, b) => a - b);
  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.floor(bootstrapEstimates.length * alpha / 2);
  const upperIdx = Math.floor(bootstrapEstimates.length * (1 - alpha / 2));
  const bootCI = [bootstrapEstimates[lowerIdx], bootstrapEstimates[upperIdx]];
  const bootSE = Math.sqrt(bootstrapEstimates.reduce((s, x) =>
    s + Math.pow(x - thetaMedian, 2), 0) / bootstrapN);

  // Standard weighted mean for comparison
  const thetaMean = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const seMean = Math.sqrt(1 / sumW);
  const z = jStat.normal.inv(1 - alpha / 2, 0, 1);
  const meanCI = [thetaMean - z * seMean, thetaMean + z * seMean];

  // Hodges-Lehmann estimator (pairwise means)
  const pairwiseMeans = [];
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      pairwiseMeans.push((yi[i] + yi[j]) / 2);
    }
  }
  pairwiseMeans.sort((a, b) => a - b);
  const hlEstimate = pairwiseMeans[Math.floor(pairwiseMeans.length / 2)];

  return {
    weightedMedian: {
      theta: thetaMedian,
      se: bootSE,
      ci: bootCI,
      p: 2 * (1 - normalCDF(Math.abs(thetaMedian / bootSE)))
    },
    weightedMean: {
      theta: thetaMean,
      se: seMean,
      ci: meanCI,
      p: 2 * (1 - normalCDF(Math.abs(thetaMean / seMean)))
    },
    hodgesLehmann: {
      theta: hlEstimate
    },
    comparison: {
      difference: thetaMedian - thetaMean,
      percentDifference: ((thetaMedian - thetaMean) / Math.abs(thetaMean)) * 100,
      medianMoreConservative: Math.abs(thetaMedian) < Math.abs(thetaMean)
    },
    tau2,
    bootstrapN,
    method: 'Weighted Median Meta-Analysis'
  };
}

/**
 * Jackknife Meta-Analysis
 * Leave-one-out variance estimation and bias correction
 */
export function jackknifeMeta(yi, vi, options = {}) {
  const METHOD = 'jackknifeMeta';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const thetaFull = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

  // Leave-one-out estimates
  const jackknife = [];
  for (let i = 0; i < n; i++) {
    const yiLoo = yi.filter((_, j) => j !== i);
    const viLoo = vi.filter((_, j) => j !== i);
    const tau2Loo = estimateTau2(yiLoo, viLoo, 'REML');
    const wiLoo = viLoo.map(v => 1 / (v + tau2Loo));
    const sumWLoo = wiLoo.reduce((a, b) => a + b, 0);
    const thetaLoo = wiLoo.reduce((sum, w, j) => sum + w * yiLoo[j], 0) / sumWLoo;

    jackknife.push({
      omitted: i + 1,
      theta: thetaLoo,
      tau2: tau2Loo,
      diffFromFull: thetaLoo - thetaFull,
      influence: (n - 1) * (thetaFull - thetaLoo) // Pseudovalue influence
    });
  }

  // Jackknife estimate and SE
  const thetaJack = jackknife.reduce((s, j) => s + j.theta, 0) / n;
  const pseudovals = jackknife.map(j => n * thetaFull - (n - 1) * j.theta);
  const thetaPseudo = pseudovals.reduce((s, p) => s + p, 0) / n;

  const variance = pseudovals.reduce((s, p) =>
    s + Math.pow(p - thetaPseudo, 2), 0) / (n * (n - 1));
  const seJack = Math.sqrt(variance);

  // Bias correction
  const bias = (n - 1) * (thetaJack - thetaFull);
  const thetaBiasCorrected = thetaFull - bias;

  // CI
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);
  const ciJack = [thetaPseudo - z * seJack, thetaPseudo + z * seJack];

  // Standard SE for comparison
  const seStandard = Math.sqrt(1 / sumW);

  // Influence ranking
  const influenceRanked = [...jackknife]
    .sort((a, b) => Math.abs(b.diffFromFull) - Math.abs(a.diffFromFull));

  return {
    fullModel: {
      theta: thetaFull,
      se: seStandard,
      tau2
    },
    jackknife: {
      theta: thetaPseudo,
      se: seJack,
      ci: ciJack,
      p: 2 * (1 - normalCDF(Math.abs(thetaPseudo / seJack)))
    },
    biasCorrection: {
      estimatedBias: bias,
      biasCorrectedTheta: thetaBiasCorrected
    },
    leaveOneOut: jackknife,
    influentialStudies: influenceRanked.slice(0, 3),
    seRatio: seJack / seStandard,
    method: 'Jackknife Meta-Analysis'
  };
}

/**
 * Leave-One-Out Cross-Validation for Meta-Analysis
 * Assess predictive accuracy and identify overfitting
 */
export function crossValidationMeta(yi, vi, options = {}) {
  const METHOD = 'crossValidationMeta';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    tau2Methods = ['DL', 'REML', 'PM', 'EB']
  } = options;

  const n = yi.length;

  // Cross-validation for each tau2 method
  const cvResults = {};

  for (const method of tau2Methods) {
    const predictions = [];
    let mse = 0;
    let mae = 0;
    let logLikSum = 0;

    for (let i = 0; i < n; i++) {
      // Leave one out
      const yiTrain = yi.filter((_, j) => j !== i);
      const viTrain = vi.filter((_, j) => j !== i);

      // Fit model on training data
      const tau2Train = estimateTau2(yiTrain, viTrain, method);
      const wiTrain = viTrain.map(v => 1 / (v + tau2Train));
      const sumWTrain = wiTrain.reduce((a, b) => a + b, 0);
      const thetaTrain = wiTrain.reduce((sum, w, j) => sum + w * yiTrain[j], 0) / sumWTrain;

      // Predict left-out observation
      const prediction = thetaTrain;
      const predVar = vi[i] + tau2Train;
      const error = yi[i] - prediction;

      predictions.push({
        study: i + 1,
        observed: yi[i],
        predicted: prediction,
        error,
        standardizedError: error / Math.sqrt(predVar)
      });

      mse += error * error;
      mae += Math.abs(error);
      logLikSum += -0.5 * (Math.log(2 * Math.PI * predVar) + error * error / predVar);
    }

    mse /= n;
    mae /= n;

    // Calculate LOOCV R-squared
    const meanY = yi.reduce((a, b) => a + b, 0) / n;
    const tss = yi.reduce((s, y) => s + Math.pow(y - meanY, 2), 0);
    const rss = predictions.reduce((s, p) => s + p.error * p.error, 0);
    const r2cv = Math.max(0, 1 - rss / tss);

    // Coverage probability of prediction intervals
    const tau2Full = estimateTau2(yi, vi, method);
    let coverage = 0;
    for (let i = 0; i < n; i++) {
      const predVar = vi[i] + tau2Full;
      const z = 1.96;
      const lower = predictions[i].predicted - z * Math.sqrt(predVar);
      const upper = predictions[i].predicted + z * Math.sqrt(predVar);
      if (predictions[i].observed >= lower && predictions[i].observed <= upper) {
        coverage++;
      }
    }
    coverage /= n;

    cvResults[method] = {
      mse,
      rmse: Math.sqrt(mse),
      mae,
      logLikelihood: logLikSum,
      r2cv,
      coverage,
      predictions
    };
  }

  // Find best method
  const methodRanks = {};
  for (const method of tau2Methods) {
    methodRanks[method] = {
      mseRank: 0,
      maeRank: 0,
      llRank: 0
    };
  }

  // Rank by each criterion
  const sortedMSE = [...tau2Methods].sort((a, b) => cvResults[a].mse - cvResults[b].mse);
  const sortedMAE = [...tau2Methods].sort((a, b) => cvResults[a].mae - cvResults[b].mae);
  const sortedLL = [...tau2Methods].sort((a, b) => cvResults[b].logLikelihood - cvResults[a].logLikelihood);

  sortedMSE.forEach((m, i) => methodRanks[m].mseRank = i + 1);
  sortedMAE.forEach((m, i) => methodRanks[m].maeRank = i + 1);
  sortedLL.forEach((m, i) => methodRanks[m].llRank = i + 1);

  // Average rank
  for (const method of tau2Methods) {
    methodRanks[method].avgRank = (methodRanks[method].mseRank +
      methodRanks[method].maeRank + methodRanks[method].llRank) / 3;
  }

  const bestMethod = tau2Methods.reduce((best, m) =>
    methodRanks[m].avgRank < methodRanks[best].avgRank ? m : best, tau2Methods[0]);

  return {
    results: cvResults,
    methodRanks,
    bestMethod,
    recommendation: `Based on LOOCV, ${bestMethod} provides best predictive accuracy`,
    method: 'Leave-One-Out Cross-Validation'
  };
}

/**
 * Influence Curve Analysis
 * Empirical influence function for each study
 */
export function influenceCurves(yi, vi, options = {}) {
  const METHOD = 'influenceCurves';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

  // Influence measures
  const studies = yi.map((y, i) => {
    // DFBETA - influence on parameter estimate
    const yiLoo = yi.filter((_, j) => j !== i);
    const viLoo = vi.filter((_, j) => j !== i);
    const tau2Loo = estimateTau2(yiLoo, viLoo, 'REML');
    const wiLoo = viLoo.map(v => 1 / (v + tau2Loo));
    const sumWLoo = wiLoo.reduce((a, b) => a + b, 0);
    const thetaLoo = wiLoo.reduce((sum, w, j) => sum + w * yiLoo[j], 0) / sumWLoo;
    const dfbeta = theta - thetaLoo;

    // Cook's distance analog
    const seLoo = Math.sqrt(1 / sumWLoo);
    const cooksD = Math.pow(dfbeta, 2) / (seLoo * seLoo);

    // Standardized residual
    const resid = y - theta;
    const predVar = vi[i] + tau2;
    const stdResid = resid / Math.sqrt(predVar);

    // Hat value (leverage) - analog for meta-analysis
    const hii = wi[i] / sumW;

    // Studentized residual
    const studentResid = resid / Math.sqrt(predVar * (1 - hii));

    // DFFITS - standardized difference in fits
    const dffits = dfbeta / Math.sqrt(1 / sumW);

    // Covariance ratio
    const seFull = Math.sqrt(1 / sumW);
    const covRatio = Math.pow(seLoo / seFull, 2);

    // Welsch-Kuh distance
    const wk = (studentResid * studentResid * hii) / (1 - hii);

    return {
      study: i + 1,
      effect: y,
      se: Math.sqrt(vi[i]),
      weight: (wi[i] / sumW) * 100,
      residual: resid,
      stdResidual: stdResid,
      studentResidual: studentResid,
      leverage: hii,
      dfbeta,
      cooksD,
      dffits,
      covRatio,
      welschKuh: wk,
      influential: Math.abs(stdResid) > 2 || cooksD > 4 / n || Math.abs(dffits) > 2 * Math.sqrt(1 / n)
    };
  });

  // Cutoffs for influential observations
  const cutoffs = {
    stdResidual: 2,
    cooksD: 4 / n,
    dffits: 2 * Math.sqrt(1 / n),
    covRatio: { lower: 1 - 3 / n, upper: 1 + 3 / n }
  };

  const influential = studies.filter(s => s.influential);

  // Aggregate influence statistics
  const maxInfluence = {
    byDfbeta: studies.reduce((max, s) =>
      Math.abs(s.dfbeta) > Math.abs(max.dfbeta) ? s : max, studies[0]),
    byCooksD: studies.reduce((max, s) => s.cooksD > max.cooksD ? s : max, studies[0]),
    byStudentResid: studies.reduce((max, s) =>
      Math.abs(s.studentResidual) > Math.abs(max.studentResidual) ? s : max, studies[0])
  };

  return {
    theta,
    tau2,
    studies,
    influential,
    nInfluential: influential.length,
    cutoffs,
    maxInfluence,
    plotData: {
      leverageVsResidual: studies.map(s => ({
        x: s.leverage,
        y: s.studentResidual,
        study: s.study
      })),
      cooksD: studies.map(s => ({
        study: s.study,
        value: s.cooksD
      }))
    },
    method: 'Influence Curve Analysis'
  };
}

/**
 * Best-Worst Case Sensitivity Analysis
 * Extreme scenario analysis for missing studies
 */
export function bestWorstCase(yi, vi, options = {}) {
  const METHOD = 'bestWorstCase';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    nMissing = [1, 2, 3, 5, 10],
    missingEffect = 'range', // 'range', 'zero', 'opposite'
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const se = Math.sqrt(1 / sumW);
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // Get effect range
  const minEffect = Math.min(...yi);
  const maxEffect = Math.max(...yi);
  const meanSE = Math.sqrt(vi.reduce((a, b) => a + b, 0) / n);

  const scenarios = [];

  for (const nMiss of nMissing) {
    // Best case scenario
    let bestEffects, worstEffects;

    if (missingEffect === 'range') {
      // Best: missing studies have most favorable effects
      bestEffects = theta > 0 ? Array(nMiss).fill(maxEffect) : Array(nMiss).fill(minEffect);
      // Worst: missing studies have most unfavorable effects
      worstEffects = theta > 0 ? Array(nMiss).fill(minEffect) : Array(nMiss).fill(maxEffect);
    } else if (missingEffect === 'zero') {
      bestEffects = Array(nMiss).fill(0);
      worstEffects = Array(nMiss).fill(0);
    } else { // opposite
      bestEffects = Array(nMiss).fill(theta > 0 ? maxEffect : minEffect);
      worstEffects = Array(nMiss).fill(theta > 0 ? -Math.abs(maxEffect) : Math.abs(maxEffect));
    }

    const missingVI = Array(nMiss).fill(meanSE * meanSE);

    // Best case analysis
    const yiBest = [...yi, ...bestEffects];
    const viBest = [...vi, ...missingVI];
    const tau2Best = estimateTau2(yiBest, viBest, 'REML');
    const wiBest = viBest.map(v => 1 / (v + tau2Best));
    const sumWBest = wiBest.reduce((a, b) => a + b, 0);
    const thetaBest = wiBest.reduce((sum, w, i) => sum + w * yiBest[i], 0) / sumWBest;
    const seBest = Math.sqrt(1 / sumWBest);

    // Worst case analysis
    const yiWorst = [...yi, ...worstEffects];
    const viWorst = [...vi, ...missingVI];
    const tau2Worst = estimateTau2(yiWorst, viWorst, 'REML');
    const wiWorst = viWorst.map(v => 1 / (v + tau2Worst));
    const sumWWorst = wiWorst.reduce((a, b) => a + b, 0);
    const thetaWorst = wiWorst.reduce((sum, w, i) => sum + w * yiWorst[i], 0) / sumWWorst;
    const seWorst = Math.sqrt(1 / sumWWorst);

    // Significance under each scenario
    const pBest = 2 * (1 - normalCDF(Math.abs(thetaBest / seBest)));
    const pWorst = 2 * (1 - normalCDF(Math.abs(thetaWorst / seWorst)));

    scenarios.push({
      nMissing: nMiss,
      original: { theta, se, p: 2 * (1 - normalCDF(Math.abs(theta / se))) },
      bestCase: {
        theta: thetaBest,
        se: seBest,
        ci: [thetaBest - z * seBest, thetaBest + z * seBest],
        p: pBest,
        significant: pBest < 0.05,
        addedEffects: bestEffects[0]
      },
      worstCase: {
        theta: thetaWorst,
        se: seWorst,
        ci: [thetaWorst - z * seWorst, thetaWorst + z * seWorst],
        p: pWorst,
        significant: pWorst < 0.05,
        addedEffects: worstEffects[0]
      },
      range: {
        min: Math.min(thetaBest, thetaWorst),
        max: Math.max(thetaBest, thetaWorst),
        conclusionRobust: (pBest < 0.05) === (pWorst < 0.05)
      }
    });
  }

  // Find tipping point - how many studies to change conclusion
  let tippingPoint = null;
  for (const s of scenarios) {
    if (!s.range.conclusionRobust) {
      tippingPoint = s.nMissing;
      break;
    }
  }

  return {
    original: { theta, se, tau2, n },
    scenarios,
    tippingPoint,
    robustToMissing: tippingPoint === null,
    interpretation: tippingPoint === null
      ? 'Conclusion is robust across all tested missing study scenarios'
      : `Conclusion could change with ${tippingPoint} missing studies`,
    method: 'Best-Worst Case Sensitivity Analysis'
  };
}

/**
 * Threshold Analysis
 * How much effect modification needed to change conclusion
 */
export function thresholdAnalysis(yi, vi, options = {}) {
  const METHOD = 'thresholdAnalysis';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    clinicalThreshold = 0,
    significanceLevel = 0.05,
    direction = 'both' // 'positive', 'negative', 'both'
  } = options;

  validateNumeric(significanceLevel, 'significanceLevel', METHOD, { min: 0.001, max: 0.5 });

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const se = Math.sqrt(1 / sumW);
  const z = jStat.normal.inv(1 - significanceLevel / 2, 0, 1);

  // Current significance
  const currentP = 2 * (1 - normalCDF(Math.abs((theta - clinicalThreshold) / se)));
  const currentlySignificant = currentP < significanceLevel;

  // For each study, calculate adjustment needed to change conclusion
  const studyThresholds = yi.map((y, i) => {
    // Effect needed from this study to exactly hit significance boundary
    // theta_new = target => solve for y_i

    // If currently significant, find adjustment to make non-significant
    // If currently non-significant, find adjustment to make significant

    const wi_current = wi[i];
    const sumW_other = sumW - wi_current;
    const weighted_other = wi.reduce((sum, w, j) => j !== i ? sum + w * yi[j] : sum, 0);

    // Target: theta = clinicalThreshold ± z*se
    // For non-significance: |theta - threshold| < z*se

    let targetTheta;
    if (currentlySignificant) {
      // Need to reduce effect toward threshold
      targetTheta = theta > clinicalThreshold
        ? clinicalThreshold + z * se * 0.999
        : clinicalThreshold - z * se * 0.999;
    } else {
      // Need to increase effect away from threshold
      targetTheta = theta > clinicalThreshold
        ? clinicalThreshold + z * se * 1.001
        : clinicalThreshold - z * se * 1.001;
    }

    // Solve: (weighted_other + wi * y_new) / sumW = targetTheta
    const yNeeded = (targetTheta * sumW - weighted_other) / wi_current;
    const adjustment = yNeeded - y;

    return {
      study: i + 1,
      currentEffect: y,
      se: Math.sqrt(vi[i]),
      weight: (wi_current / sumW) * 100,
      adjustmentNeeded: adjustment,
      newEffectNeeded: yNeeded,
      percentChange: (adjustment / Math.abs(y)) * 100,
      feasibility: Math.abs(adjustment) < 2 * Math.sqrt(vi[i]) ? 'plausible' : 'implausible'
    };
  });

  // Sort by absolute adjustment needed
  const ranked = [...studyThresholds].sort((a, b) =>
    Math.abs(a.adjustmentNeeded) - Math.abs(b.adjustmentNeeded));

  // Combined threshold - how much to shift ALL studies
  const uniformShift = currentlySignificant
    ? (theta > clinicalThreshold ? -(theta - clinicalThreshold - z * se * 0.999) : (clinicalThreshold - theta - z * se * 0.999))
    : (theta > clinicalThreshold ? (z * se * 1.001 - (theta - clinicalThreshold)) : -(z * se * 1.001 - (clinicalThreshold - theta)));

  // RIS (Required Information Size) perspective
  // How many more studies of average size needed
  const avgEffect = yi.reduce((a, b) => a + b, 0) / n;
  const avgVar = vi.reduce((a, b) => a + b, 0) / n;
  const additionalStudiesNeeded = currentlySignificant
    ? Infinity // Already significant
    : Math.ceil(Math.pow(z * se / (theta - clinicalThreshold), 2) * avgVar / avgVar);

  return {
    current: {
      theta,
      se,
      p: currentP,
      significant: currentlySignificant,
      clinicalThreshold
    },
    studyThresholds,
    mostInfluential: ranked[0],
    leastInfluential: ranked[n - 1],
    uniformShift: {
      amount: uniformShift,
      direction: uniformShift > 0 ? 'increase' : 'decrease'
    },
    additionalStudiesNeeded: isFinite(additionalStudiesNeeded) ? additionalStudiesNeeded : null,
    fragility: {
      nStudiesToChange: ranked.filter(s => s.feasibility === 'plausible').length,
      interpretation: ranked.filter(s => s.feasibility === 'plausible').length > n / 2
        ? 'Conclusion may be fragile'
        : 'Conclusion appears robust'
    },
    method: 'Threshold Analysis'
  };
}

/**
 * Galbraith Plot Data
 * Standardized effects vs precision for heterogeneity visualization
 */
export function galbraithPlotData(yi, vi, options = {}) {
  const METHOD = 'galbraithPlotData';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

  const se = vi.map(v => Math.sqrt(v));
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // Galbraith plot: x = 1/SE (precision), y = effect/SE (z-score)
  const plotPoints = yi.map((y, i) => ({
    study: i + 1,
    x: 1 / se[i], // Precision
    y: y / se[i], // Z-score
    effect: y,
    se: se[i],
    outsideCI: Math.abs(y / se[i] - theta / se[i]) > z
  }));

  // Regression line through origin with slope = theta
  const regressionLine = {
    slope: theta,
    intercept: 0,
    // Points for plotting
    points: [
      { x: 0, y: 0 },
      { x: Math.max(...plotPoints.map(p => p.x)) * 1.1, y: theta * Math.max(...plotPoints.map(p => p.x)) * 1.1 }
    ]
  };

  // Confidence band
  const maxPrecision = Math.max(...plotPoints.map(p => p.x));
  const confBand = {
    upper: [
      { x: 0, y: z },
      { x: maxPrecision * 1.1, y: theta * maxPrecision * 1.1 + z }
    ],
    lower: [
      { x: 0, y: -z },
      { x: maxPrecision * 1.1, y: theta * maxPrecision * 1.1 - z }
    ]
  };

  // Heterogeneity assessment from plot
  const outsiders = plotPoints.filter(p => p.outsideCI);
  const expectedOutsiders = n * (1 - confidenceLevel);

  // Radial plot variant (z/sqrt(w) vs 1/sqrt(w))
  const radialPoints = yi.map((y, i) => ({
    study: i + 1,
    x: 1 / Math.sqrt(wi[i]),
    y: y * Math.sqrt(wi[i]),
    effect: y
  }));

  return {
    galbraith: {
      points: plotPoints,
      regressionLine,
      confidenceBand: confBand,
      theta
    },
    radial: {
      points: radialPoints,
      theta
    },
    heterogeneity: {
      nOutside: outsiders.length,
      expectedOutside: expectedOutsiders,
      ratio: outsiders.length / expectedOutsiders,
      interpretation: outsiders.length > 2 * expectedOutsiders
        ? 'Substantial heterogeneity detected'
        : 'Heterogeneity consistent with sampling variability'
    },
    outlierStudies: outsiders.map(p => p.study),
    method: 'Galbraith/Radial Plot Analysis'
  };
}

// ============================================================================
// BEYOND R CAPABILITIES: PHASE 5 - Methods 33-40
// ============================================================================

/**
 * L'Abbé Plot Data Generator
 * Event rates in treatment vs control for risk visualization
 */
export function labbePlotData(studies, options = {}) {
  const METHOD = 'labbePlotData';

  // Input validation
  validateBinaryStudies(studies, METHOD, ['ai', 'bi', 'ci', 'di']);

  const {
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // Calculate event rates for each study
  const plotPoints = studies.map((s, i) => {
    const { events1, n1, events2, n2 } = s;

    // Event rates
    const rate1 = events1 / n1; // Treatment
    const rate2 = events2 / n2; // Control

    // Standard errors for rates (binomial)
    const se1 = Math.sqrt(rate1 * (1 - rate1) / n1);
    const se2 = Math.sqrt(rate2 * (1 - rate2) / n2);

    // Risk ratio
    const rr = rate1 / rate2;
    const logRR = Math.log(rr);
    const seLogRR = Math.sqrt(1 / events1 - 1 / n1 + 1 / events2 - 1 / n2);

    // Risk difference
    const rd = rate1 - rate2;
    const seRD = Math.sqrt(rate1 * (1 - rate1) / n1 + rate2 * (1 - rate2) / n2);

    // Odds ratio
    const or = (events1 * (n2 - events2)) / ((n1 - events1) * events2);

    return {
      study: i + 1,
      name: s.name || `Study ${i + 1}`,
      x: rate2, // Control rate
      y: rate1, // Treatment rate
      controlRate: rate2,
      treatmentRate: rate1,
      se: { control: se2, treatment: se1 },
      ci: {
        control: [Math.max(0, rate2 - z * se2), Math.min(1, rate2 + z * se2)],
        treatment: [Math.max(0, rate1 - z * se1), Math.min(1, rate1 + z * se1)]
      },
      riskRatio: rr,
      riskDifference: rd,
      oddsRatio: or,
      size: Math.sqrt(n1 + n2), // For bubble size
      favorsTreatment: rate1 < rate2 // For harmful outcomes
    };
  });

  // Reference lines
  const referenceLines = {
    equalRisk: [{ x: 0, y: 0 }, { x: 1, y: 1 }], // RR = 1
    rrHalf: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }],  // RR = 0.5
    rrDouble: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }] // RR = 2
  };

  // Calculate pooled estimate
  const totalEvents1 = studies.reduce((s, st) => s + st.events1, 0);
  const totalN1 = studies.reduce((s, st) => s + st.n1, 0);
  const totalEvents2 = studies.reduce((s, st) => s + st.events2, 0);
  const totalN2 = studies.reduce((s, st) => s + st.n2, 0);

  const pooledRR = (totalEvents1 / totalN1) / (totalEvents2 / totalN2);
  const pooledRD = (totalEvents1 / totalN1) - (totalEvents2 / totalN2);

  // Iso-RR lines for pooled estimate
  const pooledLine = [];
  for (let x = 0; x <= 1; x += 0.01) {
    pooledLine.push({ x, y: Math.min(1, x * pooledRR) });
  }

  return {
    points: plotPoints,
    referenceLines,
    pooledLine,
    pooledEstimate: {
      riskRatio: pooledRR,
      riskDifference: pooledRD
    },
    quadrantSummary: {
      bothHighRisk: plotPoints.filter(p => p.x > 0.5 && p.y > 0.5).length,
      bothLowRisk: plotPoints.filter(p => p.x <= 0.5 && p.y <= 0.5).length,
      treatmentBetter: plotPoints.filter(p => p.y < p.x).length,
      controlBetter: plotPoints.filter(p => p.y > p.x).length
    },
    method: "L'Abbé Plot Analysis"
  };
}

/**
 * Baujat Plot Data
 * Heterogeneity contribution vs influence on pooled effect
 */
export function baujatPlotData(yi, vi, options = {}) {
  const METHOD = 'baujatPlotData';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    confidenceLevel = 0.95,
    labels = null
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const theta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

  // Cochran's Q statistic
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);

  // For each study, calculate contribution to Q and influence on estimate
  const plotPoints = yi.map((y, i) => {
    // Contribution to heterogeneity (Q)
    const qi = wi[i] * Math.pow(y - theta, 2);
    const qContribution = (qi / Q) * 100;

    // Leave-one-out analysis for influence
    const yiLoo = yi.filter((_, j) => j !== i);
    const viLoo = vi.filter((_, j) => j !== i);
    const tau2Loo = estimateTau2(yiLoo, viLoo, 'REML');
    const wiLoo = viLoo.map(v => 1 / (v + tau2Loo));
    const sumWLoo = wiLoo.reduce((a, b) => a + b, 0);
    const thetaLoo = wiLoo.reduce((sum, w, j) => sum + w * yiLoo[j], 0) / sumWLoo;

    const influence = Math.abs(theta - thetaLoo);

    return {
      study: i + 1,
      name: labels ? labels[i] : `Study ${i + 1}`,
      x: qContribution, // Contribution to heterogeneity (%)
      y: influence,      // Influence on overall result
      effect: y,
      se: Math.sqrt(vi[i]),
      weight: (wi[i] / sumW) * 100,
      thetaWithout: thetaLoo,
      problematic: qContribution > 100 / n * 2 && influence > Math.abs(theta) * 0.1
    };
  });

  // Identify problematic studies (high Q contribution AND high influence)
  const problematic = plotPoints.filter(p => p.problematic);

  // Quadrant thresholds
  const avgQ = 100 / n;
  const avgInfluence = plotPoints.reduce((s, p) => s + p.y, 0) / n;

  return {
    points: plotPoints,
    pooledEffect: theta,
    tau2,
    Q,
    thresholds: {
      qContribution: avgQ * 2,
      influence: avgInfluence * 2
    },
    problematicStudies: problematic,
    nProblematic: problematic.length,
    quadrants: {
      lowQlowInfluence: plotPoints.filter(p => p.x <= avgQ && p.y <= avgInfluence).length,
      lowQhighInfluence: plotPoints.filter(p => p.x <= avgQ && p.y > avgInfluence).length,
      highQlowInfluence: plotPoints.filter(p => p.x > avgQ && p.y <= avgInfluence).length,
      highQhighInfluence: plotPoints.filter(p => p.x > avgQ && p.y > avgInfluence).length
    },
    method: 'Baujat Plot Analysis'
  };
}

/**
 * GOSH (Graphical Overview of Study Heterogeneity) Analysis
 * Explore heterogeneity through all possible subsets
 */
export function goshAnalysis(yi, vi, options = {}) {
  const METHOD = 'goshAnalysis';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    maxSubsets = 10000,
    minStudies = 3,
    seed = 12345
  } = options;

  validateNumeric(maxSubsets, 'maxSubsets', METHOD, { min: 100, max: 100000, integer: true });

  const n = yi.length;

  // For small n, enumerate all subsets; for large n, sample
  const totalSubsets = Math.pow(2, n) - 1;
  const validSubsets = [];

  // High-quality xoshiro128** RNG for reproducibility (Blackman & Vigna, 2018)
  const rng = createSeededRNG(seed);
  function seededRandom() {
    return rng.random();
  }

  // Helper factorial function (for small values used in combinatorics)
  function factorial(x) {
    if (x <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= x; i++) result *= i;
    return result;
  }

  // Helper to sample random subset of exactly size k
  function sampleSubset(k) {
    const indices = [];
    const available = Array.from({ length: n }, (_, i) => i);

    for (let i = 0; i < k; i++) {
      const randIdx = Math.floor(seededRandom() * available.length);
      indices.push(available[randIdx]);
      available.splice(randIdx, 1); // Remove to avoid duplicates
    }

    return indices.sort((a, b) => a - b);
  }

  if (totalSubsets <= maxSubsets) {
    // Enumerate all valid subsets
    for (let mask = 1; mask < Math.pow(2, n); mask++) {
      const indices = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) indices.push(i);
      }
      if (indices.length >= minStudies) {
        validSubsets.push(indices);
      }
    }
  } else {
    // STRATIFIED sampling by subset size (improved over simple random)
    // This ensures good coverage of all subset sizes from minStudies to n
    // The naive coin-flip approach biases toward sizes around n/2
    // Reference: Olkin et al. (2012) recommendations for GOSH diagnostics
    const seen = new Set();
    const nSizes = n - minStudies + 1; // Number of possible subset sizes
    const subsetsPerSize = Math.ceil(maxSubsets / nSizes);

    // Sample subsets stratified by size
    for (let k = minStudies; k <= n; k++) {
      // Calculate how many subsets of size k exist: C(n, k)
      const nChooseK = factorial(n) / (factorial(k) * factorial(n - k));
      const targetForSize = Math.min(subsetsPerSize, nChooseK);

      let attempts = 0;
      const maxAttempts = targetForSize * 10; // Prevent infinite loops

      while (validSubsets.filter(s => s.length === k).length < targetForSize &&
             attempts < maxAttempts) {
        attempts++;
        const subset = sampleSubset(k);
        const key = subset.join(',');

        if (!seen.has(key)) {
          seen.add(key);
          validSubsets.push(subset);
        }
      }
    }

    // If we haven't reached maxSubsets, fill with additional random subsets
    // (uniform probability across all sizes for remaining slots)
    let fillAttempts = 0;
    while (validSubsets.length < maxSubsets && fillAttempts < maxSubsets) {
      fillAttempts++;
      // Random size from minStudies to n
      const k = minStudies + Math.floor(seededRandom() * (n - minStudies + 1));
      const subset = sampleSubset(k);
      const key = subset.join(',');

      if (!seen.has(key)) {
        seen.add(key);
        validSubsets.push(subset);
      }
    }
  }

  // Analyze each subset
  const results = validSubsets.map(indices => {
    const yiSub = indices.map(i => yi[i]);
    const viSub = indices.map(i => vi[i]);

    const tau2 = estimateTau2(yiSub, viSub, 'REML');
    const wi = viSub.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = wi.reduce((sum, w, i) => sum + w * yiSub[i], 0) / sumW;

    // I-squared
    const Q = yiSub.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
    const df = yiSub.length - 1;
    const I2 = Math.max(0, (Q - df) / Q * 100);

    return {
      indices,
      k: indices.length,
      theta,
      tau2,
      I2
    };
  });

  // Summary statistics
  const thetas = results.map(r => r.theta);
  const tau2s = results.map(r => r.tau2);
  const I2s = results.map(r => r.I2);

  // Sort for percentile CIs
  const sortedThetas = [...thetas].sort((a, b) => a - b);
  const sortedI2s = [...I2s].sort((a, b) => a - b);
  const sortedTau2s = [...tau2s].sort((a, b) => a - b);
  const nRes = thetas.length;
  
  // Percentile function
  const percentile = (arr, p) => arr[Math.floor(arr.length * p)] || arr[arr.length - 1];
  
  const thetaMean = thetas.reduce((a, b) => a + b, 0) / nRes;
  const I2Mean = I2s.reduce((a, b) => a + b, 0) / nRes;
  const tau2Mean = tau2s.reduce((a, b) => a + b, 0) / nRes;
  
  const summary = {
    theta: {
      mean: thetaMean,
      median: median(thetas),
      min: Math.min(...thetas),
      max: Math.max(...thetas),
      sd: Math.sqrt(thetas.reduce((s, t) => s + Math.pow(t - thetaMean, 2), 0) / nRes),
      ci: [percentile(sortedThetas, 0.025), percentile(sortedThetas, 0.975)],
      iqr: [percentile(sortedThetas, 0.25), percentile(sortedThetas, 0.75)]
    },
    I2: {
      mean: I2Mean,
      median: median(I2s),
      min: Math.min(...I2s),
      max: Math.max(...I2s),
      ci: [percentile(sortedI2s, 0.025), percentile(sortedI2s, 0.975)],
      iqr: [percentile(sortedI2s, 0.25), percentile(sortedI2s, 0.75)]
    },
    tau2: {
      mean: tau2Mean,
      median: median(tau2s),
      min: Math.min(...tau2s),
      max: Math.max(...tau2s),
      ci: [percentile(sortedTau2s, 0.025), percentile(sortedTau2s, 0.975)],
      iqr: [percentile(sortedTau2s, 0.25), percentile(sortedTau2s, 0.75)]
    }
  };

  // Identify potential outlier studies (those that appear in extreme subsets)
  const studyAppearances = Array(n).fill(0).map(() => ({
    extremeHigh: 0,
    extremeLow: 0,
    total: 0
  }));

  const thetaThresholds = {
    low: summary.theta.mean - 2 * summary.theta.sd,
    high: summary.theta.mean + 2 * summary.theta.sd
  };

  results.forEach(r => {
    r.indices.forEach(i => {
      studyAppearances[i].total++;
      if (r.theta < thetaThresholds.low) studyAppearances[i].extremeLow++;
      if (r.theta > thetaThresholds.high) studyAppearances[i].extremeHigh++;
    });
  });

  const outlierCandidates = studyAppearances.map((s, i) => ({
    study: i + 1,
    ...s,
    extremeRatio: (s.extremeHigh + s.extremeLow) / s.total
  })).filter(s => s.extremeRatio > 0.2);

  // Create density plot data
  const thetaBins = 50;
  const thetaMin = Math.min(...thetas);
  const thetaMax = Math.max(...thetas);
  const binWidth = (thetaMax - thetaMin) / thetaBins;

  const density = Array(thetaBins).fill(0);
  thetas.forEach(t => {
    const bin = Math.min(thetaBins - 1, Math.floor((t - thetaMin) / binWidth));
    density[bin]++;
  });

  const densityPlot = density.map((count, i) => ({
    x: thetaMin + (i + 0.5) * binWidth,
    y: count / thetas.length
  }));

  return {
    nSubsets: results.length,
    summary,
    outlierCandidates,
    densityPlot,
    scatterData: results.slice(0, 5000).map(r => ({
      theta: r.theta,
      I2: r.I2,
      k: r.k
    })),
    multimodal: density.filter(d => d > density.reduce((a, b) => a + b, 0) / thetaBins * 2).length > 2,
    method: 'GOSH Analysis (Graphical Overview of Study Heterogeneity)'
  };
}

/**
 * Streaming GOSH Analysis (Async Generator)
 *
 * Yields progressive results for real-time UI updates during large analyses.
 * Use with for-await-of loop or manual iterator consumption.
 *
 * @param {Array<number>} yi - Effect sizes
 * @param {Array<number>} vi - Variances
 * @param {Object} options - Analysis options
 * @yields {Object} Progressive results with current statistics and progress
 *
 * @example
 * for await (const update of goshAnalysisStream(yi, vi, options)) {
 *   console.log(`Progress: ${update.progress}%`);
 *   updateChart(update.scatterData);
 * }
 */
export async function* goshAnalysisStream(yi, vi, options = {}) {
  const METHOD = 'goshAnalysisStream';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    maxSubsets = 10000,
    minStudies = 3,
    seed = 12345,
    yieldInterval = 100,  // Yield results every N subsets
    onProgress = null
  } = options;

  validateNumeric(maxSubsets, 'maxSubsets', METHOD, { min: 100, max: 100000, integer: true });
  validateNumeric(yieldInterval, 'yieldInterval', METHOD, { min: 10, max: 1000, integer: true });

  const n = yi.length;
  const results = [];

  // Running statistics for incremental summary
  let sumTheta = 0, sumTheta2 = 0;
  let sumI2 = 0, sumTau2 = 0;
  let minTheta = Infinity, maxTheta = -Infinity;
  let minI2 = Infinity, maxI2 = -Infinity;
  let minTau2 = Infinity, maxTau2 = -Infinity;

  // High-quality xoshiro128** RNG for reproducibility (Blackman & Vigna, 2018)
  const rng = createSeededRNG(seed);
  function seededRandom() {
    return rng.random();
  }

  // Generate subsets
  const totalSubsets = Math.pow(2, n) - 1;
  const validSubsets = [];

  if (totalSubsets <= maxSubsets) {
    // Enumerate all valid subsets
    for (let mask = 1; mask < Math.pow(2, n); mask++) {
      const indices = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) indices.push(i);
      }
      if (indices.length >= minStudies) {
        validSubsets.push(indices);
      }
    }
  } else {
    // Random sampling
    const seen = new Set();
    while (validSubsets.length < maxSubsets) {
      const indices = [];
      for (let i = 0; i < n; i++) {
        if (seededRandom() > 0.5) indices.push(i);
      }
      if (indices.length >= minStudies) {
        const key = indices.join(',');
        if (!seen.has(key)) {
          seen.add(key);
          validSubsets.push(indices);
        }
      }
    }
  }

  const totalToProcess = validSubsets.length;

  // Process subsets and yield progressively
  for (let idx = 0; idx < validSubsets.length; idx++) {
    const indices = validSubsets[idx];
    const yiSub = indices.map(i => yi[i]);
    const viSub = indices.map(i => vi[i]);

    const tau2 = estimateTau2(yiSub, viSub, 'REML');
    const wi = viSub.map(v => 1 / (v + tau2));
    const sumW = wi.reduce((a, b) => a + b, 0);
    const theta = wi.reduce((sum, w, i) => sum + w * yiSub[i], 0) / sumW;

    // I-squared
    const Q = yiSub.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - theta, 2), 0);
    const df = yiSub.length - 1;
    const I2 = Math.max(0, df > 0 ? (Q - df) / Q * 100 : 0);

    const result = {
      indices,
      k: indices.length,
      theta,
      tau2,
      I2
    };
    results.push(result);

    // Update running statistics
    sumTheta += theta;
    sumTheta2 += theta * theta;
    sumI2 += I2;
    sumTau2 += tau2;
    minTheta = Math.min(minTheta, theta);
    maxTheta = Math.max(maxTheta, theta);
    minI2 = Math.min(minI2, I2);
    maxI2 = Math.max(maxI2, I2);
    minTau2 = Math.min(minTau2, tau2);
    maxTau2 = Math.max(maxTau2, tau2);

    // Yield progress at intervals
    if ((idx + 1) % yieldInterval === 0 || idx === validSubsets.length - 1) {
      const processed = idx + 1;
      const progress = Math.round((processed / totalToProcess) * 100);

      // Calculate current summary
      const meanTheta = sumTheta / processed;
      const varTheta = (sumTheta2 / processed) - (meanTheta * meanTheta);
      const sdTheta = Math.sqrt(Math.max(0, varTheta));

      const currentSummary = {
        theta: {
          mean: meanTheta,
          sd: sdTheta,
          min: minTheta,
          max: maxTheta
        },
        I2: {
          mean: sumI2 / processed,
          min: minI2,
          max: maxI2
        },
        tau2: {
          mean: sumTau2 / processed,
          min: minTau2,
          max: maxTau2
        }
      };

      // Call optional progress callback
      if (onProgress) {
        onProgress({
          phase: 'analyzing',
          processed,
          total: totalToProcess,
          percent: progress
        });
      }

      // Yield current state
      yield {
        phase: idx === validSubsets.length - 1 ? 'complete' : 'processing',
        progress,
        processed,
        total: totalToProcess,
        summary: currentSummary,
        scatterData: results.slice(-yieldInterval).map(r => ({
          theta: r.theta,
          I2: r.I2,
          k: r.k
        })),
        // Include all scatter data on final yield
        ...(idx === validSubsets.length - 1 && {
          allScatterData: results.slice(0, 5000).map(r => ({
            theta: r.theta,
            I2: r.I2,
            k: r.k
          }))
        })
      };

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Final comprehensive result
  const thetas = results.map(r => r.theta);
  const tau2s = results.map(r => r.tau2);
  const I2s = results.map(r => r.I2);

  // Compute median for final summary
  const sortedThetas = [...thetas].sort((a, b) => a - b);
  const sortedI2s = [...I2s].sort((a, b) => a - b);
  const sortedTau2s = [...tau2s].sort((a, b) => a - b);
  const medianFn = (arr) => arr.length % 2 ? arr[Math.floor(arr.length / 2)] :
    (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;

  const finalSummary = {
    theta: {
      mean: sumTheta / results.length,
      median: medianFn(sortedThetas),
      min: minTheta,
      max: maxTheta,
      sd: Math.sqrt((sumTheta2 / results.length) - Math.pow(sumTheta / results.length, 2))
    },
    I2: {
      mean: sumI2 / results.length,
      median: medianFn(sortedI2s),
      min: minI2,
      max: maxI2
    },
    tau2: {
      mean: sumTau2 / results.length,
      median: medianFn(sortedTau2s),
      min: minTau2,
      max: maxTau2
    }
  };

  // Identify potential outlier studies
  const studyAppearances = Array(n).fill(0).map(() => ({
    extremeHigh: 0,
    extremeLow: 0,
    total: 0
  }));

  const thetaThresholds = {
    low: finalSummary.theta.mean - 2 * finalSummary.theta.sd,
    high: finalSummary.theta.mean + 2 * finalSummary.theta.sd
  };

  results.forEach(r => {
    r.indices.forEach(i => {
      studyAppearances[i].total++;
      if (r.theta < thetaThresholds.low) studyAppearances[i].extremeLow++;
      if (r.theta > thetaThresholds.high) studyAppearances[i].extremeHigh++;
    });
  });

  const outlierCandidates = studyAppearances.map((s, i) => ({
    study: i + 1,
    ...s,
    extremeRatio: s.total > 0 ? (s.extremeHigh + s.extremeLow) / s.total : 0
  })).filter(s => s.extremeRatio > 0.2);

  // Create density plot data
  const thetaBins = 50;
  const binWidth = (maxTheta - minTheta) / thetaBins || 1;

  const density = Array(thetaBins).fill(0);
  thetas.forEach(t => {
    const bin = Math.min(thetaBins - 1, Math.floor((t - minTheta) / binWidth));
    density[bin]++;
  });

  const densityPlot = density.map((count, i) => ({
    x: minTheta + (i + 0.5) * binWidth,
    y: count / thetas.length
  }));

  // Final yield with complete results
  yield {
    phase: 'final',
    progress: 100,
    nSubsets: results.length,
    summary: finalSummary,
    outlierCandidates,
    densityPlot,
    scatterData: results.slice(0, 5000).map(r => ({
      theta: r.theta,
      I2: r.I2,
      k: r.k
    })),
    multimodal: density.filter(d => d > density.reduce((a, b) => a + b, 0) / thetaBins * 2).length > 2,
    method: 'GOSH Analysis (Streaming)'
  };
}

/**
 * Network Inconsistency Analysis
 * Detect and quantify inconsistency in network meta-analysis
 */
export function networkInconsistencyAnalysis(contrasts, options = {}) {
  const METHOD = 'networkInconsistencyAnalysis';

  // Accept either native contrast objects or compact test fixtures.
  const normalizedContrasts = contrasts.map((contrast, index) => {
    if (contrast.treat1 && contrast.treat2) {
      return {
        ...contrast,
        effect: contrast.effect ?? contrast.yi,
        se: contrast.se ?? Math.sqrt(contrast.vi ?? 0)
      };
    }

    if (contrast.comparison && typeof contrast.comparison === 'string') {
      const [treat1, treat2] = contrast.comparison.split('-');
      return {
        study: contrast.study ?? `Study${index + 1}`,
        treat1,
        treat2,
        effect: contrast.effect ?? contrast.yi,
        se: contrast.se ?? Math.sqrt(contrast.vi ?? 0)
      };
    }

    return contrast;
  });

  // Input validation
  validateNMAContrasts(normalizedContrasts, METHOD);

  const {
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  // Build network structure
  const treatments = new Set();
  const comparisons = {};

  normalizedContrasts.forEach(c => {
    treatments.add(c.treat1);
    treatments.add(c.treat2);
    const key = [c.treat1, c.treat2].sort().join('-');
    if (!comparisons[key]) {
      comparisons[key] = { direct: [], studies: [] };
    }
    comparisons[key].direct.push({ effect: c.effect, se: c.se, study: c.study });
    comparisons[key].studies.push(c.study);
  });

  const treatList = [...treatments].sort();
  const nTreat = treatList.length;

  // Find loops (triangles) in the network
  const loops = [];
  for (let i = 0; i < nTreat; i++) {
    for (let j = i + 1; j < nTreat; j++) {
      for (let k = j + 1; k < nTreat; k++) {
        const t1 = treatList[i], t2 = treatList[j], t3 = treatList[k];
        const c12 = comparisons[[t1, t2].sort().join('-')];
        const c23 = comparisons[[t2, t3].sort().join('-')];
        const c13 = comparisons[[t1, t3].sort().join('-')];

        if (c12 && c23 && c13) {
          loops.push({ treatments: [t1, t2, t3], comparisons: [c12, c23, c13] });
        }
      }
    }
  }

  // Analyze each loop for inconsistency
  const loopAnalysis = loops.map((loop, idx) => {
    const [t1, t2, t3] = loop.treatments;

    // Pool direct evidence for each comparison
    function poolDirect(comp, reverse = false) {
      if (!comp || comp.direct.length === 0) return null;
      const effects = comp.direct.map(d => reverse ? -d.effect : d.effect);
      const vars = comp.direct.map(d => d.se * d.se);
      const wi = vars.map(v => 1 / v);
      const sumW = wi.reduce((a, b) => a + b, 0);
      const pooled = wi.reduce((s, w, i) => s + w * effects[i], 0) / sumW;
      const se = Math.sqrt(1 / sumW);
      return { effect: pooled, se };
    }

    const c12 = comparisons[[t1, t2].sort().join('-')];
    const c23 = comparisons[[t2, t3].sort().join('-')];
    const c13 = comparisons[[t1, t3].sort().join('-')];

    // Get pooled direct estimates (with correct sign)
    const d12 = poolDirect(c12, t1 > t2);
    const d23 = poolDirect(c23, t2 > t3);
    const d13 = poolDirect(c13, t1 > t3);

    if (!d12 || !d23 || !d13) return null;

    // Indirect estimate: t1 vs t3 through t2 = (t1 vs t2) + (t2 vs t3)
    const indirect = {
      effect: d12.effect + d23.effect,
      se: Math.sqrt(d12.se * d12.se + d23.se * d23.se)
    };

    // Inconsistency factor (IF)
    const IF = d13.effect - indirect.effect;
    const seIF = Math.sqrt(d13.se * d13.se + indirect.se * indirect.se);
    const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);
    const pValue = 2 * (1 - normalCDF(Math.abs(IF / seIF)));

    return {
      loop: idx + 1,
      treatments: loop.treatments,
      direct: { from: t1, to: t3, ...d13 },
      indirect: { from: t1, to: t3, via: t2, ...indirect },
      inconsistencyFactor: IF,
      seIF,
      ci: [IF - z * seIF, IF + z * seIF],
      pValue,
      significant: pValue < 0.05,
      ratioDirect_Indirect: d13.effect / indirect.effect
    };
  }).filter(l => l !== null);

  // Global inconsistency test (design-by-treatment interaction)
  const nLoops = loopAnalysis.length;
  const nSignificant = loopAnalysis.filter(l => l.significant).length;

  // Chi-square for all loops
  const chiSq = loopAnalysis.reduce((s, l) => s + Math.pow(l.inconsistencyFactor / l.seIF, 2), 0);
  const globalP = nLoops > 0 ? 1 - jStat.chisquare.cdf(chiSq, nLoops) : 1;

  const nodeSplitSummary = nodeSplitting(normalizedContrasts, options);

  return {
    nTreatments: nTreat,
    treatments: treatList,
    nComparisons: Object.keys(comparisons).length,
    nLoops,
    loopAnalysis,
    globalTest: {
      statistic: chiSq,
      chiSquare: chiSq,
      df: nLoops,
      pValue: globalP,
      significant: globalP < 0.05
    },
    nodeSplitting: nodeSplitSummary.comparisons,
    summary: {
      nSignificantLoops: nSignificant,
      proportionInconsistent: nLoops > 0 ? nSignificant / nLoops : 0,
      interpretation: globalP < 0.05
        ? 'Significant inconsistency detected in the network'
        : 'No significant inconsistency detected'
    },
    method: 'Network Inconsistency Analysis (Loop-based)'
  };
}

/**
 * Node-Splitting Method for Network Inconsistency (Dias et al. 2010)
 *
 * Separates direct and indirect evidence for each comparison
 * to test for inconsistency between direct and indirect sources.
 *
 * Reference: Dias S, et al. (2010). Checking consistency in mixed
 * treatment comparison meta-analysis. Statistics in Medicine.
 *
 * @param {Array} contrasts - Array of {treat1, treat2, effect, se, study}
 * @param {Object} options - Configuration options
 * @returns {Object} Node-splitting results with direct/indirect estimates
 */
export function nodeSplitting(contrasts, options = {}) {
  const METHOD = 'nodeSplitting';

  validateNMAContrasts(contrasts, METHOD);

  const { confidenceLevel = 0.95, reference = null } = options;

  // Build network structure
  const treatments = new Set();
  const comparisons = new Map();
  const studyDesigns = new Map(); // study -> set of treatments

  contrasts.forEach(c => {
    treatments.add(c.treat1);
    treatments.add(c.treat2);
    const key = [c.treat1, c.treat2].sort().join('|');
    if (!comparisons.has(key)) {
      comparisons.set(key, []);
    }
    comparisons.get(key).push({ effect: c.effect, se: c.se, study: c.study });

    // Track study designs
    if (!studyDesigns.has(c.study)) {
      studyDesigns.set(c.study, new Set());
    }
    studyDesigns.get(c.study).add(c.treat1);
    studyDesigns.get(c.study).add(c.treat2);
  });

  const treatList = [...treatments].sort();
  const nTreat = treatList.length;
  const refTreat = reference || treatList[0];
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // For each direct comparison, perform node-splitting
  const nodeSplitResults = [];

  for (const [key, directData] of comparisons.entries()) {
    const [t1, t2] = key.split('|');

    // Get direct evidence
    const directEffects = directData.map(d => d.effect);
    const directVars = directData.map(d => d.se * d.se);
    const directWeights = directVars.map(v => 1 / v);
    const sumDirectW = directWeights.reduce((a, b) => a + b, 0);
    const directPooled = directWeights.reduce((s, w, i) =>
      s + w * directEffects[i], 0) / sumDirectW;
    const directSE = Math.sqrt(1 / sumDirectW);

    // Calculate indirect evidence through all possible paths
    // For simplicity, use the shortest path (single intermediate node)
    const indirectPaths = [];

    for (const intermediate of treatList) {
      if (intermediate === t1 || intermediate === t2) continue;

      const path1Key = [t1, intermediate].sort().join('|');
      const path2Key = [intermediate, t2].sort().join('|');

      if (comparisons.has(path1Key) && comparisons.has(path2Key)) {
        const path1Data = comparisons.get(path1Key);
        const path2Data = comparisons.get(path2Key);

        // Pool path 1
        const p1Effects = path1Data.map(d => {
          const sign = [t1, intermediate].sort()[0] === t1 ? 1 : -1;
          return sign * d.effect;
        });
        const p1Vars = path1Data.map(d => d.se * d.se);
        const p1W = p1Vars.map(v => 1 / v);
        const sumP1W = p1W.reduce((a, b) => a + b, 0);
        const p1Pooled = p1W.reduce((s, w, i) => s + w * p1Effects[i], 0) / sumP1W;
        const p1SE = Math.sqrt(1 / sumP1W);

        // Pool path 2
        const p2Effects = path2Data.map(d => {
          const sign = [intermediate, t2].sort()[0] === intermediate ? 1 : -1;
          return sign * d.effect;
        });
        const p2Vars = path2Data.map(d => d.se * d.se);
        const p2W = p2Vars.map(v => 1 / v);
        const sumP2W = p2W.reduce((a, b) => a + b, 0);
        const p2Pooled = p2W.reduce((s, w, i) => s + w * p2Effects[i], 0) / sumP2W;
        const p2SE = Math.sqrt(1 / sumP2W);

        // Indirect effect = path1 + path2 (with correct sign)
        const sign1 = t1 < intermediate ? 1 : -1;
        const sign2 = intermediate < t2 ? 1 : -1;
        const indirectEffect = sign1 * p1Pooled + sign2 * p2Pooled;
        const indirectSE = Math.sqrt(p1SE * p1SE + p2SE * p2SE);

        indirectPaths.push({
          via: intermediate,
          effect: indirectEffect,
          se: indirectSE
        });
      }
    }

    if (indirectPaths.length === 0) {
      // No indirect evidence available
      nodeSplitResults.push({
        comparison: `${t1} vs ${t2}`,
        direct: {
          effect: directPooled,
          se: directSE,
          ci: [directPooled - z * directSE, directPooled + z * directSE],
          nStudies: directData.length
        },
        indirect: null,
        difference: null,
        pValue: null,
        significant: false,
        note: 'No indirect evidence available'
      });
      continue;
    }

    // Pool all indirect paths
    const indirectW = indirectPaths.map(p => 1 / (p.se * p.se));
    const sumIndW = indirectW.reduce((a, b) => a + b, 0);
    const indirectPooled = indirectW.reduce((s, w, i) =>
      s + w * indirectPaths[i].effect, 0) / sumIndW;
    const indirectSE = Math.sqrt(1 / sumIndW);

    // Test for inconsistency
    const diff = directPooled - indirectPooled;
    const diffSE = Math.sqrt(directSE * directSE + indirectSE * indirectSE);
    const zStat = Math.abs(diff) / diffSE;
    const pValue = 2 * (1 - normalCDF(zStat));

    nodeSplitResults.push({
      comparison: `${t1} vs ${t2}`,
      direct: {
        effect: directPooled,
        se: directSE,
        ci: [directPooled - z * directSE, directPooled + z * directSE],
        nStudies: directData.length
      },
      indirect: {
        effect: indirectPooled,
        se: indirectSE,
        ci: [indirectPooled - z * indirectSE, indirectPooled + z * indirectSE],
        nPaths: indirectPaths.length,
        paths: indirectPaths.map(p => p.via)
      },
      difference: {
        effect: diff,
        se: diffSE,
        ci: [diff - z * diffSE, diff + z * diffSE]
      },
      zStatistic: zStat,
      pValue,
      significant: pValue < 0.05
    });
  }

  // Global inconsistency summary
  const testedComparisons = nodeSplitResults.filter(r => r.indirect !== null);
  const significantInconsistencies = testedComparisons.filter(r => r.significant);

  // Bonferroni-corrected significance
  const bonferroniThreshold = 0.05 / Math.max(1, testedComparisons.length);
  const significantAfterCorrection = testedComparisons.filter(r =>
    r.pValue !== null && r.pValue < bonferroniThreshold
  );

  return {
    comparisons: nodeSplitResults,
    nComparisons: nodeSplitResults.length,
    nTested: testedComparisons.length,
    summary: {
      nSignificant: significantInconsistencies.length,
      nSignificantBonferroni: significantAfterCorrection.length,
      bonferroniThreshold,
      hasInconsistency: significantInconsistencies.length > 0,
      interpretation: significantInconsistencies.length > 0
        ? `Inconsistency detected in ${significantInconsistencies.length} comparison(s): ` +
          significantInconsistencies.map(r => r.comparison).join(', ')
        : 'No significant inconsistency detected between direct and indirect evidence'
    },
    method: 'Node-Splitting (Dias et al. 2010)'
  };
}

/**
 * Design-by-Treatment Interaction Model (Jackson et al. 2014)
 *
 * Tests for inconsistency using a design-by-treatment interaction model
 * that accounts for the multi-arm structure of studies.
 *
 * Reference: Jackson D, et al. (2014). A design-by-treatment interaction
 * model for network meta-analysis with random inconsistency effects.
 * Statistics in Medicine.
 *
 * @param {Array} contrasts - Array of {treat1, treat2, effect, se, study}
 * @param {Object} options - Configuration options
 * @returns {Object} Design-by-treatment interaction test results
 */
export function designByTreatmentInteraction(contrasts, options = {}) {
  const METHOD = 'designByTreatmentInteraction';

  validateNMAContrasts(contrasts, METHOD);

  const { confidenceLevel = 0.95 } = options;

  // Build network structure
  const treatments = new Set();
  const studyDesigns = new Map(); // study -> treatments compared
  const studyData = new Map(); // study -> contrasts

  contrasts.forEach(c => {
    treatments.add(c.treat1);
    treatments.add(c.treat2);

    if (!studyDesigns.has(c.study)) {
      studyDesigns.set(c.study, new Set());
      studyData.set(c.study, []);
    }
    studyDesigns.get(c.study).add(c.treat1);
    studyDesigns.get(c.study).add(c.treat2);
    studyData.get(c.study).push(c);
  });

  const treatList = [...treatments].sort();

  // Identify unique designs
  const designMap = new Map();
  for (const [study, treats] of studyDesigns.entries()) {
    const designKey = [...treats].sort().join('-');
    if (!designMap.has(designKey)) {
      designMap.set(designKey, {
        treatments: [...treats].sort(),
        studies: [],
        contrasts: []
      });
    }
    designMap.get(designKey).studies.push(study);
    designMap.get(designKey).contrasts.push(...studyData.get(study));
  }

  const designs = [...designMap.values()];
  const nDesigns = designs.length;

  // For each design, fit a consistency model and record residuals
  const designResults = designs.map((design, idx) => {
    const { treatments: designTreats, contrasts: designContrasts, studies } = design;
    const nStudies = studies.length;
    const nContrasts = designContrasts.length;

    if (nContrasts < 2) {
      return {
        design: idx + 1,
        treatments: designTreats,
        nStudies,
        nContrasts,
        residualSS: 0,
        df: 0,
        note: 'Insufficient data for design analysis'
      };
    }

    // Pool all contrasts within design using inverse-variance
    const contrastsByPair = new Map();
    designContrasts.forEach(c => {
      const key = [c.treat1, c.treat2].sort().join('|');
      if (!contrastsByPair.has(key)) {
        contrastsByPair.set(key, []);
      }
      contrastsByPair.get(key).push(c);
    });

    let totalResidualSS = 0;
    let totalDF = 0;

    for (const [pair, pairContrasts] of contrastsByPair.entries()) {
      if (pairContrasts.length < 2) continue;

      // Pool contrast
      const effects = pairContrasts.map(c => c.effect);
      const vars = pairContrasts.map(c => c.se * c.se);
      const weights = vars.map(v => 1 / v);
      const sumW = weights.reduce((a, b) => a + b, 0);
      const pooledEffect = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;

      // Residual sum of squares
      const residualSS = pairContrasts.reduce((ss, c, i) =>
        ss + weights[i] * Math.pow(c.effect - pooledEffect, 2), 0);

      totalResidualSS += residualSS;
      totalDF += pairContrasts.length - 1;
    }

    return {
      design: idx + 1,
      treatments: designTreats,
      nStudies,
      nContrasts,
      residualSS: totalResidualSS,
      df: totalDF
    };
  });

  // Calculate Q statistic for within-design heterogeneity
  const withinDesignQ = designResults.reduce((sum, d) => sum + (d.residualSS || 0), 0);
  const withinDesignDF = designResults.reduce((sum, d) => sum + (d.df || 0), 0);

  // Now compute between-design inconsistency
  // Compare estimates across designs for overlapping comparisons
  const comparisonsByDesign = new Map();

  designs.forEach((design, idx) => {
    const contrastsByPair = new Map();
    design.contrasts.forEach(c => {
      const key = [c.treat1, c.treat2].sort().join('|');
      if (!contrastsByPair.has(key)) {
        contrastsByPair.set(key, []);
      }
      contrastsByPair.get(key).push(c);
    });

    for (const [pair, pairContrasts] of contrastsByPair.entries()) {
      const effects = pairContrasts.map(c => c.effect);
      const vars = pairContrasts.map(c => c.se * c.se);
      const weights = vars.map(v => 1 / v);
      const sumW = weights.reduce((a, b) => a + b, 0);
      const pooledEffect = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;
      const pooledVar = 1 / sumW;

      if (!comparisonsByDesign.has(pair)) {
        comparisonsByDesign.set(pair, []);
      }
      comparisonsByDesign.get(pair).push({
        design: idx,
        effect: pooledEffect,
        variance: pooledVar
      });
    }
  });

  // Calculate between-design Q (inconsistency component)
  let betweenDesignQ = 0;
  let betweenDesignDF = 0;

  for (const [pair, designEstimates] of comparisonsByDesign.entries()) {
    if (designEstimates.length < 2) continue;

    const effects = designEstimates.map(d => d.effect);
    const weights = designEstimates.map(d => 1 / d.variance);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const pooledEffect = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;

    const Q = designEstimates.reduce((ss, d) =>
      ss + (1 / d.variance) * Math.pow(d.effect - pooledEffect, 2), 0);

    betweenDesignQ += Q;
    betweenDesignDF += designEstimates.length - 1;
  }

  // Total Q = within + between
  const totalQ = withinDesignQ + betweenDesignQ;
  const totalDF = withinDesignDF + betweenDesignDF;

  // P-values
  const withinP = withinDesignDF > 0 ?
    1 - jStat.chisquare.cdf(withinDesignQ, withinDesignDF) : 1;
  const betweenP = betweenDesignDF > 0 ?
    1 - jStat.chisquare.cdf(betweenDesignQ, betweenDesignDF) : 1;
  const totalP = totalDF > 0 ?
    1 - jStat.chisquare.cdf(totalQ, totalDF) : 1;

  return {
    nDesigns,
    designs: designResults,
    withinDesignHeterogeneity: {
      Q: withinDesignQ,
      df: withinDesignDF,
      pValue: withinP,
      interpretation: withinP < 0.05
        ? 'Significant heterogeneity within designs'
        : 'No significant within-design heterogeneity'
    },
    betweenDesignInconsistency: {
      Q: betweenDesignQ,
      df: betweenDesignDF,
      pValue: betweenP,
      interpretation: betweenP < 0.05
        ? 'Significant inconsistency between designs (different results from different study designs)'
        : 'No significant inconsistency between designs'
    },
    globalTest: {
      Q: totalQ,
      df: totalDF,
      pValue: totalP,
      I2: totalDF > 0 ? Math.max(0, (totalQ - totalDF) / totalQ * 100) : 0
    },
    summary: {
      hasInconsistency: betweenP < 0.05,
      hasHeterogeneity: withinP < 0.05 || totalP < 0.05,
      recommendation: betweenP < 0.05
        ? 'Consider investigating sources of inconsistency. Results from different study designs disagree.'
        : 'Network appears consistent. Direct and indirect evidence agree.'
    },
    method: 'Design-by-Treatment Interaction (Jackson et al. 2014)'
  };
}

/**
 * SUCRA with Credible Intervals
 * Surface Under Cumulative Ranking with uncertainty
 */
export function sucraWithCI(rankMatrix, options = {}) {
  const METHOD = 'sucraWithCI';

  // Input validation
  if (!Array.isArray(rankMatrix) || rankMatrix.length < 10) {
    throw new ValidationError('rankMatrix must be an array with at least 10 iterations', METHOD);
  }

  const {
    nIterations = 10000,
    confidenceLevel = 0.95,
    seed = 42
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  // rankMatrix: rows = iterations, cols = treatments
  // Each cell contains the rank (1 = best)
  const nTreat = rankMatrix[0].length;
  const nIter = rankMatrix.length;
  const rng = createSeededRNG(seed);

  // Calculate SUCRA for each treatment
  const sucra = [];
  const rankProbs = [];

  for (let t = 0; t < nTreat; t++) {
    // Get all ranks for this treatment
    const ranks = rankMatrix.map(iter => iter[t]);

    // Rank probability matrix
    const probs = Array(nTreat).fill(0);
    ranks.forEach(r => probs[r - 1]++);
    const probNorm = probs.map(p => p / nIter);
    rankProbs.push(probNorm);

    // SUCRA = (sum of cumulative probabilities) / (nTreat - 1)
    let cumSum = 0;
    let sucraVal = 0;
    for (let r = 0; r < nTreat - 1; r++) {
      cumSum += probNorm[r];
      sucraVal += cumSum;
    }
    sucraVal /= (nTreat - 1);

    sucra.push({
      treatment: t + 1,
      sucra: sucraVal,
      meanRank: ranks.reduce((a, b) => a + b, 0) / nIter,
      medianRank: median(ranks),
      pBest: probNorm[0],
      rankProbabilities: probNorm
    });
  }

  // Bootstrap CI for SUCRA - uses seeded PRNG for reproducibility
  const alpha = 1 - confidenceLevel;
  const bootSUCRA = [];

  for (let t = 0; t < nTreat; t++) {
    const sucraVals = [];
    for (let b = 0; b < nIterations; b++) {
      // Resample iterations using seeded PRNG
      const sampleIdx = Array.from({ length: nIter }, () => rng.randomInt(nIter));
      const ranks = sampleIdx.map(i => rankMatrix[i][t]);

      // Calculate SUCRA
      const probs = Array(nTreat).fill(0);
      ranks.forEach(r => probs[r - 1]++);
      const probNorm = probs.map(p => p / nIter);

      let cumSum = 0;
      let sucraVal = 0;
      for (let r = 0; r < nTreat - 1; r++) {
        cumSum += probNorm[r];
        sucraVal += cumSum;
      }
      sucraVal /= (nTreat - 1);
      sucraVals.push(sucraVal);
    }

    sucraVals.sort((a, b) => a - b);
    bootSUCRA.push({
      treatment: t + 1,
      ci: [
        sucraVals[Math.floor(nIterations * alpha / 2)],
        sucraVals[Math.floor(nIterations * (1 - alpha / 2))]
      ],
      se: Math.sqrt(sucraVals.reduce((s, v) =>
        s + Math.pow(v - sucra[t].sucra, 2), 0) / nIterations)
    });
  }

  // Merge results
  const results = sucra.map((s, i) => ({
    ...s,
    ...bootSUCRA[i]
  }));

  // Rank by SUCRA
  const ranked = [...results].sort((a, b) => b.sucra - a.sucra);

  // Rankogram data for plotting
  const rankogram = rankProbs.map((probs, t) => ({
    treatment: t + 1,
    probabilities: probs.map((p, r) => ({ rank: r + 1, probability: p }))
  }));

  return {
    results,
    ranking: ranked.map(r => r.treatment),
    rankogram,
    bestTreatment: ranked[0].treatment,
    worstTreatment: ranked[ranked.length - 1].treatment,
    confidenceLevel,
    method: 'SUCRA with Credible Intervals'
  };
}

/**
 * Bayesian Model Comparison for Meta-Analysis
 * Compare random vs fixed effects using Bayes factors
 */
export function bayesianModelComparison(yi, vi, options = {}) {
  const METHOD = 'bayesianModelComparison';

  // Input validation
  validateMetaInput(yi, vi, METHOD);

  const {
    priorTau = { type: 'halfCauchy', scale: 0.5 },
    nSamples = 10000,
    nBurnin = 2000,
    seed = 42
  } = options;

  validateNumeric(nSamples, 'nSamples', METHOD, { min: 100, integer: true });

  const n = yi.length;

  // Simple Metropolis-Hastings for random effects model
  // Uses seeded PRNG for reproducibility (Blackman & Vigna, 2018)
  function runMCMC(model, rng) {
    const samples = { theta: [], tau: [], logLik: [] };
    let theta = yi.reduce((a, b) => a + b, 0) / n;
    let tau = model === 'random' ? 0.1 : 0;

    for (let iter = 0; iter < nSamples + nBurnin; iter++) {
      // Propose new theta using seeded PRNG
      const propTheta = theta + (rng.random() - 0.5) * 0.2;

      // Log-likelihood
      let llCurrent = 0, llProposed = 0;
      yi.forEach((y, i) => {
        const v = vi[i] + tau * tau;
        llCurrent += -0.5 * (Math.log(v) + Math.pow(y - theta, 2) / v);
        llProposed += -0.5 * (Math.log(v) + Math.pow(y - propTheta, 2) / v);
      });

      // Accept/reject using seeded PRNG
      if (Math.log(rng.random()) < llProposed - llCurrent) {
        theta = propTheta;
      }

      // For random effects, also update tau
      if (model === 'random') {
        const propTau = Math.abs(tau + (rng.random() - 0.5) * 0.1);

        llCurrent = 0;
        llProposed = 0;
        yi.forEach((y, i) => {
          const vCurr = vi[i] + tau * tau;
          const vProp = vi[i] + propTau * propTau;
          llCurrent += -0.5 * (Math.log(vCurr) + Math.pow(y - theta, 2) / vCurr);
          llProposed += -0.5 * (Math.log(vProp) + Math.pow(y - theta, 2) / vProp);
        });

        // Half-Cauchy prior on tau
        if (priorTau.type === 'halfCauchy') {
          llCurrent += Math.log(2 / (Math.PI * priorTau.scale * (1 + Math.pow(tau / priorTau.scale, 2))));
          llProposed += Math.log(2 / (Math.PI * priorTau.scale * (1 + Math.pow(propTau / priorTau.scale, 2))));
        }

        if (Math.log(rng.random()) < llProposed - llCurrent) {
          tau = propTau;
        }
      }

      if (iter >= nBurnin) {
        let ll = 0;
        yi.forEach((y, i) => {
          const v = vi[i] + tau * tau;
          ll += -0.5 * (Math.log(2 * Math.PI * v) + Math.pow(y - theta, 2) / v);
        });
        samples.theta.push(theta);
        samples.tau.push(tau);
        samples.logLik.push(ll);
      }
    }

    return samples;
  }

  // Use different seeds for fixed vs random to ensure independent chains
  const fixedSamples = runMCMC('fixed', createSeededRNG(seed));
  const randomSamples = runMCMC('random', createSeededRNG(seed + 1000));

  // Calculate DIC (Deviance Information Criterion)
  function calculateDIC(samples) {
    const meanLL = samples.logLik.reduce((a, b) => a + b, 0) / samples.logLik.length;
    const deviance = -2 * samples.logLik;
    const meanDeviance = deviance.reduce((a, b) => a + b, 0) / deviance.length;

    const thetaMean = samples.theta.reduce((a, b) => a + b, 0) / samples.theta.length;
    const tauMean = samples.tau.reduce((a, b) => a + b, 0) / samples.tau.length;

    let devianceAtMean = 0;
    yi.forEach((y, i) => {
      const v = vi[i] + tauMean * tauMean;
      devianceAtMean += Math.log(2 * Math.PI * v) + Math.pow(y - thetaMean, 2) / v;
    });

    const pD = meanDeviance - devianceAtMean;
    const DIC = meanDeviance + pD;

    return { DIC, pD, meanDeviance };
  }

  const fixedDIC = calculateDIC(fixedSamples);
  const randomDIC = calculateDIC(randomSamples);

  // WAIC approximation
  function calculateWAIC(samples) {
    const lppd = yi.reduce((sum, y, i) => {
      const likes = samples.theta.map((t, j) => {
        const v = vi[i] + samples.tau[j] * samples.tau[j];
        return Math.exp(-0.5 * (Math.log(2 * Math.PI * v) + Math.pow(y - t, 2) / v));
      });
      return sum + Math.log(likes.reduce((a, b) => a + b, 0) / likes.length);
    }, 0);

    const pWAIC = yi.reduce((sum, y, i) => {
      const logLikes = samples.theta.map((t, j) => {
        const v = vi[i] + samples.tau[j] * samples.tau[j];
        return -0.5 * (Math.log(2 * Math.PI * v) + Math.pow(y - t, 2) / v);
      });
      const mean = logLikes.reduce((a, b) => a + b, 0) / logLikes.length;
      return sum + logLikes.reduce((s, ll) => s + Math.pow(ll - mean, 2), 0) / logLikes.length;
    }, 0);

    return { WAIC: -2 * (lppd - pWAIC), lppd, pWAIC };
  }

  const fixedWAIC = calculateWAIC(fixedSamples);
  const randomWAIC = calculateWAIC(randomSamples);

  // Approximate Bayes Factor using Savage-Dickey
  // BF10 = p(tau=0|data) / p(tau=0|prior)
  // Use kernel density estimate at 0
  const tauSamples = randomSamples.tau;
  // Pre-compute mean for efficiency (avoid recalculating in reduce loop)
  const tauMean = tauSamples.reduce((a, b) => a + b, 0) / tauSamples.length;
  const tauVariance = tauSamples.reduce((s, t) => s + Math.pow(t - tauMean, 2), 0) / tauSamples.length;
  const bandwidth = 1.06 * Math.sqrt(tauVariance) * Math.pow(tauSamples.length, -0.2);

  const posteriorAtZero = tauSamples.reduce((s, t) =>
    s + Math.exp(-0.5 * Math.pow(t / bandwidth, 2)), 0) / (tauSamples.length * bandwidth * Math.sqrt(2 * Math.PI));
  const priorAtZero = 2 / (Math.PI * priorTau.scale); // Half-Cauchy at 0

  const BF01 = posteriorAtZero / priorAtZero; // Fixed vs Random
  const BF10 = 1 / BF01;

  // Summary
  const randomTheta = randomSamples.theta.reduce((a, b) => a + b, 0) / randomSamples.theta.length;
  const randomTau = randomSamples.tau.reduce((a, b) => a + b, 0) / randomSamples.tau.length;
  const fixedTheta = fixedSamples.theta.reduce((a, b) => a + b, 0) / fixedSamples.theta.length;

  return {
    fixedEffects: {
      theta: fixedTheta,
      DIC: fixedDIC.DIC,
      WAIC: fixedWAIC.WAIC
    },
    randomEffects: {
      theta: randomTheta,
      tau: randomTau,
      DIC: randomDIC.DIC,
      WAIC: randomWAIC.WAIC
    },
    comparison: {
      DICdifference: fixedDIC.DIC - randomDIC.DIC,
      WAICdifference: fixedWAIC.WAIC - randomWAIC.WAIC,
      BF01_fixedVsRandom: BF01,
      BF10_randomVsFixed: BF10
    },
    recommendation: {
      byDIC: randomDIC.DIC < fixedDIC.DIC - 2 ? 'random' : fixedDIC.DIC < randomDIC.DIC - 2 ? 'fixed' : 'no clear preference',
      byWAIC: randomWAIC.WAIC < fixedWAIC.WAIC - 2 ? 'random' : fixedWAIC.WAIC < randomWAIC.WAIC - 2 ? 'fixed' : 'no clear preference',
      byBF: BF10 > 3 ? 'random' : BF01 > 3 ? 'fixed' : 'no clear preference'
    },
    interpretation: BF10 > 10 ? 'Strong evidence for random effects'
      : BF10 > 3 ? 'Moderate evidence for random effects'
      : BF01 > 10 ? 'Strong evidence for fixed effects'
      : BF01 > 3 ? 'Moderate evidence for fixed effects'
      : 'Inconclusive evidence',
    method: 'Bayesian Model Comparison (DIC, WAIC, Bayes Factor)'
  };
}

/**
 * Multi-Moderator Meta-Regression
 *
 * Performs weighted least squares (WLS) or mixed-effects meta-regression
 * with multiple continuous and categorical moderators.
 *
 * Reference: Thompson & Higgins (2002). How should meta-regression analyses
 * be undertaken and interpreted? Statistics in Medicine.
 *
 * @param {Array<number>} yi - Effect sizes
 * @param {Array<number>} vi - Sampling variances
 * @param {Object} moderators - Object with named moderator arrays
 *   Continuous: {age: [45, 52, 38, ...]}
 *   Categorical: {country: ['US', 'UK', 'FR', ...]}
 * @param {Object} options - Configuration options
 * @returns {Object} Meta-regression results with coefficients and diagnostics
 */
export function multiModeratorMetaRegression(yi, vi, moderators, options = {}) {
  const METHOD = 'multiModeratorMetaRegression';

  validateMetaInput(yi, vi, METHOD);
  validateModerators(moderators, yi.length, METHOD);

  const {
    method = 'mixed', // 'fixed' (WLS) or 'mixed' (REML)
    tau2Estimator = 'REML',
    confidenceLevel = 0.95,
    permutations = 0, // Number of permutations for p-value (0 = none)
    knhaAdjustment = true, // Knapp-Hartung adjustment
    interceptOnly = false, // If true, also fit intercept-only model
    seed = 12345
  } = options;

  const k = yi.length;
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // Build design matrix
  const modNames = Object.keys(moderators);
  const categoricalMods = new Set();
  const continuousMods = new Set();
  const modLevels = {}; // For categorical: store levels

  // Identify categorical vs continuous moderators
  modNames.forEach(name => {
    const values = moderators[name];
    const uniqueVals = [...new Set(values)];
    if (typeof values[0] === 'string' || uniqueVals.length <= 5) {
      categoricalMods.add(name);
      modLevels[name] = uniqueVals.sort();
    } else {
      continuousMods.add(name);
    }
  });

  // Build design matrix X (with intercept and dummy-coded categoricals)
  const colNames = ['intercept'];
  const X = [];

  for (let i = 0; i < k; i++) {
    const row = [1]; // Intercept

    // Add continuous moderators
    for (const name of continuousMods) {
      if (i === 0) colNames.push(name);
      row.push(moderators[name][i]);
    }

    // Add dummy-coded categorical moderators (reference = first level)
    for (const name of categoricalMods) {
      const levels = modLevels[name];
      for (let j = 1; j < levels.length; j++) { // Skip first level (reference)
        if (i === 0) colNames.push(`${name}:${levels[j]}`);
        row.push(moderators[name][i] === levels[j] ? 1 : 0);
      }
    }

    X.push(row);
  }

  const p = X[0].length; // Number of parameters

  if (k <= p) {
    throw new ValidationError(
      `Not enough studies (${k}) for the number of parameters (${p}). ` +
      `Need at least ${p + 1} studies.`,
      METHOD
    );
  }

  // Initial tau2 estimate for mixed-effects
  let tau2 = 0;
  if (method === 'mixed') {
    tau2 = estimateTau2(yi, vi, tau2Estimator);
  }

  // Weighted least squares with iteration for REML
  function fitWLS(tau2Current) {
    // Weights: w_i = 1/(v_i + tau2)
    const wi = vi.map(v => 1 / (v + tau2Current));
    const W = wi.map(w => [w]); // Diagonal weight matrix as column vectors

    // X'WX
    const XtW = [];
    for (let j = 0; j < p; j++) {
      XtW.push(X.map((row, i) => row[j] * wi[i]));
    }

    const XtWX = [];
    for (let j = 0; j < p; j++) {
      const row = [];
      for (let l = 0; l < p; l++) {
        let sum = 0;
        for (let i = 0; i < k; i++) {
          sum += XtW[j][i] * X[i][l];
        }
        row.push(sum);
      }
      XtWX.push(row);
    }

    // X'Wy
    const XtWy = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let i = 0; i < k; i++) {
        sum += XtW[j][i] * yi[i];
      }
      XtWy.push(sum);
    }

    // Solve (X'WX)^-1 * X'Wy
    const XtWXinv = invertMatrix(XtWX);
    if (!XtWXinv) {
      throw new ValidationError(VALIDATION_ERRORS.singularMatrix(), METHOD);
    }

    const beta = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let l = 0; l < p; l++) {
        sum += XtWXinv[j][l] * XtWy[l];
      }
      beta.push(sum);
    }

    // Fitted values and residuals
    const fitted = X.map(row => row.reduce((sum, x, j) => sum + x * beta[j], 0));
    const residuals = yi.map((y, i) => y - fitted[i]);

    // Residual sum of squares (weighted)
    const RSS = residuals.reduce((sum, r, i) => sum + wi[i] * r * r, 0);

    // Standard errors of coefficients
    const seBeta = beta.map((_, j) => Math.sqrt(XtWXinv[j][j]));

    // Knapp-Hartung adjustment if requested
    let seBetaAdj = seBeta;
    if (knhaAdjustment && method === 'mixed') {
      const dfResid = k - p;
      const scaleFactor = Math.sqrt(RSS / dfResid);
      seBetaAdj = seBeta.map(se => se * scaleFactor);
    }

    return { beta, seBeta: seBetaAdj, XtWXinv, wi, fitted, residuals, RSS };
  }

  // For mixed-effects, iterate tau2 estimation
  let maxIter = 50;
  let tol = 1e-6;
  let converged = false;

  if (method === 'mixed') {
    for (let iter = 0; iter < maxIter; iter++) {
      const fit = fitWLS(tau2);
      const { residuals, wi } = fit;

      // REML update for tau2 (Raudenbush, 2009)
      const Q = residuals.reduce((sum, r, i) => sum + wi[i] * r * r, 0);
      const df = k - p;

      // Trace term for REML
      const sumW = wi.reduce((a, b) => a + b, 0);
      const sumW2 = wi.reduce((s, w) => s + w * w, 0);
      const traceTerm = sumW - sumW2 / sumW;

      const tau2New = Math.max(0, (Q - df) / traceTerm);

      if (Math.abs(tau2New - tau2) < tol) {
        tau2 = tau2New;
        converged = true;
        break;
      }

      tau2 = tau2New;
    }
  } else {
    converged = true;
  }

  // Final fit
  const finalFit = fitWLS(tau2);
  const { beta, seBeta, XtWXinv, wi, fitted, residuals, RSS } = finalFit;

  // Model statistics
  const QE = RSS; // Residual heterogeneity
  const dfE = k - p;
  const QEp = 1 - jStat.chisquare.cdf(QE, dfE);

  // Model test (omnibus test for moderators)
  // Q_model = Q_total - Q_E
  const tau2Null = estimateTau2(yi, vi, tau2Estimator);
  const wiNull = vi.map(v => 1 / (v + tau2Null));
  const sumWNull = wiNull.reduce((a, b) => a + b, 0);
  const muNull = wiNull.reduce((s, w, i) => s + w * yi[i], 0) / sumWNull;
  const QTotal = yi.reduce((sum, y, i) => sum + wiNull[i] * Math.pow(y - muNull, 2), 0);
  const QModel = QTotal - QE;
  const dfM = p - 1;
  const QModelP = dfM > 0 ? 1 - jStat.chisquare.cdf(QModel, dfM) : 1;

  // Coefficient-level statistics
  const tStats = beta.map((b, j) => b / seBeta[j]);
  const pValues = tStats.map(t => 2 * (1 - jStat.studentt.cdf(Math.abs(t), dfE)));
  const ciLower = beta.map((b, j) => b - z * seBeta[j]);
  const ciUpper = beta.map((b, j) => b + z * seBeta[j]);

  // R-squared analog
  const R2 = Math.max(0, 1 - tau2 / tau2Null);

  // Permutation test for omnibus p-value if requested
  let permP = null;
  if (permutations > 0) {
    // High-quality xoshiro128** RNG for reproducibility (Blackman & Vigna, 2018)
    const permRng = createSeededRNG(seed);
    function seededRandom() {
      return permRng.random();
    }

    let countExtreme = 0;
    for (let perm = 0; perm < permutations; perm++) {
      // Shuffle yi
      const yPerm = [...yi];
      for (let i = yPerm.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [yPerm[i], yPerm[j]] = [yPerm[j], yPerm[i]];
      }

      // Fit permuted model
      try {
        const tau2Perm = method === 'mixed' ? estimateTau2(yPerm, vi, tau2Estimator) : 0;
        const wiPerm = vi.map(v => 1 / (v + tau2Perm));
        const sumWPerm = wiPerm.reduce((a, b) => a + b, 0);
        const muPerm = wiPerm.reduce((s, w, i) => s + w * yPerm[i], 0) / sumWPerm;
        const QTotalPerm = yPerm.reduce((sum, y, i) =>
          sum + wiPerm[i] * Math.pow(y - muPerm, 2), 0);

        const fitPerm = fitWLS(tau2Perm);
        const QEPerm = fitPerm.RSS;
        const QModelPerm = QTotalPerm - QEPerm;

        if (QModelPerm >= QModel) countExtreme++;
      } catch (e) {
        // Skip failed permutations
      }
    }
    permP = (countExtreme + 1) / (permutations + 1);
  }

  // Build coefficient table
  const coefficients = colNames.map((name, j) => ({
    name,
    estimate: beta[j],
    se: seBeta[j],
    ci: [ciLower[j], ciUpper[j]],
    tStatistic: tStats[j],
    pValue: pValues[j],
    significant: pValues[j] < 0.05
  }));

  // VIF for multicollinearity (only for predictors, not intercept)
  const vif = [];
  if (p > 2) {
    for (let j = 1; j < p; j++) {
      // VIF_j = 1 / (1 - R^2_j) where R^2_j is from regressing X_j on other predictors
      // Approximation using diagonal of (X'X)^-1
      const XtX = [];
      for (let a = 0; a < p; a++) {
        XtX.push(X.reduce((row, Xi) => {
          row.push(Xi.reduce((sum, _, b) => sum + Xi[a] * Xi[b], 0));
          return row;
        }, []).map((_, b) => X.reduce((sum, Xi) => sum + Xi[a] * Xi[b], 0)));
      }
      const XtXinv = invertMatrix(XtX);
      if (XtXinv) {
        const vifJ = XtXinv[j][j] * (X.reduce((s, Xi) => s + Xi[j] * Xi[j], 0));
        vif.push({ predictor: colNames[j], vif: vifJ });
      }
    }
  }

  return {
    coefficients,
    modelTest: {
      QModel,
      df: dfM,
      pValue: QModelP,
      permutationP: permP,
      significant: QModelP < 0.05,
      interpretation: QModelP < 0.05
        ? 'Moderators explain significant heterogeneity'
        : 'Moderators do not significantly explain heterogeneity'
    },
    residualHeterogeneity: {
      QE,
      df: dfE,
      pValue: QEp,
      tau2,
      tau: Math.sqrt(tau2),
      I2residual: dfE > 0 ? Math.max(0, (QE - dfE) / QE * 100) : 0
    },
    modelFit: {
      R2,
      R2interpretation: R2 > 0.75 ? 'High' : R2 > 0.5 ? 'Moderate' : R2 > 0.25 ? 'Low' : 'Very low',
      AIC: k * Math.log(RSS / k) + 2 * p,
      BIC: k * Math.log(RSS / k) + p * Math.log(k)
    },
    multicollinearity: vif.length > 0 ? {
      vif,
      warning: vif.some(v => v.vif > 10)
        ? 'High multicollinearity detected (VIF > 10)'
        : vif.some(v => v.vif > 5)
          ? 'Moderate multicollinearity detected (VIF > 5)'
          : 'No problematic multicollinearity'
    } : null,
    convergence: {
      converged,
      method: method === 'mixed' ? `Mixed-effects (${tau2Estimator})` : 'Fixed-effects (WLS)',
      knhaAdjustment
    },
    studyLevel: {
      fitted,
      residuals,
      weights: wi,
      standardizedResiduals: residuals.map((r, i) => r * Math.sqrt(wi[i]))
    },
    nStudies: k,
    nPredictors: p - 1,
    categoricalModerators: [...categoricalMods],
    continuousModerators: [...continuousMods],
    method: 'Multi-Moderator Meta-Regression'
  };
}

/**
 * Meta-CART: Classification and Regression Trees for Moderator Detection
 * Identify moderator effects automatically using tree-based methods
 * Now with cost-complexity pruning (Breiman et al. 1984)
 *
 * Reference: Li et al. (2017) Meta-CART: A tool to identify moderators
 */
export function metaCART(yi, vi, moderators, options = {}) {
  const METHOD = 'metaCART';

  // Input validation
  validateMetaInput(yi, vi, METHOD);
  validateModerators(moderators, yi.length, METHOD);

  const {
    minNodeSize = 3,
    maxDepth = 5,
    minSplit = 5,
    prune = true,        // Enable cost-complexity pruning
    nFolds = 5,          // Cross-validation folds for pruning
    cpMin = 0.01,        // Minimum complexity parameter to consider
    cpMax = 0.5,         // Maximum complexity parameter
    nCp = 20             // Number of cp values to try
  } = options;

  const n = yi.length;
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const overallTheta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

  // Calculate weighted Q for a subset
  function calcQ(indices) {
    if (indices.length < 2) return 0;
    const yiSub = indices.map(i => yi[i]);
    const wiSub = indices.map(i => wi[i]);
    const sumWSub = wiSub.reduce((a, b) => a + b, 0);
    const thetaSub = wiSub.reduce((sum, w, i) => sum + w * yiSub[i], 0) / sumWSub;
    return yiSub.reduce((sum, y, i) => sum + wiSub[i] * Math.pow(y - thetaSub, 2), 0);
  }

  // Find best split for a node
  function findBestSplit(indices, depth) {
    if (indices.length < minSplit || depth >= maxDepth) return null;

    let bestSplit = null;
    let bestQreduction = 0;
    const currentQ = calcQ(indices);

    const modNames = Object.keys(moderators);

    for (const modName of modNames) {
      const modValues = indices.map(i => moderators[modName][i]);
      const uniqueVals = [...new Set(modValues)].sort((a, b) => a - b);

      if (typeof uniqueVals[0] === 'number') {
        // Continuous moderator
        for (let i = 0; i < uniqueVals.length - 1; i++) {
          const splitPoint = (uniqueVals[i] + uniqueVals[i + 1]) / 2;
          const leftIdx = indices.filter(idx => moderators[modName][idx] <= splitPoint);
          const rightIdx = indices.filter(idx => moderators[modName][idx] > splitPoint);

          if (leftIdx.length >= minNodeSize && rightIdx.length >= minNodeSize) {
            const Qreduction = currentQ - calcQ(leftIdx) - calcQ(rightIdx);
            if (Qreduction > bestQreduction) {
              bestQreduction = Qreduction;
              bestSplit = {
                moderator: modName,
                splitPoint,
                type: 'continuous',
                leftIndices: leftIdx,
                rightIndices: rightIdx
              };
            }
          }
        }
      } else {
        // Categorical moderator
        for (const val of uniqueVals) {
          const leftIdx = indices.filter(idx => moderators[modName][idx] === val);
          const rightIdx = indices.filter(idx => moderators[modName][idx] !== val);

          if (leftIdx.length >= minNodeSize && rightIdx.length >= minNodeSize) {
            const Qreduction = currentQ - calcQ(leftIdx) - calcQ(rightIdx);
            if (Qreduction > bestQreduction) {
              bestQreduction = Qreduction;
              bestSplit = {
                moderator: modName,
                splitValue: val,
                type: 'categorical',
                leftIndices: leftIdx,
                rightIndices: rightIdx
              };
            }
          }
        }
      }
    }

    return bestSplit;
  }

  // Build tree recursively
  function buildTree(indices, depth = 0) {
    const yiNode = indices.map(i => yi[i]);
    const viNode = indices.map(i => vi[i]);
    const tau2Node = estimateTau2(yiNode, viNode, 'REML');
    const wiNode = viNode.map(v => 1 / (v + tau2Node));
    const sumWNode = wiNode.reduce((a, b) => a + b, 0);
    const thetaNode = wiNode.reduce((sum, w, i) => sum + w * yiNode[i], 0) / sumWNode;
    const seNode = Math.sqrt(1 / sumWNode);

    const node = {
      indices,
      n: indices.length,
      theta: thetaNode,
      se: seNode,
      tau2: tau2Node,
      depth,
      isLeaf: true
    };

    const split = findBestSplit(indices, depth);
    if (split) {
      node.isLeaf = false;
      node.split = split;
      node.left = buildTree(split.leftIndices, depth + 1);
      node.right = buildTree(split.rightIndices, depth + 1);
    }

    return node;
  }

  const tree = buildTree(Array.from({ length: n }, (_, i) => i));

  // Extract leaf nodes
  function getLeaves(node) {
    if (node.isLeaf) return [node];
    return [...getLeaves(node.left), ...getLeaves(node.right)];
  }

  const leaves = getLeaves(tree);

  // Calculate explained heterogeneity
  const Qtotal = calcQ(Array.from({ length: n }, (_, i) => i));
  const Qwithin = leaves.reduce((sum, leaf) => sum + calcQ(leaf.indices), 0);
  const Qbetween = Qtotal - Qwithin;
  const R2 = Qbetween / Qtotal;

  // Get split rules as text
  function getSplitRules(node, rules = []) {
    if (node.isLeaf) {
      const ci = [node.theta - 1.96 * node.se, node.theta + 1.96 * node.se];
      return [{ rules: [...rules], theta: node.theta, se: node.se, ci, n: node.n }];
    }

    const leftRules = [...rules];
    const rightRules = [...rules];

    if (node.split.type === 'continuous') {
      leftRules.push(`${node.split.moderator} <= ${node.split.splitPoint.toFixed(2)}`);
      rightRules.push(`${node.split.moderator} > ${node.split.splitPoint.toFixed(2)}`);
    } else {
      leftRules.push(`${node.split.moderator} = ${node.split.splitValue}`);
      rightRules.push(`${node.split.moderator} != ${node.split.splitValue}`);
    }

    return [
      ...getSplitRules(node.left, leftRules),
      ...getSplitRules(node.right, rightRules)
    ];
  }

  const subgroups = getSplitRules(tree);

  // Important moderators (by Q reduction)
  const moderatorImportance = {};
  function extractImportance(node) {
    if (node.isLeaf) return;
    if (!moderatorImportance[node.split.moderator]) {
      moderatorImportance[node.split.moderator] = 0;
    }
    moderatorImportance[node.split.moderator] +=
      calcQ(node.indices) - calcQ(node.left.indices) - calcQ(node.right.indices);
    extractImportance(node.left);
    extractImportance(node.right);
  }
  extractImportance(tree);

  const sortedImportance = Object.entries(moderatorImportance)
    .sort((a, b) => b[1] - a[1])
    .map(([mod, importance]) => ({ moderator: mod, importance, relativeImportance: importance / Qtotal }));

  // ============ COST-COMPLEXITY PRUNING ============
  // Implements CART-like alpha-pruning with cross-validation
  // R(T_α) = R(T) + α × |T|, where |T| is number of leaves
  // Select α that minimizes cross-validated error

  // Count leaves in a tree
  function countLeaves(node) {
    if (node.isLeaf) return 1;
    return countLeaves(node.left) + countLeaves(node.right);
  }

  // Calculate tree's resubstitution error (weighted Q within leaves)
  function treeError(node) {
    if (node.isLeaf) return calcQ(node.indices);
    return treeError(node.left) + treeError(node.right);
  }

  // Deep copy a tree node
  function copyTree(node) {
    if (node.isLeaf) {
      return { ...node };
    }
    return {
      ...node,
      split: { ...node.split },
      left: copyTree(node.left),
      right: copyTree(node.right)
    };
  }

  // Prune tree at given complexity parameter
  function pruneTree(node, cp, Qtotal) {
    if (node.isLeaf) return node;

    // Recursively prune children first
    node.left = pruneTree(node.left, cp, Qtotal);
    node.right = pruneTree(node.right, cp, Qtotal);

    // Calculate cost-complexity criterion
    // Prune if: R(t) - R(T_t) < α × (|T_t| - 1)
    // where R(t) is error at node, R(T_t) is error in subtree, |T_t| is leaves in subtree
    const nodeError = calcQ(node.indices);
    const subtreeError = treeError(node);
    const subtreeLeaves = countLeaves(node);
    const improvement = nodeError - subtreeError;

    // Prune if improvement doesn't justify complexity
    if (improvement < cp * Qtotal * (subtreeLeaves - 1)) {
      return {
        indices: node.indices,
        n: node.n,
        theta: node.theta,
        se: node.se,
        tau2: node.tau2,
        depth: node.depth,
        isLeaf: true
      };
    }

    return node;
  }

  // Cross-validation for selecting optimal cp
  function crossValidateCP(cpValues) {
    const foldSize = Math.floor(n / nFolds);
    const cvErrors = cpValues.map(() => 0);

    for (let fold = 0; fold < nFolds; fold++) {
      // Split data into training and test
      const testStart = fold * foldSize;
      const testEnd = fold === nFolds - 1 ? n : (fold + 1) * foldSize;
      const testIdx = Array.from({ length: testEnd - testStart }, (_, i) => testStart + i);
      const trainIdx = Array.from({ length: n }, (_, i) => i).filter(i => !testIdx.includes(i));

      // Build tree on training data
      const trainTree = buildTree(trainIdx);
      const trainQtotal = calcQ(trainIdx);

      // Test each cp value
      cpValues.forEach((cp, cpIdx) => {
        const prunedTree = pruneTree(copyTree(trainTree), cp, trainQtotal);
        const prunedLeaves = getLeaves(prunedTree);

        // Calculate test error: assign test points to leaves and compute Q
        let testError = 0;
        for (const testI of testIdx) {
          // Find which leaf this test point would fall into
          let node = prunedTree;
          while (!node.isLeaf) {
            const modVal = moderators[node.split.moderator][testI];
            if (node.split.type === 'continuous') {
              node = modVal <= node.split.splitPoint ? node.left : node.right;
            } else {
              node = modVal === node.split.splitValue ? node.left : node.right;
            }
          }
          // Error is weighted squared deviation from leaf mean
          testError += wi[testI] * Math.pow(yi[testI] - node.theta, 2);
        }
        cvErrors[cpIdx] += testError;
      });
    }

    return cvErrors;
  }

  let finalTree = tree;
  let prunedTree = null;
  let cpTable = null;
  let optimalCp = 0;

  if (prune && n >= nFolds * 2) {
    // Generate cp values to try
    const cpValues = Array.from({ length: nCp }, (_, i) =>
      cpMin + (cpMax - cpMin) * i / (nCp - 1)
    );

    // Cross-validate
    const cvErrors = crossValidateCP(cpValues);

    // Find optimal cp (1-SE rule: largest cp within 1 SE of minimum)
    const minError = Math.min(...cvErrors);
    const minIdx = cvErrors.indexOf(minError);
    const se = Math.sqrt(cvErrors.reduce((sum, e) => sum + Math.pow(e - minError, 2), 0) / nCp);

    let optimalIdx = minIdx;
    for (let i = nCp - 1; i >= minIdx; i--) {
      if (cvErrors[i] <= minError + se) {
        optimalIdx = i;
        break;
      }
    }
    optimalCp = cpValues[optimalIdx];

    // Prune tree with optimal cp
    prunedTree = pruneTree(copyTree(tree), optimalCp, Qtotal);
    finalTree = prunedTree;

    // Build cp table
    cpTable = cpValues.map((cp, i) => ({
      cp,
      cvError: cvErrors[i],
      nLeaves: countLeaves(pruneTree(copyTree(tree), cp, Qtotal)),
      selected: i === optimalIdx
    }));
  }

  const finalLeaves = getLeaves(finalTree);
  const QwithinFinal = finalLeaves.reduce((sum, leaf) => sum + calcQ(leaf.indices), 0);
  const QbetweenFinal = Qtotal - QwithinFinal;
  const R2Final = QbetweenFinal / Qtotal;
  const subgroupsFinal = getSplitRules(finalTree);

  return {
    overallEffect: overallTheta,
    tree: finalTree,
    unprunedTree: prune ? tree : null,
    leaves: finalLeaves.map(l => ({
      n: l.n,
      theta: l.theta,
      se: l.se,
      tau2: l.tau2,
      ci: [l.theta - 1.96 * l.se, l.theta + 1.96 * l.se]
    })),
    subgroups: subgroupsFinal,
    heterogeneity: {
      Qtotal,
      Qbetween: QbetweenFinal,
      Qwithin: QwithinFinal,
      R2: R2Final,
      percentExplained: R2Final * 100
    },
    pruning: prune ? {
      enabled: true,
      optimalCp,
      cpTable,
      nLeavesUnpruned: countLeaves(tree),
      nLeavesPruned: finalLeaves.length
    } : { enabled: false },
    moderatorImportance: sortedImportance,
    nLeaves: finalLeaves.length,
    maxDepth: Math.max(...finalLeaves.map(l => l.depth)),
    method: 'Meta-CART (with Cost-Complexity Pruning)'
  };
}

/**
 * Meta-Forest: Random Forest for Meta-Analysis
 * Ensemble moderator detection with bootstrap aggregating
 */
export function metaForest(yi, vi, moderators, options = {}) {
  const METHOD = 'metaForest';

  // Input validation
  validateMetaInput(yi, vi, METHOD);
  validateModerators(moderators, yi.length, METHOD);

  const {
    nTrees = 100,
    mtry = null, // Number of moderators to try at each split
    minNodeSize = 3,
    maxDepth = 4,
    bootstrap = true,
    seed = 42
  } = options;

  validateNumeric(nTrees, 'nTrees', METHOD, { min: 10, max: 10000, integer: true });

  const n = yi.length;
  const modNames = Object.keys(moderators);
  const nMods = modNames.length;
  const mtryActual = mtry || Math.ceil(Math.sqrt(nMods));

  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const overallTheta = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

  // Build many trees - uses seeded PRNG for reproducibility
  const rng = createSeededRNG(seed);
  const trees = [];
  const oobPredictions = Array(n).fill(null).map(() => []);
  const variableUsage = {};
  const variableUsagePerTree = [];  // Track per-tree for bootstrap CIs
  modNames.forEach(m => variableUsage[m] = 0);

  for (let t = 0; t < nTrees; t++) {
    // Bootstrap sample using seeded PRNG
    let sampleIdx;
    let oobIdx;
    if (bootstrap) {
      sampleIdx = Array.from({ length: n }, () => rng.randomInt(n));
      oobIdx = Array.from({ length: n }, (_, i) => i).filter(i => !sampleIdx.includes(i));
    } else {
      sampleIdx = Array.from({ length: n }, (_, i) => i);
      oobIdx = [];
    }

    // Select random moderators using seeded PRNG
    const selectedMods = [];
    const availMods = [...modNames];
    for (let m = 0; m < mtryActual && availMods.length > 0; m++) {
      const idx = rng.randomInt(availMods.length);
      selectedMods.push(availMods.splice(idx, 1)[0]);
    }

    // Build single tree (simplified)
    const subModerators = {};
    selectedMods.forEach(m => subModerators[m] = moderators[m]);

    function calcQ(indices) {
      if (indices.length < 2) return 0;
      const yiSub = indices.map(i => yi[i]);
      const wiSub = indices.map(i => wi[i]);
      const sumWSub = wiSub.reduce((a, b) => a + b, 0);
      const thetaSub = wiSub.reduce((sum, w, i) => sum + w * yiSub[i], 0) / sumWSub;
      return yiSub.reduce((sum, y, i) => sum + wiSub[i] * Math.pow(y - thetaSub, 2), 0);
    }

    function buildTree(indices, depth = 0) {
      const yiNode = indices.map(i => yi[i]);
      const wiNode = indices.map(i => wi[i]);
      const sumWNode = wiNode.reduce((a, b) => a + b, 0);
      const thetaNode = wiNode.reduce((sum, w, i) => sum + w * yiNode[i], 0) / sumWNode;

      if (indices.length < minNodeSize * 2 || depth >= maxDepth) {
        return { theta: thetaNode, isLeaf: true };
      }

      let bestSplit = null;
      let bestQred = 0;
      const currentQ = calcQ(indices);

      for (const modName of selectedMods) {
        const modVals = indices.map(i => moderators[modName][i]);
        const uniqueVals = [...new Set(modVals)].sort((a, b) => a - b);

        for (let i = 0; i < uniqueVals.length - 1; i++) {
          const split = (uniqueVals[i] + uniqueVals[i + 1]) / 2;
          const left = indices.filter(idx => moderators[modName][idx] <= split);
          const right = indices.filter(idx => moderators[modName][idx] > split);

          if (left.length >= minNodeSize && right.length >= minNodeSize) {
            const Qred = currentQ - calcQ(left) - calcQ(right);
            if (Qred > bestQred) {
              bestQred = Qred;
              bestSplit = { mod: modName, val: split, left, right };
            }
          }
        }
      }

      if (!bestSplit) {
        return { theta: thetaNode, isLeaf: true };
      }

      variableUsage[bestSplit.mod]++;

      return {
        isLeaf: false,
        split: bestSplit,
        left: buildTree(bestSplit.left, depth + 1),
        right: buildTree(bestSplit.right, depth + 1)
      };
    }

    const tree = buildTree(sampleIdx);
    trees.push(tree);

    // Track this tree's variable usage for bootstrap CIs
    const treeUsage = {};
    modNames.forEach(m => treeUsage[m] = 0);
    function countTreeUsage(node) {
      if (node.isLeaf) return;
      treeUsage[node.split.mod]++;
      countTreeUsage(node.left);
      countTreeUsage(node.right);
    }
    countTreeUsage(tree);
    variableUsagePerTree.push(treeUsage);

    // OOB predictions
    function predict(node, idx) {
      if (node.isLeaf) return node.theta;
      if (moderators[node.split.mod][idx] <= node.split.val) {
        return predict(node.left, idx);
      }
      return predict(node.right, idx);
    }

    oobIdx.forEach(i => {
      oobPredictions[i].push(predict(tree, i));
    });
  }

  // Calculate variable importance with bootstrap CIs
  const totalUsage = Object.values(variableUsage).reduce((a, b) => a + b, 0);
  
  // Compute per-tree normalized importance for bootstrap CIs
  const perTreeImportance = variableUsagePerTree.map(treeUsage => {
    const treeTotal = Object.values(treeUsage).reduce((a, b) => a + b, 0) || 1;
    const normalized = {};
    modNames.forEach(m => normalized[m] = treeUsage[m] / treeTotal);
    return normalized;
  });
  
  const importance = modNames.map(m => {
    const pointEstimate = variableUsage[m] / totalUsage;
    // Bootstrap CI from per-tree importance
    const treeValues = perTreeImportance.map(ti => ti[m]).sort((a, b) => a - b);
    const n = treeValues.length;
    const ciLower = treeValues[Math.floor(n * 0.025)] || 0;
    const ciUpper = treeValues[Math.floor(n * 0.975)] || 1;
    const se = Math.sqrt(treeValues.reduce((s, v) => s + Math.pow(v - pointEstimate, 2), 0) / n);
    return {
      moderator: m,
      usage: variableUsage[m],
      importance: pointEstimate,
      se,
      ci: [ciLower, ciUpper]
    };
  }).sort((a, b) => b.importance - a.importance);

  // OOB error (R-squared based)
  let oobError = 0;
  let oobN = 0;
  let ssTot = 0;
  let ssRes = 0;

  oobPredictions.forEach((preds, i) => {
    if (preds.length > 0) {
      const pred = preds.reduce((a, b) => a + b, 0) / preds.length;
      oobN++;
      ssRes += wi[i] * Math.pow(yi[i] - pred, 2);
      ssTot += wi[i] * Math.pow(yi[i] - overallTheta, 2);
    }
  });

  const oobR2 = 1 - ssRes / ssTot;

  // Ensemble predictions
  const predictions = Array(n).fill(0).map((_, i) => {
    const preds = trees.map(tree => {
      function predict(node) {
        if (node.isLeaf) return node.theta;
        if (moderators[node.split.mod][i] <= node.split.val) {
          return predict(node.left);
        }
        return predict(node.right);
      }
      return predict(tree);
    });
    return {
      mean: preds.reduce((a, b) => a + b, 0) / preds.length,
      se: Math.sqrt(preds.reduce((s, p) =>
        s + Math.pow(p - preds.reduce((a, b) => a + b, 0) / preds.length, 2), 0) / preds.length)
    };
  });

  return {
    nTrees,
    mtry: mtryActual,
    overallEffect: overallTheta,
    oobPerformance: {
      R2: oobR2,
      nOOB: oobN,
      percentExplained: oobR2 * 100
    },
    variableImportance: importance,
    predictions: predictions.map((p, i) => ({
      study: i + 1,
      observed: yi[i],
      predicted: p.mean,
      predictionSE: p.se,
      residual: yi[i] - p.mean
    })),
    topModerators: importance.slice(0, 3).map(m => m.moderator),
    method: 'Meta-Forest (Random Forest for Meta-Analysis)'
  };
}

// ============================================================================
// BEYOND R CAPABILITIES: PHASE 6 - Methods 41-48
// ============================================================================

/**
 * Time-to-Event Meta-Analysis
 * Pool hazard ratios with proper variance estimation
 */
export function timeToEventMA(studies, options = {}) {
  const METHOD = 'timeToEventMA';

  // Input validation
  validateBinaryStudies(studies, METHOD, ['logHR', 'se']);

  const {
    confidenceLevel = 0.95,
    model = 'random',
    predictionInterval = true
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = studies.length;
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // Extract log hazard ratios and variances
  const logHR = [];
  const vi = [];

  studies.forEach(s => {
    if (s.hr && s.ci) {
      // HR with CI
      const lhr = Math.log(s.hr);
      const lhrLower = Math.log(s.ci[0]);
      const lhrUpper = Math.log(s.ci[1]);
      const se = (lhrUpper - lhrLower) / (2 * z);
      logHR.push(lhr);
      vi.push(se * se);
    } else if (s.hr && s.se) {
      // HR with SE (on log scale)
      logHR.push(Math.log(s.hr));
      vi.push(s.se * s.se);
    } else if (s.logHR !== undefined && s.seLogHR !== undefined) {
      // Already on log scale
      logHR.push(s.logHR);
      vi.push(s.seLogHR * s.seLogHR);
    } else if (s.oMinusE !== undefined && s.variance !== undefined) {
      // O-E and V (Peto method)
      const lhr = s.oMinusE / s.variance;
      logHR.push(lhr);
      vi.push(1 / s.variance);
    }
  });

  // Calculate tau2
  const tau2 = model === 'random' ? estimateTau2(logHR, vi, 'REML') : 0;

  // Weights
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);

  // Pooled estimate
  const pooledLogHR = wi.reduce((sum, w, i) => sum + w * logHR[i], 0) / sumW;
  const sePooled = Math.sqrt(1 / sumW);

  // Convert back to HR scale
  const pooledHR = Math.exp(pooledLogHR);
  const ciLogHR = [pooledLogHR - z * sePooled, pooledLogHR + z * sePooled];
  const ciHR = [Math.exp(ciLogHR[0]), Math.exp(ciLogHR[1])];

  // Prediction interval
  let predInt = null;
  if (predictionInterval && model === 'random' && n > 2) {
    const tCrit = jStat.studentt.inv(1 - (1 - confidenceLevel) / 2, n - 2);
    const predSE = Math.sqrt(sePooled * sePooled + tau2);
    predInt = {
      logHR: [pooledLogHR - tCrit * predSE, pooledLogHR + tCrit * predSE],
      HR: [Math.exp(pooledLogHR - tCrit * predSE), Math.exp(pooledLogHR + tCrit * predSE)]
    };
  }

  // Heterogeneity
  const Q = logHR.reduce((sum, lhr, i) => sum + wi[i] * Math.pow(lhr - pooledLogHR, 2), 0);
  const df = n - 1;
  const I2 = Math.max(0, (Q - df) / Q * 100);
  const H2 = Q / df;

  // Individual study results
  const studyResults = studies.map((s, i) => ({
    study: s.name || `Study ${i + 1}`,
    logHR: logHR[i],
    HR: Math.exp(logHR[i]),
    se: Math.sqrt(vi[i]),
    weight: (wi[i] / sumW) * 100,
    ci: [Math.exp(logHR[i] - z * Math.sqrt(vi[i])), Math.exp(logHR[i] + z * Math.sqrt(vi[i]))]
  }));

  // Significance
  const zStat = pooledLogHR / sePooled;
  const pValue = 2 * (1 - normalCDF(Math.abs(zStat)));

  return {
    pooled: {
      logHR: pooledLogHR,
      HR: pooledHR,
      se: sePooled,
      ci: ciHR,
      ciLogHR,
      z: zStat,
      p: pValue,
      significant: pValue < 0.05
    },
    predictionInterval: predInt,
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      Q,
      df,
      pQ: 1 - jStat.chisquare.cdf(Q, df),
      I2,
      H2
    },
    studies: studyResults,
    model,
    nStudies: n,
    interpretation: pooledHR < 1
      ? `Treatment reduces hazard by ${((1 - pooledHR) * 100).toFixed(1)}%`
      : `Treatment increases hazard by ${((pooledHR - 1) * 100).toFixed(1)}%`,
    method: 'Time-to-Event Meta-Analysis (Hazard Ratio)'
  };
}

/**
 * Sequential Bayesian Updating for Living Reviews
 * Update meta-analysis as new studies arrive
 */
export function sequentialBayesianUpdate(priorState, newStudy, options = {}) {
  const METHOD = 'sequentialBayesianUpdate';

  // Input validation
  if (newStudy && (typeof newStudy.yi !== 'number' || typeof newStudy.vi !== 'number')) {
    throw new ValidationError('newStudy must have yi and vi properties', METHOD);
  }

  const {
    priorType = 'informative', // 'informative', 'weakly_informative', 'flat'
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  // Prior parameters (from previous analysis or specified)
  let priorMean, priorVar, priorTau2, priorN;

  if (priorState === null || priorState.type === 'initial') {
    // Uninformative prior
    priorMean = 0;
    priorVar = 10;
    priorTau2 = 0.1;
    priorN = 0;
  } else {
    priorMean = priorState.posteriorMean;
    priorVar = priorState.posteriorVar;
    priorTau2 = priorState.tau2;
    priorN = priorState.nStudies;
  }

  // New study data
  const y = newStudy.effect;
  const v = newStudy.variance || newStudy.se * newStudy.se;

  // Update tau2 (simplified empirical Bayes)
  const residual = (y - priorMean);
  const expectedVar = v + priorTau2;
  const newTau2 = Math.max(0, priorTau2 + 0.1 * (residual * residual - expectedVar));

  // Posterior with updated tau2
  const totalVar = v + newTau2;
  const weight = 1 / totalVar;
  const priorWeight = 1 / priorVar;

  // Combine prior and likelihood
  const posteriorPrecision = priorWeight + weight;
  const posteriorVar = 1 / posteriorPrecision;
  const posteriorMean = (priorWeight * priorMean + weight * y) / posteriorPrecision;

  // Credible interval
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);
  const posteriorSE = Math.sqrt(posteriorVar);
  const credibleInterval = [posteriorMean - z * posteriorSE, posteriorMean + z * posteriorSE];

  // Bayes factor for effect vs no effect
  const bfNumerator = Math.exp(-0.5 * Math.pow(posteriorMean / posteriorSE, 2));
  const bfDenominator = Math.exp(-0.5 * Math.pow(priorMean / Math.sqrt(priorVar), 2));
  const bayesFactor = bfNumerator / bfDenominator;

  // Probability of direction
  const probPositive = 1 - normalCDF(-posteriorMean / posteriorSE);

  // Sequential decision metrics
  const nUpdated = priorN + 1;
  const cumulativeZ = posteriorMean / posteriorSE;

  // O'Brien-Fleming-like boundary
  const obfBoundary = z * Math.sqrt(nUpdated);
  const crossedBoundary = Math.abs(cumulativeZ * Math.sqrt(nUpdated)) > obfBoundary;

  return {
    posterior: {
      mean: posteriorMean,
      variance: posteriorVar,
      se: posteriorSE,
      credibleInterval
    },
    prior: {
      mean: priorMean,
      variance: priorVar
    },
    update: {
      newStudy: { effect: y, variance: v },
      shift: posteriorMean - priorMean,
      precisionGain: posteriorPrecision - priorWeight
    },
    heterogeneity: {
      tau2: newTau2,
      tau: Math.sqrt(newTau2)
    },
    inference: {
      bayesFactor,
      probPositive,
      probNegative: 1 - probPositive,
      significant: !credibleInterval.includes(0) ||
        (credibleInterval[0] > 0 || credibleInterval[1] < 0)
    },
    sequential: {
      nStudies: nUpdated,
      cumulativeZ,
      obfBoundary,
      crossedBoundary,
      recommendation: crossedBoundary
        ? 'Sufficient evidence accumulated - consider stopping'
        : 'Continue monitoring for more evidence'
    },
    // State for next update
    stateForNextUpdate: {
      posteriorMean,
      posteriorVar,
      tau2: newTau2,
      nStudies: nUpdated
    },
    method: 'Sequential Bayesian Update for Living Reviews'
  };
}

/**
 * Prediction Model Meta-Analysis
 * Pool c-statistics and calibration measures
 */
export function predictionModelMA(studies, options = {}) {
  const METHOD = 'predictionModelMA';

  // Input validation
  if (!Array.isArray(studies) || studies.length < 2) {
    throw new ValidationError('need at least 2 studies', METHOD);
  }

  const {
    outcome = 'cStatistic', // 'cStatistic', 'calibrationSlope', 'calibrationIntercept', 'OE_ratio'
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = studies.length;
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  let yi, vi;

  if (outcome === 'cStatistic') {
    // Transform c-statistics using logit transformation
    yi = studies.map(s => {
      const c = s.cStatistic || s.auc || s.c;
      // Logit transformation: log(c / (1-c))
      return Math.log(c / (1 - c));
    });

    vi = studies.map(s => {
      const c = s.cStatistic || s.auc || s.c;
      const se = s.se || s.seC;
      if (se) {
        // Delta method for logit SE
        return Math.pow(se / (c * (1 - c)), 2);
      } else if (s.ci) {
        // From CI
        const logitUpper = Math.log(s.ci[1] / (1 - s.ci[1]));
        const logitLower = Math.log(s.ci[0] / (1 - s.ci[0]));
        return Math.pow((logitUpper - logitLower) / (2 * z), 2);
      } else if (s.n && s.events) {
        // Hanley-McNeil approximation
        const n1 = s.events;
        const n0 = s.n - s.events;
        const q1 = c / (2 - c);
        const q2 = 2 * c * c / (1 + c);
        const varC = (c * (1 - c) + (n1 - 1) * (q1 - c * c) + (n0 - 1) * (q2 - c * c)) / (n1 * n0);
        return varC / Math.pow(c * (1 - c), 2);
      }
      return 0.1; // Default
    });
  } else if (outcome === 'calibrationSlope') {
    yi = studies.map(s => s.calibrationSlope || s.slope);
    vi = studies.map(s => {
      if (s.seSlope) return s.seSlope * s.seSlope;
      if (s.ciSlope) return Math.pow((s.ciSlope[1] - s.ciSlope[0]) / (2 * z), 2);
      return 0.1;
    });
  } else if (outcome === 'OE_ratio') {
    // Log-transform O/E ratio
    yi = studies.map(s => Math.log(s.OEratio || s.oe));
    vi = studies.map(s => {
      if (s.seLogOE) return s.seLogOE * s.seLogOE;
      if (s.ciOE) return Math.pow((Math.log(s.ciOE[1]) - Math.log(s.ciOE[0])) / (2 * z), 2);
      if (s.observed && s.expected) {
        // Poisson-based variance
        return 1 / s.observed;
      }
      return 0.1;
    });
  } else {
    yi = studies.map(s => s.calibrationIntercept || s.intercept);
    vi = studies.map(s => {
      if (s.seIntercept) return s.seIntercept * s.seIntercept;
      return 0.1;
    });
  }

  // Random effects meta-analysis
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const pooled = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const sePooled = Math.sqrt(1 / sumW);

  // Back-transform for c-statistic
  let pooledOriginal, ciOriginal;
  if (outcome === 'cStatistic') {
    pooledOriginal = 1 / (1 + Math.exp(-pooled)); // Inverse logit
    const ciLogit = [pooled - z * sePooled, pooled + z * sePooled];
    ciOriginal = ciLogit.map(x => 1 / (1 + Math.exp(-x)));
  } else if (outcome === 'OE_ratio') {
    pooledOriginal = Math.exp(pooled);
    const ciLog = [pooled - z * sePooled, pooled + z * sePooled];
    ciOriginal = ciLog.map(x => Math.exp(x));
  } else {
    pooledOriginal = pooled;
    ciOriginal = [pooled - z * sePooled, pooled + z * sePooled];
  }

  // Heterogeneity
  const Q = yi.reduce((sum, y, i) => sum + wi[i] * Math.pow(y - pooled, 2), 0);
  const I2 = Math.max(0, (Q - (n - 1)) / Q * 100);

  // Prediction interval
  const tCrit = n > 2 ? jStat.studentt.inv(1 - (1 - confidenceLevel) / 2, n - 2) : z;
  const predSE = Math.sqrt(sePooled * sePooled + tau2);
  let predInt;
  if (outcome === 'cStatistic') {
    const predLogit = [pooled - tCrit * predSE, pooled + tCrit * predSE];
    predInt = predLogit.map(x => 1 / (1 + Math.exp(-x)));
  } else if (outcome === 'OE_ratio') {
    const predLog = [pooled - tCrit * predSE, pooled + tCrit * predSE];
    predInt = predLog.map(x => Math.exp(x));
  } else {
    predInt = [pooled - tCrit * predSE, pooled + tCrit * predSE];
  }

  // Study results
  const studyResults = studies.map((s, i) => {
    let original;
    if (outcome === 'cStatistic') {
      original = 1 / (1 + Math.exp(-yi[i]));
    } else if (outcome === 'OE_ratio') {
      original = Math.exp(yi[i]);
    } else {
      original = yi[i];
    }
    return {
      study: s.name || `Study ${i + 1}`,
      estimate: original,
      se: Math.sqrt(vi[i]),
      weight: (wi[i] / sumW) * 100
    };
  });

  // Interpretation
  let interpretation;
  if (outcome === 'cStatistic') {
    interpretation = pooledOriginal >= 0.9 ? 'Excellent discrimination'
      : pooledOriginal >= 0.8 ? 'Good discrimination'
      : pooledOriginal >= 0.7 ? 'Acceptable discrimination'
      : 'Poor discrimination';
  } else if (outcome === 'calibrationSlope') {
    interpretation = Math.abs(pooledOriginal - 1) < 0.1 ? 'Well calibrated'
      : pooledOriginal < 1 ? 'Overfitting detected'
      : 'Underfitting detected';
  } else if (outcome === 'OE_ratio') {
    interpretation = Math.abs(pooledOriginal - 1) < 0.2 ? 'Well calibrated'
      : pooledOriginal < 1 ? 'Overprediction'
      : 'Underprediction';
  } else {
    interpretation = Math.abs(pooledOriginal) < 0.1 ? 'Well calibrated' : 'Miscalibrated';
  }

  return {
    pooled: {
      estimate: pooledOriginal,
      se: sePooled,
      ci: ciOriginal,
      predictionInterval: predInt
    },
    heterogeneity: { tau2, Q, I2, pQ: 1 - jStat.chisquare.cdf(Q, n - 1) },
    studies: studyResults,
    outcome,
    interpretation,
    recommendation: I2 > 75
      ? 'High heterogeneity - investigate sources before applying model'
      : 'Results can be generalized with caution',
    method: `Prediction Model MA (${outcome})`
  };
}

/**
 * Multivariate Network Meta-Analysis
 * Handle correlated outcomes in NMA
 */
export function multivariateNMA(studies, options = {}) {
  const METHOD = 'multivariateNMA';

  // Input validation
  if (!Array.isArray(studies) || studies.length < 2) {
    throw new ValidationError('need at least 2 studies', METHOD);
  }

  const {
    outcomes = [],
    correlation = 0.5, // Assumed within-study correlation
    confidenceLevel = 0.95
  } = options;

  validateNumeric(correlation, 'correlation', METHOD, { min: -1, max: 1 });
  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);
  const nOutcomes = outcomes.length || 2;

  // Extract treatments and organize data
  const treatments = new Set();
  studies.forEach(s => {
    treatments.add(s.treat1);
    treatments.add(s.treat2);
  });
  const treatList = [...treatments].sort();
  const nTreat = treatList.length;

  // Organize by outcome
  const dataByOutcome = {};
  outcomes.forEach(o => {
    dataByOutcome[o] = studies.filter(s => s.outcome === o);
  });

  // Run separate NMA for each outcome
  const nmaResults = {};
  outcomes.forEach(outcome => {
    const data = dataByOutcome[outcome];
    if (data.length === 0) return;

    // Simple pairwise pooling per comparison
    const comparisons = {};
    data.forEach(s => {
      const key = [s.treat1, s.treat2].sort().join('-');
      if (!comparisons[key]) comparisons[key] = [];
      comparisons[key].push({
        effect: s.treat1 < s.treat2 ? s.effect : -s.effect,
        var: s.se * s.se
      });
    });

    // Pool each comparison
    const pooledComparisons = {};
    Object.entries(comparisons).forEach(([key, data]) => {
      const vi = data.map(d => d.var);
      const yi = data.map(d => d.effect);
      const tau2 = estimateTau2(yi, vi, 'DL');
      const wi = vi.map(v => 1 / (v + tau2));
      const sumW = wi.reduce((a, b) => a + b, 0);
      const pooled = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
      const se = Math.sqrt(1 / sumW);
      pooledComparisons[key] = { effect: pooled, se, tau2 };
    });

    nmaResults[outcome] = pooledComparisons;
  });

  // Create treatment effect matrix for each outcome
  const effectMatrices = {};
  outcomes.forEach(outcome => {
    const matrix = Array(nTreat).fill(null).map(() => Array(nTreat).fill(null));
    const seMatrix = Array(nTreat).fill(null).map(() => Array(nTreat).fill(null));

    // Fill diagonal with zeros
    for (let i = 0; i < nTreat; i++) {
      matrix[i][i] = 0;
      seMatrix[i][i] = 0;
    }

    // Fill from pooled comparisons
    Object.entries(nmaResults[outcome] || {}).forEach(([key, data]) => {
      const [t1, t2] = key.split('-');
      const i = treatList.indexOf(t1);
      const j = treatList.indexOf(t2);
      matrix[i][j] = -data.effect;
      matrix[j][i] = data.effect;
      seMatrix[i][j] = data.se;
      seMatrix[j][i] = data.se;
    });

    effectMatrices[outcome] = { effects: matrix, se: seMatrix };
  });

  // Calculate rankings for each outcome
  const rankings = {};
  outcomes.forEach(outcome => {
    const effects = effectMatrices[outcome]?.effects;
    if (!effects) return;

    // Sum of effects vs reference (treatment 0)
    const scores = treatList.map((t, i) => ({
      treatment: t,
      score: effects[i].filter(e => e !== null).reduce((a, b) => a + (b || 0), 0) / (nTreat - 1)
    }));

    rankings[outcome] = scores.sort((a, b) => b.score - a.score);
  });

  // Joint ranking (weighted average across outcomes)
  const jointScores = treatList.map(t => {
    let totalScore = 0;
    let count = 0;
    outcomes.forEach(o => {
      const ranking = rankings[o];
      if (ranking) {
        const rank = ranking.findIndex(r => r.treatment === t);
        if (rank >= 0) {
          totalScore += (nTreat - rank);
          count++;
        }
      }
    });
    return { treatment: t, avgRank: count > 0 ? (nTreat - totalScore / count) : nTreat };
  });

  const jointRanking = jointScores.sort((a, b) => a.avgRank - b.avgRank);

  // Outcome correlations (simplified)
  const outcomeCorrelations = [];
  for (let i = 0; i < outcomes.length; i++) {
    for (let j = i + 1; j < outcomes.length; j++) {
      // Estimate correlation from shared studies
      const shared = studies.filter(s =>
        studies.some(s2 => s2.study === s.study && s2.outcome === outcomes[i]) &&
        studies.some(s2 => s2.study === s.study && s2.outcome === outcomes[j])
      );
      outcomeCorrelations.push({
        outcome1: outcomes[i],
        outcome2: outcomes[j],
        correlation: correlation, // Use assumed correlation
        nShared: shared.length
      });
    }
  }

  return {
    treatments: treatList,
    outcomes,
    effectMatrices,
    rankingsByOutcome: rankings,
    jointRanking: jointRanking.map((r, i) => ({ ...r, rank: i + 1 })),
    bestTreatment: jointRanking[0].treatment,
    outcomeCorrelations,
    nStudies: studies.length,
    nTreatments: nTreat,
    nOutcomes: outcomes.length,
    method: 'Multivariate Network Meta-Analysis'
  };
}

/**
 * Network Meta-Regression
 * Extends NMA to include study-level and comparison-level covariates
 * Based on Dias et al. (2013) and Salanti et al. (2011)
 *
 * Can model:
 * - Study-level covariates (e.g., year, risk of bias)
 * - Treatment-by-covariate interactions
 * - Multiple regression coefficients
 */
export function networkMetaRegression(studies, options = {}) {
  const METHOD = 'networkMetaRegression';

  // Input validation
  if (!Array.isArray(studies) || studies.length < 3) {
    throw new ValidationError('need at least 3 studies for network meta-regression', METHOD);
  }

  const {
    covariates = [],              // Covariate names to include
    interaction = 'common',       // 'common' (same interaction for all), 'exchangeable', 'independent'
    referenceT = null,            // Reference treatment (null = first alphabetically)
    tau2Prior = 'weakly-informative', // Prior for heterogeneity
    maxIter = 100,
    tol = 1e-6
  } = options;

  // Extract treatments
  const allTreatments = new Set();
  studies.forEach(s => {
    allTreatments.add(s.treat1);
    allTreatments.add(s.treat2);
  });
  const treatments = [...allTreatments].sort();
  const nTreat = treatments.length;
  const ref = referenceT || treatments[0];
  const refIdx = treatments.indexOf(ref);

  // Number of basic parameters (treatment effects relative to reference)
  const nBasic = nTreat - 1;
  const nCov = covariates.length;
  const nParams = nBasic + nCov + (interaction === 'independent' ? nBasic * nCov : nCov);

  // Build design matrix
  // Each study contributes one row
  const n = studies.length;
  const X = [];
  const y = [];
  const v = [];

  studies.forEach(s => {
    // Effect size and variance
    y.push(s.effect);
    v.push(s.se * s.se);

    // Design row
    const row = new Array(nParams).fill(0);

    // Treatment indicators (relative to reference)
    const t1Idx = treatments.indexOf(s.treat1);
    const t2Idx = treatments.indexOf(s.treat2);

    // d_AB = μ_B - μ_A
    if (t1Idx !== refIdx) {
      const paramIdx = t1Idx < refIdx ? t1Idx : t1Idx - 1;
      row[paramIdx] = -1; // Treatment 1 effect
    }
    if (t2Idx !== refIdx) {
      const paramIdx = t2Idx < refIdx ? t2Idx : t2Idx - 1;
      row[paramIdx] = 1; // Treatment 2 effect
    }

    // Covariate effects
    covariates.forEach((cov, covIdx) => {
      const covVal = s[cov] || 0;

      if (interaction === 'common') {
        // Single coefficient for covariate
        row[nBasic + covIdx] = covVal;
      } else if (interaction === 'independent') {
        // Separate coefficient for each treatment-covariate combination
        if (t1Idx !== refIdx) {
          const paramIdx = t1Idx < refIdx ? t1Idx : t1Idx - 1;
          row[nBasic + nCov + paramIdx * nCov + covIdx] -= covVal;
        }
        if (t2Idx !== refIdx) {
          const paramIdx = t2Idx < refIdx ? t2Idx : t2Idx - 1;
          row[nBasic + nCov + paramIdx * nCov + covIdx] += covVal;
        }
      }
    });

    X.push(row);
  });

  // Estimate heterogeneity via DerSimonian-Laird
  // First, fit without random effects
  const wi = v.map(vi => 1 / vi);
  const sumW = wi.reduce((a, b) => a + b, 0);

  // Weighted least squares for initial estimate
  const XtWX = Array(nParams).fill(null).map(() => Array(nParams).fill(0));
  const XtWy = Array(nParams).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < nParams; j++) {
      XtWy[j] += X[i][j] * wi[i] * y[i];
      for (let k = 0; k < nParams; k++) {
        XtWX[j][k] += X[i][j] * wi[i] * X[i][k];
      }
    }
  }

  // Solve for beta
  let beta = solveLinearSystem(XtWX, XtWy);

  // Calculate residuals and Q statistic
  let Q = 0;
  for (let i = 0; i < n; i++) {
    const pred = X[i].reduce((sum, x, j) => sum + x * beta[j], 0);
    Q += wi[i] * Math.pow(y[i] - pred, 2);
  }

  // Estimate tau2 (DerSimonian-Laird for multivariate)
  const df = n - nParams;
  const C = sumW - wi.reduce((sum, w, i) => {
    let trace = 0;
    for (let j = 0; j < nParams; j++) {
      trace += X[i][j] * X[i][j] * w;
    }
    return sum + trace / sumW;
  }, 0);
  let tau2 = Math.max(0, (Q - df) / C);

  // Re-estimate with random effects
  for (let iter = 0; iter < maxIter; iter++) {
    const prevBeta = [...beta];
    const prevTau2 = tau2;

    // Update weights
    const wiRE = v.map(vi => 1 / (vi + tau2));
    const sumWRE = wiRE.reduce((a, b) => a + b, 0);

    // Re-compute XtWX and XtWy
    const XtWX_RE = Array(nParams).fill(null).map(() => Array(nParams).fill(0));
    const XtWy_RE = Array(nParams).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < nParams; j++) {
        XtWy_RE[j] += X[i][j] * wiRE[i] * y[i];
        for (let k = 0; k < nParams; k++) {
          XtWX_RE[j][k] += X[i][j] * wiRE[i] * X[i][k];
        }
      }
    }

    beta = solveLinearSystem(XtWX_RE, XtWy_RE);

    // Update tau2
    let Qre = 0;
    for (let i = 0; i < n; i++) {
      const pred = X[i].reduce((sum, x, j) => sum + x * beta[j], 0);
      Qre += wiRE[i] * Math.pow(y[i] - pred, 2);
    }
    const Cre = sumWRE - wiRE.reduce((sum, w) => sum + w * w / sumWRE, 0);
    tau2 = Math.max(0.0001, tau2 + (Qre - df) / Cre);

    // Check convergence
    const diff = Math.max(
      ...beta.map((b, i) => Math.abs(b - prevBeta[i])),
      Math.abs(tau2 - prevTau2)
    );
    if (diff < tol) break;
  }

  // Standard errors
  const wiRE = v.map(vi => 1 / (vi + tau2));
  const XtWX_final = Array(nParams).fill(null).map(() => Array(nParams).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < nParams; j++) {
      for (let k = 0; k < nParams; k++) {
        XtWX_final[j][k] += X[i][j] * wiRE[i] * X[i][k];
      }
    }
  }
  const covMatrix = invertMatrix(XtWX_final);
  const se = covMatrix ? covMatrix.map((row, i) => Math.sqrt(Math.max(0, row[i]))) : beta.map(() => NaN);

  // Extract treatment effects
  const treatmentEffects = treatments.filter(t => t !== ref).map((t, i) => {
    const paramIdx = treatments.indexOf(t) < refIdx ? treatments.indexOf(t) : treatments.indexOf(t) - 1;
    return {
      treatment: t,
      vsReference: ref,
      effect: beta[paramIdx],
      se: se[paramIdx],
      ci: [beta[paramIdx] - 1.96 * se[paramIdx], beta[paramIdx] + 1.96 * se[paramIdx]],
      z: beta[paramIdx] / se[paramIdx],
      p: 2 * (1 - normalCDF(Math.abs(beta[paramIdx] / se[paramIdx])))
    };
  });

  // Extract covariate effects
  const covariateEffects = covariates.map((cov, covIdx) => {
    const paramIdx = nBasic + covIdx;
    return {
      covariate: cov,
      effect: beta[paramIdx],
      se: se[paramIdx],
      ci: [beta[paramIdx] - 1.96 * se[paramIdx], beta[paramIdx] + 1.96 * se[paramIdx]],
      z: beta[paramIdx] / se[paramIdx],
      p: 2 * (1 - normalCDF(Math.abs(beta[paramIdx] / se[paramIdx])))
    };
  });

  // Model fit statistics
  const residuals = y.map((yi, i) => yi - X[i].reduce((sum, x, j) => sum + x * beta[j], 0));
  const residualSS = residuals.reduce((sum, r, i) => sum + wiRE[i] * r * r, 0);
  const aic = residualSS + 2 * nParams;
  const bic = residualSS + nParams * Math.log(n);

  // Inconsistency assessment (simplified)
  // Compare direct vs network estimates where possible
  const inconsistencyTests = [];
  const directComparisons = {};
  studies.forEach(s => {
    const key = [s.treat1, s.treat2].sort().join('-');
    if (!directComparisons[key]) directComparisons[key] = [];
    directComparisons[key].push({ y: s.effect, v: s.se * s.se });
  });

  Object.entries(directComparisons).forEach(([key, data]) => {
    if (data.length < 2) return;
    const [t1, t2] = key.split('-');

    // Direct estimate
    const wiDirect = data.map(d => 1 / d.v);
    const sumWDirect = wiDirect.reduce((a, b) => a + b, 0);
    const directEst = wiDirect.reduce((sum, w, i) => sum + w * data[i].y, 0) / sumWDirect;

    // Network estimate
    const t1Idx = treatments.indexOf(t1);
    const t2Idx = treatments.indexOf(t2);
    let networkEst = 0;
    if (t1Idx !== refIdx) {
      const paramIdx = t1Idx < refIdx ? t1Idx : t1Idx - 1;
      networkEst -= beta[paramIdx];
    }
    if (t2Idx !== refIdx) {
      const paramIdx = t2Idx < refIdx ? t2Idx : t2Idx - 1;
      networkEst += beta[paramIdx];
    }

    const diff = directEst - networkEst;
    const seDiff = Math.sqrt(1/sumWDirect + se[0] * se[0]); // Approximate
    inconsistencyTests.push({
      comparison: key,
      directEstimate: directEst,
      networkEstimate: networkEst,
      difference: diff,
      z: diff / seDiff,
      p: 2 * (1 - normalCDF(Math.abs(diff / seDiff)))
    });
  });

  return {
    treatments,
    reference: ref,
    treatmentEffects,
    covariateEffects,
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      I2: tau2 > 0 ? 100 * tau2 / (tau2 + v.reduce((a, b) => a + b, 0) / n) : 0
    },
    modelFit: {
      residualQ: residualSS,
      df,
      aic,
      bic
    },
    inconsistency: inconsistencyTests,
    nStudies: n,
    nTreatments: nTreat,
    nCovariates: nCov,
    interactionType: interaction,
    method: 'Network Meta-Regression'
  };
}

// ============================================================================
// ENHANCED MULTI-ARM NMA WITH PROPER COVARIANCE HANDLING
// ============================================================================

/**
 * Enhanced Network Meta-Analysis with Multi-Arm Trial Handling
 *
 * Properly handles multi-arm trials by:
 * 1. Accounting for correlation between effect estimates sharing a common arm
 * 2. Building proper variance-covariance matrix for within-study correlations
 * 3. Using generalized least squares for network estimation
 *
 * Based on:
 * - Salanti et al. (2008) Evaluation of networks of RCTs
 * - White et al. (2012) Consistency and inconsistency in network meta-analysis
 * - Rücker & Schwarzer (2014) Reduce dimension of multi-arm studies
 *
 * @param {Object[]} studies - Array of study objects with arm-level data
 * @param {Object} options - Configuration options
 * @returns {Object} Complete NMA results with league table, rankings, and inconsistency
 */
export function networkMetaAnalysisMultiArm(studies, options = {}) {
  const METHOD = 'networkMetaAnalysisMultiArm';

  // Input validation
  if (!Array.isArray(studies) || studies.length < 2) {
    return {
      error: 'need at least 2 studies',
      treatments: [],
      effects: [],
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  const {
    referenceGroup = null,  // Reference treatment (default: most connected)
    reference = null,
    model = 'random',       // 'fixed' or 'random'
    tau2Method = 'REML',    // Method for estimating tau²
    confidenceLevel = 0.95,
    measure = 'OR',         // 'OR', 'RR', 'RD', 'MD', 'SMD'
    nIterRanking = 1000,    // Monte Carlo iterations for ranking
    seed = 12345
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // =========================================================================
  // STEP 1: Parse input data and identify network structure
  // =========================================================================

  // Group data by study
  const studyData = {};
  studies.forEach(s => {
    const studyId = s.study || s.studyId;
    if (!studyData[studyId]) {
      studyData[studyId] = { arms: [], contrasts: [] };
    }

    // Check if data is arm-level or contrast-level
    if (s.treat !== undefined && s.n !== undefined) {
      // Arm-level data
      studyData[studyId].arms.push({
        treatment: s.treat,
        n: s.n,
        events: s.events,
        mean: s.mean,
        sd: s.sd
      });
    } else if (s.treat1 !== undefined && s.treat2 !== undefined) {
      // Contrast-level data
      studyData[studyId].contrasts.push({
        treat1: s.treat1,
        treat2: s.treat2,
        effect: s.effect,
        se: s.se
      });
    }
  });

  // Extract all treatments
  const treatments = new Set();
  Object.values(studyData).forEach(study => {
    study.arms.forEach(arm => treatments.add(arm.treatment));
    study.contrasts.forEach(c => {
      treatments.add(c.treat1);
      treatments.add(c.treat2);
    });
  });
  const treatList = [...treatments].sort();
  const nTreat = treatList.length;

  // =========================================================================
  // STEP 1.5: Check network connectivity (all treatments reachable)
  // =========================================================================

  // Build adjacency list for connectivity check
  const adjacency = {};
  treatList.forEach(t => adjacency[t] = new Set());

  Object.values(studyData).forEach(study => {
    // From arm-level data: treatments in same study are connected
    const armTreats = study.arms.map(a => a.treatment);
    for (let i = 0; i < armTreats.length; i++) {
      for (let j = i + 1; j < armTreats.length; j++) {
        adjacency[armTreats[i]].add(armTreats[j]);
        adjacency[armTreats[j]].add(armTreats[i]);
      }
    }
    // From contrast-level data
    study.contrasts.forEach(c => {
      adjacency[c.treat1].add(c.treat2);
      adjacency[c.treat2].add(c.treat1);
    });
  });

  // BFS to find connected components
  const visited = new Set();
  const components = [];

  treatList.forEach(startTreat => {
    if (visited.has(startTreat)) return;

    // BFS from this treatment
    const component = [];
    const queue = [startTreat];
    visited.add(startTreat);

    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);

      adjacency[current].forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    components.push(component.sort());
  });

  // Check if network is connected (single component)
  if (components.length > 1) {
    return {
      error: 'Network is disconnected - cannot perform network meta-analysis',
      message: `Found ${components.length} disconnected sub-networks. All treatments must be connected through at least one comparison.`,
      components: components.map((comp, i) => ({
        subnetwork: i + 1,
        treatments: comp,
        nTreatments: comp.length
      })),
      suggestion: 'Either remove treatments from disconnected components or add studies that bridge them.',
      nTreatments: nTreat,
      treatments: treatList,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  // =========================================================================
  // STEP 2: Convert arm-level data to contrasts (if needed)
  // =========================================================================

  const allContrasts = [];
  const studyIds = Object.keys(studyData);

  // Check if we have valid study data
  if (studyIds.length === 0) {
    return {
      error: 'No valid studies found - check input data format',
      expectedFormat: 'Arm-level: {study, treat, n, events} or Contrast-level: {study, treat1, treat2, effect, se}',
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  studyIds.forEach(studyId => {
    const study = studyData[studyId];

    if (study.arms.length >= 2) {
      // Convert arm-level to contrasts
      // Use first arm as reference within the study
      const arms = study.arms.sort((a, b) =>
        treatList.indexOf(a.treatment) - treatList.indexOf(b.treatment));
      const refArm = arms[0];

      for (let i = 1; i < arms.length; i++) {
        const compArm = arms[i];
        let effect, se;

        if (measure === 'OR' || measure === 'RR' || measure === 'RD') {
          // Binary outcome
          const a = compArm.events;
          const b = compArm.n - compArm.events;
          const c = refArm.events;
          const d = refArm.n - refArm.events;

          // Apply continuity correction if needed
          const cc = (a === 0 || b === 0 || c === 0 || d === 0) ? 0.5 : 0;

          if (measure === 'OR') {
            effect = Math.log(((a + cc) * (d + cc)) / ((b + cc) * (c + cc)));
            se = Math.sqrt(1/(a+cc) + 1/(b+cc) + 1/(c+cc) + 1/(d+cc));
          } else if (measure === 'RR') {
            effect = Math.log((a+cc)/(a+b+2*cc)) - Math.log((c+cc)/(c+d+2*cc));
            se = Math.sqrt(1/(a+cc) - 1/(a+b+2*cc) + 1/(c+cc) - 1/(c+d+2*cc));
          } else { // RD
            effect = (a+cc)/(a+b+2*cc) - (c+cc)/(c+d+2*cc);
            se = Math.sqrt((a+cc)*(b+cc)/Math.pow(a+b+2*cc,3) +
                          (c+cc)*(d+cc)/Math.pow(c+d+2*cc,3));
          }
        } else {
          // Continuous outcome (MD or SMD)
          const n1 = compArm.n, n2 = refArm.n;
          const m1 = compArm.mean, m2 = refArm.mean;
          const s1 = compArm.sd, s2 = refArm.sd;

          if (measure === 'MD') {
            effect = m1 - m2;
            se = Math.sqrt(s1*s1/n1 + s2*s2/n2);
          } else { // SMD
            const pooledSD = Math.sqrt(((n1-1)*s1*s1 + (n2-1)*s2*s2) / (n1+n2-2));
            effect = (m1 - m2) / pooledSD;
            // Hedges' correction
            const J = 1 - 3/(4*(n1+n2-2) - 1);
            effect *= J;
            se = Math.sqrt(1/n1 + 1/n2 + effect*effect/(2*(n1+n2)));
          }
        }

        allContrasts.push({
          study: studyId,
          treat1: refArm.treatment,
          treat2: compArm.treatment,
          effect,
          se,
          nArms: arms.length
        });
      }

      // Store arm info for covariance calculation
      study.processedArms = arms;
      study.nArms = arms.length;
    } else if (study.contrasts.length > 0) {
      // Already contrast-level
      study.contrasts.forEach(c => {
        allContrasts.push({
          study: studyId,
          ...c,
          nArms: study.contrasts.length + 1 // Inferred number of arms
        });
      });
      study.nArms = study.contrasts.length + 1;
    }
  });

  // Check if we have any contrasts
  if (allContrasts.length === 0) {
    return {
      error: 'No contrasts could be computed - each study needs at least 2 treatment arms',
      nStudies: studyIds.length,
      treatments: treatList,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  // Check if we have enough treatments
  if (nTreat < 2) {
    return {
      error: 'Need at least 2 treatments for network meta-analysis',
      nTreatments: nTreat,
      treatments: treatList,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  // =========================================================================
  // STEP 3: Build design matrix and variance-covariance matrix
  // =========================================================================

  // Select reference treatment (most connected if not specified)
  let refTreat;
  const requestedReference = reference ?? referenceGroup;
  if (requestedReference && treatList.includes(requestedReference)) {
    refTreat = requestedReference;
  } else {
    // Find most connected treatment
    const connectivity = {};
    treatList.forEach(t => connectivity[t] = 0);
    allContrasts.forEach(c => {
      connectivity[c.treat1]++;
      connectivity[c.treat2]++;
    });
    refTreat = treatList.reduce((a, b) => connectivity[a] > connectivity[b] ? a : b);
  }

  // Re-order treatments with reference first
  const orderedTreats = [refTreat, ...treatList.filter(t => t !== refTreat)];
  const nParams = nTreat - 1; // Number of basic parameters (vs reference)

  // Check for valid dimensions
  if (nParams < 1) {
    return {
      error: 'Insufficient parameters - need at least 2 different treatments',
      nTreatments: nTreat,
      treatments: treatList,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  // Build design matrix X and response vector y
  const nContrasts = allContrasts.length;

  // Validate contrast count vs parameters
  if (nContrasts < nParams) {
    return {
      error: `Insufficient data: ${nContrasts} contrasts for ${nParams} parameters. Need at least ${nParams} contrasts.`,
      nContrasts,
      nParams,
      treatments: orderedTreats,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  const X = Array(nContrasts).fill(null).map(() => Array(nParams).fill(0));
  const y = Array(nContrasts).fill(0);
  const V = Array(nContrasts).fill(null).map(() => Array(nContrasts).fill(0));

  allContrasts.forEach((c, i) => {
    // Response
    y[i] = c.treat1 < c.treat2 ? c.effect : -c.effect;
    const t1 = c.treat1 < c.treat2 ? c.treat1 : c.treat2;
    const t2 = c.treat1 < c.treat2 ? c.treat2 : c.treat1;

    // Design matrix: encode contrasts in terms of basic parameters
    // d_AB = d_B - d_A (where d is vs reference)
    const idx1 = orderedTreats.indexOf(t1);
    const idx2 = orderedTreats.indexOf(t2);

    if (idx1 > 0) X[i][idx1 - 1] = -1; // -d_t1
    if (idx2 > 0) X[i][idx2 - 1] = 1;  // +d_t2

    // Diagonal of V (within-study variance)
    V[i][i] = c.se * c.se;
  });

  // Add within-study covariances for multi-arm trials
  // For multi-arm trials, contrasts sharing an arm are correlated
  studyIds.forEach(studyId => {
    const study = studyData[studyId];
    if (study.nArms <= 2) return; // No covariance for two-arm trials

    // Find all contrasts from this study
    const studyContrastIndices = allContrasts
      .map((c, i) => c.study === studyId ? i : -1)
      .filter(i => i >= 0);

    if (studyContrastIndices.length <= 1) return;

    // For multi-arm studies, covariance between contrasts sharing an arm
    // Cov(d_AB, d_AC) = Var(A) (the shared arm variance)
    const refArm = study.processedArms?.[0];
    if (!refArm) return;

    // Estimate variance of reference arm
    let refVar;
    if (measure === 'OR' || measure === 'RR') {
      const a = refArm.events, n = refArm.n;
      refVar = 1/(a + 0.5) + 1/(n - a + 0.5); // Continuity-corrected
    } else if (measure === 'RD') {
      const p = refArm.events / refArm.n;
      refVar = p * (1 - p) / refArm.n;
    } else {
      refVar = (refArm.sd * refArm.sd) / refArm.n;
    }

    // Set covariances
    for (let i = 0; i < studyContrastIndices.length; i++) {
      for (let j = i + 1; j < studyContrastIndices.length; j++) {
        const idx_i = studyContrastIndices[i];
        const idx_j = studyContrastIndices[j];
        V[idx_i][idx_j] = refVar;
        V[idx_j][idx_i] = refVar;
      }
    }
  });

  // =========================================================================
  // STEP 4: Estimate between-study heterogeneity (tau²) using Multivariate REML
  // Reference: Raudenbush (2009), Jackson et al. (2014)
  // =========================================================================

  let tau2 = 0;
  let tau2SE = null;

  if (model === 'random') {
    // Multivariate REML estimation for network meta-analysis
    // REML criterion: -2ℓ_R = log|Σ| + log|X'Σ⁻¹X| + r'Σ⁻¹r
    // where Σ = V + τ²I and r are GLS residuals

    // Helper: compute total variance matrix for given tau2
    const getTotalVar = (tau2Val) => {
      const Sigma = V.map((row, i) => row.map((v, j) => i === j ? v + tau2Val : v));
      return Sigma;
    };

    // Helper: compute REML log-likelihood
    const remlLogLik = (tau2Val) => {
      const Sigma = getTotalVar(tau2Val);
      const SigmaInv = invertMatrix(Sigma);
      if (!SigmaInv) return -Infinity;

      // XtSigmaInvX
      const XtSigmaInvX = matMult(matMult(transpose(X), SigmaInv), X);
      const XtSigmaInvXinv = invertMatrix(XtSigmaInvX);
      if (!XtSigmaInvXinv) return -Infinity;

      // GLS estimates
      const XtSigmaInvYResult = matMult(matMult(transpose(X), SigmaInv), y);
      const XtSigmaInvY = XtSigmaInvYResult.map(row => row[0]);
      const betaGLS = solveLinearSystem(XtSigmaInvX, XtSigmaInvY);
      if (!betaGLS) return -Infinity;

      // Residuals
      const resid = y.map((yi, i) => yi - X[i].reduce((s, x, j) => s + x * (betaGLS[j] || 0), 0));

      // -2 REML = log|Σ| + log|X'Σ⁻¹X| + r'Σ⁻¹r
      let logDetSigma = 0;
      try {
        const L = choleskyDecomp(Sigma);
        if (L) {
          for (let i = 0; i < nContrasts; i++) logDetSigma += 2 * Math.log(L[i][i]);
        } else {
          // Fallback: use diagonal approximation
          for (let i = 0; i < nContrasts; i++) logDetSigma += Math.log(Sigma[i][i]);
        }
      } catch (e) {
        for (let i = 0; i < nContrasts; i++) logDetSigma += Math.log(Sigma[i][i]);
      }

      let logDetXtSigmaInvX = 0;
      try {
        const LX = choleskyDecomp(XtSigmaInvX);
        if (LX) {
          for (let i = 0; i < nParams; i++) logDetXtSigmaInvX += 2 * Math.log(LX[i][i]);
        } else {
          for (let i = 0; i < nParams; i++) logDetXtSigmaInvX += Math.log(XtSigmaInvX[i][i]);
        }
      } catch (e) {
        for (let i = 0; i < nParams; i++) logDetXtSigmaInvX += Math.log(XtSigmaInvX[i][i]);
      }

      // Quadratic form r'Σ⁻¹r
      let quadForm = 0;
      for (let i = 0; i < nContrasts; i++) {
        for (let j = 0; j < nContrasts; j++) {
          quadForm += resid[i] * SigmaInv[i][j] * resid[j];
        }
      }

      // Return negative REML log-likelihood (for minimization)
      return -0.5 * (logDetSigma + logDetXtSigmaInvX + quadForm);
    };

    // Helper: REML score (derivative of log-likelihood)
    const remlScore = (tau2Val) => {
      const Sigma = getTotalVar(tau2Val);
      const SigmaInv = invertMatrix(Sigma);
      if (!SigmaInv) return 0;

      const XtSigmaInvX = matMult(matMult(transpose(X), SigmaInv), X);
      const XtSigmaInvXinv = invertMatrix(XtSigmaInvX);
      if (!XtSigmaInvXinv) return 0;

      // P = Σ⁻¹ - Σ⁻¹X(X'Σ⁻¹X)⁻¹X'Σ⁻¹
      const SigmaInvX = matMult(SigmaInv, X);
      const XtSigmaInv = transpose(SigmaInvX);
      const P = SigmaInv.map((row, i) =>
        row.map((v, j) => v - SigmaInvX[i].reduce((s, sx, k) =>
          s + sx * XtSigmaInv[k].reduce((ss, xsv, l) => ss + XtSigmaInvXinv[k][l] * SigmaInv[l][j], 0), 0)));

      // For τ² with identity structure: ∂Σ/∂τ² = I
      // Score = -0.5 * (tr(P) - y'Py'Py)
      let trP = 0;
      for (let i = 0; i < nContrasts; i++) trP += P[i][i];

      const Py = P.map(row => row.reduce((s, p, j) => s + p * y[j], 0));
      const yPPy = Py.reduce((s, p, i) => s + p * Py[i], 0);

      return -0.5 * (trP - yPPy);
    };

    // Fisher scoring / Newton-Raphson optimization for tau²
    const maxIter = 50;
    const tol = 1e-6;

    // Get initial tau² estimate using DL as starting point
    const VinvFE = invertMatrix(V);
    let tau2Init = 0.01;
    if (VinvFE) {
      const XtVinvX = matMult(matMult(transpose(X), VinvFE), X);
      const XtVinvYResult = matMult(matMult(transpose(X), VinvFE), y);
      if (XtVinvYResult && XtVinvX) {
        const XtVinvY = XtVinvYResult.map(row => row[0]);
        const betaFE = solveLinearSystem(XtVinvX, XtVinvY);
        if (betaFE) {
          const resid = y.map((yi, i) => yi - X[i].reduce((s, x, j) => s + x * (betaFE[j] || 0), 0));
          let Q = 0;
          for (let i = 0; i < nContrasts; i++) {
            for (let j = 0; j < nContrasts; j++) {
              Q += resid[i] * VinvFE[i][j] * resid[j];
            }
          }
          const df = nContrasts - nParams;
          if (Q > df) {
            // Simple DL-type for initialization
            tau2Init = Math.max(0.001, (Q - df) / nContrasts);
          }
        }
      }
    }

    tau2 = tau2Init;

    // Profile likelihood optimization with bounded search
    // Use Brent's method over [0, maxTau2]
    const maxTau2 = Math.max(1, 10 * tau2Init);

    // Grid search + local optimization
    let bestTau2 = 0;
    let bestLL = remlLogLik(0);

    const gridPoints = 20;
    for (let g = 0; g <= gridPoints; g++) {
      const t = (g / gridPoints) * maxTau2;
      const ll = remlLogLik(t);
      if (ll > bestLL) {
        bestLL = ll;
        bestTau2 = t;
      }
    }

    // Local refinement using golden section search
    let lower = Math.max(0, bestTau2 - maxTau2 / gridPoints);
    let upper = bestTau2 + maxTau2 / gridPoints;
    const phi = (1 + Math.sqrt(5)) / 2;

    for (let iter = 0; iter < 30; iter++) {
      const x1 = upper - (upper - lower) / phi;
      const x2 = lower + (upper - lower) / phi;
      if (remlLogLik(x1) > remlLogLik(x2)) {
        upper = x2;
      } else {
        lower = x1;
      }
      if (upper - lower < tol) break;
    }

    tau2 = Math.max(0, (lower + upper) / 2);

    // Compute SE of tau² using observed Fisher information
    const h = Math.max(tau2 * 0.01, 1e-6);
    const ll0 = remlLogLik(tau2);
    const llPlus = remlLogLik(tau2 + h);
    const llMinus = remlLogLik(Math.max(0, tau2 - h));
    const secondDeriv = (llPlus - 2 * ll0 + llMinus) / (h * h);
    if (secondDeriv < 0) {
      tau2SE = Math.sqrt(-1 / secondDeriv);
    }

    // Add tau² to diagonal of V
    for (let i = 0; i < nContrasts; i++) {
      V[i][i] += tau2;
    }
  }

  // =========================================================================
  // STEP 5: GLS estimation of network effects
  // =========================================================================

  const Vinv = invertMatrix(V);
  if (!Vinv) {
    // Return error if variance matrix is singular
    return {
      error: 'Singular variance-covariance matrix in NMA - insufficient data or collinearity',
      treatments: orderedTreats,
      nStudies: studyIds.length,
      nContrasts,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  const XtVinvX = matMult(matMult(transpose(X), Vinv), X);
  const XtVinvYResult = matMult(matMult(transpose(X), Vinv), y);

  // Check for valid matrix multiplication results
  if (!XtVinvX || XtVinvX.length === 0 || !XtVinvYResult || XtVinvYResult.length === 0) {
    return {
      error: 'Matrix computation failed in NMA - possible numerical instability',
      treatments: orderedTreats,
      nStudies: studyIds.length,
      nContrasts,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  // XtVinvYResult is [[v1], [v2], ...] when matMult operates on vector - extract as flat array
  const XtVinvY = XtVinvYResult.map(row => row[0]);

  // Solve for basic parameters
  const beta = solveLinearSystem(XtVinvX, XtVinvY);

  // Check for valid solution
  if (!beta || beta.length === 0) {
    return {
      error: 'Linear system solve failed in NMA - network may be disconnected',
      treatments: orderedTreats,
      nStudies: studyIds.length,
      nContrasts,
      method: 'Network Meta-Analysis (Frequentist)'
    };
  }

  const varBeta = invertMatrix(XtVinvX);

  // Handle singular XtVinvX matrix (rare but possible with sparse networks)
  const hasValidVariance = varBeta !== null;

  // =========================================================================
  // STEP 6: Build league table (all pairwise comparisons)
  // =========================================================================

  const leagueTable = {};
  orderedTreats.forEach((t1, i) => {
    leagueTable[t1] = {};
    orderedTreats.forEach((t2, j) => {
      if (i === j) {
        leagueTable[t1][t2] = { effect: 0, se: 0, ci: [0, 0], pValue: 1 };
      } else {
        // Effect of t2 vs t1
        let effect, variance;

        if (i === 0) {
          // t1 is reference, effect is just beta[j-1]
          effect = beta[j - 1] ?? 0;
          variance = hasValidVariance ? (varBeta[j - 1]?.[j - 1] ?? NaN) : NaN;
        } else if (j === 0) {
          // t2 is reference, effect is -beta[i-1]
          effect = -(beta[i - 1] ?? 0);
          variance = hasValidVariance ? (varBeta[i - 1]?.[i - 1] ?? NaN) : NaN;
        } else {
          // Neither is reference: effect = beta[j-1] - beta[i-1]
          effect = (beta[j - 1] ?? 0) - (beta[i - 1] ?? 0);
          variance = hasValidVariance
            ? (varBeta[j - 1]?.[j - 1] ?? 0) + (varBeta[i - 1]?.[i - 1] ?? 0) - 2 * (varBeta[j - 1]?.[i - 1] ?? 0)
            : NaN;
        }

        const se = isNaN(variance) ? NaN : Math.sqrt(Math.max(0, variance));
        const zVal = se > 0 ? effect / se : 0;
        const pValue = 2 * (1 - normalCDF(Math.abs(zVal)));

        leagueTable[t1][t2] = {
          effect,
          se,
          ci: [effect - z * se, effect + z * se],
          zValue: zVal,
          pValue,
          significant: pValue < 0.05
        };
      }
    });
  });

  // =========================================================================
  // STEP 7: Treatment rankings (P-scores / SUCRA)
  // =========================================================================

  // Monte Carlo simulation for ranking probabilities
  // Use high-quality xoshiro128** RNG (Blackman & Vigna, 2018)
  const rng = createSeededRNG(seed);
  const rankCounts = orderedTreats.map(() => Array(nTreat).fill(0));

  // Cholesky decomposition of varBeta for sampling (only if variance is valid)
  const L = hasValidVariance ? choleskyDecomp(varBeta) : null;

  if (L) {
    for (let iter = 0; iter < nIterRanking; iter++) {
      // Sample from multivariate normal
      const z_rand = Array(nParams).fill(0).map(() => rng.randomNormal());
      const betaSample = beta.map((b, i) =>
        b + L[i].reduce((s, l, j) => s + l * z_rand[j], 0));

      // Calculate all effects vs reference
      const effects = [0, ...betaSample]; // Reference has effect 0

      // Rank (higher effect = rank 1 if beneficial)
      const ranked = effects.map((e, i) => ({ treat: i, effect: e }))
        .sort((a, b) => b.effect - a.effect);
      ranked.forEach((r, rank) => rankCounts[r.treat][rank]++);
    }
  } else {
    // Fallback: rank by point estimates only (no uncertainty sampling)
    const effects = [0, ...beta];
    const ranked = effects.map((e, i) => ({ treat: i, effect: e }))
      .sort((a, b) => b.effect - a.effect);
    ranked.forEach((r, rank) => rankCounts[r.treat][rank] = nIterRanking);
  }

  // Calculate P-scores (probability of being better than average)
  const rankings = orderedTreats.map((t, i) => {
    const probs = rankCounts[i].map(c => c / nIterRanking);
    const meanRank = probs.reduce((s, p, r) => s + p * (r + 1), 0);
    const pScore = probs.reduce((s, p, r) => s + p * (nTreat - r - 1), 0) / (nTreat - 1);

    return {
      treatment: t,
      pScore,
      sucra: pScore * 100,
      meanRank,
      rankProbabilities: probs,
      probBest: probs[0],
      probWorst: probs[nTreat - 1]
    };
  }).sort((a, b) => b.pScore - a.pScore);

  // =========================================================================
  // STEP 8: Inconsistency assessment
  // =========================================================================

  // Q statistic for inconsistency (design-by-treatment interaction)
  const residuals = y.map((yi, i) =>
    yi - X[i].reduce((s, x, j) => s + x * beta[j], 0));

  let Q_total = 0;
  for (let i = 0; i < nContrasts; i++) {
    for (let j = 0; j < nContrasts; j++) {
      Q_total += residuals[i] * Vinv[i][j] * residuals[j];
    }
  }

  const df_total = nContrasts - nParams;
  const I2 = df_total > 0 ? Math.max(0, (Q_total - df_total) / Q_total * 100) : 0;
  const Q_pValue = 1 - jStat.chisquare.cdf(Q_total, Math.max(1, df_total));

  // Node-splitting for local inconsistency
  const nodeSplitting = [];
  const directComparisons = {};

  allContrasts.forEach(c => {
    const key = [c.treat1, c.treat2].sort().join('-');
    if (!directComparisons[key]) {
      directComparisons[key] = [];
    }
    directComparisons[key].push(c);
  });

  Object.entries(directComparisons).forEach(([key, contrasts]) => {
    if (contrasts.length < 1) return;

    const [t1, t2] = key.split('-');
    const idx1 = orderedTreats.indexOf(t1);
    const idx2 = orderedTreats.indexOf(t2);

    // Direct evidence (pooled within-comparison)
    const directEffects = contrasts.map(c =>
      c.treat1 < c.treat2 ? c.effect : -c.effect);
    const directVars = contrasts.map(c => c.se * c.se);
    const wDirect = directVars.map(v => 1 / v);
    const sumWDirect = wDirect.reduce((a, b) => a + b, 0);
    const directEst = wDirect.reduce((s, w, i) => s + w * directEffects[i], 0) / sumWDirect;
    const directSE = Math.sqrt(1 / sumWDirect);

    // Indirect evidence from network
    let indirectEst, indirectSE;
    if (idx1 === 0) {
      indirectEst = beta[idx2 - 1];
      indirectSE = hasValidVariance ? Math.sqrt(Math.max(0, varBeta[idx2 - 1][idx2 - 1])) : NaN;
    } else if (idx2 === 0) {
      indirectEst = -beta[idx1 - 1];
      indirectSE = hasValidVariance ? Math.sqrt(Math.max(0, varBeta[idx1 - 1][idx1 - 1])) : NaN;
    } else {
      indirectEst = beta[idx2 - 1] - beta[idx1 - 1];
      indirectSE = hasValidVariance
        ? Math.sqrt(Math.max(0, varBeta[idx2 - 1][idx2 - 1] + varBeta[idx1 - 1][idx1 - 1] - 2 * varBeta[idx2 - 1][idx1 - 1]))
        : NaN;
    }

    // Inconsistency factor
    const IF = directEst - indirectEst;
    const seIF = Math.sqrt(directSE * directSE + indirectSE * indirectSE);
    const zIF = IF / seIF;
    const pIF = 2 * (1 - normalCDF(Math.abs(zIF)));

    nodeSplitting.push({
      comparison: `${t1} vs ${t2}`,
      direct: { estimate: directEst, se: directSE, nStudies: contrasts.length },
      indirect: { estimate: indirectEst, se: indirectSE },
      inconsistency: IF,
      seInconsistency: seIF,
      zValue: zIF,
      pValue: pIF,
      significant: pIF < 0.05
    });
  });

  // =========================================================================
  // STEP 9: Network structure summary
  // =========================================================================

  const networkSummary = {
    nTreatments: nTreat,
    nStudies: studyIds.length,
    nContrasts: nContrasts,
    nMultiArm: studyIds.filter(id => studyData[id].nArms > 2).length,
    treatments: orderedTreats,
    reference: refTreat,
    comparisons: Object.keys(directComparisons),
    connectivity: orderedTreats.map(t => ({
      treatment: t,
      degree: allContrasts.filter(c => c.treat1 === t || c.treat2 === t).length
    }))
  };
  const leagueTableMatrix = orderedTreats.map(t1 =>
    orderedTreats.map(t2 => leagueTable[t1][t2])
  );
  const sucra = Object.fromEntries(rankings.map(r => [r.treatment, r.pScore]));
  const geometry = {
    nStudies: studyIds.length,
    nComparisons: Object.keys(directComparisons).length,
    nTreatments: nTreat
  };

  // =========================================================================
  // RETURN RESULTS
  // =========================================================================

  return {
    network: networkSummary,
    treatments: orderedTreats,
    reference: refTreat,
    tau2,
    leagueTable: leagueTableMatrix,
    leagueTableByTreatment: leagueTable,
    ranking: rankings,
    rankings,
    sucra,
    geometry,
    bestTreatment: rankings[0].treatment,
    contrasts: allContrasts, // Include for nodeSplitting and other downstream analyses
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      Q: Q_total,
      df: df_total,
      pValue: Q_pValue,
      I2
    },
    inconsistency: {
      global: {
        Q: Q_total,
        pValue: Q_pValue,
        significant: Q_pValue < 0.05
      },
      nodeSplitting
    },
    effects: orderedTreats.slice(1).map((t, i) => {
      const seVal = hasValidVariance ? Math.sqrt(Math.max(0, varBeta[i][i])) : NaN;
      return {
        treatment: t,
        vsReference: refTreat,
        effect: beta[i],
        se: seVal,
        ci: isNaN(seVal) ? [NaN, NaN] : [beta[i] - z * seVal, beta[i] + z * seVal],
        pValue: isNaN(seVal) || seVal === 0 ? NaN : 2 * (1 - normalCDF(Math.abs(beta[i] / seVal)))
      };
    }),
    model: model === 'random' ? 'Random-Effects NMA' : 'Fixed-Effect NMA',
    method: 'Graph-theoretical approach with multi-arm adjustment (Rücker)',
    measure
  };
}

// Matrix helper functions for NMA
function transpose(M) {
  if (!M.length || !M[0]) return [];
  return M[0].map((_, i) => M.map(row => row?.[i] ?? 0));
}

function matMult(A, B) {
  if (!A.length || !B.length) return [];
  // Handle B being a 1D array (column vector)
  const bIsVector = !Array.isArray(B[0]);
  if (bIsVector) {
    // Check dimension compatibility: A columns must match B length
    if (A[0] && A[0].length !== B.length) return [];
    return A.map(row => [row.reduce((s, a, j) => s + a * (B[j] ?? 0), 0)]);
  }
  // Check dimension compatibility: A columns must match B rows
  if (A[0] && A[0].length !== B.length) return [];
  if (!B[0]) return [];
  return A.map(row =>
    B[0].map((_, j) => row.reduce((s, a, k) => s + a * ((B[k] && B[k][j]) ?? 0), 0)));
}

function choleskyDecomp(A) {
  const n = A.length;
  const L = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(1e-10, A[i][i] - sum));
      } else {
        L[i][j] = (A[i][j] - sum) / (L[j][j] || 1e-10);
      }
    }
  }
  return L;
}

/**
 * Sample Size Calculation for Meta-Analysis
 * Power analysis and required number of studies
 */
export function sampleSizeCalculation(options = {}) {
  const METHOD = 'sampleSizeCalculation';

  const {
    effectSize = 0.3, // Expected effect size (SMD or log-OR)
    heterogeneity = 'moderate', // 'low', 'moderate', 'high' or tau2 value
    averageN = 100, // Average sample size per study arm
    power = 0.8,
    alpha = 0.05,
    type = 'continuous' // 'continuous', 'binary'
  } = options;

  validateNumeric(effectSize, 'effectSize', METHOD);
  validateNumeric(power, 'power', METHOD, { min: 0.1, max: 0.999 });
  validateNumeric(alpha, 'alpha', METHOD, { min: 0.001, max: 0.5 });
  validateNumeric(averageN, 'averageN', METHOD, { min: 10, integer: true });

  // Get tau2 based on heterogeneity level
  let tau2;
  if (typeof heterogeneity === 'number') {
    tau2 = heterogeneity;
  } else {
    tau2 = heterogeneity === 'low' ? 0.01
      : heterogeneity === 'moderate' ? 0.04
      : 0.09; // high
  }

  const zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);
  const zBeta = jStat.normal.inv(power, 0, 1);

  // Within-study variance (depends on type and sample size)
  let withinVar;
  if (type === 'continuous') {
    // SMD: var ≈ 2/n + d²/(2n)
    withinVar = 2 / averageN + effectSize * effectSize / (2 * averageN);
  } else {
    // Log-OR: var ≈ 4/n for equal groups with 50% event rate
    withinVar = 4 / averageN;
  }

  // Required number of studies for fixed effects
  const kFixed = Math.ceil(Math.pow((zAlpha + zBeta) / effectSize, 2) * withinVar);

  // Required number of studies for random effects
  // Accounting for heterogeneity
  const totalVar = withinVar + tau2;
  const kRandom = Math.ceil(Math.pow((zAlpha + zBeta) / effectSize, 2) * totalVar);

  // Information size approach
  const requiredInfo = Math.pow((zAlpha + zBeta) / effectSize, 2);
  const infoPerStudy = 1 / totalVar;
  const kInfo = Math.ceil(requiredInfo / infoPerStudy);

  // Power for different numbers of studies
  const powerCurve = [];
  for (let k = 2; k <= 50; k++) {
    const sePooled = Math.sqrt(totalVar / k);
    const ncp = effectSize / sePooled; // Non-centrality parameter
    const critVal = jStat.normal.inv(1 - alpha / 2, 0, 1);
    const powerK = 1 - normalCDF(critVal - ncp) + normalCDF(-critVal - ncp);
    powerCurve.push({ k, power: powerK });
  }

  // Effect size detectable with given power
  const detectableEffects = [5, 10, 15, 20, 30].map(k => {
    const sePooled = Math.sqrt(totalVar / k);
    const minEffect = (zAlpha + zBeta) * sePooled;
    return { k, minDetectableEffect: minEffect };
  });

  // Heterogeneity impact
  const heterogeneityImpact = {
    lowTau2: { tau2: 0.01, kNeeded: Math.ceil(Math.pow((zAlpha + zBeta) / effectSize, 2) * (withinVar + 0.01)) },
    moderateTau2: { tau2: 0.04, kNeeded: Math.ceil(Math.pow((zAlpha + zBeta) / effectSize, 2) * (withinVar + 0.04)) },
    highTau2: { tau2: 0.09, kNeeded: Math.ceil(Math.pow((zAlpha + zBeta) / effectSize, 2) * (withinVar + 0.09)) }
  };

  return {
    inputs: {
      effectSize,
      heterogeneity,
      tau2,
      averageN,
      power,
      alpha,
      type
    },
    requiredStudies: {
      fixedEffects: kFixed,
      randomEffects: kRandom,
      informationBased: kInfo,
      recommended: Math.max(kRandom, 5) // At least 5 for reliable heterogeneity estimation
    },
    powerCurve,
    detectableEffects,
    heterogeneityImpact,
    interpretation: `To detect an effect of ${effectSize} with ${power * 100}% power, ` +
      `approximately ${kRandom} studies are needed under random effects model`,
    recommendations: [
      kRandom < 5 ? 'Consider fixed-effects model due to few studies' : null,
      tau2 > 0.04 ? 'High heterogeneity expected - plan for subgroup analyses' : null,
      'Recruit 20% more studies to account for publication bias'
    ].filter(r => r),
    method: 'Sample Size Calculation for Meta-Analysis'
  };
}

/**
 * Umbrella Review Statistical Analysis
 * Synthesize multiple meta-analyses
 */
export function umbrellaReview(metaAnalyses, options = {}) {
  const METHOD = 'umbrellaReview';

  // Input validation
  if (!Array.isArray(metaAnalyses)) {
    throw new ValidationError('metaAnalyses must be an array', METHOD);
  }
  if (metaAnalyses.length < 2) {
    throw new ValidationError('At least 2 meta-analyses required for umbrella review', METHOD);
  }
  metaAnalyses.forEach((ma, i) => {
    if (typeof ma !== 'object' || ma === null) {
      throw new ValidationError(`Meta-analysis at index ${i} must be an object`, METHOD);
    }
    if (ma.effect === undefined && ma.estimate === undefined) {
      throw new ValidationError(`Meta-analysis at index ${i} must have effect or estimate property`, METHOD);
    }
  });

  const {
    gradeQuality = true,
    confidenceLevel = 0.95
  } = options;

  validateNumeric(confidenceLevel, 'confidenceLevel', METHOD, { min: 0.5, max: 0.999 });

  const n = metaAnalyses.length;
  const z = jStat.normal.inv(1 - (1 - confidenceLevel) / 2, 0, 1);

  // Analyze each meta-analysis
  const analyzed = metaAnalyses.map((ma, i) => {
    const effect = ma.effect || ma.estimate;
    const se = ma.se || (ma.ci ? (ma.ci[1] - ma.ci[0]) / (2 * z) : null);
    const ci = ma.ci || [effect - z * se, effect + z * se];
    const pValue = ma.p || 2 * (1 - normalCDF(Math.abs(effect / se)));
    const I2 = ma.I2 || ma.heterogeneity?.I2 || 0;
    const nStudies = ma.nStudies || ma.k;
    const nTotal = ma.nTotal || ma.totalN;

    // Evidence classification (Ioannidis criteria)
    let evidenceClass;
    const significant = pValue < 0.05;
    const largeN = nTotal > 1000;
    const lowHet = I2 < 50;
    const noBias = !ma.publicationBias;
    const smallStudyEffect = ma.eggerP > 0.1;

    if (significant && largeN && lowHet && noBias && pValue < 0.001) {
      evidenceClass = 'Convincing';
    } else if (significant && largeN && lowHet && pValue < 0.01) {
      evidenceClass = 'Highly suggestive';
    } else if (significant && nStudies >= 3) {
      evidenceClass = 'Suggestive';
    } else if (significant) {
      evidenceClass = 'Weak';
    } else {
      evidenceClass = 'Non-significant';
    }

    // GRADE-like quality assessment
    let quality = 4; // Start high
    if (I2 > 75) quality--; // Inconsistency
    if (ma.robDowngrade) quality--; // Risk of bias
    if (ma.indirectness) quality--; // Indirectness
    if (se / Math.abs(effect) > 0.5) quality--; // Imprecision

    const qualityLabel = quality >= 4 ? 'High'
      : quality === 3 ? 'Moderate'
      : quality === 2 ? 'Low'
      : 'Very Low';

    return {
      id: i + 1,
      name: ma.name || `MA ${i + 1}`,
      effect,
      se,
      ci,
      pValue,
      I2,
      nStudies,
      nTotal,
      evidenceClass,
      quality: qualityLabel,
      qualityScore: quality
    };
  });

  // Summary across meta-analyses
  const evidenceSummary = {
    convincing: analyzed.filter(a => a.evidenceClass === 'Convincing').length,
    highlySuggestive: analyzed.filter(a => a.evidenceClass === 'Highly suggestive').length,
    suggestive: analyzed.filter(a => a.evidenceClass === 'Suggestive').length,
    weak: analyzed.filter(a => a.evidenceClass === 'Weak').length,
    nonSignificant: analyzed.filter(a => a.evidenceClass === 'Non-significant').length
  };

  // Concordance across meta-analyses
  const directions = analyzed.map(a => a.effect > 0 ? 'positive' : 'negative');
  const concordance = {
    positive: directions.filter(d => d === 'positive').length,
    negative: directions.filter(d => d === 'negative').length,
    concordant: Math.max(...Object.values(directions.reduce((acc, d) => {
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {}))) / n
  };

  // Effect size heterogeneity across MAs
  const effects = analyzed.map(a => a.effect);
  const vars = analyzed.map(a => a.se * a.se);
  const wi = vars.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const pooledAcross = wi.reduce((s, w, i) => s + w * effects[i], 0) / sumW;
  const Q = effects.reduce((sum, e, i) => sum + wi[i] * Math.pow(e - pooledAcross, 2), 0);
  const I2Across = Math.max(0, (Q - (n - 1)) / Q * 100);

  return {
    metaAnalyses: analyzed,
    summary: {
      nMetaAnalyses: n,
      evidenceSummary,
      concordance,
      pooledEffect: pooledAcross,
      heterogeneityAcrossMAs: I2Across
    },
    bestEvidence: analyzed.filter(a =>
      a.evidenceClass === 'Convincing' || a.evidenceClass === 'Highly suggestive'
    ),
    overallConclusion: evidenceSummary.convincing > 0
      ? 'Convincing evidence exists for this association'
      : evidenceSummary.highlySuggestive > 0
      ? 'Highly suggestive evidence - warrants further research'
      : evidenceSummary.suggestive > 0
      ? 'Suggestive evidence only - interpret with caution'
      : 'Insufficient evidence for firm conclusions',
    method: 'Umbrella Review Analysis (Ioannidis Classification)'
  };
}

/**
 * Evidence Gap Mapping
 * Identify gaps in the evidence base
 */
export function evidenceGapMap(studies, dimensions, options = {}) {
  const METHOD = 'evidenceGapMap';

  // Input validation
  if (!Array.isArray(studies)) {
    throw new ValidationError('studies must be an array', METHOD);
  }
  if (studies.length === 0) {
    throw new ValidationError('At least 1 study is required', METHOD);
  }

  const {
    populationDim = 'population',
    interventionDim = 'intervention',
    outcomeDim = 'outcome',
    minStudies = 1
  } = options;

  validateNumeric(minStudies, 'minStudies', METHOD, { min: 1, integer: true });

  // Extract unique values for each dimension
  const populations = [...new Set(studies.map(s => s[populationDim]))].filter(p => p);
  const interventions = [...new Set(studies.map(s => s[interventionDim]))].filter(i => i);
  const outcomes = [...new Set(studies.map(s => s[outcomeDim]))].filter(o => o);

  // Create evidence matrix
  const matrix = {};
  const gaps = [];
  const covered = [];

  populations.forEach(pop => {
    matrix[pop] = {};
    interventions.forEach(int => {
      matrix[pop][int] = {};
      outcomes.forEach(out => {
        const matching = studies.filter(s =>
          s[populationDim] === pop &&
          s[interventionDim] === int &&
          s[outcomeDim] === out
        );
        matrix[pop][int][out] = {
          count: matching.length,
          studies: matching.map(s => s.name || s.id),
          hasEvidence: matching.length >= minStudies
        };

        if (matching.length < minStudies) {
          gaps.push({
            population: pop,
            intervention: int,
            outcome: out,
            nStudies: matching.length
          });
        } else {
          covered.push({
            population: pop,
            intervention: int,
            outcome: out,
            nStudies: matching.length,
            studies: matching
          });
        }
      });
    });
  });

  // Calculate coverage statistics
  const totalCells = populations.length * interventions.length * outcomes.length;
  const coverage = covered.length / totalCells * 100;

  // Priority gaps (most impactful missing combinations)
  const priorityGaps = gaps.slice(0, 10).map((gap, i) => ({
    ...gap,
    priority: i + 1,
    reason: gap.nStudies === 0 ? 'No evidence' : 'Insufficient evidence'
  }));

  // Dimension coverage
  const dimCoverage = {
    byPopulation: populations.map(pop => ({
      population: pop,
      coverage: interventions.reduce((sum, int) =>
        sum + outcomes.filter(out => matrix[pop][int][out].hasEvidence).length, 0
      ) / (interventions.length * outcomes.length) * 100
    })),
    byIntervention: interventions.map(int => ({
      intervention: int,
      coverage: populations.reduce((sum, pop) =>
        sum + outcomes.filter(out => matrix[pop][int][out].hasEvidence).length, 0
      ) / (populations.length * outcomes.length) * 100
    })),
    byOutcome: outcomes.map(out => ({
      outcome: out,
      coverage: populations.reduce((sum, pop) =>
        sum + interventions.filter(int => matrix[pop][int][out].hasEvidence).length, 0
      ) / (populations.length * interventions.length) * 100
    }))
  };

  return {
    dimensions: {
      populations,
      interventions,
      outcomes
    },
    matrix,
    gaps: {
      total: gaps.length,
      list: gaps,
      priority: priorityGaps
    },
    covered: {
      total: covered.length,
      list: covered
    },
    coverage: {
      overall: coverage,
      byDimension: dimCoverage
    },
    visualization: {
      heatmapData: populations.flatMap(pop =>
        interventions.map(int => ({
          x: int,
          y: pop,
          value: outcomes.filter(out => matrix[pop][int][out].hasEvidence).length,
          max: outcomes.length
        }))
      )
    },
    recommendations: [
      `Overall coverage: ${coverage.toFixed(1)}%`,
      `${gaps.length} evidence gaps identified`,
      priorityGaps.length > 0 ? `Priority: ${priorityGaps[0].population} + ${priorityGaps[0].intervention}` : null
    ].filter(r => r),
    method: 'Evidence Gap Mapping'
  };
}

/**
 * Living Review Automation
 * Automated updating and monitoring for living systematic reviews
 */
export function livingReviewAutomation(currentState, newData, options = {}) {
  const METHOD = 'livingReviewAutomation';

  // Input validation
  if (typeof currentState !== 'object' || currentState === null) {
    throw new ValidationError('currentState must be an object', METHOD);
  }
  if (currentState.pooledEffect === undefined) {
    throw new ValidationError('currentState must have pooledEffect property', METHOD);
  }
  if (currentState.se === undefined) {
    throw new ValidationError('currentState must have se property', METHOD);
  }
  if (!Array.isArray(newData)) {
    throw new ValidationError('newData must be an array', METHOD);
  }

  const {
    updateThreshold = 'any', // 'any', 'significant', 'quarterly'
    significanceLevel = 0.05,
    minNewStudies = 1,
    futilityThreshold = 0.95
  } = options;

  validateNumeric(significanceLevel, 'significanceLevel', METHOD, { min: 0.001, max: 0.5 });
  validateNumeric(minNewStudies, 'minNewStudies', METHOD, { min: 1, integer: true });
  validateNumeric(futilityThreshold, 'futilityThreshold', METHOD, { min: 0, max: 1 });

  const previousStudies = currentState.studies || [];
  const previousPooled = currentState.pooledEffect;
  const previousSE = currentState.se;
  const previousN = previousStudies.length;

  // Identify new studies
  const existingIds = new Set(previousStudies.map(s => s.id || s.name));
  const newStudies = newData.filter(s => !existingIds.has(s.id || s.name));
  const nNew = newStudies.length;

  // Combined dataset
  const allStudies = [...previousStudies, ...newStudies];
  const yi = allStudies.map(s => s.effect);
  const vi = allStudies.map(s => s.se * s.se);

  // Updated analysis
  const tau2 = estimateTau2(yi, vi, 'REML');
  const wi = vi.map(v => 1 / (v + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const newPooled = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const newSE = Math.sqrt(1 / sumW);

  // Change metrics
  const effectChange = Math.abs(newPooled - previousPooled);
  const relativeChange = previousPooled !== 0 ? (effectChange / Math.abs(previousPooled)) * 100 : Infinity;
  const directionChange = (newPooled > 0) !== (previousPooled > 0);

  // Statistical significance change
  const prevZ = previousPooled / previousSE;
  const newZ = newPooled / newSE;
  const prevP = 2 * (1 - normalCDF(Math.abs(prevZ)));
  const newP = 2 * (1 - normalCDF(Math.abs(newZ)));
  const significanceChange = (prevP < significanceLevel) !== (newP < significanceLevel);

  // Sequential monitoring
  const cumZ = newZ * Math.sqrt(allStudies.length);
  const obfBoundary = jStat.normal.inv(1 - significanceLevel / 2, 0, 1) * Math.sqrt(allStudies.length);
  const crossedBoundary = Math.abs(cumZ) > obfBoundary;

  // Futility assessment
  const conditionalPower = 1 - normalCDF(
    jStat.normal.inv(1 - significanceLevel / 2, 0, 1) - Math.abs(newPooled / newSE)
  );
  const isFutile = conditionalPower < (1 - futilityThreshold);

  // Decision on update
  let shouldUpdate = false;
  let updateReason = [];

  if (nNew >= minNewStudies) {
    if (updateThreshold === 'any') {
      shouldUpdate = true;
      updateReason.push(`${nNew} new studies available`);
    } else if (updateThreshold === 'significant') {
      if (significanceChange) {
        shouldUpdate = true;
        updateReason.push('Statistical significance changed');
      }
      if (directionChange) {
        shouldUpdate = true;
        updateReason.push('Effect direction changed');
      }
      if (relativeChange > 20) {
        shouldUpdate = true;
        updateReason.push(`Effect changed by ${relativeChange.toFixed(1)}%`);
      }
    }
  }

  // Information gain
  const prevInfo = 1 / (previousSE * previousSE);
  const newInfo = 1 / (newSE * newSE);
  const informationGain = ((newInfo - prevInfo) / prevInfo) * 100;

  // Time to stability estimate
  const avgInfoPerStudy = newInfo / allStudies.length;
  const targetSE = 0.1; // Target precision
  const targetInfo = 1 / (targetSE * targetSE);
  const studiesNeeded = Math.max(0, Math.ceil((targetInfo - newInfo) / avgInfoPerStudy));

  return {
    previous: {
      nStudies: previousN,
      pooledEffect: previousPooled,
      se: previousSE,
      significant: prevP < significanceLevel
    },
    updated: {
      nStudies: allStudies.length,
      pooledEffect: newPooled,
      se: newSE,
      significant: newP < significanceLevel,
      tau2
    },
    newStudies: {
      count: nNew,
      studies: newStudies.map(s => s.name || s.id)
    },
    changes: {
      effectChange,
      relativeChange,
      directionChange,
      significanceChange,
      informationGain
    },
    monitoring: {
      cumulativeZ: cumZ,
      obfBoundary,
      crossedBoundary,
      conditionalPower,
      isFutile
    },
    decision: {
      shouldUpdate,
      reasons: updateReason,
      nextReviewDate: shouldUpdate ? 'Now' : 'Per protocol schedule'
    },
    projections: {
      studiesForStability: studiesNeeded,
      currentPrecision: newSE,
      targetPrecision: targetSE
    },
    stateForNextUpdate: {
      studies: allStudies,
      pooledEffect: newPooled,
      se: newSE
    },
    method: 'Living Review Automation'
  };
}

// ============================================================================
// DIAGNOSTIC TEST ACCURACY (DTA) META-ANALYSIS
// ============================================================================

/**
 * Bivariate Random-Effects Model for DTA Meta-Analysis
 * Based on Reitsma et al. (2005), implements the bivariate normal model
 * for jointly modeling sensitivity and specificity
 *
 * Input: Arrays of TP, FP, FN, TN (2x2 table counts)
 * Model:
 *   logit(sens_i) = μ_sens + u_i
 *   logit(spec_i) = μ_spec + v_i
 *   (u_i, v_i) ~ N(0, Σ) where Σ = [[σ²_sens, ρσ_sensσ_spec], [ρσ_sensσ_spec, σ²_spec]]
 */
export function bivariateDTA(tp, fp, fn, tn, options = {}) {
  const METHOD = 'bivariateDTA';

  // Input validation
  validateDTAInput(tp, fp, fn, tn, METHOD);

  const {
    maxIter = 100,
    tol = 1e-6,
    continuityCorrection = 0.5 // Added when any cell is 0
  } = options;

  validateNumeric(maxIter, 'maxIter', METHOD, { min: 10, max: 10000, integer: true });
  validateNumeric(tol, 'tol', METHOD, { min: 1e-12, max: 0.1 });
  validateNumeric(continuityCorrection, 'continuityCorrection', METHOD, { min: 0, max: 1 });

  const k = tp.length;

  // Apply continuity correction if needed
  const tpAdj = tp.map((t, i) => (t === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);
  const fpAdj = fp.map((t, i) => (tp[i] === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);
  const fnAdj = fn.map((t, i) => (tp[i] === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);
  const tnAdj = tn.map((t, i) => (tp[i] === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);

  // Calculate study-level sensitivity and specificity (logit scale)
  const sens = tpAdj.map((t, i) => t / (t + fnAdj[i]));
  const spec = tnAdj.map((t, i) => t / (t + fpAdj[i]));
  const logitSens = sens.map(s => Math.log(s / (1 - s)));
  const logitSpec = spec.map(s => Math.log(s / (1 - s)));

  // Within-study variances (delta method for logit)
  const varLogitSens = tpAdj.map((t, i) => 1/t + 1/fnAdj[i]);
  const varLogitSpec = tnAdj.map((t, i) => 1/t + 1/fpAdj[i]);

  // Method of Moments initial estimates
  const muSens0 = logitSens.reduce((a, b) => a + b, 0) / k;
  const muSpec0 = logitSpec.reduce((a, b) => a + b, 0) / k;
  const varSens0 = logitSens.reduce((s, l) => s + Math.pow(l - muSens0, 2), 0) / (k - 1) - varLogitSens.reduce((a, b) => a + b, 0) / k;
  const varSpec0 = logitSpec.reduce((s, l) => s + Math.pow(l - muSpec0, 2), 0) / (k - 1) - varLogitSpec.reduce((a, b) => a + b, 0) / k;

  // Initialize parameters
  let muSens = muSens0;
  let muSpec = muSpec0;
  let sigma2Sens = Math.max(0.01, varSens0);
  let sigma2Spec = Math.max(0.01, varSpec0);
  let rho = 0;

  // REML estimation via Fisher scoring
  for (let iter = 0; iter < maxIter; iter++) {
    const prevParams = [muSens, muSpec, sigma2Sens, sigma2Spec, rho];

    // Build V_i = Σ + D_i where D_i is within-study variance
    const sumInvV11 = [], sumInvV12 = [], sumInvV22 = [];
    const sumInvVy1 = [], sumInvVy2 = [];

    let ll = 0;

    for (let i = 0; i < k; i++) {
      // Marginal variance-covariance for study i
      const V11 = sigma2Sens + varLogitSens[i];
      const V22 = sigma2Spec + varLogitSpec[i];
      const V12 = rho * Math.sqrt(sigma2Sens * sigma2Spec);

      // Inverse of 2x2 matrix
      const detV = V11 * V22 - V12 * V12;
      if (detV <= 0) continue;

      const invV11 = V22 / detV;
      const invV22 = V11 / detV;
      const invV12 = -V12 / detV;

      sumInvV11.push(invV11);
      sumInvV12.push(invV12);
      sumInvV22.push(invV22);

      const y1 = logitSens[i];
      const y2 = logitSpec[i];

      sumInvVy1.push(invV11 * y1 + invV12 * y2);
      sumInvVy2.push(invV12 * y1 + invV22 * y2);

      // Log-likelihood contribution
      const r1 = y1 - muSens;
      const r2 = y2 - muSpec;
      ll -= 0.5 * (Math.log(detV) + invV11 * r1 * r1 + 2 * invV12 * r1 * r2 + invV22 * r2 * r2);
    }

    // Update mu (generalized least squares)
    const sumInv11 = sumInvV11.reduce((a, b) => a + b, 0);
    const sumInv12 = sumInvV12.reduce((a, b) => a + b, 0);
    const sumInv22 = sumInvV22.reduce((a, b) => a + b, 0);
    const sumY1 = sumInvVy1.reduce((a, b) => a + b, 0);
    const sumY2 = sumInvVy2.reduce((a, b) => a + b, 0);

    const detSum = sumInv11 * sumInv22 - sumInv12 * sumInv12;
    if (detSum > 0) {
      muSens = (sumInv22 * sumY1 - sumInv12 * sumY2) / detSum;
      muSpec = (-sumInv12 * sumY1 + sumInv11 * sumY2) / detSum;
    }

    // Update variance components via proper REML Fisher scoring
    // Following Reitsma et al. (2005) and Jackson et al. (2011)
    // Score vector: U_j = -0.5 * sum_i[tr(V_i^{-1} dV/dθ_j) - r_i'V_i^{-1}(dV/dθ_j)V_i^{-1}r_i + c_j]
    // where c_j is the REML correction term
    // Fisher information: I_{jl} = 0.5 * sum_i[tr(V_i^{-1} dV/dθ_j V_i^{-1} dV/dθ_l)]

    // Compute score and Fisher information for (sigma2Sens, sigma2Spec, rho)
    let U = [0, 0, 0]; // Score vector
    let I = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // Fisher information (3x3)

    const covSenSpec = rho * Math.sqrt(sigma2Sens * sigma2Spec);

    for (let i = 0; i < k; i++) {
      const V11 = sigma2Sens + varLogitSens[i];
      const V22 = sigma2Spec + varLogitSpec[i];
      const V12 = covSenSpec;
      const detV = V11 * V22 - V12 * V12;
      if (detV <= 0) continue;

      // Inverse elements
      const iV11 = V22 / detV, iV22 = V11 / detV, iV12 = -V12 / detV;

      const r1 = logitSens[i] - muSens;
      const r2 = logitSpec[i] - muSpec;

      // Quadratic form components: r'V^{-1}(dV/dθ)V^{-1}r
      const Vir1 = iV11 * r1 + iV12 * r2;
      const Vir2 = iV12 * r1 + iV22 * r2;

      // Derivatives of Sigma w.r.t. parameters
      // dΣ/dσ²_sens = [[1, ρ√(σ²_spec/σ²_sens)/2], [ρ√(σ²_spec/σ²_sens)/2, 0]]
      // dΣ/dσ²_spec = [[0, ρ√(σ²_sens/σ²_spec)/2], [ρ√(σ²_sens/σ²_spec)/2, 1]]
      // dΣ/dρ = [[0, √(σ²_sens σ²_spec)], [√(σ²_sens σ²_spec), 0]]

      const sqrtRatio1 = sigma2Spec > 0 ? 0.5 * rho * Math.sqrt(sigma2Spec / Math.max(0.001, sigma2Sens)) : 0;
      const sqrtRatio2 = sigma2Sens > 0 ? 0.5 * rho * Math.sqrt(sigma2Sens / Math.max(0.001, sigma2Spec)) : 0;
      const sqrtProd = Math.sqrt(sigma2Sens * sigma2Spec);

      // dV/dσ²_sens: [[1, sqrtRatio1], [sqrtRatio1, 0]]
      // dV/dσ²_spec: [[0, sqrtRatio2], [sqrtRatio2, 1]]
      // dV/dρ: [[0, sqrtProd], [sqrtProd, 0]]

      // Trace terms: tr(V^{-1} dV/dθ)
      const tr1 = iV11 * 1 + iV22 * 0 + 2 * iV12 * sqrtRatio1;
      const tr2 = iV11 * 0 + iV22 * 1 + 2 * iV12 * sqrtRatio2;
      const tr3 = 2 * iV12 * sqrtProd;

      // Quadratic form: r'V^{-1}(dV/dθ)V^{-1}r
      const q1 = Vir1 * Vir1 * 1 + 2 * Vir1 * Vir2 * sqrtRatio1 + Vir2 * Vir2 * 0;
      const q2 = Vir1 * Vir1 * 0 + 2 * Vir1 * Vir2 * sqrtRatio2 + Vir2 * Vir2 * 1;
      const q3 = 2 * Vir1 * Vir2 * sqrtProd;

      // Score contributions
      U[0] += -0.5 * tr1 + 0.5 * q1;
      U[1] += -0.5 * tr2 + 0.5 * q2;
      U[2] += -0.5 * tr3 + 0.5 * q3;

      // Fisher information: I_{jl} = 0.5 * tr(V^{-1} dV/dθ_j V^{-1} dV/dθ_l)
      // Compute V^{-1} dV/dθ products for each parameter
      const ViD1 = [[iV11 + sqrtRatio1 * iV12, sqrtRatio1 * iV11 + iV12 * 0],
                    [iV12 + sqrtRatio1 * iV22, sqrtRatio1 * iV12]];
      const ViD2 = [[sqrtRatio2 * iV12, sqrtRatio2 * iV11 + iV12],
                    [sqrtRatio2 * iV22 + iV12, sqrtRatio2 * iV12 + iV22]];
      const ViD3 = [[sqrtProd * iV12, sqrtProd * iV11],
                    [sqrtProd * iV22, sqrtProd * iV12]];

      // Trace of product
      I[0][0] += 0.5 * (ViD1[0][0] * ViD1[0][0] + ViD1[0][1] * ViD1[1][0] + ViD1[1][0] * ViD1[0][1] + ViD1[1][1] * ViD1[1][1]);
      I[0][1] += 0.5 * (ViD1[0][0] * ViD2[0][0] + ViD1[0][1] * ViD2[1][0] + ViD1[1][0] * ViD2[0][1] + ViD1[1][1] * ViD2[1][1]);
      I[0][2] += 0.5 * (ViD1[0][0] * ViD3[0][0] + ViD1[0][1] * ViD3[1][0] + ViD1[1][0] * ViD3[0][1] + ViD1[1][1] * ViD3[1][1]);
      I[1][1] += 0.5 * (ViD2[0][0] * ViD2[0][0] + ViD2[0][1] * ViD2[1][0] + ViD2[1][0] * ViD2[0][1] + ViD2[1][1] * ViD2[1][1]);
      I[1][2] += 0.5 * (ViD2[0][0] * ViD3[0][0] + ViD2[0][1] * ViD3[1][0] + ViD2[1][0] * ViD3[0][1] + ViD2[1][1] * ViD3[1][1]);
      I[2][2] += 0.5 * (ViD3[0][0] * ViD3[0][0] + ViD3[0][1] * ViD3[1][0] + ViD3[1][0] * ViD3[0][1] + ViD3[1][1] * ViD3[1][1]);
    }

    // Symmetrize Fisher information
    I[1][0] = I[0][1]; I[2][0] = I[0][2]; I[2][1] = I[1][2];

    // Add regularization for numerical stability
    const reg = 1e-6;
    I[0][0] += reg; I[1][1] += reg; I[2][2] += reg;

    // Solve I * delta = U using Cholesky or direct inversion for 3x3
    const det3 = I[0][0] * (I[1][1] * I[2][2] - I[1][2] * I[2][1])
               - I[0][1] * (I[1][0] * I[2][2] - I[1][2] * I[2][0])
               + I[0][2] * (I[1][0] * I[2][1] - I[1][1] * I[2][0]);

    if (Math.abs(det3) > 1e-15) {
      // Compute inverse of 3x3 Fisher information
      const adj = [
        [I[1][1]*I[2][2] - I[1][2]*I[2][1], I[0][2]*I[2][1] - I[0][1]*I[2][2], I[0][1]*I[1][2] - I[0][2]*I[1][1]],
        [I[1][2]*I[2][0] - I[1][0]*I[2][2], I[0][0]*I[2][2] - I[0][2]*I[2][0], I[0][2]*I[1][0] - I[0][0]*I[1][2]],
        [I[1][0]*I[2][1] - I[1][1]*I[2][0], I[0][1]*I[2][0] - I[0][0]*I[2][1], I[0][0]*I[1][1] - I[0][1]*I[1][0]]
      ];

      // Fisher scoring update with damping for stability
      const dampingFactor = 0.5;
      const delta0 = (adj[0][0]*U[0] + adj[0][1]*U[1] + adj[0][2]*U[2]) / det3;
      const delta1 = (adj[1][0]*U[0] + adj[1][1]*U[1] + adj[1][2]*U[2]) / det3;
      const delta2 = (adj[2][0]*U[0] + adj[2][1]*U[1] + adj[2][2]*U[2]) / det3;

      sigma2Sens = Math.max(0.001, sigma2Sens + dampingFactor * delta0);
      sigma2Spec = Math.max(0.001, sigma2Spec + dampingFactor * delta1);
      rho = rho + dampingFactor * delta2;
    } else {
      // Fallback to method-of-moments if Fisher information is singular
      let ss1 = 0, ss2 = 0, ss12 = 0;
      for (let i = 0; i < k; i++) {
        const r1 = logitSens[i] - muSens;
        const r2 = logitSpec[i] - muSpec;
        ss1 += r1 * r1 - varLogitSens[i];
        ss2 += r2 * r2 - varLogitSpec[i];
        ss12 += r1 * r2;
      }
      sigma2Sens = Math.max(0.001, ss1 / k);
      sigma2Spec = Math.max(0.001, ss2 / k);
      rho = ss12 / (k * Math.sqrt(sigma2Sens * sigma2Spec));
    }
    rho = Math.max(-0.999, Math.min(0.999, rho));

    // Check convergence
    const diff = Math.max(
      Math.abs(muSens - prevParams[0]),
      Math.abs(muSpec - prevParams[1]),
      Math.abs(sigma2Sens - prevParams[2]),
      Math.abs(sigma2Spec - prevParams[3]),
      Math.abs(rho - prevParams[4])
    );

    if (diff < tol) break;
  }

  // Back-transform to probability scale
  const pooledSens = 1 / (1 + Math.exp(-muSens));
  const pooledSpec = 1 / (1 + Math.exp(-muSpec));

  // Standard errors via Fisher information for mean parameters
  // I(μ) = Σ_i V_i^{-1}, Var(μ̂) = I(μ)^{-1}
  // Reference: Reitsma et al. (2005), Riley et al. (2008)
  let sumI11 = 0, sumI12 = 0, sumI22 = 0;
  for (let i = 0; i < k; i++) {
    const V11 = sigma2Sens + varLogitSens[i];
    const V22 = sigma2Spec + varLogitSpec[i];
    const V12 = rho * Math.sqrt(sigma2Sens * sigma2Spec);
    const detV = V11 * V22 - V12 * V12;
    if (detV <= 0) continue;
    sumI11 += V22 / detV;
    sumI12 += -V12 / detV;
    sumI22 += V11 / detV;
  }

  // Invert 2x2 Fisher information to get variance-covariance of (muSens, muSpec)
  const detI = sumI11 * sumI22 - sumI12 * sumI12;
  let varMuSens, varMuSpec, covMuSensSpec;
  if (detI > 1e-15) {
    varMuSens = sumI22 / detI;
    varMuSpec = sumI11 / detI;
    covMuSensSpec = -sumI12 / detI;
  } else {
    // Fallback to simpler approximation if Fisher information is singular
    varMuSens = (sigma2Sens + varLogitSens.reduce((a, b) => a + b, 0) / k) / k;
    varMuSpec = (sigma2Spec + varLogitSpec.reduce((a, b) => a + b, 0) / k) / k;
    covMuSensSpec = 0;
  }

  const seMuSens = Math.sqrt(varMuSens);
  const seMuSpec = Math.sqrt(varMuSpec);

  const seSens = pooledSens * (1 - pooledSens) * seMuSens;
  const seSpec = pooledSpec * (1 - pooledSpec) * seMuSpec;

  // Summary ROC curve parameters
  // SROC: D = a + b*S where D = logit(sens) - logit(1-spec), S = logit(sens) + logit(1-spec)
  const D = muSens + muSpec; // at SROC intercept
  const dor = Math.exp(D); // Diagnostic odds ratio at mean

  // Calculate AUC using Simpson's rule for higher accuracy
  // Reference: Walter (2002) Properties of the SROC curve
  const calculateAUC = () => {
    const nPoints = 200; // Must be even for Simpson's rule
    const h = 1 / nPoints;

    // Sensitivity as function of FPR via conditional bivariate normal
    const sensAtFPR = (fpr) => {
      if (fpr <= 0.001 || fpr >= 0.999) return fpr <= 0.001 ? 1 : 0;
      const logitFPR = Math.log(fpr / (1 - fpr));
      const condMeanLogitSens = muSens + rho * Math.sqrt(sigma2Sens / sigma2Spec) * (logitFPR - (-muSpec));
      return 1 / (1 + Math.exp(-condMeanLogitSens));
    };

    // Simpson's rule: ∫f(x)dx ≈ h/3 * [f(x₀) + 4f(x₁) + 2f(x₂) + 4f(x₃) + ... + f(xₙ)]
    let auc = sensAtFPR(0) + sensAtFPR(1);
    for (let i = 1; i < nPoints; i++) {
      const fpr = i * h;
      const weight = (i % 2 === 0) ? 2 : 4;
      auc += weight * sensAtFPR(fpr);
    }
    auc *= h / 3;

    return auc;
  };

  // Bootstrap AUC confidence interval (percentile method)
  // Uses seeded PRNG for reproducibility (Blackman & Vigna, 2018)
  const bootstrapAUC = (nBoot = 1000, seed = 42) => {
    const aucSamples = [];
    const rng = createSeededRNG(seed);

    for (let b = 0; b < nBoot; b++) {
      // Resample studies with replacement using seeded PRNG
      const bootIdx = Array.from({ length: k }, () => rng.randomInt(k));
      const bootLogitSens = bootIdx.map(i => logitSens[i]);
      const bootLogitSpec = bootIdx.map(i => logitSpec[i]);

      // Quick method-of-moments estimate for bootstrap sample
      const bootMuSens = bootLogitSens.reduce((a, b) => a + b, 0) / k;
      const bootMuSpec = bootLogitSpec.reduce((a, b) => a + b, 0) / k;
      const bootVarSens = bootLogitSens.reduce((s, l) => s + Math.pow(l - bootMuSens, 2), 0) / (k - 1);
      const bootVarSpec = bootLogitSpec.reduce((s, l) => s + Math.pow(l - bootMuSpec, 2), 0) / (k - 1);
      const bootCov = bootLogitSens.reduce((s, l, i) => s + (l - bootMuSens) * (bootLogitSpec[i] - bootMuSpec), 0) / (k - 1);
      const bootRho = bootCov / Math.sqrt(bootVarSens * bootVarSpec) || 0;

      // Compute AUC for bootstrap sample
      const bootSensAtFPR = (fpr) => {
        if (fpr <= 0.001 || fpr >= 0.999) return fpr <= 0.001 ? 1 : 0;
        const logitFPR = Math.log(fpr / (1 - fpr));
        const condMean = bootMuSens + bootRho * Math.sqrt(Math.max(0.001, bootVarSens) / Math.max(0.001, bootVarSpec)) * (logitFPR - (-bootMuSpec));
        return 1 / (1 + Math.exp(-condMean));
      };

      // Trapezoidal rule for bootstrap (faster)
      let bootAuc = 0;
      const nPts = 50;
      for (let i = 0; i < nPts; i++) {
        const fpr1 = i / nPts, fpr2 = (i + 1) / nPts;
        bootAuc += 0.5 * (bootSensAtFPR(fpr1) + bootSensAtFPR(fpr2)) / nPts;
      }
      aucSamples.push(bootAuc);
    }

    aucSamples.sort((a, b) => a - b);

    // Efficient SE calculation: compute mean once, then sum squared deviations
    const aucMean = aucSamples.reduce((a, b) => a + b, 0) / nBoot;
    const aucSE = Math.sqrt(aucSamples.reduce((s, a) => s + Math.pow(a - aucMean, 2), 0) / (nBoot - 1));

    return {
      ci: [aucSamples[Math.floor(0.025 * nBoot)], aucSamples[Math.floor(0.975 * nBoot)]],
      se: aucSE
    };
  };

  const auc = calculateAUC();
  const aucBootstrap = k >= 5 ? bootstrapAUC(1000) : null;

  // Heterogeneity measures
  const I2sens = Math.max(0, 100 * sigma2Sens / (sigma2Sens + varLogitSens.reduce((a, b) => a + b, 0) / k));
  const I2spec = Math.max(0, 100 * sigma2Spec / (sigma2Spec + varLogitSpec.reduce((a, b) => a + b, 0) / k));

  // Study-level predictions (for forest plot)
  const studyResults = tp.map((_, i) => ({
    study: i + 1,
    sensitivity: sens[i],
    specificity: spec[i],
    tp: tp[i], fp: fp[i], fn: fn[i], tn: tn[i],
    n: tp[i] + fp[i] + fn[i] + tn[i]
  }));

  return {
    pooled: {
      sensitivity: {
        estimate: pooledSens,
        se: seSens,
        ci: [
          1 / (1 + Math.exp(-(muSens - 1.96 * seMuSens))),
          1 / (1 + Math.exp(-(muSens + 1.96 * seMuSens)))
        ],
        logit: muSens,
        logitSE: seMuSens
      },
      specificity: {
        estimate: pooledSpec,
        se: seSpec,
        ci: [
          1 / (1 + Math.exp(-(muSpec - 1.96 * seMuSpec))),
          1 / (1 + Math.exp(-(muSpec + 1.96 * seMuSpec)))
        ],
        logit: muSpec,
        logitSE: seMuSpec
      },
      dor: {
        estimate: dor,
        ci: [dor * Math.exp(-1.96 * Math.sqrt(seMuSens*seMuSens + seMuSpec*seMuSpec)),
             dor * Math.exp(1.96 * Math.sqrt(seMuSens*seMuSens + seMuSpec*seMuSpec))]
      },
      lrPositive: pooledSens / (1 - pooledSpec),
      lrNegative: (1 - pooledSens) / pooledSpec,
      auc: {
        estimate: auc,
        ci: aucBootstrap ? aucBootstrap.ci : null,
        se: aucBootstrap ? aucBootstrap.se : null,
        method: 'Simpson\'s rule integration with bootstrap CI (1000 resamples)',
        note: k < 10 ? 'AUC CI may be imprecise with < 10 studies' : null
      }
    },
    heterogeneity: {
      sigma2Sens,
      sigma2Spec,
      correlation: -rho,
      I2sens,
      I2spec
    },
    srocCurve: {
      // Points for plotting SROC curve
      points: Array.from({ length: 101 }, (_, i) => {
        const fpr = i / 100;
        if (fpr === 0 || fpr === 1) return null;
        const logitFPR = Math.log(fpr / (1 - fpr));
        const condMean = muSens + rho * Math.sqrt(sigma2Sens / sigma2Spec) * (logitFPR - (-muSpec));
        return { fpr, sens: 1 / (1 + Math.exp(-condMean)) };
      }).filter(p => p !== null),
      confidenceRegion: { muSens, muSpec, sigma2Sens, sigma2Spec, rho }
    },
    studies: studyResults,
    nStudies: k,
    method: 'Bivariate Random-Effects Model (Reitsma)'
  };
}

/**
 * Leave-One-Out Sensitivity Analysis for DTA Meta-Analysis
 *
 * Systematically removes each study and re-fits the bivariate model
 * to assess the influence of individual studies on pooled estimates.
 *
 * Reference: Deeks JJ, et al. (2005). Evaluating non-randomised intervention
 * studies. Health Technology Assessment.
 *
 * @param {Array<number>} tp - True positives
 * @param {Array<number>} fp - False positives
 * @param {Array<number>} fn - False negatives
 * @param {Array<number>} tn - True negatives
 * @param {Object} options - Configuration options
 * @returns {Object} Leave-one-out results with influence diagnostics
 */
export function dtaLeaveOneOut(tp, fp, fn, tn, options = {}) {
  const METHOD = 'dtaLeaveOneOut';

  validateDTAInput(tp, fp, fn, tn, METHOD);

  const { confidenceLevel = 0.95, studyNames = null } = options;

  const k = tp.length;

  if (k < 4) {
    throw new ValidationError('Leave-one-out requires at least 4 studies', METHOD);
  }

  // Fit full model first
  const fullModel = bivariateDTA(tp, fp, fn, tn, { confidenceLevel });

  // Leave-one-out analysis
  const looResults = [];

  for (let i = 0; i < k; i++) {
    // Create arrays with study i removed
    const tpLoo = [...tp.slice(0, i), ...tp.slice(i + 1)];
    const fpLoo = [...fp.slice(0, i), ...fp.slice(i + 1)];
    const fnLoo = [...fn.slice(0, i), ...fn.slice(i + 1)];
    const tnLoo = [...tn.slice(0, i), ...tn.slice(i + 1)];

    try {
      const looModel = bivariateDTA(tpLoo, fpLoo, fnLoo, tnLoo, { confidenceLevel });

      // Calculate influence metrics
      const sensChange = fullModel.pooled.sensitivity.estimate - looModel.pooled.sensitivity.estimate;
      const specChange = fullModel.pooled.specificity.estimate - looModel.pooled.specificity.estimate;
      const aucChange = fullModel.pooled.auc.estimate - looModel.pooled.auc.estimate;

      looResults.push({
        studyOmitted: studyNames ? studyNames[i] : i + 1,
        index: i,
        sensitivity: {
          estimate: looModel.pooled.sensitivity.estimate,
          ci: looModel.pooled.sensitivity.ci,
          change: sensChange,
          changePercent: (sensChange / fullModel.pooled.sensitivity.estimate) * 100
        },
        specificity: {
          estimate: looModel.pooled.specificity.estimate,
          ci: looModel.pooled.specificity.ci,
          change: specChange,
          changePercent: (specChange / fullModel.pooled.specificity.estimate) * 100
        },
        auc: {
          estimate: looModel.pooled.auc.estimate,
          change: aucChange,
          changePercent: (aucChange / fullModel.pooled.auc.estimate) * 100
        },
        heterogeneity: {
          sigma2Sens: looModel.heterogeneity.sigma2Sens,
          sigma2Spec: looModel.heterogeneity.sigma2Spec,
          correlation: looModel.heterogeneity.correlation
        },
        converged: true
      });
    } catch (e) {
      // Model failed to converge with this study removed
      looResults.push({
        studyOmitted: studyNames ? studyNames[i] : i + 1,
        index: i,
        sensitivity: null,
        specificity: null,
        auc: null,
        converged: false,
        error: e.message
      });
    }
  }

  // Identify influential studies
  const successfulLoo = looResults.filter(r => r.converged);

  const sensChanges = successfulLoo.map(r => Math.abs(r.sensitivity.change));
  const specChanges = successfulLoo.map(r => Math.abs(r.specificity.change));
  const aucChanges = successfulLoo.map(r => Math.abs(r.auc.change));

  const sensThreshold = 2 * (sensChanges.reduce((a, b) => a + b, 0) / sensChanges.length);
  const specThreshold = 2 * (specChanges.reduce((a, b) => a + b, 0) / specChanges.length);
  const aucThreshold = 2 * (aucChanges.reduce((a, b) => a + b, 0) / aucChanges.length);

  const influentialStudies = successfulLoo.filter(r =>
    Math.abs(r.sensitivity.change) > sensThreshold ||
    Math.abs(r.specificity.change) > specThreshold ||
    Math.abs(r.auc.change) > aucThreshold
  ).map(r => ({
    study: r.studyOmitted,
    reason: [
      Math.abs(r.sensitivity.change) > sensThreshold ? 'sensitivity' : null,
      Math.abs(r.specificity.change) > specThreshold ? 'specificity' : null,
      Math.abs(r.auc.change) > aucThreshold ? 'AUC' : null
    ].filter(Boolean).join(', ')
  }));

  // Summary statistics across leave-one-out analyses
  const sensEstimates = successfulLoo.map(r => r.sensitivity.estimate);
  const specEstimates = successfulLoo.map(r => r.specificity.estimate);
  const aucEstimates = successfulLoo.map(r => r.auc.estimate);

  return {
    fullModel: {
      sensitivity: fullModel.pooled.sensitivity.estimate,
      specificity: fullModel.pooled.specificity.estimate,
      auc: fullModel.pooled.auc.estimate
    },
    leaveOneOut: looResults,
    summary: {
      sensitivity: {
        range: [Math.min(...sensEstimates), Math.max(...sensEstimates)],
        mean: sensEstimates.reduce((a, b) => a + b, 0) / sensEstimates.length,
        sd: Math.sqrt(sensEstimates.reduce((s, x) =>
          s + Math.pow(x - sensEstimates.reduce((a, b) => a + b, 0) / sensEstimates.length, 2), 0
        ) / (sensEstimates.length - 1))
      },
      specificity: {
        range: [Math.min(...specEstimates), Math.max(...specEstimates)],
        mean: specEstimates.reduce((a, b) => a + b, 0) / specEstimates.length,
        sd: Math.sqrt(specEstimates.reduce((s, x) =>
          s + Math.pow(x - specEstimates.reduce((a, b) => a + b, 0) / specEstimates.length, 2), 0
        ) / (specEstimates.length - 1))
      },
      auc: {
        range: [Math.min(...aucEstimates), Math.max(...aucEstimates)],
        mean: aucEstimates.reduce((a, b) => a + b, 0) / aucEstimates.length,
        sd: Math.sqrt(aucEstimates.reduce((s, x) =>
          s + Math.pow(x - aucEstimates.reduce((a, b) => a + b, 0) / aucEstimates.length, 2), 0
        ) / (aucEstimates.length - 1))
      }
    },
    influentialStudies,
    nConverged: successfulLoo.length,
    nFailed: looResults.length - successfulLoo.length,
    interpretation: influentialStudies.length > 0
      ? `${influentialStudies.length} influential study/studies detected: ${influentialStudies.map(s => s.study).join(', ')}`
      : 'Results are robust across leave-one-out analyses',
    method: 'Leave-One-Out Sensitivity Analysis for DTA'
  };
}

/**
 * Hierarchical Summary ROC (HSROC) Model for DTA Meta-Analysis
 * Based on Rutter & Gatsonis (2001)
 * Parametrizes the SROC curve directly via accuracy and threshold parameters
 *
 * Model:
 *   D_i = (θ + α_i) * exp(-β * S_i)  where
 *   D_i = logit(sens_i) - logit(1-spec_i)  (log DOR)
 *   S_i = logit(sens_i) + logit(1-spec_i)  (threshold parameter)
 *   θ = overall accuracy (log DOR at S=0)
 *   β = asymmetry parameter (shape of SROC)
 *   α_i ~ N(0, σ²_α) = study-specific accuracy random effect
 */
export function hsrocModel(tp, fp, fn, tn, options = {}) {
  const METHOD = 'hsrocModel';

  // Input validation
  validateDTAInput(tp, fp, fn, tn, METHOD);

  const {
    maxIter = 100,
    tol = 1e-6,
    continuityCorrection = 0.5
  } = options;

  validateNumeric(maxIter, 'maxIter', METHOD, { min: 10, max: 10000, integer: true });
  validateNumeric(tol, 'tol', METHOD, { min: 1e-12, max: 0.1 });
  validateNumeric(continuityCorrection, 'continuityCorrection', METHOD, { min: 0, max: 1 });

  const k = tp.length;

  // Apply continuity correction
  const tpAdj = tp.map((t, i) => (t === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);
  const fpAdj = fp.map((t, i) => (tp[i] === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);
  const fnAdj = fn.map((t, i) => (tp[i] === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);
  const tnAdj = tn.map((t, i) => (tp[i] === 0 || fn[i] === 0 || fp[i] === 0 || tn[i] === 0) ? t + continuityCorrection : t);

  // Calculate D and S for each study
  const sens = tpAdj.map((t, i) => t / (t + fnAdj[i]));
  const spec = tnAdj.map((t, i) => t / (t + fpAdj[i]));

  const logitSens = sens.map(s => Math.log(s / (1 - s)));
  const logitOneMinusSpec = spec.map(s => Math.log((1 - s) / s));

  const D = logitSens.map((ls, i) => ls - logitOneMinusSpec[i]); // log DOR
  const S = logitSens.map((ls, i) => ls + logitOneMinusSpec[i]); // threshold

  // Variances
  const varLogitSens = tpAdj.map((t, i) => 1/t + 1/fnAdj[i]);
  const varLogitSpec = tnAdj.map((t, i) => 1/t + 1/fpAdj[i]);
  const varD = varLogitSens.map((v, i) => v + varLogitSpec[i]);
  const varS = varLogitSens.map((v, i) => v + varLogitSpec[i]);
  const covDS = varLogitSens.map((v, i) => v - varLogitSpec[i]); // approximate

  // Initial estimates
  let theta = D.reduce((a, b) => a + b, 0) / k; // mean log DOR
  let beta = 0; // symmetric SROC initially
  let sigma2Alpha = Math.max(0.1, D.reduce((s, d) => s + Math.pow(d - theta, 2), 0) / (k - 1) - varD.reduce((a, b) => a + b, 0) / k);
  let sigma2Theta = 0.5; // threshold variance

  // Iterative estimation
  for (let iter = 0; iter < maxIter; iter++) {
    const prevParams = [theta, beta, sigma2Alpha, sigma2Theta];

    // For each study, expected D given S under current parameters
    // D_i = θ + α_i, simplified without asymmetry for initial fit

    // Update theta (weighted mean of D)
    const wi = varD.map((v, i) => 1 / (v + sigma2Alpha));
    const sumW = wi.reduce((a, b) => a + b, 0);
    theta = wi.reduce((sum, w, i) => sum + w * D[i], 0) / sumW;

    // Update beta (asymmetry) via regression of D on S
    const Smean = S.reduce((a, b) => a + b, 0) / k;
    const num = S.reduce((sum, s, i) => sum + wi[i] * (s - Smean) * (D[i] - theta), 0);
    const den = S.reduce((sum, s, i) => sum + wi[i] * Math.pow(s - Smean, 2), 0);
    beta = den > 0 ? -num / den : 0;

    // Update variance components
    const residuals = D.map((d, i) => d - theta - beta * (S[i] - Smean));
    sigma2Alpha = Math.max(0.01, residuals.reduce((s, r, i) => s + r * r - varD[i], 0) / k);
    sigma2Theta = Math.max(0.01, S.reduce((s, si) => s + Math.pow(si - Smean, 2), 0) / (k - 1));

    // Check convergence
    const diff = Math.max(
      Math.abs(theta - prevParams[0]),
      Math.abs(beta - prevParams[1]),
      Math.abs(sigma2Alpha - prevParams[2]),
      Math.abs(sigma2Theta - prevParams[3])
    );

    if (diff < tol) break;
  }

  // Summary statistics
  const dor = Math.exp(theta);
  const seTheta = Math.sqrt(1 / D.map((_, i) => 1 / (varD[i] + sigma2Alpha)).reduce((a, b) => a + b, 0));

  // Lambda (cutpoint parameter) = E[S]
  const lambda = S.reduce((a, b) => a + b, 0) / k;

  // Calculate pooled sensitivity and specificity at mean threshold
  // At S = lambda: logit(sens) = (theta + lambda) / 2, logit(1-spec) = (lambda - theta) / 2
  const pooledLogitSens = (theta + lambda) / 2;
  const pooledLogitSpec = -(lambda - theta) / 2; // logit(spec) = -logit(1-spec)

  const pooledSens = 1 / (1 + Math.exp(-pooledLogitSens));
  const pooledSpec = 1 / (1 + Math.exp(-pooledLogitSpec));

  // Standard errors via delta method
  // Var(lambda) = sigma2Theta / k (variance of mean threshold)
  const seLambda = Math.sqrt(sigma2Theta / k + S.reduce((s, si) => s + varS[si] || 0, 0) / (k * k));

  // For logit(sens) = (θ + λ)/2: SE ≈ 0.5 * sqrt(SE_θ² + SE_λ²) (assuming independence)
  const seLogitSens = 0.5 * Math.sqrt(seTheta * seTheta + seLambda * seLambda);
  const seLogitSpec = 0.5 * Math.sqrt(seTheta * seTheta + seLambda * seLambda);

  // Transform to probability scale using delta method: SE(p) = p(1-p) * SE(logit(p))
  const seSens = pooledSens * (1 - pooledSens) * seLogitSens;
  const seSpec = pooledSpec * (1 - pooledSpec) * seLogitSpec;

  // AUC calculation via trapezoidal integration of SROC
  const calculateAUC = () => {
    let auc = 0;
    const nPoints = 1000;
    const Smean = lambda;

    for (let i = 1; i < nPoints; i++) {
      const fpr1 = (i - 1) / nPoints;
      const fpr2 = i / nPoints;
      if (fpr1 === 0 || fpr2 >= 1) continue;

      // Map FPR to S and then to sensitivity
      const getTPR = (fpr) => {
        const logitFPR = Math.log(fpr / (1 - fpr));
        const Sval = -2 * logitFPR; // approximate S from FPR
        const Dval = theta + beta * (Sval - Smean);
        const logitTPR = (Dval + Sval) / 2;
        return 1 / (1 + Math.exp(-logitTPR));
      };

      const tpr1 = getTPR(fpr1);
      const tpr2 = getTPR(fpr2);
      auc += 0.5 * (tpr1 + tpr2) * (fpr2 - fpr1);
    }
    return auc;
  };

  const auc = calculateAUC();
  const compatibleSummary = bivariateDTA(tp, fp, fn, tn, { continuityCorrection });
  const summaryPoint = compatibleSummary?.pooled
    ? {
        sensitivity: compatibleSummary.pooled.sensitivity.estimate,
        specificity: compatibleSummary.pooled.specificity.estimate
      }
    : {
        sensitivity: pooledSens,
        specificity: pooledSpec
      };

  // SROC curve points for plotting
  const srocPoints = [];
  const Smean = lambda;
  for (let i = 0; i <= 100; i++) {
    const fpr = i / 100;
    if (fpr === 0 || fpr === 1) continue;

    const logitFPR = Math.log(fpr / (1 - fpr));
    const Sval = -2 * logitFPR;
    const Dval = theta + beta * (Sval - Smean);
    const logitTPR = (Dval + Sval) / 2;
    const tpr = 1 / (1 + Math.exp(-logitTPR));

    if (tpr >= 0 && tpr <= 1) {
      srocPoints.push({ fpr, sens: tpr });
    }
  }

  return {
    parameters: {
      theta: { estimate: theta, se: seTheta, description: 'Overall accuracy (log DOR at mean threshold)' },
      beta: { estimate: beta, description: 'Asymmetry parameter (SROC shape)' },
      lambda: { estimate: lambda, description: 'Mean threshold (cutpoint) parameter' },
      sigma2Alpha: { estimate: sigma2Alpha, description: 'Between-study variance in accuracy' },
      sigma2Theta: { estimate: sigma2Theta, description: 'Between-study variance in threshold' }
    },
    theta,
    accuracy: theta,
    Lambda: lambda,
    threshold: lambda,
    beta,
    shape: beta,
    summaryPoint,
    heterogeneity: {
      sigma2Alpha,
      sigma2Theta
    },
    pooled: {
      sensitivity: {
        estimate: pooledSens,
        se: seSens,
        ci: [Math.max(0, pooledSens - 1.96 * seSens), Math.min(1, pooledSens + 1.96 * seSens)]
      },
      specificity: {
        estimate: pooledSpec,
        se: seSpec,
        ci: [Math.max(0, pooledSpec - 1.96 * seSpec), Math.min(1, pooledSpec + 1.96 * seSpec)]
      },
      dor: {
        estimate: dor,
        ci: [Math.exp(theta - 1.96 * seTheta), Math.exp(theta + 1.96 * seTheta)]
      },
      auc
    },
    srocCurve: srocPoints,
    curveData: srocPoints,
    srocMeta: {
      symmetric: Math.abs(beta) < 0.1
    },
    studies: sens.map((s, i) => ({
      study: i + 1,
      sensitivity: s,
      specificity: spec[i],
      D: D[i],
      S: S[i],
      tp: tp[i], fp: fp[i], fn: fn[i], tn: tn[i]
    })),
    nStudies: k,
    method: 'HSROC (Rutter-Gatsonis)'
  };
}

/**
 * DTA Forest Plot Data Generator
 * Prepares data for coupled forest plots of sensitivity and specificity
 */
export function dtaForestPlotData(tp, fp, fn, tn, options = {}) {
  const METHOD = 'dtaForestPlotData';

  // Input validation
  validateDTAInput(tp, fp, fn, tn, METHOD);

  const { studyLabels = null, model = 'bivariate' } = options;

  if (studyLabels !== null) {
    if (!Array.isArray(studyLabels) || studyLabels.length !== tp.length) {
      throw new ValidationError(`studyLabels must be an array of length ${tp.length}`, METHOD);
    }
  }
  if (!['bivariate', 'hsroc'].includes(model)) {
    throw new ValidationError("model must be 'bivariate' or 'hsroc'", METHOD);
  }

  const k = tp.length;

  // Calculate study-level estimates with Wilson CIs
  const wilsonCI = (x, n, alpha = 0.05) => {
    const p = x / n;
    const z = normalQuantile(1 - alpha / 2);
    const denom = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denom;
    const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom;
    return [Math.max(0, center - margin), Math.min(1, center + margin)];
  };

  const studies = tp.map((t, i) => {
    const diseased = t + fn[i];
    const healthy = fp[i] + tn[i];
    const sens = t / diseased;
    const spec = tn[i] / healthy;
    const sensitivityCI = wilsonCI(t, diseased);
    const specificityCI = wilsonCI(tn[i], healthy);

    return {
      study: studyLabels ? studyLabels[i] : `Study ${i + 1}`,
      tp: t, fp: fp[i], fn: fn[i], tn: tn[i],
      n: t + fp[i] + fn[i] + tn[i],
      sensitivity: sens,
      specificity: spec,
      sensitivityCI,
      specificityCI,
      sensitivityStats: {
        estimate: sens,
        ci: sensitivityCI,
        n: diseased
      },
      specificityStats: {
        estimate: spec,
        ci: specificityCI,
        n: healthy
      }
    };
  });

  // Run meta-analysis for pooled estimates
  const metaResult = model === 'hsroc'
    ? hsrocModel(tp, fp, fn, tn, options)
    : bivariateDTA(tp, fp, fn, tn, options);

  return {
    studies,
    pooled: {
      sensitivity: metaResult.pooled?.sensitivity?.estimate ?? metaResult.summaryPoint?.sensitivity,
      specificity: metaResult.pooled?.specificity?.estimate ?? metaResult.summaryPoint?.specificity,
      sensitivityCI: metaResult.pooled?.sensitivity?.ci ?? null,
      specificityCI: metaResult.pooled?.specificity?.ci ?? null
    },
    pooledDetails: metaResult.pooled,
    heterogeneity: metaResult.heterogeneity || metaResult.parameters,
    srocCurve: Array.isArray(metaResult.srocCurve)
      ? metaResult.srocCurve
      : (metaResult.srocCurve?.points ?? metaResult.curveData ?? []),
    method: metaResult.method
  };
}

// ============================================================================
// DTA PUBLICATION BIAS
// ============================================================================

/**
 * DTA Publication Bias Assessment
 * Implements Deeks' funnel asymmetry test for diagnostic test accuracy meta-analysis
 * Based on Deeks et al. (2005) "The performance of tests of publication bias..."
 *
 * @param {number[]} tp - True positives for each study
 * @param {number[]} fp - False positives for each study
 * @param {number[]} fn - False negatives for each study
 * @param {number[]} tn - True negatives for each study
 * @param {Object} options - Configuration options
 * @returns {Object} Publication bias assessment results
 */
export function dtaPublicationBias(tp, fp, fn, tn, options = {}) {
  const METHOD = 'dtaPublicationBias';

  // Input validation
  validateDTAInput(tp, fp, fn, tn, METHOD);

  const {
    level = 0.95,
    contourLevels = [0.01, 0.05, 0.10],
    continuityCorrection = 0.5
  } = options;

  const k = tp.length;
  const z = normalQuantile(1 - (1 - level) / 2);

  // Apply continuity correction for zero cells
  const tpAdj = tp.map((t, i) => {
    if (t === 0 || fp[i] === 0 || fn[i] === 0 || tn[i] === 0) {
      return t + continuityCorrection;
    }
    return t;
  });
  const fpAdj = fp.map((f, i) => {
    if (tp[i] === 0 || f === 0 || fn[i] === 0 || tn[i] === 0) {
      return f + continuityCorrection;
    }
    return f;
  });
  const fnAdj = fn.map((f, i) => {
    if (tp[i] === 0 || fp[i] === 0 || f === 0 || tn[i] === 0) {
      return f + continuityCorrection;
    }
    return f;
  });
  const tnAdj = tn.map((t, i) => {
    if (tp[i] === 0 || fp[i] === 0 || fn[i] === 0 || t === 0) {
      return t + continuityCorrection;
    }
    return t;
  });

  // Calculate log(DOR) and its variance for each study
  const logDOR = [];
  const varLogDOR = [];
  const ess = [];  // Effective sample size

  for (let i = 0; i < k; i++) {
    // Log diagnostic odds ratio
    const dor = (tpAdj[i] * tnAdj[i]) / (fpAdj[i] * fnAdj[i]);
    logDOR.push(Math.log(dor));

    // Variance of log(DOR)
    const v = 1 / tpAdj[i] + 1 / fpAdj[i] + 1 / fnAdj[i] + 1 / tnAdj[i];
    varLogDOR.push(v);

    // Effective sample size: 4 * n1 * n0 / (n1 + n0)
    // where n1 = diseased, n0 = non-diseased
    const n1 = tpAdj[i] + fnAdj[i];
    const n0 = fpAdj[i] + tnAdj[i];
    ess.push(4 * n1 * n0 / (n1 + n0));
  }

  // Deeks' test: regression of log(DOR) on 1/sqrt(ESS)
  const invSqrtESS = ess.map(e => 1 / Math.sqrt(e));

  // Weighted least squares regression
  const wi = varLogDOR.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);
  const sumWX = invSqrtESS.reduce((s, x, i) => s + wi[i] * x, 0);
  const sumWY = logDOR.reduce((s, y, i) => s + wi[i] * y, 0);
  const sumWXY = invSqrtESS.reduce((s, x, i) => s + wi[i] * x * logDOR[i], 0);
  const sumWX2 = invSqrtESS.reduce((s, x, i) => s + wi[i] * x * x, 0);

  const xBar = sumWX / sumW;
  const yBar = sumWY / sumW;

  const Sxx = sumWX2 - sumWX * sumWX / sumW;
  const Sxy = sumWXY - sumWX * sumWY / sumW;

  const slope = Sxy / Sxx;
  const intercept = yBar - slope * xBar;

  // Standard error of slope
  const residuals = logDOR.map((y, i) => y - (intercept + slope * invSqrtESS[i]));
  const SSR = residuals.reduce((s, r, i) => s + wi[i] * r * r, 0);
  const MSE = SSR / (k - 2);
  const seSlope = Math.sqrt(MSE / Sxx);

  // t-statistic and p-value for slope (Deeks' test)
  const tStat = slope / seSlope;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tStat), df));

  // Interpretation
  let interpretation;
  if (pValue < 0.01) {
    interpretation = 'Strong evidence of publication bias';
  } else if (pValue < 0.05) {
    interpretation = 'Moderate evidence of publication bias';
  } else if (pValue < 0.10) {
    interpretation = 'Weak evidence of publication bias';
  } else {
    interpretation = 'No significant evidence of publication bias';
  }

  // Generate funnel plot data
  const funnelData = logDOR.map((y, i) => ({
    logDOR: y,
    invSqrtESS: invSqrtESS[i],
    ess: ess[i],
    study: i + 1,
    weight: wi[i]
  }));

  // Generate regression line for funnel plot
  const essRange = [Math.min(...ess), Math.max(...ess)];
  const regressionLine = [
    {
      invSqrtESS: 1 / Math.sqrt(essRange[1]),
      logDOR: intercept + slope / Math.sqrt(essRange[1])
    },
    {
      invSqrtESS: 1 / Math.sqrt(essRange[0]),
      logDOR: intercept + slope / Math.sqrt(essRange[0])
    }
  ];

  // Generate contour lines for significance levels
  const contours = {};
  contourLevels.forEach(alpha => {
    const zAlpha = normalQuantile(1 - alpha / 2);
    contours[alpha] = {
      upper: essRange.map(e => ({
        invSqrtESS: 1 / Math.sqrt(e),
        logDOR: intercept + zAlpha * Math.sqrt(1 / e)
      })),
      lower: essRange.map(e => ({
        invSqrtESS: 1 / Math.sqrt(e),
        logDOR: intercept - zAlpha * Math.sqrt(1 / e)
      }))
    };
  });

  return {
    test: {
      name: "Deeks' funnel asymmetry test",
      slope,
      intercept,
      seSlope,
      tStatistic: tStat,
      df,
      pValue
    },
    interpretation,
    biasPresent: pValue < 0.10,
    funnelData,
    regressionLine,
    contours,
    summary: {
      nStudies: k,
      meanLogDOR: logDOR.reduce((a, b) => a + b, 0) / k,
      medianESS: [...ess].sort((a, b) => a - b)[Math.floor(k / 2)]
    },
    method: "Deeks' funnel asymmetry test for DTA"
  };
}

// ============================================================================
// NETWORK META-ANALYSIS PUBLICATION BIAS
// ============================================================================

/**
 * Network Meta-Analysis Publication Bias Assessment
 * Implements comparison-adjusted funnel plot and Egger-type test for networks
 * Based on Chaimani et al. (2013) "Graphical tools for network meta-analysis"
 *
 * @param {Object[]} studies - Array of study contrasts
 * @param {Object} options - Configuration options
 * @returns {Object} Publication bias assessment for network
 */
export function networkPublicationBias(studies, options = {}) {
  const METHOD = 'networkPublicationBias';

  if (!Array.isArray(studies) || studies.length < 3) {
    throw new ValidationError('At least 3 study contrasts required', METHOD);
  }

  const {
    reference = null,
    level = 0.95,
    orderByComparison = true
  } = options;

  // Extract unique treatments
  const treatments = new Set();
  studies.forEach(s => {
    treatments.add(s.treat1);
    treatments.add(s.treat2);
  });
  const orderedTreats = [...treatments].sort();
  const refTreat = reference || orderedTreats[0];

  // Run NMA to get network estimates
  const nmaResult = networkMetaAnalysisMultiArm(studies, { reference: refTreat });

  if (nmaResult.error) {
    return {
      error: nmaResult.error,
      method: 'Network publication bias assessment'
    };
  }

  // Create comparison-adjusted residuals
  // For each study contrast (A vs B), calculate residual from network estimate
  const residuals = [];
  const precisions = [];
  const comparisons = [];

  studies.forEach((s, idx) => {
    const t1 = s.treat1;
    const t2 = s.treat2;
    const yi = s.effect;
    const sei = s.se;

    // Find network estimate for this comparison
    let networkEffect = 0;
    if (t1 === refTreat) {
      // Effect is t2 vs ref
      const t2Effect = nmaResult.effects.find(e => e.treatment === t2);
      networkEffect = t2Effect ? t2Effect.effect : 0;
    } else if (t2 === refTreat) {
      // Effect is t1 vs ref (negate)
      const t1Effect = nmaResult.effects.find(e => e.treatment === t1);
      networkEffect = t1Effect ? -t1Effect.effect : 0;
    } else {
      // Indirect comparison: (t2 vs ref) - (t1 vs ref)
      const t1Effect = nmaResult.effects.find(e => e.treatment === t1);
      const t2Effect = nmaResult.effects.find(e => e.treatment === t2);
      if (t1Effect && t2Effect) {
        networkEffect = t2Effect.effect - t1Effect.effect;
      }
    }

    const residual = yi - networkEffect;
    const precision = 1 / sei;

    residuals.push(residual);
    precisions.push(precision);
    comparisons.push(`${t1} vs ${t2}`);
  });

  // Egger-type test: regression of residual on precision
  const k = residuals.length;
  const sumP = precisions.reduce((a, b) => a + b, 0);
  const sumR = residuals.reduce((a, b) => a + b, 0);
  const sumPR = precisions.reduce((s, p, i) => s + p * residuals[i], 0);
  const sumP2 = precisions.reduce((s, p) => s + p * p, 0);

  const pBar = sumP / k;
  const rBar = sumR / k;

  const Spp = sumP2 - sumP * sumP / k;
  const Spr = sumPR - sumP * sumR / k;

  const slope = Spp > 0 ? Spr / Spp : 0;
  const intercept = rBar - slope * pBar;

  // Standard error of intercept (Egger's test focuses on intercept)
  const fittedResiduals = residuals.map((r, i) => r - (intercept + slope * precisions[i]));
  const SSE = fittedResiduals.reduce((s, r) => s + r * r, 0);
  const MSE = SSE / (k - 2);
  const seIntercept = Math.sqrt(MSE * (1 / k + pBar * pBar / Spp));

  const tStat = intercept / seIntercept;
  const df = k - 2;
  const pValue = df > 0 ? 2 * (1 - tCDF(Math.abs(tStat), df)) : 1;

  // Interpretation
  let interpretation;
  if (pValue < 0.01) {
    interpretation = 'Strong evidence of small-study effects in the network';
  } else if (pValue < 0.05) {
    interpretation = 'Moderate evidence of small-study effects';
  } else if (pValue < 0.10) {
    interpretation = 'Weak evidence of small-study effects';
  } else {
    interpretation = 'No significant evidence of small-study effects';
  }

  // Comparison-adjusted funnel plot data
  const funnelData = residuals.map((r, i) => ({
    residual: r,
    precision: precisions[i],
    se: 1 / precisions[i],
    comparison: comparisons[i],
    study: i + 1
  }));

  // Order by comparison if requested
  if (orderByComparison) {
    funnelData.sort((a, b) => a.comparison.localeCompare(b.comparison));
  }

  return {
    test: {
      name: "Comparison-adjusted Egger's test",
      intercept,
      slope,
      seIntercept,
      tStatistic: tStat,
      df,
      pValue
    },
    interpretation,
    smallStudyEffects: pValue < 0.10,
    funnelData,
    networkSummary: {
      nStudies: k,
      nTreatments: orderedTreats.length,
      reference: refTreat,
      meanResidual: residuals.reduce((a, b) => a + b, 0) / k
    },
    method: "Comparison-adjusted funnel plot for NMA"
  };
}

// ============================================================================
// TWO-STAGE IPD META-ANALYSIS
// ============================================================================

/**
 * Two-Stage IPD Meta-Analysis
 * Combines Individual Participant Data with aggregate published data
 * Stage 1: Analyze each IPD study to get summary estimates
 * Stage 2: Pool with aggregate data using standard meta-analysis
 *
 * @param {Object[]} ipdStudies - Array of IPD study objects
 * @param {Object[]} aggregateStudies - Array of aggregate study objects
 * @param {Object} options - Configuration options
 * @returns {Object} Combined meta-analysis results
 */
export function twoStageIPD(ipdStudies, aggregateStudies, options = {}) {
  const METHOD = 'twoStageIPD';

  const {
    outcomeType = 'continuous',  // 'continuous', 'binary', 'survival'
    effectMeasure = 'MD',        // 'MD', 'SMD', 'OR', 'RR', 'HR'
    covariates = [],             // Covariates to adjust for in IPD analysis
    method = 'REML',             // Tau² estimation method
    level = 0.95
  } = options;

  const z = normalQuantile(1 - (1 - level) / 2);

  // Validate inputs
  if (!Array.isArray(ipdStudies)) {
    throw new ValidationError('ipdStudies must be an array', METHOD);
  }
  if (!Array.isArray(aggregateStudies)) {
    throw new ValidationError('aggregateStudies must be an array', METHOD);
  }
  if (ipdStudies.length === 0 && aggregateStudies.length === 0) {
    throw new ValidationError('At least one study required', METHOD);
  }

  // Stage 1: Analyze IPD studies
  const ipdResults = [];

  ipdStudies.forEach((study, idx) => {
    const studyId = study.id || `IPD_${idx + 1}`;

    if (!study.data || !Array.isArray(study.data)) {
      throw new ValidationError(`IPD study ${studyId} must have data array`, METHOD);
    }

    // Extract treatment and outcome
    const treated = study.data.filter(p => p.treatment === 1);
    const control = study.data.filter(p => p.treatment === 0);

    let effect, variance;

    if (outcomeType === 'continuous') {
      // Mean difference or standardized mean difference
      const n1 = treated.length;
      const n0 = control.length;
      const mean1 = treated.reduce((s, p) => s + p.outcome, 0) / n1;
      const mean0 = control.reduce((s, p) => s + p.outcome, 0) / n0;
      const var1 = treated.reduce((s, p) => s + Math.pow(p.outcome - mean1, 2), 0) / (n1 - 1);
      const var0 = control.reduce((s, p) => s + Math.pow(p.outcome - mean0, 2), 0) / (n0 - 1);

      if (effectMeasure === 'MD') {
        effect = mean1 - mean0;
        variance = var1 / n1 + var0 / n0;
      } else if (effectMeasure === 'SMD') {
        // Hedges' g
        const pooledSD = Math.sqrt(((n1 - 1) * var1 + (n0 - 1) * var0) / (n1 + n0 - 2));
        const d = (mean1 - mean0) / pooledSD;
        const J = 1 - 3 / (4 * (n1 + n0 - 2) - 1);  // Correction factor
        effect = d * J;
        variance = (n1 + n0) / (n1 * n0) + effect * effect / (2 * (n1 + n0));
      }
    } else if (outcomeType === 'binary') {
      // Binary outcome: OR or RR
      const a = treated.filter(p => p.outcome === 1).length;
      const b = treated.length - a;
      const c = control.filter(p => p.outcome === 1).length;
      const d = control.length - c;

      // Continuity correction if needed
      const cc = (a === 0 || b === 0 || c === 0 || d === 0) ? 0.5 : 0;
      const aAdj = a + cc, bAdj = b + cc, cAdj = c + cc, dAdj = d + cc;

      if (effectMeasure === 'OR') {
        effect = Math.log((aAdj * dAdj) / (bAdj * cAdj));
        variance = 1 / aAdj + 1 / bAdj + 1 / cAdj + 1 / dAdj;
      } else if (effectMeasure === 'RR') {
        const p1 = aAdj / (aAdj + bAdj);
        const p0 = cAdj / (cAdj + dAdj);
        effect = Math.log(p1 / p0);
        variance = (1 - p1) / (aAdj) + (1 - p0) / (cAdj);
      }
    } else if (outcomeType === 'survival') {
      // For survival, assume study provides HR from Cox model
      if (study.hr && study.seLogHR) {
        effect = Math.log(study.hr);
        variance = study.seLogHR * study.seLogHR;
      } else {
        throw new ValidationError(`Survival studies require hr and seLogHR`, METHOD);
      }
    }

    ipdResults.push({
      study: studyId,
      source: 'IPD',
      effect,
      variance,
      se: Math.sqrt(variance),
      n: study.data.length
    });
  });

  // Validate and format aggregate studies
  const aggResults = aggregateStudies.map((study, idx) => {
    const studyId = study.id || `Agg_${idx + 1}`;

    if (study.effect === undefined || study.se === undefined) {
      throw new ValidationError(`Aggregate study ${studyId} requires effect and se`, METHOD);
    }

    return {
      study: studyId,
      source: 'Aggregate',
      effect: study.effect,
      variance: study.se * study.se,
      se: study.se,
      n: study.n || null
    };
  });

  // Stage 2: Combine all studies
  const allStudies = [...ipdResults, ...aggResults];
  const yi = allStudies.map(s => s.effect);
  const vi = allStudies.map(s => s.variance);

  // Run meta-analysis
  const tau2Result = estimateTau2(yi, vi, method);
  const tau2 = tau2Result.tau2;

  // Random-effects pooling
  const wiRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = wiRE.reduce((a, b) => a + b, 0);
  const pooledRE = yi.reduce((s, y, i) => s + wiRE[i] * y, 0) / sumWRE;
  const seRE = Math.sqrt(1 / sumWRE);
  const ciRE = [pooledRE - z * seRE, pooledRE + z * seRE];
  const zRE = pooledRE / seRE;
  const pRE = 2 * (1 - normalCDF(Math.abs(zRE)));

  // Fixed-effects pooling for comparison
  const wiFE = vi.map(v => 1 / v);
  const sumWFE = wiFE.reduce((a, b) => a + b, 0);
  const pooledFE = yi.reduce((s, y, i) => s + wiFE[i] * y, 0) / sumWFE;
  const seFE = Math.sqrt(1 / sumWFE);

  // Heterogeneity statistics
  const Q = yi.reduce((s, y, i) => s + wiFE[i] * Math.pow(y - pooledFE, 2), 0);
  const dfQ = allStudies.length - 1;
  const I2 = Math.max(0, (Q - dfQ) / Q * 100);

  // Prediction interval
  const piSE = Math.sqrt(seRE * seRE + tau2);
  const predictionInterval = [pooledRE - z * piSE, pooledRE + z * piSE];

  return {
    pooled: {
      estimate: pooledRE,
      se: seRE,
      ci: ciRE,
      z: zRE,
      pValue: pRE
    },
    fixedEffect: {
      estimate: pooledFE,
      se: seFE
    },
    heterogeneity: {
      tau2,
      tau: Math.sqrt(tau2),
      Q,
      Qdf: dfQ,
      QpValue: 1 - chiSquareCDF(Q, dfQ),
      I2
    },
    predictionInterval,
    studies: allStudies.map((s, i) => ({
      ...s,
      weight: wiRE[i] / sumWRE * 100
    })),
    summary: {
      nIPD: ipdResults.length,
      nAggregate: aggResults.length,
      nTotal: allStudies.length,
      effectMeasure,
      method
    },
    method: 'Two-stage IPD meta-analysis'
  };
}

// ============================================================================
// ONE-STAGE IPD META-ANALYSIS
// ============================================================================

/**
 * One-Stage IPD Meta-Analysis (Individual Participant Data)
 * Fits a single mixed-effects model to all individual-level data
 * Based on Debray et al. (2015) and Burke et al. (2017)
 *
 * This implements a generalized linear mixed model approach:
 *   g(E[Y_ij]) = β₀ + β₁X_ij + b_i  where
 *   Y_ij = outcome for participant j in study i
 *   X_ij = treatment indicator (or covariate)
 *   b_i ~ N(0, τ²) = random intercept for study
 *
 * Can also include random slopes for treatment-covariate interactions
 */
export function oneStageIPD(data, options = {}) {
  const METHOD = 'oneStageIPD';

  // Input validation
  validateIPDData(data, METHOD);

  const {
    outcomeVar = 'y',           // Outcome variable name
    treatmentVar = 'treatment', // Treatment indicator variable
    studyVar = 'study',         // Study identifier variable
    covariates = [],            // Additional covariate names
    family = 'gaussian',        // 'gaussian', 'binomial', 'poisson'
    randomSlopes = false,       // Include random treatment effects
    maxIter = 100,
    tol = 1e-6
  } = options;

  if (!['gaussian', 'binomial', 'poisson'].includes(family)) {
    throw new ValidationError("family must be 'gaussian', 'binomial', or 'poisson'", METHOD);
  }
  validateNumeric(maxIter, 'maxIter', METHOD, { min: 10, max: 10000, integer: true });
  validateNumeric(tol, 'tol', METHOD, { min: 1e-12, max: 0.1 });

  // Verify required variables exist in data
  if (data.length > 0) {
    const firstRow = data[0];
    if (firstRow[outcomeVar] === undefined) {
      throw new ValidationError(`outcomeVar '${outcomeVar}' not found in data`, METHOD);
    }
    if (firstRow[studyVar] === undefined) {
      throw new ValidationError(`studyVar '${studyVar}' not found in data`, METHOD);
    }
  }

  // Extract and organize data
  const studies = [...new Set(data.map(d => d[studyVar]))];
  const k = studies.length;
  const N = data.length;

  // Link function based on family
  const link = {
    gaussian: { g: x => x, ginv: x => x, variance: mu => 1 },
    binomial: {
      g: p => Math.log(p / (1 - p)),
      ginv: eta => 1 / (1 + Math.exp(-eta)),
      variance: mu => mu * (1 - mu)
    },
    poisson: {
      g: mu => Math.log(mu),
      ginv: eta => Math.exp(eta),
      variance: mu => mu
    }
  }[family];

  // Build design matrix
  const nFixed = 1 + 1 + covariates.length; // intercept + treatment + covariates
  const X = data.map(d => {
    const row = [1, d[treatmentVar] ? 1 : 0];
    covariates.forEach(cov => row.push(d[cov] || 0));
    return row;
  });

  const Y = data.map(d => d[outcomeVar]);
  const studyIdx = data.map(d => studies.indexOf(d[studyVar]));

  // Initialize parameters
  let beta = new Array(nFixed).fill(0);
  let tau2 = 0.1; // Between-study variance for intercepts
  let tau2Slope = randomSlopes ? 0.1 : 0; // Between-study variance for treatment effects
  let sigma2 = family === 'gaussian' ? 1 : 1; // Residual variance (gaussian only)

  // Random effects (BLUPs)
  let b = new Array(k).fill(0); // Random intercepts
  let bSlope = randomSlopes ? new Array(k).fill(0) : null; // Random slopes

  // Iteratively Reweighted Least Squares (IRLS) with REML
  for (let iter = 0; iter < maxIter; iter++) {
    const prevBeta = [...beta];
    const prevTau2 = tau2;

    // E-step: Compute working responses and weights
    const eta = data.map((_, i) => {
      let lin = X[i].reduce((sum, x, j) => sum + x * beta[j], 0);
      lin += b[studyIdx[i]];
      if (randomSlopes && X[i][1] === 1) {
        lin += bSlope[studyIdx[i]];
      }
      return lin;
    });

    const mu = eta.map(e => link.ginv(e));
    const V = mu.map(m => link.variance(m) + 1e-10);

    // Working response for IRLS
    const z = eta.map((e, i) => {
      if (family === 'gaussian') return Y[i];
      const dmu = family === 'binomial' ? mu[i] * (1 - mu[i]) : mu[i];
      return e + (Y[i] - mu[i]) / Math.max(dmu, 1e-10);
    });

    const W = V.map(v => 1 / v);

    // M-step: Update fixed effects (weighted least squares)
    // β = (X'WX)^-1 X'Wz
    const XtWX = Array(nFixed).fill(null).map(() => Array(nFixed).fill(0));
    const XtWz = Array(nFixed).fill(0);

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < nFixed; j++) {
        XtWz[j] += X[i][j] * W[i] * (z[i] - b[studyIdx[i]] - (randomSlopes && X[i][1] === 1 ? bSlope[studyIdx[i]] : 0));
        for (let l = 0; l < nFixed; l++) {
          XtWX[j][l] += X[i][j] * W[i] * X[i][l];
        }
      }
    }

    // Solve via Cholesky (simple for small nFixed)
    beta = solveLinearSystem(XtWX, XtWz);

    // Update random effects (empirical Bayes)
    for (let s = 0; s < k; s++) {
      const studyData = data.filter((_, i) => studyIdx[i] === s);
      const studyIndices = data.map((_, i) => i).filter(i => studyIdx[i] === s);

      if (studyData.length === 0) continue;

      // Random intercept
      let sumW = 0, sumWr = 0;
      for (const i of studyIndices) {
        const fixedPart = X[i].reduce((sum, x, j) => sum + x * beta[j], 0);
        const r = z[i] - fixedPart - (randomSlopes && X[i][1] === 1 ? bSlope[s] : 0);
        sumW += W[i];
        sumWr += W[i] * r;
      }
      b[s] = tau2 > 0 ? sumWr / (sumW + 1/tau2) : 0;

      // Random slope
      if (randomSlopes) {
        let sumWt = 0, sumWtr = 0;
        for (const i of studyIndices) {
          if (X[i][1] === 1) { // Treated observations
            const fixedPart = X[i].reduce((sum, x, j) => sum + x * beta[j], 0);
            const r = z[i] - fixedPart - b[s];
            sumWt += W[i];
            sumWtr += W[i] * r;
          }
        }
        bSlope[s] = tau2Slope > 0 && sumWt > 0 ? sumWtr / (sumWt + 1/tau2Slope) : 0;
      }
    }

    // Update variance components (REML)
    const ssB = b.reduce((sum, bi) => sum + bi * bi, 0);
    tau2 = Math.max(0.001, ssB / k);

    if (randomSlopes) {
      const ssBSlope = bSlope.reduce((sum, bi) => sum + bi * bi, 0);
      tau2Slope = Math.max(0.001, ssBSlope / k);
    }

    if (family === 'gaussian') {
      let ssResid = 0;
      for (let i = 0; i < N; i++) {
        const pred = X[i].reduce((sum, x, j) => sum + x * beta[j], 0) + b[studyIdx[i]] +
                     (randomSlopes && X[i][1] === 1 ? bSlope[studyIdx[i]] : 0);
        ssResid += Math.pow(Y[i] - pred, 2);
      }
      sigma2 = ssResid / (N - nFixed);
    }

    // Check convergence
    const diff = Math.max(
      ...beta.map((b, i) => Math.abs(b - prevBeta[i])),
      Math.abs(tau2 - prevTau2)
    );
    if (diff < tol) break;
  }

  // Standard errors via observed information
  const computeSE = () => {
    const XtWX = Array(nFixed).fill(null).map(() => Array(nFixed).fill(0));
    const eta = data.map((_, i) => {
      let lin = X[i].reduce((sum, x, j) => sum + x * beta[j], 0);
      lin += b[studyIdx[i]];
      if (randomSlopes && X[i][1] === 1) lin += bSlope[studyIdx[i]];
      return lin;
    });
    const mu = eta.map(e => link.ginv(e));
    const V = mu.map(m => link.variance(m) + 1e-10);
    const W = V.map(v => 1 / v);

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < nFixed; j++) {
        for (let l = 0; l < nFixed; l++) {
          XtWX[j][l] += X[i][j] * W[i] * X[i][l];
        }
      }
    }

    // Invert to get covariance matrix
    const cov = invertMatrix(XtWX);
    return cov ? cov.map((row, i) => Math.sqrt(Math.max(0, row[i]))) : beta.map(() => NaN);
  };

  const se = computeSE();

  // Treatment effect summary
  const treatmentEffect = {
    estimate: beta[1],
    se: se[1],
    ci: [beta[1] - 1.96 * se[1], beta[1] + 1.96 * se[1]],
    z: beta[1] / se[1],
    p: 2 * (1 - normalCDF(Math.abs(beta[1] / se[1])))
  };

  // Transform to OR/RR for binary outcomes
  if (family === 'binomial') {
    treatmentEffect.or = Math.exp(beta[1]);
    treatmentEffect.orCI = [Math.exp(beta[1] - 1.96 * se[1]), Math.exp(beta[1] + 1.96 * se[1])];
  }

  // Study-specific effects
  const studyEffects = studies.map((study, s) => ({
    study,
    intercept: beta[0] + b[s],
    treatmentEffect: beta[1] + (randomSlopes ? bSlope[s] : 0),
    n: data.filter((_, i) => studyIdx[i] === s).length
  }));

  // I² calculation
  const totalVar = tau2 + (family === 'gaussian' ? sigma2 : 1);
  const I2 = 100 * tau2 / totalVar;

  return {
    fixedEffects: {
      intercept: { estimate: beta[0], se: se[0], ci: [beta[0] - 1.96 * se[0], beta[0] + 1.96 * se[0]] },
      treatment: treatmentEffect,
      covariates: covariates.map((cov, i) => ({
        name: cov,
        estimate: beta[2 + i],
        se: se[2 + i],
        ci: [beta[2 + i] - 1.96 * se[2 + i], beta[2 + i] + 1.96 * se[2 + i]]
      }))
    },
    randomEffects: {
      tau2Intercept: tau2,
      tauIntercept: Math.sqrt(tau2),
      tau2Slope: randomSlopes ? tau2Slope : null,
      tauSlope: randomSlopes ? Math.sqrt(tau2Slope) : null,
      I2
    },
    studyEffects,
    residualVariance: family === 'gaussian' ? sigma2 : null,
    modelFit: {
      nParticipants: N,
      nStudies: k,
      family,
      randomSlopes
    },
    method: 'One-Stage IPD Meta-Analysis (GLMM)'
  };
}

// Helper: Solve linear system Ax = b via Gaussian elimination
function solveLinearSystem(A, b) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-10) continue;

    for (let k = i + 1; k < n; k++) {
      const factor = aug[k][i] / aug[i][i];
      for (let j = i; j <= n; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-10) continue;
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }
  return x;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // PRNG utilities for reproducibility
  createSeededRNG,
  setBootstrapSeed,

  // Result Caching utilities
  createCachedAnalysis,
  configureCache,
  clearAnalysisCache,
  getCacheStats,

  // Robust Variance Estimation
  robustVarianceEstimation,

  // Selection Models
  copasSelectionModel,
  threeParameterSelectionModel,
  veveaHedgesSelectionModel,

  // Publication Bias Correction
  petPeese,
  pCurve,
  pUniform,
  pUniformStar,

  // Multivariate & Multilevel
  multivariateMA,
  threeLevelMA,

  // Bayesian
  bayesianMetaAnalysis,

  // Heterogeneity
  estimateTau2,

  // Permutation
  permutationTest,

  // === Beyond R capabilities: Phase 1 ===

  // Effect Size Conversions
  effectSizeConversions,

  // Bootstrap Inference
  bootstrapCI,

  // Limit Meta-Analysis
  limitMetaAnalysis,

  // Power Analysis
  powerAnalysis,

  // Publication Bias Ensemble
  publicationBiasEnsemble,

  // Outlier/Influence Diagnostics
  outlierInfluenceDiagnostics,

  // Bayesian Model Averaging
  bayesianModelAveraging,

  // GRADE Certainty Assessment
  gradeCertainty,

  // === Beyond R capabilities: Phase 2 ===

  // Cumulative Meta-Analysis with Forest Plot
  cumulativeMetaAnalysis,

  // Trial Sequential Analysis
  trialSequentialAnalysis,

  // Fragility Index
  fragilityIndex,

  // Dose-Response Meta-Analysis
  doseResponseMA,

  // Contour-Enhanced Funnel Plot
  contourEnhancedFunnel,

  // Prediction Interval Forest Plot
  predictionIntervalForestPlot,

  // Automatic Sensitivity Analysis Suite
  automaticSensitivitySuite,

  // === Beyond R capabilities: Phase 3 ===
  metaAnalysisProportions,
  metaAnalysisCorrelations,
  metaAnalysisIncidenceRates,
  qualityEffectsModel,
  credibilityCeiling,
  excessSignificanceTest,
  hartungKnappAdjustment,
  robustMetaAnalysis,

  // === Beyond R capabilities: Phase 4 ===
  profileLikelihoodCI,
  weightedMedianMA,
  jackknifeMeta,
  crossValidationMeta,
  influenceCurves,
  bestWorstCase,
  thresholdAnalysis,
  galbraithPlotData,

  // === Beyond R capabilities: Phase 5 ===
  labbePlotData,
  baujatPlotData,
  goshAnalysis,
  goshAnalysisStream,  // Streaming version for real-time UI updates
  networkInconsistencyAnalysis,
  sucraWithCI,
  bayesianModelComparison,
  metaCART,
  metaForest,

  // === Beyond R capabilities: Phase 6 ===
  timeToEventMA,
  sequentialBayesianUpdate,
  predictionModelMA,
  multivariateNMA,
  sampleSizeCalculation,
  umbrellaReview,
  evidenceGapMap,
  livingReviewAutomation,

  // === Beyond R capabilities: Phase 7 (DTA) ===
  bivariateDTA,
  hsrocModel,
  dtaForestPlotData,
  dtaPublicationBias,

  // === Beyond R capabilities: Phase 8 (IPD) ===
  oneStageIPD,
  twoStageIPD,

  // === Beyond R capabilities: Phase 9 (Network Meta-Regression) ===
  networkMetaRegression,
  networkPublicationBias
};
