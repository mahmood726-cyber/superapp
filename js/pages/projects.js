/**
 * Projects Page
 * Living Meta-Analysis Platform
 *
 * Lists all projects with create/edit/delete functionality
 */

import { db } from '../db.js';
import { store, actions } from '../store.js';
import { router } from '../router.js';
import '../components/project/project-card.js';
import '../components/project/project-form.js';
import '../components/base/lm-modal.js';

class ProjectsPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._projects = [];
    this._showCreateModal = false;
    this._deleteConfirmId = null;
    this._unsubscribe = null;
  }

  async connectedCallback() {
    await this._loadProjects();
    this.render();
    this._setupEventListeners();

    // Subscribe to store updates
    this._unsubscribe = store.subscribe('projects', (projects) => {
      this._projects = projects;
      this.render();
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }

  async _loadProjects() {
    try {
      const projects = await db.projects.getAll();
      this._projects = projects.sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
      );
      actions.setProjects(this._projects);
    } catch (err) {
      console.error('Failed to load projects:', err);
      this._showToast('Failed to load projects', 'error');
    }
  }

  _setupEventListeners() {
    this._handleCreate = () => {
      this._showCreateModal = true;
      this.render();
    };

    this._handleFormSubmit = async (e) => {
      const projectData = e.detail.project;

      try {
        const now = new Date().toISOString();
        const newProject = {
          ...projectData,
          createdAt: now,
          updatedAt: now,
          recordCount: 0,
          screeningStats: { pending: 0, included: 0, excluded: 0 },
          extractionStats: { pending: 0, completed: 0 },
          analysisStats: { pending: 0, completed: 0 },
          searchQuery: null,
          lastSearchAt: null
        };

        const id = await db.projects.add(newProject);
        newProject.id = id;

        this._projects = [newProject, ...this._projects];
        actions.setProjects(this._projects);

        this._showCreateModal = false;
        this.render();

        this._showToast('Project created successfully', 'success');

        // Navigate to new project
        router.push(`/project/${id}`);

      } catch (err) {
        console.error('Failed to create project:', err);
        this._showToast('Failed to create project', 'error');
      }
    };

    this._handleFormCancel = () => {
      this._showCreateModal = false;
      this.render();
    };

    this._handleOpenProject = (e) => {
      const { projectId } = e.detail;
      router.push(`/project/${projectId}`);
    };

    this._handleDeleteProject = (e) => {
      this._deleteConfirmId = e.detail.projectId;
      this.render();
    };

    this._handleConfirmDelete = async () => {
      if (!this._deleteConfirmId) return;

      try {
        await db.projects.delete(this._deleteConfirmId);

        // Also delete related records
        const records = await db.records.query('projectId', this._deleteConfirmId);
        for (const record of records) {
          await db.records.delete(record.id);
        }

        this._projects = this._projects.filter(p => p.id !== this._deleteConfirmId);
        actions.setProjects(this._projects);

        this._deleteConfirmId = null;
        this.render();

        this._showToast('Project deleted', 'success');

      } catch (err) {
        console.error('Failed to delete project:', err);
        this._showToast('Failed to delete project', 'error');
      }
    };

    this._handleCancelDelete = () => {
      this._deleteConfirmId = null;
      this.render();
    };

    this._handleDuplicateProject = async (e) => {
      const { projectId } = e.detail;
      const original = this._projects.find(p => p.id === projectId);

      if (!original) return;

      try {
        const now = new Date().toISOString();
        const duplicate = {
          name: `${original.name} (Copy)`,
          description: original.description,
          pico: { ...original.pico },
          protocol: '',
          createdAt: now,
          updatedAt: now,
          recordCount: 0,
          screeningStats: { pending: 0, included: 0, excluded: 0 },
          extractionStats: { pending: 0, completed: 0 },
          analysisStats: { pending: 0, completed: 0 },
          searchQuery: original.searchQuery,
          lastSearchAt: null
        };

        const id = await db.projects.add(duplicate);
        duplicate.id = id;

        this._projects = [duplicate, ...this._projects];
        actions.setProjects(this._projects);
        this.render();

        this._showToast('Project duplicated', 'success');

      } catch (err) {
        console.error('Failed to duplicate project:', err);
        this._showToast('Failed to duplicate project', 'error');
      }
    };

    // Attach listeners
    const createBtn = this.shadowRoot.querySelector('#create-btn');
    createBtn?.addEventListener('click', this._handleCreate);

    this.shadowRoot.addEventListener('open', this._handleOpenProject);
    this.shadowRoot.addEventListener('delete', this._handleDeleteProject);
    this.shadowRoot.addEventListener('duplicate', this._handleDuplicateProject);
  }

  _showToast(message, type = 'info') {
    const toast = document.querySelector('lm-toast');
    if (toast) {
      toast.show(message, type);
    }
  }

  render() {
    const hasProjects = this._projects.length > 0;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 1.5rem;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .page-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin: 0;
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

        .btn-primary {
          background: var(--color-primary-600, #2563eb);
          border: 1px solid var(--color-primary-600, #2563eb);
          color: white;
        }

        .btn-primary:hover {
          background: var(--color-primary-700, #1d4ed8);
        }

        .btn-danger {
          background: var(--color-danger-600, #dc2626);
          border: 1px solid var(--color-danger-600, #dc2626);
          color: white;
        }

        .btn-danger:hover {
          background: var(--color-danger-700, #b91c1c);
        }

        .btn-secondary {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #d1d5db);
          color: var(--color-text, #111827);
        }

        .btn-secondary:hover {
          background: var(--color-gray-50, #f9fafb);
        }

        .projects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: var(--color-surface, #fff);
          border: 2px dashed var(--color-border, #e5e7eb);
          border-radius: var(--radius-lg, 0.5rem);
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .empty-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin-bottom: 0.5rem;
        }

        .empty-text {
          color: var(--color-text-secondary, #6b7280);
          margin-bottom: 1.5rem;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .confirm-modal-body {
          padding: 1.5rem;
          text-align: center;
        }

        .confirm-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .confirm-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text, #111827);
          margin-bottom: 0.5rem;
        }

        .confirm-text {
          color: var(--color-text-secondary, #6b7280);
          margin-bottom: 1.5rem;
        }

        .confirm-actions {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
        }
      </style>

      <div class="page-header">
        <h1 class="page-title">Projects</h1>
        <button class="btn btn-primary" id="create-btn">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
          </svg>
          New Project
        </button>
      </div>

      ${hasProjects ? `
        <div class="projects-grid">
          ${this._projects.map(project => `
            <project-card data-project-id="${project.id}"></project-card>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h2 class="empty-title">No projects yet</h2>
          <p class="empty-text">Create your first meta-analysis project to get started</p>
          <button class="btn btn-primary" id="create-btn-empty">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
            </svg>
            Create Project
          </button>
        </div>
      `}

      ${this._showCreateModal ? `
        <lm-modal open size="lg" id="create-modal">
          <div class="modal-body">
            <project-form mode="create" id="project-form"></project-form>
          </div>
        </lm-modal>
      ` : ''}

      ${this._deleteConfirmId ? `
        <lm-modal open size="sm" id="delete-modal">
          <div class="confirm-modal-body">
            <div class="confirm-icon">⚠️</div>
            <h3 class="confirm-title">Delete Project?</h3>
            <p class="confirm-text">This will permanently delete the project and all its data. This action cannot be undone.</p>
            <div class="confirm-actions">
              <button class="btn btn-secondary" id="cancel-delete">Cancel</button>
              <button class="btn btn-danger" id="confirm-delete">Delete</button>
            </div>
          </div>
        </lm-modal>
      ` : ''}
    `;

    // Set project data on cards
    const cards = this.shadowRoot.querySelectorAll('project-card');
    cards.forEach(card => {
      const projectId = parseInt(card.dataset.projectId);
      const project = this._projects.find(p => p.id === projectId);
      if (project) {
        card.project = project;
      }
    });

    // Re-attach event listeners
    this._setupEventListeners();

    // Modal listeners
    const createModal = this.shadowRoot.querySelector('#create-modal');
    const projectForm = this.shadowRoot.querySelector('#project-form');

    createModal?.addEventListener('close', this._handleFormCancel);
    projectForm?.addEventListener('submit', this._handleFormSubmit);
    projectForm?.addEventListener('cancel', this._handleFormCancel);

    const deleteModal = this.shadowRoot.querySelector('#delete-modal');
    const confirmDeleteBtn = this.shadowRoot.querySelector('#confirm-delete');
    const cancelDeleteBtn = this.shadowRoot.querySelector('#cancel-delete');

    deleteModal?.addEventListener('close', this._handleCancelDelete);
    confirmDeleteBtn?.addEventListener('click', this._handleConfirmDelete);
    cancelDeleteBtn?.addEventListener('click', this._handleCancelDelete);

    // Empty state button
    const emptyBtn = this.shadowRoot.querySelector('#create-btn-empty');
    emptyBtn?.addEventListener('click', this._handleCreate);
  }
}

customElements.define('projects-page', ProjectsPage);

export default ProjectsPage;
