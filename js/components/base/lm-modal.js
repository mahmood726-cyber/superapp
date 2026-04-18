/**
 * Modal component
 * Living Meta-Analysis Platform
 */

class LMModal extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'title', 'size'];
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
    this._enableBodyScroll();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open') {
      if (newValue !== null) {
        this._disableBodyScroll();
      } else {
        this._enableBodyScroll();
      }
    }
    this.render();
  }

  get open() {
    return this.hasAttribute('open');
  }

  set open(val) {
    if (val) {
      this.setAttribute('open', '');
    } else {
      this.removeAttribute('open');
    }
  }

  get title() {
    return this.getAttribute('title') || '';
  }

  get size() {
    return this.getAttribute('size') || 'md';
  }

  show() {
    this.open = true;
    this.dispatchEvent(new CustomEvent('open', { bubbles: true }));
  }

  hide() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }

  _setupEventListeners() {
    this._handleKeydown = (e) => {
      if (e.key === 'Escape' && this.open) {
        this.hide();
      }
    };

    this._handleBackdropClick = (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        this.hide();
      }
    };

    this._handleCloseClick = () => {
      this.hide();
    };

    document.addEventListener('keydown', this._handleKeydown);

    const backdrop = this.shadowRoot?.querySelector('.modal-backdrop');
    const closeBtn = this.shadowRoot?.querySelector('.modal-close');

    backdrop?.addEventListener('click', this._handleBackdropClick);
    closeBtn?.addEventListener('click', this._handleCloseClick);
  }

  _removeEventListeners() {
    document.removeEventListener('keydown', this._handleKeydown);
  }

  _disableBodyScroll() {
    document.body.style.overflow = 'hidden';
  }

  _enableBodyScroll() {
    document.body.style.overflow = '';
  }

  render() {
    const sizeClass = `modal-${this.size}`;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: ${this.open ? 'block' : 'none'};
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 400;
          padding: 1rem;
          animation: fadeIn 0.15s ease;
        }

        .modal {
          background: var(--color-surface, #fff);
          border-radius: 0.75rem;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.2s ease;
        }

        .modal-sm { width: 100%; max-width: 400px; }
        .modal-md { width: 100%; max-width: 500px; }
        .modal-lg { width: 100%; max-width: 700px; }
        .modal-xl { width: 100%; max-width: 900px; }
        .modal-full { width: 100%; max-width: calc(100vw - 2rem); height: calc(100vh - 2rem); }

        .modal-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .modal-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0;
        }

        .modal-close {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: none;
          border-radius: 0.375rem;
          color: var(--color-text-muted, #9ca3af);
          cursor: pointer;
          transition: all 150ms ease;
        }

        .modal-close:hover {
          background: var(--color-gray-100, #f3f4f6);
          color: var(--color-text, #111827);
        }

        .modal-close:focus-visible {
          outline: 2px solid var(--color-primary-500, #3b82f6);
          outline-offset: 2px;
        }

        .modal-body {
          padding: 1.25rem;
          overflow-y: auto;
          flex: 1;
        }

        .modal-footer {
          padding: 1rem 1.25rem;
          border-top: 1px solid var(--color-border, #e5e7eb);
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      </style>

      <div class="modal-backdrop">
        <div class="modal ${sizeClass}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          ${this.title ? `
            <div class="modal-header">
              <h2 class="modal-title" id="modal-title">${this.title}</h2>
              <button class="modal-close" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
                </svg>
              </button>
            </div>
          ` : ''}

          <div class="modal-body">
            <slot></slot>
          </div>

          <slot name="footer">
            <div class="modal-footer" style="display: none;"></div>
          </slot>
        </div>
      </div>
    `;

    // Re-setup listeners after render
    if (this.open) {
      const backdrop = this.shadowRoot.querySelector('.modal-backdrop');
      const closeBtn = this.shadowRoot.querySelector('.modal-close');

      backdrop?.addEventListener('click', this._handleBackdropClick);
      closeBtn?.addEventListener('click', this._handleCloseClick);
    }
  }
}

customElements.define('lm-modal', LMModal);

export default LMModal;
