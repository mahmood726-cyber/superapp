/**
 * Living Meta-Analysis Platform
 * Main Application Entry Point
 */

import { router } from './router.js';
import { store, actions } from './store.js';
import { db } from './db.js';

// Import base components
import './components/base/lm-button.js';
import './components/base/lm-input.js';
import './components/base/lm-select.js';
import './components/base/lm-modal.js';
import './components/base/lm-toast.js';
import './components/base/lm-tabs.js';

// Import page components
import './pages/projects.js';
import './pages/project-detail.js';
import './pages/search.js';
import './pages/screening.js';
import './pages/extraction.js';
import './pages/analysis.js';
import './pages/nma.js';
import './pages/eim.js';
import './pages/reports.js';

// Navigation configuration
const NAV_ITEMS = [
  {
    section: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: 'home' }
    ]
  },
  {
    section: 'Project',
    items: [
      { path: '/projects', label: 'Projects', icon: 'folder' },
      { path: '/search', label: 'Search CT.gov', icon: 'search' },
      { path: '/screening', label: 'Screening', icon: 'filter' },
      { path: '/extraction', label: 'Extraction', icon: 'table' }
    ]
  },
  {
    section: 'Analysis',
    items: [
      { path: '/analysis', label: 'Meta-Analysis', icon: 'chart' },
      { path: '/nma', label: 'Network MA', icon: 'network' },
      { path: '/eim', label: 'Evidence Integrity', icon: 'shield' },
      { path: '/report', label: 'Reports', icon: 'document' }
    ]
  }
];

// Icon SVGs
const ICONS = {
  home: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>`,
  folder: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>`,
  search: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>`,
  filter: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>`,
  table: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clip-rule="evenodd"/></svg>`,
  chart: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>`,
  network: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 8a3 3 0 110-6 3 3 0 010 6zm-6 5.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM4 17a3 3 0 110-6 3 3 0 010 6zm12-3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM16 17a3 3 0 110-6 3 3 0 010 6zM10 8v3M6.5 12l3-2.5M13.5 12l-3-2.5"/><path stroke="currentColor" stroke-width="1.5" fill="none" d="M10 8v3M6.5 12l3-2.5M13.5 12l-3-2.5"/></svg>`,
  shield: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
  document: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>`
};

/**
 * Initialize the application
 */
async function init() {
  console.log('Initializing Living Meta-Analysis Platform...');

  // Initialize database
  try {
    await db.init();
    console.log('Database initialized');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    showToast('Failed to initialize database', 'error');
  }

  // Load projects
  try {
    const projects = await db.getAll('projects');
    actions.setProjects(projects);
  } catch (error) {
    console.error('Failed to load projects:', error);
  }

  // Setup navigation
  setupNavigation();

  // Setup routes
  setupRoutes();

  // Setup theme toggle
  setupTheme();

  // Setup menu toggle
  setupMenuToggle();

  // Hide loading
  hideLoading();

  console.log('Application ready');
}

/**
 * Setup navigation sidebar
 */
function setupNavigation() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  let html = '';

  for (const section of NAV_ITEMS) {
    html += `<div class="nav-section">`;
    html += `<div class="nav-section-title">${section.section}</div>`;

    for (const item of section.items) {
      const icon = ICONS[item.icon] || '';
      html += `
        <a href="#${item.path}" class="nav-item" data-path="${item.path}">
          <span class="nav-item-icon">${icon}</span>
          <span class="nav-item-label">${item.label}</span>
          ${item.badge ? `<span class="nav-item-badge">${item.badge}</span>` : ''}
        </a>
      `;
    }

    html += `</div>`;
  }

  nav.innerHTML = html;

  // Update active state on route change
  window.addEventListener('routechange', updateActiveNavItem);
  updateActiveNavItem();
}

/**
 * Update active navigation item
 */
function updateActiveNavItem() {
  const path = window.location.hash.slice(1) || '/';
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    const itemPath = item.dataset.path;
    if (itemPath === path || (path.startsWith(itemPath) && itemPath !== '/')) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update breadcrumb
  updateBreadcrumb(path);
}

/**
 * Update breadcrumb
 */
function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById('breadcrumb');
  if (!breadcrumb) return;

  // Find matching nav item
  let label = 'Dashboard';
  for (const section of NAV_ITEMS) {
    for (const item of section.items) {
      if (item.path === path) {
        label = item.label;
        break;
      }
    }
  }

  breadcrumb.innerHTML = `<span>${label}</span>`;
}

/**
 * Setup routes
 */
function setupRoutes() {
  const outlet = document.getElementById('main-outlet');
  router.setOutlet(outlet);

  // Define routes
  router
    .route('/', {
      title: 'Dashboard - Living Meta',
      component: renderDashboard
    })
    .route('/projects', {
      title: 'Projects - Living Meta',
      component: renderProjects
    })
    .route('/project/:id', {
      title: 'Project Details - Living Meta',
      component: renderProjectDetails
    })
    .route('/search', {
      title: 'Search CT.gov - Living Meta',
      component: renderSearch
    })
    .route('/screening', {
      title: 'Screening - Living Meta',
      component: renderScreening
    })
    .route('/extraction', {
      title: 'Extraction - Living Meta',
      component: renderExtraction
    })
    .route('/analysis', {
      title: 'Meta-Analysis - Living Meta',
      component: renderAnalysis
    })
    .route('/nma', {
      title: 'Network Meta-Analysis - Living Meta',
      component: renderNMA
    })
    .route('/eim', {
      title: 'Evidence Integrity - Living Meta',
      component: renderEIM
    })
    .route('/report', {
      title: 'Reports - Living Meta',
      component: renderReport
    });

  // Before hook - show loading
  router.beforeEach(() => {
    showLoading();
    return true;
  });

  // After hook - hide loading
  router.afterEach(() => {
    hideLoading();
  });
}

/**
 * Setup theme toggle
 */
function setupTheme() {
  const toggle = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');

  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  toggle?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);

    // Update icon
    if (icon) {
      icon.innerHTML = next === 'dark'
        ? `<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>`
        : `<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>`;
    }
  });
}

/**
 * Setup menu toggle for mobile
 */
function setupMenuToggle() {
  const toggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');

  toggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
  });
}

/**
 * Show loading overlay
 */
function showLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'flex';
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.show(message, type);
  }
}

// Page render functions
function renderDashboard() {
  return `
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-description">Welcome to Living Meta-Analysis Platform</p>
    </div>

    <div class="grid grid-3 mb-6">
      <div class="card">
        <div class="card-body">
          <div class="text-sm text-muted mb-1">Projects</div>
          <div class="text-2xl font-bold">${store.state.projects.length}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="text-sm text-muted mb-1">Trials Screened</div>
          <div class="text-2xl font-bold">0</div>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="text-sm text-muted mb-1">Analyses Run</div>
          <div class="text-2xl font-bold">0</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Quick Start</h2>
      </div>
      <div class="card-body">
        <div class="grid grid-2 gap-4">
          <a href="#/projects" class="btn btn-primary">Create New Project</a>
          <a href="#/search" class="btn btn-secondary">Search CT.gov</a>
        </div>
      </div>
    </div>
  `;
}

function renderProjects() {
  // Use the custom projects-page element
  return `<projects-page></projects-page>`;
}

function renderProjectDetails(params) {
  // Use the custom project-detail-page element
  return `<project-detail-page project-id="${params.id}"></project-detail-page>`;
}

function renderSearch() {
  // Use the custom search-page element
  return `<search-page></search-page>`;
}

function renderScreening() {
  // Use the custom screening-page element
  return `<screening-page></screening-page>`;
}

function renderExtraction() {
  // Use the custom extraction-page element
  return `<extraction-page></extraction-page>`;
}

function renderAnalysis() {
  // Use the custom analysis-page element
  return `<analysis-page></analysis-page>`;
}

function renderNMA() {
  // Use the custom nma-page element
  return `<nma-page></nma-page>`;
}

function renderEIM() {
  // Use the custom eim-page element
  return `<eim-page></eim-page>`;
}

function renderReport() {
  // Use the custom reports-page element
  return `<reports-page></reports-page>`;
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for use in other modules
export { showToast, showLoading, hideLoading };
