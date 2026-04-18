/**
 * IndexedDB wrapper for Living Meta-Analysis Platform
 * Provides async CRUD operations for all data stores
 */

const DB_NAME = 'living-meta';
const DB_VERSION = 1;

const STORES = {
  projects: {
    keyPath: 'id',
    indexes: [
      { name: 'created', keyPath: 'createdAt' },
      { name: 'updated', keyPath: 'updatedAt' }
    ]
  },

  searchRuns: {
    keyPath: 'id',
    indexes: [
      { name: 'project', keyPath: 'projectId' },
      { name: 'timestamp', keyPath: 'timestamp' }
    ]
  },

  records: {
    keyPath: 'nctId',
    indexes: [
      { name: 'project', keyPath: 'projectId' },
      { name: 'hasResults', keyPath: 'hasResults' },
      { name: 'status', keyPath: 'overallStatus' }
    ]
  },

  screening: {
    keyPath: ['projectId', 'nctId'],
    indexes: [
      { name: 'project', keyPath: 'projectId' },
      { name: 'decision', keyPath: 'decision' },
      { name: 'conflict', keyPath: 'hasConflict' }
    ]
  },

  extraction: {
    keyPath: ['projectId', 'nctId', 'outcomeId'],
    indexes: [
      { name: 'project', keyPath: 'projectId' },
      { name: 'locked', keyPath: 'locked' }
    ]
  },

  analysisSpecs: {
    keyPath: 'id',
    indexes: [
      { name: 'project', keyPath: 'projectId' }
    ]
  },

  analysisResults: {
    keyPath: 'id',
    indexes: [
      { name: 'spec', keyPath: 'specId' },
      { name: 'timestamp', keyPath: 'timestamp' }
    ]
  },

  eimTrialFlags: {
    keyPath: ['projectId', 'nctId'],
    indexes: [
      { name: 'project', keyPath: 'projectId' },
      { name: 'risk', keyPath: 'nonPublicationRisk' }
    ]
  },

  eimMeta: {
    keyPath: ['projectId', 'searchRunId'],
    indexes: [
      { name: 'project', keyPath: 'projectId' }
    ]
  },

  tsaRuns: {
    keyPath: ['projectId', 'outcomeId'],
    indexes: [
      { name: 'project', keyPath: 'projectId' }
    ]
  }
};

class Database {
  constructor() {
    this._db = null;
    this._ready = null;
  }

  /**
   * Initialize the database connection
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this._ready) return this._ready;

    this._ready = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this._db = request.result;
        resolve(this._db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        for (const [storeName, config] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, {
              keyPath: config.keyPath
            });

            for (const index of config.indexes || []) {
              store.createIndex(index.name, index.keyPath, {
                unique: index.unique || false
              });
            }
          }
        }
      };
    });

    return this._ready;
  }

  /**
   * Get a transaction for the specified stores
   * @param {string|string[]} storeNames
   * @param {string} mode - 'readonly' or 'readwrite'
   * @returns {IDBTransaction}
   */
  _getTransaction(storeNames, mode = 'readonly') {
    if (!this._db) throw new Error('Database not initialized');
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return this._db.transaction(names, mode);
  }

  /**
   * Get a single record by key
   * @param {string} storeName
   * @param {*} key
   * @returns {Promise<*>}
   */
  async get(storeName, key) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName);
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all records from a store
   * @param {string} storeName
   * @returns {Promise<Array>}
   */
  async getAll(storeName) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName);
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all records matching an index value
   * @param {string} storeName
   * @param {string} indexName
   * @param {*} value
   * @returns {Promise<Array>}
   */
  async getAllByIndex(storeName, indexName, value) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName);
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Put a record (insert or update)
   * @param {string} storeName
   * @param {*} record
   * @returns {Promise<*>} The key of the stored record
   */
  async put(storeName, record) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(record);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Put multiple records in a single transaction
   * @param {string} storeName
   * @param {Array} records
   * @returns {Promise<void>}
   */
  async putMany(storeName, records) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      for (const record of records) {
        store.put(record);
      }
    });
  }

  /**
   * Delete a record by key
   * @param {string} storeName
   * @param {*} key
   * @returns {Promise<void>}
   */
  async delete(storeName, key) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all records from a store
   * @param {string} storeName
   * @returns {Promise<void>}
   */
  async clear(storeName) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Count records in a store
   * @param {string} storeName
   * @returns {Promise<number>}
   */
  async count(storeName) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName);
      const store = tx.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query records with a cursor
   * @param {string} storeName
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async query(storeName, options = {}) {
    await this.init();

    const { index, range, direction = 'next', limit, filter } = options;

    return new Promise((resolve, reject) => {
      const tx = this._getTransaction(storeName);
      const store = tx.objectStore(storeName);
      const source = index ? store.index(index) : store;
      const request = source.openCursor(range, direction);

      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor && (!limit || results.length < limit)) {
          const record = cursor.value;

          if (!filter || filter(record)) {
            results.push(record);
          }

          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete the entire database
   * @returns {Promise<void>}
   */
  async deleteDatabase() {
    if (this._db) {
      this._db.close();
      this._db = null;
      this._ready = null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
export const db = new Database();

// Helper functions for common operations
export async function createProject(project) {
  const now = new Date().toISOString();
  const record = {
    ...project,
    id: project.id || crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  };
  await db.put('projects', record);
  return record;
}

export async function updateProject(id, updates) {
  const existing = await db.get('projects', id);
  if (!existing) throw new Error(`Project ${id} not found`);

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await db.put('projects', updated);
  return updated;
}

export async function getProjectRecords(projectId) {
  return db.getAllByIndex('records', 'project', projectId);
}

export async function getProjectScreening(projectId) {
  return db.getAllByIndex('screening', 'project', projectId);
}

export async function saveScreeningDecision(projectId, nctId, decision, reviewer = 'default') {
  const record = {
    projectId,
    nctId,
    decision,
    reviewer,
    timestamp: new Date().toISOString(),
    hasConflict: false
  };
  await db.put('screening', record);
  return record;
}

export async function getProjectExtraction(projectId) {
  return db.getAllByIndex('extraction', 'project', projectId);
}

export async function getEIMFlags(projectId) {
  return db.getAllByIndex('eimTrialFlags', 'project', projectId);
}

export default db;
