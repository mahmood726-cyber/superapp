/**
 * Button component
 * Living Meta-Analysis Platform
 */

class LMButton extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'size', 'disabled', 'loading', 'icon'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this._button = this.shadowRoot.querySelector('button');
    this._button.addEventListener('click', this._handleClick.bind(this));
  }

  disconnectedCallback() {
    if (this._button) {
      this._button.removeEventListener('click', this._handleClick.bind(this));
    }
  }

  attributeChangedCallback() {
    this.render();
  }

  get variant() {
    return this.getAttribute('variant') || 'primary';
  }

  get size() {
    return this.getAttribute('size') || 'md';
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  get loading() {
    return this.hasAttribute('loading');
  }

  get icon() {
    return this.getAttribute('icon');
  }

  _handleClick(e) {
    if (this.disabled || this.loading) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  render() {
    const variantClass = `btn-${this.variant}`;
    const sizeClass = this.size !== 'md' ? `btn-${this.size}` : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-flex;
        }

        button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border: none;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: all 150ms ease;
          white-space: nowrap;
        }

        button:focus-visible {
          outline: 2px solid var(--color-primary-500, #3b82f6);
          outline-offset: 2px;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Variants */
        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-700, #1d4ed8);
        }

        .btn-secondary {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-gray-700, #374151);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--color-gray-200, #e5e7eb);
        }

        .btn-danger {
          background: var(--color-danger-600, #dc2626);
          color: white;
        }

        .btn-danger:hover:not(:disabled) {
          background: var(--color-danger-700, #b91c1c);
        }

        .btn-success {
          background: var(--color-success-600, #16a34a);
          color: white;
        }

        .btn-success:hover:not(:disabled) {
          background: var(--color-success-700, #15803d);
        }

        .btn-ghost {
          background: transparent;
          color: var(--color-text-secondary, #4b5563);
        }

        .btn-ghost:hover:not(:disabled) {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-text, #111827);
        }

        .btn-outline {
          background: transparent;
          border: 1px solid var(--color-border, #e5e7eb);
          color: var(--color-text, #111827);
        }

        .btn-outline:hover:not(:disabled) {
          background: var(--color-gray-50, #f9fafb);
          border-color: var(--color-gray-300, #d1d5db);
        }

        /* Sizes */
        .btn-sm {
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
        }

        .btn-lg {
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
        }

        .btn-icon {
          padding: 0.5rem;
        }

        /* Loading spinner */
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Icon */
        .icon {
          width: 16px;
          height: 16px;
        }
      </style>

      <button
        class="${variantClass} ${sizeClass}"
        ?disabled="${this.disabled || this.loading}"
      >
        ${this.loading ? '<span class="spinner"></span>' : ''}
        ${this.icon ? `<span class="icon">${this.icon}</span>` : ''}
        <slot></slot>
      </button>
    `;
  }
}

customElements.define('lm-button', LMButton);

export default LMButton;
