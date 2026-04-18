/**
 * Tabs component
 * Living Meta-Analysis Platform
 */

class LMTabs extends HTMLElement {
  static get observedAttributes() {
    return ['active'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tabs = [];
  }

  connectedCallback() {
    this._parseTabs();
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

  get active() {
    return this.getAttribute('active') || (this._tabs[0]?.id || '');
  }

  set active(val) {
    this.setAttribute('active', val);
    this.dispatchEvent(new CustomEvent('change', {
      detail: { tab: val },
      bubbles: true
    }));
  }

  set tabs(tabs) {
    this._tabs = tabs || [];
    this.render();
  }

  get tabs() {
    return this._tabs;
  }

  _parseTabs() {
    // Parse tabs from slot content
    const tabElements = this.querySelectorAll('[slot^="tab-"]');
    const panelElements = this.querySelectorAll('[slot^="panel-"]');

    const tabs = [];
    tabElements.forEach(tab => {
      const id = tab.slot.replace('tab-', '');
      const panel = this.querySelector(`[slot="panel-${id}"]`);

      tabs.push({
        id,
        label: tab.textContent,
        disabled: tab.hasAttribute('disabled'),
        panel: panel?.innerHTML || ''
      });
    });

    if (tabs.length > 0) {
      this._tabs = tabs;
    }
  }

  _setupEventListeners() {
    this._handleTabClick = (e) => {
      const tabBtn = e.target.closest('[data-tab-id]');
      if (tabBtn && !tabBtn.disabled) {
        this.active = tabBtn.dataset.tabId;
      }
    };

    this._handleKeydown = (e) => {
      const tabs = Array.from(this.shadowRoot.querySelectorAll('[data-tab-id]:not([disabled])'));
      const currentIndex = tabs.findIndex(t => t.dataset.tabId === this.active);

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        this.active = tabs[prevIndex].dataset.tabId;
        tabs[prevIndex].focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        this.active = tabs[nextIndex].dataset.tabId;
        tabs[nextIndex].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.active = tabs[0].dataset.tabId;
        tabs[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        this.active = tabs[tabs.length - 1].dataset.tabId;
        tabs[tabs.length - 1].focus();
      }
    };

    const tabList = this.shadowRoot?.querySelector('.tab-list');
    tabList?.addEventListener('click', this._handleTabClick);
    tabList?.addEventListener('keydown', this._handleKeydown);
  }

  _removeEventListeners() {
    const tabList = this.shadowRoot?.querySelector('.tab-list');
    tabList?.removeEventListener('click', this._handleTabClick);
    tabList?.removeEventListener('keydown', this._handleKeydown);
  }

  render() {
    const activeId = this.active;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .tab-list {
          display: flex;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
          gap: 0.25rem;
        }

        .tab {
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          color: var(--color-text-secondary, #4b5563);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          cursor: pointer;
          transition: all 150ms ease;
          white-space: nowrap;
        }

        .tab:hover:not(:disabled) {
          color: var(--color-text, #111827);
        }

        .tab:focus-visible {
          outline: none;
          background: var(--color-gray-50, #f9fafb);
        }

        .tab:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tab[aria-selected="true"] {
          color: var(--color-primary-600, #2563eb);
          border-bottom-color: var(--color-primary-600, #2563eb);
        }

        .tab-panel {
          padding: 1rem 0;
        }

        .tab-panel:not(.active) {
          display: none;
        }

        .tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 0.25rem;
          margin-left: 0.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          background: var(--color-gray-100, #f3f4f6);
          border-radius: 9999px;
        }

        .tab[aria-selected="true"] .tab-badge {
          background: var(--color-primary-100, #dbeafe);
          color: var(--color-primary-700, #1d4ed8);
        }
      </style>

      <div class="tab-list" role="tablist">
        ${this._tabs.map(tab => `
          <button
            class="tab"
            role="tab"
            data-tab-id="${tab.id}"
            aria-selected="${tab.id === activeId}"
            aria-controls="panel-${tab.id}"
            tabindex="${tab.id === activeId ? 0 : -1}"
            ${tab.disabled ? 'disabled' : ''}
          >
            ${tab.label}
            ${tab.badge !== undefined ? `<span class="tab-badge">${tab.badge}</span>` : ''}
          </button>
        `).join('')}
      </div>

      ${this._tabs.map(tab => `
        <div
          class="tab-panel ${tab.id === activeId ? 'active' : ''}"
          role="tabpanel"
          id="panel-${tab.id}"
          aria-labelledby="tab-${tab.id}"
          ${tab.id !== activeId ? 'hidden' : ''}
        >
          ${tab.panel || `<slot name="panel-${tab.id}"></slot>`}
        </div>
      `).join('')}
    `;
  }
}

customElements.define('lm-tabs', LMTabs);

export default LMTabs;
