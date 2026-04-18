/**
 * Network Meta-Analysis Page
 * Living Meta-Analysis Platform
 *
 * Comprehensive network meta-analysis with:
 * - Network construction and visualization
 * - Frequentist NMA (netmeta-like approach)
 * - League tables with P-scores
 * - Inconsistency testing (node-splitting)
 * - Comparison-adjusted funnel plot
 */

import { db } from '../db.js';
import { router } from '../router.js';
import {
  buildNetwork,
  runNMA,
  nodeSplitting,
  componentNMA,
  calculateSUCRA,
  getNetworkPlotData,
  comparisonAdjustedFunnel
} from '../engine/network-meta-analysis.js';
import { formatNumber, formatPValue } from '../utils/format.js';

class NMAPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
    this._contrasts = [];
    this._network = null;
    this._nmaResult = null;
    this._loading = true;
    this._activeTab = 'network';
    this._settings = {
      model: 'random',
      method: 'REML',
      reference: null,
      smallSampleCorrection: true
    };
    this._nodeSplitResult = null;
  }

  async connectedCallback() {
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

      await this._loadContrasts();
    } catch (err) {
      console.error('Failed to load project:', err);
      this._showToast('Failed to load project', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  }

  async _loadContrasts() {
    try {
      const allRecords = await db.records.query('projectId', this._project.id);

      // Get studies with completed extraction for NMA
      this._contrasts = allRecords
        .filter(r => r.extraction?.status === 'completed')
        .map(r => {
          const e = r.extraction;
          // For NMA, we need treatment names and effect sizes
          return {
            id: r.id,
            study: r.nctId || r.title,
            treat1: e.armData?.[0]?.name || 'Control',
            treat2: e.armData?.[1]?.name || 'Treatment',
            yi: e.effectSize || 0,
            vi: e.variance || 0.1,
            se: Math.sqrt(e.variance || 0.1)
          };
        })
        .filter(c => c.yi !== 0 || c.vi !== 0);

      // Get unique treatments for reference selection
      const treatments = new Set();
      this._contrasts.forEach(c => {
        treatments.add(c.treat1);
        treatments.add(c.treat2);
      });
      this._treatments = [...treatments];

      if (!this._settings.reference && this._treatments.length > 0) {
        // Default to placebo/control if available
        const controlLike = this._treatments.find(t =>
          /placebo|control|standard|usual|soc/i.test(t)
        );
        this._settings.reference = controlLike || this._treatments[0];
      }

    } catch (err) {
      console.error('Failed to load contrasts:', err);
    }
  }

  _setupEventListeners() {
    this.shadowRoot.addEventListener('change', (e) => {
      const target = e.target;

      if (target.id === 'model-select') {
        this._settings.model = target.value;
        this.render();
      } else if (target.id === 'method-select') {
        this._settings.method = target.value;
        this.render();
      } else if (target.id === 'reference-select') {
        this._settings.reference = target.value;
        if (this._nmaResult) {
          this._runNMA();
        }
      }
    });

    this.shadowRoot.addEventListener('click', async (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.id === 'run-nma-btn') {
        await this._runNMA();
      } else if (target.id === 'run-nodesplit-btn') {
        await this._runNodeSplitting();
      } else if (target.dataset.tab) {
        this._activeTab = target.dataset.tab;
        this.render();
      }
    });
  }

  async _runNMA() {
    if (this._contrasts.length < 3) {
      this._showToast('Need at least 3 contrasts for NMA', 'warning');
      return;
    }

    try {
      // Build network
      this._network = buildNetwork(this._contrasts);

      if (this._network.treatments.length < 3) {
        this._showToast('Need at least 3 treatments for NMA', 'warning');
        return;
      }

      // Run NMA
      this._nmaResult = runNMA(this._network, {
        reference: this._settings.reference,
        model: this._settings.model,
        method: this._settings.method,
        smallSampleCorrection: this._settings.smallSampleCorrection
      });

      this.render();
      this._showToast('Network meta-analysis complete', 'success');

    } catch (err) {
      console.error('NMA failed:', err);
      this._showToast('NMA failed: ' + err.message, 'error');
    }
  }

  async _runNodeSplitting() {
    if (!this._nmaResult) {
      this._showToast('Run NMA first', 'warning');
      return;
    }

    try {
      this._showToast('Running node-splitting analysis...', 'info');

      this._nodeSplitResult = nodeSplitting(this._network, {
        method: this._settings.method
      });

      this.render();
      this._showToast('Node-splitting complete', 'success');

    } catch (err) {
      console.error('Node-splitting failed:', err);
      this._showToast('Node-splitting failed: ' + err.message, 'error');
    }
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) {
      toast.show(message, type);
    }
  }

  _renderTabs() {
    const tabs = [
      { id: 'network', label: 'Network' },
      { id: 'results', label: 'Results' },
      { id: 'league', label: 'League Table' },
      { id: 'ranking', label: 'Rankings' },
      { id: 'inconsistency', label: 'Inconsistency' },
      { id: 'funnel', label: 'Funnel Plot' }
    ];

    return `
      <div class="tabs">
        ${tabs.map(tab => `
          <button class="tab ${this._activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            ${tab.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  _renderNetwork() {
    if (!this._network) {
      return '<p class="text-muted">Run NMA to see network visualization</p>';
    }

    const plotData = getNetworkPlotData(this._network);
    const { nodes, edges } = plotData;

    // SVG network visualization
    const width = 500;
    const height = 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 150;

    // Position nodes in a circle
    const nodePositions = {};
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      nodePositions[node.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });

    // Find max edge weight for scaling
    const maxWeight = Math.max(...edges.map(e => e.weight));

    return `
      <div class="network-viz">
        <h4>Network Structure</h4>
        <svg viewBox="0 0 ${width} ${height}" class="network-svg">
          <!-- Edges -->
          ${edges.map(edge => {
            const from = nodePositions[edge.from];
            const to = nodePositions[edge.to];
            const strokeWidth = 1 + (edge.weight / maxWeight) * 5;
            return `
              <line
                x1="${from.x}" y1="${from.y}"
                x2="${to.x}" y2="${to.y}"
                stroke="var(--color-gray-400, #9ca3af)"
                stroke-width="${strokeWidth}"
                opacity="0.6"
              >
                <title>${edge.from} vs ${edge.to}: ${edge.weight} studies</title>
              </line>
            `;
          }).join('')}

          <!-- Nodes -->
          ${nodes.map(node => {
            const pos = nodePositions[node.id];
            const nodeRadius = 8 + Math.sqrt(node.studies) * 3;
            const isRef = node.id === this._settings.reference;
            return `
              <circle
                cx="${pos.x}" cy="${pos.y}" r="${nodeRadius}"
                fill="${isRef ? 'var(--color-primary-600, #2563eb)' : 'var(--color-primary-400, #60a5fa)'}"
                stroke="white" stroke-width="2"
              >
                <title>${node.id}: ${node.studies} studies</title>
              </circle>
              <text
                x="${pos.x}" y="${pos.y + nodeRadius + 15}"
                text-anchor="middle" font-size="11"
                fill="var(--color-text, #111827)"
              >${node.id}</text>
            `;
          }).join('')}
        </svg>

        <div class="network-stats">
          <div class="stat-row">
            <span class="stat-name">Treatments:</span>
            <span class="stat-val">${this._network.treatments.length}</span>
          </div>
          <div class="stat-row">
            <span class="stat-name">Contrasts:</span>
            <span class="stat-val">${this._network.contrasts.length}</span>
          </div>
          <div class="stat-row">
            <span class="stat-name">Studies:</span>
            <span class="stat-val">${new Set(this._contrasts.map(c => c.study)).size}</span>
          </div>
          <div class="stat-row">
            <span class="stat-name">Connected:</span>
            <span class="stat-val">${this._network.connected ? 'Yes' : 'No (multi-component)'}</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderResults() {
    if (!this._nmaResult) {
      return '<p class="text-muted">Run NMA to see results</p>';
    }

    const r = this._nmaResult;

    return `
      <div class="results-section">
        <h4>Network Meta-Analysis Results</h4>
        <p class="section-desc">Reference treatment: ${this._settings.reference}</p>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">τ² (heterogeneity)</div>
            <div class="stat-value">${r.tau2.toFixed(4)}</div>
            <div class="stat-hint">Between-study variance</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">I²</div>
            <div class="stat-value">${r.I2.toFixed(1)}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Q statistic</div>
            <div class="stat-value">${r.Q?.toFixed(2) || 'N/A'}</div>
            <div class="stat-hint">df = ${r.df || 'N/A'}</div>
          </div>
        </div>

        <h4 style="margin-top: 1.5rem;">Treatment Effects vs ${this._settings.reference}</h4>

        <div class="effects-table">
          <div class="table-header">
            <div class="cell">Treatment</div>
            <div class="cell">Effect</div>
            <div class="cell">95% CI</div>
            <div class="cell">p-value</div>
          </div>
          ${Object.entries(r.effects)
            .filter(([treat]) => treat !== this._settings.reference)
            .sort((a, b) => b[1].estimate - a[1].estimate)
            .map(([treat, data]) => `
              <div class="table-row">
                <div class="cell">${treat}</div>
                <div class="cell">${data.estimate.toFixed(3)}</div>
                <div class="cell">[${data.ci[0].toFixed(3)}, ${data.ci[1].toFixed(3)}]</div>
                <div class="cell ${data.p < 0.05 ? 'text-success' : ''}">${formatPValue(data.p)}</div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }

  _renderLeagueTable() {
    if (!this._nmaResult || !this._nmaResult.leagueTable) {
      return '<p class="text-muted">Run NMA to see league table</p>';
    }

    const table = this._nmaResult.leagueTable;
    const treatments = this._network.treatments;

    return `
      <div class="league-section">
        <h4>League Table</h4>
        <p class="section-desc">Row treatment vs column treatment. Effects in lower triangle, 95% CI in upper triangle.</p>

        <div class="league-table-container">
          <table class="league-table">
            <tr>
              <th></th>
              ${treatments.map(t => `<th>${t}</th>`).join('')}
            </tr>
            ${treatments.map((rowTreat, i) => `
              <tr>
                <th>${rowTreat}</th>
                ${treatments.map((colTreat, j) => {
                  if (i === j) {
                    return `<td class="diagonal">${rowTreat}</td>`;
                  }
                  const key = `${rowTreat}_vs_${colTreat}`;
                  const data = table[key];
                  if (!data) return '<td>-</td>';

                  if (i > j) {
                    // Lower triangle: effect estimate
                    const isSignif = data.p < 0.05;
                    return `<td class="${isSignif ? 'significant' : ''}">${data.estimate.toFixed(2)}</td>`;
                  } else {
                    // Upper triangle: CI
                    return `<td class="ci">[${data.ci[0].toFixed(2)}, ${data.ci[1].toFixed(2)}]</td>`;
                  }
                }).join('')}
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
  }

  _renderRankings() {
    if (!this._nmaResult || !this._nmaResult.pScores) {
      return '<p class="text-muted">Run NMA to see rankings</p>';
    }

    const pScores = this._nmaResult.pScores;
    const ranked = Object.entries(pScores)
      .sort((a, b) => b[1] - a[1])
      .map(([treat, score], i) => ({ rank: i + 1, treat, score }));

    return `
      <div class="ranking-section">
        <h4>Treatment Rankings (P-scores)</h4>
        <p class="section-desc">P-score represents the probability that a treatment is better than average. Higher is better.</p>

        <div class="ranking-chart">
          ${ranked.map(r => `
            <div class="ranking-row">
              <div class="rank-number">${r.rank}</div>
              <div class="rank-treat">${r.treat}</div>
              <div class="rank-bar-container">
                <div class="rank-bar" style="width: ${r.score * 100}%"></div>
              </div>
              <div class="rank-score">${(r.score * 100).toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>

        <div class="ranking-table">
          <div class="table-header">
            <div class="cell">Rank</div>
            <div class="cell">Treatment</div>
            <div class="cell">P-score</div>
            <div class="cell">SUCRA</div>
          </div>
          ${ranked.map(r => `
            <div class="table-row">
              <div class="cell">${r.rank}</div>
              <div class="cell">${r.treat}</div>
              <div class="cell">${(r.score * 100).toFixed(1)}%</div>
              <div class="cell">${(r.score * 100).toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderInconsistency() {
    if (!this._nmaResult) {
      return '<p class="text-muted">Run NMA first</p>';
    }

    return `
      <div class="inconsistency-section">
        <h4>Inconsistency Assessment</h4>
        <p class="section-desc">Tests for disagreement between direct and indirect evidence</p>

        <div class="stats-grid">
          <div class="stat-card ${this._nmaResult.inconsistency?.globalPValue < 0.05 ? 'warning-card' : ''}">
            <div class="stat-label">Global Inconsistency</div>
            <div class="stat-value">Q = ${this._nmaResult.inconsistency?.Q?.toFixed(2) || 'N/A'}</div>
            <div class="stat-hint">p = ${formatPValue(this._nmaResult.inconsistency?.globalPValue)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Design-by-Treatment</div>
            <div class="stat-value">${this._nmaResult.inconsistency?.designByTreatment ? 'Detected' : 'None'}</div>
          </div>
        </div>

        <div class="nodesplit-section">
          <h5>Node-Splitting Analysis</h5>
          <p class="section-desc">Compares direct vs indirect evidence for each comparison</p>
          <button class="btn btn-secondary" id="run-nodesplit-btn">Run Node-Splitting</button>

          ${this._nodeSplitResult ? this._renderNodeSplitResults() : ''}
        </div>
      </div>
    `;
  }

  _renderNodeSplitResults() {
    const results = this._nodeSplitResult;

    return `
      <div class="nodesplit-results">
        <div class="nodesplit-table">
          <div class="table-header">
            <div class="cell">Comparison</div>
            <div class="cell">Direct</div>
            <div class="cell">Indirect</div>
            <div class="cell">Difference</div>
            <div class="cell">p-value</div>
          </div>
          ${results.map(r => `
            <div class="table-row ${r.p < 0.05 ? 'highlight' : ''}">
              <div class="cell">${r.comparison}</div>
              <div class="cell">${r.direct?.toFixed(3) || 'N/A'}</div>
              <div class="cell">${r.indirect?.toFixed(3) || 'N/A'}</div>
              <div class="cell">${r.difference?.toFixed(3) || 'N/A'}</div>
              <div class="cell ${r.p < 0.05 ? 'text-danger' : ''}">${formatPValue(r.p)}</div>
            </div>
          `).join('')}
        </div>

        ${results.some(r => r.p < 0.05) ? `
          <div class="result-card warning-card" style="margin-top: 1rem;">
            <div class="result-label">Inconsistency Detected</div>
            <div class="result-hint">Some comparisons show significant disagreement between direct and indirect evidence. Consider exploring potential effect modifiers or using a more complex model.</div>
          </div>
        ` : `
          <div class="result-card success-card" style="margin-top: 1rem;">
            <div class="result-label">No Significant Inconsistency</div>
            <div class="result-hint">Direct and indirect evidence are consistent across all comparisons.</div>
          </div>
        `}
      </div>
    `;
  }

  _renderFunnelPlot() {
    if (!this._nmaResult) {
      return '<p class="text-muted">Run NMA to see comparison-adjusted funnel plot</p>';
    }

    const funnelData = comparisonAdjustedFunnel(this._network, this._nmaResult);
    if (!funnelData || funnelData.points.length === 0) {
      return '<p class="text-muted">Not enough data for funnel plot</p>';
    }

    const { points, pooledSE } = funnelData;

    // Calculate plot bounds
    const adjustedEffects = points.map(p => p.adjustedEffect);
    const se = points.map(p => p.se);
    const maxSE = Math.max(...se);

    const minEffect = Math.min(...adjustedEffects) - 0.5;
    const maxEffect = Math.max(...adjustedEffects) + 0.5;
    const xRange = maxEffect - minEffect;

    const width = 500;
    const height = 400;
    const padding = { top: 20, right: 40, bottom: 50, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const toX = (effect) => padding.left + ((effect - minEffect) / xRange) * plotWidth;
    const toY = (seVal) => padding.top + (seVal / maxSE) * plotHeight;

    return `
      <div class="funnel-section">
        <h4>Comparison-Adjusted Funnel Plot</h4>
        <p class="section-desc">Points centered at comparison-specific pooled effects to assess small-study bias</p>

        <svg viewBox="0 0 ${width} ${height}" class="funnel-svg">
          <!-- Funnel region -->
          <polygon
            points="${toX(0 - 1.96 * maxSE)},${toY(maxSE)} ${toX(0)},${toY(0)} ${toX(0 + 1.96 * maxSE)},${toY(maxSE)}"
            fill="var(--color-gray-100, #f3f4f6)"
            stroke="var(--color-gray-300, #d1d5db)"
          />

          <!-- Axes -->
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"
                stroke="var(--color-gray-400, #9ca3af)"/>
          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"
                stroke="var(--color-gray-400, #9ca3af)"/>

          <!-- Zero line -->
          <line x1="${toX(0)}" y1="${padding.top}" x2="${toX(0)}" y2="${height - padding.bottom}"
                stroke="var(--color-gray-500, #6b7280)" stroke-dasharray="4"/>

          <!-- Points -->
          ${points.map(p => `
            <circle cx="${toX(p.adjustedEffect)}" cy="${toY(p.se)}" r="4"
                    fill="var(--color-primary-500, #3b82f6)"
                    stroke="white" stroke-width="1">
              <title>${p.comparison}: ${p.adjustedEffect.toFixed(3)} (SE: ${p.se.toFixed(3)})</title>
            </circle>
          `).join('')}

          <!-- Labels -->
          <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="12">Centered Effect</text>
          <text x="15" y="${height / 2}" text-anchor="middle" font-size="12" transform="rotate(-90, 15, ${height / 2})">Standard Error</text>
        </svg>
      </div>
    `;
  }

  _renderTabContent() {
    switch (this._activeTab) {
      case 'network':
        return this._renderNetwork();
      case 'results':
        return this._renderResults();
      case 'league':
        return this._renderLeagueTable();
      case 'ranking':
        return this._renderRankings();
      case 'inconsistency':
        return this._renderInconsistency();
      case 'funnel':
        return this._renderFunnelPlot();
      default:
        return '';
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
          <p>Loading...</p>
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

        .project-name {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .settings-card {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .settings-row {
          display: flex;
          gap: 1.5rem;
          align-items: flex-end;
          flex-wrap: wrap;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .form-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text, #111827);
        }

        .form-select {
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
          min-width: 150px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: var(--radius-md, 0.375rem);
          cursor: pointer;
          transition: all 150ms;
          border: none;
        }

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover {
          background: var(--color-primary-700, #1d4ed8);
        }

        .btn-secondary {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-text, #111827);
          border: 1px solid var(--color-border, #d1d5db);
        }

        .tabs {
          display: flex;
          gap: 0.25rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
          margin-bottom: 1.5rem;
          overflow-x: auto;
        }

        .tab {
          padding: 0.75rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text-secondary, #6b7280);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          white-space: nowrap;
        }

        .tab.active {
          color: var(--color-primary-600, #2563eb);
          border-bottom-color: var(--color-primary-600, #2563eb);
        }

        /* Network viz */
        .network-viz {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.5rem;
        }

        .network-svg {
          width: 100%;
          max-width: 500px;
          height: auto;
          display: block;
          margin: 0 auto;
        }

        .network-stats {
          display: flex;
          justify-content: center;
          gap: 2rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        .stat-row {
          font-size: 0.875rem;
        }

        .stat-name {
          color: var(--color-text-secondary, #6b7280);
        }

        .stat-val {
          font-weight: 600;
          color: var(--color-text, #111827);
        }

        /* Results section */
        .results-section, .league-section, .ranking-section, .inconsistency-section, .funnel-section {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.5rem;
        }

        h4 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0 0 0.5rem 0;
        }

        h5 {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 1.5rem 0 0.5rem 0;
        }

        .section-desc {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          margin-bottom: 1rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .stat-card {
          padding: 1rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
          text-align: center;
        }

        .stat-card.warning-card {
          background: var(--color-warning-50, #fffbeb);
          border: 1px solid var(--color-warning-200, #fde68a);
        }

        .stat-card.success-card {
          background: var(--color-success-50, #ecfdf5);
          border: 1px solid var(--color-success-200, #a7f3d0);
        }

        .stat-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
          text-transform: uppercase;
        }

        .stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0.25rem 0;
        }

        .stat-hint {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
        }

        /* Tables */
        .effects-table, .nodesplit-table, .ranking-table {
          display: grid;
          font-size: 0.875rem;
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-md, 0.375rem);
          overflow: hidden;
        }

        .effects-table { grid-template-columns: 2fr 1fr 2fr 1fr; }
        .nodesplit-table { grid-template-columns: 2fr 1fr 1fr 1fr 1fr; }
        .ranking-table { grid-template-columns: 1fr 2fr 1fr 1fr; }

        .table-header, .table-row {
          display: contents;
        }

        .table-header .cell {
          padding: 0.75rem;
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
          background: var(--color-gray-50, #f9fafb);
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .table-row .cell {
          padding: 0.75rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .table-row.highlight .cell {
          background: var(--color-warning-50, #fffbeb);
        }

        .text-success { color: var(--color-success-600, #059669); }
        .text-danger { color: var(--color-danger-600, #dc2626); }
        .text-muted { color: var(--color-text-secondary, #6b7280); }

        /* League table */
        .league-table-container {
          overflow-x: auto;
        }

        .league-table {
          border-collapse: collapse;
          font-size: 0.75rem;
          width: 100%;
          min-width: 600px;
        }

        .league-table th, .league-table td {
          padding: 0.5rem;
          border: 1px solid var(--color-border, #e5e7eb);
          text-align: center;
        }

        .league-table th {
          background: var(--color-gray-100, #f3f4f6);
          font-weight: 600;
        }

        .league-table td.diagonal {
          background: var(--color-gray-200, #e5e7eb);
          font-weight: 600;
        }

        .league-table td.significant {
          background: var(--color-success-50, #ecfdf5);
          font-weight: 600;
        }

        .league-table td.ci {
          font-size: 0.65rem;
          color: var(--color-text-secondary, #6b7280);
        }

        /* Ranking chart */
        .ranking-chart {
          margin-bottom: 1.5rem;
        }

        .ranking-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .rank-number {
          width: 24px;
          height: 24px;
          background: var(--color-primary-100, #dbeafe);
          color: var(--color-primary-700, #1d4ed8);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .rank-treat {
          width: 120px;
          font-size: 0.875rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rank-bar-container {
          flex: 1;
          height: 20px;
          background: var(--color-gray-100, #f3f4f6);
          border-radius: var(--radius-md, 0.375rem);
          overflow: hidden;
        }

        .rank-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--color-primary-400, #60a5fa), var(--color-primary-600, #2563eb));
          border-radius: var(--radius-md, 0.375rem);
          transition: width 0.5s ease;
        }

        .rank-score {
          width: 50px;
          font-size: 0.875rem;
          font-weight: 600;
          text-align: right;
        }

        /* Funnel */
        .funnel-svg {
          width: 100%;
          max-width: 500px;
          height: auto;
          display: block;
          margin: 0 auto;
        }

        /* Result cards */
        .result-card {
          padding: 1rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
        }

        .result-card.warning-card {
          background: var(--color-warning-50, #fffbeb);
          border: 1px solid var(--color-warning-200, #fde68a);
        }

        .result-card.success-card {
          background: var(--color-success-50, #ecfdf5);
          border: 1px solid var(--color-success-200, #a7f3d0);
        }

        .result-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
          text-transform: uppercase;
          margin-bottom: 0.5rem;
        }

        .result-hint {
          font-size: 0.875rem;
          color: var(--color-text, #111827);
        }

        /* Empty state */
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
          margin-bottom: 0.5rem;
        }

        .nodesplit-results {
          margin-top: 1rem;
        }

        @media (max-width: 768px) {
          .settings-row {
            flex-direction: column;
          }
          .network-stats {
            flex-wrap: wrap;
          }
        }
      </style>

      <div class="page-header">
        <div>
          <h1 class="page-title">Network Meta-Analysis</h1>
          ${this._project ? `<div class="project-name">${this._project.name}</div>` : ''}
        </div>
      </div>

      ${this._contrasts.length < 3 ? `
        <div class="empty-state">
          <div class="empty-icon">🕸️</div>
          <h2 class="empty-title">Not enough data for NMA</h2>
          <p class="text-muted">Network meta-analysis requires at least 3 treatment comparisons across studies.</p>
          <a href="#/extraction?project=${this._project?.id}" class="btn btn-primary" style="margin-top: 1rem; text-decoration: none;">Go to Extraction</a>
        </div>
      ` : `
        <div class="settings-card">
          <div class="settings-row">
            <div class="form-group">
              <label class="form-label">Model</label>
              <select class="form-select" id="model-select">
                <option value="random" ${this._settings.model === 'random' ? 'selected' : ''}>Random Effects</option>
                <option value="fixed" ${this._settings.model === 'fixed' ? 'selected' : ''}>Fixed Effects</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">τ² Estimation</label>
              <select class="form-select" id="method-select">
                <option value="REML" ${this._settings.method === 'REML' ? 'selected' : ''}>REML</option>
                <option value="DL" ${this._settings.method === 'DL' ? 'selected' : ''}>DerSimonian-Laird</option>
                <option value="ML" ${this._settings.method === 'ML' ? 'selected' : ''}>Maximum Likelihood</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Reference Treatment</label>
              <select class="form-select" id="reference-select">
                ${this._treatments.map(t => `
                  <option value="${t}" ${this._settings.reference === t ? 'selected' : ''}>${t}</option>
                `).join('')}
              </select>
            </div>

            <button class="btn btn-primary" id="run-nma-btn">
              Run Network MA
            </button>
          </div>

          <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--color-text-secondary);">
            ${this._contrasts.length} contrasts • ${this._treatments.length} treatments
          </div>
        </div>

        ${this._nmaResult ? `
          ${this._renderTabs()}
          <div class="tab-content">
            ${this._renderTabContent()}
          </div>
        ` : ''}
      `}
    `;
  }
}

customElements.define('nma-page', NMAPage);

export default NMAPage;
