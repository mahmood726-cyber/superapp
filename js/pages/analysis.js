/**
 * Analysis Page
 * Living Meta-Analysis Platform
 *
 * Comprehensive meta-analysis execution with advanced features:
 * - Multiple estimation methods (DL, REML, PM, FE)
 * - Meta-regression with covariates
 * - Subgroup analysis with Q-between test
 * - Leave-one-out sensitivity analysis
 * - Forest plot and funnel plot visualization
 * - Full publication bias assessment
 */

import { db } from '../db.js';
import { store, actions } from '../store.js';
import { router } from '../router.js';
import {
  runMetaAnalysis,
  metaRegression,
  subgroupAnalysis,
  leaveOneOut,
  cumulativeMA,
  eggerTest,
  beggTest,
  petersTest,
  trimAndFill
} from '../engine/meta-analysis.js';
import {
  robustVarianceEstimation,
  copasSelectionModel,
  threeParameterSelectionModel,
  veveaHedgesSelectionModel,
  petPeese,
  pCurve,
  pUniform,
  bayesianMetaAnalysis,
  estimateTau2,
  threeLevelMA,
  permutationTest
} from '../engine/advanced-methods.js';
import { formatNumber, formatPValue, formatEffect } from '../utils/format.js';

class AnalysisPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
    this._studies = [];
    this._result = null;
    this._loading = true;
    this._activeTab = 'main';
    this._settings = {
      method: 'DL',
      hksj: true,
      hksjFloor: false,
      outcomeType: 'binary',
      effectMeasure: 'rr',
      correction: 'tacc'
    };
    this._metaRegResult = null;
    this._subgroupResult = null;
    this._leaveOneOutResult = null;
    this._cumulativeResult = null;
    this._selectedCovariate = null;
    this._selectedSubgroupVar = null;

    // Advanced methods results
    this._rveResult = null;
    this._selectionModelResult = null;
    this._petPeeseResult = null;
    this._pCurveResult = null;
    this._pUniformResult = null;
    this._bayesianResult = null;
    this._threeLevelResult = null;
    this._permutationResult = null;
    this._advancedTau2 = null;
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

      await this._loadStudies();
    } catch (err) {
      console.error('Failed to load project:', err);
      this._showToast('Failed to load project', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  }

  async _loadStudies() {
    try {
      const allRecords = await db.records.query('projectId', this._project.id);

      // Get studies with completed extraction
      this._studies = allRecords
        .filter(r => r.extraction?.status === 'completed')
        .map(r => ({
          id: r.id,
          nctId: r.nctId,
          title: r.title,
          ...r.extraction
        }));

      // Determine outcome type and effect measure from first study
      if (this._studies.length > 0) {
        if (this._studies[0].outcomeType) {
          this._settings.outcomeType = this._studies[0].outcomeType;
        }
        if (this._studies[0].effectMeasure) {
          this._settings.effectMeasure = this._studies[0].effectMeasure;
        }
      }

      // Extract available covariates for meta-regression
      this._extractCovariates();

    } catch (err) {
      console.error('Failed to load studies:', err);
    }
  }

  _extractCovariates() {
    // Collect potential covariates from study data
    this._covariates = [];
    this._subgroupVars = [];

    if (this._studies.length === 0) return;

    // Standard covariates
    const numericCovariates = ['year', 'sampleSize', 'meanAge', 'percentFemale', 'followUpWeeks'];
    const categoricalCovariates = ['region', 'setting', 'riskOfBias', 'fundingSource', 'analysisType'];

    // Check which covariates are available
    for (const covar of numericCovariates) {
      const values = this._studies.map(s => s[covar] || s.covariates?.[covar]).filter(v => v != null && !isNaN(v));
      if (values.length >= this._studies.length * 0.5) {
        this._covariates.push({ name: covar, type: 'numeric', label: this._formatCovarLabel(covar) });
      }
    }

    for (const covar of categoricalCovariates) {
      const values = this._studies.map(s => s[covar] || s.covariates?.[covar]).filter(v => v != null && v !== '');
      if (values.length >= this._studies.length * 0.5) {
        const uniqueValues = [...new Set(values)];
        if (uniqueValues.length >= 2 && uniqueValues.length <= 10) {
          this._subgroupVars.push({ name: covar, type: 'categorical', label: this._formatCovarLabel(covar), levels: uniqueValues });
        }
      }
    }

    // Add sample size as default numeric covariate
    if (!this._covariates.find(c => c.name === 'sampleSize')) {
      this._covariates.push({ name: 'sampleSize', type: 'numeric', label: 'Sample Size' });
    }
  }

  _formatCovarLabel(name) {
    const labels = {
      year: 'Publication Year',
      sampleSize: 'Sample Size',
      meanAge: 'Mean Age',
      percentFemale: '% Female',
      followUpWeeks: 'Follow-up (weeks)',
      region: 'Geographic Region',
      setting: 'Clinical Setting',
      riskOfBias: 'Risk of Bias',
      fundingSource: 'Funding Source',
      analysisType: 'Analysis Type (ITT/PP)'
    };
    return labels[name] || name;
  }

  _setupEventListeners() {
    this.shadowRoot.addEventListener('change', (e) => {
      const target = e.target;

      if (target.id === 'method-select') {
        this._settings.method = target.value;
        this.render();
      } else if (target.id === 'hksj-check') {
        this._settings.hksj = target.checked;
        this.render();
      } else if (target.id === 'hksj-floor-check') {
        this._settings.hksjFloor = target.checked;
        this.render();
      } else if (target.id === 'correction-select') {
        this._settings.correction = target.value;
        this.render();
      } else if (target.id === 'covariate-select') {
        this._selectedCovariate = target.value;
      } else if (target.id === 'subgroup-select') {
        this._selectedSubgroupVar = target.value;
      }
    });

    this.shadowRoot.addEventListener('click', async (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.id === 'run-btn') {
        await this._runAnalysis();
      } else if (target.id === 'run-metareg-btn') {
        await this._runMetaRegression();
      } else if (target.id === 'run-subgroup-btn') {
        await this._runSubgroupAnalysis();
      } else if (target.id === 'run-sensitivity-btn') {
        await this._runSensitivityAnalysis();
      } else if (target.id === 'run-copas-btn') {
        await this._runCopasModel();
      } else if (target.id === 'run-3psm-btn') {
        await this._run3PSM();
      } else if (target.id === 'run-vevea-btn') {
        await this._runVeveaHedges();
      } else if (target.id === 'run-petpeese-btn') {
        await this._runPetPeese();
      } else if (target.id === 'run-pcurve-btn') {
        await this._runPCurve();
      } else if (target.id === 'run-puniform-btn') {
        await this._runPUniform();
      } else if (target.id === 'run-bayesian-btn') {
        await this._runBayesianAnalysis();
      } else if (target.id === 'run-rve-btn') {
        await this._runRVE();
      } else if (target.id === 'run-threelevel-btn') {
        await this._runThreeLevelModel();
      } else if (target.id === 'run-permutation-btn') {
        await this._runPermutationTest();
      } else if (target.id === 'run-tau2-comparison-btn') {
        await this._runTau2Comparison();
      } else if (target.dataset.tab) {
        this._activeTab = target.dataset.tab;
        this.render();
      }
    });
  }

  // ============================================
  // ADVANCED METHOD RUNNERS
  // ============================================

  async _runCopasModel() {
    if (!this._result) return;
    try {
      this._selectionModelResult = copasSelectionModel(this._result.yi, this._result.vi);
      this._selectionModelResult.method = 'Copas';
      this.render();
      this._showToast('Copas selection model complete', 'success');
    } catch (err) {
      console.error('Copas model failed:', err);
      this._showToast('Copas model failed: ' + err.message, 'error');
    }
  }

  async _run3PSM() {
    if (!this._result) return;
    try {
      this._selectionModelResult = threeParameterSelectionModel(this._result.yi, this._result.vi);
      this._selectionModelResult.method = '3-Parameter Selection';
      this.render();
      this._showToast('3PSM complete', 'success');
    } catch (err) {
      console.error('3PSM failed:', err);
      this._showToast('3PSM failed: ' + err.message, 'error');
    }
  }

  async _runVeveaHedges() {
    if (!this._result) return;
    try {
      this._selectionModelResult = veveaHedgesSelectionModel(this._result.yi, this._result.vi);
      this._selectionModelResult.method = 'Vevea-Hedges';
      this.render();
      this._showToast('Vevea-Hedges model complete', 'success');
    } catch (err) {
      console.error('Vevea-Hedges failed:', err);
      this._showToast('Vevea-Hedges failed: ' + err.message, 'error');
    }
  }

  async _runPetPeese() {
    if (!this._result) return;
    try {
      this._petPeeseResult = petPeese(this._result.yi, this._result.vi);
      this.render();
      this._showToast('PET-PEESE complete', 'success');
    } catch (err) {
      console.error('PET-PEESE failed:', err);
      this._showToast('PET-PEESE failed: ' + err.message, 'error');
    }
  }

  async _runPCurve() {
    if (!this._result) return;
    try {
      // Calculate t-statistics and sample sizes for p-curve
      const tStats = this._result.yi.map((y, i) => y / Math.sqrt(this._result.vi[i]));
      const ns = this._studies.map(s => {
        const n1 = parseFloat(s.armData?.[0]?.total || 50);
        const n2 = parseFloat(s.armData?.[1]?.total || 50);
        return n1 + n2;
      });
      this._pCurveResult = pCurve(tStats, ns);
      this.render();
      this._showToast('P-curve analysis complete', 'success');
    } catch (err) {
      console.error('P-curve failed:', err);
      this._showToast('P-curve failed: ' + err.message, 'error');
    }
  }

  async _runPUniform() {
    if (!this._result) return;
    try {
      const tStats = this._result.yi.map((y, i) => y / Math.sqrt(this._result.vi[i]));
      const ns = this._studies.map(s => {
        const n1 = parseFloat(s.armData?.[0]?.total || 50);
        const n2 = parseFloat(s.armData?.[1]?.total || 50);
        return n1 + n2;
      });
      this._pUniformResult = pUniform(tStats, ns);
      this.render();
      this._showToast('P-uniform complete', 'success');
    } catch (err) {
      console.error('P-uniform failed:', err);
      this._showToast('P-uniform failed: ' + err.message, 'error');
    }
  }

  async _runBayesianAnalysis() {
    if (!this._result) return;
    try {
      // Get settings from UI
      const nIterSelect = this.shadowRoot.getElementById('mcmc-iter-select');
      const burnInSelect = this.shadowRoot.getElementById('mcmc-burnin-select');
      const priorMuSelect = this.shadowRoot.getElementById('prior-mu-select');
      const priorTauSelect = this.shadowRoot.getElementById('prior-tau-select');

      const nIter = parseInt(nIterSelect?.value || '10000');
      const burnIn = parseInt(burnInSelect?.value || '2000');

      // Set priors based on selection
      let priorMu = { mean: 0, sd: 10 };
      if (priorMuSelect?.value === 'vague') priorMu = { mean: 0, sd: 100 };
      else if (priorMuSelect?.value === 'skeptical') priorMu = { mean: 0, sd: 1 };

      let priorTau = { shape: 1, scale: 0.5 };
      if (priorTauSelect?.value === 'uniform') priorTau = { shape: 1, scale: 2 };
      else if (priorTauSelect?.value === 'invgamma') priorTau = { shape: 1, scale: 0.5 };

      this._showToast('Running Bayesian MCMC (this may take a moment)...', 'info');

      // Run asynchronously to not block UI
      await new Promise(resolve => setTimeout(resolve, 50));

      this._bayesianResult = bayesianMetaAnalysis(this._result.yi, this._result.vi, {
        nIter,
        burnIn,
        priorMu,
        priorTau
      });

      this.render();
      this._showToast('Bayesian analysis complete', 'success');
    } catch (err) {
      console.error('Bayesian analysis failed:', err);
      this._showToast('Bayesian analysis failed: ' + err.message, 'error');
    }
  }

  async _runRVE() {
    if (!this._result) return;
    try {
      // Create cluster IDs (one effect per study in standard case)
      const clusterIds = this._studies.map((s, i) => i);
      this._rveResult = robustVarianceEstimation(this._result.yi, this._result.vi, clusterIds);
      this.render();
      this._showToast('RVE complete', 'success');
    } catch (err) {
      console.error('RVE failed:', err);
      this._showToast('RVE failed: ' + err.message, 'error');
    }
  }

  async _runThreeLevelModel() {
    if (!this._result) return;
    try {
      // Create study IDs (one effect per study in standard case)
      const studyIds = this._studies.map((s, i) => i);
      this._threeLevelResult = threeLevelMA(this._result.yi, this._result.vi, studyIds);
      this.render();
      this._showToast('Three-level model complete', 'success');
    } catch (err) {
      console.error('Three-level model failed:', err);
      this._showToast('Three-level model failed: ' + err.message, 'error');
    }
  }

  async _runPermutationTest() {
    if (!this._result) return;
    try {
      const nPermSelect = this.shadowRoot.getElementById('perm-n-select');
      const nPermutations = parseInt(nPermSelect?.value || '5000');

      this._showToast(`Running ${nPermutations.toLocaleString()} permutations...`, 'info');
      await new Promise(resolve => setTimeout(resolve, 50));

      this._permutationResult = permutationTest(this._result.yi, this._result.vi, {
        nPermutations,
        method: this._settings.method
      });

      this.render();
      this._showToast('Permutation test complete', 'success');
    } catch (err) {
      console.error('Permutation test failed:', err);
      this._showToast('Permutation test failed: ' + err.message, 'error');
    }
  }

  async _runTau2Comparison() {
    if (!this._result) return;
    try {
      const methods = ['DL', 'REML', 'ML', 'PM', 'HE', 'HS', 'SJ', 'EB', 'GENQ'];
      this._advancedTau2 = {};

      for (const method of methods) {
        try {
          const result = estimateTau2(this._result.yi, this._result.vi, method);
          this._advancedTau2[method] = {
            tau2: result.tau2,
            I2: result.I2 || this._calculateI2(result.tau2)
          };
        } catch (e) {
          this._advancedTau2[method] = { tau2: 0, I2: 0 };
        }
      }

      this.render();
      this._showToast('Tau² comparison complete', 'success');
    } catch (err) {
      console.error('Tau² comparison failed:', err);
      this._showToast('Tau² comparison failed: ' + err.message, 'error');
    }
  }

  _calculateI2(tau2) {
    if (!this._result || !this._result.vi) return 0;
    const typicalV = this._result.vi.reduce((a, b) => a + b, 0) / this._result.vi.length;
    return Math.max(0, tau2 / (tau2 + typicalV) * 100);
  }

  async _runAnalysis() {
    if (this._studies.length < 2) {
      this._showToast('Need at least 2 studies for meta-analysis', 'warning');
      return;
    }

    try {
      // Prepare data for analysis
      const studyData = this._prepareStudyData();

      this._result = runMetaAnalysis(studyData, {
        method: this._settings.method,
        hksj: this._settings.hksj,
        hksjApplyFloor: this._settings.hksjFloor,
        outcomeType: this._settings.outcomeType,
        effectMeasure: this._settings.effectMeasure,
        correction: this._settings.correction
      });

      // Save result to project
      this._project.analysisStats = {
        completed: 1,
        lastRun: new Date().toISOString(),
        method: this._settings.method,
        pooledEffect: this._result.estimate,
        i2: this._result.I2
      };
      this._project.updatedAt = new Date().toISOString();
      await db.projects.put(this._project);

      this.render();
      this._showToast('Analysis complete', 'success');

    } catch (err) {
      console.error('Analysis failed:', err);
      this._showToast('Analysis failed: ' + err.message, 'error');
    }
  }

  _prepareStudyData() {
    return this._studies.map(s => {
      if (s.outcomeType === 'binary') {
        return {
          id: s.id,
          name: s.nctId,
          arm1: {
            events: parseFloat(s.armData[0].events),
            total: parseFloat(s.armData[0].total)
          },
          arm2: {
            events: parseFloat(s.armData[1].events),
            total: parseFloat(s.armData[1].total)
          },
          covariates: s.covariates || {}
        };
      } else if (s.outcomeType === 'continuous') {
        return {
          id: s.id,
          name: s.nctId,
          arm1: {
            mean: parseFloat(s.armData[0].mean),
            sd: parseFloat(s.armData[0].sd),
            total: parseFloat(s.armData[0].total)
          },
          arm2: {
            mean: parseFloat(s.armData[1].mean),
            sd: parseFloat(s.armData[1].sd),
            total: parseFloat(s.armData[1].total)
          },
          covariates: s.covariates || {}
        };
      } else if (s.outcomeType === 'time-to-event') {
        return {
          id: s.id,
          name: s.nctId,
          hr: parseFloat(s.timeToEvent.hr),
          hrSE: s.timeToEvent.hrSE ? parseFloat(s.timeToEvent.hrSE) : null,
          hrLowerCI: s.timeToEvent.hrLowerCI ? parseFloat(s.timeToEvent.hrLowerCI) : null,
          hrUpperCI: s.timeToEvent.hrUpperCI ? parseFloat(s.timeToEvent.hrUpperCI) : null,
          covariates: s.covariates || {}
        };
      }
    });
  }

  async _runMetaRegression() {
    if (!this._result || !this._selectedCovariate) {
      this._showToast('Run main analysis first and select a covariate', 'warning');
      return;
    }

    try {
      const yi = this._result.yi;
      const vi = this._result.vi;

      // Extract covariate values
      const xValues = this._studies.map(s => {
        const val = s[this._selectedCovariate] || s.covariates?.[this._selectedCovariate];
        return val != null ? parseFloat(val) : null;
      });

      // Filter out missing values
      const validIndices = xValues.map((x, i) => x != null ? i : null).filter(i => i != null);
      const yFiltered = validIndices.map(i => yi[i]);
      const vFiltered = validIndices.map(i => vi[i]);
      const xFiltered = validIndices.map(i => xValues[i]);

      if (xFiltered.length < 3) {
        this._showToast('Not enough studies with covariate data', 'warning');
        return;
      }

      this._metaRegResult = metaRegression(yFiltered, vFiltered, xFiltered, {
        tau2: this._result.tau2,
        knha: this._settings.hksj
      });

      this._metaRegResult.covariate = this._selectedCovariate;
      this._metaRegResult.xValues = xFiltered;
      this._metaRegResult.yValues = yFiltered;

      this.render();
      this._showToast('Meta-regression complete', 'success');

    } catch (err) {
      console.error('Meta-regression failed:', err);
      this._showToast('Meta-regression failed: ' + err.message, 'error');
    }
  }

  async _runSubgroupAnalysis() {
    if (!this._result || !this._selectedSubgroupVar) {
      this._showToast('Run main analysis first and select a grouping variable', 'warning');
      return;
    }

    try {
      const yi = this._result.yi;
      const vi = this._result.vi;

      // Extract group assignments
      const groups = this._studies.map(s => {
        return s[this._selectedSubgroupVar] || s.covariates?.[this._selectedSubgroupVar] || 'Unknown';
      });

      this._subgroupResult = subgroupAnalysis(yi, vi, groups, {
        method: this._settings.method,
        hksj: this._settings.hksj
      });

      this._subgroupResult.variable = this._selectedSubgroupVar;

      this.render();
      this._showToast('Subgroup analysis complete', 'success');

    } catch (err) {
      console.error('Subgroup analysis failed:', err);
      this._showToast('Subgroup analysis failed: ' + err.message, 'error');
    }
  }

  async _runSensitivityAnalysis() {
    if (!this._result) {
      this._showToast('Run main analysis first', 'warning');
      return;
    }

    try {
      const yi = this._result.yi;
      const vi = this._result.vi;
      const labels = this._studies.map(s => s.nctId);

      this._leaveOneOutResult = leaveOneOut(yi, vi, labels, {
        method: this._settings.method
      });

      this._cumulativeResult = cumulativeMA(yi, vi, labels, {
        method: this._settings.method,
        orderBy: 'chronological'
      });

      this.render();
      this._showToast('Sensitivity analysis complete', 'success');

    } catch (err) {
      console.error('Sensitivity analysis failed:', err);
      this._showToast('Sensitivity analysis failed: ' + err.message, 'error');
    }
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) {
      toast.show(message, type);
    }
  }

  _formatCI(ci) {
    if (!ci) return 'N/A';
    return `[${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]`;
  }

  _transformEffect(value) {
    // Transform from log scale if needed
    if (this._settings.outcomeType === 'binary' && ['rr', 'or'].includes(this._settings.effectMeasure)) {
      return Math.exp(value);
    }
    if (this._settings.outcomeType === 'time-to-event') {
      return Math.exp(value);
    }
    return value;
  }

  _getEffectLabel() {
    const labels = {
      rr: 'Risk Ratio',
      or: 'Odds Ratio',
      rd: 'Risk Difference',
      smd: 'SMD (Hedges\' g)',
      md: 'Mean Difference',
      hr: 'Hazard Ratio'
    };
    return labels[this._settings.effectMeasure] || 'Effect';
  }

  _getNullValue() {
    if (this._settings.effectMeasure === 'rd' || this._settings.effectMeasure === 'smd' || this._settings.effectMeasure === 'md') {
      return 0;
    }
    return 1;
  }

  _renderTabs() {
    const tabs = [
      { id: 'main', label: 'Main Results' },
      { id: 'forest', label: 'Forest Plot' },
      { id: 'funnel', label: 'Funnel Plot' },
      { id: 'metareg', label: 'Meta-Regression' },
      { id: 'subgroup', label: 'Subgroup Analysis' },
      { id: 'sensitivity', label: 'Sensitivity' },
      { id: 'advancedbias', label: 'Advanced Bias' },
      { id: 'bayesian', label: 'Bayesian' },
      { id: 'advanced', label: 'Advanced Models' }
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

  _renderMainResults() {
    const r = this._result;
    if (!r) return '<p class="text-muted">Run analysis to see results</p>';

    const effect = this._transformEffect(r.estimate);
    const ciLower = this._transformEffect(r.ci[0]);
    const ciUpper = this._transformEffect(r.ci[1]);

    return `
      <div class="results-section">
        <h3 class="section-title">Pooled Effect</h3>

        <div class="result-card primary">
          <div class="result-label">${this._getEffectLabel()}</div>
          <div class="result-value">${effect.toFixed(3)}</div>
          <div class="result-ci">95% CI: ${this._formatCI([ciLower, ciUpper])}</div>
          <div class="result-p">p = ${formatPValue(r.p)}</div>
          <div class="result-hint">Method: ${r.method}${this._settings.hksj ? ' with HKSJ adjustment' : ''}</div>
        </div>

        ${r.ciHKSJ ? `
          <div class="result-card">
            <div class="result-label">HKSJ-adjusted CI</div>
            <div class="result-ci">${this._formatCI([
              this._transformEffect(r.ciHKSJ[0]),
              this._transformEffect(r.ciHKSJ[1])
            ])}</div>
            <div class="result-p">p = ${formatPValue(r.pHKSJ)}</div>
          </div>
        ` : ''}

        <h3 class="section-title">Heterogeneity</h3>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">I²</div>
            <div class="stat-value ${r.I2 >= 75 ? 'text-danger' : r.I2 >= 50 ? 'text-warning' : ''}">${r.I2.toFixed(1)}%</div>
            <div class="stat-hint">${r.I2 < 25 ? 'Low' : r.I2 < 50 ? 'Moderate' : r.I2 < 75 ? 'Substantial' : 'Considerable'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">τ²</div>
            <div class="stat-value">${r.tau2?.toFixed(4) || '0'}</div>
            <div class="stat-hint">Between-study variance</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Q</div>
            <div class="stat-value">${r.Q.toFixed(2)}</div>
            <div class="stat-hint">df=${r.df}, p=${formatPValue(r.pQ)}</div>
          </div>
        </div>

        ${r.predictionInterval ? `
          <div class="result-card">
            <div class="result-label">95% Prediction Interval</div>
            <div class="result-ci">${this._formatCI([
              this._transformEffect(r.predictionInterval.lower),
              this._transformEffect(r.predictionInterval.upper)
            ])}</div>
            <div class="result-hint">Expected range of effects in future studies (accounts for τ²)</div>
          </div>
        ` : ''}

        <h3 class="section-title">Publication Bias</h3>

        <div class="stats-grid">
          <div class="stat-card ${r.egger?.p < 0.1 ? 'warning-card' : ''}">
            <div class="stat-label">Egger's Test</div>
            <div class="stat-value">p = ${formatPValue(r.egger?.p)}</div>
            <div class="stat-hint">Intercept: ${r.egger?.intercept?.toFixed(3) || 'N/A'}</div>
            ${r.egger?.p < 0.1 ? '<div class="stat-warning">⚠ Suggests asymmetry</div>' : ''}
          </div>
          ${r.begg ? `
            <div class="stat-card ${r.begg?.p < 0.1 ? 'warning-card' : ''}">
              <div class="stat-label">Begg's Test</div>
              <div class="stat-value">p = ${formatPValue(r.begg?.p)}</div>
              <div class="stat-hint">τ = ${r.begg?.tau?.toFixed(3) || 'N/A'}</div>
            </div>
          ` : ''}
          ${r.peters ? `
            <div class="stat-card ${r.peters?.p < 0.1 ? 'warning-card' : ''}">
              <div class="stat-label">Peters' Test</div>
              <div class="stat-value">p = ${formatPValue(r.peters?.p)}</div>
              <div class="stat-hint">Better for binary outcomes</div>
            </div>
          ` : ''}
        </div>

        <div class="result-card">
          <div class="result-label">Trim & Fill</div>
          <div class="result-value">${r.trimFill?.k0 || 0} studies imputed</div>
          ${r.trimFill?.k0 > 0 ? `
            <div class="result-ci">Adjusted estimate: ${this._transformEffect(r.trimFill.adjustedEstimate).toFixed(3)}</div>
            <div class="result-hint">Side: ${r.trimFill.side}</div>
          ` : '<div class="result-hint">No significant asymmetry detected</div>'}
        </div>

        <h3 class="section-title">Sensitivity to Unmeasured Confounding</h3>

        <div class="result-card">
          <div class="result-label">E-value</div>
          <div class="result-value">${r.eValue?.eValue?.toFixed(2) || 'N/A'}</div>
          <div class="result-ci">For CI bound: ${r.eValue?.eValueCI?.toFixed(2) || 'N/A'}</div>
          <div class="result-hint">${r.eValue?.interpretation || 'Minimum confounding strength to explain away the effect'}</div>
        </div>
      </div>
    `;
  }

  _renderForestPlot() {
    if (!this._result || !this._studies.length) return '<p class="text-muted">Run analysis to see forest plot</p>';

    const r = this._result;
    const yi = r.yi;
    const vi = r.vi;
    const studies = this._studies;

    // Calculate display range
    const effects = yi.map((y, i) => {
      const se = Math.sqrt(vi[i]);
      return {
        effect: this._transformEffect(y),
        lower: this._transformEffect(y - 1.96 * se),
        upper: this._transformEffect(y + 1.96 * se),
        weight: 1 / vi[i]
      };
    });

    const pooledEffect = this._transformEffect(r.estimate);
    const pooledLower = this._transformEffect(r.ci[0]);
    const pooledUpper = this._transformEffect(r.ci[1]);

    const allValues = [...effects.map(e => e.lower), ...effects.map(e => e.upper), pooledLower, pooledUpper];
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal;
    const plotMin = minVal - range * 0.15;
    const plotMax = maxVal + range * 0.15;
    const plotRange = plotMax - plotMin;

    const nullValue = this._getNullValue();
    const nullPos = ((nullValue - plotMin) / plotRange) * 100;
    const toPercent = (val) => Math.max(0, Math.min(100, ((val - plotMin) / plotRange) * 100));

    const totalWeight = effects.reduce((sum, e) => sum + e.weight, 0);

    return `
      <div class="forest-plot">
        <div class="forest-container">
          <div class="forest-header">
            <div class="forest-col study-col">Study</div>
            <div class="forest-col plot-col">
              <div class="plot-axis">
                <span class="axis-label">${plotMin.toFixed(2)}</span>
                <span class="axis-label null-label">${nullValue}</span>
                <span class="axis-label">${plotMax.toFixed(2)}</span>
              </div>
            </div>
            <div class="forest-col effect-col">${this._getEffectLabel()} [95% CI]</div>
            <div class="forest-col weight-col">Weight</div>
          </div>

          ${studies.map((study, i) => {
            const e = effects[i];
            const weight = (e.weight / totalWeight * 100).toFixed(1);
            const boxSize = Math.max(6, Math.min(20, Math.sqrt(e.weight / totalWeight * 100) * 5));

            return `
              <div class="forest-row">
                <div class="forest-col study-col">
                  <span class="study-id">${study.nctId}</span>
                </div>
                <div class="forest-col plot-col">
                  <div class="plot-area">
                    <div class="null-line" style="left: ${nullPos}%"></div>
                    <div class="ci-line" style="left: ${toPercent(e.lower)}%; width: ${Math.max(1, toPercent(e.upper) - toPercent(e.lower))}%"></div>
                    <div class="effect-point" style="left: ${toPercent(e.effect)}%; width: ${boxSize}px; height: ${boxSize}px;"></div>
                  </div>
                </div>
                <div class="forest-col effect-col">
                  ${e.effect.toFixed(2)} [${e.lower.toFixed(2)}, ${e.upper.toFixed(2)}]
                </div>
                <div class="forest-col weight-col">${weight}%</div>
              </div>
            `;
          }).join('')}

          <div class="forest-row pooled">
            <div class="forest-col study-col">
              <strong>Pooled (${r.method})</strong>
            </div>
            <div class="forest-col plot-col">
              <div class="plot-area">
                <div class="null-line" style="left: ${nullPos}%"></div>
                <svg class="diamond-svg" viewBox="0 0 100 20" preserveAspectRatio="none" style="left: ${toPercent(pooledLower)}%; width: ${Math.max(1, toPercent(pooledUpper) - toPercent(pooledLower))}%;">
                  <polygon points="0,10 50,0 100,10 50,20" fill="var(--color-primary-600, #2563eb)"/>
                </svg>
              </div>
            </div>
            <div class="forest-col effect-col">
              <strong>${pooledEffect.toFixed(2)} [${pooledLower.toFixed(2)}, ${pooledUpper.toFixed(2)}]</strong>
            </div>
            <div class="forest-col weight-col">100%</div>
          </div>
        </div>

        <div class="forest-legend">
          <span>Favors Treatment</span>
          <span class="legend-separator">|</span>
          <span>Favors Control</span>
        </div>

        <div class="heterogeneity-summary">
          Heterogeneity: I² = ${r.I2.toFixed(1)}%, τ² = ${r.tau2?.toFixed(4) || '0'}, p = ${formatPValue(r.pQ)}
        </div>
      </div>
    `;
  }

  _renderFunnelPlot() {
    if (!this._result || !this._studies.length) return '<p class="text-muted">Run analysis to see funnel plot</p>';

    const r = this._result;
    const yi = r.yi;
    const vi = r.vi;
    const se = vi.map(v => Math.sqrt(v));

    // Transform effects if needed
    const effects = yi.map(y => this._transformEffect(y));
    const pooledEffect = this._transformEffect(r.estimate);

    // Calculate plot bounds
    const maxSE = Math.max(...se);
    const minEffect = Math.min(...effects, pooledEffect);
    const maxEffect = Math.max(...effects, pooledEffect);
    const effectRange = maxEffect - minEffect;
    const plotMinX = minEffect - effectRange * 0.2;
    const plotMaxX = maxEffect + effectRange * 0.2;
    const xRange = plotMaxX - plotMinX;

    // SVG dimensions
    const width = 500;
    const height = 400;
    const padding = { top: 20, right: 40, bottom: 50, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const toX = (effect) => padding.left + ((effect - plotMinX) / xRange) * plotWidth;
    const toY = (seVal) => padding.top + (seVal / maxSE) * plotHeight;

    // Create points
    const points = effects.map((e, i) => ({
      x: toX(e),
      y: toY(se[i]),
      effect: e,
      se: se[i],
      study: this._studies[i].nctId
    }));

    // 95% CI funnel lines
    const funnelPoints = [];
    for (let s = 0; s <= maxSE; s += maxSE / 20) {
      const ciWidth = 1.96 * s;
      funnelPoints.push({
        se: s,
        lower: pooledEffect - ciWidth,
        upper: pooledEffect + ciWidth
      });
    }

    return `
      <div class="funnel-plot">
        <svg viewBox="0 0 ${width} ${height}" class="funnel-svg">
          <!-- Funnel region -->
          <polygon
            points="${funnelPoints.map(p => `${toX(p.lower)},${toY(p.se)}`).join(' ')} ${funnelPoints.slice().reverse().map(p => `${toX(p.upper)},${toY(p.se)}`).join(' ')}"
            fill="var(--color-gray-100, #f3f4f6)"
            stroke="var(--color-gray-300, #d1d5db)"
            stroke-width="1"
          />

          <!-- Axes -->
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"
                stroke="var(--color-gray-400, #9ca3af)" stroke-width="1"/>
          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"
                stroke="var(--color-gray-400, #9ca3af)" stroke-width="1"/>

          <!-- Pooled effect line -->
          <line x1="${toX(pooledEffect)}" y1="${padding.top}" x2="${toX(pooledEffect)}" y2="${height - padding.bottom}"
                stroke="var(--color-primary-600, #2563eb)" stroke-width="1" stroke-dasharray="4"/>

          <!-- Null effect line -->
          <line x1="${toX(this._getNullValue())}" y1="${padding.top}" x2="${toX(this._getNullValue())}" y2="${height - padding.bottom}"
                stroke="var(--color-gray-400, #9ca3af)" stroke-width="1"/>

          <!-- Study points -->
          ${points.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="5"
                    fill="var(--color-primary-500, #3b82f6)"
                    stroke="white" stroke-width="1">
              <title>${p.study}: ${p.effect.toFixed(3)} (SE: ${p.se.toFixed(3)})</title>
            </circle>
          `).join('')}

          <!-- X axis labels -->
          <text x="${padding.left}" y="${height - 10}" text-anchor="start" class="axis-text">${plotMinX.toFixed(2)}</text>
          <text x="${width - padding.right}" y="${height - 10}" text-anchor="end" class="axis-text">${plotMaxX.toFixed(2)}</text>
          <text x="${width / 2}" y="${height - 10}" text-anchor="middle" class="axis-text">${this._getEffectLabel()}</text>

          <!-- Y axis labels -->
          <text x="${padding.left - 10}" y="${padding.top + 5}" text-anchor="end" class="axis-text">0</text>
          <text x="${padding.left - 10}" y="${height - padding.bottom}" text-anchor="end" class="axis-text">${maxSE.toFixed(2)}</text>
          <text x="15" y="${height / 2}" text-anchor="middle" transform="rotate(-90, 15, ${height / 2})" class="axis-text">Standard Error</text>
        </svg>

        <div class="funnel-stats">
          <div class="stat-row">
            <span class="stat-name">Egger's test:</span>
            <span class="stat-val">intercept = ${r.egger?.intercept?.toFixed(3) || 'N/A'}, p = ${formatPValue(r.egger?.p)}</span>
          </div>
          ${r.begg ? `
            <div class="stat-row">
              <span class="stat-name">Begg's test:</span>
              <span class="stat-val">τ = ${r.begg?.tau?.toFixed(3) || 'N/A'}, p = ${formatPValue(r.begg?.p)}</span>
            </div>
          ` : ''}
          <div class="stat-row">
            <span class="stat-name">Trim & Fill:</span>
            <span class="stat-val">${r.trimFill?.k0 || 0} imputed studies</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderMetaRegression() {
    if (!this._result) return '<p class="text-muted">Run main analysis first</p>';

    return `
      <div class="analysis-panel">
        <h3 class="section-title">Meta-Regression</h3>
        <p class="section-desc">Explore sources of heterogeneity by testing moderator effects</p>

        <div class="control-row">
          <div class="form-group">
            <label class="form-label">Covariate</label>
            <select class="form-select" id="covariate-select">
              <option value="">Select a covariate...</option>
              ${this._covariates.map(c => `
                <option value="${c.name}" ${this._selectedCovariate === c.name ? 'selected' : ''}>
                  ${c.label}
                </option>
              `).join('')}
            </select>
          </div>
          <button class="btn btn-secondary" id="run-metareg-btn">
            Run Meta-Regression
          </button>
        </div>

        ${this._metaRegResult ? this._renderMetaRegResults() : ''}
      </div>
    `;
  }

  _renderMetaRegResults() {
    const r = this._metaRegResult;
    const covarLabel = this._covariates.find(c => c.name === r.covariate)?.label || r.covariate;

    return `
      <div class="metareg-results">
        <h4>Results for: ${covarLabel}</h4>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Slope (β₁)</div>
            <div class="stat-value">${r.beta[1].toFixed(4)}</div>
            <div class="stat-hint">SE: ${r.se[1].toFixed(4)}</div>
          </div>
          <div class="stat-card ${r.pValues[1] < 0.05 ? 'success-card' : ''}">
            <div class="stat-label">p-value</div>
            <div class="stat-value">${formatPValue(r.pValues[1])}</div>
            <div class="stat-hint">${r.pValues[1] < 0.05 ? 'Significant moderator' : 'Not significant'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Residual τ²</div>
            <div class="stat-value">${r.tau2.toFixed(4)}</div>
            <div class="stat-hint">Unexplained heterogeneity</div>
          </div>
        </div>

        <div class="result-card">
          <div class="result-label">Interpretation</div>
          <div class="result-hint">
            ${r.pValues[1] < 0.05
              ? `For each unit increase in ${covarLabel}, the effect changes by ${r.beta[1].toFixed(4)} (${r.beta[1] > 0 ? 'increases' : 'decreases'}).`
              : `${covarLabel} does not significantly explain heterogeneity in this meta-analysis.`
            }
          </div>
        </div>

        <!-- Bubble plot placeholder -->
        <div class="bubble-plot">
          <svg viewBox="0 0 400 300" class="bubble-svg">
            ${this._renderBubblePlot(r)}
          </svg>
        </div>
      </div>
    `;
  }

  _renderBubblePlot(r) {
    if (!r.xValues || !r.yValues) return '';

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = 400;
    const height = 300;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const xMin = Math.min(...r.xValues);
    const xMax = Math.max(...r.xValues);
    const xRange = xMax - xMin || 1;

    const yEffects = r.yValues.map(y => this._transformEffect(y));
    const yMin = Math.min(...yEffects);
    const yMax = Math.max(...yEffects);
    const yRange = yMax - yMin || 1;

    const toX = (x) => padding.left + ((x - xMin) / xRange) * plotWidth;
    const toY = (y) => padding.top + plotHeight - ((y - yMin) / yRange) * plotHeight;

    // Regression line
    const x1 = xMin;
    const x2 = xMax;
    const y1 = this._transformEffect(r.beta[0] + r.beta[1] * x1);
    const y2 = this._transformEffect(r.beta[0] + r.beta[1] * x2);

    return `
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#9ca3af"/>
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#9ca3af"/>

      <!-- Regression line -->
      <line x1="${toX(x1)}" y1="${toY(y1)}" x2="${toX(x2)}" y2="${toY(y2)}"
            stroke="var(--color-primary-600)" stroke-width="2"/>

      <!-- Points -->
      ${r.xValues.map((x, i) => `
        <circle cx="${toX(x)}" cy="${toY(yEffects[i])}" r="6"
                fill="var(--color-primary-400)" stroke="white" stroke-width="1" opacity="0.7"/>
      `).join('')}

      <!-- Labels -->
      <text x="${width / 2}" y="${height - 5}" text-anchor="middle" font-size="12">${r.covariate}</text>
      <text x="10" y="${height / 2}" text-anchor="middle" font-size="12" transform="rotate(-90, 10, ${height / 2})">${this._getEffectLabel()}</text>
    `;
  }

  _renderSubgroupAnalysis() {
    if (!this._result) return '<p class="text-muted">Run main analysis first</p>';

    return `
      <div class="analysis-panel">
        <h3 class="section-title">Subgroup Analysis</h3>
        <p class="section-desc">Compare effects across categorical subgroups</p>

        <div class="control-row">
          <div class="form-group">
            <label class="form-label">Grouping Variable</label>
            <select class="form-select" id="subgroup-select">
              <option value="">Select a variable...</option>
              ${this._subgroupVars.map(v => `
                <option value="${v.name}" ${this._selectedSubgroupVar === v.name ? 'selected' : ''}>
                  ${v.label} (${v.levels.length} groups)
                </option>
              `).join('')}
            </select>
          </div>
          <button class="btn btn-secondary" id="run-subgroup-btn">
            Run Subgroup Analysis
          </button>
        </div>

        ${this._subgroupResult ? this._renderSubgroupResults() : ''}
      </div>
    `;
  }

  _renderSubgroupResults() {
    const r = this._subgroupResult;
    const varLabel = this._subgroupVars.find(v => v.name === r.variable)?.label || r.variable;

    return `
      <div class="subgroup-results">
        <h4>Results by: ${varLabel}</h4>

        <div class="subgroup-table">
          <div class="table-header">
            <div class="cell">Subgroup</div>
            <div class="cell">N</div>
            <div class="cell">${this._getEffectLabel()}</div>
            <div class="cell">95% CI</div>
            <div class="cell">I²</div>
          </div>
          ${Object.entries(r.subgroups).map(([group, data]) => `
            <div class="table-row">
              <div class="cell">${group}</div>
              <div class="cell">${data.k}</div>
              <div class="cell">${this._transformEffect(data.estimate).toFixed(3)}</div>
              <div class="cell">${this._formatCI([this._transformEffect(data.ci[0]), this._transformEffect(data.ci[1])])}</div>
              <div class="cell">${data.I2.toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>

        <div class="stats-grid" style="margin-top: 1rem;">
          <div class="stat-card ${r.Qbetween?.p < 0.05 ? 'success-card' : ''}">
            <div class="stat-label">Q-between</div>
            <div class="stat-value">${r.Qbetween?.Q?.toFixed(2) || 'N/A'}</div>
            <div class="stat-hint">p = ${formatPValue(r.Qbetween?.p)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">df</div>
            <div class="stat-value">${r.Qbetween?.df || 'N/A'}</div>
          </div>
        </div>

        <div class="result-card">
          <div class="result-label">Interpretation</div>
          <div class="result-hint">
            ${r.Qbetween?.p < 0.05
              ? `Significant difference between subgroups (Q = ${r.Qbetween.Q.toFixed(2)}, p = ${formatPValue(r.Qbetween.p)}). The effect varies by ${varLabel}.`
              : `No significant difference between subgroups. ${varLabel} does not appear to moderate the effect.`
            }
          </div>
        </div>
      </div>
    `;
  }

  _renderSensitivityAnalysis() {
    if (!this._result) return '<p class="text-muted">Run main analysis first</p>';

    return `
      <div class="analysis-panel">
        <h3 class="section-title">Sensitivity Analysis</h3>
        <p class="section-desc">Assess robustness of the pooled estimate</p>

        <button class="btn btn-secondary" id="run-sensitivity-btn">
          Run Sensitivity Analysis
        </button>

        ${this._leaveOneOutResult ? this._renderLeaveOneOut() : ''}
        ${this._cumulativeResult ? this._renderCumulative() : ''}
      </div>
    `;
  }

  _renderLeaveOneOut() {
    const r = this._leaveOneOutResult;
    const pooledEffect = this._transformEffect(this._result.estimate);

    return `
      <div class="sensitivity-results">
        <h4>Leave-One-Out Analysis</h4>
        <p class="section-desc">Effect of removing each study on the pooled estimate</p>

        <div class="loo-table">
          <div class="table-header">
            <div class="cell">Study Omitted</div>
            <div class="cell">${this._getEffectLabel()}</div>
            <div class="cell">95% CI</div>
            <div class="cell">Change</div>
          </div>
          ${r.results.map(row => {
            const effect = this._transformEffect(row.estimate);
            const change = ((effect - pooledEffect) / pooledEffect * 100);
            return `
              <div class="table-row ${Math.abs(change) > 10 ? 'highlight' : ''}">
                <div class="cell">${row.omitted}</div>
                <div class="cell">${effect.toFixed(3)}</div>
                <div class="cell">${this._formatCI([this._transformEffect(row.ci[0]), this._transformEffect(row.ci[1])])}</div>
                <div class="cell ${change > 0 ? 'text-success' : 'text-danger'}">${change > 0 ? '+' : ''}${change.toFixed(1)}%</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="result-card">
          <div class="result-label">Conclusion</div>
          <div class="result-hint">
            ${r.influential.length > 0
              ? `Studies with substantial influence (>10% change): ${r.influential.join(', ')}`
              : 'No single study has undue influence on the pooled estimate (all changes <10%).'}
          </div>
        </div>
      </div>
    `;
  }

  _renderCumulative() {
    const r = this._cumulativeResult;

    return `
      <div class="sensitivity-results" style="margin-top: 2rem;">
        <h4>Cumulative Meta-Analysis</h4>
        <p class="section-desc">Evolution of the pooled estimate as studies are added</p>

        <div class="cumulative-table">
          <div class="table-header">
            <div class="cell">Studies Added</div>
            <div class="cell">${this._getEffectLabel()}</div>
            <div class="cell">95% CI</div>
          </div>
          ${r.results.map(row => `
            <div class="table-row">
              <div class="cell">${row.addedStudy}</div>
              <div class="cell">${this._transformEffect(row.estimate).toFixed(3)}</div>
              <div class="cell">${this._formatCI([this._transformEffect(row.ci[0]), this._transformEffect(row.ci[1])])}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderTabContent() {
    switch (this._activeTab) {
      case 'main':
        return this._renderMainResults();
      case 'forest':
        return this._renderForestPlot();
      case 'funnel':
        return this._renderFunnelPlot();
      case 'metareg':
        return this._renderMetaRegression();
      case 'subgroup':
        return this._renderSubgroupAnalysis();
      case 'sensitivity':
        return this._renderSensitivityAnalysis();
      case 'advancedbias':
        return this._renderAdvancedBias();
      case 'bayesian':
        return this._renderBayesian();
      case 'advanced':
        return this._renderAdvancedModels();
      default:
        return '';
    }
  }

  // ============================================
  // ADVANCED BIAS METHODS TAB
  // ============================================

  _renderAdvancedBias() {
    if (!this._result) return '<p class="text-muted">Run main analysis first</p>';

    return `
      <div class="analysis-panel">
        <h3 class="section-title">Advanced Publication Bias Methods</h3>
        <p class="section-desc">Sophisticated methods for detecting and correcting publication bias</p>

        <div class="advanced-sections">
          <!-- Selection Models Section -->
          <div class="advanced-section">
            <h4>Selection Models</h4>
            <p class="section-desc">Models that account for selective publication based on statistical significance</p>
            <div class="btn-group">
              <button class="btn btn-secondary" id="run-copas-btn">Copas Selection Model</button>
              <button class="btn btn-secondary" id="run-3psm-btn">3-Parameter Selection Model</button>
              <button class="btn btn-secondary" id="run-vevea-btn">Vevea-Hedges Weight Function</button>
            </div>
            ${this._selectionModelResult ? this._renderSelectionModelResults() : ''}
          </div>

          <!-- PET-PEESE Section -->
          <div class="advanced-section">
            <h4>PET-PEESE</h4>
            <p class="section-desc">Precision Effect Test and Precision Effect Estimate with Standard Error</p>
            <button class="btn btn-secondary" id="run-petpeese-btn">Run PET-PEESE</button>
            ${this._petPeeseResult ? this._renderPetPeeseResults() : ''}
          </div>

          <!-- P-Curve Section -->
          <div class="advanced-section">
            <h4>P-Curve Analysis</h4>
            <p class="section-desc">Evaluates evidential value by examining the distribution of significant p-values</p>
            <button class="btn btn-secondary" id="run-pcurve-btn">Run P-Curve</button>
            ${this._pCurveResult ? this._renderPCurveResults() : ''}
          </div>

          <!-- P-Uniform Section -->
          <div class="advanced-section">
            <h4>P-Uniform</h4>
            <p class="section-desc">Effect size estimation accounting for publication bias using p-value distribution</p>
            <button class="btn btn-secondary" id="run-puniform-btn">Run P-Uniform</button>
            ${this._pUniformResult ? this._renderPUniformResults() : ''}
          </div>
        </div>
      </div>
    `;
  }

  _renderSelectionModelResults() {
    const r = this._selectionModelResult;
    return `
      <div class="result-block">
        <h5>Selection Model: ${r.method}</h5>
        <div class="stats-grid">
          <div class="stat-card ${r.adjustedEstimate !== null ? 'primary' : ''}">
            <div class="stat-label">Adjusted Effect</div>
            <div class="stat-value">${r.adjustedEstimate !== null ? this._transformEffect(r.adjustedEstimate).toFixed(3) : 'N/A'}</div>
            ${r.adjustedCI ? `<div class="stat-hint">95% CI: ${this._formatCI([this._transformEffect(r.adjustedCI[0]), this._transformEffect(r.adjustedCI[1])])}</div>` : ''}
          </div>
          <div class="stat-card">
            <div class="stat-label">Original Effect</div>
            <div class="stat-value">${this._transformEffect(this._result.estimate).toFixed(3)}</div>
          </div>
          ${r.tau2Adjusted !== undefined ? `
            <div class="stat-card">
              <div class="stat-label">Adjusted τ²</div>
              <div class="stat-value">${r.tau2Adjusted.toFixed(4)}</div>
            </div>
          ` : ''}
          ${r.selectionParameter !== undefined ? `
            <div class="stat-card">
              <div class="stat-label">Selection Parameter</div>
              <div class="stat-value">${r.selectionParameter.toFixed(3)}</div>
              <div class="stat-hint">${r.selectionParameter > 0.5 ? 'Strong selection' : 'Moderate selection'}</div>
            </div>
          ` : ''}
        </div>
        ${r.likelihoodRatioTest ? `
          <div class="result-card">
            <div class="result-label">Likelihood Ratio Test for Selection</div>
            <div class="result-value">χ² = ${r.likelihoodRatioTest.statistic?.toFixed(2) || 'N/A'}</div>
            <div class="result-p">p = ${formatPValue(r.likelihoodRatioTest.p)}</div>
            <div class="result-hint">${r.likelihoodRatioTest.p < 0.05 ? 'Evidence of publication selection' : 'No strong evidence of selection'}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderPetPeeseResults() {
    const r = this._petPeeseResult;
    return `
      <div class="result-block">
        <h5>PET-PEESE Results</h5>
        <div class="stats-grid">
          <div class="stat-card primary">
            <div class="stat-label">Recommended Estimate</div>
            <div class="stat-value">${this._transformEffect(r.recommendedEstimate).toFixed(3)}</div>
            <div class="stat-hint">Using ${r.recommendedMethod}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">PET Estimate</div>
            <div class="stat-value">${this._transformEffect(r.pet.estimate).toFixed(3)}</div>
            <div class="stat-hint">95% CI: ${this._formatCI([this._transformEffect(r.pet.ci[0]), this._transformEffect(r.pet.ci[1])])}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">PEESE Estimate</div>
            <div class="stat-value">${this._transformEffect(r.peese.estimate).toFixed(3)}</div>
            <div class="stat-hint">95% CI: ${this._formatCI([this._transformEffect(r.peese.ci[0]), this._transformEffect(r.peese.ci[1])])}</div>
          </div>
        </div>
        <div class="result-card">
          <div class="result-label">PET Intercept Test</div>
          <div class="result-value">β₀ = ${r.pet.intercept?.toFixed(3) || 'N/A'}</div>
          <div class="result-p">p = ${formatPValue(r.pet.pIntercept)}</div>
          <div class="result-hint">${r.pet.pIntercept < 0.05 ? 'Significant: Use PEESE estimate' : 'Not significant: Use PET estimate'}</div>
        </div>
      </div>
    `;
  }

  _renderPCurveResults() {
    const r = this._pCurveResult;
    return `
      <div class="result-block">
        <h5>P-Curve Analysis</h5>
        <div class="stats-grid">
          <div class="stat-card ${r.evidentialValue ? 'success-card' : 'warning-card'}">
            <div class="stat-label">Evidential Value</div>
            <div class="stat-value">${r.evidentialValue ? 'YES' : 'NO'}</div>
            <div class="stat-hint">${r.evidentialValue ? 'Results contain genuine effects' : 'May lack evidential value'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Studies Included</div>
            <div class="stat-value">${r.nSig}</div>
            <div class="stat-hint">Significant results (p < .05)</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Power Estimate</div>
            <div class="stat-value">${(r.powerEstimate * 100).toFixed(0)}%</div>
            <div class="stat-hint">Estimated statistical power</div>
          </div>
        </div>

        <div class="result-card">
          <div class="result-label">Right-Skewness Test (Evidential Value)</div>
          <div class="result-value">z = ${r.zFull?.toFixed(2) || 'N/A'}</div>
          <div class="result-p">p = ${formatPValue(r.pFull)}</div>
          <div class="result-hint">${r.pFull < 0.05 ? 'P-curve is right-skewed: genuine effects present' : 'P-curve is not significantly right-skewed'}</div>
        </div>

        <div class="result-card">
          <div class="result-label">Flatness Test (No Effect)</div>
          <div class="result-value">z = ${r.zFlat?.toFixed(2) || 'N/A'}</div>
          <div class="result-p">p = ${formatPValue(r.pFlat)}</div>
          <div class="result-hint">${r.pFlat < 0.05 ? 'Can rule out flat p-curve (selective reporting)' : 'Cannot rule out flat p-curve'}</div>
        </div>

        ${r.pValues ? `
          <div class="pcurve-histogram">
            <div class="result-label">P-Value Distribution</div>
            <div class="histogram-bars">
              ${[0.01, 0.02, 0.03, 0.04, 0.05].map((threshold, i) => {
                const prevThreshold = i === 0 ? 0 : [0.01, 0.02, 0.03, 0.04][i-1];
                const count = r.pValues.filter(p => p > prevThreshold && p <= threshold).length;
                const maxCount = Math.max(...[0.01, 0.02, 0.03, 0.04, 0.05].map((t, j) => {
                  const pt = j === 0 ? 0 : [0.01, 0.02, 0.03, 0.04][j-1];
                  return r.pValues.filter(p => p > pt && p <= t).length;
                }));
                const height = maxCount > 0 ? (count / maxCount * 100) : 0;
                return `
                  <div class="histogram-bar" style="height: ${height}%;" title="${count} studies">
                    <span class="bar-label">${count}</span>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="histogram-labels">
              <span>.01</span><span>.02</span><span>.03</span><span>.04</span><span>.05</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderPUniformResults() {
    const r = this._pUniformResult;
    return `
      <div class="result-block">
        <h5>P-Uniform Results</h5>
        <div class="stats-grid">
          <div class="stat-card primary">
            <div class="stat-label">Bias-Corrected Effect</div>
            <div class="stat-value">${this._transformEffect(r.estimate).toFixed(3)}</div>
            <div class="stat-hint">95% CI: ${this._formatCI([this._transformEffect(r.ci[0]), this._transformEffect(r.ci[1])])}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Original Effect</div>
            <div class="stat-value">${this._transformEffect(this._result.estimate).toFixed(3)}</div>
            <div class="stat-hint">Naive pooled estimate</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Studies Used</div>
            <div class="stat-value">${r.nSig}</div>
            <div class="stat-hint">Significant studies</div>
          </div>
        </div>
        <div class="result-card">
          <div class="result-label">Publication Bias Test</div>
          <div class="result-value">L = ${r.testStatistic?.toFixed(2) || 'N/A'}</div>
          <div class="result-p">p = ${formatPValue(r.pBias)}</div>
          <div class="result-hint">${r.pBias < 0.10 ? 'Evidence of publication bias' : 'No strong evidence of publication bias'}</div>
        </div>
      </div>
    `;
  }

  // ============================================
  // BAYESIAN ANALYSIS TAB
  // ============================================

  _renderBayesian() {
    if (!this._result) return '<p class="text-muted">Run main analysis first</p>';

    return `
      <div class="analysis-panel">
        <h3 class="section-title">Bayesian Meta-Analysis</h3>
        <p class="section-desc">MCMC-based Bayesian estimation with full posterior inference</p>

        <div class="bayesian-settings">
          <div class="settings-row">
            <div class="form-group">
              <label class="form-label">MCMC Iterations</label>
              <select class="form-select" id="mcmc-iter-select">
                <option value="5000">5,000 (Fast)</option>
                <option value="10000" selected>10,000 (Standard)</option>
                <option value="20000">20,000 (Thorough)</option>
                <option value="50000">50,000 (Publication)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Burn-in</label>
              <select class="form-select" id="mcmc-burnin-select">
                <option value="1000">1,000</option>
                <option value="2000" selected>2,000</option>
                <option value="5000">5,000</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Prior for μ</label>
              <select class="form-select" id="prior-mu-select">
                <option value="weak" selected>Weakly Informative (N(0,10))</option>
                <option value="vague">Vague (N(0,100))</option>
                <option value="skeptical">Skeptical (N(0,1))</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Prior for τ</label>
              <select class="form-select" id="prior-tau-select">
                <option value="halfcauchy" selected>Half-Cauchy(0,0.5)</option>
                <option value="uniform">Uniform(0,2)</option>
                <option value="invgamma">Inverse-Gamma(1,0.5)</option>
              </select>
            </div>
            <button class="btn btn-primary" id="run-bayesian-btn">Run Bayesian Analysis</button>
          </div>
        </div>

        ${this._bayesianResult ? this._renderBayesianResults() : `
          <div class="result-card" style="margin-top: 1.5rem;">
            <div class="result-hint">Click "Run Bayesian Analysis" to perform MCMC sampling. This may take a few moments depending on the number of iterations.</div>
          </div>
        `}
      </div>
    `;
  }

  _renderBayesianResults() {
    const r = this._bayesianResult;
    return `
      <div class="bayesian-results">
        <h4>Posterior Summary</h4>

        <div class="stats-grid">
          <div class="stat-card primary">
            <div class="stat-label">Posterior Mean (μ)</div>
            <div class="stat-value">${this._transformEffect(r.muPosterior.mean).toFixed(3)}</div>
            <div class="stat-hint">Median: ${this._transformEffect(r.muPosterior.median).toFixed(3)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">95% HDI</div>
            <div class="stat-value">${this._formatCI([this._transformEffect(r.muPosterior.hdi[0]), this._transformEffect(r.muPosterior.hdi[1])])}</div>
            <div class="stat-hint">Highest Density Interval</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Posterior SD</div>
            <div class="stat-value">${r.muPosterior.sd.toFixed(4)}</div>
          </div>
        </div>

        <h4 style="margin-top: 1.5rem;">Heterogeneity (τ)</h4>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Posterior Mean (τ)</div>
            <div class="stat-value">${r.tauPosterior.mean.toFixed(4)}</div>
            <div class="stat-hint">Median: ${r.tauPosterior.median.toFixed(4)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">95% HDI for τ</div>
            <div class="stat-value">[${r.tauPosterior.hdi[0].toFixed(4)}, ${r.tauPosterior.hdi[1].toFixed(4)}]</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">P(τ > 0)</div>
            <div class="stat-value">${(r.tauPosterior.probPositive * 100).toFixed(1)}%</div>
            <div class="stat-hint">Probability of heterogeneity</div>
          </div>
        </div>

        <h4 style="margin-top: 1.5rem;">Bayesian Inference</h4>

        <div class="stats-grid">
          <div class="stat-card ${r.bayesFactor > 3 ? 'success-card' : r.bayesFactor < 0.33 ? 'warning-card' : ''}">
            <div class="stat-label">Bayes Factor (BF₁₀)</div>
            <div class="stat-value">${r.bayesFactor?.toFixed(2) || 'N/A'}</div>
            <div class="stat-hint">${r.bayesFactor > 10 ? 'Strong evidence for effect' : r.bayesFactor > 3 ? 'Moderate evidence' : r.bayesFactor > 1 ? 'Weak evidence' : 'Evidence against effect'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">P(μ > ${this._getNullValue()})</div>
            <div class="stat-value">${(r.muPosterior.probAboveNull * 100).toFixed(1)}%</div>
            <div class="stat-hint">Posterior probability of positive effect</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Effective Sample Size</div>
            <div class="stat-value">${r.diagnostics.effectiveSampleSize?.toFixed(0) || 'N/A'}</div>
            <div class="stat-hint">${r.diagnostics.effectiveSampleSize > 1000 ? 'Good' : 'May need more iterations'}</div>
          </div>
        </div>

        <div class="result-card">
          <div class="result-label">MCMC Diagnostics</div>
          <div class="result-hint">
            Iterations: ${r.diagnostics.iterations} | Burn-in: ${r.diagnostics.burnIn} |
            Acceptance Rate: ${(r.diagnostics.acceptanceRate * 100).toFixed(1)}% |
            ${r.diagnostics.converged ? '✓ Converged' : '⚠ May not have converged'}
          </div>
        </div>

        <div class="result-card">
          <div class="result-label">Comparison with Frequentist</div>
          <table class="comparison-table">
            <tr>
              <th></th>
              <th>Frequentist</th>
              <th>Bayesian</th>
            </tr>
            <tr>
              <td>Point Estimate</td>
              <td>${this._transformEffect(this._result.estimate).toFixed(3)}</td>
              <td>${this._transformEffect(r.muPosterior.mean).toFixed(3)}</td>
            </tr>
            <tr>
              <td>Interval</td>
              <td>${this._formatCI([this._transformEffect(this._result.ci[0]), this._transformEffect(this._result.ci[1])])}</td>
              <td>${this._formatCI([this._transformEffect(r.muPosterior.hdi[0]), this._transformEffect(r.muPosterior.hdi[1])])}</td>
            </tr>
            <tr>
              <td>τ²</td>
              <td>${this._result.tau2?.toFixed(4) || '0'}</td>
              <td>${(r.tauPosterior.mean ** 2).toFixed(4)}</td>
            </tr>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================
  // ADVANCED MODELS TAB
  // ============================================

  _renderAdvancedModels() {
    if (!this._result) return '<p class="text-muted">Run main analysis first</p>';

    return `
      <div class="analysis-panel">
        <h3 class="section-title">Advanced Statistical Models</h3>
        <p class="section-desc">Sophisticated methods for complex data structures</p>

        <div class="advanced-sections">
          <!-- RVE Section -->
          <div class="advanced-section">
            <h4>Robust Variance Estimation (RVE)</h4>
            <p class="section-desc">Handles dependent effect sizes within studies using cluster-robust standard errors</p>
            <button class="btn btn-secondary" id="run-rve-btn">Run RVE Analysis</button>
            ${this._rveResult ? this._renderRVEResults() : ''}
          </div>

          <!-- Three-Level Section -->
          <div class="advanced-section">
            <h4>Three-Level Meta-Analysis</h4>
            <p class="section-desc">Models both within-study and between-study heterogeneity for multiple outcomes</p>
            <button class="btn btn-secondary" id="run-threelevel-btn">Run 3-Level Model</button>
            ${this._threeLevelResult ? this._renderThreeLevelResults() : ''}
          </div>

          <!-- Permutation Test Section -->
          <div class="advanced-section">
            <h4>Permutation Test</h4>
            <p class="section-desc">Non-parametric inference without distributional assumptions</p>
            <div class="settings-row">
              <div class="form-group">
                <label class="form-label">Permutations</label>
                <select class="form-select" id="perm-n-select">
                  <option value="1000">1,000 (Fast)</option>
                  <option value="5000" selected>5,000 (Standard)</option>
                  <option value="10000">10,000 (Precise)</option>
                </select>
              </div>
              <button class="btn btn-secondary" id="run-permutation-btn">Run Permutation Test</button>
            </div>
            ${this._permutationResult ? this._renderPermutationResults() : ''}
          </div>

          <!-- Advanced Tau2 Estimators Section -->
          <div class="advanced-section">
            <h4>Heterogeneity Estimators Comparison</h4>
            <p class="section-desc">Compare τ² estimates across 10+ different methods</p>
            <button class="btn btn-secondary" id="run-tau2-comparison-btn">Compare All Estimators</button>
            ${this._advancedTau2 ? this._renderTau2Comparison() : ''}
          </div>
        </div>
      </div>
    `;
  }

  _renderRVEResults() {
    const r = this._rveResult;
    return `
      <div class="result-block">
        <h5>RVE Results (CR2 Correction)</h5>
        <div class="stats-grid">
          <div class="stat-card primary">
            <div class="stat-label">Robust Estimate</div>
            <div class="stat-value">${this._transformEffect(r.estimate).toFixed(3)}</div>
            <div class="stat-hint">95% CI: ${this._formatCI([this._transformEffect(r.ci[0]), this._transformEffect(r.ci[1])])}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Robust SE</div>
            <div class="stat-value">${r.se.toFixed(4)}</div>
            <div class="stat-hint">Cluster-robust</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Satterthwaite df</div>
            <div class="stat-value">${r.df.toFixed(1)}</div>
            <div class="stat-hint">Small-sample adjusted</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">t-statistic</div>
            <div class="stat-value">${r.t.toFixed(2)}</div>
            <div class="stat-hint">p = ${formatPValue(r.p)}</div>
          </div>
        </div>
        <div class="result-card">
          <div class="result-label">Comparison</div>
          <div class="result-hint">
            Standard SE: ${Math.sqrt(this._result.varEstimate)?.toFixed(4) || 'N/A'} |
            Robust SE: ${r.se.toFixed(4)} |
            Change: ${((r.se / Math.sqrt(this._result.varEstimate) - 1) * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    `;
  }

  _renderThreeLevelResults() {
    const r = this._threeLevelResult;
    return `
      <div class="result-block">
        <h5>Three-Level Model Results</h5>
        <div class="stats-grid">
          <div class="stat-card primary">
            <div class="stat-label">Overall Effect</div>
            <div class="stat-value">${this._transformEffect(r.estimate).toFixed(3)}</div>
            <div class="stat-hint">95% CI: ${this._formatCI([this._transformEffect(r.ci[0]), this._transformEffect(r.ci[1])])}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">σ² (Level 2)</div>
            <div class="stat-value">${r.sigma2Level2.toFixed(4)}</div>
            <div class="stat-hint">Within-study variance</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">σ² (Level 3)</div>
            <div class="stat-value">${r.sigma2Level3.toFixed(4)}</div>
            <div class="stat-hint">Between-study variance</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">ICC</div>
            <div class="stat-value">${r.icc.toFixed(3)}</div>
            <div class="stat-hint">Intraclass correlation</div>
          </div>
        </div>
        <div class="result-card">
          <div class="result-label">Variance Decomposition</div>
          <div class="result-hint">
            Level 1 (Sampling): ${(r.varianceDecomposition.level1 * 100).toFixed(1)}% |
            Level 2 (Within): ${(r.varianceDecomposition.level2 * 100).toFixed(1)}% |
            Level 3 (Between): ${(r.varianceDecomposition.level3 * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    `;
  }

  _renderPermutationResults() {
    const r = this._permutationResult;
    return `
      <div class="result-block">
        <h5>Permutation Test Results</h5>
        <div class="stats-grid">
          <div class="stat-card primary">
            <div class="stat-label">Permutation p-value</div>
            <div class="stat-value">${formatPValue(r.pPermutation)}</div>
            <div class="stat-hint">Based on ${r.nPermutations.toLocaleString()} permutations</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Observed Statistic</div>
            <div class="stat-value">${r.observedStatistic.toFixed(3)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Parametric p-value</div>
            <div class="stat-value">${formatPValue(this._result.p)}</div>
            <div class="stat-hint">For comparison</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">95% CI (Permutation)</div>
            <div class="stat-value">${this._formatCI([this._transformEffect(r.ciPermutation[0]), this._transformEffect(r.ciPermutation[1])])}</div>
          </div>
        </div>
        <div class="result-card">
          <div class="result-label">Interpretation</div>
          <div class="result-hint">
            ${Math.abs(r.pPermutation - this._result.p) < 0.05
              ? 'Permutation p-value agrees with parametric result (assumptions likely valid)'
              : 'Notable difference from parametric p-value (consider using permutation result)'}
          </div>
        </div>
      </div>
    `;
  }

  _renderTau2Comparison() {
    const methods = this._advancedTau2;
    return `
      <div class="result-block">
        <h5>τ² Estimates by Method</h5>
        <div class="tau2-comparison-table">
          <div class="table-header">
            <div class="cell">Method</div>
            <div class="cell">τ²</div>
            <div class="cell">τ</div>
            <div class="cell">I²</div>
          </div>
          ${Object.entries(methods).map(([method, data]) => `
            <div class="table-row ${method === this._settings.method ? 'highlight' : ''}">
              <div class="cell">${method}</div>
              <div class="cell">${data.tau2.toFixed(4)}</div>
              <div class="cell">${Math.sqrt(data.tau2).toFixed(4)}</div>
              <div class="cell">${data.I2.toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>
        <div class="result-card">
          <div class="result-label">Key</div>
          <div class="result-hint">
            DL = DerSimonian-Laird | REML = Restricted ML | ML = Maximum Likelihood |
            PM = Paule-Mandel | HE = Hedges | HS = Hunter-Schmidt |
            SJ = Sidik-Jonkman | EB = Empirical Bayes | GENQ = Generalized Q
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
          font-family: inherit;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
          min-width: 180px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: var(--color-text, #111827);
          cursor: pointer;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border-radius: var(--radius-md, 0.375rem);
          cursor: pointer;
          transition: all 150ms;
          border: none;
        }

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-700, #1d4ed8);
        }

        .btn-secondary {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-text, #111827);
          border: 1px solid var(--color-border, #d1d5db);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--color-gray-200, #e5e7eb);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Tabs */
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
          transition: all 150ms;
        }

        .tab:hover {
          color: var(--color-text, #111827);
        }

        .tab.active {
          color: var(--color-primary-600, #2563eb);
          border-bottom-color: var(--color-primary-600, #2563eb);
        }

        /* Results */
        .section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 1.5rem 0 1rem 0;
        }

        .section-title:first-child {
          margin-top: 0;
        }

        .section-desc {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          margin-bottom: 1rem;
        }

        .results-section {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.5rem;
        }

        .result-card {
          padding: 1rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
          margin-bottom: 1rem;
        }

        .result-card.primary {
          background: var(--color-primary-50, #eff6ff);
          border: 1px solid var(--color-primary-200, #bfdbfe);
        }

        .result-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .result-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-text, #111827);
        }

        .result-ci {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.25rem;
          font-family: monospace;
        }

        .result-p {
          font-size: 0.875rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.25rem;
        }

        .result-hint {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.5rem;
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

        .stat-warning {
          font-size: 0.75rem;
          color: var(--color-warning-600, #d97706);
          margin-top: 0.25rem;
        }

        .text-danger { color: var(--color-danger-600, #dc2626); }
        .text-warning { color: var(--color-warning-600, #d97706); }
        .text-success { color: var(--color-success-600, #059669); }
        .text-muted { color: var(--color-text-secondary, #6b7280); }

        /* Forest Plot */
        .forest-plot {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.5rem;
          overflow-x: auto;
        }

        .forest-container {
          font-size: 0.8125rem;
          min-width: 700px;
        }

        .forest-header,
        .forest-row {
          display: grid;
          grid-template-columns: 180px 1fr 200px 80px;
          gap: 1rem;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .forest-header {
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
        }

        .forest-row.pooled {
          border-top: 2px solid var(--color-text, #111827);
          margin-top: 0.5rem;
          padding-top: 1rem;
          border-bottom: none;
        }

        .study-id {
          font-family: monospace;
          font-size: 0.75rem;
          word-break: break-all;
        }

        .plot-col {
          position: relative;
          min-height: 24px;
        }

        .plot-area {
          position: relative;
          height: 24px;
          background: var(--color-gray-100, #f3f4f6);
          border-radius: 2px;
        }

        .null-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1px;
          background: var(--color-gray-500, #6b7280);
          z-index: 1;
        }

        .ci-line {
          position: absolute;
          top: 50%;
          height: 2px;
          background: var(--color-primary-500, #3b82f6);
          transform: translateY(-50%);
        }

        .effect-point {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          background: var(--color-primary-600, #2563eb);
          border-radius: 2px;
          z-index: 2;
        }

        .diamond-svg {
          position: absolute;
          top: 50%;
          height: 16px;
          transform: translateY(-50%);
        }

        .plot-axis {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          position: relative;
        }

        .null-label {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
        }

        .effect-col {
          font-family: monospace;
          font-size: 0.75rem;
        }

        .weight-col {
          text-align: right;
        }

        .forest-legend {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 1rem;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .legend-separator {
          color: var(--color-gray-400);
        }

        .heterogeneity-summary {
          text-align: center;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        /* Funnel Plot */
        .funnel-plot {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.5rem;
        }

        .funnel-svg {
          width: 100%;
          max-width: 500px;
          height: auto;
          display: block;
          margin: 0 auto;
        }

        .funnel-svg .axis-text {
          font-size: 10px;
          fill: var(--color-text-secondary, #6b7280);
        }

        .funnel-stats {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        .stat-row {
          display: flex;
          gap: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .stat-name {
          color: var(--color-text-secondary, #6b7280);
        }

        .stat-val {
          color: var(--color-text, #111827);
          font-family: monospace;
        }

        /* Analysis panels */
        .analysis-panel {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          padding: 1.5rem;
        }

        .control-row {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
          margin-bottom: 1.5rem;
        }

        /* Tables */
        .subgroup-table,
        .loo-table,
        .cumulative-table,
        .metareg-results .table-header,
        .metareg-results .table-row {
          display: grid;
          font-size: 0.875rem;
        }

        .subgroup-table,
        .loo-table {
          grid-template-columns: repeat(5, 1fr);
        }

        .cumulative-table {
          grid-template-columns: 2fr 1fr 2fr;
        }

        .table-header {
          display: contents;
        }

        .table-header .cell {
          padding: 0.75rem;
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
          background: var(--color-gray-50, #f9fafb);
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .table-row {
          display: contents;
        }

        .table-row .cell {
          padding: 0.75rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .table-row.highlight .cell {
          background: var(--color-warning-50, #fffbeb);
        }

        /* Bubble plot */
        .bubble-plot {
          margin-top: 1.5rem;
        }

        .bubble-svg {
          width: 100%;
          max-width: 400px;
          height: auto;
          display: block;
          margin: 0 auto;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
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
          color: var(--color-text, #111827);
          margin-bottom: 0.5rem;
        }

        .empty-text {
          color: var(--color-text-secondary, #6b7280);
        }

        /* Advanced Methods Styles */
        .advanced-sections {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .advanced-section {
          padding: 1.5rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-lg, 0.5rem);
          border: 1px solid var(--color-border, #e5e7eb);
        }

        .advanced-section h4 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0 0 0.5rem 0;
        }

        .btn-group {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 1rem;
        }

        .result-block {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--color-border, #e5e7eb);
        }

        .result-block h5 {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-primary-600, #2563eb);
          margin: 0 0 1rem 0;
        }

        /* Bayesian styles */
        .bayesian-settings {
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
        }

        .bayesian-results h4 {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 1.5rem 0 1rem 0;
        }

        .bayesian-results h4:first-child {
          margin-top: 0;
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }

        .comparison-table th,
        .comparison-table td {
          padding: 0.5rem;
          text-align: left;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .comparison-table th {
          font-weight: 600;
          color: var(--color-text-secondary, #6b7280);
        }

        /* P-curve histogram */
        .pcurve-histogram {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--color-gray-50, #f9fafb);
          border-radius: var(--radius-md, 0.375rem);
        }

        .histogram-bars {
          display: flex;
          align-items: flex-end;
          height: 100px;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .histogram-bar {
          flex: 1;
          background: var(--color-primary-500, #3b82f6);
          border-radius: 2px 2px 0 0;
          min-height: 4px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          position: relative;
        }

        .bar-label {
          position: absolute;
          top: -20px;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
        }

        .histogram-labels {
          display: flex;
          justify-content: space-around;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.5rem;
        }

        /* Tau2 comparison table */
        .tau2-comparison-table {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          font-size: 0.875rem;
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-md, 0.375rem);
          overflow: hidden;
        }

        .tau2-comparison-table .table-header .cell {
          background: var(--color-gray-100, #f3f4f6);
          font-weight: 600;
        }

        .tau2-comparison-table .cell {
          padding: 0.5rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .tau2-comparison-table .table-row:last-child .cell {
          border-bottom: none;
        }

        .tau2-comparison-table .table-row.highlight .cell {
          background: var(--color-primary-50, #eff6ff);
        }

        /* Primary stat card variant */
        .stat-card.primary {
          background: var(--color-primary-50, #eff6ff);
          border: 1px solid var(--color-primary-200, #bfdbfe);
        }

        @media (max-width: 768px) {
          .settings-row {
            flex-direction: column;
            align-items: stretch;
          }
          .control-row {
            flex-direction: column;
            align-items: stretch;
          }
          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }
          .tau2-comparison-table {
            grid-template-columns: 1fr 1fr;
          }
          .btn-group {
            flex-direction: column;
          }
        }
      </style>

      <div class="page-header">
        <div>
          <h1 class="page-title">Meta-Analysis</h1>
          ${this._project ? `<div class="project-name">${this._project.name}</div>` : ''}
        </div>
      </div>

      ${this._studies.length < 2 ? `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h2 class="empty-title">Not enough data</h2>
          <p class="empty-text">Extract data from at least 2 studies to run a meta-analysis.</p>
          <a href="#/extraction?project=${this._project?.id}" class="btn btn-primary" style="margin-top: 1rem; text-decoration: none;">Go to Extraction</a>
        </div>
      ` : `
        <div class="settings-card">
          <div class="settings-row">
            <div class="form-group">
              <label class="form-label">Estimation Method</label>
              <select class="form-select" id="method-select">
                <option value="DL" ${this._settings.method === 'DL' ? 'selected' : ''}>DerSimonian-Laird</option>
                <option value="REML" ${this._settings.method === 'REML' ? 'selected' : ''}>REML</option>
                <option value="PM" ${this._settings.method === 'PM' ? 'selected' : ''}>Paule-Mandel</option>
                <option value="FE" ${this._settings.method === 'FE' ? 'selected' : ''}>Fixed Effects</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Continuity Correction</label>
              <select class="form-select" id="correction-select">
                <option value="tacc" ${this._settings.correction === 'tacc' ? 'selected' : ''}>TACC (Treatment Arm)</option>
                <option value="constant" ${this._settings.correction === 'constant' ? 'selected' : ''}>Constant (0.5)</option>
                <option value="empirical" ${this._settings.correction === 'empirical' ? 'selected' : ''}>Empirical</option>
              </select>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="hksj-check" ${this._settings.hksj ? 'checked' : ''}>
                HKSJ Adjustment
              </label>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="hksj-floor-check" ${this._settings.hksjFloor ? 'checked' : ''}>
                Apply floor (q ≥ 1)
              </label>
            </div>

            <button class="btn btn-primary" id="run-btn">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
              </svg>
              Run Analysis
            </button>
          </div>

          <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--color-text-secondary);">
            ${this._studies.length} studies with extracted data •
            Outcome: ${this._settings.outcomeType} •
            Measure: ${this._getEffectLabel()}
          </div>
        </div>

        ${this._result ? `
          ${this._renderTabs()}
          <div class="tab-content">
            ${this._renderTabContent()}
          </div>
        ` : ''}
      `}
    `;
  }
}

customElements.define('analysis-page', AnalysisPage);

export default AnalysisPage;
