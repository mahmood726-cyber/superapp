/**
 * Reports Page
 * Living Meta-Analysis Platform
 *
 * Features:
 * - PRISMA 2020 compliant flow diagram
 * - GRADE Summary of Findings (SoF) table
 * - Multiple export formats
 */

import { db } from '../db.js';
import { store, actions } from '../store.js';
import { router } from '../router.js';

class ReportsPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
    this._stats = null;
    this._records = [];
    this._analysisResult = null;
    this._robSummary = null;
    this._gradeAssessment = null;
    this._loading = true;
    this._activeTab = 'prisma';
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

      await this._loadData();
    } catch (err) {
      console.error('Failed to load project:', err);
      this._showToast('Failed to load project', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  }

  async _loadData() {
    this._records = await db.records.query('projectId', this._project.id);
    this._analysisResult = this._project.analysisStats;
    this._robSummary = this._project.robSummary;
    this._gradeAssessment = this._project.gradeAssessment;
    await this._calculateStats();
  }

  async _calculateStats() {
    const allRecords = this._records;

    // PRISMA 2020 statistics
    this._stats = {
      // Identification phase
      identification: {
        databases: {
          total: allRecords.length,
          source: 'ClinicalTrials.gov',
          duplicatesRemoved: allRecords.filter(r => r.duplicate).length,
          afterDuplicates: allRecords.filter(r => !r.duplicate).length
        },
        registers: {
          total: 0,
          source: 'Other registers',
          duplicatesRemoved: 0,
          afterDuplicates: 0
        },
        otherMethods: {
          websites: 0,
          organizations: 0,
          citationSearching: 0,
          total: 0
        }
      },

      // Screening phase
      screening: {
        automatedExcluded: allRecords.filter(r => r.automatedExclusion).length,
        screenedTitleAbstract: allRecords.filter(r => r.screeningStatus && !r.automatedExclusion).length,
        excludedTitleAbstract: allRecords.filter(r => r.screeningStatus === 'excluded' && !r.fullTextAssessed).length,
        soughtRetrieval: allRecords.filter(r => r.screeningStatus === 'included' || r.screeningStatus === 'maybe').length,
        notRetrieved: allRecords.filter(r => r.retrievalFailed).length,
        assessedEligibility: allRecords.filter(r => r.fullTextAssessed).length,
        excludedFullText: allRecords.filter(r => r.fullTextAssessed && r.screeningStatus === 'excluded').length
      },

      // Exclusion reasons (detailed)
      exclusionReasons: this._countExclusionReasons(allRecords),

      // Included phase
      included: {
        newStudies: allRecords.filter(r => r.screeningStatus === 'included' && !r.fromPreviousReview).length,
        previousStudies: allRecords.filter(r => r.screeningStatus === 'included' && r.fromPreviousReview).length,
        totalStudies: allRecords.filter(r => r.screeningStatus === 'included').length,
        totalReports: allRecords.filter(r => r.screeningStatus === 'included').length,
        inSynthesis: allRecords.filter(r => r.extraction?.status === 'completed').length,
        withMetaAnalysis: allRecords.filter(r =>
          r.extraction?.status === 'completed' &&
          r.extraction?.armData?.[0]
        ).length
      }
    };
  }

  _countExclusionReasons(records) {
    const reasons = {
      'Wrong population': 0,
      'Wrong intervention': 0,
      'Wrong comparator': 0,
      'Wrong outcome': 0,
      'Wrong study design': 0,
      'Duplicate': 0,
      'No full text': 0,
      'Other': 0
    };

    for (const r of records) {
      if (r.screeningStatus === 'excluded' && r.exclusionReason) {
        if (reasons.hasOwnProperty(r.exclusionReason)) {
          reasons[r.exclusionReason]++;
        } else {
          reasons['Other']++;
        }
      }
    }

    // Remove zero counts
    return Object.fromEntries(Object.entries(reasons).filter(([k, v]) => v > 0));
  }

  _setupEventListeners() {
    this.shadowRoot.addEventListener('click', this._handleClick.bind(this));
  }

  _handleClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    switch (action) {
      case 'switch-tab':
        this._activeTab = target.dataset.tab;
        this.render();
        break;
      case 'export-prisma':
        this._exportPrisma();
        break;
      case 'export-prisma-png':
        this._exportPrismaPNG();
        break;
      case 'export-csv':
        this._exportCSV();
        break;
      case 'export-json':
        this._exportJSON();
        break;
      case 'export-ris':
        this._exportRIS();
        break;
      case 'export-sof':
        this._exportSoF();
        break;
      case 'copy-prisma':
        this._copyPrismaSVG();
        break;
    }
  }

  _exportPrisma() {
    const svg = this.shadowRoot.querySelector('.prisma-diagram svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    this._downloadFile(blob, `prisma-${this._project.name.replace(/\s+/g, '-')}.svg`);
    this._showToast('PRISMA diagram exported as SVG', 'success');
  }

  async _exportPrismaPNG() {
    const svg = this.shadowRoot.querySelector('.prisma-diagram svg');
    if (!svg) return;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();

      canvas.width = 1600;
      canvas.height = 1400;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      });

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        this._downloadFile(blob, `prisma-${this._project.name.replace(/\s+/g, '-')}.png`);
        this._showToast('PRISMA diagram exported as PNG', 'success');
      }, 'image/png');
    } catch (err) {
      this._showToast('Failed to export PNG', 'error');
    }
  }

  async _copyPrismaSVG() {
    const svg = this.shadowRoot.querySelector('.prisma-diagram svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    try {
      await navigator.clipboard.writeText(svgData);
      this._showToast('SVG copied to clipboard', 'success');
    } catch (err) {
      this._showToast('Failed to copy', 'error');
    }
  }

  async _exportCSV() {
    const included = this._records.filter(r => r.screeningStatus === 'included');

    const headers = [
      'NCT ID', 'Title', 'Status', 'Phase', 'Enrollment',
      'Start Date', 'Completion Date', 'Sponsor',
      'Outcome Type', 'Effect Measure', 'Effect Size', 'SE',
      'CI Lower', 'CI Upper', 'Events (Tx)', 'Total (Tx)',
      'Events (Ctrl)', 'Total (Ctrl)', 'RoB Overall'
    ];

    const rows = included.map(r => {
      const extraction = r.extraction || {};
      const arm1 = extraction.armData?.[0] || {};
      const arm2 = extraction.armData?.[1] || {};

      return [
        r.nctId || '',
        `"${(r.title || '').replace(/"/g, '""')}"`,
        r.status || '',
        r.phase || '',
        r.enrollment || '',
        r.startDate || '',
        r.completionDate || '',
        `"${(r.sponsor || '').replace(/"/g, '""')}"`,
        extraction.outcomeType || '',
        extraction.effectMeasure || '',
        extraction.effectSize || '',
        extraction.se || '',
        extraction.ciLower || '',
        extraction.ciUpper || '',
        arm1.events || '',
        arm1.total || '',
        arm2.events || '',
        arm2.total || '',
        r.robAssessment?.overall || ''
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    this._downloadFile(blob, `${this._project.name.replace(/\s+/g, '-')}-data.csv`);
    this._showToast('CSV exported', 'success');
  }

  async _exportJSON() {
    const exportData = {
      project: {
        name: this._project.name,
        description: this._project.description,
        pico: this._project.pico,
        createdAt: this._project.createdAt,
        exportedAt: new Date().toISOString()
      },
      prismaStats: this._stats,
      analysisResults: this._analysisResult,
      robSummary: this._robSummary,
      gradeAssessment: this._gradeAssessment,
      summaryOfFindings: this._generateSoFData(),
      studies: this._records.filter(r => r.screeningStatus === 'included').map(r => ({
        nctId: r.nctId,
        title: r.title,
        status: r.status,
        phase: r.phase,
        enrollment: r.enrollment,
        startDate: r.startDate,
        completionDate: r.completionDate,
        sponsor: r.sponsor,
        conditions: r.conditions,
        interventions: r.interventions,
        extraction: r.extraction,
        robAssessment: r.robAssessment
      }))
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    this._downloadFile(blob, `${this._project.name.replace(/\s+/g, '-')}-full.json`);
    this._showToast('JSON exported', 'success');
  }

  async _exportRIS() {
    const included = this._records.filter(r => r.screeningStatus === 'included');

    const ris = included.map(r => {
      const lines = [
        'TY  - CTRIAL',
        `TI  - ${r.title || ''}`,
        `ID  - ${r.nctId || ''}`,
        `PY  - ${r.startDate ? new Date(r.startDate).getFullYear() : ''}`,
        `AU  - ${r.sponsor || ''}`,
        `N1  - Phase: ${r.phase || 'N/A'}`,
        `N2  - Status: ${r.status || 'N/A'}`,
        `KW  - ${(r.conditions || []).join('; ')}`,
        `UR  - https://clinicaltrials.gov/study/${r.nctId}`,
        'ER  - '
      ];
      return lines.join('\n');
    }).join('\n\n');

    const blob = new Blob([ris], { type: 'application/x-research-info-systems' });
    this._downloadFile(blob, `${this._project.name.replace(/\s+/g, '-')}.ris`);
    this._showToast('RIS exported', 'success');
  }

  _generateSoFData() {
    const result = this._analysisResult;
    const grade = this._gradeAssessment;

    if (!result) return null;

    // Get effect on natural scale
    const isRatio = ['rr', 'or', 'hr'].includes(result.effectMeasure);
    const effect = isRatio ? Math.exp(result.pooledEffect || 0) : (result.pooledEffect || 0);
    const ciLower = isRatio ? Math.exp(result.ci?.lower || 0) : (result.ci?.lower || 0);
    const ciUpper = isRatio ? Math.exp(result.ci?.upper || 0) : (result.ci?.upper || 0);

    // Calculate absolute effects (for binary outcomes)
    const baselineRisk = 0.2; // Default assumed control risk
    const riskWithIntervention = isRatio ? baselineRisk * effect : null;
    const riskDifference = riskWithIntervention ? riskWithIntervention - baselineRisk : null;

    return {
      outcome: this._project.pico?.outcome || 'Primary outcome',
      population: this._project.pico?.population || 'Not specified',
      intervention: this._project.pico?.intervention || 'Intervention',
      comparator: this._project.pico?.comparator || 'Comparator',
      numberOfStudies: this._stats.included.inSynthesis,
      numberOfParticipants: this._records
        .filter(r => r.extraction?.status === 'completed')
        .reduce((sum, r) => sum + (r.extraction?.armData?.[0]?.total || 0) + (r.extraction?.armData?.[1]?.total || 0), 0),
      effectMeasure: this._getEffectMeasureLabel(result.effectMeasure),
      relativeEffect: {
        value: effect,
        ci: [ciLower, ciUpper]
      },
      absoluteEffect: riskDifference !== null ? {
        baselineRisk: baselineRisk,
        withIntervention: riskWithIntervention,
        difference: riskDifference,
        per1000: Math.round(riskDifference * 1000)
      } : null,
      certainty: grade?.overall || 'not assessed',
      certaintyReasons: {
        riskOfBias: grade?.domains?.riskOfBias || 'not assessed',
        inconsistency: grade?.domains?.inconsistency || 'not assessed',
        indirectness: grade?.domains?.indirectness || 'not assessed',
        imprecision: grade?.domains?.imprecision || 'not assessed',
        publicationBias: grade?.domains?.publicationBias || 'not assessed'
      },
      comments: grade?.narrative || ''
    };
  }

  _getEffectMeasureLabel(measure) {
    const labels = {
      rr: 'Risk Ratio',
      or: 'Odds Ratio',
      rd: 'Risk Difference',
      smd: 'Standardized Mean Difference',
      md: 'Mean Difference',
      hr: 'Hazard Ratio'
    };
    return labels[measure] || measure || 'Effect';
  }

  _exportSoF() {
    const sof = this._generateSoFData();
    if (!sof) {
      this._showToast('No analysis results available', 'warning');
      return;
    }

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Summary of Findings - ${this._project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
    th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .grade-high { background: #d4edda; }
    .grade-moderate { background: #fff3cd; }
    .grade-low { background: #f8d7da; }
    .grade-very-low { background: #f5c6cb; }
    .footnotes { font-size: 0.875rem; color: #666; }
    .footnotes p { margin: 0.25rem 0; }
  </style>
</head>
<body>
  <h1>Summary of Findings Table</h1>
  <p class="subtitle">${this._project.name} - Generated ${new Date().toLocaleDateString()}</p>

  <table>
    <thead>
      <tr>
        <th colspan="7">${sof.intervention} compared to ${sof.comparator} for ${sof.population}</th>
      </tr>
      <tr>
        <th>Outcome</th>
        <th>No. of participants<br>(studies)</th>
        <th>Relative effect<br>(95% CI)</th>
        <th colspan="2">Anticipated absolute effects* (95% CI)</th>
        <th>Certainty</th>
        <th>What happens</th>
      </tr>
      <tr>
        <th></th>
        <th></th>
        <th></th>
        <th>Risk with ${sof.comparator}</th>
        <th>Risk with ${sof.intervention}</th>
        <th></th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${sof.outcome}</strong></td>
        <td>${sof.numberOfParticipants}<br>(${sof.numberOfStudies} RCTs)</td>
        <td><strong>${sof.effectMeasure} ${sof.relativeEffect.value.toFixed(2)}</strong><br>(${sof.relativeEffect.ci[0].toFixed(2)} to ${sof.relativeEffect.ci[1].toFixed(2)})</td>
        <td>${sof.absoluteEffect ? `${Math.round(sof.absoluteEffect.baselineRisk * 1000)} per 1,000` : 'See comment'}</td>
        <td>${sof.absoluteEffect ? `${Math.round(sof.absoluteEffect.withIntervention * 1000)} per 1,000<br>(${sof.absoluteEffect.per1000 > 0 ? '+' : ''}${sof.absoluteEffect.per1000} more)` : 'See comment'}</td>
        <td class="grade-${sof.certainty.toLowerCase().replace(' ', '-')}">${this._formatCertainty(sof.certainty)}</td>
        <td>${this._generateWhatHappens(sof)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footnotes">
    <p>*The risk in the intervention group (and its 95% confidence interval) is based on the assumed risk in the comparison group and the relative effect of the intervention (and its 95% CI).</p>
    <p><strong>CI:</strong> confidence interval; <strong>RCT:</strong> randomised controlled trial; <strong>${sof.effectMeasure}:</strong> ${this._getEffectMeasureLabel(sof.effectMeasure)}</p>
    <h4>GRADE Working Group grades of evidence</h4>
    <p><strong>High certainty:</strong> we are very confident that the true effect lies close to that of the estimate of the effect.</p>
    <p><strong>Moderate certainty:</strong> we are moderately confident in the effect estimate: the true effect is likely to be close to the estimate of the effect, but there is a possibility that it is substantially different.</p>
    <p><strong>Low certainty:</strong> our confidence in the effect estimate is limited: the true effect may be substantially different from the estimate of the effect.</p>
    <p><strong>Very low certainty:</strong> we have very little confidence in the effect estimate: the true effect is likely to be substantially different from the estimate of effect.</p>

    <h4>Explanations</h4>
    ${this._generateGradeExplanations(sof)}
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    this._downloadFile(blob, `${this._project.name.replace(/\s+/g, '-')}-SoF.html`);
    this._showToast('Summary of Findings exported', 'success');
  }

  _formatCertainty(certainty) {
    const stars = { high: 4, moderate: 3, low: 2, 'very low': 1, 'very-low': 1 };
    const numStars = stars[certainty?.toLowerCase()] || 0;
    return `${'⊕'.repeat(numStars)}${'⊖'.repeat(4 - numStars)}<br>${certainty?.toUpperCase() || 'NOT ASSESSED'}`;
  }

  _generateWhatHappens(sof) {
    const effect = sof.relativeEffect.value;
    const ciLower = sof.relativeEffect.ci[0];
    const ciUpper = sof.relativeEffect.ci[1];

    // Check if effect crosses null
    const isRatio = ['rr', 'or', 'hr'].includes(sof.effectMeasure?.toLowerCase());
    const nullValue = isRatio ? 1 : 0;
    const crossesNull = ciLower <= nullValue && ciUpper >= nullValue;

    if (crossesNull) {
      return `${sof.intervention} may result in little to no difference in ${sof.outcome.toLowerCase()}`;
    }

    const direction = effect > nullValue ? 'increases' : 'reduces';
    const magnitude = Math.abs(effect - nullValue);
    const magnitudeDesc = magnitude > 0.5 ? 'substantially' : magnitude > 0.2 ? 'probably' : 'may slightly';

    return `${sof.intervention} ${magnitudeDesc} ${direction} ${sof.outcome.toLowerCase()}`;
  }

  _generateGradeExplanations(sof) {
    const reasons = sof.certaintyReasons;
    let explanations = [];
    let footnote = 1;

    if (reasons.riskOfBias && reasons.riskOfBias !== 'no serious') {
      explanations.push(`<p><sup>${footnote++}</sup> Risk of bias: ${reasons.riskOfBias}</p>`);
    }
    if (reasons.inconsistency && reasons.inconsistency !== 'no serious') {
      explanations.push(`<p><sup>${footnote++}</sup> Inconsistency: ${reasons.inconsistency}</p>`);
    }
    if (reasons.indirectness && reasons.indirectness !== 'no serious') {
      explanations.push(`<p><sup>${footnote++}</sup> Indirectness: ${reasons.indirectness}</p>`);
    }
    if (reasons.imprecision && reasons.imprecision !== 'no serious') {
      explanations.push(`<p><sup>${footnote++}</sup> Imprecision: ${reasons.imprecision}</p>`);
    }
    if (reasons.publicationBias && reasons.publicationBias !== 'undetected') {
      explanations.push(`<p><sup>${footnote++}</sup> Publication bias: ${reasons.publicationBias}</p>`);
    }

    return explanations.length > 0 ? explanations.join('') : '<p>No downgrades applied.</p>';
  }

  _downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) toast.show(message, type);
  }

  _renderPrisma() {
    const s = this._stats;
    if (!s) return '<div class="empty-message">No data available</div>';

    const id = s.identification;
    const scr = s.screening;
    const inc = s.included;

    // PRISMA 2020 compliant flow diagram
    return `
      <div class="prisma-container">
        <div class="prisma-actions">
          <button class="btn btn-secondary" data-action="export-prisma">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
            Export SVG
          </button>
          <button class="btn btn-secondary" data-action="export-prisma-png">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
            </svg>
            Export PNG
          </button>
          <button class="btn btn-secondary" data-action="copy-prisma">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
            </svg>
            Copy SVG
          </button>
        </div>

        <div class="prisma-diagram">
          <svg viewBox="0 0 900 750" xmlns="http://www.w3.org/2000/svg" style="font-family: Arial, sans-serif;">
            <!-- Background -->
            <rect width="900" height="750" fill="#ffffff"/>

            <!-- Title -->
            <text x="450" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#111827">
              PRISMA 2020 Flow Diagram
            </text>
            <text x="450" y="48" text-anchor="middle" font-size="11" fill="#6b7280">
              ${this._project.name}
            </text>

            <!-- Phase labels (left side) -->
            <text x="25" y="110" font-size="12" font-weight="bold" fill="#2563eb" transform="rotate(-90, 25, 110)">Identification</text>
            <text x="25" y="290" font-size="12" font-weight="bold" fill="#059669" transform="rotate(-90, 25, 290)">Screening</text>
            <text x="25" y="530" font-size="12" font-weight="bold" fill="#7c3aed" transform="rotate(-90, 25, 530)">Included</text>

            <!-- IDENTIFICATION SECTION -->
            <!-- Left column: Databases and registers -->
            <g>
              <rect x="60" y="70" width="320" height="100" rx="4" fill="#eff6ff" stroke="#2563eb" stroke-width="1.5"/>
              <text x="220" y="90" text-anchor="middle" font-size="11" font-weight="bold" fill="#1e40af">Identification of new studies via databases and registers</text>

              <rect x="70" y="100" width="145" height="60" rx="3" fill="#dbeafe" stroke="#2563eb" stroke-width="1"/>
              <text x="142" y="120" text-anchor="middle" font-size="10" fill="#1e40af">Records identified from:</text>
              <text x="142" y="135" text-anchor="middle" font-size="9" fill="#1e40af">${id.databases.source} (n = ${id.databases.total})</text>
              <text x="142" y="150" text-anchor="middle" font-size="9" fill="#1e40af">Registers (n = ${id.registers.total})</text>

              <rect x="225" y="100" width="145" height="60" rx="3" fill="#dbeafe" stroke="#2563eb" stroke-width="1"/>
              <text x="297" y="120" text-anchor="middle" font-size="10" fill="#1e40af">Records removed before</text>
              <text x="297" y="135" text-anchor="middle" font-size="10" fill="#1e40af">screening:</text>
              <text x="297" y="150" text-anchor="middle" font-size="9" fill="#1e40af">Duplicates (n = ${id.databases.duplicatesRemoved})</text>
            </g>

            <!-- Right column: Other methods -->
            <g>
              <rect x="420" y="70" width="320" height="100" rx="4" fill="#f0fdf4" stroke="#059669" stroke-width="1.5"/>
              <text x="580" y="90" text-anchor="middle" font-size="11" font-weight="bold" fill="#047857">Identification of new studies via other methods</text>

              <rect x="430" y="100" width="145" height="60" rx="3" fill="#dcfce7" stroke="#059669" stroke-width="1"/>
              <text x="502" y="120" text-anchor="middle" font-size="10" fill="#047857">Records identified from:</text>
              <text x="502" y="135" text-anchor="middle" font-size="9" fill="#047857">Websites (n = ${id.otherMethods.websites})</text>
              <text x="502" y="150" text-anchor="middle" font-size="9" fill="#047857">Citation searching (n = ${id.otherMethods.citationSearching})</text>

              <rect x="585" y="100" width="145" height="60" rx="3" fill="#dcfce7" stroke="#059669" stroke-width="1"/>
              <text x="657" y="120" text-anchor="middle" font-size="10" fill="#047857">Records removed before</text>
              <text x="657" y="135" text-anchor="middle" font-size="10" fill="#047857">screening:</text>
              <text x="657" y="150" text-anchor="middle" font-size="9" fill="#047857">Duplicates (n = 0)</text>
            </g>

            <!-- Arrows down from identification -->
            <line x1="142" y1="170" x2="142" y2="195" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="142,200 138,192 146,192" fill="#6b7280"/>
            <line x1="502" y1="170" x2="502" y2="195" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="502,200 498,192 506,192" fill="#6b7280"/>

            <!-- SCREENING SECTION -->
            <!-- Records screened -->
            <rect x="60" y="205" width="230" height="55" rx="4" fill="#ecfdf5" stroke="#059669" stroke-width="1.5"/>
            <text x="175" y="225" text-anchor="middle" font-size="10" fill="#047857">Records screened</text>
            <text x="175" y="242" text-anchor="middle" font-size="12" font-weight="bold" fill="#047857">(n = ${scr.screenedTitleAbstract})</text>

            <!-- Arrow to excluded -->
            <line x1="290" y1="232" x2="320" y2="232" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="325,232 317,228 317,236" fill="#6b7280"/>

            <!-- Excluded title/abstract -->
            <rect x="330" y="205" width="180" height="55" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
            <text x="420" y="225" text-anchor="middle" font-size="10" fill="#991b1b">Records excluded by</text>
            <text x="420" y="240" text-anchor="middle" font-size="10" fill="#991b1b">automation tools (n = ${scr.automatedExcluded})</text>

            <!-- Reports sought -->
            <rect x="420" y="205" width="230" height="55" rx="4" fill="#ecfdf5" stroke="#059669" stroke-width="1.5"/>
            <text x="535" y="225" text-anchor="middle" font-size="10" fill="#047857">Reports sought for retrieval</text>
            <text x="535" y="242" text-anchor="middle" font-size="12" font-weight="bold" fill="#047857">(n = ${id.otherMethods.total})</text>

            <!-- Arrow to not retrieved -->
            <line x1="650" y1="232" x2="680" y2="232" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="685,232 677,228 677,236" fill="#6b7280"/>

            <!-- Not retrieved -->
            <rect x="690" y="205" width="160" height="55" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
            <text x="770" y="225" text-anchor="middle" font-size="10" fill="#991b1b">Reports not retrieved</text>
            <text x="770" y="242" text-anchor="middle" font-size="12" font-weight="bold" fill="#991b1b">(n = ${scr.notRetrieved})</text>

            <!-- Arrow down -->
            <line x1="175" y1="260" x2="175" y2="285" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="175,290 171,282 179,282" fill="#6b7280"/>
            <line x1="535" y1="260" x2="535" y2="285" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="535,290 531,282 539,282" fill="#6b7280"/>

            <!-- Reports assessed -->
            <rect x="60" y="295" width="230" height="55" rx="4" fill="#ecfdf5" stroke="#059669" stroke-width="1.5"/>
            <text x="175" y="315" text-anchor="middle" font-size="10" fill="#047857">Reports assessed for eligibility</text>
            <text x="175" y="332" text-anchor="middle" font-size="12" font-weight="bold" fill="#047857">(n = ${scr.assessedEligibility})</text>

            <!-- Arrow to excluded full text -->
            <line x1="290" y1="322" x2="320" y2="322" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="325,322 317,318 317,326" fill="#6b7280"/>

            <!-- Excluded full-text with reasons -->
            <rect x="330" y="280" width="180" height="85" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
            <text x="420" y="298" text-anchor="middle" font-size="10" fill="#991b1b">Reports excluded (n = ${scr.excludedFullText}):</text>
            ${Object.entries(s.exclusionReasons).slice(0, 4).map(([reason, count], i) =>
              `<text x="420" y="${315 + i * 14}" text-anchor="middle" font-size="9" fill="#991b1b">${reason} (n = ${count})</text>`
            ).join('')}

            <!-- Reports assessed (other methods) -->
            <rect x="420" y="295" width="230" height="55" rx="4" fill="#ecfdf5" stroke="#059669" stroke-width="1.5"/>
            <text x="535" y="315" text-anchor="middle" font-size="10" fill="#047857">Reports assessed for eligibility</text>
            <text x="535" y="332" text-anchor="middle" font-size="12" font-weight="bold" fill="#047857">(n = 0)</text>

            <!-- Arrow to excluded -->
            <line x1="650" y1="322" x2="680" y2="322" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="685,322 677,318 677,326" fill="#6b7280"/>

            <!-- Excluded (other methods) -->
            <rect x="690" y="295" width="160" height="55" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
            <text x="770" y="315" text-anchor="middle" font-size="10" fill="#991b1b">Reports excluded</text>
            <text x="770" y="332" text-anchor="middle" font-size="12" font-weight="bold" fill="#991b1b">(n = 0)</text>

            <!-- Merge arrows to included -->
            <line x1="175" y1="350" x2="175" y2="390" stroke="#6b7280" stroke-width="1.5"/>
            <line x1="535" y1="350" x2="535" y2="390" stroke="#6b7280" stroke-width="1.5"/>
            <line x1="175" y1="390" x2="535" y2="390" stroke="#6b7280" stroke-width="1.5"/>
            <line x1="355" y1="390" x2="355" y2="415" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="355,420 351,412 359,412" fill="#6b7280"/>

            <!-- INCLUDED SECTION -->
            <!-- New studies included -->
            <rect x="200" y="425" width="310" height="90" rx="4" fill="#f5f3ff" stroke="#7c3aed" stroke-width="2"/>
            <text x="355" y="450" text-anchor="middle" font-size="11" font-weight="bold" fill="#6d28d9">Studies included in review</text>
            <text x="355" y="470" text-anchor="middle" font-size="14" font-weight="bold" fill="#6d28d9">(n = ${inc.totalStudies})</text>
            <text x="355" y="490" text-anchor="middle" font-size="10" fill="#6d28d9">Reports of new included studies (n = ${inc.totalReports})</text>

            <!-- Arrow down to synthesis -->
            <line x1="355" y1="515" x2="355" y2="540" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="355,545 351,537 359,537" fill="#6b7280"/>

            <!-- Studies in synthesis -->
            <rect x="200" y="550" width="310" height="70" rx="4" fill="#faf5ff" stroke="#7c3aed" stroke-width="2"/>
            <text x="355" y="575" text-anchor="middle" font-size="11" font-weight="bold" fill="#6d28d9">Studies included in quantitative synthesis</text>
            <text x="355" y="600" text-anchor="middle" font-size="14" font-weight="bold" fill="#6d28d9">(n = ${inc.inSynthesis})</text>

            <!-- Arrow to meta-analysis -->
            <line x1="355" y1="620" x2="355" y2="645" stroke="#6b7280" stroke-width="1.5"/>
            <polygon points="355,650 351,642 359,642" fill="#6b7280"/>

            <!-- Meta-analysis -->
            <rect x="200" y="655" width="310" height="50" rx="4" fill="#ede9fe" stroke="#7c3aed" stroke-width="2"/>
            <text x="355" y="680" text-anchor="middle" font-size="11" font-weight="bold" fill="#6d28d9">Studies included in meta-analysis</text>
            <text x="355" y="698" text-anchor="middle" font-size="12" font-weight="bold" fill="#6d28d9">(n = ${inc.withMetaAnalysis})</text>

            <!-- PRISMA 2020 citation -->
            <text x="450" y="735" text-anchor="middle" font-size="9" fill="#9ca3af">
              From: Page MJ, et al. The PRISMA 2020 statement. BMJ 2021;372:n71
            </text>
          </svg>
        </div>
      </div>
    `;
  }

  _renderSoF() {
    const sof = this._generateSoFData();

    if (!sof) {
      return `
        <div class="empty-message">
          <p>Run a meta-analysis to generate Summary of Findings table.</p>
          <a href="#/analysis?project=${this._project?.id}" class="btn btn-primary" style="margin-top: 1rem;">Go to Analysis</a>
        </div>
      `;
    }

    const certaintyClass = `grade-${(sof.certainty || 'not-assessed').toLowerCase().replace(' ', '-')}`;

    return `
      <div class="sof-container">
        <div class="sof-actions">
          <button class="btn btn-secondary" data-action="export-sof">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
            Export HTML
          </button>
        </div>

        <div class="sof-table-wrapper">
          <table class="sof-table">
            <thead>
              <tr class="sof-header-main">
                <th colspan="7">
                  <strong>${sof.intervention}</strong> compared to <strong>${sof.comparator}</strong> for <strong>${sof.population}</strong>
                </th>
              </tr>
              <tr class="sof-header-sub">
                <th>Outcome</th>
                <th>No. of participants<br><span class="subtext">(studies)</span></th>
                <th>Relative effect<br><span class="subtext">(95% CI)</span></th>
                <th colspan="2">Anticipated absolute effects<span class="subtext">*</span> (95% CI)</th>
                <th>Certainty</th>
                <th>What happens</th>
              </tr>
              <tr class="sof-header-sub2">
                <th></th>
                <th></th>
                <th></th>
                <th>Risk with<br>${sof.comparator}</th>
                <th>Risk with<br>${sof.intervention}</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="outcome-cell"><strong>${sof.outcome}</strong></td>
                <td class="center">${sof.numberOfParticipants}<br><span class="subtext">(${sof.numberOfStudies} RCTs)</span></td>
                <td class="center">
                  <strong>${sof.effectMeasure} ${sof.relativeEffect.value.toFixed(2)}</strong><br>
                  <span class="subtext">(${sof.relativeEffect.ci[0].toFixed(2)} to ${sof.relativeEffect.ci[1].toFixed(2)})</span>
                </td>
                <td class="center">
                  ${sof.absoluteEffect ? `${Math.round(sof.absoluteEffect.baselineRisk * 1000)} per 1,000` : '—'}
                </td>
                <td class="center">
                  ${sof.absoluteEffect ? `
                    ${Math.round(sof.absoluteEffect.withIntervention * 1000)} per 1,000<br>
                    <span class="diff ${sof.absoluteEffect.per1000 < 0 ? 'favorable' : 'unfavorable'}">
                      (${sof.absoluteEffect.per1000 > 0 ? '+' : ''}${sof.absoluteEffect.per1000} ${sof.absoluteEffect.per1000 >= 0 ? 'more' : 'fewer'})
                    </span>
                  ` : '—'}
                </td>
                <td class="center ${certaintyClass}">
                  <div class="certainty-symbols">${this._renderCertaintySymbols(sof.certainty)}</div>
                  <div class="certainty-label">${sof.certainty?.toUpperCase() || 'NOT ASSESSED'}</div>
                </td>
                <td>${this._generateWhatHappens(sof)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="sof-footnotes">
          <p>*The risk in the intervention group (and its 95% confidence interval) is based on the assumed risk in the comparison group and the relative effect of the intervention (and its 95% CI).</p>
          <p><strong>CI:</strong> confidence interval; <strong>RCT:</strong> randomised controlled trial</p>
        </div>

        <div class="grade-legend">
          <h4>GRADE Working Group grades of evidence</h4>
          <div class="grade-items">
            <div class="grade-item">
              <span class="grade-high">⊕⊕⊕⊕</span>
              <span><strong>High:</strong> Very confident the true effect lies close to the estimate</span>
            </div>
            <div class="grade-item">
              <span class="grade-moderate">⊕⊕⊕⊖</span>
              <span><strong>Moderate:</strong> True effect likely close to estimate, may be substantially different</span>
            </div>
            <div class="grade-item">
              <span class="grade-low">⊕⊕⊖⊖</span>
              <span><strong>Low:</strong> True effect may be substantially different from estimate</span>
            </div>
            <div class="grade-item">
              <span class="grade-very-low">⊕⊖⊖⊖</span>
              <span><strong>Very low:</strong> Very little confidence in effect estimate</span>
            </div>
          </div>
        </div>

        ${sof.certaintyReasons ? `
          <div class="grade-reasons">
            <h4>Reasons for downgrading</h4>
            <ul>
              ${Object.entries(sof.certaintyReasons)
                .filter(([k, v]) => v && v !== 'no serious' && v !== 'not assessed' && v !== 'undetected')
                .map(([domain, reason]) => `<li><strong>${this._formatDomain(domain)}:</strong> ${reason}</li>`)
                .join('') || '<li>No serious concerns identified</li>'}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderCertaintySymbols(certainty) {
    const levels = { high: 4, moderate: 3, low: 2, 'very low': 1, 'very-low': 1 };
    const numFilled = levels[certainty?.toLowerCase()] || 0;
    return '⊕'.repeat(numFilled) + '⊖'.repeat(4 - numFilled);
  }

  _formatDomain(domain) {
    const labels = {
      riskOfBias: 'Risk of bias',
      inconsistency: 'Inconsistency',
      indirectness: 'Indirectness',
      imprecision: 'Imprecision',
      publicationBias: 'Publication bias'
    };
    return labels[domain] || domain;
  }

  _renderExport() {
    return `
      <div class="export-section">
        <div class="export-card">
          <div class="export-icon">📊</div>
          <h3>Study Data (CSV)</h3>
          <p>Export extracted data as comma-separated values for spreadsheet applications.</p>
          <button class="btn btn-primary" data-action="export-csv">Export CSV</button>
        </div>

        <div class="export-card">
          <div class="export-icon">📦</div>
          <h3>Complete Project (JSON)</h3>
          <p>Export all project data including records, extractions, analyses, and assessments.</p>
          <button class="btn btn-primary" data-action="export-json">Export JSON</button>
        </div>

        <div class="export-card">
          <div class="export-icon">📚</div>
          <h3>Citations (RIS)</h3>
          <p>Export included studies in RIS format for Zotero, EndNote, or Mendeley.</p>
          <button class="btn btn-primary" data-action="export-ris">Export RIS</button>
        </div>

        <div class="export-card">
          <div class="export-icon">📋</div>
          <h3>Summary of Findings (HTML)</h3>
          <p>Export GRADE Summary of Findings table as a formatted HTML document.</p>
          <button class="btn btn-primary" data-action="export-sof">Export SoF</button>
        </div>
      </div>
    `;
  }

  render() {
    if (this._loading) {
      this.shadowRoot.innerHTML = `
        <style>
          .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; gap: 1rem; }
          .spinner { width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        <div class="loading"><div class="spinner"></div><p>Generating reports...</p></div>
      `;
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 1.5rem; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .page-title { font-size: 1.5rem; font-weight: 600; color: #111827; margin: 0; }
        .project-name { font-size: 0.875rem; color: #6b7280; }

        .tabs { display: flex; gap: 0.5rem; padding: 0.25rem; background: #f3f4f6; border-radius: 0.5rem; margin-bottom: 1.5rem; }
        .tab { flex: 1; padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 500; border: none; background: transparent; color: #6b7280; cursor: pointer; border-radius: 0.375rem; transition: all 150ms; }
        .tab:hover { color: #111827; }
        .tab.active { background: #fff; color: #2563eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500; font-family: inherit; border-radius: 0.375rem; cursor: pointer; transition: all 150ms; text-decoration: none; }
        .btn-primary { background: #2563eb; border: 1px solid #2563eb; color: white; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-secondary { background: #fff; border: 1px solid #d1d5db; color: #111827; }
        .btn-secondary:hover { background: #f9fafb; }

        /* PRISMA styles */
        .prisma-container { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; }
        .prisma-actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .prisma-diagram { overflow-x: auto; }
        .prisma-diagram svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }

        /* SoF styles */
        .sof-container { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; }
        .sof-actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .sof-table-wrapper { overflow-x: auto; margin-bottom: 1.5rem; }
        .sof-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; min-width: 800px; }
        .sof-table th, .sof-table td { border: 1px solid #e5e7eb; padding: 0.75rem; text-align: left; vertical-align: top; }
        .sof-table th { background: #f9fafb; font-weight: 600; }
        .sof-header-main th { text-align: center; font-size: 1rem; background: #f3f4f6; }
        .sof-header-sub th { text-align: center; font-size: 0.8125rem; }
        .sof-header-sub2 th { text-align: center; font-size: 0.75rem; font-weight: 500; background: #fafafa; }
        .sof-table .subtext { font-size: 0.75rem; color: #6b7280; font-weight: normal; }
        .sof-table .center { text-align: center; }
        .sof-table .outcome-cell { font-weight: 500; }
        .sof-table .diff { font-size: 0.75rem; }
        .sof-table .diff.favorable { color: #059669; }
        .sof-table .diff.unfavorable { color: #dc2626; }

        .certainty-symbols { font-size: 1.25rem; letter-spacing: 2px; }
        .certainty-label { font-size: 0.6875rem; font-weight: 600; margin-top: 0.25rem; }

        .grade-high { background: #d1fae5 !important; }
        .grade-moderate { background: #fef3c7 !important; }
        .grade-low { background: #fee2e2 !important; }
        .grade-very-low { background: #fecaca !important; }
        .grade-not-assessed { background: #f3f4f6 !important; }

        .sof-footnotes { font-size: 0.75rem; color: #6b7280; margin-bottom: 1.5rem; padding: 1rem; background: #f9fafb; border-radius: 0.375rem; }
        .sof-footnotes p { margin: 0.25rem 0; }

        .grade-legend { margin-bottom: 1.5rem; }
        .grade-legend h4 { font-size: 0.875rem; font-weight: 600; margin: 0 0 0.75rem 0; }
        .grade-items { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
        .grade-item { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.8125rem; padding: 0.5rem; background: #f9fafb; border-radius: 0.25rem; }
        .grade-item span:first-child { font-size: 1rem; flex-shrink: 0; }

        .grade-reasons { padding: 1rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 0.375rem; }
        .grade-reasons h4 { font-size: 0.875rem; font-weight: 600; margin: 0 0 0.5rem 0; color: #92400e; }
        .grade-reasons ul { margin: 0; padding-left: 1.25rem; font-size: 0.8125rem; }
        .grade-reasons li { margin: 0.25rem 0; }

        /* Export styles */
        .export-section { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
        .export-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; text-align: center; }
        .export-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .export-card h3 { margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600; }
        .export-card p { font-size: 0.875rem; color: #6b7280; margin: 0 0 1rem 0; }

        /* Empty states */
        .empty-state { text-align: center; padding: 4rem 2rem; background: #fff; border: 2px dashed #e5e7eb; border-radius: 0.5rem; }
        .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
        .empty-title { font-size: 1.125rem; font-weight: 600; color: #111827; margin-bottom: 0.5rem; }
        .empty-text { color: #6b7280; }
        .empty-message { padding: 2rem; text-align: center; color: #6b7280; }

        @media (max-width: 768px) {
          .export-section { grid-template-columns: 1fr; }
          .grade-items { grid-template-columns: 1fr; }
        }
      </style>

      <div class="page-header">
        <div>
          <h1 class="page-title">Reports</h1>
          ${this._project ? `<div class="project-name">${this._project.name}</div>` : ''}
        </div>
      </div>

      ${!this._stats || this._stats.identification.databases.total === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <h2 class="empty-title">No reports available</h2>
          <p class="empty-text">Import studies and complete your review to generate reports.</p>
          <a href="#/search?project=${this._project?.id}" class="btn btn-primary" style="margin-top: 1rem;">Start Search</a>
        </div>
      ` : `
        <div class="tabs">
          <button class="tab ${this._activeTab === 'prisma' ? 'active' : ''}" data-action="switch-tab" data-tab="prisma">
            PRISMA 2020 Flow
          </button>
          <button class="tab ${this._activeTab === 'sof' ? 'active' : ''}" data-action="switch-tab" data-tab="sof">
            Summary of Findings
          </button>
          <button class="tab ${this._activeTab === 'export' ? 'active' : ''}" data-action="switch-tab" data-tab="export">
            Export Data
          </button>
        </div>

        ${this._activeTab === 'prisma' ? this._renderPrisma() :
          this._activeTab === 'sof' ? this._renderSoF() :
          this._renderExport()}
      `}
    `;
  }
}

customElements.define('reports-page', ReportsPage);

export default ReportsPage;
