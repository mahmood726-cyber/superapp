/**
 * Search Results Component
 * Living Meta-Analysis Platform
 *
 * Displays CT.gov search results with selection
 */

class SearchResults extends HTMLElement {
  static get observedAttributes() {
    return ['loading'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._results = [];
    this._selected = new Set();
    this._sortField = 'startDate';
    this._sortDirection = 'desc';
    this._page = 1;
    this._pageSize = 25;
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  attributeChangedCallback() {
    if (this.shadowRoot.hasChildNodes()) {
      this.render();
    }
  }

  get loading() {
    return this.hasAttribute('loading');
  }

  set loading(val) {
    if (val) {
      this.setAttribute('loading', '');
    } else {
      this.removeAttribute('loading');
    }
  }

  get results() {
    return this._results;
  }

  set results(val) {
    this._results = val || [];
    this._page = 1;
    this.render();
  }

  get selected() {
    return Array.from(this._selected);
  }

  set selected(val) {
    this._selected = new Set(val || []);
    this.render();
  }

  get totalResults() {
    return this._results.length;
  }

  _getSortedResults() {
    const sorted = [...this._results].sort((a, b) => {
      let aVal = a[this._sortField];
      let bVal = b[this._sortField];

      if (this._sortField === 'startDate' || this._sortField === 'completionDate') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      } else if (this._sortField === 'enrollment') {
        aVal = aVal || 0;
        bVal = bVal || 0;
      } else {
        aVal = (aVal || '').toString().toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
      }

      if (aVal < bVal) return this._sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this._sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }

  _getPagedResults() {
    const sorted = this._getSortedResults();
    const start = (this._page - 1) * this._pageSize;
    return sorted.slice(start, start + this._pageSize);
  }

  get totalPages() {
    return Math.ceil(this._results.length / this._pageSize);
  }

  _setupEventListeners() {
    this._handleCheckbox = (e) => {
      const nctId = e.target.dataset.nctId;
      if (!nctId) return;

      if (e.target.checked) {
        this._selected.add(nctId);
      } else {
        this._selected.delete(nctId);
      }

      this._dispatchSelectionChange();
      this._updateSelectAllState();
    };

    this._handleSelectAll = (e) => {
      const paged = this._getPagedResults();
      if (e.target.checked) {
        paged.forEach(r => this._selected.add(r.nctId));
      } else {
        paged.forEach(r => this._selected.delete(r.nctId));
      }
      this.render();
      this._dispatchSelectionChange();
    };

    this._handleSort = (e) => {
      const field = e.target.closest('[data-sort]')?.dataset.sort;
      if (!field) return;

      if (this._sortField === field) {
        this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this._sortField = field;
        this._sortDirection = 'desc';
      }

      this.render();
    };

    this._handlePageChange = (e) => {
      const page = parseInt(e.target.dataset.page);
      if (page && page >= 1 && page <= this.totalPages) {
        this._page = page;
        this.render();
      }
    };

    this._handleRowClick = (e) => {
      const row = e.target.closest('tr[data-nct-id]');
      if (!row || e.target.type === 'checkbox') return;

      const nctId = row.dataset.nctId;
      this.dispatchEvent(new CustomEvent('view-study', {
        detail: { nctId },
        bubbles: true
      }));
    };

    this.shadowRoot.addEventListener('change', this._handleCheckbox);
    this.shadowRoot.addEventListener('click', this._handleSort);
    this.shadowRoot.addEventListener('click', this._handlePageChange);
    this.shadowRoot.addEventListener('click', this._handleRowClick);
  }

  _removeEventListeners() {
    this.shadowRoot.removeEventListener('change', this._handleCheckbox);
    this.shadowRoot.removeEventListener('click', this._handleSort);
    this.shadowRoot.removeEventListener('click', this._handlePageChange);
    this.shadowRoot.removeEventListener('click', this._handleRowClick);
  }

  _dispatchSelectionChange() {
    this.dispatchEvent(new CustomEvent('selection-change', {
      detail: { selected: this.selected },
      bubbles: true
    }));
  }

  _updateSelectAllState() {
    const selectAll = this.shadowRoot.querySelector('#select-all');
    if (!selectAll) return;

    const paged = this._getPagedResults();
    const allSelected = paged.length > 0 && paged.every(r => this._selected.has(r.nctId));
    const someSelected = paged.some(r => this._selected.has(r.nctId));

    selectAll.checked = allSelected;
    selectAll.indeterminate = someSelected && !allSelected;
  }

  _formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  _formatStatus(status) {
    const statusMap = {
      'COMPLETED': { label: 'Completed', class: 'status-completed' },
      'ACTIVE_NOT_RECRUITING': { label: 'Active', class: 'status-active' },
      'RECRUITING': { label: 'Recruiting', class: 'status-recruiting' },
      'TERMINATED': { label: 'Terminated', class: 'status-terminated' },
      'WITHDRAWN': { label: 'Withdrawn', class: 'status-withdrawn' },
      'NOT_YET_RECRUITING': { label: 'Not Yet Recruiting', class: 'status-pending' }
    };
    return statusMap[status] || { label: status, class: '' };
  }

  _formatPhase(phases) {
    if (!phases || phases.length === 0) return '-';
    return phases.map(p => p.replace('PHASE', 'Phase ')).join(', ');
  }

  _renderSortIcon(field) {
    if (this._sortField !== field) {
      return `<span class="sort-icon inactive">↕</span>`;
    }
    return `<span class="sort-icon">${this._sortDirection === 'asc' ? '↑' : '↓'}</span>`;
  }

  _renderPagination() {
    const total = this.totalPages;
    if (total <= 1) return '';

    const pages = [];
    const current = this._page;

    // Always show first page
    pages.push(1);

    // Show ellipsis or pages around current
    if (current > 3) pages.push('...');

    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      if (!pages.includes(i)) pages.push(i);
    }

    if (current < total - 2) pages.push('...');

    // Always show last page
    if (total > 1 && !pages.includes(total)) pages.push(total);

    return `
      <div class="pagination">
        <button class="page-btn" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>
          ← Prev
        </button>
        ${pages.map(p => p === '...'
          ? '<span class="page-ellipsis">...</span>'
          : `<button class="page-btn ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`
        ).join('')}
        <button class="page-btn" data-page="${current + 1}" ${current === total ? 'disabled' : ''}>
          Next →
        </button>
      </div>
    `;
  }

  render() {
    const paged = this._getPagedResults();
    const isLoading = this.loading;
    const hasResults = this._results.length > 0;
    const selectedCount = this._selected.size;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .results-container {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          overflow: hidden;
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          background: var(--color-gray-50, #f9fafb);
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .results-count {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .results-count strong {
          color: var(--color-text, #111827);
          font-weight: 600;
        }

        .selection-info {
          font-size: 0.875rem;
          color: var(--color-primary-600, #2563eb);
          font-weight: 500;
        }

        .results-table-wrap {
          overflow-x: auto;
        }

        .results-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .results-table th {
          text-align: left;
          padding: 0.75rem 1rem;
          font-weight: 500;
          color: var(--color-text-secondary, #6b7280);
          background: var(--color-gray-50, #f9fafb);
          border-bottom: 1px solid var(--color-border, #e5e7eb);
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
        }

        .results-table th:hover {
          background: var(--color-gray-100, #f3f4f6);
        }

        .results-table th.no-sort {
          cursor: default;
        }

        .results-table th.no-sort:hover {
          background: var(--color-gray-50, #f9fafb);
        }

        .sort-icon {
          margin-left: 0.25rem;
          font-size: 0.75rem;
        }

        .sort-icon.inactive {
          opacity: 0.3;
        }

        .results-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
          vertical-align: top;
        }

        .results-table tbody tr {
          cursor: pointer;
          transition: background 150ms;
        }

        .results-table tbody tr:hover {
          background: var(--color-gray-50, #f9fafb);
        }

        .results-table tbody tr.selected {
          background: var(--color-primary-50, #eff6ff);
        }

        .nct-id {
          font-family: monospace;
          font-size: 0.8125rem;
          color: var(--color-primary-600, #2563eb);
          text-decoration: none;
        }

        .nct-id:hover {
          text-decoration: underline;
        }

        .study-title {
          max-width: 400px;
          line-height: 1.4;
        }

        .status-badge {
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

        .status-withdrawn {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-gray-700, #374151);
        }

        .status-pending {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-gray-600, #4b5563);
        }

        .results-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
        }

        .results-badge.has-results {
          color: var(--color-success-600, #16a34a);
        }

        .results-badge.no-results {
          color: var(--color-text-secondary, #6b7280);
        }

        .results-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          background: var(--color-gray-50, #f9fafb);
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        .page-info {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .pagination {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }

        .page-btn {
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          cursor: pointer;
          transition: all 150ms;
        }

        .page-btn:hover:not(:disabled) {
          background: var(--color-gray-50, #f9fafb);
        }

        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-btn.active {
          background: var(--color-primary-600, #2563eb);
          border-color: var(--color-primary-600, #2563eb);
          color: white;
        }

        .page-ellipsis {
          padding: 0.5rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .loading-overlay {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4rem;
        }

        .spinner {
          width: 2rem;
          height: 2rem;
          border: 3px solid var(--color-gray-200, #e5e7eb);
          border-top-color: var(--color-primary-600, #2563eb);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .empty-title {
          font-size: 1rem;
          font-weight: 500;
          color: var(--color-text, #111827);
          margin-bottom: 0.5rem;
        }

        .checkbox {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
        }
      </style>

      <div class="results-container">
        <div class="results-header">
          <span class="results-count">
            ${hasResults
              ? `<strong>${this._results.length}</strong> studies found`
              : 'No results yet'
            }
          </span>
          ${selectedCount > 0
            ? `<span class="selection-info">${selectedCount} selected</span>`
            : ''
          }
        </div>

        ${isLoading ? `
          <div class="loading-overlay">
            <div class="spinner"></div>
          </div>
        ` : !hasResults ? `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No studies found</div>
            <p>Try adjusting your search criteria</p>
          </div>
        ` : `
          <div class="results-table-wrap">
            <table class="results-table">
              <thead>
                <tr>
                  <th class="no-sort" style="width: 40px;">
                    <input type="checkbox" class="checkbox" id="select-all">
                  </th>
                  <th data-sort="nctId">
                    NCT ID ${this._renderSortIcon('nctId')}
                  </th>
                  <th data-sort="title">
                    Title ${this._renderSortIcon('title')}
                  </th>
                  <th data-sort="status">
                    Status ${this._renderSortIcon('status')}
                  </th>
                  <th data-sort="phase">
                    Phase ${this._renderSortIcon('phase')}
                  </th>
                  <th data-sort="enrollment">
                    Enrollment ${this._renderSortIcon('enrollment')}
                  </th>
                  <th data-sort="startDate">
                    Start ${this._renderSortIcon('startDate')}
                  </th>
                  <th class="no-sort">Results</th>
                </tr>
              </thead>
              <tbody>
                ${paged.map(study => {
                  const status = this._formatStatus(study.status);
                  const isSelected = this._selected.has(study.nctId);
                  return `
                    <tr data-nct-id="${study.nctId}" class="${isSelected ? 'selected' : ''}">
                      <td>
                        <input
                          type="checkbox"
                          class="checkbox"
                          data-nct-id="${study.nctId}"
                          ${isSelected ? 'checked' : ''}
                        >
                      </td>
                      <td>
                        <a href="https://clinicaltrials.gov/study/${study.nctId}"
                           target="_blank"
                           rel="noopener"
                           class="nct-id"
                           onclick="event.stopPropagation()">
                          ${study.nctId}
                        </a>
                      </td>
                      <td class="study-title">${study.title || '-'}</td>
                      <td>
                        <span class="status-badge ${status.class}">${status.label}</span>
                      </td>
                      <td>${this._formatPhase(study.phases)}</td>
                      <td>${study.enrollment?.toLocaleString() || '-'}</td>
                      <td>${this._formatDate(study.startDate)}</td>
                      <td>
                        ${study.hasResults
                          ? `<span class="results-badge has-results">✓ Yes</span>`
                          : `<span class="results-badge no-results">No</span>`
                        }
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="results-footer">
            <span class="page-info">
              Showing ${(this._page - 1) * this._pageSize + 1}-${Math.min(this._page * this._pageSize, this._results.length)}
              of ${this._results.length}
            </span>
            ${this._renderPagination()}
          </div>
        `}
      </div>
    `;

    // Setup select-all handler
    const selectAll = this.shadowRoot.querySelector('#select-all');
    if (selectAll) {
      selectAll.addEventListener('change', this._handleSelectAll);
      this._updateSelectAllState();
    }
  }
}

customElements.define('search-results', SearchResults);

export default SearchResults;
