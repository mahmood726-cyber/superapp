/**
 * Project Form Component
 * Living Meta-Analysis Platform
 *
 * Form for creating and editing projects
 */

class ProjectForm extends HTMLElement {
  static get observedAttributes() {
    return ['mode'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = {
      name: '',
      description: '',
      pico: {
        population: '',
        intervention: '',
        comparator: '',
        outcome: ''
      },
      protocol: ''
    };
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  get mode() {
    return this.getAttribute('mode') || 'create';
  }

  set mode(val) {
    this.setAttribute('mode', val);
  }

  get project() {
    return { ...this._project };
  }

  set project(val) {
    this._project = {
      name: val?.name || '',
      description: val?.description || '',
      pico: {
        population: val?.pico?.population || '',
        intervention: val?.pico?.intervention || '',
        comparator: val?.pico?.comparator || '',
        outcome: val?.pico?.outcome || ''
      },
      protocol: val?.protocol || ''
    };
    if (val?.id) {
      this._project.id = val.id;
    }
    this.render();
  }

  _setupEventListeners() {
    this._handleInput = (e) => {
      const { name, value } = e.target;

      if (name.startsWith('pico.')) {
        const picoField = name.replace('pico.', '');
        this._project.pico[picoField] = value;
      } else {
        this._project[name] = value;
      }
    };

    this._handleSubmit = (e) => {
      e.preventDefault();

      if (!this._validate()) {
        return;
      }

      this.dispatchEvent(new CustomEvent('submit', {
        detail: { project: this.project },
        bubbles: true
      }));
    };

    this._handleCancel = () => {
      this.dispatchEvent(new CustomEvent('cancel', {
        bubbles: true
      }));
    };

    this.shadowRoot.addEventListener('input', this._handleInput);

    const form = this.shadowRoot.querySelector('form');
    const cancelBtn = this.shadowRoot.querySelector('.btn-cancel');

    form?.addEventListener('submit', this._handleSubmit);
    cancelBtn?.addEventListener('click', this._handleCancel);
  }

  _removeEventListeners() {
    this.shadowRoot.removeEventListener('input', this._handleInput);
  }

  _validate() {
    const nameInput = this.shadowRoot.querySelector('#name');

    if (!this._project.name.trim()) {
      nameInput.focus();
      this._showError('Project name is required');
      return false;
    }

    return true;
  }

  _showError(message) {
    const errorEl = this.shadowRoot.querySelector('.form-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  render() {
    const p = this._project;
    const isEdit = this.mode === 'edit';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .form-container {
          max-width: 600px;
        }

        .form-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0 0 1.5rem 0;
        }

        .form-error {
          display: none;
          padding: 0.75rem 1rem;
          background: var(--color-danger-100, #fee2e2);
          color: var(--color-danger-700, #b91c1c);
          border-radius: var(--radius-md, 0.375rem);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .form-section {
          margin-bottom: 2rem;
        }

        .section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text, #111827);
          margin-bottom: 0.375rem;
        }

        .form-label.required::after {
          content: ' *';
          color: var(--color-danger-500, #ef4444);
        }

        .form-hint {
          display: block;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #6b7280);
          margin-top: 0.375rem;
        }

        .form-input,
        .form-textarea {
          width: 100%;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: var(--radius-md, 0.375rem);
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
          transition: border-color 150ms, box-shadow 150ms;
          box-sizing: border-box;
        }

        .form-input:focus,
        .form-textarea:focus {
          outline: none;
          border-color: var(--color-primary-500, #3b82f6);
          box-shadow: 0 0 0 3px var(--color-primary-100, rgba(59, 130, 246, 0.1));
        }

        .form-textarea {
          min-height: 100px;
          resize: vertical;
        }

        .pico-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        @media (max-width: 640px) {
          .pico-grid {
            grid-template-columns: 1fr;
          }
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding-top: 1.5rem;
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

        .btn-secondary {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          color: var(--color-text, #111827);
        }

        .btn-secondary:hover {
          background: var(--color-gray-50, #f9fafb);
        }

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          border: 1px solid var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover {
          background: var(--color-primary-700, #1d4ed8);
        }
      </style>

      <div class="form-container">
        <h2 class="form-title">${isEdit ? 'Edit Project' : 'New Project'}</h2>

        <div class="form-error"></div>

        <form>
          <div class="form-section">
            <div class="section-title">Basic Information</div>

            <div class="form-group">
              <label class="form-label required" for="name">Project Name</label>
              <input
                type="text"
                class="form-input"
                id="name"
                name="name"
                value="${p.name}"
                placeholder="e.g., Metformin vs Placebo in T2DM"
                required
              >
            </div>

            <div class="form-group">
              <label class="form-label" for="description">Description</label>
              <textarea
                class="form-textarea"
                id="description"
                name="description"
                placeholder="Brief description of the meta-analysis..."
              >${p.description}</textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="section-title">PICO Framework</div>
            <p class="form-hint" style="margin-bottom: 1rem; margin-top: -0.5rem;">
              Define your research question using the PICO framework
            </p>

            <div class="pico-grid">
              <div class="form-group">
                <label class="form-label" for="pico-population">Population</label>
                <input
                  type="text"
                  class="form-input"
                  id="pico-population"
                  name="pico.population"
                  value="${p.pico.population}"
                  placeholder="e.g., Adults with Type 2 Diabetes"
                >
              </div>

              <div class="form-group">
                <label class="form-label" for="pico-intervention">Intervention</label>
                <input
                  type="text"
                  class="form-input"
                  id="pico-intervention"
                  name="pico.intervention"
                  value="${p.pico.intervention}"
                  placeholder="e.g., Metformin 1000mg daily"
                >
              </div>

              <div class="form-group">
                <label class="form-label" for="pico-comparator">Comparator</label>
                <input
                  type="text"
                  class="form-input"
                  id="pico-comparator"
                  name="pico.comparator"
                  value="${p.pico.comparator}"
                  placeholder="e.g., Placebo"
                >
              </div>

              <div class="form-group">
                <label class="form-label" for="pico-outcome">Outcome</label>
                <input
                  type="text"
                  class="form-input"
                  id="pico-outcome"
                  name="pico.outcome"
                  value="${p.pico.outcome}"
                  placeholder="e.g., HbA1c reduction at 12 weeks"
                >
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="section-title">Protocol (Optional)</div>

            <div class="form-group">
              <label class="form-label" for="protocol">PROSPERO ID or Protocol URL</label>
              <input
                type="text"
                class="form-input"
                id="protocol"
                name="protocol"
                value="${p.protocol}"
                placeholder="e.g., CRD42023456789"
              >
              <span class="form-hint">Link to registered protocol if available</span>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary btn-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">
              ${isEdit ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    `;

    // Re-attach event listeners
    this._setupEventListeners();
  }
}

customElements.define('project-form', ProjectForm);

export default ProjectForm;
