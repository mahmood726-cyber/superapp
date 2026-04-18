/**
 * Project Detail Page
 * Living Meta-Analysis Platform
 *
 * Main workspace for a project - shows overview and quick actions
 */

import { db } from '../db.js';
import { store, actions } from '../store.js';
import { router } from '../router.js';
import { formatRelativeTime, formatDate } from '../utils/format.js';
import '../components/base/lm-tabs.js';

class ProjectDetailPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
    this._activeTab = 'overview';
    this._loading = true;
  }

  static get observedAttributes() {
    return ['project-id'];
  }

  get projectId() {
    return parseInt(this.getAttribute('project-id'));
  }

  set projectId(val) {
    this.setAttribute('project-id', val);
  }

  async connectedCallback() {
    await this._loadProject();
    this.render();
    this._setupEventListeners();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'project-id' && oldVal !== newVal) {
      this._loadProject();
    }
  }

  async _loadProject() {
    this._loading = true;
    this.render();

    try {
      const project = await db.projects.get(this.projectId);
      if (!project) {
        this._showToast('Project not found', 'error');
        router.push('/projects');
        return;
      }
      this._project = project;
      actions.setCurrentProject(project);
    } catch (err) {
      console.error('Failed to load project:', err);
      this._showToast('Failed to load project', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  }

  _setupEventListeners() {
    this._handleTabChange = (e) => {
      this._activeTab = e.detail.tab;
      this.render();
    };

    this._handleSearch = () => {
      router.push(`/search?project=${this.projectId}`);
    };

    this._handleScreening = () => {
      router.push(`/screening?project=${this.projectId}`);
    };

    this._handleExtraction = () => {
      router.push(`/extraction?project=${this.projectId}`);
    };

    this._handleAnalysis = () => {
      router.push(`/analysis?project=${this.projectId}`);
    };

    const tabs = this.shadowRoot.querySelector('lm-tabs');
    tabs?.addEventListener('change', this._handleTabChange);

    const searchBtn = this.shadowRoot.querySelector('#search-btn');
    const screenBtn = this.shadowRoot.querySelector('#screen-btn');
    const extractBtn = this.shadowRoot.querySelector('#extract-btn');
    const analyzeBtn = this.shadowRoot.querySelector('#analyze-btn');

    searchBtn?.addEventListener('click', this._handleSearch);
    screenBtn?.addEventListener('click', this._handleScreening);
    extractBtn?.addEventListener('click', this._handleExtraction);
    analyzeBtn?.addEventListener('click', this._handleAnalysis);
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) {
      toast.show(message, type);
    }
  }

  _getStageStatus(stage) {
    const p = this._project;
    if (!p) return { status: 'pending', label: 'Not Started' };

    switch (stage) {
      case 'search':
        if (p.recordCount > 0) {
          return { status: 'complete', label: `${p.recordCount} records` };
        }
        return { status: 'pending', label: 'Not started' };

      case 'screening':
        const s = p.screeningStats || {};
        const total = s.pending + s.included + s.excluded;
        if (total === 0) return { status: 'pending', label: 'Not started' };
        if (s.pending === 0) return { status: 'complete', label: `${s.included} included` };
        return { status: 'in-progress', label: `${s.pending} remaining` };

      case 'extraction':
        const e = p.extractionStats || {};
        if (e.completed === 0 && e.pending === 0) return { status: 'pending', label: 'Not started' };
        if (e.pending === 0) return { status: 'complete', label: `${e.completed} extracted` };
        return { status: 'in-progress', label: `${e.pending} remaining` };

      case 'analysis':
        const a = p.analysisStats || {};
        if (a.completed === 0) return { status: 'pending', label: 'Not started' };
        return { status: 'complete', label: `${a.completed} analyses` };

      default:
        return { status: 'pending', label: 'Not started' };
    }
  }

  _renderOverview() {
    const p = this._project;
    const search = this._getStageStatus('search');
    const screening = this._getStageStatus('screening');
    const extraction = this._getStageStatus('extraction');
    const analysis = this._getStageStatus('analysis');

    return `
      <div class="overview">
        <div class="overview-header">
          <div class="project-info">
            <h2 class="project-name">${p.name}</h2>
            ${p.description ? `<p class="project-desc">${p.description}</p>` : ''}
            <div class="project-meta">
              <span>Created ${formatRelativeTime(p.createdAt)}</span>
              <span class="meta-sep">•</span>
              <span>Updated ${formatRelativeTime(p.updatedAt)}</span>
            </div>
          </div>
        </div>

        <!-- PICO Summary -->
        ${(p.pico?.population || p.pico?.intervention || p.pico?.comparator || p.pico?.outcome) ? `
          <div class="pico-summary">
            <h3 class="section-title">Research Question (PICO)</h3>
            <div class="pico-grid">
              ${p.pico.population ? `
                <div class="pico-item">
                  <span class="pico-label">Population</span>
                  <span class="pico-value">${p.pico.population}</span>
                </div>
              ` : ''}
              ${p.pico.intervention ? `
                <div class="pico-item">
                  <span class="pico-label">Intervention</span>
                  <span class="pico-value">${p.pico.intervention}</span>
                </div>
              ` : ''}
              ${p.pico.comparator ? `
                <div class="pico-item">
                  <span class="pico-label">Comparator</span>
                  <span class="pico-value">${p.pico.comparator}</span>
                </div>
              ` : ''}
              ${p.pico.outcome ? `
                <div class="pico-item">
                  <span class="pico-label">Outcome</span>
                  <span class="pico-value">${p.pico.outcome}</span>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Workflow Stages -->
        <div class="workflow">
          <h3 class="section-title">Workflow</h3>
          <div class="stages">
            <div class="stage ${search.status}">
              <div class="stage-header">
                <div class="stage-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="stage-info">
                  <span class="stage-name">Search</span>
                  <span class="stage-status">${search.label}</span>
                </div>
              </div>
              <button class="stage-action" id="search-btn">
                ${search.status === 'pending' ? 'Start Search' : 'Update Search'}
              </button>
            </div>

            <div class="stage-connector ${search.status === 'complete' ? 'active' : ''}"></div>

            <div class="stage ${screening.status}">
              <div class="stage-header">
                <div class="stage-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                    <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="stage-info">
                  <span class="stage-name">Screening</span>
                  <span class="stage-status">${screening.label}</span>
                </div>
              </div>
              <button class="stage-action" id="screen-btn" ${p.recordCount === 0 ? 'disabled' : ''}>
                ${screening.status === 'pending' ? 'Start Screening' : 'Continue'}
              </button>
            </div>

            <div class="stage-connector ${screening.status === 'complete' ? 'active' : ''}"></div>

            <div class="stage ${extraction.status}">
              <div class="stage-header">
                <div class="stage-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="stage-info">
                  <span class="stage-name">Extraction</span>
                  <span class="stage-status">${extraction.label}</span>
                </div>
              </div>
              <button class="stage-action" id="extract-btn" ${(p.screeningStats?.included || 0) === 0 ? 'disabled' : ''}>
                ${extraction.status === 'pending' ? 'Start Extraction' : 'Continue'}
              </button>
            </div>

            <div class="stage-connector ${extraction.status === 'complete' ? 'active' : ''}"></div>

            <div class="stage ${analysis.status}">
              <div class="stage-header">
                <div class="stage-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                  </svg>
                </div>
                <div class="stage-info">
                  <span class="stage-name">Analysis</span>
                  <span class="stage-status">${analysis.label}</span>
                </div>
              </div>
              <button class="stage-action" id="analyze-btn" ${(p.extractionStats?.completed || 0) === 0 ? 'disabled' : ''}>
                ${analysis.status === 'pending' ? 'Run Analysis' : 'View Results'}
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${p.recordCount || 0}</div>
            <div class="stat-label">Records Found</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${p.screeningStats?.included || 0}</div>
            <div class="stat-label">Studies Included</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${p.extractionStats?.completed || 0}</div>
            <div class="stat-label">Data Extracted</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${p.analysisStats?.completed || 0}</div>
            <div class="stat-label">Analyses Run</div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (this._loading) {
      this.shadowRoot.innerHTML = `
        <style>
          .loading {
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
        </style>
        <div class="loading">
          <div class="spinner"></div>
        </div>
      `;
      return;
    }

    if (!this._project) {
      this.shadowRoot.innerHTML = `
        <div style="padding: 2rem; text-align: center;">
          <p>Project not found</p>
        </div>
      `;
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 1.5rem;
        }

        .overview-header {
          margin-bottom: 2rem;
        }

        .project-name {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0 0 0.5rem 0;
        }

        .project-desc {
          color: var(--color-text-secondary, #6b7280);
          margin: 0 0 0.75rem 0;
          line-height: 1.5;
        }

        .project-meta {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .meta-sep {
          margin: 0 0.5rem;
        }

        .section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 1rem 0;
        }

        .pico-summary {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.25rem;
          margin-bottom: 1.5rem;
        }

        .pico-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .pico-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .pico-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .pico-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--color-text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .pico-value {
          font-size: 0.875rem;
          color: var(--color-text, #111827);
        }

        .workflow {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.25rem;
          margin-bottom: 1.5rem;
        }

        .stages {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        @media (max-width: 768px) {
          .stages {
            flex-direction: column;
            align-items: stretch;
          }
        }

        .stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
          border: 2px solid transparent;
        }

        .stage.pending {
          border-color: var(--color-gray-200, #e5e7eb);
        }

        .stage.in-progress {
          border-color: var(--color-warning-400, #fbbf24);
          background: var(--color-warning-50, #fffbeb);
        }

        .stage.complete {
          border-color: var(--color-success-400, #4ade80);
          background: var(--color-success-50, #f0fdf4);
        }

        .stage-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .stage-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.5rem;
          height: 2.5rem;
          background: var(--color-surface, #fff);
          border-radius: var(--radius-md, 0.375rem);
          color: var(--color-text-secondary, #6b7280);
        }

        .stage.complete .stage-icon {
          background: var(--color-success-100, #dcfce7);
          color: var(--color-success-600, #16a34a);
        }

        .stage.in-progress .stage-icon {
          background: var(--color-warning-100, #fef3c7);
          color: var(--color-warning-600, #d97706);
        }

        .stage-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .stage-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
        }

        .stage-status {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .stage-action {
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          font-family: inherit;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          color: var(--color-text, #111827);
          cursor: pointer;
          transition: all 150ms;
        }

        .stage-action:hover:not(:disabled) {
          background: var(--color-primary-50, #eff6ff);
          border-color: var(--color-primary-300, #93c5fd);
          color: var(--color-primary-600, #2563eb);
        }

        .stage-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stage-connector {
          width: 2rem;
          height: 2px;
          background: var(--color-gray-200, #e5e7eb);
        }

        .stage-connector.active {
          background: var(--color-success-400, #4ade80);
        }

        @media (max-width: 768px) {
          .stage-connector {
            width: 2px;
            height: 1rem;
            margin: 0 auto;
          }
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .stat-card {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.25rem;
          text-align: center;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 600;
          color: var(--color-text, #111827);
        }

        .stat-label {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.25rem;
        }
      </style>

      ${this._renderOverview()}
    `;

    // Re-attach event listeners
    this._setupEventListeners();
  }
}

customElements.define('project-detail-page', ProjectDetailPage);

export default ProjectDetailPage;
