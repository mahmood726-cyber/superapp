/**
 * Evidence Integrity Monitor Page
 * Living Meta-Analysis Platform
 *
 * Full RoB2 implementation with signaling questions
 * GRADE assessment with proper evidence-based logic
 */

import { db } from '../db.js';
import { store, actions } from '../store.js';
import { router } from '../router.js';

// RoB2 Response options
const ROB2_RESPONSES = [
  { value: 'Y', label: 'Yes', short: 'Y' },
  { value: 'PY', label: 'Probably Yes', short: 'PY' },
  { value: 'NI', label: 'No Information', short: 'NI' },
  { value: 'PN', label: 'Probably No', short: 'PN' },
  { value: 'N', label: 'No', short: 'N' },
  { value: 'NA', label: 'Not Applicable', short: 'NA' }
];

// RoB2 Domains with full signaling questions (Cochrane RoB2 tool)
const ROB2_DOMAINS = [
  {
    id: 'D1',
    label: 'Randomization process',
    questions: [
      { id: '1.1', text: 'Was the allocation sequence random?', goodAnswers: ['Y', 'PY'] },
      { id: '1.2', text: 'Was the allocation sequence concealed until participants were enrolled and assigned to interventions?', goodAnswers: ['Y', 'PY'] },
      { id: '1.3', text: 'Did baseline differences between intervention groups suggest a problem with the randomization process?', goodAnswers: ['N', 'PN'] }
    ],
    algorithm: (answers) => {
      const q1 = answers['1.1'];
      const q2 = answers['1.2'];
      const q3 = answers['1.3'];

      // Algorithm per RoB2 guidance
      if (['Y', 'PY'].includes(q1) && ['Y', 'PY'].includes(q2) && ['N', 'PN'].includes(q3)) {
        return 'low';
      }
      if (q3 === 'Y' || (q1 === 'N' && q2 === 'N')) {
        return 'high';
      }
      return 'some';
    }
  },
  {
    id: 'D2',
    label: 'Deviations from intended interventions',
    questions: [
      { id: '2.1', text: 'Were participants aware of their assigned intervention during the trial?', infoOnly: true },
      { id: '2.2', text: 'Were carers and people delivering the interventions aware of participants\' assigned intervention during the trial?', infoOnly: true },
      { id: '2.3', text: 'Were there deviations from the intended intervention that arose because of the trial context?', goodAnswers: ['N', 'PN'], conditional: (a) => ['Y', 'PY', 'NI'].includes(a['2.1']) || ['Y', 'PY', 'NI'].includes(a['2.2']) },
      { id: '2.4', text: 'Were these deviations likely to have affected the outcome?', goodAnswers: ['N', 'PN'], conditional: (a) => ['Y', 'PY'].includes(a['2.3']) },
      { id: '2.5', text: 'Were these deviations from intended intervention balanced between groups?', goodAnswers: ['Y', 'PY'], conditional: (a) => ['Y', 'PY', 'NI'].includes(a['2.4']) },
      { id: '2.6', text: 'Was an appropriate analysis used to estimate the effect of assignment to intervention?', goodAnswers: ['Y', 'PY'] },
      { id: '2.7', text: 'Was there potential for a substantial impact (on the result) of the failure to analyse participants in the group to which they were randomized?', goodAnswers: ['N', 'PN'], conditional: (a) => ['N', 'PN', 'NI'].includes(a['2.6']) }
    ],
    algorithm: (answers) => {
      const q23 = answers['2.3'];
      const q24 = answers['2.4'];
      const q25 = answers['2.5'];
      const q26 = answers['2.6'];
      const q27 = answers['2.7'];

      // No deviations path
      if (['N', 'PN'].includes(q23) && ['Y', 'PY'].includes(q26)) {
        return 'low';
      }
      // Deviations but balanced or didn't affect outcome
      if ((['N', 'PN'].includes(q24) || ['Y', 'PY'].includes(q25)) && ['Y', 'PY'].includes(q26)) {
        return 'low';
      }
      // Unbalanced deviations that affected outcome
      if (['Y', 'PY'].includes(q24) && ['N', 'PN'].includes(q25)) {
        return 'high';
      }
      // Inappropriate analysis with substantial impact
      if (['N', 'PN'].includes(q26) && ['Y', 'PY'].includes(q27)) {
        return 'high';
      }
      return 'some';
    }
  },
  {
    id: 'D3',
    label: 'Missing outcome data',
    questions: [
      { id: '3.1', text: 'Were data for this outcome available for all, or nearly all, participants randomized?', goodAnswers: ['Y', 'PY'] },
      { id: '3.2', text: 'Is there evidence that the result was not biased by missing outcome data?', goodAnswers: ['Y', 'PY'], conditional: (a) => ['N', 'PN', 'NI'].includes(a['3.1']) },
      { id: '3.3', text: 'Could missingness in the outcome depend on its true value?', goodAnswers: ['N', 'PN'], conditional: (a) => ['N', 'PN'].includes(a['3.2']) },
      { id: '3.4', text: 'Is it likely that missingness in the outcome depended on its true value?', goodAnswers: ['N', 'PN'], conditional: (a) => ['Y', 'PY', 'NI'].includes(a['3.3']) }
    ],
    algorithm: (answers) => {
      const q1 = answers['3.1'];
      const q2 = answers['3.2'];
      const q3 = answers['3.3'];
      const q4 = answers['3.4'];

      // Data available for nearly all
      if (['Y', 'PY'].includes(q1)) {
        return 'low';
      }
      // Evidence result not biased
      if (['Y', 'PY'].includes(q2)) {
        return 'low';
      }
      // Missingness couldn't depend on true value
      if (['N', 'PN'].includes(q3)) {
        return 'low';
      }
      // Likely that missingness depended on true value
      if (['Y', 'PY'].includes(q4)) {
        return 'high';
      }
      return 'some';
    }
  },
  {
    id: 'D4',
    label: 'Measurement of the outcome',
    questions: [
      { id: '4.1', text: 'Was the method of measuring the outcome inappropriate?', goodAnswers: ['N', 'PN'] },
      { id: '4.2', text: 'Could measurement or ascertainment of the outcome have differed between intervention groups?', goodAnswers: ['N', 'PN'] },
      { id: '4.3', text: 'Were outcome assessors aware of the intervention received by study participants?', infoOnly: true, conditional: (a) => ['N', 'PN', 'NI'].includes(a['4.1']) && ['N', 'PN', 'NI'].includes(a['4.2']) },
      { id: '4.4', text: 'Could assessment of the outcome have been influenced by knowledge of intervention received?', goodAnswers: ['N', 'PN'], conditional: (a) => ['Y', 'PY', 'NI'].includes(a['4.3']) },
      { id: '4.5', text: 'Is it likely that assessment of the outcome was influenced by knowledge of intervention received?', goodAnswers: ['N', 'PN'], conditional: (a) => ['Y', 'PY', 'NI'].includes(a['4.4']) }
    ],
    algorithm: (answers) => {
      const q1 = answers['4.1'];
      const q2 = answers['4.2'];
      const q3 = answers['4.3'];
      const q4 = answers['4.4'];
      const q5 = answers['4.5'];

      // Inappropriate method or differential measurement
      if (['Y', 'PY'].includes(q1) || ['Y', 'PY'].includes(q2)) {
        return 'high';
      }
      // Assessors not aware
      if (['N', 'PN'].includes(q3)) {
        return 'low';
      }
      // Knowledge couldn't influence
      if (['N', 'PN'].includes(q4)) {
        return 'low';
      }
      // Unlikely influenced
      if (['N', 'PN'].includes(q5)) {
        return 'low';
      }
      // Likely influenced
      if (['Y', 'PY'].includes(q5)) {
        return 'high';
      }
      return 'some';
    }
  },
  {
    id: 'D5',
    label: 'Selection of the reported result',
    questions: [
      { id: '5.1', text: 'Were the data that produced this result analysed in accordance with a pre-specified analysis plan that was finalized before unblinded outcome data were available for analysis?', goodAnswers: ['Y', 'PY'] },
      { id: '5.2', text: 'Is the numerical result being assessed likely to have been selected, on the basis of the results, from multiple eligible outcome measurements within the outcome domain?', goodAnswers: ['N', 'PN'] },
      { id: '5.3', text: 'Is the numerical result being assessed likely to have been selected, on the basis of the results, from multiple eligible analyses of the data?', goodAnswers: ['N', 'PN'] }
    ],
    algorithm: (answers) => {
      const q1 = answers['5.1'];
      const q2 = answers['5.2'];
      const q3 = answers['5.3'];

      // Pre-specified and no selective reporting
      if (['Y', 'PY'].includes(q1) && ['N', 'PN'].includes(q2) && ['N', 'PN'].includes(q3)) {
        return 'low';
      }
      // Likely selective reporting
      if (['Y', 'PY'].includes(q2) || ['Y', 'PY'].includes(q3)) {
        return 'high';
      }
      return 'some';
    }
  }
];

// GRADE domains with explicit criteria
const GRADE_DOMAINS = [
  {
    id: 'rob',
    label: 'Risk of Bias',
    description: 'Limitations in study design and execution affecting confidence in effect estimate',
    criteria: {
      none: 'Most information from studies at low risk of bias',
      '-1': 'Most information from studies at moderate risk of bias, or some from high risk',
      '-2': 'Most information from studies at high risk of bias'
    }
  },
  {
    id: 'inconsistency',
    label: 'Inconsistency',
    description: 'Unexplained heterogeneity or variability in results across studies',
    criteria: {
      none: 'I² < 40% or heterogeneity explained by subgroup/meta-regression',
      '-1': 'I² 40-75%, point estimates vary considerably, overlapping CIs',
      '-2': 'I² > 75%, very different point estimates, non-overlapping CIs'
    }
  },
  {
    id: 'indirectness',
    label: 'Indirectness',
    description: 'Evidence does not directly address the review question',
    criteria: {
      none: 'Direct comparison of interventions of interest in population of interest',
      '-1': 'Some differences in population, intervention, comparator, or outcome',
      '-2': 'Major differences; indirect comparison required'
    }
  },
  {
    id: 'imprecision',
    label: 'Imprecision',
    description: 'Wide confidence intervals around effect estimate',
    criteria: {
      none: 'Adequate sample size, narrow CI, OIS met',
      '-1': 'Wide CI crossing threshold for clinical decision, OIS not met',
      '-2': 'Very wide CI, very few events or participants'
    }
  },
  {
    id: 'publication',
    label: 'Publication Bias',
    description: 'Systematic non-publication of studies based on results',
    criteria: {
      none: 'Comprehensive search, no evidence of asymmetry',
      '-1': 'Some evidence of small-study effects or missing studies',
      '-2': 'Strong evidence of publication bias'
    }
  }
];

// GRADE certainty levels
const GRADE_LEVELS = [
  { value: 'high', label: 'High', stars: 4, description: 'Very confident that true effect lies close to estimate' },
  { value: 'moderate', label: 'Moderate', stars: 3, description: 'Moderately confident; true effect probably close to estimate' },
  { value: 'low', label: 'Low', stars: 2, description: 'Limited confidence; true effect may be substantially different' },
  { value: 'very-low', label: 'Very Low', stars: 1, description: 'Very little confidence; true effect likely substantially different' }
];

// RoB judgment colors
const ROB_COLORS = {
  low: '#22c55e',
  some: '#f59e0b',
  high: '#ef4444',
  pending: '#d1d5db'
};

class EIMPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
    this._studies = [];
    this._robAssessments = {};
    this._gradeAssessment = null;
    this._selectedStudy = null;
    this._loading = true;
    this._activeTab = 'rob';
    this._expandedDomain = null;
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

      // Load included studies with completed extraction
      const allRecords = await db.records.query('projectId', this._project.id);
      this._studies = allRecords.filter(r =>
        r.screeningStatus === 'included' &&
        r.extraction?.status === 'completed'
      );

      // Load existing assessments
      this._robAssessments = this._project.robAssessments || {};
      this._gradeAssessment = this._project.gradeAssessment || this._initGradeAssessment();

      if (this._studies.length > 0 && !this._selectedStudy) {
        this._selectedStudy = this._studies[0].id;
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      this._showToast('Failed to load project', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  }

  _initGradeAssessment() {
    const assessment = { domains: {}, overall: null, notes: '' };
    for (const domain of GRADE_DOMAINS) {
      assessment.domains[domain.id] = { rating: 'none', notes: '' };
    }
    return assessment;
  }

  _setupEventListeners() {
    this.shadowRoot.addEventListener('click', this._handleClick.bind(this));
    this.shadowRoot.addEventListener('change', this._handleChange.bind(this));
  }

  _handleClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    switch (action) {
      case 'select-study':
        this._selectedStudy = parseInt(target.dataset.study);
        this._expandedDomain = null;
        this.render();
        break;
      case 'toggle-domain':
        const domainId = target.dataset.domain;
        this._expandedDomain = this._expandedDomain === domainId ? null : domainId;
        this.render();
        break;
      case 'set-answer':
        this._setSignalingAnswer(
          parseInt(target.dataset.study),
          target.dataset.domain,
          target.dataset.question,
          target.dataset.value
        );
        break;
      case 'set-domain-judgment':
        this._setDomainJudgment(
          parseInt(target.dataset.study),
          target.dataset.domain,
          target.dataset.value
        );
        break;
      case 'set-grade':
        this._setGradeRating(target.dataset.domain, target.dataset.value);
        break;
      case 'set-overall-grade':
        this._gradeAssessment.overall = target.dataset.value;
        this._saveAssessments();
        this.render();
        break;
      case 'switch-tab':
        this._activeTab = target.dataset.tab;
        this.render();
        break;
      case 'auto-assess':
        this._autoAssessGrade();
        break;
      case 'auto-judge-domain':
        this._autoJudgeDomain(
          parseInt(target.dataset.study),
          target.dataset.domain
        );
        break;
    }
  }

  _handleChange(e) {
    const target = e.target;
    if (target.classList.contains('domain-notes')) {
      const studyId = parseInt(target.dataset.study);
      const domainId = target.dataset.domain;
      this._ensureAssessmentPath(studyId, domainId);
      this._robAssessments[studyId][domainId].notes = target.value;
      this._saveAssessments();
    } else if (target.classList.contains('grade-notes')) {
      const domain = target.dataset.domain;
      this._gradeAssessment.domains[domain].notes = target.value;
      this._saveAssessments();
    }
  }

  _ensureAssessmentPath(studyId, domainId) {
    if (!this._robAssessments[studyId]) {
      this._robAssessments[studyId] = {};
    }
    if (!this._robAssessments[studyId][domainId]) {
      this._robAssessments[studyId][domainId] = { answers: {}, judgment: null, notes: '' };
    }
    if (!this._robAssessments[studyId][domainId].answers) {
      this._robAssessments[studyId][domainId].answers = {};
    }
  }

  _setSignalingAnswer(studyId, domainId, questionId, value) {
    this._ensureAssessmentPath(studyId, domainId);
    this._robAssessments[studyId][domainId].answers[questionId] = value;
    this._saveAssessments();
    this.render();
  }

  _setDomainJudgment(studyId, domainId, value) {
    this._ensureAssessmentPath(studyId, domainId);
    this._robAssessments[studyId][domainId].judgment = value;
    this._saveAssessments();
    this.render();
  }

  _autoJudgeDomain(studyId, domainId) {
    const domain = ROB2_DOMAINS.find(d => d.id === domainId);
    if (!domain) return;

    const assessment = this._robAssessments[studyId]?.[domainId];
    if (!assessment?.answers) return;

    const judgment = domain.algorithm(assessment.answers);
    this._setDomainJudgment(studyId, domainId, judgment);
  }

  _setGradeRating(domainId, value) {
    this._gradeAssessment.domains[domainId].rating = value;
    this._calculateOverallGrade();
    this._saveAssessments();
    this.render();
  }

  async _saveAssessments() {
    try {
      this._project.robAssessments = this._robAssessments;
      this._project.gradeAssessment = this._gradeAssessment;
      this._project.updatedAt = new Date().toISOString();
      await db.projects.put(this._project);
    } catch (err) {
      console.error('Failed to save assessments:', err);
    }
  }

  _autoAssessGrade() {
    const results = this._project.analysisResults;
    if (!results) {
      this._showToast('Run meta-analysis first to auto-assess', 'warning');
      return;
    }

    // Risk of Bias - based on individual study RoB judgments
    const robSummary = this._calculateRobSummary();
    const totalAssessed = robSummary.low + robSummary.some + robSummary.high;

    if (totalAssessed === 0) {
      this._showToast('Complete RoB2 assessments first', 'warning');
    } else {
      const highProp = robSummary.high / totalAssessed;
      const someProp = robSummary.some / totalAssessed;

      if (highProp > 0.5) {
        this._gradeAssessment.domains.rob.rating = '-2';
        this._gradeAssessment.domains.rob.notes = `${robSummary.high}/${totalAssessed} studies at high risk of bias`;
      } else if (highProp > 0 || someProp > 0.5) {
        this._gradeAssessment.domains.rob.rating = '-1';
        this._gradeAssessment.domains.rob.notes = `${robSummary.high} high, ${robSummary.some} some concerns out of ${totalAssessed} studies`;
      } else {
        this._gradeAssessment.domains.rob.rating = 'none';
        this._gradeAssessment.domains.rob.notes = `${robSummary.low}/${totalAssessed} studies at low risk of bias`;
      }
    }

    // Inconsistency - based on I²
    const I2 = results.heterogeneity?.I2;
    if (I2 !== undefined) {
      if (I2 > 75) {
        this._gradeAssessment.domains.inconsistency.rating = '-2';
        this._gradeAssessment.domains.inconsistency.notes = `Very high heterogeneity: I² = ${I2.toFixed(1)}%`;
      } else if (I2 > 50) {
        this._gradeAssessment.domains.inconsistency.rating = '-1';
        this._gradeAssessment.domains.inconsistency.notes = `Substantial heterogeneity: I² = ${I2.toFixed(1)}%`;
      } else if (I2 > 40) {
        this._gradeAssessment.domains.inconsistency.rating = '-1';
        this._gradeAssessment.domains.inconsistency.notes = `Moderate heterogeneity: I² = ${I2.toFixed(1)}%`;
      } else {
        this._gradeAssessment.domains.inconsistency.rating = 'none';
        this._gradeAssessment.domains.inconsistency.notes = `Low heterogeneity: I² = ${I2.toFixed(1)}%`;
      }
    }

    // Publication bias - based on Egger's test
    const eggerP = results.publicationBias?.egger?.pValue;
    if (eggerP !== undefined && this._studies.length >= 10) {
      if (eggerP < 0.05) {
        this._gradeAssessment.domains.publication.rating = '-1';
        this._gradeAssessment.domains.publication.notes = `Egger's test p = ${eggerP.toFixed(3)}, suggesting small-study effects`;
      } else {
        this._gradeAssessment.domains.publication.rating = 'none';
        this._gradeAssessment.domains.publication.notes = `No evidence of publication bias (Egger's p = ${eggerP.toFixed(3)})`;
      }
    } else if (this._studies.length < 10) {
      this._gradeAssessment.domains.publication.notes = `Fewer than 10 studies; publication bias tests unreliable`;
    }

    // Imprecision - based on sample size and CI crossing null
    const pooled = results.pooled;
    if (pooled) {
      const ci95Lower = pooled.ci95[0];
      const ci95Upper = pooled.ci95[1];
      const effect = pooled.effect;

      // Check if CI crosses clinically important thresholds (assuming log scale for RR/OR)
      const crossesNull = ci95Lower <= 0 && ci95Upper >= 0;
      const ciWidth = ci95Upper - ci95Lower;

      // Get total sample size
      const totalN = this._studies.reduce((sum, s) => {
        const arms = s.extraction?.armData || [];
        return sum + arms.reduce((a, arm) => a + (parseFloat(arm.total) || 0), 0);
      }, 0);

      // Optimal Information Size for binary outcomes ~ 300 events
      const totalEvents = this._studies.reduce((sum, s) => {
        const arms = s.extraction?.armData || [];
        return sum + arms.reduce((a, arm) => a + (parseFloat(arm.events) || 0), 0);
      }, 0);

      if (crossesNull && ciWidth > 1) {
        this._gradeAssessment.domains.imprecision.rating = '-2';
        this._gradeAssessment.domains.imprecision.notes = `Wide CI crossing null; total N=${totalN}`;
      } else if (crossesNull || totalEvents < 300) {
        this._gradeAssessment.domains.imprecision.rating = '-1';
        this._gradeAssessment.domains.imprecision.notes = `CI crosses null or OIS not met; total events=${totalEvents}`;
      } else {
        this._gradeAssessment.domains.imprecision.rating = 'none';
        this._gradeAssessment.domains.imprecision.notes = `Adequate precision; total N=${totalN}, events=${totalEvents}`;
      }
    }

    // Calculate overall
    this._calculateOverallGrade();
    this._saveAssessments();
    this.render();
    this._showToast('GRADE assessment updated from analysis results', 'success');
  }

  _calculateOverallGrade() {
    let score = 4; // Start at high (RCTs)
    for (const domain of GRADE_DOMAINS) {
      const rating = this._gradeAssessment.domains[domain.id].rating;
      if (rating === '-1') score -= 1;
      if (rating === '-2') score -= 2;
    }
    score = Math.max(1, Math.min(4, score));

    const levels = ['very-low', 'low', 'moderate', 'high'];
    this._gradeAssessment.overall = levels[score - 1];
  }

  _calculateRobSummary() {
    const summary = { low: 0, some: 0, high: 0 };

    for (const study of this._studies) {
      const assessment = this._robAssessments[study.id];
      if (!assessment) continue;

      // Overall judgment is the worst across domains
      let worst = null;
      let allJudged = true;

      for (const domain of ROB2_DOMAINS) {
        const judgment = assessment[domain.id]?.judgment;
        if (!judgment) {
          allJudged = false;
          continue;
        }
        if (judgment === 'high') worst = 'high';
        else if (judgment === 'some' && worst !== 'high') worst = 'some';
        else if (!worst) worst = judgment;
      }

      if (worst && allJudged) {
        summary[worst]++;
      }
    }

    return summary;
  }

  _getOverallRobJudgment(studyId) {
    const assessment = this._robAssessments[studyId];
    if (!assessment) return 'pending';

    let worst = 'low';
    let complete = true;

    for (const domain of ROB2_DOMAINS) {
      const judgment = assessment[domain.id]?.judgment;
      if (!judgment) {
        complete = false;
        continue;
      }
      if (judgment === 'high') worst = 'high';
      else if (judgment === 'some' && worst !== 'high') worst = 'some';
    }

    return complete ? worst : 'pending';
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) toast.show(message, type);
  }

  _renderStudyList() {
    return this._studies.map(study => {
      const overall = this._getOverallRobJudgment(study.id);
      const isSelected = study.id === this._selectedStudy;

      return `
        <div class="study-item ${isSelected ? 'selected' : ''}"
             data-action="select-study" data-study="${study.id}">
          <div class="study-indicator" style="background: ${ROB_COLORS[overall]}"></div>
          <div class="study-info">
            <div class="study-id">${study.nctId || `Study ${study.id}`}</div>
            <div class="study-title">${(study.title || '').substring(0, 35)}${(study.title || '').length > 35 ? '...' : ''}</div>
          </div>
          <div class="study-progress">
            ${this._renderMiniDomainIndicators(study.id)}
          </div>
        </div>
      `;
    }).join('');
  }

  _renderMiniDomainIndicators(studyId) {
    const assessment = this._robAssessments[studyId] || {};
    return ROB2_DOMAINS.map(domain => {
      const judgment = assessment[domain.id]?.judgment;
      const color = judgment ? ROB_COLORS[judgment] : ROB_COLORS.pending;
      return `<div class="mini-indicator" style="background: ${color}" title="${domain.label}: ${judgment || 'pending'}"></div>`;
    }).join('');
  }

  _renderRobForm() {
    if (!this._selectedStudy) {
      return `<div class="empty-message">Select a study to assess</div>`;
    }

    const study = this._studies.find(s => s.id === this._selectedStudy);
    if (!study) return '';

    const assessment = this._robAssessments[study.id] || {};

    return `
      <div class="rob-form">
        <div class="form-header">
          <div>
            <h3>${study.nctId || 'Study'}</h3>
            <div class="study-title-small">${study.title || ''}</div>
          </div>
          <div class="overall-badge" style="background: ${ROB_COLORS[this._getOverallRobJudgment(study.id)]}">
            ${this._getOverallRobJudgment(study.id).toUpperCase()}
          </div>
        </div>

        ${ROB2_DOMAINS.map(domain => this._renderDomainSection(study.id, domain, assessment[domain.id] || {})).join('')}
      </div>
    `;
  }

  _renderDomainSection(studyId, domain, assessment) {
    const isExpanded = this._expandedDomain === domain.id;
    const judgment = assessment.judgment;
    const answers = assessment.answers || {};

    // Calculate suggested judgment from algorithm
    const hasAllAnswers = domain.questions.every(q => {
      if (q.conditional && !q.conditional(answers)) return true;
      return answers[q.id];
    });
    const suggestedJudgment = hasAllAnswers ? domain.algorithm(answers) : null;

    return `
      <div class="rob-domain ${isExpanded ? 'expanded' : ''}">
        <div class="domain-header" data-action="toggle-domain" data-domain="${domain.id}">
          <div class="domain-indicator" style="background: ${ROB_COLORS[judgment || 'pending']}"></div>
          <div class="domain-title-group">
            <div class="domain-label">${domain.id}: ${domain.label}</div>
            <div class="domain-status">
              ${judgment ? `Judgment: ${judgment}` : 'Not assessed'}
              ${hasAllAnswers && !judgment ? ` (Suggested: ${suggestedJudgment})` : ''}
            </div>
          </div>
          <div class="expand-icon">${isExpanded ? '−' : '+'}</div>
        </div>

        ${isExpanded ? `
          <div class="domain-content">
            <div class="signaling-questions">
              <h4>Signaling Questions</h4>
              ${domain.questions.map(q => this._renderSignalingQuestion(studyId, domain.id, q, answers)).join('')}
            </div>

            <div class="domain-judgment-section">
              <div class="judgment-header">
                <h4>Domain Judgment</h4>
                ${hasAllAnswers && suggestedJudgment && suggestedJudgment !== judgment ? `
                  <button class="btn-auto-judge" data-action="auto-judge-domain" data-study="${studyId}" data-domain="${domain.id}">
                    Apply Algorithm (${suggestedJudgment})
                  </button>
                ` : ''}
              </div>
              <div class="judgment-buttons">
                <button class="judgment-btn ${judgment === 'low' ? 'active' : ''}"
                        style="--jc: ${ROB_COLORS.low}"
                        data-action="set-domain-judgment" data-study="${studyId}" data-domain="${domain.id}" data-value="low">
                  Low Risk
                </button>
                <button class="judgment-btn ${judgment === 'some' ? 'active' : ''}"
                        style="--jc: ${ROB_COLORS.some}"
                        data-action="set-domain-judgment" data-study="${studyId}" data-domain="${domain.id}" data-value="some">
                  Some Concerns
                </button>
                <button class="judgment-btn ${judgment === 'high' ? 'active' : ''}"
                        style="--jc: ${ROB_COLORS.high}"
                        data-action="set-domain-judgment" data-study="${studyId}" data-domain="${domain.id}" data-value="high">
                  High Risk
                </button>
              </div>

              <textarea class="domain-notes"
                        data-study="${studyId}"
                        data-domain="${domain.id}"
                        placeholder="Supporting rationale for judgment...">${assessment.notes || ''}</textarea>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderSignalingQuestion(studyId, domainId, question, answers) {
    // Check if question is conditional and should be shown
    if (question.conditional && !question.conditional(answers)) {
      return '';
    }

    const currentAnswer = answers[question.id];
    const isGood = currentAnswer && question.goodAnswers?.includes(currentAnswer);
    const isBad = currentAnswer && question.goodAnswers && !question.goodAnswers.includes(currentAnswer) && !question.infoOnly;

    return `
      <div class="signaling-question ${isGood ? 'good' : ''} ${isBad ? 'bad' : ''}">
        <div class="question-text">${question.id}. ${question.text}</div>
        <div class="answer-buttons">
          ${ROB2_RESPONSES.map(r => `
            <button class="answer-btn ${currentAnswer === r.value ? 'active' : ''}"
                    data-action="set-answer"
                    data-study="${studyId}"
                    data-domain="${domainId}"
                    data-question="${question.id}"
                    data-value="${r.value}">
              ${r.short}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderGradeForm() {
    const assessment = this._gradeAssessment;

    return `
      <div class="grade-form">
        <div class="form-header">
          <h3>GRADE Assessment</h3>
          <button class="btn btn-secondary" data-action="auto-assess">
            Auto-Assess from Results
          </button>
        </div>

        <div class="grade-domains">
          ${GRADE_DOMAINS.map(domain => {
            const domainAssessment = assessment.domains[domain.id] || {};
            return `
              <div class="grade-domain">
                <div class="domain-header-grade">
                  <div class="domain-title">${domain.label}</div>
                  <div class="domain-desc">${domain.description}</div>
                </div>

                <div class="grade-criteria">
                  ${Object.entries(domain.criteria).map(([key, text]) => `
                    <div class="criterion ${domainAssessment.rating === key ? 'selected' : ''}">
                      <strong>${key === 'none' ? 'No concern' : key}:</strong> ${text}
                    </div>
                  `).join('')}
                </div>

                <div class="rating-buttons">
                  <button class="rating-btn ok ${domainAssessment.rating === 'none' ? 'active' : ''}"
                          data-action="set-grade" data-domain="${domain.id}" data-value="none">
                    No concern
                  </button>
                  <button class="rating-btn serious ${domainAssessment.rating === '-1' ? 'active' : ''}"
                          data-action="set-grade" data-domain="${domain.id}" data-value="-1">
                    -1 Serious
                  </button>
                  <button class="rating-btn very-serious ${domainAssessment.rating === '-2' ? 'active' : ''}"
                          data-action="set-grade" data-domain="${domain.id}" data-value="-2">
                    -2 Very Serious
                  </button>
                </div>

                <textarea class="grade-notes"
                          data-domain="${domain.id}"
                          placeholder="Rationale...">${domainAssessment.notes || ''}</textarea>
              </div>
            `;
          }).join('')}
        </div>

        <div class="overall-grade">
          <h4>Overall Certainty of Evidence</h4>
          <div class="grade-levels">
            ${GRADE_LEVELS.map(level => `
              <button class="grade-level-btn ${assessment.overall === level.value ? 'active' : ''}"
                      data-action="set-overall-grade" data-value="${level.value}">
                <div class="grade-stars">${'★'.repeat(level.stars)}${'☆'.repeat(4 - level.stars)}</div>
                <div class="grade-label">${level.label}</div>
                <div class="grade-desc">${level.description}</div>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  _renderSummary() {
    const robSummary = this._calculateRobSummary();
    const gradeOverall = this._gradeAssessment.overall;
    const gradeLevel = GRADE_LEVELS.find(l => l.value === gradeOverall);

    return `
      <div class="summary-section">
        <div class="summary-card">
          <h3>Risk of Bias Summary</h3>
          <div class="rob-traffic-light">
            ${this._renderTrafficLight()}
          </div>
          <div class="rob-counts">
            <div class="count-item">
              <span class="count" style="color: ${ROB_COLORS.low}">${robSummary.low}</span>
              <span class="label">Low Risk</span>
            </div>
            <div class="count-item">
              <span class="count" style="color: ${ROB_COLORS.some}">${robSummary.some}</span>
              <span class="label">Some Concerns</span>
            </div>
            <div class="count-item">
              <span class="count" style="color: ${ROB_COLORS.high}">${robSummary.high}</span>
              <span class="label">High Risk</span>
            </div>
          </div>
        </div>

        <div class="summary-card">
          <h3>GRADE Summary</h3>
          ${gradeLevel ? `
            <div class="grade-display">
              <div class="grade-stars large">${'★'.repeat(gradeLevel.stars)}${'☆'.repeat(4 - gradeLevel.stars)}</div>
              <div class="grade-label large">${gradeLevel.label}</div>
              <div class="grade-desc">${gradeLevel.description}</div>
            </div>
          ` : `
            <div class="empty-message">Complete GRADE assessment</div>
          `}

          <div class="grade-breakdown">
            ${GRADE_DOMAINS.map(domain => {
              const rating = this._gradeAssessment.domains[domain.id]?.rating || 'none';
              const ratingLabel = rating === 'none' ? 'OK' : rating;
              const ratingClass = rating === 'none' ? 'ok' : 'downgrade';
              return `
                <div class="breakdown-item">
                  <span class="breakdown-label">${domain.label}</span>
                  <span class="breakdown-rating ${ratingClass}">${ratingLabel}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  _renderTrafficLight() {
    return `
      <div class="traffic-light-plot">
        <div class="tl-header">
          <div class="tl-corner"></div>
          ${ROB2_DOMAINS.map(d => `<div class="tl-domain-label" title="${d.label}">${d.id}</div>`).join('')}
          <div class="tl-domain-label">Overall</div>
        </div>
        ${this._studies.map(study => {
          const assessment = this._robAssessments[study.id] || {};
          const overall = this._getOverallRobJudgment(study.id);
          return `
            <div class="tl-row">
              <div class="tl-study-label" title="${study.nctId}">${(study.nctId || `S${study.id}`).substring(0, 12)}</div>
              ${ROB2_DOMAINS.map(domain => {
                const judgment = assessment[domain.id]?.judgment;
                return `<div class="tl-cell" style="background: ${ROB_COLORS[judgment || 'pending']}" title="${domain.label}: ${judgment || 'pending'}"></div>`;
              }).join('')}
              <div class="tl-cell overall" style="background: ${ROB_COLORS[overall]}" title="Overall: ${overall}"></div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  render() {
    if (this._loading) {
      this.shadowRoot.innerHTML = `
        <style>
          .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; gap: 1rem; }
          .spinner { width: 2rem; height: 2rem; border: 3px solid var(--color-gray-200, #e5e7eb); border-top-color: var(--color-primary-600, #2563eb); border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        <div class="loading"><div class="spinner"></div><p>Loading evidence assessment...</p></div>
      `;
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 1.5rem; }

        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .page-title { font-size: 1.5rem; font-weight: 600; color: var(--color-text, #111827); margin: 0; }
        .project-name { font-size: 0.875rem; color: var(--color-text-secondary, #6b7280); }

        .tabs { display: flex; gap: 0.5rem; padding: 0.25rem; background: var(--color-gray-100, #f3f4f6); border-radius: var(--radius-lg, 0.5rem); margin-bottom: 1.5rem; }
        .tab { flex: 1; padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 500; border: none; background: transparent; color: var(--color-text-secondary, #6b7280); cursor: pointer; border-radius: var(--radius-md, 0.375rem); transition: all 150ms; }
        .tab:hover { color: var(--color-text, #111827); }
        .tab.active { background: var(--color-surface, #fff); color: var(--color-primary-600, #2563eb); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }

        .content-layout { display: grid; grid-template-columns: 300px 1fr; gap: 1.5rem; }

        .study-list { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e5e7eb); border-radius: var(--radius-lg, 0.5rem); overflow: hidden; max-height: calc(100vh - 250px); overflow-y: auto; }
        .list-header { padding: 1rem; border-bottom: 1px solid var(--color-border, #e5e7eb); font-weight: 600; color: var(--color-text, #111827); position: sticky; top: 0; background: var(--color-surface, #fff); }

        .study-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; cursor: pointer; transition: background 150ms; border-bottom: 1px solid var(--color-border, #e5e7eb); }
        .study-item:last-child { border-bottom: none; }
        .study-item:hover { background: var(--color-gray-50, #f9fafb); }
        .study-item.selected { background: var(--color-primary-50, #eff6ff); }
        .study-indicator { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .study-info { flex: 1; min-width: 0; }
        .study-id { font-size: 0.875rem; font-weight: 500; color: var(--color-text, #111827); }
        .study-title { font-size: 0.75rem; color: var(--color-text-secondary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .study-progress { display: flex; gap: 2px; }
        .mini-indicator { width: 8px; height: 8px; border-radius: 2px; }

        .form-panel { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e5e7eb); border-radius: var(--radius-lg, 0.5rem); padding: 1.5rem; max-height: calc(100vh - 250px); overflow-y: auto; }

        .form-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border, #e5e7eb); }
        .form-header h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
        .study-title-small { font-size: 0.8rem; color: var(--color-text-secondary, #6b7280); margin-top: 0.25rem; max-width: 400px; }
        .overall-badge { padding: 0.25rem 0.75rem; border-radius: 1rem; color: white; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }

        /* RoB Domain Sections */
        .rob-domain { border: 1px solid var(--color-border, #e5e7eb); border-radius: var(--radius-md, 0.375rem); margin-bottom: 0.75rem; overflow: hidden; }
        .rob-domain .domain-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; cursor: pointer; background: var(--color-gray-50, #f9fafb); }
        .rob-domain .domain-header:hover { background: var(--color-gray-100, #f3f4f6); }
        .domain-indicator { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .domain-title-group { flex: 1; }
        .domain-label { font-weight: 600; font-size: 0.875rem; color: var(--color-text, #111827); }
        .domain-status { font-size: 0.75rem; color: var(--color-text-secondary, #6b7280); }
        .expand-icon { font-size: 1.25rem; color: var(--color-text-secondary); font-weight: bold; }

        .domain-content { padding: 1rem; border-top: 1px solid var(--color-border, #e5e7eb); }
        .signaling-questions h4, .domain-judgment-section h4 { margin: 0 0 0.75rem 0; font-size: 0.8125rem; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }

        .signaling-question { margin-bottom: 0.75rem; padding: 0.75rem; background: var(--color-gray-50, #f9fafb); border-radius: var(--radius-md, 0.375rem); border-left: 3px solid var(--color-gray-300); }
        .signaling-question.good { border-left-color: ${ROB_COLORS.low}; background: rgba(34, 197, 94, 0.05); }
        .signaling-question.bad { border-left-color: ${ROB_COLORS.high}; background: rgba(239, 68, 68, 0.05); }
        .question-text { font-size: 0.8125rem; color: var(--color-text, #111827); margin-bottom: 0.5rem; line-height: 1.4; }
        .answer-buttons { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .answer-btn { padding: 0.25rem 0.5rem; font-size: 0.75rem; font-weight: 500; border: 1px solid var(--color-border, #d1d5db); background: var(--color-surface, #fff); border-radius: var(--radius-sm, 0.25rem); cursor: pointer; transition: all 150ms; }
        .answer-btn:hover { border-color: var(--color-primary-300); }
        .answer-btn.active { background: var(--color-primary-600); border-color: var(--color-primary-600); color: white; }

        .domain-judgment-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border, #e5e7eb); }
        .judgment-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .btn-auto-judge { padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--color-primary-50); border: 1px solid var(--color-primary-200); color: var(--color-primary-700); border-radius: var(--radius-sm); cursor: pointer; }
        .btn-auto-judge:hover { background: var(--color-primary-100); }

        .judgment-buttons { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
        .judgment-btn { flex: 1; padding: 0.5rem 1rem; border: 2px solid var(--color-border, #e5e7eb); background: var(--color-surface, #fff); border-radius: var(--radius-md, 0.375rem); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 150ms; }
        .judgment-btn:hover { border-color: var(--jc); }
        .judgment-btn.active { background: var(--jc); border-color: var(--jc); color: white; }

        .domain-notes, .grade-notes { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border, #d1d5db); border-radius: var(--radius-md, 0.375rem); font-size: 0.8125rem; font-family: inherit; resize: vertical; min-height: 50px; box-sizing: border-box; }

        /* GRADE Form */
        .grade-form { }
        .grade-domain { margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--color-border, #e5e7eb); }
        .grade-domain:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
        .domain-header-grade { margin-bottom: 0.75rem; }
        .domain-title { font-weight: 600; color: var(--color-text, #111827); margin-bottom: 0.25rem; }
        .domain-desc { font-size: 0.8125rem; color: var(--color-text-secondary, #6b7280); }

        .grade-criteria { margin-bottom: 0.75rem; font-size: 0.75rem; color: var(--color-text-secondary); }
        .criterion { padding: 0.25rem 0; }
        .criterion.selected { color: var(--color-text); font-weight: 500; }

        .rating-buttons { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
        .rating-btn { flex: 1; padding: 0.5rem 1rem; border: 2px solid var(--color-border, #e5e7eb); background: var(--color-surface, #fff); border-radius: var(--radius-md, 0.375rem); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 150ms; }
        .rating-btn:hover { border-color: var(--color-primary-300); }
        .rating-btn.ok.active { background: ${ROB_COLORS.low}; border-color: ${ROB_COLORS.low}; color: white; }
        .rating-btn.serious.active { background: ${ROB_COLORS.some}; border-color: ${ROB_COLORS.some}; color: white; }
        .rating-btn.very-serious.active { background: ${ROB_COLORS.high}; border-color: ${ROB_COLORS.high}; color: white; }

        .overall-grade { margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid var(--color-border, #e5e7eb); }
        .overall-grade h4 { margin: 0 0 1rem 0; font-size: 1rem; font-weight: 600; }
        .grade-levels { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
        .grade-level-btn { padding: 1rem; border: 2px solid var(--color-border, #e5e7eb); background: var(--color-surface, #fff); border-radius: var(--radius-lg, 0.5rem); cursor: pointer; transition: all 150ms; text-align: center; }
        .grade-level-btn:hover { border-color: var(--color-primary-300); }
        .grade-level-btn.active { border-color: var(--color-primary-500); background: var(--color-primary-50); }
        .grade-stars { font-size: 1.25rem; color: var(--color-warning-500, #f59e0b); margin-bottom: 0.5rem; }
        .grade-stars.large { font-size: 2rem; }
        .grade-label { font-weight: 600; color: var(--color-text, #111827); }
        .grade-label.large { font-size: 1.25rem; margin-bottom: 0.5rem; }
        .grade-desc { font-size: 0.7rem; color: var(--color-text-secondary, #6b7280); margin-top: 0.25rem; }

        .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500; font-family: inherit; border-radius: var(--radius-md, 0.375rem); cursor: pointer; transition: all 150ms; }
        .btn-secondary { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #d1d5db); color: var(--color-text, #111827); }
        .btn-secondary:hover { background: var(--color-gray-50, #f9fafb); }

        /* Summary */
        .summary-section { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        .summary-card { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e5e7eb); border-radius: var(--radius-lg, 0.5rem); padding: 1.5rem; }
        .summary-card h3 { margin: 0 0 1rem 0; font-size: 1rem; font-weight: 600; }
        .rob-counts { display: flex; gap: 1.5rem; margin-top: 1rem; }
        .count-item { text-align: center; }
        .count-item .count { font-size: 1.5rem; font-weight: 700; }
        .count-item .label { font-size: 0.75rem; color: var(--color-text-secondary); display: block; }

        .traffic-light-plot { font-size: 0.75rem; overflow-x: auto; }
        .tl-header { display: flex; gap: 2px; margin-bottom: 2px; }
        .tl-corner { width: 90px; flex-shrink: 0; }
        .tl-domain-label { width: 28px; text-align: center; font-weight: 500; color: var(--color-text-secondary); flex-shrink: 0; }
        .tl-row { display: flex; gap: 2px; margin-bottom: 2px; }
        .tl-study-label { width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-text-secondary); flex-shrink: 0; }
        .tl-cell { width: 28px; height: 18px; border-radius: 2px; flex-shrink: 0; }
        .tl-cell.overall { border: 2px solid rgba(0,0,0,0.2); }

        .grade-display { text-align: center; padding: 1rem 0; }
        .grade-breakdown { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border); }
        .breakdown-item { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); }
        .breakdown-item:last-child { border-bottom: none; }
        .breakdown-label { font-size: 0.875rem; color: var(--color-text); }
        .breakdown-rating { font-size: 0.875rem; font-weight: 500; }
        .breakdown-rating.ok { color: ${ROB_COLORS.low}; }
        .breakdown-rating.downgrade { color: ${ROB_COLORS.high}; }

        .empty-state { text-align: center; padding: 4rem 2rem; background: var(--color-surface, #fff); border: 2px dashed var(--color-border, #e5e7eb); border-radius: var(--radius-lg, 0.5rem); }
        .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
        .empty-title { font-size: 1.125rem; font-weight: 600; color: var(--color-text, #111827); margin-bottom: 0.5rem; }
        .empty-text { color: var(--color-text-secondary, #6b7280); }
        .empty-message { padding: 2rem; text-align: center; color: var(--color-text-secondary); }
      </style>

      <div class="page-header">
        <div>
          <h1 class="page-title">Evidence Integrity Monitor</h1>
          ${this._project ? `<div class="project-name">${this._project.name}</div>` : ''}
        </div>
      </div>

      ${this._studies.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🛡️</div>
          <h2 class="empty-title">No studies to assess</h2>
          <p class="empty-text">Complete data extraction first to assess evidence quality.</p>
          <a href="#/extraction?project=${this._project?.id}" class="btn btn-primary" style="margin-top: 1rem; display: inline-flex; padding: 0.75rem 1.5rem; background: var(--color-primary-600); color: white; border-radius: 0.375rem; text-decoration: none;">Go to Extraction</a>
        </div>
      ` : `
        <div class="tabs">
          <button class="tab ${this._activeTab === 'rob' ? 'active' : ''}" data-action="switch-tab" data-tab="rob">
            Risk of Bias (RoB2)
          </button>
          <button class="tab ${this._activeTab === 'grade' ? 'active' : ''}" data-action="switch-tab" data-tab="grade">
            GRADE Assessment
          </button>
          <button class="tab ${this._activeTab === 'summary' ? 'active' : ''}" data-action="switch-tab" data-tab="summary">
            Summary
          </button>
        </div>

        ${this._activeTab === 'rob' ? `
          <div class="content-layout">
            <div class="study-list">
              <div class="list-header">Studies (${this._studies.length})</div>
              ${this._renderStudyList()}
            </div>
            <div class="form-panel">
              ${this._renderRobForm()}
            </div>
          </div>
        ` : this._activeTab === 'grade' ? `
          <div class="form-panel" style="max-width: 900px;">
            ${this._renderGradeForm()}
          </div>
        ` : `
          ${this._renderSummary()}
        `}
      `}
    `;
  }
}

customElements.define('eim-page', EIMPage);

export default EIMPage;
