/**
 * Goals and Milestones Page Coordinator
 * 
 * Manages goals overview, details view, interactive modal forms,
 * milestone lifecycle, sorting, filtering, and responsive interactions.
 */

import { goalsService } from '../services/goals-service.js';
import { milestonesService } from '../services/milestones-service.js';
import { DataEvents, DATA_TOPICS } from '../services/data-events.js';
import { appState } from '../services/state.js';
import { toastManager } from '../components/toast.js';
import { openConfirmDialog } from '../components/confirm-dialog.js';
import { attachModalListeners } from '../components/modal.js';
import { ValidationRules, validateForm, applyFieldValidationState } from '../components/form-validation.js';

import { renderGoalsList } from './goals/goals-list.js';
import { renderGoalDetails } from './goals/goal-details.js';
import { renderGoalFormModal } from './goals/goal-form-modal.js';
import { renderMilestoneFormModal } from './goals/milestone-form-modal.js';

class GoalsController {
  constructor() {
    this.view = 'list'; // 'list' | 'details'
    this.selectedGoalId = null;
    this.selectedGoal = null;
    this.milestones = [];
    this.goals = [];
    this.isLoading = false;
    this.isLoadingMilestones = false;
    this.error = null;
    this.filters = {
      timeframe: '',
      status: '',
      category: '',
      search: '',
      sort_by: 'created_at',
    };
    this.modalCleanup = null;
    this.isFormDirty = false;

    // Subscribe to reactive data events
    DataEvents.on(DATA_TOPICS.GOALS_CHANGED, () => {
      this.loadGoals({ silent: true });
      if (this.selectedGoalId && this.view === 'details') {
        this.loadGoalDetails(this.selectedGoalId, { silent: true });
      }
    });

    DataEvents.on(DATA_TOPICS.MILESTONES_CHANGED, () => {
      if (this.selectedGoalId && this.view === 'details') {
        this.loadGoalDetails(this.selectedGoalId, { silent: true });
      }
    });
  }

  async loadGoals({ silent = false } = {}) {
    if (!silent) {
      this.isLoading = true;
      this.error = null;
    }

    try {
      const response = await goalsService.listGoals({
        timeframe: this.filters.timeframe || undefined,
        status: this.filters.status || undefined,
        category: this.filters.category || undefined,
        sort_by: this.filters.sort_by || 'created_at',
        limit: 100,
      });

      this.goals = (response && response.items) || [];
      this.error = null;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[GoalsController] Failed to load goals:', err);
        this.error = err;
      }
    } finally {
      this.isLoading = false;
      this.refresh();
    }
  }

  async loadGoalDetails(goalId, { silent = false } = {}) {
    this.selectedGoalId = goalId;
    if (!silent) {
      this.isLoadingMilestones = true;
    }

    try {
      const [goal, milestones] = await Promise.all([
        goalsService.getGoal(goalId),
        milestonesService.listMilestones(goalId),
      ]);

      this.selectedGoal = goal;
      this.milestones = milestones || [];
    } catch (err) {
      console.error('[GoalsController] Failed to load goal details:', err);
      toastManager.show({
        message: err.message || 'Failed to load goal details.',
        type: 'error',
      });
    } finally {
      this.isLoadingMilestones = false;
      this.refresh();
    }
  }

  refresh() {
    // Notify application state to re-render the view
    appState.notify();
  }

  setView(view, goalId = null) {
    this.view = view;
    if (view === 'details' && goalId) {
      this.loadGoalDetails(goalId);
    } else {
      this.selectedGoalId = null;
      this.selectedGoal = null;
      this.milestones = [];
      this.refresh();
    }
  }

  // --------------------------------------------------------------------------
  // GOAL MODAL ACTIONS
  // --------------------------------------------------------------------------

  openGoalModal(goalToEdit = null) {
    const isEditing = Boolean(goalToEdit);
    this.isFormDirty = false;

    const modalHtml = renderGoalFormModal({
      goal: goalToEdit,
      isSubmitting: false,
      errorMessage: null,
    });

    // Mount modal into modal container
    const modalHost = document.getElementById('goals-modal-container') || document.body;
    let modalWrapper = document.getElementById('goals-active-modal-wrapper');
    if (!modalWrapper) {
      modalWrapper = document.createElement('div');
      modalWrapper.id = 'goals-active-modal-wrapper';
      modalHost.appendChild(modalWrapper);
    }
    modalWrapper.innerHTML = modalHtml;

    const form = modalWrapper.querySelector('#goal-modal-form');
    if (form) {
      form.addEventListener('input', () => {
        this.isFormDirty = true;
      });
    }

    const closeModal = () => {
      if (this.isFormDirty) {
        if (!confirm('You have unsaved changes in this goal form. Discard changes?')) {
          return;
        }
      }
      if (this.modalCleanup) this.modalCleanup();
      if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
      this.isFormDirty = false;
    };

    const handleFormSubmit = async () => {
      const formEl = document.getElementById('goal-modal-form');
      if (!formEl) return;

      const formData = new FormData(formEl);
      const title = (formData.get('title') || '').trim();
      const description = (formData.get('description') || '').trim();
      const category = formData.get('category');
      const timeframe = formData.get('timeframe');
      const priority = formData.get('priority');
      const status = formData.get('status') || 'active';
      const startDate = formData.get('start_date') || null;
      const targetDate = formData.get('target_date') || null;
      const targetValRaw = formData.get('target_value');
      const currentValRaw = formData.get('current_value');
      const unit = (formData.get('unit') || '').trim() || null;
      const dateChangeReason = (formData.get('date_change_reason') || '').trim() || null;

      // Validation Rules
      const rules = {
        title: [ValidationRules.required, ValidationRules.maxLength(200, 'Goal Title')],
      };
      const validation = validateForm({ title }, rules);

      // Validate Date Chronological Order
      if (startDate && targetDate) {
        const dateErr = ValidationRules.dateOrder(startDate, targetDate, 'Start date', 'Target deadline');
        if (dateErr) {
          validation.isValid = false;
          validation.errors.target_date = dateErr;
        }
      }

      const titleInput = formEl.querySelector('#goal-input-title');
      const targetDateInput = formEl.querySelector('#goal-input-target-date');

      if (!validation.isValid) {
        if (validation.errors.title && titleInput) {
          applyFieldValidationState(titleInput, false, validation.errors.title);
        }
        if (validation.errors.target_date && targetDateInput) {
          applyFieldValidationState(targetDateInput, false, validation.errors.target_date);
        }
        return;
      }

      // Format payload
      const payload = {
        title,
        description: description || null,
        category,
        timeframe,
        priority,
        start_date: startDate,
        target_date: targetDate,
        target_value: targetValRaw !== '' && targetValRaw !== null ? Number(targetValRaw) : null,
        current_value: currentValRaw !== '' && currentValRaw !== null ? Number(currentValRaw) : 0,
        unit,
      };

      if (isEditing) {
        payload.status = status;
        if (dateChangeReason) {
          payload.date_change_reason = dateChangeReason;
        }
      }

      // Submit Button Loading State
      const submitBtn = document.getElementById('goal-form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        if (isEditing) {
          await goalsService.updateGoal(goalToEdit.id, payload);
          toastManager.show({ message: 'Goal updated successfully!', type: 'success' });
        } else {
          await goalsService.createGoal(payload);
          toastManager.show({ message: 'New goal defined successfully!', type: 'success' });
        }

        this.isFormDirty = false;
        if (this.modalCleanup) this.modalCleanup();
        if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
      } catch (err) {
        console.error('[GoalsController] Save error:', err);
        const errMsg = err.message || 'Failed to save goal. Please check all fields.';
        toastManager.show({ message: errMsg, type: 'error' });
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isEditing ? 'Update Goal' : 'Create Goal';
        }
      }
    };

    this.modalCleanup = attachModalListeners({
      onConfirm: handleFormSubmit,
      onCancel: closeModal,
      onClose: closeModal,
      confirmId: 'goal-form-submit-btn',
      cancelId: 'goal-form-cancel-btn',
      closeId: 'goal-form-close-btn',
    });
  }

  // --------------------------------------------------------------------------
  // MILESTONE MODAL ACTIONS
  // --------------------------------------------------------------------------

  openMilestoneModal(goalId, milestoneToEdit = null) {
    const isEditing = Boolean(milestoneToEdit);
    this.isFormDirty = false;

    const modalHtml = renderMilestoneFormModal({
      goalId,
      milestone: milestoneToEdit,
      isSubmitting: false,
    });

    const modalHost = document.getElementById('goals-modal-container') || document.body;
    let modalWrapper = document.getElementById('goals-active-modal-wrapper');
    if (!modalWrapper) {
      modalWrapper = document.createElement('div');
      modalWrapper.id = 'goals-active-modal-wrapper';
      modalHost.appendChild(modalWrapper);
    }
    modalWrapper.innerHTML = modalHtml;

    const form = modalWrapper.querySelector('#milestone-modal-form');
    if (form) {
      form.addEventListener('input', () => {
        this.isFormDirty = true;
      });
    }

    const closeModal = () => {
      if (this.isFormDirty) {
        if (!confirm('Discard unsaved milestone changes?')) return;
      }
      if (this.modalCleanup) this.modalCleanup();
      if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
      this.isFormDirty = false;
    };

    const handleFormSubmit = async () => {
      const formEl = document.getElementById('milestone-modal-form');
      if (!formEl) return;

      const formData = new FormData(formEl);
      const title = (formData.get('title') || '').trim();
      const description = (formData.get('description') || '').trim() || null;
      const targetDate = formData.get('target_date') || null;
      const order = Number(formData.get('order') || 1);
      const weight = Number(formData.get('weight') || 1.0);
      const isCompleted = formData.get('is_completed') === 'on';
      const dateChangeReason = (formData.get('date_change_reason') || '').trim() || null;

      const validation = validateForm(
        { title },
        { title: [ValidationRules.required, ValidationRules.maxLength(200, 'Milestone Title')] }
      );

      const titleInput = formEl.querySelector('#milestone-input-title');
      if (!validation.isValid) {
        if (titleInput) applyFieldValidationState(titleInput, false, validation.errors.title);
        return;
      }

      const submitBtn = document.getElementById('milestone-form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        if (isEditing) {
          const payload = {
            title,
            description,
            target_date: targetDate,
            order,
            weight,
            is_completed: isCompleted,
          };
          if (dateChangeReason) payload.date_change_reason = dateChangeReason;

          await milestonesService.updateMilestone(goalId, milestoneToEdit.id, payload);
          toastManager.show({ message: 'Milestone updated!', type: 'success' });
        } else {
          await milestonesService.createMilestone(goalId, {
            title,
            description,
            target_date: targetDate,
            order,
            weight,
          });
          toastManager.show({ message: 'Checkpoint milestone added!', type: 'success' });
        }

        this.isFormDirty = false;
        if (this.modalCleanup) this.modalCleanup();
        if (modalWrapper.parentNode) modalWrapper.parentNode.removeChild(modalWrapper);
      } catch (err) {
        console.error('[GoalsController] Milestone save error:', err);
        toastManager.show({ message: err.message || 'Failed to save milestone.', type: 'error' });
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isEditing ? 'Update Milestone' : 'Add Milestone';
        }
      }
    };

    this.modalCleanup = attachModalListeners({
      onConfirm: handleFormSubmit,
      onCancel: closeModal,
      onClose: closeModal,
      confirmId: 'milestone-form-submit-btn',
      cancelId: 'milestone-form-cancel-btn',
      closeId: 'milestone-form-close-btn',
    });
  }

  // --------------------------------------------------------------------------
  // DESTRUCTIVE CONFIRMATIONS
  // --------------------------------------------------------------------------

  async confirmDeleteGoal(goalId) {
    const confirmed = await openConfirmDialog({
      title: 'Archive or Delete Goal?',
      message: 'Archiving preserves historical progress and review snapshots. Permanent removal will cascade to all milestones and cannot be undone.',
      confirmText: 'Archive Goal',
      cancelText: 'Cancel',
      isDestructive: true,
    });

    if (confirmed) {
      try {
        await goalsService.deleteGoal(goalId, { permanent: false });
        toastManager.show({ message: 'Goal safely archived.', type: 'info' });
        this.setView('list');
      } catch (err) {
        console.error('[GoalsController] Delete error:', err);
        toastManager.show({ message: err.message || 'Failed to archive goal.', type: 'error' });
      }
    }
  }

  async confirmDeleteMilestone(goalId, milestoneId, milestoneTitle) {
    const confirmed = await openConfirmDialog({
      title: 'Delete Checkpoint Milestone?',
      message: `Are you sure you want to delete "${milestoneTitle}"? This will recalculate weighted progress towards this goal.`,
      confirmText: 'Delete Milestone',
      cancelText: 'Cancel',
      isDestructive: true,
    });

    if (confirmed) {
      try {
        await milestonesService.deleteMilestone(goalId, milestoneId);
        toastManager.show({ message: 'Milestone removed.', type: 'info' });
      } catch (err) {
        console.error('[GoalsController] Delete milestone error:', err);
        toastManager.show({ message: err.message || 'Failed to delete milestone.', type: 'error' });
      }
    }
  }

  async toggleMilestone(goalId, milestoneId, currentCompleted) {
    try {
      await milestonesService.updateMilestone(goalId, milestoneId, {
        is_completed: !currentCompleted,
      });
      toastManager.show({
        message: !currentCompleted ? 'Checkpoint completed!' : 'Checkpoint marked pending.',
        type: 'success',
      });
    } catch (err) {
      console.error('[GoalsController] Toggle error:', err);
      toastManager.show({ message: err.message || 'Failed to update milestone status.', type: 'error' });
    }
  }

  async reorderMilestone(goalId, milestoneId, currentOrder, direction) {
    const newOrder = direction === 'up' ? Math.max(0, currentOrder - 1) : currentOrder + 1;
    try {
      await milestonesService.updateMilestone(goalId, milestoneId, {
        order: newOrder,
      });
    } catch (err) {
      console.error('[GoalsController] Reorder error:', err);
      toastManager.show({ message: err.message || 'Failed to reorder milestone.', type: 'error' });
    }
  }
}

export const goalsController = new GoalsController();

/**
 * Main export rendered by the Application Coordinator
 */
export function renderGoalsPage() {
  // If no goals loaded yet, trigger initial fetch
  if (!goalsController.isLoading && goalsController.goals.length === 0 && !goalsController.error) {
    goalsController.loadGoals();
  }

  if (goalsController.view === 'details' && goalsController.selectedGoal) {
    return `
      ${renderGoalDetails({
        goal: goalsController.selectedGoal,
        milestones: goalsController.milestones,
        isLoadingMilestones: goalsController.isLoadingMilestones,
      })}
      <div id="goals-modal-container"></div>
    `;
  }

  return `
    ${renderGoalsList({
      goals: goalsController.goals,
      isLoading: goalsController.isLoading,
      error: goalsController.error,
      filters: goalsController.filters,
      onRetry: () => goalsController.loadGoals(),
    })}
    <div id="goals-modal-container"></div>
  `;
}

/**
 * Event binding helper for the Goals page
 * Called by app.js after mounting DOM
 */
export function bindGoalsEvents(container) {
  if (!container) return;

  // 1. New Goal Button
  const addGoalBtn = container.querySelector('#add-goal-btn');
  const addGoalEmptyBtn = container.querySelector('#add-goal-empty-btn');
  if (addGoalBtn) addGoalBtn.addEventListener('click', () => goalsController.openGoalModal(null));
  if (addGoalEmptyBtn) addGoalEmptyBtn.addEventListener('click', () => goalsController.openGoalModal(null));

  // 2. Goal Card Click -> Open Details
  const goalCards = container.querySelectorAll('.goal-card-clickable');
  for (const card of goalCards) {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicked inside an interactive button
      if (e.target.closest('button')) return;
      const goalId = card.getAttribute('data-goal-id');
      if (goalId) goalsController.setView('details', goalId);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const goalId = card.getAttribute('data-goal-id');
        if (goalId) goalsController.setView('details', goalId);
      }
    });
  }

  // 3. Search Input
  const searchInput = container.querySelector('#goals-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      goalsController.filters.search = e.target.value;
      goalsController.refresh();
    });
  }

  // 4. Timeframe Filters
  const timeframeBtns = container.querySelectorAll('[data-filter-timeframe]');
  for (const btn of timeframeBtns) {
    btn.addEventListener('click', () => {
      goalsController.filters.timeframe = btn.getAttribute('data-filter-timeframe') || '';
      goalsController.loadGoals();
    });
  }

  // 5. Status Select
  const statusSelect = container.querySelector('#goals-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      goalsController.filters.status = e.target.value;
      goalsController.loadGoals();
    });
  }

  // 6. Sort Select
  const sortSelect = container.querySelector('#goals-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      goalsController.filters.sort_by = e.target.value;
      goalsController.loadGoals();
    });
  }

  // 7. Reset Filters Button
  const resetFiltersBtn = container.querySelector('#reset-filters-btn');
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      goalsController.filters = { timeframe: '', status: '', category: '', search: '', sort_by: 'created_at' };
      goalsController.loadGoals();
    });
  }

  // 8. Error Retry Button
  const retryBtn = container.querySelector('#goals-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => goalsController.loadGoals());
  }

  // --------------------------------------------------------------------------
  // DETAILS VIEW EVENTS
  // --------------------------------------------------------------------------

  // Back Button
  const backBtn = container.querySelector('#goal-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => goalsController.setView('list'));
  }

  // Edit Goal Button
  const editGoalBtn = container.querySelector('#edit-goal-btn');
  if (editGoalBtn) {
    editGoalBtn.addEventListener('click', () => {
      if (goalsController.selectedGoal) {
        goalsController.openGoalModal(goalsController.selectedGoal);
      }
    });
  }

  // Delete Goal Button
  const deleteGoalBtn = container.querySelector('#delete-goal-btn');
  if (deleteGoalBtn) {
    deleteGoalBtn.addEventListener('click', () => {
      const goalId = deleteGoalBtn.getAttribute('data-goal-id');
      if (goalId) goalsController.confirmDeleteGoal(goalId);
    });
  }

  // Add Milestone Buttons
  const addMilestoneBtn = container.querySelector('#add-milestone-btn');
  const addMilestoneEmptyBtn = container.querySelector('#add-milestone-empty-btn');
  const handleAddMilestone = () => {
    if (goalsController.selectedGoalId) {
      goalsController.openMilestoneModal(goalsController.selectedGoalId, null);
    }
  };
  if (addMilestoneBtn) addMilestoneBtn.addEventListener('click', handleAddMilestone);
  if (addMilestoneEmptyBtn) addMilestoneEmptyBtn.addEventListener('click', handleAddMilestone);

  // Milestone Complete Toggle
  const toggleBtns = container.querySelectorAll('.milestone-toggle-btn');
  for (const btn of toggleBtns) {
    btn.addEventListener('click', () => {
      const milestoneId = btn.getAttribute('data-milestone-id');
      const isCompleted = btn.getAttribute('data-completed') === 'true';
      if (goalsController.selectedGoalId && milestoneId) {
        goalsController.toggleMilestone(goalsController.selectedGoalId, milestoneId, isCompleted);
      }
    });
  }

  // Milestone Move Up / Down Buttons
  const moveUpBtns = container.querySelectorAll('.milestone-move-up-btn');
  for (const btn of moveUpBtns) {
    btn.addEventListener('click', () => {
      const milestoneId = btn.getAttribute('data-milestone-id');
      const order = Number(btn.getAttribute('data-order') || 1);
      if (goalsController.selectedGoalId && milestoneId) {
        goalsController.reorderMilestone(goalsController.selectedGoalId, milestoneId, order, 'up');
      }
    });
  }

  const moveDownBtns = container.querySelectorAll('.milestone-move-down-btn');
  for (const btn of moveDownBtns) {
    btn.addEventListener('click', () => {
      const milestoneId = btn.getAttribute('data-milestone-id');
      const order = Number(btn.getAttribute('data-order') || 1);
      if (goalsController.selectedGoalId && milestoneId) {
        goalsController.reorderMilestone(goalsController.selectedGoalId, milestoneId, order, 'down');
      }
    });
  }

  // Milestone Edit Button
  const editMilestoneBtns = container.querySelectorAll('.milestone-edit-btn');
  for (const btn of editMilestoneBtns) {
    btn.addEventListener('click', () => {
      const milestoneId = btn.getAttribute('data-milestone-id');
      const m = goalsController.milestones.find((item) => item.id === milestoneId);
      if (goalsController.selectedGoalId && m) {
        goalsController.openMilestoneModal(goalsController.selectedGoalId, m);
      }
    });
  }

  // Milestone Delete Button
  const deleteMilestoneBtns = container.querySelectorAll('.milestone-delete-btn');
  for (const btn of deleteMilestoneBtns) {
    btn.addEventListener('click', () => {
      const milestoneId = btn.getAttribute('data-milestone-id');
      const title = btn.getAttribute('data-title') || 'this checkpoint';
      if (goalsController.selectedGoalId && milestoneId) {
        goalsController.confirmDeleteMilestone(goalsController.selectedGoalId, milestoneId, title);
      }
    });
  }
}
