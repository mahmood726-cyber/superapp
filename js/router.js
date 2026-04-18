/**
 * Simple hash-based router for Living Meta-Analysis Platform
 * Supports dynamic routes, parameters, and navigation guards
 */

class Router {
  constructor() {
    this._routes = new Map();
    this._currentRoute = null;
    this._currentParams = {};
    this._beforeHooks = [];
    this._afterHooks = [];
    this._outlet = null;

    // Listen for hash changes
    window.addEventListener('hashchange', () => this._handleRoute());
    window.addEventListener('load', () => this._handleRoute());
  }

  /**
   * Register a route
   * @param {string} path - Route path (e.g., '/project/:id')
   * @param {Object} config - Route configuration
   */
  route(path, config) {
    const pattern = this._pathToPattern(path);
    this._routes.set(path, { ...config, pattern, path });
    return this;
  }

  /**
   * Set the DOM element where pages will be rendered
   * @param {HTMLElement|string} outlet
   */
  setOutlet(outlet) {
    this._outlet = typeof outlet === 'string'
      ? document.querySelector(outlet)
      : outlet;
    return this;
  }

  /**
   * Add a before navigation hook
   * @param {Function} hook - (to, from) => boolean|Promise<boolean>
   */
  beforeEach(hook) {
    this._beforeHooks.push(hook);
    return this;
  }

  /**
   * Add an after navigation hook
   * @param {Function} hook - (to, from) => void
   */
  afterEach(hook) {
    this._afterHooks.push(hook);
    return this;
  }

  /**
   * Navigate to a path
   * @param {string} path
   * @param {Object} options - { replace: boolean }
   */
  navigate(path, options = {}) {
    const hash = path.startsWith('#') ? path : `#${path}`;

    if (options.replace) {
      window.location.replace(hash);
    } else {
      window.location.hash = hash;
    }
  }

  /**
   * Go back in history
   */
  back() {
    window.history.back();
  }

  /**
   * Go forward in history
   */
  forward() {
    window.history.forward();
  }

  /**
   * Get current route info
   * @returns {Object}
   */
  get current() {
    return {
      route: this._currentRoute,
      params: this._currentParams,
      path: this._getCurrentPath()
    };
  }

  /**
   * Handle route change
   */
  async _handleRoute() {
    const path = this._getCurrentPath();
    const { route, params } = this._matchRoute(path);

    const from = this._currentRoute;
    const to = route;

    // Run before hooks
    for (const hook of this._beforeHooks) {
      const result = await hook(to, from, params);
      if (result === false) {
        // Navigation cancelled - restore previous hash
        if (from) {
          window.location.hash = from.path;
        }
        return;
      }
    }

    // Update current route
    this._currentRoute = route;
    this._currentParams = params;

    // Render the page
    if (route && this._outlet) {
      await this._renderRoute(route, params);
    } else if (!route) {
      // 404 handling
      this._render404();
    }

    // Run after hooks
    for (const hook of this._afterHooks) {
      hook(to, from, params);
    }

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('routechange', {
      detail: { route, params, path }
    }));
  }

  /**
   * Get current path from hash
   * @returns {string}
   */
  _getCurrentPath() {
    const hash = window.location.hash.slice(1) || '/';
    return hash.startsWith('/') ? hash : `/${hash}`;
  }

  /**
   * Convert path pattern to regex
   * @param {string} path
   * @returns {Object}
   */
  _pathToPattern(path) {
    const paramNames = [];
    const regexStr = path
      .replace(/\//g, '\\/')
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });

    return {
      regex: new RegExp(`^${regexStr}$`),
      paramNames
    };
  }

  /**
   * Match a path to a registered route
   * @param {string} path
   * @returns {Object}
   */
  _matchRoute(path) {
    for (const [, route] of this._routes) {
      const match = path.match(route.pattern.regex);

      if (match) {
        const params = {};
        route.pattern.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        return { route, params };
      }
    }

    return { route: null, params: {} };
  }

  /**
   * Render a route's component
   * @param {Object} route
   * @param {Object} params
   */
  async _renderRoute(route, params) {
    if (!this._outlet) return;

    // Clear outlet
    this._outlet.innerHTML = '';

    // Handle dynamic import
    if (route.component) {
      let Component = route.component;

      // If component is a function (lazy load), call it
      if (typeof Component === 'function' && !Component.prototype) {
        try {
          const module = await Component();
          Component = module.default || module;
        } catch (error) {
          console.error('Failed to load route component:', error);
          this._renderError(error);
          return;
        }
      }

      // Create element
      if (typeof Component === 'string') {
        // Tag name
        const element = document.createElement(Component);
        element.params = params;
        this._outlet.appendChild(element);
      } else if (Component.prototype instanceof HTMLElement) {
        // Web Component class
        const element = new Component();
        element.params = params;
        this._outlet.appendChild(element);
      } else if (typeof Component === 'function') {
        // Render function
        const content = Component(params);
        if (typeof content === 'string') {
          this._outlet.innerHTML = content;
        } else if (content instanceof HTMLElement) {
          this._outlet.appendChild(content);
        }
      }
    }

    // Set document title
    if (route.title) {
      document.title = typeof route.title === 'function'
        ? route.title(params)
        : route.title;
    }
  }

  /**
   * Render 404 page
   */
  _render404() {
    if (!this._outlet) return;

    this._outlet.innerHTML = `
      <div class="page-404">
        <h1>404</h1>
        <p>Page not found</p>
        <a href="#/">Go to Dashboard</a>
      </div>
    `;
  }

  /**
   * Render error page
   * @param {Error} error
   */
  _renderError(error) {
    if (!this._outlet) return;

    this._outlet.innerHTML = `
      <div class="page-error">
        <h1>Error</h1>
        <p>${error.message}</p>
        <a href="#/">Go to Dashboard</a>
      </div>
    `;
  }

  /**
   * Generate a URL with params
   * @param {string} name - Route path
   * @param {Object} params
   * @returns {string}
   */
  url(name, params = {}) {
    let path = name;

    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`:${key}`, encodeURIComponent(value));
    }

    return `#${path}`;
  }
}

// Singleton instance
export const router = new Router();

// Helper for creating links
export function link(path, text, className = '') {
  return `<a href="${router.url(path)}" class="${className}">${text}</a>`;
}

export default router;
