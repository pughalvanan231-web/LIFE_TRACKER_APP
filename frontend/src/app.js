/**
 * Application Core Shell Coordinator
 */

import { appState } from './services/state.js';
import { renderSidebar } from './components/sidebar.js';
import { renderBottomNav } from './components/bottom-nav.js';
import { renderHeader } from './components/header.js';
import { renderModal } from './components/modal.js';
import { renderToastContainer } from './components/toast.js';

import { renderHomePage } from './pages/home.js';
import { renderGoalsPage } from './pages/goals.js';
import { renderTasksPage } from './pages/tasks.js';
import { renderProgressPage } from './pages/progress.js';
import { renderReportsPage } from './pages/reports.js';
import { renderSettingsPage } from './pages/settings.js';

export class App {
  constructor(mountElement) {
    this.mount = mountElement;
    this.unsubscribe = null;
  }

  init() {
    this.unsubscribe = appState.subscribe((state) => {
      this.render(state);
    });
    // Initial render
    this.render(appState.getState());
  }

  render(state) {
    const { currentRoute, demoMode, isSidebarOpen, modal, notifications } = state;

    // Render active page
    let pageHTML = '';
    switch (currentRoute) {
      case 'home':
        pageHTML = renderHomePage(demoMode);
        break;
      case 'goals':
        pageHTML = renderGoalsPage(demoMode);
        break;
      case 'tasks':
        pageHTML = renderTasksPage(demoMode);
        break;
      case 'progress':
        pageHTML = renderProgressPage(demoMode);
        break;
      case 'reports':
        pageHTML = renderReportsPage(demoMode);
        break;
      case 'settings':
        pageHTML = renderSettingsPage();
        break;
      default:
        pageHTML = renderHomePage(demoMode);
    }

    this.mount.innerHTML = `
      ${renderSidebar(currentRoute)}
      <div class="app-main">
        ${renderHeader(currentRoute, demoMode)}
        <main id="main-content" role="main">
          ${pageHTML}
        </main>
      </div>
      ${renderBottomNav(currentRoute)}
      ${renderModal(modal)}
      ${renderToastContainer(notifications)}
    `;

    // Ensure responsive sidebar state matches
    const sidebarEl = this.mount.querySelector('#app-sidebar');
    if (sidebarEl) {
      if (isSidebarOpen) {
        sidebarEl.classList.add('open');
      } else {
        sidebarEl.classList.remove('open');
      }
    }

    this.bindEvents();
  }

  bindEvents() {
    // 1. Demo Mode Toggles
    const demoBtn = this.mount.querySelector('#demo-mode-toggle-btn');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        appState.toggleDemoMode();
      });
    }

    const disableDemoBtn = this.mount.querySelector('#disable-demo-btn');
    if (disableDemoBtn) {
      disableDemoBtn.addEventListener('click', () => {
        appState.toggleDemoMode();
      });
    }

    // 2. Mobile Sidebar Toggle
    const sidebarToggleBtn = this.mount.querySelector('#sidebar-toggle-btn');
    if (sidebarToggleBtn) {
      sidebarToggleBtn.addEventListener('click', () => {
        appState.toggleSidebar();
      });
    }

    // 3. Goal Creation Modals
    const addGoalBtn = this.mount.querySelector('#add-goal-btn');
    const addGoalEmptyBtn = this.mount.querySelector('#add-goal-empty-btn');
    const handleAddGoal = () => {
      appState.openModal({
        title: 'Define New Goal',
        content: `
          <div class="flex flex-col gap-4">
            <div class="form-group">
              <label class="form-label" for="new-goal-title">Goal Title</label>
              <input id="new-goal-title" class="form-input" placeholder="e.g., Run Half-Marathon or Publish Book" />
            </div>
            <div class="form-group">
              <label class="form-label" for="new-goal-timeframe">Timeframe</label>
              <select id="new-goal-timeframe" class="form-select">
                <option value="short_term">Short-Term (< 1 Year)</option>
                <option value="long_term">Long-Term (1-5 Years)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="new-goal-target">Target Metric (Optional)</label>
              <input id="new-goal-target" class="form-input" placeholder="e.g., 21.1 km or 10 chapters" />
            </div>
          </div>
        `,
        confirmText: 'Create Goal',
        cancelText: 'Cancel',
      });
    };
    if (addGoalBtn) addGoalBtn.addEventListener('click', handleAddGoal);
    if (addGoalEmptyBtn) addGoalEmptyBtn.addEventListener('click', handleAddGoal);

    // 4. Task Creation Modals
    const addTaskBtn = this.mount.querySelector('#add-task-btn');
    const addTaskEmptyBtn = this.mount.querySelector('#add-task-empty-btn');
    const handleAddTask = () => {
      appState.openModal({
        title: 'Schedule Actionable Task',
        content: `
          <div class="flex flex-col gap-4">
            <div class="form-group">
              <label class="form-label" for="new-task-title">Task Title</label>
              <input id="new-task-title" class="form-input" placeholder="e.g., Morning tempo run or Chapter outline" />
            </div>
            <div class="form-group">
              <label class="form-label" for="new-task-duration">Estimated Duration (Minutes)</label>
              <input id="new-task-duration" type="number" class="form-input" value="45" min="5" max="480" />
            </div>
            <div class="form-group">
              <label class="form-label" for="new-task-priority">Priority</label>
              <select id="new-task-priority" class="form-select">
                <option value="high">High Priority</option>
                <option value="medium" selected>Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
          </div>
        `,
        confirmText: 'Schedule Task',
        cancelText: 'Cancel',
      });
    };
    if (addTaskBtn) addTaskBtn.addEventListener('click', handleAddTask);
    if (addTaskEmptyBtn) addTaskEmptyBtn.addEventListener('click', handleAddTask);

    // 5. Save Daily Review Button
    const saveReviewBtn = this.mount.querySelector('#save-review-btn');
    if (saveReviewBtn) {
      saveReviewBtn.addEventListener('click', () => {
        appState.showToast('Daily review submitted. Progress snapshot recorded!', 'success');
      });
    }

    // 6. Modal Close / Cancel / Confirm
    const modalCloseBtn = this.mount.querySelector('#modal-close-btn');
    const modalCancelBtn = this.mount.querySelector('#modal-cancel-btn');
    const modalConfirmBtn = this.mount.querySelector('#modal-confirm-btn');

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => appState.closeModal());
    }
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', () => appState.closeModal());
    }
    if (modalConfirmBtn) {
      modalConfirmBtn.addEventListener('click', () => {
        appState.closeModal();
        appState.showToast('Item submitted successfully (Client-side simulation)', 'success');
      });
    }
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
