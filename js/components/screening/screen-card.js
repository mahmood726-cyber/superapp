/**
 * Screen Card Component
 * Living Meta-Analysis Platform
 *
 * Card for title/abstract screening decisions
 */

import { formatDate, formatPhase, formatStatus } from '../../utils/format.js';

class ScreenCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._record = null;
    this._expanded = false;
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  get record() {
    return this._record;
  }

  set record(val) {
    this._record = val;
    this.render();
  }

  get expanded() {
    return this._expanded;
  }

  set expanded(val) {
    this._expanded = val;
    this.render();
  }

  _setupEventListeners() {
    this._handleInclude = () => {
      this.dispatchEvent(new CustomEvent('decision', {
        detail: { recordId: this._record?.id, decision: 'included' },
        bubbles: true
      }));
    };

    this._handleExclude = () => {
      this.dispatchEvent(new CustomEvent('decision', {
        detail: { recordId: this._record?.id, decision: 'excluded' },
        bubbles: true
      }));
    };

    this._handleMaybe = () => {
      this.dispatchEvent(new CustomEvent('decision', {
        detail: { recordId: this._record?.id, decision: 'maybe' },
        bubbles: true
      }));
    };

    this._handleExpand = () => {
      this._expanded = !this._expanded;
      this.render();
    };

    this._handleViewFull = () => {
      if (this._record?.nctId) {
        window.open(`https://clinicaltrials.gov/study/${this._record.nctId}`, '_blank');
      }
    };

    const includeBtn = this.shadowRoot.querySelector('#include-btn');
    const excludeBtn = this.shadowRoot.querySelector('#exclude-btn');
    const maybeBtn = this.shadowRoot.querySelector('#maybe-btn');
    const expandBtn = this.shadowRoot.querySelector('#expand-btn');
    const viewFullBtn = this.shadowRoot.querySelector('#view-full-btn');

    includeBtn?.addEventListener('click', this._handleInclude);
    excludeBtn?.addEventListener('click', this._handleExclude);
    maybeBtn?.addEventListener('click', this._handleMaybe);
    expandBtn?.addEventListener('click', this._handleExpand);
    viewFullBtn?.addEventListener('click', this._handleViewFull);
  }

  _removeEventListeners() {
    // Cleanup handled by garbage collection when element is removed
  }

  _formatPhases(phases) {
    if (!phases || phases.length === 0) return 'N/A';
    return phases.map(p => p.replace('PHASE', 'Phase ')).join(', ');
  }

  _getStatusClass(status) {
    const statusMap = {
      'COMPLETED': 'status-completed',
      'ACTIVE_NOT_RECRUITING': 'status-active',
      'RECRUITING': 'status-recruiting',
      'TERMINATED': 'status-terminated'
    };
    return statusMap[status] || 'status-default';
  }

  _highlightTerms(text, terms = []) {
    if (!text || terms.length === 0) return text;

    let result = text;
    terms.forEach(term => {
      if (term && term.length > 2) {
        const regex = new RegExp(`(${term})`, 'gi');
        result = result.replace(regex, '<mark>$1</mark>');
      }
    });
    return result;
  }

  render() {
    const r = this._record;

    if (!r) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const data = r.data || {};

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .screen-card {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          overflow: hidden;
        }

        .card-header {
          padding: 1.25rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .nct-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .nct-id {
          font-family: monospace;
          font-size: 0.875rem;
          color: var(--color-primary-600, #2563eb);
          text-decoration: none;
        }

        .nct-id:hover {
          text-decoration: underline;
        }

        .badges {
          display: flex;
          gap: 0.5rem;
        }

        .badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          font-weight: 500;
          border-radius: var(--radius-full, 9999px);
        }

        .status-completed {
          background: var(--color-success-100, #dcfce7);
          color: var(--color-success-700, #15803d);
        }

        .status-active {
          background: var(--color-primary-100, #dbeafe);
          color: var(--color-primary-700, #1d4ed8);
        }

        .status-recruiting {
          background: var(--color-warning-100, #fef3c7);
          color: var(--color-warning-700, #b45309);
        }

        .status-terminated {
          background: var(--color-danger-100, #fee2e2);
          color: var(--color-danger-700, #b91c1c);
        }

        .status-default {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-gray-700, #374151);
        }

        .results-badge {
          background: var(--color-success-100, #dcfce7);
          color: var(--color-success-700, #15803d);
        }

        .card-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          line-height: 1.5;
          margin: 0;
        }

        .card-body {
          padding: 1.25rem;
        }

        .meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        @media (max-width: 768px) {
          .meta-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .meta-label {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .meta-value {
          font-size: 0.875rem;
          color: var(--color-text, #111827);
          font-weight: 500;
        }

        .section-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .conditions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          margin-bottom: 1rem;
        }

        .condition-tag {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-text, #111827);
          border-radius: var(--radius-md, 0.375rem);
        }

        .summary-text {
          font-size: 0.875rem;
          color: var(--color-text, #111827);
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .summary-text mark {
          background: var(--color-warning-200, #fde68a);
          padding: 0 0.125rem;
          border-radius: 2px;
        }

        .interventions {
          margin-bottom: 1rem;
        }

        .intervention-item {
          display: flex;
          gap: 0.5rem;
          padding: 0.5rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
          margin-bottom: 0.5rem;
        }

        .intervention-type {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--color-primary-600, #2563eb);
          text-transform: uppercase;
        }

        .intervention-name {
          font-size: 0.875rem;
          color: var(--color-text, #111827);
        }

        .expanded-content {
          display: ${this._expanded ? 'block' : 'none'};
          padding-top: 1rem;
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        .outcomes-section {
          margin-bottom: 1rem;
        }

        .outcome-item {
          padding: 0.5rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .outcome-measure {
          font-weight: 500;
          color: var(--color-text, #111827);
        }

        .outcome-timeframe {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.25rem;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          background: var(--color-gray-50, #f9fafb);
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        .secondary-actions {
          display: flex;
          gap: 0.5rem;
        }

        .decision-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border-radius: var(--radius-md, 0.375rem);
          cursor: pointer;
          transition: all 150ms;
        }

        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.8125rem;
        }

        .btn-ghost {
          background: transparent;
          border: none;
          color: var(--color-text-secondary, #6b7280);
        }

        .btn-ghost:hover {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-text, #111827);
        }

        .btn-include {
          background: var(--color-success-600, #16a34a);
          border: 1px solid var(--color-success-600, #16a34a);
          color: white;
        }

        .btn-include:hover {
          background: var(--color-success-700, #15803d);
        }

        .btn-exclude {
          background: var(--color-danger-600, #dc2626);
          border: 1px solid var(--color-danger-600, #dc2626);
          color: white;
        }

        .btn-exclude:hover {
          background: var(--color-danger-700, #b91c1c);
        }

        .btn-maybe {
          background: var(--color-warning-500, #f59e0b);
          border: 1px solid var(--color-warning-500, #f59e0b);
          color: white;
        }

        .btn-maybe:hover {
          background: var(--color-warning-600, #d97706);
        }

        .keyboard-hint {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.5rem;
          text-align: center;
        }

        kbd {
          display: inline-block;
          padding: 0.125rem 0.375rem;
          font-family: monospace;
          font-size: 0.75rem;
          background: var(--color-gray-100, #f3f4f6);
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-sm, 0.25rem);
          margin: 0 0.125rem;
        }
      </style>

      <article class="screen-card">
        <div class="card-header">
          <div class="nct-row">
            <a href="https://clinicaltrials.gov/study/${r.nctId}" target="_blank" rel="noopener" class="nct-id">
              ${r.nctId}
            </a>
            <div class="badges">
              <span class="badge ${this._getStatusClass(r.status)}">${formatStatus(r.status)}</span>
              ${r.hasResults ? '<span class="badge results-badge">Has Results</span>' : ''}
            </div>
          </div>
          <h3 class="card-title">${r.title || 'Untitled Study'}</h3>
        </div>

        <div class="card-body">
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Phase</span>
              <span class="meta-value">${this._formatPhases(r.phases)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Enrollment</span>
              <span class="meta-value">${r.enrollment?.toLocaleString() || 'N/A'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Start Date</span>
              <span class="meta-value">${r.startDate ? formatDate(r.startDate) : 'N/A'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Completion</span>
              <span class="meta-value">${r.completionDate ? formatDate(r.completionDate) : 'N/A'}</span>
            </div>
          </div>

          ${r.conditions && r.conditions.length > 0 ? `
            <div class="section-title">Conditions</div>
            <div class="conditions-list">
              ${r.conditions.slice(0, 5).map(c => `<span class="condition-tag">${c}</span>`).join('')}
              ${r.conditions.length > 5 ? `<span class="condition-tag">+${r.conditions.length - 5} more</span>` : ''}
            </div>
          ` : ''}

          ${data.briefSummary ? `
            <div class="section-title">Summary</div>
            <p class="summary-text">${data.briefSummary.substring(0, 500)}${data.briefSummary.length > 500 ? '...' : ''}</p>
          ` : ''}

          ${r.interventions && r.interventions.length > 0 ? `
            <div class="interventions">
              <div class="section-title">Interventions</div>
              ${r.interventions.slice(0, 3).map(i => `
                <div class="intervention-item">
                  <span class="intervention-type">${i.type || 'Other'}</span>
                  <span class="intervention-name">${i.name}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div class="expanded-content">
            ${data.primaryOutcomes && data.primaryOutcomes.length > 0 ? `
              <div class="outcomes-section">
                <div class="section-title">Primary Outcomes</div>
                ${data.primaryOutcomes.map(o => `
                  <div class="outcome-item">
                    <div class="outcome-measure">${o.measure}</div>
                    ${o.timeFrame ? `<div class="outcome-timeframe">Timeframe: ${o.timeFrame}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${data.eligibilityCriteria ? `
              <div class="section-title">Eligibility</div>
              <p class="summary-text">${data.eligibilityCriteria.substring(0, 600)}${data.eligibilityCriteria.length > 600 ? '...' : ''}</p>
            ` : ''}
          </div>
        </div>

        <div class="card-footer">
          <div class="secondary-actions">
            <button class="btn btn-sm btn-ghost" id="expand-btn">
              ${this._expanded ? 'Show Less' : 'Show More'}
            </button>
            <button class="btn btn-sm btn-ghost" id="view-full-btn">
              View on CT.gov
            </button>
          </div>

          <div class="decision-actions">
            <button class="btn btn-exclude" id="exclude-btn">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
              Exclude
            </button>
            <button class="btn btn-maybe" id="maybe-btn">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
              </svg>
              Maybe
            </button>
            <button class="btn btn-include" id="include-btn">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              Include
            </button>
          </div>
        </div>

        <div class="keyboard-hint">
          Keyboard: <kbd>I</kbd> Include <kbd>E</kbd> Exclude <kbd>M</kbd> Maybe <kbd>Space</kbd> Expand
        </div>
      </article>
    `;

    // Re-attach event listeners
    this._setupEventListeners();
  }
}

customElements.define('screen-card', ScreenCard);

export default ScreenCard;
