/**
 * Validation utilities
 * Living Meta-Analysis Platform
 */

/**
 * Validate NCT ID format
 * @param {string} nctId
 * @returns {boolean}
 */
export function isValidNCTId(nctId) {
  if (!nctId) return false;
  return /^NCT\d{8}$/i.test(nctId.trim());
}

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate number is positive
 * @param {number} value
 * @returns {boolean}
 */
export function isPositive(value) {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

/**
 * Validate number is non-negative
 * @param {number} value
 * @returns {boolean}
 */
export function isNonNegative(value) {
  return typeof value === 'number' && !isNaN(value) && value >= 0;
}

/**
 * Validate number is in range
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
export function isInRange(value, min, max) {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
}

/**
 * Validate probability (0-1)
 * @param {number} value
 * @returns {boolean}
 */
export function isProbability(value) {
  return isInRange(value, 0, 1);
}

/**
 * Validate percentage (0-100)
 * @param {number} value
 * @returns {boolean}
 */
export function isPercentage(value) {
  return isInRange(value, 0, 100);
}

/**
 * Validate date string
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isValidDate(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validate 2x2 table data
 * @param {Object} table - { a, b, c, d }
 * @returns {Object} { valid, errors }
 */
export function validate2x2Table(table) {
  const errors = [];
  const { a, b, c, d } = table;

  if (!isNonNegative(a)) errors.push('Cell a must be a non-negative number');
  if (!isNonNegative(b)) errors.push('Cell b must be a non-negative number');
  if (!isNonNegative(c)) errors.push('Cell c must be a non-negative number');
  if (!isNonNegative(d)) errors.push('Cell d must be a non-negative number');

  if (errors.length === 0) {
    const n1 = a + b;
    const n0 = c + d;
    if (n1 === 0) errors.push('Treatment group has zero subjects');
    if (n0 === 0) errors.push('Control group has zero subjects');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate continuous outcome data
 * @param {Object} data - { m1, sd1, n1, m0, sd0, n0 }
 * @returns {Object} { valid, errors }
 */
export function validateContinuousData(data) {
  const errors = [];
  const { m1, sd1, n1, m0, sd0, n0 } = data;

  if (typeof m1 !== 'number' || isNaN(m1)) errors.push('Treatment mean must be a number');
  if (typeof m0 !== 'number' || isNaN(m0)) errors.push('Control mean must be a number');
  if (!isPositive(sd1)) errors.push('Treatment SD must be positive');
  if (!isPositive(sd0)) errors.push('Control SD must be positive');
  if (!isPositive(n1) || !Number.isInteger(n1)) errors.push('Treatment N must be a positive integer');
  if (!isPositive(n0) || !Number.isInteger(n0)) errors.push('Control N must be a positive integer');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate meta-analysis input data
 * @param {Object[]} studies - Array of { yi, vi } or { yi, se }
 * @returns {Object} { valid, errors, warnings }
 */
export function validateMetaData(studies) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(studies)) {
    return { valid: false, errors: ['Studies must be an array'], warnings: [] };
  }

  if (studies.length === 0) {
    return { valid: false, errors: ['At least one study is required'], warnings: [] };
  }

  if (studies.length === 1) {
    warnings.push('Meta-analysis with only 1 study is not meaningful');
  }

  if (studies.length < 5) {
    warnings.push('Small number of studies (k < 5) limits statistical power');
  }

  studies.forEach((study, i) => {
    const id = study.id || `Study ${i + 1}`;

    if (typeof study.yi !== 'number' || isNaN(study.yi)) {
      errors.push(`${id}: Effect estimate (yi) must be a number`);
    }

    if (study.vi !== undefined) {
      if (!isPositive(study.vi)) {
        errors.push(`${id}: Variance (vi) must be positive`);
      }
    } else if (study.se !== undefined) {
      if (!isPositive(study.se)) {
        errors.push(`${id}: Standard error (se) must be positive`);
      }
    } else {
      errors.push(`${id}: Must provide variance (vi) or standard error (se)`);
    }
  });

  // Check for outliers
  if (studies.length >= 3) {
    const effects = studies.map(s => s.yi);
    const mean = effects.reduce((a, b) => a + b, 0) / effects.length;
    const sd = Math.sqrt(effects.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / effects.length);

    effects.forEach((e, i) => {
      if (Math.abs(e - mean) > 3 * sd) {
        warnings.push(`Study ${i + 1}: Effect estimate may be an outlier`);
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate search query
 * @param {Object} query
 * @returns {Object} { valid, errors }
 */
export function validateSearchQuery(query) {
  const errors = [];

  if (!query.condition && !query.intervention && !query.term) {
    errors.push('At least one search term is required');
  }

  if (query.startDate && !isValidDate(query.startDate)) {
    errors.push('Invalid start date format');
  }

  if (query.endDate && !isValidDate(query.endDate)) {
    errors.push('Invalid end date format');
  }

  if (query.startDate && query.endDate) {
    if (new Date(query.startDate) > new Date(query.endDate)) {
      errors.push('Start date cannot be after end date');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate project data
 * @param {Object} project
 * @returns {Object} { valid, errors }
 */
export function validateProject(project) {
  const errors = [];

  if (!project.name || project.name.trim().length === 0) {
    errors.push('Project name is required');
  }

  if (project.name && project.name.length > 200) {
    errors.push('Project name must be 200 characters or less');
  }

  if (project.description && project.description.length > 2000) {
    errors.push('Description must be 2000 characters or less');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize string input
 * @param {string} str
 * @returns {string}
 */
export function sanitizeString(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .replace(/\s+/g, ' '); // Collapse multiple spaces
}

/**
 * Sanitize number input
 * @param {*} value
 * @param {number} defaultValue
 * @returns {number}
 */
export function sanitizeNumber(value, defaultValue = 0) {
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Sanitize integer input
 * @param {*} value
 * @param {number} defaultValue
 * @returns {number}
 */
export function sanitizeInteger(value, defaultValue = 0) {
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

export default {
  isValidNCTId,
  isValidEmail,
  isPositive,
  isNonNegative,
  isInRange,
  isProbability,
  isPercentage,
  isValidDate,
  validate2x2Table,
  validateContinuousData,
  validateMetaData,
  validateSearchQuery,
  validateProject,
  sanitizeString,
  sanitizeNumber,
  sanitizeInteger
};
