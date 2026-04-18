/**
 * Project Card Component
 * Living Meta-Analysis Platform
 *
 * Displays project summary with key metrics
 */

import { formatRelativeTime, formatDate } from '../../utils/format.js';

class ProjectCard extends HTMLElement {
  static get observedAttributes() {
    return ['project-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  get project() {
    return this._project;
  }

  set project(val) {
    this._project = val;
    this.render();
  }

  _setupEventListeners() {
    this._handleClick = (e) => {
      if (e.target.closest('.card-action')) {
        return; // Let action buttons handle their own clicks
      }
      this.dispatchEvent(new CustomEvent('open', {
        detail: { projectId: this._project?.id },
        bubbles: true
      }));
    };

    this._handleDelete = (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('delete', {
        detail: { projectId: this._project?.id },
        bubbles: true
      }));
    };

    this._handleDuplicate = (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('duplicate', {
        detail: { projectId: this._project?.id },
        bubbles: true
      }));
    };

    this.shadowRoot.addEventListener('click', this._handleClick);

    const deleteBtn = this.shadowRoot.querySelector('.action-delete');
    const dupBtn = this.shadowRoot.querySelector('.action-duplicate');

    deleteBtn?.addEventListener('click', this._handleDelete);
    dupBtn?.addEventListener('click', this._handleDuplicate);
  }

  _removeEventListeners() {
    this.shadowRoot.removeEventListener('click', this._handleClick);
  }

  _getStatusBadge(project) {
    if (!project) return { label: 'Unknown', class: 'status-unknown' };

    const screening = project.screeningStats || {};
    const extraction = project.extractionStats || {};
    const analysis = project.analysisStats || {};

    if (analysis.completed > 0) {
      return { label: 'Analysis', class: 'status-analysis' };
    }
    if (extraction.completed > 0) {
      return { label: 'Extraction', class: 'status-extraction' };
    }
    if (screening.included > 0 || screening.excluded > 0) {
      return { label: 'Screening', class: 'status-screening' };
    }
    if (project.recordCount > 0) {
      return { label: 'Search Complete', class: 'status-search' };
    }
    return { label: 'New', class: 'status-new' };
  }

  _formatNumber(num) {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString();
  }

  render() {
    const p = this._project;

    if (!p) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const status = this._getStatusBadge(p);
    const screening = p.screeningStats || {};
    const extraction = p.extractionStats || {};

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .card {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.25rem;
          cursor: pointer;
          transition: all 150ms;
          position: relative;
        }

        .card:hover {
          border-color: var(--color-primary-300, #93c5fd);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }

        .card-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0;
          line-height: 1.4;
          flex: 1;
          margin-right: 0.75rem;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          font-size: 0.75rem;
          font-weight: 500;
          border-radius: var(--radius-full, 9999px);
          white-space: nowrap;
        }

        .status-new {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-gray-700, #374151);
        }

        .status-search {
          background: var(--color-primary-100, #dbeafe);
          color: var(--color-primary-700, #1d4ed8);
        }

        .status-screening {
          background: var(--color-warning-100, #fef3c7);
          color: var(--color-warning-700, #b45309);
        }

        .status-extraction {
          background: var(--color-purple-100, #ede9fe);
          color: var(--color-purple-700, #6d28d9);
        }

        .status-analysis {
          background: var(--color-success-100, #dcfce7);
          color: var(--color-success-700, #15803d);
        }

        .card-description {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          margin-bottom: 1rem;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
        }

        .stat {
          text-align: center;
        }

        .stat-value {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text, #111827);
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.125rem;
        }

        .card-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .card-actions {
          display: flex;
          gap: 0.25rem;
          opacity: 0;
          transition: opacity 150ms;
        }

        .card:hover .card-actions {
          opacity: 1;
        }

        .card-action {
          padding: 0.375rem;
          background: none;
          border: none;
          color: var(--color-text-secondary, #6b7280);
          cursor: pointer;
          border-radius: var(--radius-md, 0.375rem);
          transition: all 150ms;
        }

        .card-action:hover {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-text, #111827);
        }

        .action-delete:hover {
          background: var(--color-danger-100, #fee2e2);
          color: var(--color-danger-600, #dc2626);
        }

        .progress-bar {
          height: 4px;
          background: var(--color-gray-200, #e5e7eb);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 0.75rem;
        }

        .progress-fill {
          height: 100%;
          background: var(--color-primary-500, #3b82f6);
          transition: width 300ms ease;
        }
      </style>

      <article class="card">
        <div class="card-header">
          <h3 class="card-title">${p.name || 'Untitled Project'}</h3>
          <span class="status-badge ${status.class}">${status.label}</span>
        </div>

        ${p.description ? `
          <p class="card-description">${p.description}</p>
        ` : ''}

        <div class="card-stats">
          <div class="stat">
            <div class="stat-value">${this._formatNumber(p.recordCount)}</div>
            <div class="stat-label">Records</div>
          </div>
          <div class="stat">
            <div class="stat-value">${this._formatNumber(screening.included || 0)}</div>
            <div class="stat-label">Included</div>
          </div>
          <div class="stat">
            <div class="stat-value">${this._formatNumber(extraction.completed || 0)}</div>
            <div class="stat-label">Extracted</div>
          </div>
        </div>

        ${p.recordCount > 0 ? `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.round((screening.included || 0) / p.recordCount * 100)}%"></div>
          </div>
        ` : ''}

        <div class="card-meta">
          <span>Updated ${formatRelativeTime(p.updatedAt)}</span>
          <div class="card-actions">
            <button class="card-action action-duplicate" title="Duplicate project">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"/>
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"/>
              </svg>
            </button>
            <button class="card-action action-delete" title="Delete project">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>
      </article>
    `;

    // Re-attach event listeners
    this._setupEventListeners();
  }
}

customElements.define('project-card', ProjectCard);

export default ProjectCard;
