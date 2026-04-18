/**
 * Input component
 * Living Meta-Analysis Platform
 */

class LMInput extends HTMLElement {
  static get observedAttributes() {
    return ['type', 'placeholder', 'value', 'disabled', 'error', 'label', 'hint', 'required'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  attributeChangedCallback() {
    this.render();
    this._setupEventListeners();
  }

  get type() {
    return this.getAttribute('type') || 'text';
  }

  get value() {
    const input = this.shadowRoot?.querySelector('input, textarea');
    return input?.value || this.getAttribute('value') || '';
  }

  set value(val) {
    const input = this.shadowRoot?.querySelector('input, textarea');
    if (input) input.value = val;
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

  _setupEventListeners() {
    const input = this.shadowRoot?.querySelector('input, textarea');
    if (!input) return;

    this._handleInput = (e) => {
      this.dispatchEvent(new CustomEvent('input', {
        detail: { value: e.target.value },
        bubbles: true
      }));
    };

    this._handleChange = (e) => {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { value: e.target.value },
        bubbles: true
      }));
    };

    this._handleFocus = () => {
      this.dispatchEvent(new Event('focus', { bubbles: true }));
    };

    this._handleBlur = () => {
      this.dispatchEvent(new Event('blur', { bubbles: true }));
    };

    input.addEventListener('input', this._handleInput);
    input.addEventListener('change', this._handleChange);
    input.addEventListener('focus', this._handleFocus);
    input.addEventListener('blur', this._handleBlur);
  }

  _removeEventListeners() {
    const input = this.shadowRoot?.querySelector('input, textarea');
    if (!input) return;

    input.removeEventListener('input', this._handleInput);
    input.removeEventListener('change', this._handleChange);
    input.removeEventListener('focus', this._handleFocus);
    input.removeEventListener('blur', this._handleBlur);
  }

  focus() {
    const input = this.shadowRoot?.querySelector('input, textarea');
    input?.focus();
  }

  blur() {
    const input = this.shadowRoot?.querySelector('input, textarea');
    input?.blur();
  }

  render() {
    const isTextarea = this.type === 'textarea';
    const errorClass = this.error ? 'has-error' : '';

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

        input, textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          font-family: inherit;
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 0.375rem;
          background: var(--color-surface, #fff);
          color: var(--color-text, #111827);
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }

        input:focus, textarea:focus {
          outline: none;
          border-color: var(--color-primary-500, #3b82f6);
          box-shadow: 0 0 0 3px var(--color-primary-100, #dbeafe);
        }

        input:disabled, textarea:disabled {
          background: var(--color-gray-100, #f3f4f6);
          cursor: not-allowed;
        }

        input::placeholder, textarea::placeholder {
          color: var(--color-text-muted, #9ca3af);
        }

        .has-error input,
        .has-error textarea {
          border-color: var(--color-danger-500, #ef4444);
        }

        .has-error input:focus,
        .has-error textarea:focus {
          box-shadow: 0 0 0 3px var(--color-danger-100, #fee2e2);
        }

        textarea {
          min-height: 100px;
          resize: vertical;
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
      </style>

      <div class="form-group ${errorClass}">
        ${this.label ? `
          <label>
            ${this.label}
            ${this.required ? '<span class="required">*</span>' : ''}
          </label>
        ` : ''}

        ${isTextarea ? `
          <textarea
            placeholder="${this.getAttribute('placeholder') || ''}"
            ?disabled="${this.disabled}"
          >${this.getAttribute('value') || ''}</textarea>
        ` : `
          <input
            type="${this.type}"
            placeholder="${this.getAttribute('placeholder') || ''}"
            value="${this.getAttribute('value') || ''}"
            ?disabled="${this.disabled}"
          />
        `}

        ${this.hint && !this.error ? `<div class="hint">${this.hint}</div>` : ''}
        ${this.error ? `<div class="error-message">${this.error}</div>` : ''}
      </div>
    `;
  }
}

customElements.define('lm-input', LMInput);

export default LMInput;
