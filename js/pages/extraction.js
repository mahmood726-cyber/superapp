/**
 * Extraction Page
 * Living Meta-Analysis Platform
 *
 * Data extraction workflow for included studies
 */

import { db } from '../db.js';
import { store, actions } from '../store.js';
import { router } from '../router.js';
import '../components/extraction/extraction-form.js';

class ExtractionPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
    this._records = [];
    this._currentIndex = 0;
    this._filter = 'pending'; // pending, completed, all
    this._loading = true;
    this._stats = { pending: 0, completed: 0, total: 0 };
  }

  async connectedCallback() {
    // Get project ID from URL
    const url = new URL(window.location.href);
    const projectId = url.searchParams.get('project') || url.hash.match(/project=(\d+)/)?.[1];

    if (!projectId) {
      router.push('/projects');
      return;
    }

    await this._loadProject(parseInt(projectId));
    this.render();
    this._setupEventListeners();
  }

  async _loadProject(projectId) {
    this._loading = true;
    this.render();

    try {
      this._project = await db.projects.get(projectId);
      if (!this._project) {
        this._showToast('Project not found', 'error');
        router.push('/projects');
        return;
      }

      await this._loadRecords();
    } catch (err) {
      console.error('Failed to load project:', err);
      this._showToast('Failed to load project', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  }

  async _loadRecords() {
    try {
      const allRecords = await db.records.query('projectId', this._project.id);

      // Only include studies that passed screening
      const includedRecords = allRecords.filter(r => r.screeningStatus === 'included');

      // Calculate stats
      this._stats = {
        pending: includedRecords.filter(r => !r.extraction || r.extraction.status !== 'completed').length,
        completed: includedRecords.filter(r => r.extraction?.status === 'completed').length,
        total: includedRecords.length
      };

      // Filter records based on current filter
      if (this._filter === 'pending') {
        this._records = includedRecords.filter(r => !r.extraction || r.extraction.status !== 'completed');
      } else if (this._filter === 'completed') {
        this._records = includedRecords.filter(r => r.extraction?.status === 'completed');
      } else {
        this._records = includedRecords;
      }

      // Reset to first record if current index is out of bounds
      if (this._currentIndex >= this._records.length) {
        this._currentIndex = 0;
      }
    } catch (err) {
      console.error('Failed to load records:', err);
    }
  }

  _setupEventListeners() {
    this._handleSave = async (e) => {
      const { recordId, data } = e.detail;
      await this._saveExtraction(recordId, data);
    };

    this._handleSkip = () => {
      this._nextRecord();
    };

    this._handleFilterChange = async (e) => {
      this._filter = e.target.value;
      this._currentIndex = 0;
      await this._loadRecords();
      this.render();
    };

    this._handleNavPrev = () => this._prevRecord();
    this._handleNavNext = () => this._nextRecord();

    // Attach listeners
    this.shadowRoot.addEventListener('save', this._handleSave);
    this.shadowRoot.addEventListener('skip', this._handleSkip);

    const filterSelect = this.shadowRoot.querySelector('#filter-select');
    const prevBtn = this.shadowRoot.querySelector('#prev-btn');
    const nextBtn = this.shadowRoot.querySelector('#next-btn');

    filterSelect?.addEventListener('change', this._handleFilterChange);
    prevBtn?.addEventListener('click', this._handleNavPrev);
    nextBtn?.addEventListener('click', this._handleNavNext);
  }

  async _saveExtraction(recordId, data) {
    try {
      const record = this._records.find(r => r.id === recordId);
      if (!record) return;

      record.extraction = {
        ...data,
        status: 'completed',
        extractedAt: new Date().toISOString()
      };

      await db.records.put(record);

      // Update stats
      this._stats.completed++;
      this._stats.pending--;

      // Move to next record if in pending filter
      if (this._filter === 'pending') {
        this._records = this._records.filter(r => r.id !== recordId);
        if (this._currentIndex >= this._records.length) {
          this._currentIndex = Math.max(0, this._records.length - 1);
        }
      } else {
        this._nextRecord();
      }

      // Update project stats
      await this._updateProjectStats();

      this.render();
      this._showToast('Extraction saved', 'success');

    } catch (err) {
      console.error('Failed to save extraction:', err);
      this._showToast('Failed to save extraction', 'error');
    }
  }

  async _updateProjectStats() {
    try {
      const allRecords = await db.records.query('projectId', this._project.id);
      const included = allRecords.filter(r => r.screeningStatus === 'included');

      this._project.extractionStats = {
        pending: included.filter(r => !r.extraction || r.extraction.status !== 'completed').length,
        completed: included.filter(r => r.extraction?.status === 'completed').length
      };
      this._project.updatedAt = new Date().toISOString();

      await db.projects.put(this._project);
    } catch (err) {
      console.error('Failed to update project stats:', err);
    }
  }

  _prevRecord() {
    if (this._currentIndex > 0) {
      this._currentIndex--;
      this.render();
    }
  }

  _nextRecord() {
    if (this._currentIndex < this._records.length - 1) {
      this._currentIndex++;
      this.render();
    }
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) {
      toast.show(message, type);
    }
  }

  render() {
    if (this._loading) {
      this.shadowRoot.innerHTML = `
        <style>
          .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 4rem;
            gap: 1rem;
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
        </style>
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading records...</p>
        </div>
      `;
      return;
    }

    const currentRecord = this._records[this._currentIndex];
    const progress = this._stats.total > 0
      ? Math.round((this._stats.completed / this._stats.total) * 100)
      : 0;

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

        .header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .page-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0;
        }

        .project-name {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .progress-summary {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .progress-text {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .progress-bar-mini {
          width: 100px;
          height: 6px;
          background: var(--color-gray-200, #e5e7eb);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--color-primary-500, #3b82f6);
        }

        .stats-bar {
          display: flex;
          gap: 1.5rem;
          padding: 1rem 1.5rem;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          margin-bottom: 1.5rem;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .stat-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .stat-dot.pending { background: var(--color-warning-500, #f59e0b); }
        .stat-dot.completed { background: var(--color-success-500, #22c55e); }
        .stat-dot.total { background: var(--color-primary-500, #3b82f6); }

        .stat-count {
          font-weight: 600;
          color: var(--color-text, #111827);
        }

        .stat-label {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .filter-select {
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
        }

        .navigation {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .nav-info {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          padding: 0 0.5rem;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border-radius: var(--radius-md, 0.375rem);
          cursor: pointer;
          transition: all 150ms;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          color: var(--color-text, #111827);
        }

        .btn:hover:not(:disabled) {
          background: var(--color-gray-50, #f9fafb);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .form-container {
          max-width: 900px;
          margin: 0 auto;
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: var(--color-surface, #fff);
          border: 2px dashed var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .empty-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin-bottom: 0.5rem;
        }

        .empty-text {
          color: var(--color-text-secondary, #6b7280);
        }

        .all-done {
          background: var(--color-success-50, #f0fdf4);
          border-color: var(--color-success-300, #86efac);
        }

        .all-done .empty-icon {
          color: var(--color-success-500, #22c55e);
        }

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          border: 1px solid var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-700, #1d4ed8);
        }
      </style>

      <div class="page-header">
        <div class="header-left">
          <div>
            <h1 class="page-title">Data Extraction</h1>
            ${this._project ? `<div class="project-name">${this._project.name}</div>` : ''}
          </div>
        </div>

        <div class="progress-summary">
          <span class="progress-text">${progress}% complete</span>
          <div class="progress-bar-mini">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-dot pending"></span>
          <span class="stat-count">${this._stats.pending}</span>
          <span class="stat-label">Pending</span>
        </div>
        <div class="stat-item">
          <span class="stat-dot completed"></span>
          <span class="stat-count">${this._stats.completed}</span>
          <span class="stat-label">Completed</span>
        </div>
        <div class="stat-item">
          <span class="stat-dot total"></span>
          <span class="stat-count">${this._stats.total}</span>
          <span class="stat-label">Total Included</span>
        </div>
      </div>

      <div class="filter-bar">
        <select class="filter-select" id="filter-select">
          <option value="pending" ${this._filter === 'pending' ? 'selected' : ''}>Pending (${this._stats.pending})</option>
          <option value="completed" ${this._filter === 'completed' ? 'selected' : ''}>Completed (${this._stats.completed})</option>
          <option value="all" ${this._filter === 'all' ? 'selected' : ''}>All (${this._stats.total})</option>
        </select>

        <div class="navigation">
          <button class="btn" id="prev-btn" ${this._currentIndex === 0 ? 'disabled' : ''}>
            ← Prev
          </button>
          <span class="nav-info">
            ${this._records.length > 0 ? `${this._currentIndex + 1} of ${this._records.length}` : '0 of 0'}
          </span>
          <button class="btn" id="next-btn" ${this._currentIndex >= this._records.length - 1 ? 'disabled' : ''}>
            Next →
          </button>
        </div>
      </div>

      <div class="form-container">
        ${currentRecord ? `
          <extraction-form></extraction-form>
        ` : this._stats.total === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h2 class="empty-title">No studies to extract</h2>
            <p class="empty-text">Complete screening first to identify included studies for extraction.</p>
            <a href="#/screening?project=${this._project?.id}" class="btn btn-primary" style="margin-top: 1rem;">Go to Screening</a>
          </div>
        ` : this._stats.pending === 0 && this._filter === 'pending' ? `
          <div class="empty-state all-done">
            <div class="empty-icon">✅</div>
            <h2 class="empty-title">All Done!</h2>
            <p class="empty-text">You've extracted data from all ${this._stats.total} included studies.</p>
            <a href="#/analysis?project=${this._project?.id}" class="btn btn-primary" style="margin-top: 1rem;">Go to Analysis</a>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-icon">📊</div>
            <h2 class="empty-title">No records to show</h2>
            <p class="empty-text">No records match the "${this._filter}" filter.</p>
          </div>
        `}
      </div>
    `;

    // Set record data on form
    const form = this.shadowRoot.querySelector('extraction-form');
    if (form && currentRecord) {
      form.record = currentRecord;
    }

    // Re-attach event listeners
    this._setupEventListeners();
  }
}

customElements.define('extraction-page', ExtractionPage);

export default ExtractionPage;
