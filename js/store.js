/**
 * Simple reactive state store for Living Meta-Analysis Platform
 * Provides path-based state management with subscriptions
 */

class Store {
  constructor(initialState = {}) {
    this._state = initialState;
    this._listeners = new Map();
    this._nextId = 0;
  }

  /**
   * Get current state
   * @returns {Object}
   */
  get state() {
    return this._state;
  }

  /**
   * Get value at a specific path
   * @param {string} path - Dot-separated path (e.g., 'ui.loading')
   * @returns {*}
   */
  get(path) {
    if (!path) return this._state;

    const keys = path.split('.');
    let current = this._state;

    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }

    return current;
  }

  /**
   * Set value at a specific path
   * @param {string} path - Dot-separated path
   * @param {*} value - New value
   */
  setState(path, value) {
    const keys = path.split('.');
    const newState = this._deepClone(this._state);
    let current = newState;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] === undefined || current[key] === null) {
        current[key] = {};
      } else {
        current[key] = this._deepClone(current[key]);
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
    this._state = newState;

    this._notify(path);
  }

  /**
   * Update state with partial object (merges at root level)
   * @param {Object} partial - Partial state to merge
   */
  update(partial) {
    const newState = { ...this._state, ...partial };
    this._state = newState;

    for (const key of Object.keys(partial)) {
      this._notify(key);
    }
  }

  /**
   * Subscribe to changes at a specific path
   * @param {string} path - Path to watch
   * @param {Function} callback - Called with new state when path changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback) {
    const id = this._nextId++;

    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Map());
    }

    this._listeners.get(path).set(id, callback);

    // Return unsubscribe function
    return () => {
      const pathListeners = this._listeners.get(path);
      if (pathListeners) {
        pathListeners.delete(id);
        if (pathListeners.size === 0) {
          this._listeners.delete(path);
        }
      }
    };
  }

  /**
   * Subscribe to any state change
   * @param {Function} callback - Called with new state on any change
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(callback) {
    return this.subscribe('*', callback);
  }

  /**
   * Notify listeners of changes
   * @param {string} changedPath
   */
  _notify(changedPath) {
    for (const [path, listeners] of this._listeners) {
      const shouldNotify =
        path === '*' ||
        changedPath.startsWith(path) ||
        path.startsWith(changedPath);

      if (shouldNotify) {
        for (const callback of listeners.values()) {
          try {
            callback(this._state);
          } catch (error) {
            console.error('Store listener error:', error);
          }
        }
      }
    }
  }

  /**
   * Deep clone helper
   * @param {*} obj
   * @returns {*}
   */
  _deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this._deepClone(item));

    const cloned = {};
    for (const key of Object.keys(obj)) {
      cloned[key] = this._deepClone(obj[key]);
    }
    return cloned;
  }

  /**
   * Reset state to initial value
   * @param {Object} initialState
   */
  reset(initialState = {}) {
    this._state = initialState;
    this._notify('*');
  }

  /**
   * Create a derived store that computes value from this store
   * @param {Function} selector - Function to compute derived value
   * @returns {Object} Derived store with subscribe method
   */
  derive(selector) {
    const derived = {
      get value() {
        return selector(store.state);
      },
      subscribe: (callback) => {
        let lastValue = selector(this._state);

        return this.subscribeAll((state) => {
          const newValue = selector(state);
          if (newValue !== lastValue) {
            lastValue = newValue;
            callback(newValue);
          }
        });
      }
    };

    return derived;
  }
}

// Initial state structure
const initialState = {
  currentProject: null,
  projects: [],

  ui: {
    loading: false,
    toast: null,
    modal: null,
    sidebarOpen: true,
    theme: 'light'
  },

  search: {
    query: null,
    results: [],
    diff: null,
    isSearching: false,
    progress: null
  },

  screening: {
    queue: [],
    current: null,
    conflicts: [],
    stats: {
      included: 0,
      excluded: 0,
      maybe: 0,
      pending: 0
    }
  },

  extraction: {
    trials: [],
    current: null,
    outcomes: []
  },

  analysis: {
    spec: null,
    results: null,
    tsa: null,
    isRunning: false
  },

  eim: {
    trialFlags: [],
    meta: null
  }
};

// Global store instance
export const store = new Store(initialState);

// Action creators for common operations
export const actions = {
  // UI actions
  setLoading(loading) {
    store.setState('ui.loading', loading);
  },

  showToast(message, type = 'info', duration = 3000) {
    store.setState('ui.toast', { message, type, duration, id: Date.now() });

    if (duration > 0) {
      setTimeout(() => {
        const current = store.get('ui.toast');
        if (current && current.id === store.get('ui.toast')?.id) {
          store.setState('ui.toast', null);
        }
      }, duration);
    }
  },

  showModal(content, options = {}) {
    store.setState('ui.modal', { content, ...options });
  },

  closeModal() {
    store.setState('ui.modal', null);
  },

  // Project actions
  setCurrentProject(project) {
    store.setState('currentProject', project);
  },

  setProjects(projects) {
    store.setState('projects', projects);
  },

  addProject(project) {
    const projects = [...store.get('projects'), project];
    store.setState('projects', projects);
  },

  // Search actions
  setSearchQuery(query) {
    store.setState('search.query', query);
  },

  setSearchResults(results) {
    store.setState('search.results', results);
  },

  setSearchProgress(progress) {
    store.setState('search.progress', progress);
  },

  setSearching(isSearching) {
    store.setState('search.isSearching', isSearching);
  },

  // Screening actions
  setScreeningQueue(queue) {
    store.setState('screening.queue', queue);
  },

  setCurrentScreening(trial) {
    store.setState('screening.current', trial);
  },

  updateScreeningStats(stats) {
    store.setState('screening.stats', stats);
  },

  // Extraction actions
  setExtractionTrials(trials) {
    store.setState('extraction.trials', trials);
  },

  setCurrentExtraction(trial) {
    store.setState('extraction.current', trial);
  },

  // Analysis actions
  setAnalysisSpec(spec) {
    store.setState('analysis.spec', spec);
  },

  setAnalysisResults(results) {
    store.setState('analysis.results', results);
  },

  setTSAResults(tsa) {
    store.setState('analysis.tsa', tsa);
  },

  setAnalysisRunning(isRunning) {
    store.setState('analysis.isRunning', isRunning);
  },

  // EIM actions
  setEIMFlags(flags) {
    store.setState('eim.trialFlags', flags);
  },

  setEIMMeta(meta) {
    store.setState('eim.meta', meta);
  }
};

export default store;
