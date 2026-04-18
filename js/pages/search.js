/**
 * Search Page
 * Living Meta-Analysis Platform
 *
 * CT.gov search interface with results management
 */

import { db } from '../db.js';
import { store, actions } from '../store.js';
import { router } from '../router.js';
import '../components/search/search-builder.js';
import '../components/search/search-results.js';

class SearchPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
    this._results = [];
    this._selectedIds = [];
    this._isSearching = false;
    this._searchWorker = null;
    this._searchProgress = null;
  }

  async connectedCallback() {
    // Get project ID from URL query
    const url = new URL(window.location.href);
    const projectId = url.searchParams.get('project') || url.hash.match(/project=(\d+)/)?.[1];

    if (projectId) {
      await this._loadProject(parseInt(projectId));
    }

    this._initWorker();
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    if (this._searchWorker) {
      this._searchWorker.terminate();
    }
  }

  async _loadProject(projectId) {
    try {
      this._project = await db.projects.get(projectId);
      if (this._project?.searchQuery) {
        // Pre-fill search builder with saved query
      }
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  }

  _initWorker() {
    this._searchWorker = new Worker(new URL('../workers/search.worker.js', import.meta.url), {
      type: 'module'
    });

    this._searchWorker.onmessage = (e) => {
      const { type, searchId, ...data } = e.data;

      switch (type) {
        case 'started':
          this._searchProgress = { page: 0, fetched: 0, total: 0 };
          this.render();
          break;

        case 'count':
          this._searchProgress.total = data.totalCount;
          this.render();
          break;

        case 'progress':
          this._searchProgress = {
            page: data.page,
            fetched: data.fetched,
            total: data.totalCount || this._searchProgress.total
          };
          this.render();
          break;

        case 'batch':
          this._results = [...this._results, ...data.studies];
          this._searchProgress = {
            page: data.page,
            fetched: data.fetched,
            total: data.totalCount,
            hasMore: data.hasMore
          };
          this._updateResults();
          break;

        case 'complete':
          this._isSearching = false;
          this._results = data.studies;
          this._searchProgress = null;
          this._updateResults();
          this._showToast(`Found ${data.totalCount} studies`, 'success');
          break;

        case 'cancelled':
          this._isSearching = false;
          this._searchProgress = null;
          this.render();
          this._showToast('Search cancelled', 'info');
          break;

        case 'error':
          this._isSearching = false;
          this._searchProgress = null;
          this.render();
          this._showToast(`Search error: ${data.error}`, 'error');
          break;
      }
    };
  }

  _updateResults() {
    const resultsEl = this.shadowRoot.querySelector('search-results');
    if (resultsEl) {
      resultsEl.results = this._results;
      resultsEl.loading = this._isSearching;
    }
    this.render();
  }

  _setupEventListeners() {
    this._handleSearch = (e) => {
      const { query } = e.detail;
      this._results = [];
      this._isSearching = true;

      this._searchWorker.postMessage({
        type: 'search',
        searchId: Date.now().toString(),
        payload: { params: query }
      });

      this.render();
    };

    this._handleCancel = () => {
      this._searchWorker.postMessage({ type: 'cancel' });
    };

    this._handleSelectionChange = (e) => {
      this._selectedIds = e.detail.selected;
      this.render();
    };

    this._handleImport = async () => {
      if (this._selectedIds.length === 0) {
        this._showToast('No studies selected', 'warning');
        return;
      }

      if (!this._project) {
        this._showToast('No project selected', 'warning');
        return;
      }

      try {
        const selectedStudies = this._results.filter(r =>
          this._selectedIds.includes(r.nctId)
        );

        // Save records to database
        for (const study of selectedStudies) {
          await db.records.add({
            projectId: this._project.id,
            nctId: study.nctId,
            title: study.title,
            status: study.status,
            phases: study.phases,
            enrollment: study.enrollment,
            startDate: study.startDate,
            completionDate: study.completionDate,
            hasResults: study.hasResults,
            conditions: study.conditions,
            interventions: study.interventionsList,
            sponsors: study.leadSponsor,
            screeningStatus: 'pending',
            importedAt: new Date().toISOString(),
            data: study
          });
        }

        // Update project stats
        const currentRecords = await db.records.query('projectId', this._project.id);
        this._project.recordCount = currentRecords.length;
        this._project.screeningStats = {
          pending: currentRecords.filter(r => r.screeningStatus === 'pending').length,
          included: currentRecords.filter(r => r.screeningStatus === 'included').length,
          excluded: currentRecords.filter(r => r.screeningStatus === 'excluded').length
        };
        this._project.updatedAt = new Date().toISOString();

        await db.projects.put(this._project);

        this._showToast(`Imported ${selectedStudies.length} studies`, 'success');

        // Navigate to project
        router.push(`/project/${this._project.id}`);

      } catch (err) {
        console.error('Failed to import studies:', err);
        this._showToast('Failed to import studies', 'error');
      }
    };

    this._handleSelectAll = () => {
      this._selectedIds = this._results.map(r => r.nctId);
      const resultsEl = this.shadowRoot.querySelector('search-results');
      if (resultsEl) {
        resultsEl.selected = this._selectedIds;
      }
      this.render();
    };

    this._handleSelectNone = () => {
      this._selectedIds = [];
      const resultsEl = this.shadowRoot.querySelector('search-results');
      if (resultsEl) {
        resultsEl.selected = [];
      }
      this.render();
    };

    // Attach listeners
    const builder = this.shadowRoot.querySelector('search-builder');
    const results = this.shadowRoot.querySelector('search-results');
    const cancelBtn = this.shadowRoot.querySelector('#cancel-btn');
    const importBtn = this.shadowRoot.querySelector('#import-btn');
    const selectAllBtn = this.shadowRoot.querySelector('#select-all-btn');
    const selectNoneBtn = this.shadowRoot.querySelector('#select-none-btn');

    builder?.addEventListener('search', this._handleSearch);
    results?.addEventListener('selection-change', this._handleSelectionChange);
    cancelBtn?.addEventListener('click', this._handleCancel);
    importBtn?.addEventListener('click', this._handleImport);
    selectAllBtn?.addEventListener('click', this._handleSelectAll);
    selectNoneBtn?.addEventListener('click', this._handleSelectNone);
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) {
      toast.show(message, type);
    }
  }

  render() {
    const hasResults = this._results.length > 0;
    const hasSelection = this._selectedIds.length > 0;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 1.5rem;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .page-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0;
        }

        .project-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-primary-50, #eff6ff);
          border-radius: var(--radius-md, 0.375rem);
          font-size: 0.875rem;
          color: var(--color-primary-700, #1d4ed8);
        }

        .search-section {
          margin-bottom: 1.5rem;
        }

        .results-section {
          margin-top: 1.5rem;
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .results-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0;
        }

        .results-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
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

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          border: 1px solid var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-700, #1d4ed8);
        }

        .btn-secondary {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          color: var(--color-text, #111827);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--color-gray-50, #f9fafb);
        }

        .btn-danger {
          background: var(--color-danger-600, #dc2626);
          border: 1px solid var(--color-danger-600, #dc2626);
          color: white;
        }

        .btn-danger:hover {
          background: var(--color-danger-700, #b91c1c);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .progress-bar {
          margin-top: 1rem;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-md, 0.375rem);
          padding: 1rem;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .progress-track {
          height: 8px;
          background: var(--color-gray-200, #e5e7eb);
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--color-primary-500, #3b82f6);
          transition: width 300ms ease;
        }

        .selection-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--color-primary-50, #eff6ff);
          border: 1px solid var(--color-primary-200, #bfdbfe);
          border-radius: var(--radius-md, 0.375rem);
          margin-bottom: 1rem;
        }

        .selection-info {
          font-size: 0.875rem;
          color: var(--color-primary-700, #1d4ed8);
          font-weight: 500;
        }
      </style>

      <div class="page-header">
        <h1 class="page-title">Search CT.gov</h1>
        ${this._project ? `
          <div class="project-badge">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
            ${this._project.name}
          </div>
        ` : ''}
      </div>

      <div class="search-section">
        <search-builder></search-builder>

        ${this._isSearching && this._searchProgress ? `
          <div class="progress-bar">
            <div class="progress-info">
              <span>Fetching page ${this._searchProgress.page}...</span>
              <span>${this._searchProgress.fetched} of ${this._searchProgress.total || '?'} studies</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${this._searchProgress.total ? Math.round(this._searchProgress.fetched / this._searchProgress.total * 100) : 0}%"></div>
            </div>
            <div style="margin-top: 0.75rem; text-align: right;">
              <button class="btn btn-sm btn-danger" id="cancel-btn">Cancel Search</button>
            </div>
          </div>
        ` : ''}
      </div>

      ${hasResults || this._isSearching ? `
        <div class="results-section">
          <div class="results-header">
            <h2 class="results-title">Search Results</h2>
            <div class="results-actions">
              <button class="btn btn-sm btn-secondary" id="select-all-btn">Select All</button>
              <button class="btn btn-sm btn-secondary" id="select-none-btn">Clear Selection</button>
            </div>
          </div>

          ${hasSelection ? `
            <div class="selection-bar">
              <span class="selection-info">${this._selectedIds.length} studies selected</span>
              <button class="btn btn-sm btn-primary" id="import-btn" ${!this._project ? 'disabled title="Select a project first"' : ''}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
                Import to Project
              </button>
            </div>
          ` : ''}

          <search-results ${this._isSearching ? 'loading' : ''}></search-results>
        </div>
      ` : ''}
    `;

    // Set results data
    const resultsEl = this.shadowRoot.querySelector('search-results');
    if (resultsEl) {
      resultsEl.results = this._results;
      resultsEl.selected = this._selectedIds;
    }

    // Re-attach event listeners
    this._setupEventListeners();
  }
}

customElements.define('search-page', SearchPage);

export default SearchPage;
