/**
 * Formatting utilities
 * Living Meta-Analysis Platform
 */

/**
 * Format a number with specified decimal places
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toFixed(decimals);
}

/**
 * Format a number with locale-specific separators
 * @param {number} value
 * @param {Object} options
 * @returns {string}
 */
export function formatLocaleNumber(value, options = {}) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toLocaleString('en-US', options);
}

/**
 * Format a percentage
 * @param {number} value - Value between 0 and 100
 * @param {number} decimals
 * @returns {string}
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a p-value with scientific notation for small values
 * @param {number} p
 * @returns {string}
 */
export function formatPValue(p) {
  if (p === null || p === undefined || isNaN(p)) return '—';
  if (p < 0.001) return `< 0.001`;
  if (p < 0.01) return p.toFixed(3);
  return p.toFixed(2);
}

/**
 * Format effect estimate with confidence interval
 * @param {number} estimate
 * @param {number} lower
 * @param {number} upper
 * @param {number} decimals
 * @returns {string}
 */
export function formatEffect(estimate, lower, upper, decimals = 2) {
  const est = formatNumber(estimate, decimals);
  const lo = formatNumber(lower, decimals);
  const hi = formatNumber(upper, decimals);
  return `${est} [${lo}, ${hi}]`;
}

/**
 * Format a date
 * @param {string|Date} date
 * @param {string} format - 'short', 'medium', 'long', 'iso'
 * @returns {string}
 */
export function formatDate(date, format = 'medium') {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  switch (format) {
    case 'short':
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

    case 'medium':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

    case 'long':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });

    case 'iso':
      return d.toISOString().split('T')[0];

    default:
      return d.toLocaleDateString();
  }
}

/**
 * Format relative time (e.g., "2 days ago")
 * @param {string|Date} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  if (diffWeek < 4) return `${diffWeek} week${diffWeek > 1 ? 's' : ''} ago`;
  if (diffMonth < 12) return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
  return `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
}

/**
 * Format file size
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format duration in seconds
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}m ${sec}s`;
  }

  const hr = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return `${hr}h ${min}m`;
}

/**
 * Truncate text with ellipsis
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format NCT ID
 * @param {string} nctId
 * @returns {string}
 */
export function formatNCTId(nctId) {
  if (!nctId) return '';
  return nctId.toUpperCase();
}

/**
 * Format study phase
 * @param {string|string[]} phase
 * @returns {string}
 */
export function formatPhase(phase) {
  if (!phase) return 'N/A';
  const phases = Array.isArray(phase) ? phase : [phase];
  return phases
    .map(p => p.replace('PHASE', 'Phase ').replace('_', '/'))
    .join(', ');
}

/**
 * Format study status
 * @param {string} status
 * @returns {string}
 */
export function formatStatus(status) {
  if (!status) return 'Unknown';

  const statusMap = {
    'COMPLETED': 'Completed',
    'TERMINATED': 'Terminated',
    'ACTIVE_NOT_RECRUITING': 'Active, not recruiting',
    'RECRUITING': 'Recruiting',
    'ENROLLING_BY_INVITATION': 'Enrolling by invitation',
    'NOT_YET_RECRUITING': 'Not yet recruiting',
    'SUSPENDED': 'Suspended',
    'WITHDRAWN': 'Withdrawn',
    'UNKNOWN': 'Unknown'
  };

  return statusMap[status] || status;
}

/**
 * Format heterogeneity interpretation
 * @param {number} i2 - I² value (0-100)
 * @returns {string}
 */
export function formatHeterogeneity(i2) {
  if (i2 === null || i2 === undefined || isNaN(i2)) return '—';

  if (i2 < 25) return 'Low';
  if (i2 < 50) return 'Moderate';
  if (i2 < 75) return 'Substantial';
  return 'Considerable';
}

/**
 * Format risk rating
 * @param {string} risk - 'low', 'moderate', 'high', etc.
 * @returns {Object} { label, class }
 */
export function formatRisk(risk) {
  const map = {
    'none': { label: 'None', class: 'badge-success' },
    'low': { label: 'Low', class: 'badge-success' },
    'moderate': { label: 'Moderate', class: 'badge-warning' },
    'high': { label: 'High', class: 'badge-danger' },
    'very_high': { label: 'Very High', class: 'badge-danger' },
    'not_applicable': { label: 'N/A', class: 'badge-gray' }
  };

  return map[risk] || { label: risk || 'Unknown', class: 'badge-gray' };
}

/**
 * Format EIM grade
 * @param {string} grade - 'A', 'B', 'C', 'D', 'F'
 * @returns {Object}
 */
export function formatEIMGrade(grade) {
  const map = {
    'A': { label: 'A', class: 'badge-success', description: 'Excellent evidence integrity' },
    'B': { label: 'B', class: 'badge-success', description: 'Good evidence integrity' },
    'C': { label: 'C', class: 'badge-warning', description: 'Moderate concerns' },
    'D': { label: 'D', class: 'badge-danger', description: 'Significant concerns' },
    'F': { label: 'F', class: 'badge-danger', description: 'Major integrity issues' }
  };

  return map[grade] || { label: grade, class: 'badge-gray', description: '' };
}

export default {
  formatNumber,
  formatLocaleNumber,
  formatPercent,
  formatPValue,
  formatEffect,
  formatDate,
  formatRelativeTime,
  formatFileSize,
  formatDuration,
  truncate,
  formatNCTId,
  formatPhase,
  formatStatus,
  formatHeterogeneity,
  formatRisk,
  formatEIMGrade
};
