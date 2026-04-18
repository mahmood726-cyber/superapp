/**
 * Search Builder Component
 * Living Meta-Analysis Platform
 *
 * Builds CT.gov API queries with field selection
 */

import { store, actions } from '../../store.js';

class SearchBuilder extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._query = {
      condition: '',
      intervention: '',
      studyType: 'INTERVENTIONAL',
      phase: [],
      status: ['COMPLETED', 'ACTIVE_NOT_RECRUITING', 'TERMINATED'],
      startDate: '2005-01-01',
      endDate: '',
      sponsorType: [],
      hasResults: null,
      minEnrollment: null,
      country: ''
    };
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  get query() {
    return { ...this._query };
  }

  set query(val) {
    this._query = { ...this._query, ...val };
    this.render();
  }

  _setupEventListeners() {
    this._handleInput = (e) => {
      const { name, value, type, checked } = e.target;

      if (type === 'checkbox') {
        const currentArray = this._query[name] || [];
        if (checked) {
          this._query[name] = [...currentArray, value];
        } else {
          this._query[name] = currentArray.filter(v => v !== value);
        }
      } else {
        this._query[name] = value;
      }

      this._dispatchChange();
    };

    this._handleSearch = () => {
      this.dispatchEvent(new CustomEvent('search', {
        detail: { query: this.query },
        bubbles: true
      }));
    };

    this._handleReset = () => {
      this._query = {
        condition: '',
        intervention: '',
        studyType: 'INTERVENTIONAL',
        phase: [],
        status: ['COMPLETED', 'ACTIVE_NOT_RECRUITING', 'TERMINATED'],
        startDate: '2005-01-01',
        endDate: '',
        sponsorType: [],
        hasResults: null,
        minEnrollment: null,
        country: ''
      };
      this.render();
      this._dispatchChange();
    };

    this.shadowRoot.addEventListener('input', this._handleInput);
    this.shadowRoot.addEventListener('change', this._handleInput);

    const searchBtn = this.shadowRoot.querySelector('#search-btn');
    const resetBtn = this.shadowRoot.querySelector('#reset-btn');

    searchBtn?.addEventListener('click', this._handleSearch);
    resetBtn?.addEventListener('click', this._handleReset);
  }

  _removeEventListeners() {
    this.shadowRoot.removeEventListener('input', this._handleInput);
    this.shadowRoot.removeEventListener('change', this._handleInput);
  }

  _dispatchChange() {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { query: this.query },
      bubbles: true
    }));
  }

  _buildQueryPreview() {
    const parts = [];

    if (this._query.condition) {
      parts.push(`AREA[Condition]${this._query.condition}`);
    }
    if (this._query.intervention) {
      parts.push(`AREA[Intervention]${this._query.intervention}`);
    }
    if (this._query.studyType) {
      parts.push(`AREA[StudyType]${this._query.studyType}`);
    }
    if (this._query.phase.length > 0) {
      parts.push(`AREA[Phase](${this._query.phase.join(' OR ')})`);
    }
    if (this._query.status.length > 0) {
      parts.push(`AREA[OverallStatus](${this._query.status.join(' OR ')})`);
    }
    if (this._query.startDate) {
      parts.push(`AREA[StartDate]RANGE[${this._query.startDate},MAX]`);
    }

    return parts.join(' AND ') || 'No filters applied';
  }

  render() {
    const q = this._query;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .search-builder {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          overflow: hidden;
        }

        .builder-header {
          padding: 1rem 1.5rem;
          background: var(--color-gray-50, #f9fafb);
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .builder-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0;
        }

        .builder-subtitle {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.25rem;
        }

        .builder-body {
          padding: 1.5rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text, #111827);
        }

        .form-hint {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .form-input,
        .form-select {
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
          transition: border-color 150ms, box-shadow 150ms;
        }

        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: var(--color-primary-500, #3b82f6);
          box-shadow: 0 0 0 3px var(--color-primary-100, rgba(59, 130, 246, 0.1));
        }

        .checkbox-group {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.875rem;
          color: var(--color-text, #111827);
          cursor: pointer;
        }

        .checkbox-label input {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
        }

        .date-range {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .date-range input {
          flex: 1;
        }

        .date-separator {
          color: var(--color-text-secondary, #6b7280);
        }

        .section-divider {
          grid-column: 1 / -1;
          border-top: 1px solid var(--color-border, #e5e7eb);
          padding-top: 1rem;
          margin-top: 0.5rem;
        }

        .section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin-bottom: 1rem;
        }

        .query-preview {
          grid-column: 1 / -1;
          background: var(--color-gray-50, #f9fafb);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-md, 0.375rem);
          padding: 0.75rem 1rem;
          margin-top: 0.5rem;
        }

        .query-preview-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--color-text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .query-preview-text {
          font-size: 0.8125rem;
          font-family: monospace;
          color: var(--color-text, #111827);
          word-break: break-all;
        }

        .builder-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          background: var(--color-gray-50, #f9fafb);
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border-radius: var(--radius-md, 0.375rem);
          cursor: pointer;
          transition: all 150ms;
        }

        .btn-secondary {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          color: var(--color-text, #111827);
        }

        .btn-secondary:hover {
          background: var(--color-gray-50, #f9fafb);
        }

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          border: 1px solid var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover {
          background: var(--color-primary-700, #1d4ed8);
        }

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="search-builder">
        <div class="builder-header">
          <h3 class="builder-title">Search CT.gov</h3>
          <p class="builder-subtitle">Build a query to find clinical trials for your meta-analysis</p>
        </div>

        <div class="builder-body">
          <div class="form-grid">
            <!-- Core Search Fields -->
            <div class="form-group">
              <label class="form-label" for="condition">Condition / Disease</label>
              <input
                type="text"
                class="form-input"
                id="condition"
                name="condition"
                value="${q.condition}"
                placeholder="e.g., Type 2 Diabetes"
              >
              <span class="form-hint">Medical condition being studied</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="intervention">Intervention / Treatment</label>
              <input
                type="text"
                class="form-input"
                id="intervention"
                name="intervention"
                value="${q.intervention}"
                placeholder="e.g., Metformin"
              >
              <span class="form-hint">Drug, device, or procedure being tested</span>
            </div>

            <!-- Study Type -->
            <div class="form-group">
              <label class="form-label" for="studyType">Study Type</label>
              <select class="form-select" id="studyType" name="studyType">
                <option value="INTERVENTIONAL" ${q.studyType === 'INTERVENTIONAL' ? 'selected' : ''}>Interventional (Clinical Trial)</option>
                <option value="OBSERVATIONAL" ${q.studyType === 'OBSERVATIONAL' ? 'selected' : ''}>Observational</option>
                <option value="" ${!q.studyType ? 'selected' : ''}>Any</option>
              </select>
            </div>

            <!-- Country -->
            <div class="form-group">
              <label class="form-label" for="country">Country</label>
              <input
                type="text"
                class="form-input"
                id="country"
                name="country"
                value="${q.country}"
                placeholder="e.g., United States"
              >
              <span class="form-hint">Leave blank for all countries</span>
            </div>

            <!-- Date Range -->
            <div class="form-group full-width">
              <label class="form-label">Study Start Date Range</label>
              <div class="date-range">
                <input
                  type="date"
                  class="form-input"
                  name="startDate"
                  value="${q.startDate}"
                >
                <span class="date-separator">to</span>
                <input
                  type="date"
                  class="form-input"
                  name="endDate"
                  value="${q.endDate}"
                >
              </div>
              <span class="form-hint">Default starts from 2005 (post-ICMJE requirement)</span>
            </div>

            <!-- Phase Selection -->
            <div class="section-divider">
              <div class="section-title">Trial Phase</div>
            </div>

            <div class="form-group full-width">
              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" name="phase" value="PHASE1" ${q.phase.includes('PHASE1') ? 'checked' : ''}>
                  Phase 1
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="phase" value="PHASE2" ${q.phase.includes('PHASE2') ? 'checked' : ''}>
                  Phase 2
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="phase" value="PHASE3" ${q.phase.includes('PHASE3') ? 'checked' : ''}>
                  Phase 3
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="phase" value="PHASE4" ${q.phase.includes('PHASE4') ? 'checked' : ''}>
                  Phase 4
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="phase" value="NA" ${q.phase.includes('NA') ? 'checked' : ''}>
                  N/A
                </label>
              </div>
              <span class="form-hint">Leave all unchecked to include all phases</span>
            </div>

            <!-- Status Selection -->
            <div class="section-divider">
              <div class="section-title">Trial Status</div>
            </div>

            <div class="form-group full-width">
              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" name="status" value="COMPLETED" ${q.status.includes('COMPLETED') ? 'checked' : ''}>
                  Completed
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="status" value="ACTIVE_NOT_RECRUITING" ${q.status.includes('ACTIVE_NOT_RECRUITING') ? 'checked' : ''}>
                  Active, not recruiting
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="status" value="RECRUITING" ${q.status.includes('RECRUITING') ? 'checked' : ''}>
                  Recruiting
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="status" value="TERMINATED" ${q.status.includes('TERMINATED') ? 'checked' : ''}>
                  Terminated
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" name="status" value="WITHDRAWN" ${q.status.includes('WITHDRAWN') ? 'checked' : ''}>
                  Withdrawn
                </label>
              </div>
            </div>

            <!-- Results Filter -->
            <div class="section-divider">
              <div class="section-title">Results Availability</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="hasResults">Results Posted</label>
              <select class="form-select" id="hasResults" name="hasResults">
                <option value="" ${q.hasResults === null ? 'selected' : ''}>Any</option>
                <option value="true" ${q.hasResults === 'true' ? 'selected' : ''}>Has Results</option>
                <option value="false" ${q.hasResults === 'false' ? 'selected' : ''}>No Results</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="minEnrollment">Minimum Enrollment</label>
              <input
                type="number"
                class="form-input"
                id="minEnrollment"
                name="minEnrollment"
                value="${q.minEnrollment || ''}"
                placeholder="e.g., 50"
                min="0"
              >
            </div>

            <!-- Query Preview -->
            <div class="query-preview">
              <div class="query-preview-label">Query Preview</div>
              <div class="query-preview-text">${this._buildQueryPreview()}</div>
            </div>
          </div>
        </div>

        <div class="builder-footer">
          <button type="button" class="btn btn-secondary" id="reset-btn">Reset</button>
          <button type="button" class="btn btn-primary" id="search-btn">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
            </svg>
            Search CT.gov
          </button>
        </div>
      </div>
    `;

    // Re-attach event listeners after render
    this._setupEventListeners();
  }
}

customElements.define('search-builder', SearchBuilder);

export default SearchBuilder;
