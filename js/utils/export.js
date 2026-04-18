/**
 * Export utilities
 * Living Meta-Analysis Platform
 */

/**
 * Export data as JSON file
 * @param {*} data
 * @param {string} filename
 */
export function exportJSON(data, filename = 'export.json') {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, filename, 'application/json');
}

/**
 * Export data as CSV file
 * @param {Object[]} data - Array of objects
 * @param {string} filename
 * @param {Object} options
 */
export function exportCSV(data, filename = 'export.csv', options = {}) {
  const {
    columns = null,
    headers = null,
    delimiter = ',',
    lineBreak = '\n'
  } = options;

  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Determine columns from first row if not specified
  const cols = columns || Object.keys(data[0]);
  const headerRow = headers || cols;

  // Build CSV
  const rows = [headerRow.map(h => escapeCSV(h, delimiter)).join(delimiter)];

  for (const row of data) {
    const values = cols.map(col => {
      const value = row[col];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return escapeCSV(JSON.stringify(value), delimiter);
      return escapeCSV(String(value), delimiter);
    });
    rows.push(values.join(delimiter));
  }

  const csv = rows.join(lineBreak);
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
}

/**
 * Escape a value for CSV
 * @param {string} value
 * @param {string} delimiter
 * @returns {string}
 */
function escapeCSV(value, delimiter = ',') {
  if (value === null || value === undefined) return '';

  const str = String(value);

  // Quote if contains delimiter, quotes, or newlines
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Export as HTML report
 * @param {Object} reportData
 * @param {string} filename
 */
export function exportHTML(reportData, filename = 'report.html') {
  const html = generateHTMLReport(reportData);
  downloadFile(html, filename, 'text/html;charset=utf-8;');
}

/**
 * Generate HTML report content
 * @param {Object} data
 * @returns {string}
 */
function generateHTMLReport(data) {
  const {
    title = 'Meta-Analysis Report',
    date = new Date().toISOString().split('T')[0],
    project = {},
    results = {},
    studies = [],
    eim = {}
  } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    h1, h2, h3 { margin-top: 2rem; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      padding: 0.5rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th { background: #f5f5f5; font-weight: 600; }
    .results-box {
      background: #f9f9f9;
      padding: 1rem;
      border-radius: 8px;
      margin: 1rem 0;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      margin: 0.5rem 0;
    }
    .stat-label { color: #666; }
    .stat-value { font-weight: 600; }
    .footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #ccc;
      font-size: 0.875rem;
      color: #666;
    }
    @media print {
      body { max-width: none; }
    }
  </style>
</head>
<body>
  <h1>${escapeHTML(title)}</h1>
  <p><strong>Generated:</strong> ${date}</p>
  ${project.name ? `<p><strong>Project:</strong> ${escapeHTML(project.name)}</p>` : ''}

  <h2>Summary</h2>
  <div class="results-box">
    ${results.theta !== undefined ? `
    <div class="stat-row">
      <span class="stat-label">Pooled Effect:</span>
      <span class="stat-value">${results.theta?.toFixed(3)} [${results.ci_lower?.toFixed(3)}, ${results.ci_upper?.toFixed(3)}]</span>
    </div>
    ` : ''}
    ${results.p !== undefined ? `
    <div class="stat-row">
      <span class="stat-label">P-value:</span>
      <span class="stat-value">${results.p < 0.001 ? '< 0.001' : results.p?.toFixed(3)}</span>
    </div>
    ` : ''}
    ${results.I2 !== undefined ? `
    <div class="stat-row">
      <span class="stat-label">I²:</span>
      <span class="stat-value">${results.I2?.toFixed(1)}%</span>
    </div>
    ` : ''}
    ${results.tau2 !== undefined ? `
    <div class="stat-row">
      <span class="stat-label">τ²:</span>
      <span class="stat-value">${results.tau2?.toFixed(4)}</span>
    </div>
    ` : ''}
    ${studies.length ? `
    <div class="stat-row">
      <span class="stat-label">Number of studies:</span>
      <span class="stat-value">${studies.length}</span>
    </div>
    ` : ''}
  </div>

  ${studies.length ? `
  <h2>Included Studies</h2>
  <table>
    <thead>
      <tr>
        <th>Study ID</th>
        <th>Title</th>
        <th>Effect</th>
        <th>95% CI</th>
        <th>Weight</th>
      </tr>
    </thead>
    <tbody>
      ${studies.map(s => `
      <tr>
        <td>${escapeHTML(s.id || s.nctId || '')}</td>
        <td>${escapeHTML(s.title || s.briefTitle || '')}</td>
        <td>${s.yi?.toFixed(3) || '—'}</td>
        <td>[${s.ci_lower?.toFixed(3) || '—'}, ${s.ci_upper?.toFixed(3) || '—'}]</td>
        <td>${s.weight?.toFixed(1) || '—'}%</td>
      </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  ${eim.evidenceAtRiskScore !== undefined ? `
  <h2>Evidence Integrity</h2>
  <div class="results-box">
    <div class="stat-row">
      <span class="stat-label">Evidence at Risk Score:</span>
      <span class="stat-value">${(eim.evidenceAtRiskScore * 100).toFixed(1)}%</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Non-publication Rate:</span>
      <span class="stat-value">${(eim.nonPublicationRate * 100).toFixed(1)}%</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Fragility:</span>
      <span class="stat-value">${eim.evidenceFragility || '—'}</span>
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p>Generated by Living Meta-Analysis Platform</p>
  </div>
</body>
</html>`;
}

/**
 * Download a file
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHTML(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Copy text to clipboard
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);

    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      return true;
    } catch (e) {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export default {
  exportJSON,
  exportCSV,
  exportHTML,
  downloadFile,
  copyToClipboard
};
