/**
 * Toast notification component
 * Living Meta-Analysis Platform
 */

class LMToast extends HTMLElement {
  static get observedAttributes() {
    return ['message', 'type', 'duration', 'visible'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._timeout = null;
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    this._clearTimeout();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'visible' && newValue !== null) {
      this._startAutoHide();
    }
    this.render();
  }

  get message() {
    return this.getAttribute('message') || '';
  }

  get type() {
    return this.getAttribute('type') || 'info';
  }

  get duration() {
    return parseInt(this.getAttribute('duration') || '3000', 10);
  }

  get visible() {
    return this.hasAttribute('visible');
  }

  set visible(val) {
    if (val) {
      this.setAttribute('visible', '');
    } else {
      this.removeAttribute('visible');
    }
  }

  show(message, type = 'info', duration = 3000) {
    this.setAttribute('message', message);
    this.setAttribute('type', type);
    this.setAttribute('duration', duration);
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this._clearTimeout();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }

  _startAutoHide() {
    this._clearTimeout();

    if (this.duration > 0) {
      this._timeout = setTimeout(() => {
        this.hide();
      }, this.duration);
    }
  }

  _clearTimeout() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  render() {
    const typeClass = `toast-${this.type}`;
    const icon = this._getIcon();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: ${this.visible ? 'block' : 'none'};
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          z-index: 500;
        }

        .toast {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
          min-width: 300px;
          max-width: 500px;
          animation: slideIn 0.2s ease;
        }

        .toast-info {
          background: var(--color-gray-800, #1f2937);
          color: white;
        }

        .toast-success {
          background: var(--color-success-600, #16a34a);
          color: white;
        }

        .toast-warning {
          background: var(--color-warning-600, #d97706);
          color: var(--color-gray-900, #111827);
        }

        .toast-error {
          background: var(--color-danger-600, #dc2626);
          color: white;
        }

        .icon {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .message {
          flex: 1;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .close-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          border-radius: 0.25rem;
          color: currentColor;
          opacity: 0.7;
          cursor: pointer;
          transition: opacity 150ms ease;
        }

        .close-btn:hover {
          opacity: 1;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      </style>

      <div class="toast ${typeClass}" role="alert">
        <span class="icon">${icon}</span>
        <span class="message">${this.message}</span>
        <button class="close-btn" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3.22 3.22a.75.75 0 011.06 0L7 5.94l2.72-2.72a.75.75 0 111.06 1.06L8.06 7l2.72 2.72a.75.75 0 11-1.06 1.06L7 8.06l-2.72 2.72a.75.75 0 01-1.06-1.06L5.94 7 3.22 4.28a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      </div>
    `;

    // Add close button listener
    const closeBtn = this.shadowRoot.querySelector('.close-btn');
    closeBtn?.addEventListener('click', () => this.hide());
  }

  _getIcon() {
    const icons = {
      info: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`,
      success: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>`,
      warning: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`,
      error: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>`
    };

    return icons[this.type] || icons.info;
  }
}

customElements.define('lm-toast', LMToast);

export default LMToast;
