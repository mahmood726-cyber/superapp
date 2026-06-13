/**
 * Extraction Form Component
 * Living Meta-Analysis Platform
 *
 * Comprehensive form for extracting outcome data from studies
 * Supports binary, continuous, and time-to-event outcomes
 * With multi-arm trial support and full validation
 */

class ExtractionForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._record = null;
    this._errors = {};
    this._data = this._getDefaultData();
  }

  _getDefaultData() {
    return {
      outcomeType: 'binary', // binary, continuous, time-to-event
      effectMeasure: 'rr', // rr, or, rd for binary; smd, md for continuous; hr for time-to-event
      armData: [
        { id: 1, name: 'Intervention', events: '', total: '', mean: '', sd: '', se: '' },
        { id: 2, name: 'Control', events: '', total: '', mean: '', sd: '', se: '' }
      ],
      // For time-to-event, we may have summary data directly
      timeToEvent: {
        hr: '',
        hrLowerCI: '',
        hrUpperCI: '',
        hrSE: '',
        inputMethod: 'ci', // 'ci' or 'se'
        totalEvents: '',
        totalN: ''
      },
      outcome: {
        name: '',
        timepoint: '',
        timepointUnit: 'weeks',
        direction: 'lower_better' // lower_better, higher_better
      },
      analysisType: 'itt', // itt, per_protocol, as_treated
      // For multi-outcome extraction
      outcomes: [],
      notes: '',
      // Calculated values (populated on save)
      calculated: null
    };
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  get record() {
    return this._record;
  }

  set record(val) {
    this._record = val;
    // Pre-fill from existing extraction if available
    if (val?.extraction && Object.keys(val.extraction).length > 0) {
      this._data = this._mergeData(this._getDefaultData(), val.extraction);
    } else {
      this._data = this._getDefaultData();
    }
    this._errors = {};
    this.render();
  }

  _mergeData(defaults, saved) {
    const merged = { ...defaults };
    for (const key of Object.keys(saved)) {
      if (saved[key] !== null && saved[key] !== undefined) {
        if (typeof saved[key] === 'object' && !Array.isArray(saved[key])) {
          merged[key] = { ...defaults[key], ...saved[key] };
        } else {
          merged[key] = saved[key];
        }
      }
    }
    return merged;
  }

  get data() {
    return { ...this._data };
  }

  set data(val) {
    this._data = { ...this._data, ...val };
    this.render();
  }

  _setupEventListeners() {
    this._handleInput = (e) => {
      const { name, value } = e.target;
      this._clearError(name);

      if (name.startsWith('arm-')) {
        const [, armIndex, field] = name.split('-');
        const idx = parseInt(armIndex);
        if (this._data.armData[idx]) {
          this._data.armData[idx][field] = value;
        }
      } else if (name.startsWith('outcome-')) {
        const field = name.replace('outcome-', '');
        this._data.outcome[field] = value;
      } else if (name.startsWith('tte-')) {
        const field = name.replace('tte-', '');
        this._data.timeToEvent[field] = value;
      } else {
        this._data[name] = value;
      }

      // Update effect preview
      this._updateEffectPreview();
    };

    this._handleTypeChange = (e) => {
      this._data.outcomeType = e.target.value;
      // Set default effect measure for the type
      if (e.target.value === 'binary') {
        this._data.effectMeasure = 'rr';
      } else if (e.target.value === 'continuous') {
        this._data.effectMeasure = 'smd';
      } else {
        this._data.effectMeasure = 'hr';
      }
      this._errors = {};
      this.render();
    };

    this._handleMeasureChange = (e) => {
      this._data.effectMeasure = e.target.value;
      this._updateEffectPreview();
    };

    this._handleInputMethodChange = (e) => {
      this._data.timeToEvent.inputMethod = e.target.value;
      this.render();
    };

    this._handleAddArm = () => {
      const maxId = Math.max(...this._data.armData.map(a => a.id), 0);
      this._data.armData.push({
        id: maxId + 1,
        name: `Arm ${this._data.armData.length + 1}`,
        events: '',
        total: '',
        mean: '',
        sd: '',
        se: ''
      });
      this.render();
    };

    this._handleRemoveArm = (e) => {
      const armId = parseInt(e.target.dataset.armId);
      if (this._data.armData.length > 2) {
        this._data.armData = this._data.armData.filter(a => a.id !== armId);
        this.render();
      }
    };

    this._handleSave = () => {
      if (!this._validate()) return;

      // Calculate effect sizes
      const calculated = this._calculateEffect();
      this._data.calculated = calculated;

      this.dispatchEvent(new CustomEvent('save', {
        detail: { recordId: this._record?.id, data: this.data },
        bubbles: true
      }));
    };

    this._handleSkip = () => {
      this.dispatchEvent(new CustomEvent('skip', {
        detail: { recordId: this._record?.id },
        bubbles: true
      }));
    };

    // Attach listeners
    this.shadowRoot.addEventListener('input', this._handleInput);
    this.shadowRoot.addEventListener('change', this._handleInput);

    const typeSelect = this.shadowRoot.querySelector('#outcome-type');
    const measureSelect = this.shadowRoot.querySelector('#effect-measure');
    const inputMethodRadios = this.shadowRoot.querySelectorAll('input[name="tte-inputMethod"]');
    const saveBtn = this.shadowRoot.querySelector('#save-btn');
    const skipBtn = this.shadowRoot.querySelector('#skip-btn');
    const addArmBtn = this.shadowRoot.querySelector('#add-arm-btn');
    const removeArmBtns = this.shadowRoot.querySelectorAll('.remove-arm-btn');

    typeSelect?.addEventListener('change', this._handleTypeChange);
    measureSelect?.addEventListener('change', this._handleMeasureChange);
    inputMethodRadios.forEach(r => r.addEventListener('change', this._handleInputMethodChange));
    saveBtn?.addEventListener('click', this._handleSave);
    skipBtn?.addEventListener('click', this._handleSkip);
    addArmBtn?.addEventListener('click', this._handleAddArm);
    removeArmBtns.forEach(btn => btn.addEventListener('click', this._handleRemoveArm));
  }

  _removeEventListeners() {
    this.shadowRoot.removeEventListener('input', this._handleInput);
    this.shadowRoot.removeEventListener('change', this._handleInput);
  }

  _clearError(fieldName) {
    delete this._errors[fieldName];
  }

  _setError(fieldName, message) {
    this._errors[fieldName] = message;
  }

  _validate() {
    this._errors = {};
    const type = this._data.outcomeType;
    const measure = this._data.effectMeasure;
    let valid = true;

    // Outcome name required
    if (!this._data.outcome.name?.trim()) {
      this._setError('outcome-name', 'Outcome name is required');
      valid = false;
    }

    if (type === 'binary') {
      // Validate binary data for each arm
      for (let i = 0; i < this._data.armData.length; i++) {
        const arm = this._data.armData[i];
        const events = parseFloat(arm.events);
        const total = parseFloat(arm.total);

        if (isNaN(events) || events < 0) {
          this._setError(`arm-${i}-events`, 'Events must be a non-negative number');
          valid = false;
        }
        if (isNaN(total) || total < 1) {
          this._setError(`arm-${i}-total`, 'Total must be at least 1');
          valid = false;
        }
        if (!isNaN(events) && !isNaN(total) && events > total) {
          this._setError(`arm-${i}-events`, 'Events cannot exceed total');
          valid = false;
        }
        // Check for zero cells (warn but allow with continuity correction)
        if (events === 0 || events === total) {
          // Will apply continuity correction - this is a warning, not error
        }
      }
    } else if (type === 'continuous') {
      // Validate continuous data for each arm
      for (let i = 0; i < this._data.armData.length; i++) {
        const arm = this._data.armData[i];
        const mean = parseFloat(arm.mean);
        const sd = parseFloat(arm.sd);
        const n = parseFloat(arm.total);

        if (isNaN(mean)) {
          this._setError(`arm-${i}-mean`, 'Mean is required');
          valid = false;
        }
        if (isNaN(sd) || sd <= 0) {
          this._setError(`arm-${i}-sd`, 'SD must be positive');
          valid = false;
        }
        if (isNaN(n) || n < 1) {
          this._setError(`arm-${i}-total`, 'n must be at least 1');
          valid = false;
        }
      }
    } else if (type === 'time-to-event') {
      const tte = this._data.timeToEvent;
      const hr = parseFloat(tte.hr);

      if (isNaN(hr) || hr <= 0) {
        this._setError('tte-hr', 'Hazard ratio must be positive');
        valid = false;
      }

      if (tte.inputMethod === 'ci') {
        const lower = parseFloat(tte.hrLowerCI);
        const upper = parseFloat(tte.hrUpperCI);

        if (isNaN(lower) || lower <= 0) {
          this._setError('tte-hrLowerCI', 'Lower CI must be positive');
          valid = false;
        }
        if (isNaN(upper) || upper <= 0) {
          this._setError('tte-hrUpperCI', 'Upper CI must be positive');
          valid = false;
        }
        if (!isNaN(lower) && !isNaN(upper) && lower >= upper) {
          this._setError('tte-hrLowerCI', 'Lower CI must be less than upper');
          valid = false;
        }
        if (!isNaN(hr) && !isNaN(lower) && !isNaN(upper)) {
          if (hr < lower || hr > upper) {
            this._setError('tte-hr', 'HR must be within CI bounds');
            valid = false;
          }
        }
      } else {
        const se = parseFloat(tte.hrSE);
        if (isNaN(se) || se <= 0) {
          this._setError('tte-hrSE', 'SE must be positive');
          valid = false;
        }
      }
    }

    if (!valid) {
      this.render();
    }

    return valid;
  }

  _updateEffectPreview() {
    const preview = this.shadowRoot.querySelector('.effect-preview');
    if (preview) {
      const effect = this._calculateEffect();
      if (effect) {
        preview.innerHTML = this._renderEffectPreview(effect);
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    }
  }

  _calculateEffect() {
    const type = this._data.outcomeType;
    const measure = this._data.effectMeasure;

    if (type === 'binary') {
      return this._calculateBinaryEffect();
    } else if (type === 'continuous') {
      return this._calculateContinuousEffect();
    } else if (type === 'time-to-event') {
      return this._calculateTTEEffect();
    }

    return null;
  }

  _calculateBinaryEffect() {
    const arms = this._data.armData;
    const measure = this._data.effectMeasure;

    // For pairwise: arm 0 = intervention, arm 1 = control
    const arm1 = arms[0];
    const arm2 = arms[1];

    let e1 = parseFloat(arm1.events);
    let n1 = parseFloat(arm1.total);
    let e2 = parseFloat(arm2.events);
    let n2 = parseFloat(arm2.total);

    if (isNaN(e1) || isNaN(n1) || isNaN(e2) || isNaN(n2)) return null;
    if (n1 < 1 || n2 < 1) return null;

    // Apply continuity correction for zero cells (TACC method)
    const hasZero = (e1 === 0 || e2 === 0 || e1 === n1 || e2 === n2);
    let correctionApplied = false;
    let correctionMethod = '';

    if (hasZero) {
      // Treatment Arm Continuity Correction (Sweeting et al. 2004)
      const R = n1 / n2;
      const k = 1 / (R + 1);
      e1 += k;
      n1 += 2 * k;
      e2 += (1 - k);
      n2 += 2 * (1 - k);
      correctionApplied = true;
      correctionMethod = 'TACC';
    }

    const p1 = e1 / n1;
    const p2 = e2 / n2;

    let effect, se, effectLabel, effectDisplay;

    if (measure === 'rr') {
      // Risk Ratio (log scale)
      if (p2 <= 0 || p1 <= 0) return null;
      const rr = p1 / p2;
      effect = Math.log(rr);
      se = Math.sqrt((1 / e1) - (1 / n1) + (1 / e2) - (1 / n2));
      effectLabel = 'log(RR)';
      effectDisplay = `RR = ${rr.toFixed(3)} [${Math.exp(effect - 1.96 * se).toFixed(3)}, ${Math.exp(effect + 1.96 * se).toFixed(3)}]`;
    } else if (measure === 'or') {
      // Odds Ratio (log scale)
      const odds1 = e1 / (n1 - e1);
      const odds2 = e2 / (n2 - e2);
      if (odds1 <= 0 || odds2 <= 0) return null;
      const or = odds1 / odds2;
      effect = Math.log(or);
      se = Math.sqrt((1 / e1) + (1 / (n1 - e1)) + (1 / e2) + (1 / (n2 - e2)));
      effectLabel = 'log(OR)';
      effectDisplay = `OR = ${or.toFixed(3)} [${Math.exp(effect - 1.96 * se).toFixed(3)}, ${Math.exp(effect + 1.96 * se).toFixed(3)}]`;
    } else if (measure === 'rd') {
      // Risk Difference
      effect = p1 - p2;
      se = Math.sqrt((p1 * (1 - p1) / n1) + (p2 * (1 - p2) / n2));
      effectLabel = 'RD';
      effectDisplay = `RD = ${(effect * 100).toFixed(1)}% [${((effect - 1.96 * se) * 100).toFixed(1)}%, ${((effect + 1.96 * se) * 100).toFixed(1)}%]`;
    }

    // Calculate NNT if RD
    let nnt = null;
    if (measure === 'rd' && effect !== 0) {
      nnt = Math.abs(1 / effect);
    }

    return {
      effect: effect.toFixed(4),
      se: se.toFixed(4),
      measure: effectLabel,
      display: effectDisplay,
      correctionApplied,
      correctionMethod,
      nnt: nnt ? nnt.toFixed(1) : null,
      // Store raw data for multi-arm analyses
      rawData: this._data.armData.map(a => ({
        name: a.name,
        events: parseFloat(a.events),
        total: parseFloat(a.total)
      }))
    };
  }

  _calculateContinuousEffect() {
    const arms = this._data.armData;
    const measure = this._data.effectMeasure;

    const arm1 = arms[0];
    const arm2 = arms[1];

    const m1 = parseFloat(arm1.mean);
    const sd1 = parseFloat(arm1.sd);
    const n1 = parseFloat(arm1.total);
    const m2 = parseFloat(arm2.mean);
    const sd2 = parseFloat(arm2.sd);
    const n2 = parseFloat(arm2.total);

    if (isNaN(m1) || isNaN(sd1) || isNaN(n1) || isNaN(m2) || isNaN(sd2) || isNaN(n2)) return null;
    if (sd1 <= 0 || sd2 <= 0 || n1 < 1 || n2 < 1) return null;

    let effect, se, effectLabel, effectDisplay;

    if (measure === 'md') {
      // Mean Difference
      effect = m1 - m2;
      se = Math.sqrt((sd1 * sd1 / n1) + (sd2 * sd2 / n2));
      effectLabel = 'MD';
      effectDisplay = `MD = ${effect.toFixed(3)} [${(effect - 1.96 * se).toFixed(3)}, ${(effect + 1.96 * se).toFixed(3)}]`;
    } else {
      // Standardized Mean Difference (Hedges' g with small sample correction)
      const df = n1 + n2 - 2;
      const pooledVar = ((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / df;
      const pooledSD = Math.sqrt(pooledVar);

      // Cohen's d
      const d = (m1 - m2) / pooledSD;

      // Hedges' correction factor (exact formula)
      const J = 1 - (3 / (4 * df - 1));
      const g = d * J;

      effect = g;
      // Variance of Hedges' g
      se = Math.sqrt((n1 + n2) / (n1 * n2) + (g * g) / (2 * df));

      effectLabel = "Hedges' g";
      effectDisplay = `SMD = ${effect.toFixed(3)} [${(effect - 1.96 * se).toFixed(3)}, ${(effect + 1.96 * se).toFixed(3)}]`;
    }

    return {
      effect: effect.toFixed(4),
      se: se.toFixed(4),
      measure: effectLabel,
      display: effectDisplay,
      rawData: this._data.armData.map(a => ({
        name: a.name,
        mean: parseFloat(a.mean),
        sd: parseFloat(a.sd),
        n: parseFloat(a.total)
      }))
    };
  }

  _calculateTTEEffect() {
    const tte = this._data.timeToEvent;
    const hr = parseFloat(tte.hr);

    if (isNaN(hr) || hr <= 0) return null;

    const logHR = Math.log(hr);
    let se;

    if (tte.inputMethod === 'ci') {
      const lower = parseFloat(tte.hrLowerCI);
      const upper = parseFloat(tte.hrUpperCI);

      if (isNaN(lower) || isNaN(upper) || lower <= 0 || upper <= 0) return null;

      // SE from CI: (log(upper) - log(lower)) / (2 * 1.96)
      se = (Math.log(upper) - Math.log(lower)) / 3.92;
    } else {
      se = parseFloat(tte.hrSE);
      if (isNaN(se) || se <= 0) return null;
    }

    // Calculate 95% CI
    const ciLower = Math.exp(logHR - 1.96 * se);
    const ciUpper = Math.exp(logHR + 1.96 * se);

    return {
      effect: logHR.toFixed(4),
      se: se.toFixed(4),
      measure: 'log(HR)',
      display: `HR = ${hr.toFixed(3)} [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]`,
      hr: hr,
      hrCI: [ciLower, ciUpper],
      totalEvents: (() => { const v = parseFloat(tte.totalEvents); return Number.isFinite(v) ? v : null; })(),
      totalN: (() => { const v = parseFloat(tte.totalN); return Number.isFinite(v) ? v : null; })()
    };
  }

  _renderEffectPreview(effect) {
    if (!effect) return '';

    return `
      <div class="effect-preview-title">Calculated Effect Size</div>
      <div class="effect-value">${effect.display}</div>
      <div class="effect-meta">
        ${effect.measure}: ${effect.effect} (SE: ${effect.se})
        ${effect.correctionApplied ? `<br><span class="correction-note">Continuity correction applied (${effect.correctionMethod})</span>` : ''}
        ${effect.nnt ? `<br>NNT: ${effect.nnt}` : ''}
      </div>
    `;
  }

  _getErrorClass(fieldName) {
    return this._errors[fieldName] ? 'has-error' : '';
  }

  _getErrorMessage(fieldName) {
    return this._errors[fieldName] || '';
  }

  render() {
    const r = this._record;
    const d = this._data;
    const effect = this._calculateEffect();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .extraction-form {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
          overflow: hidden;
        }

        .form-header {
          padding: 1.25rem;
          background: var(--color-gray-50, #f9fafb);
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .study-info {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .nct-id {
          font-family: monospace;
          font-size: 0.875rem;
          color: var(--color-primary-600, #2563eb);
        }

        .study-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0.5rem 0 0 0;
        }

        .form-body {
          padding: 1.5rem;
        }

        .form-section {
          margin-bottom: 1.5rem;
        }

        .section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .form-row-3 {
          grid-template-columns: repeat(3, 1fr);
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

        .form-label .required {
          color: var(--color-danger-500, #ef4444);
        }

        .form-input,
        .form-select,
        .form-textarea {
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
        }

        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          outline: none;
          border-color: var(--color-primary-500, #3b82f6);
          box-shadow: 0 0 0 3px var(--color-primary-100, rgba(59, 130, 246, 0.1));
        }

        .form-input.has-error,
        .form-select.has-error {
          border-color: var(--color-danger-500, #ef4444);
        }

        .form-input.has-error:focus {
          box-shadow: 0 0 0 3px var(--color-danger-100, rgba(239, 68, 68, 0.1));
        }

        .field-error {
          font-size: 0.75rem;
          color: var(--color-danger-600, #dc2626);
          margin-top: 0.25rem;
        }

        .form-textarea {
          min-height: 80px;
          resize: vertical;
        }

        .arm-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .arm-table th {
          text-align: left;
          padding: 0.75rem;
          background: var(--color-gray-50, #f9fafb);
          border: 1px solid var(--color-border, #e5e7eb);
          font-weight: 500;
        }

        .arm-table td {
          padding: 0.5rem;
          border: 1px solid var(--color-border, #e5e7eb);
          vertical-align: top;
        }

        .arm-table input {
          width: 100%;
          padding: 0.5rem;
          font-size: 0.875rem;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          box-sizing: border-box;
        }

        .arm-table input:focus {
          outline: none;
          border-color: var(--color-primary-500, #3b82f6);
        }

        .arm-table input.has-error {
          border-color: var(--color-danger-500, #ef4444);
        }

        .arm-table .cell-error {
          font-size: 0.7rem;
          color: var(--color-danger-600, #dc2626);
          margin-top: 0.25rem;
        }

        .add-arm-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          background: var(--color-gray-100, #f3f4f6);
          border: 1px dashed var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          color: var(--color-text-secondary, #6b7280);
          cursor: pointer;
          margin-top: 0.75rem;
        }

        .add-arm-btn:hover {
          background: var(--color-gray-200, #e5e7eb);
          color: var(--color-text, #111827);
        }

        .remove-arm-btn {
          padding: 0.25rem;
          background: transparent;
          border: none;
          color: var(--color-danger-500, #ef4444);
          cursor: pointer;
          opacity: 0.6;
        }

        .remove-arm-btn:hover {
          opacity: 1;
        }

        .radio-group {
          display: flex;
          gap: 1.5rem;
        }

        .radio-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: var(--color-text, #111827);
          cursor: pointer;
        }

        .radio-label input {
          width: 1rem;
          height: 1rem;
        }

        .effect-preview {
          padding: 1rem;
          background: var(--color-primary-50, #eff6ff);
          border: 1px solid var(--color-primary-200, #bfdbfe);
          border-radius: var(--radius-md, 0.375rem);
          margin-top: 1rem;
        }

        .effect-preview-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-primary-700, #1d4ed8);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .effect-value {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-primary-800, #1e40af);
          font-family: monospace;
        }

        .effect-meta {
          font-size: 0.75rem;
          color: var(--color-primary-600, #2563eb);
          margin-top: 0.5rem;
        }

        .correction-note {
          font-style: italic;
          color: var(--color-warning-600, #d97706);
        }

        .info-box {
          padding: 0.75rem 1rem;
          background: var(--color-warning-50, #fffbeb);
          border: 1px solid var(--color-warning-200, #fde68a);
          border-radius: var(--radius-md, 0.375rem);
          font-size: 0.8rem;
          color: var(--color-warning-800, #92400e);
          margin-bottom: 1rem;
        }

        .form-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          background: var(--color-gray-50, #f9fafb);
          border-top: 1px solid var(--color-border, #e5e7eb);
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
        }

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          border: 1px solid var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover {
          background: var(--color-primary-700, #1d4ed8);
        }

        .btn-secondary {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          color: var(--color-text, #111827);
        }

        .btn-secondary:hover {
          background: var(--color-gray-50, #f9fafb);
        }

        .help-text {
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.25rem;
        }
      </style>

      <div class="extraction-form">
        <div class="form-header">
          <div class="study-info">
            <div>
              <span class="nct-id">${r?.nctId || 'N/A'}</span>
              <h3 class="study-title">${r?.title || 'Untitled Study'}</h3>
            </div>
          </div>
        </div>

        <div class="form-body">
          <!-- Outcome Type and Measure -->
          <div class="form-section">
            <div class="section-title">Outcome Configuration</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="outcome-type">Data Type <span class="required">*</span></label>
                <select class="form-select" id="outcome-type" name="outcomeType">
                  <option value="binary" ${d.outcomeType === 'binary' ? 'selected' : ''}>Binary (events/total)</option>
                  <option value="continuous" ${d.outcomeType === 'continuous' ? 'selected' : ''}>Continuous (mean/SD)</option>
                  <option value="time-to-event" ${d.outcomeType === 'time-to-event' ? 'selected' : ''}>Time-to-Event (HR)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="effect-measure">Effect Measure</label>
                <select class="form-select" id="effect-measure" name="effectMeasure">
                  ${d.outcomeType === 'binary' ? `
                    <option value="rr" ${d.effectMeasure === 'rr' ? 'selected' : ''}>Risk Ratio (RR)</option>
                    <option value="or" ${d.effectMeasure === 'or' ? 'selected' : ''}>Odds Ratio (OR)</option>
                    <option value="rd" ${d.effectMeasure === 'rd' ? 'selected' : ''}>Risk Difference (RD)</option>
                  ` : d.outcomeType === 'continuous' ? `
                    <option value="smd" ${d.effectMeasure === 'smd' ? 'selected' : ''}>Standardized Mean Difference (Hedges' g)</option>
                    <option value="md" ${d.effectMeasure === 'md' ? 'selected' : ''}>Mean Difference (MD)</option>
                  ` : `
                    <option value="hr" ${d.effectMeasure === 'hr' ? 'selected' : ''}>Hazard Ratio (HR)</option>
                  `}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="outcome-direction">Effect Direction</label>
                <select class="form-select" id="outcome-direction" name="outcome-direction">
                  <option value="lower_better" ${d.outcome.direction === 'lower_better' ? 'selected' : ''}>Lower is Better</option>
                  <option value="higher_better" ${d.outcome.direction === 'higher_better' ? 'selected' : ''}>Higher is Better</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="analysisType">Analysis Population</label>
                <select class="form-select" id="analysisType" name="analysisType">
                  <option value="itt" ${d.analysisType === 'itt' ? 'selected' : ''}>Intention-to-Treat (ITT)</option>
                  <option value="per_protocol" ${d.analysisType === 'per_protocol' ? 'selected' : ''}>Per-Protocol</option>
                  <option value="as_treated" ${d.analysisType === 'as_treated' ? 'selected' : ''}>As Treated</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Outcome Details -->
          <div class="form-section">
            <div class="section-title">Outcome Details</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="outcome-name">Outcome Name <span class="required">*</span></label>
                <input
                  type="text"
                  class="form-input ${this._getErrorClass('outcome-name')}"
                  id="outcome-name"
                  name="outcome-name"
                  value="${d.outcome.name}"
                  placeholder="e.g., All-cause mortality"
                >
                ${this._errors['outcome-name'] ? `<div class="field-error">${this._errors['outcome-name']}</div>` : ''}
              </div>
              <div class="form-group">
                <label class="form-label" for="outcome-timepoint">Timepoint</label>
                <div style="display: flex; gap: 0.5rem;">
                  <input
                    type="text"
                    class="form-input"
                    id="outcome-timepoint"
                    name="outcome-timepoint"
                    value="${d.outcome.timepoint}"
                    placeholder="e.g., 12"
                    style="flex: 1;"
                  >
                  <select class="form-select" name="outcome-timepointUnit" style="width: 100px;">
                    <option value="days" ${d.outcome.timepointUnit === 'days' ? 'selected' : ''}>Days</option>
                    <option value="weeks" ${d.outcome.timepointUnit === 'weeks' ? 'selected' : ''}>Weeks</option>
                    <option value="months" ${d.outcome.timepointUnit === 'months' ? 'selected' : ''}>Months</option>
                    <option value="years" ${d.outcome.timepointUnit === 'years' ? 'selected' : ''}>Years</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Arm Data -->
          <div class="form-section">
            <div class="section-title">
              ${d.outcomeType === 'time-to-event' ? 'Hazard Ratio Data' : 'Arm Data'}
            </div>

            ${d.outcomeType === 'time-to-event' ? this._renderTimeToEventForm() : this._renderArmDataTable()}

            ${effect ? `
              <div class="effect-preview">
                ${this._renderEffectPreview(effect)}
              </div>
            ` : ''}
          </div>

          <!-- Notes -->
          <div class="form-section">
            <div class="section-title">Notes</div>
            <div class="form-group">
              <textarea
                class="form-textarea"
                name="notes"
                placeholder="Any additional notes about the extraction (e.g., data sources, calculations, concerns)..."
              >${d.notes}</textarea>
            </div>
          </div>
        </div>

        <div class="form-footer">
          <button class="btn btn-secondary" id="skip-btn">Skip for Now</button>
          <button class="btn btn-primary" id="save-btn">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            Save Extraction
          </button>
        </div>
      </div>
    `;

    // Re-attach event listeners
    this._setupEventListeners();
  }

  _renderArmDataTable() {
    const d = this._data;
    const type = d.outcomeType;
    const canRemoveArms = d.armData.length > 2;

    if (type === 'binary') {
      return `
        <table class="arm-table">
          <thead>
            <tr>
              <th style="width: 35%;">Arm Name</th>
              <th>Events</th>
              <th>Total (n)</th>
              ${canRemoveArms ? '<th style="width: 40px;"></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${d.armData.map((arm, i) => `
              <tr>
                <td>
                  <input type="text" name="arm-${i}-name" value="${arm.name}" placeholder="Arm name">
                </td>
                <td>
                  <input
                    type="number"
                    name="arm-${i}-events"
                    value="${arm.events}"
                    placeholder="Events"
                    min="0"
                    class="${this._getErrorClass(`arm-${i}-events`)}"
                  >
                  ${this._errors[`arm-${i}-events`] ? `<div class="cell-error">${this._errors[`arm-${i}-events`]}</div>` : ''}
                </td>
                <td>
                  <input
                    type="number"
                    name="arm-${i}-total"
                    value="${arm.total}"
                    placeholder="Total n"
                    min="1"
                    class="${this._getErrorClass(`arm-${i}-total`)}"
                  >
                  ${this._errors[`arm-${i}-total`] ? `<div class="cell-error">${this._errors[`arm-${i}-total`]}</div>` : ''}
                </td>
                ${canRemoveArms ? `
                  <td>
                    <button class="remove-arm-btn" data-arm-id="${arm.id}" title="Remove arm">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                      </svg>
                    </button>
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
        <button class="add-arm-btn" id="add-arm-btn">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
          </svg>
          Add Arm (Multi-arm Trial)
        </button>
        ${d.armData.length > 2 ? `
          <div class="info-box">
            Multi-arm trial: ${d.armData.length} arms detected. For meta-analysis, the first arm (${d.armData[0].name}) will be compared against each other arm separately using shared control adjustment.
          </div>
        ` : ''}
      `;
    } else if (type === 'continuous') {
      return `
        <table class="arm-table">
          <thead>
            <tr>
              <th style="width: 30%;">Arm Name</th>
              <th>Mean</th>
              <th>SD</th>
              <th>n</th>
              ${canRemoveArms ? '<th style="width: 40px;"></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${d.armData.map((arm, i) => `
              <tr>
                <td>
                  <input type="text" name="arm-${i}-name" value="${arm.name}" placeholder="Arm name">
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    name="arm-${i}-mean"
                    value="${arm.mean}"
                    placeholder="Mean"
                    class="${this._getErrorClass(`arm-${i}-mean`)}"
                  >
                  ${this._errors[`arm-${i}-mean`] ? `<div class="cell-error">${this._errors[`arm-${i}-mean`]}</div>` : ''}
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    name="arm-${i}-sd"
                    value="${arm.sd}"
                    placeholder="SD"
                    min="0"
                    class="${this._getErrorClass(`arm-${i}-sd`)}"
                  >
                  ${this._errors[`arm-${i}-sd`] ? `<div class="cell-error">${this._errors[`arm-${i}-sd`]}</div>` : ''}
                </td>
                <td>
                  <input
                    type="number"
                    name="arm-${i}-total"
                    value="${arm.total}"
                    placeholder="n"
                    min="1"
                    class="${this._getErrorClass(`arm-${i}-total`)}"
                  >
                  ${this._errors[`arm-${i}-total`] ? `<div class="cell-error">${this._errors[`arm-${i}-total`]}</div>` : ''}
                </td>
                ${canRemoveArms ? `
                  <td>
                    <button class="remove-arm-btn" data-arm-id="${arm.id}" title="Remove arm">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                      </svg>
                    </button>
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
        <button class="add-arm-btn" id="add-arm-btn">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
          </svg>
          Add Arm (Multi-arm Trial)
        </button>
        ${d.armData.length > 2 ? `
          <div class="info-box">
            Multi-arm trial: ${d.armData.length} arms detected. For meta-analysis, the first arm (${d.armData[0].name}) will be compared against each other arm separately.
          </div>
        ` : ''}
      `;
    }

    return '';
  }

  _renderTimeToEventForm() {
    const tte = this._data.timeToEvent;

    return `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Input Method</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="tte-inputMethod" value="ci" ${tte.inputMethod === 'ci' ? 'checked' : ''}>
              HR with 95% CI
            </label>
            <label class="radio-label">
              <input type="radio" name="tte-inputMethod" value="se" ${tte.inputMethod === 'se' ? 'checked' : ''}>
              HR with SE
            </label>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="tte-hr">Hazard Ratio (HR) <span class="required">*</span></label>
          <input
            type="number"
            step="any"
            class="form-input ${this._getErrorClass('tte-hr')}"
            id="tte-hr"
            name="tte-hr"
            value="${tte.hr}"
            placeholder="e.g., 0.75"
            min="0"
          >
          ${this._errors['tte-hr'] ? `<div class="field-error">${this._errors['tte-hr']}</div>` : ''}
        </div>

        ${tte.inputMethod === 'ci' ? `
          <div class="form-group">
            <label class="form-label" for="tte-hrLowerCI">95% CI Lower <span class="required">*</span></label>
            <input
              type="number"
              step="any"
              class="form-input ${this._getErrorClass('tte-hrLowerCI')}"
              id="tte-hrLowerCI"
              name="tte-hrLowerCI"
              value="${tte.hrLowerCI}"
              placeholder="e.g., 0.60"
              min="0"
            >
            ${this._errors['tte-hrLowerCI'] ? `<div class="field-error">${this._errors['tte-hrLowerCI']}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label" for="tte-hrUpperCI">95% CI Upper <span class="required">*</span></label>
            <input
              type="number"
              step="any"
              class="form-input ${this._getErrorClass('tte-hrUpperCI')}"
              id="tte-hrUpperCI"
              name="tte-hrUpperCI"
              value="${tte.hrUpperCI}"
              placeholder="e.g., 0.95"
              min="0"
            >
            ${this._errors['tte-hrUpperCI'] ? `<div class="field-error">${this._errors['tte-hrUpperCI']}</div>` : ''}
          </div>
        ` : `
          <div class="form-group">
            <label class="form-label" for="tte-hrSE">SE of log(HR) <span class="required">*</span></label>
            <input
              type="number"
              step="any"
              class="form-input ${this._getErrorClass('tte-hrSE')}"
              id="tte-hrSE"
              name="tte-hrSE"
              value="${tte.hrSE}"
              placeholder="e.g., 0.15"
              min="0"
            >
            ${this._errors['tte-hrSE'] ? `<div class="field-error">${this._errors['tte-hrSE']}</div>` : ''}
            <div class="help-text">Standard error on the log scale</div>
          </div>
        `}
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="tte-totalEvents">Total Events (optional)</label>
          <input
            type="number"
            class="form-input"
            id="tte-totalEvents"
            name="tte-totalEvents"
            value="${tte.totalEvents}"
            placeholder="e.g., 150"
            min="0"
          >
          <div class="help-text">Combined events across arms</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="tte-totalN">Total N (optional)</label>
          <input
            type="number"
            class="form-input"
            id="tte-totalN"
            name="tte-totalN"
            value="${tte.totalN}"
            placeholder="e.g., 500"
            min="1"
          >
          <div class="help-text">Combined sample size</div>
        </div>
      </div>
    `;
  }
}

customElements.define('extraction-form', ExtractionForm);

export default ExtractionForm;
