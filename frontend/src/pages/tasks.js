/**
 * Tasks and Daily Planner Page Coordinator
 * 
 * Manages:
 * - Touch-friendly digital pastel sticky-note board & compact list alternative
 * - Daily planner schedule view with workload capacity meter and overload warnings
 * - Date navigation (Today, Tomorrow, Upcoming, Date Picker)
 * - Task CRUD, priority/status filtering, search, and rescheduling
 * - Goal & milestone linkage
 */

import { tasksService } from '../services/tasks-service.js';
import { goalsService } from '../services/goals-service.js';
import { milestonesService } from '../services/milestones-service.js';
import { DataEvents, DATA_TOPICS } from '../services/data-events.js';
import { appState } from '../services/state.js';
import { toastManager } from '../components/toast.js';
import { openConfirmDialog } from '../components/confirm-dialog.js';
import { attachModalListeners } from '../components/modal.js';
import { ValidationRules, validateForm, applyFieldValidationState } from '../components/form-validation.js';
import { renderSkeletonCardList } from '../components/loading-skeleton.js';
import { renderEmptyState } from '../components/empty-state.js';
import { renderRetryableError } from '../components/retryable-error.js';
import { formatDateDisplay } from '../utils/formatters.js';

import { taskColorManager } from './tasks/task-colors.js';
import { renderDailyPlanner } from './tasks/daily-planner.js';
import { renderTaskCard } from './tasks/task-card.js';
import { renderTaskFormModal } from './tasks/task-form-modal.js';
import { renderTaskRescheduleModal } from './tasks/task-reschedule-modal.js';

class TasksController {
  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.selectedDate = today;
    this.viewTab = 'today'; // 'today' | 'tomorrow' | 'upcoming' | 'all'
    this.viewMode = typeof localStorage !== 'undefined' && localStorage.getItem('life_goals_tasks_view_mode') === 'compact'
      ? 'compact'
      : 'board';
    this.groupByPriority = true;
    this.availableMinutes = typeof localStorage !== 'undefined' && localStorage.getItem('life_goals_planner_available_minutes')
      ? parseInt(localStorage.getItem('life_goals_planner_available_minutes'), 10)
      : 240;

    this.tasks = [];
    this.goals = [];
    this.milestones = [];
    this.isLoading = false;
    this.error = null;
    this.filters = {
      search: '',
      status: '',
      priority: '',
    };
    this.modalCleanup = null;
    this.isFormDirty = false;

    // Reactively refresh on task mutations
    DataEvents.on(DATA_TOPICS.TASKS_CHANGED, () => {
      this.loadTasks({ silent: true });
    });

    DataEvents.on(DATA_TOPICS.GOALS_CHANGED, () => {
      this.loadGoals();
    });
  }

  async loadGoals() {
    try {
      const response = await goalsService.listGoals({ limit: 100 });
      this.goals = (response && response.items) || [];
    } catch {
      // goals list failure shouldn't block tasks
    }
  }

  async loadTasks({ silent = false } = {}) {
    if (!silent) {
      this.isLoading = true;
      this.error = null;
    }

    try {
      let dateFilter = undefined;
      if (this.viewTab === 'today') {
        const today = new Date().toISOString().split('T')[0];
        dateFilter = today;
        this.selectedDate = today;
      } else if (this.viewTab === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        dateFilter = tomorrowStr;
        this.selectedDate = tomorrowStr;
      } else if (this.viewTab === 'date') {
        dateFilter = this.selectedDate;
      }

      const response = await tasksService.listTasks({
        date: dateFilter,
        status: this.filters.status || undefined,
        priority: this.filters.priority || undefined,
        limit: 100,
      });

      this.tasks = (response && response.items) || [];
      this.error = null;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[TasksController] Failed to load tasks:', err);
        this.error = err;
      }
    } finally {
      this.isLoading = false;
      this.refresh();
    }
  }

  refresh() {
    appState.notify();
  }

  setDate(dateStr) {
    this.selectedDate = dateStr;
    this.viewTab = 'date';
    this.loadTasks();
  }

  setTab(tab) {
    this.viewTab = tab;
    this.loadTasks();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('life_goals_tasks_view_mode', mode);
    }
    this.refresh();
  }

  setAvailableMinutes(mins) {
    this.availableMinutes = Math.max(15, parseInt(mins, 10) || 240);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('life_goals_planner_available_minutes', String(this.availableMinutes));
    }
    this.refresh();
  }

  // --------------------------------------------------------------------------
  // TASK LIFECYCLE ACTIONS
  // --------------------------------------------------------------------------

  async toggleTask(taskId) {
    try {
      await tasksService.toggleTask(taskId);
      toastManager.show({ message: 'Task updated!', type: 'success' });
    } catch (err) {
      console.error('[TasksController] Toggle error:', err);
      toastManager.show({ message: err.message || 'Failed to update task state.', type: 'error' });
    }
  }

  async confirmDeleteTask(taskId, taskTitle) {
    const confirmed = await openConfirmDialog({
      title: 'Delete or Cancel Task?',
      message: `Do you want to permanently delete "${taskTitle}"? (To preserve audit records, you can choose to mark it cancelled in the edit form).`,
      confirmText: 'Delete Task',
      cancelText: 'Keep Task',
      isDestructive: true,
    });

    if (confirmed) {
      try {
        await tasksService.deleteTask(taskId, { cancel: false });
        toastManager.show({ message: 'Task removed.', type: 'info' });
      } catch (err) {
        console.error('[TasksController] Delete error:', err);
        toastManager.show({ message: err.message || 'Failed to delete task.', type: 'error' });
      }
    }
  }

  // --------------------------------------------------------------------------
  // TASK MODAL ACTIONS
  // --------------------------------------------------------------------------

  async openTaskModal(taskToEdit = null) {
    const isEditing = Boolean(taskToEdit);
    this.isFormDirty = false;

    // Load available goals if not loaded
    if (this.goals.length === 0) {
      await this.loadGoals();
    }

    // Load goal milestones if goal is preselected
    let milestonesForGoal = [];
    if (taskToEdit && taskToEdit.goal_id) {
      try {
        milestonesForGoal = await milestonesService.listMilestones(taskToEdit.goal_id);
      } catch {
        // ignore
      }
    }

    const modalHtml = renderTaskFormModal({
      task: taskToEdit,
      defaultDate: this.selectedDate,
      goals: this.goals,
      milestones: milestonesForGoal,
      isSubmitting: false,
    });

    const modalHost = document.getElementById('tasks-modal-container') || document.body;
    let modalWrapper = document.getElementById('tasks-active-modal-wrapper');
    if (!modalWrapper) {
      modalWrapper = document.createElement('div');
      modalWrapper.id = 'tasks-active-modal-wrapper';
      modalHost.appendChild(modalWrapper);
    }
    modalWrapper.innerHTML = modalHtml;

    // Form inputs and color swatch selection
    const form = modalWrapper.querySelector('#task-modal-form');
    if (form) {
      form.addEventListener('input', () => {
        this.isFormDirty = true;
      });

      // Goal dropdown change -> dynamically fetch and update milestones dropdown
      const goalSelect = form.querySelector('#task-input-goal');
      const milestoneSelect = form.querySelector('#task-input-milestone');
      if (goalSelect && milestoneSelect) {
        goalSelect.addEventListener('change', async (e) => {
          const selectedGoalId = e.target.value;
          milestoneSelect.innerHTML = '<option value="">-- No Milestone --</option>';
          if (selectedGoalId) {
            try {
              const ms = await milestonesService.listMilestones(selectedGoalId);
              milestoneSelect.innerHTML += ms
                .map((m) => `<option value="${m.id}">${m.title}</option>`)
                .join('');
            } catch {
              // ignore
            }
          }
        });
      }

      // Color Swatches
      const swatches = form.querySelectorAll('.color-swatch');
      const colorInput = form.querySelector('#task-input-color');
      for (const swatch of swatches) {
        swatch.addEventListener('click', () => {
          swatches.forEach((s) => s.classList.remove('active'));
          swatch.classList.add('active');
          if (colorInput) {
            colorInput.value = swatch.getAttribute('data-color-id');
          }
          this.isFormDirty = true;
        });
      }
    }

    const closeModal = () => {
      if (this.isFormDirty) {
        if (!confirm('Discard unsaved task changes?')) return;
      }
      if (this.modalCleanup) this.modalCleanup();
      if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
      this.isFormDirty = false;
    };

    const handleFormSubmit = async () => {
      const formEl = document.getElementById('task-modal-form');
      if (!formEl) return;

      const formData = new FormData(formEl);
      const title = (formData.get('title') || '').trim();
      const description = (formData.get('description') || '').trim() || null;
      const priority = formData.get('priority') || 'medium';
      const status = formData.get('status') || 'pending';
      const recurrence = formData.get('recurrence') || 'none';
      const durationRaw = formData.get('estimated_duration');
      const scheduledDate = formData.get('scheduled_date') || this.selectedDate;
      const dueTime = (formData.get('due_time') || '').trim() || null;
      const goalId = formData.get('goal_id') || null;
      const milestoneId = formData.get('milestone_id') || null;
      const colorId = formData.get('color') || 'yellow';

      const validation = validateForm(
        { title, duration: durationRaw },
        {
          title: [ValidationRules.isRequired('Task Title'), ValidationRules.maxLength(200, 'Task Title')],
          duration: [ValidationRules.numberRange(1, 1440, 'Estimated Duration')],
        }
      );

      const titleInput = formEl.querySelector('#task-input-title');
      const durationInput = formEl.querySelector('#task-input-duration');

      if (!validation.isValid) {
        if (validation.errors.title && titleInput) {
          applyFieldValidationState(titleInput, false, validation.errors.title);
        }
        if (validation.errors.duration && durationInput) {
          applyFieldValidationState(durationInput, false, validation.errors.duration);
        }
        return;
      }

      const payload = {
        title,
        description,
        priority,
        recurrence,
        estimated_duration: parseInt(durationRaw, 10) || 30,
        scheduled_date: scheduledDate,
        due_time: dueTime,
        goal_id: goalId,
        milestone_id: milestoneId,
      };

      if (isEditing) {
        payload.status = status;
      }

      const submitBtn = document.getElementById('task-form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        let savedTask = null;
        if (isEditing) {
          savedTask = await tasksService.updateTask(taskToEdit.id, payload);
          taskColorManager.setTaskColor(taskToEdit.id, colorId);
          toastManager.show({ message: 'Task updated successfully!', type: 'success' });
        } else {
          savedTask = await tasksService.createTask(payload);
          if (savedTask && savedTask.id) {
            taskColorManager.setTaskColor(savedTask.id, colorId);
          }
          toastManager.show({ message: 'Task scheduled on your daily board!', type: 'success' });
        }

        this.isFormDirty = false;
        if (this.modalCleanup) this.modalCleanup();
        if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
      } catch (err) {
        console.error('[TasksController] Task save error:', err);
        toastManager.show({ message: err.message || 'Failed to save task.', type: 'error' });
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isEditing ? 'Update Task' : 'Schedule Task';
        }
      }
    };

    this.modalCleanup = attachModalListeners({
      onConfirm: handleFormSubmit,
      onCancel: closeModal,
      onClose: closeModal,
      confirmId: 'task-form-submit-btn',
      cancelId: 'task-form-cancel-btn',
      closeId: 'task-form-close-btn',
    });
  }

  // --------------------------------------------------------------------------
  // RESCHEDULE MODAL
  // --------------------------------------------------------------------------

  openRescheduleModal(task) {
    if (!task) return;

    const modalHtml = renderTaskRescheduleModal({ task });
    const modalHost = document.getElementById('tasks-modal-container') || document.body;
    let modalWrapper = document.getElementById('tasks-active-modal-wrapper');
    if (!modalWrapper) {
      modalWrapper = document.createElement('div');
      modalWrapper.id = 'tasks-active-modal-wrapper';
      modalHost.appendChild(modalWrapper);
    }
    modalWrapper.innerHTML = modalHtml;

    const closeModal = () => {
      if (this.modalCleanup) this.modalCleanup();
      if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
    };

    const handleRescheduleSubmit = async () => {
      const formEl = document.getElementById('task-reschedule-form');
      if (!formEl) return;

      const formData = new FormData(formEl);
      const newDate = formData.get('new_date');
      const dueTime = (formData.get('due_time') || '').trim() || null;
      const reason = (formData.get('reason') || '').trim() || null;

      if (!newDate) {
        const dateInput = formEl.querySelector('#reschedule-input-date');
        if (dateInput) applyFieldValidationState(dateInput, false, 'Please pick a new scheduled date.');
        return;
      }

      const submitBtn = document.getElementById('reschedule-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Rescheduling...';
      }

      try {
        await tasksService.rescheduleTask(task.id, {
          new_date: newDate,
          reason,
          due_time: dueTime,
        });

        toastManager.show({
          message: `Task carried forward to ${formatDateDisplay(newDate)}.`,
          type: 'success',
        });

        if (this.modalCleanup) this.modalCleanup();
        if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
      } catch (err) {
        console.error('[TasksController] Reschedule error:', err);
        toastManager.show({ message: err.message || 'Failed to reschedule task.', type: 'error' });
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm Reschedule';
        }
      }
    };

    this.modalCleanup = attachModalListeners({
      onConfirm: handleRescheduleSubmit,
      onCancel: closeModal,
      onClose: closeModal,
      confirmId: 'reschedule-submit-btn',
      cancelId: 'reschedule-cancel-btn',
      closeId: 'reschedule-close-btn',
    });
  }
}

export const tasksController = new TasksController();

/**
 * Main Tasks Page Render Export
 */
export function renderTasksPage() {
  if (!tasksController.isLoading && tasksController.tasks.length === 0 && !tasksController.error) {
    tasksController.loadTasks();
    tasksController.loadGoals();
  }

  // Filter client-side search query
  const searchQuery = (tasksController.filters.search || '').trim().toLowerCase();
  const visibleTasks = tasksController.tasks.filter((t) => {
    if (!searchQuery) return true;
    const matchTitle = (t.title || '').toLowerCase().includes(searchQuery);
    const matchDesc = (t.description || '').toLowerCase().includes(searchQuery);
    return matchTitle || matchDesc;
  });

  return `
    <div class="page-container flex flex-col gap-5">
      <!-- 1. Header with View Toggle & New Task CTA -->
      <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: var(--space-4);">
        <div>
          <h2>Daily Tasks & Planning</h2>
          <p class="text-sm text-muted">Plan your day, protect your focus time, and track execution.</p>
        </div>

        <div class="flex items-center gap-3">
          <!-- View Mode Toggle: Board vs Compact -->
          <div class="flex gap-1" style="background: var(--color-surface-hover); padding: 3px; border-radius: var(--radius-md);">
            <button
              id="tasks-view-board-btn"
              class="btn btn-sm ${tasksController.viewMode === 'board' ? 'btn-primary' : 'btn-ghost'}"
              title="Sticky Notes Board"
              aria-label="Sticky Notes Board"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>Sticky Board</span>
            </button>

            <button
              id="tasks-view-compact-btn"
              class="btn btn-sm ${tasksController.viewMode === 'compact' ? 'btn-primary' : 'btn-ghost'}"
              title="Compact Task List"
              aria-label="Compact Task List"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              <span>Compact List</span>
            </button>
          </div>

          <!-- Schedule New Task Button -->
          <button id="add-task-btn" class="btn btn-primary">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>New Task</span>
          </button>
        </div>
      </div>

      <!-- 2. Date Navigation & Filter Bar -->
      <div class="card flex flex-col gap-3" style="padding: var(--space-4);">
        <div class="filter-bar">
          <!-- Date Navigator Buttons -->
          <div class="flex items-center gap-1" style="background: var(--color-surface-hover); padding: 3px; border-radius: var(--radius-md);">
            <button class="btn btn-sm ${tasksController.viewTab === 'today' ? 'btn-primary' : 'btn-ghost'}" data-tab="today">
              Today
            </button>
            <button class="btn btn-sm ${tasksController.viewTab === 'tomorrow' ? 'btn-primary' : 'btn-ghost'}" data-tab="tomorrow">
              Tomorrow
            </button>
            <button class="btn btn-sm ${tasksController.viewTab === 'all' ? 'btn-primary' : 'btn-ghost'}" data-tab="all">
              All Tasks
            </button>
          </div>

          <!-- Specific Date Picker Input -->
          <div class="flex items-center gap-2">
            <label for="planner-date-select" class="text-xs text-muted">Plan Date:</label>
            <input
              id="planner-date-select"
              type="date"
              class="form-input text-xs"
              style="width: auto; padding: 0.35rem 0.6rem;"
              value="${tasksController.selectedDate}"
            />
          </div>

          <!-- Search Input -->
          <div class="search-input-wrapper">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              id="tasks-search-input"
              class="form-input text-sm"
              placeholder="Search tasks..."
              value="${tasksController.filters.search || ''}"
              aria-label="Search tasks"
            />
          </div>

          <!-- Status Dropdown -->
          <div class="flex items-center gap-2">
            <label for="tasks-status-select" class="text-xs text-muted">Status:</label>
            <select id="tasks-status-select" class="form-select text-xs" style="width: auto; padding: 0.35rem 0.6rem;">
              <option value="" ${!tasksController.filters.status ? 'selected' : ''}>All Statuses</option>
              <option value="pending" ${tasksController.filters.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="completed" ${tasksController.filters.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="not_completed" ${tasksController.filters.status === 'not_completed' ? 'selected' : ''}>Not Done</option>
              <option value="unverified" ${tasksController.filters.status === 'unverified' ? 'selected' : ''}>Unverified</option>
            </select>
          </div>

          <!-- Priority Grouping Toggle -->
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              id="tasks-priority-group-toggle"
              ${tasksController.groupByPriority ? 'checked' : ''}
              style="width: 16px; height: 16px; cursor: pointer;"
            />
            <label for="tasks-priority-group-toggle" class="text-xs text-muted font-medium" style="cursor: pointer;">
              Group by Priority
            </label>
          </div>
        </div>
      </div>

      <!-- 3. Dynamic Content: Loading Skeleton, Error, Planner Board, or Empty State -->
      ${
        tasksController.isLoading && tasksController.tasks.length === 0
          ? `
        <div class="flex flex-col gap-4">
          ${renderSkeletonCardList({ count: 6, layout: tasksController.viewMode === 'board' ? 'grid' : 'vertical' })}
        </div>
      `
          : tasksController.error
          ? `
        ${renderRetryableError({
          error: tasksController.error,
          retryButtonId: 'tasks-retry-btn',
          title: 'Unable to Load Daily Tasks',
        })}
      `
          : visibleTasks.length > 0
          ? `
        ${renderDailyPlanner({
          selectedDate: tasksController.selectedDate,
          tasks: visibleTasks,
          availableMinutes: tasksController.availableMinutes,
          viewMode: tasksController.viewMode,
          groupByPriority: tasksController.groupByPriority,
          goals: tasksController.goals,
        })}
      `
          : tasksController.tasks.length > 0 && visibleTasks.length === 0
          ? `
        ${renderEmptyState({
          title: 'No matching tasks',
          description: 'Try adjusting your search query or status filter to see other scheduled items.',
          actionText: 'Reset Filters',
          actionId: 'tasks-reset-filters-btn',
        })}
      `
          : `
        ${renderEmptyState({
          title: 'No tasks scheduled for this day',
          description: 'A calm day begins with clear priorities. Schedule your key tasks or set your available focus capacity.',
          actionText: 'Schedule a Task',
          actionId: 'add-task-empty-btn',
        })}
      `
      }

      <div id="tasks-modal-container"></div>
    </div>
  `;
}

/**
 * Event binding helper for Tasks page
 * Called by app.js after rendering DOM
 */
export function bindTasksEvents(container) {
  if (!container) return;

  // 1. Add Task Buttons
  const addTaskBtn = container.querySelector('#add-task-btn');
  const addTaskEmptyBtn = container.querySelector('#add-task-empty-btn');
  if (addTaskBtn) addTaskBtn.addEventListener('click', () => tasksController.openTaskModal(null));
  if (addTaskEmptyBtn) addTaskEmptyBtn.addEventListener('click', () => tasksController.openTaskModal(null));

  // 2. View Mode Toggles
  const boardBtn = container.querySelector('#tasks-view-board-btn');
  const compactBtn = container.querySelector('#tasks-view-compact-btn');
  if (boardBtn) boardBtn.addEventListener('click', () => tasksController.setViewMode('board'));
  if (compactBtn) compactBtn.addEventListener('click', () => tasksController.setViewMode('compact'));

  // 3. Tab Buttons (Today, Tomorrow, All)
  const tabBtns = container.querySelectorAll('[data-tab]');
  for (const btn of tabBtns) {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      tasksController.setTab(tab);
    });
  }

  // 4. Date Picker Input
  const datePicker = container.querySelector('#planner-date-select');
  if (datePicker) {
    datePicker.addEventListener('change', (e) => {
      if (e.target.value) {
        tasksController.setDate(e.target.value);
      }
    });
  }

  // 5. Search Input
  const searchInput = container.querySelector('#tasks-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      tasksController.filters.search = e.target.value;
      tasksController.refresh();
    });
  }

  // 6. Status Select
  const statusSelect = container.querySelector('#tasks-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      tasksController.filters.status = e.target.value;
      tasksController.loadTasks();
    });
  }

  // 7. Priority Grouping Toggle
  const groupToggle = container.querySelector('#tasks-priority-group-toggle');
  if (groupToggle) {
    groupToggle.addEventListener('change', (e) => {
      tasksController.groupByPriority = e.target.checked;
      tasksController.refresh();
    });
  }

  // 8. Available Minutes Input
  const availableInput = container.querySelector('#planner-available-minutes');
  if (availableInput) {
    availableInput.addEventListener('change', (e) => {
      tasksController.setAvailableMinutes(e.target.value);
    });
  }

  // 9. Reset Filters Button
  const resetFiltersBtn = container.querySelector('#tasks-reset-filters-btn');
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      tasksController.filters = { search: '', status: '', priority: '' };
      tasksController.loadTasks();
    });
  }

  // 10. Retry Button
  const retryBtn = container.querySelector('#tasks-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => tasksController.loadTasks());
  }

  // 11. Task Interactive Actions (Toggle, Edit, Reschedule, Delete)
  const toggleBtns = container.querySelectorAll('.task-toggle-btn');
  for (const btn of toggleBtns) {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task-id');
      if (taskId) tasksController.toggleTask(taskId);
    });
  }

  const editBtns = container.querySelectorAll('.task-edit-btn');
  for (const btn of editBtns) {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task-id');
      const task = tasksController.tasks.find((t) => t.id === taskId);
      if (task) tasksController.openTaskModal(task);
    });
  }

  const rescheduleBtns = container.querySelectorAll('.task-reschedule-btn');
  for (const btn of rescheduleBtns) {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task-id');
      const task = tasksController.tasks.find((t) => t.id === taskId);
      if (task) tasksController.openRescheduleModal(task);
    });
  }

  const deleteBtns = container.querySelectorAll('.task-delete-btn');
  for (const btn of deleteBtns) {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task-id');
      const title = btn.getAttribute('data-title') || 'this task';
      if (taskId) tasksController.confirmDeleteTask(taskId, title);
    });
  }
}
