/**
 * Select component
 * Living Meta-Analysis Platform
 */

class LMSelect extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'disabled', 'error', 'label', 'hint', 'required', 'placeholder'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._options = [];
  }

  connectedCallback() {
    this._parseOptions();
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  attributeChangedCallback() {
    if (this.shadowRoot.hasChildNodes()) {
      this.render();
    }
  }

  get value() {
    const select = this.shadowRoot?.querySelector('select');
    return select?.value || this.getAttribute('value') || '';
  }

  set value(val) {
    const select = this.shadowRoot?.querySelector('select');
    if (select) select.value = val;
    this.setAttribute('value', val);
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  get error() {
    return this.getAttribute('error');
  }

  get label() {
    return this.getAttribute('label');
  }

  get hint() {
    return this.getAttribute('hint');
  }

  get required() {
    return this.hasAttribute('required');
  }

  get placeholder() {
    return this.getAttribute('placeholder');
  }

  set options(opts) {
    this._options = opts || [];
    this.render();
  }

  get options() {
    return this._options;
  }

  _parseOptions() {
    // Parse options from slot content
    const options = [];
    const optionElements = this.querySelectorAll('option');

    optionElements.forEach(opt => {
      options.push({
        value: opt.value,
        label: opt.textContent,
        disabled: opt.disabled,
        selected: opt.selected
      });
    });

    if (options.length > 0) {
      this._options = options;
    }
  }

  _setupEventListeners() {
    const select = this.shadowRoot?.querySelector('select');
    if (!select) return;

    this._handleChange = (e) => {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { value: e.target.value },
        bubbles: true
      }));
    };

    select.addEventListener('change', this._handleChange);
  }

  _removeEventListeners() {
    const select = this.shadowRoot?.querySelector('select');
    if (!select) return;

    select.removeEventListener('change', this._handleChange);
  }

  render() {
    const errorClass = this.error ? 'has-error' : '';
    const currentValue = this.getAttribute('value') || '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .form-group {
          margin-bottom: 0;
        }

        label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 0.25rem;
          color: var(--color-text, #111827);
        }

        .required {
          color: var(--color-danger-500, #ef4444);
        }

        select {
          width: 100%;
          padding: 0.5rem 2rem 0.5rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 0.375rem;
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
          cursor: pointer;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }

        select:focus {
          outline: none;
          border-color: var(--color-primary-500, #3b82f6);
          box-shadow: 0 0 0 3px var(--color-primary-100, #dbeafe);
        }

        select:disabled {
          background-color: var(--color-gray-100, #f3f4f6);
          cursor: not-allowed;
        }

        .has-error select {
          border-color: var(--color-danger-500, #ef4444);
        }

        .has-error select:focus {
          box-shadow: 0 0 0 3px var(--color-danger-100, #fee2e2);
        }

        .hint {
          font-size: 0.75rem;
          color: var(--color-text-muted, #9ca3af);
          margin-top: 0.25rem;
        }

        .error-message {
          font-size: 0.75rem;
          color: var(--color-danger-600, #dc2626);
          margin-top: 0.25rem;
        }

        option[disabled] {
          color: var(--color-text-muted, #9ca3af);
        }
      </style>

      <div class="form-group ${errorClass}">
        ${this.label ? `
          <label>
            ${this.label}
            ${this.required ? '<span class="required">*</span>' : ''}
          </label>
        ` : ''}

        <select ?disabled="${this.disabled}">
          ${this.placeholder ? `<option value="" disabled ${!currentValue ? 'selected' : ''}>${this.placeholder}</option>` : ''}
          ${this._options.map(opt => `
            <option
              value="${opt.value}"
              ${opt.disabled ? 'disabled' : ''}
              ${opt.value === currentValue ? 'selected' : ''}
            >${opt.label}</option>
          `).join('')}
        </select>

        ${this.hint && !this.error ? `<div class="hint">${this.hint}</div>` : ''}
        ${this.error ? `<div class="error-message">${this.error}</div>` : ''}
      </div>
    `;
  }
}

customElements.define('lm-select', LMSelect);

export default LMSelect;
