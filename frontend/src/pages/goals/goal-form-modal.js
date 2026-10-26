/**
 * Goal Creation and Editing Modal Form Component
 * 
 * Includes all required fields: title, description, category, timeframe,
 * start date, deadline, priority, measurable target metrics, and unit.
 * Supports date change reason tracking for existing goals.
 */

import { renderModal, attachModalListeners } from '../../components/modal.js';
import { ValidationRules, validateForm, applyFieldValidationState } from '../../components/form-validation.js';

/**
 * Render Goal Form HTML
 * @param {Object} options
 * @param {Object} [options.goal] - Existing goal data if editing (null for new goal)
 * @param {boolean} [options.isSubmitting=false]
 * @param {string|null} [options.errorMessage=null]
 * @returns {string} HTML string
 */
export function renderGoalFormModal({
  goal = null,
  isSubmitting = false,
  errorMessage = null,
} = {}) {
  const isEditing = Boolean(goal && goal.id);
  const title = isEditing ? 'Edit Goal & Milestones' : 'Define New Life Goal';
  const confirmText = isSubmitting ? 'Saving...' : isEditing ? 'Update Goal' : 'Create Goal';

  const g = goal || {
    title: '',
    description: '',
    category: 'personal_growth',
    timeframe: 'short_term',
    priority: 'medium',
    status: 'active',
    start_date: new Date().toISOString().split('T')[0],
    target_date: '',
    target_value: '',
    current_value: 0,
    unit: '',
  };

  const content = `
    <form id="goal-modal-form" novalidate class="flex flex-col gap-4">
      ${
        errorMessage
          ? `
        <div class="card" style="border-left: 4px solid var(--color-danger-solid); background-color: var(--color-danger-bg); padding: var(--space-3);" role="alert">
          <p class="text-xs" style="color: var(--color-danger-solid); font-weight: var(--font-weight-medium);">${errorMessage}</p>
        </div>
      `
          : ''
      }

      <!-- Title Input -->
      <div class="form-group">
        <label class="form-label" for="goal-input-title">
          Goal Title <span style="color: var(--color-danger-solid);">*</span>
        </label>
        <input
          id="goal-input-title"
          name="title"
          class="form-input"
          placeholder="e.g. Master Cloud Architecture & Pass Exam"
          value="${g.title || ''}"
          required
          maxlength="200"
          autocomplete="off"
        />
      </div>

      <!-- Description -->
      <div class="form-group">
        <label class="form-label" for="goal-input-description">Description & Motivations</label>
        <textarea
          id="goal-input-description"
          name="description"
          class="form-textarea"
          rows="2"
          placeholder="Why does this goal matter to your life vision? What will success look like?"
          maxlength="2000"
        >${g.description || ''}</textarea>
      </div>

      <!-- Category & Priority Row -->
      <div class="grid grid-cols-2 gap-3">
        <div class="form-group">
          <label class="form-label" for="goal-input-category">Category</label>
          <select id="goal-input-category" name="category" class="form-select">
            <option value="career" ${g.category === 'career' ? 'selected' : ''}>Career & Professional</option>
            <option value="health" ${g.category === 'health' ? 'selected' : ''}>Health & Fitness</option>
            <option value="finance" ${g.category === 'finance' ? 'selected' : ''}>Financial Freedom</option>
            <option value="relationships" ${g.category === 'relationships' ? 'selected' : ''}>Relationships & Family</option>
            <option value="personal_growth" ${g.category === 'personal_growth' ? 'selected' : ''}>Personal Growth & Learning</option>
            <option value="lifestyle" ${g.category === 'lifestyle' ? 'selected' : ''}>Lifestyle & Creativity</option>
            <option value="other" ${g.category === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="goal-input-priority">Priority</label>
          <select id="goal-input-priority" name="priority" class="form-select">
            <option value="low" ${g.priority === 'low' ? 'selected' : ''}>Low Priority</option>
            <option value="medium" ${g.priority === 'medium' ? 'selected' : ''}>Medium Priority</option>
            <option value="high" ${g.priority === 'high' ? 'selected' : ''}>High Priority</option>
          </select>
        </div>
      </div>

      <!-- Timeframe & Status Row -->
      <div class="grid grid-cols-2 gap-3">
        <div class="form-group">
          <label class="form-label" for="goal-input-timeframe">Timeframe</label>
          <select id="goal-input-timeframe" name="timeframe" class="form-select">
            <option value="short_term" ${g.timeframe === 'short_term' ? 'selected' : ''}>Short-Term (&lt; 3 Months)</option>
            <option value="medium_term" ${g.timeframe === 'medium_term' ? 'selected' : ''}>Medium-Term (3 - 12 Months)</option>
            <option value="long_term" ${g.timeframe === 'long_term' ? 'selected' : ''}>Long-Term (1+ Years)</option>
          </select>
        </div>

        ${
          isEditing
            ? `
          <div class="form-group">
            <label class="form-label" for="goal-input-status">Status</label>
            <select id="goal-input-status" name="status" class="form-select">
              <option value="active" ${g.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="completed" ${g.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="paused" ${g.status === 'paused' ? 'selected' : ''}>Paused</option>
              <option value="archived" ${g.status === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
          </div>
        `
            : `
          <div class="form-group">
            <label class="form-label" for="goal-input-start-date">Start Date</label>
            <input
              id="goal-input-start-date"
              name="start_date"
              type="date"
              class="form-input"
              value="${g.start_date || ''}"
            />
          </div>
        `
        }
      </div>

      <!-- Dates Row -->
      <div class="grid grid-cols-2 gap-3">
        ${
          isEditing
            ? `
          <div class="form-group">
            <label class="form-label" for="goal-input-start-date">Start Date</label>
            <input
              id="goal-input-start-date"
              name="start_date"
              type="date"
              class="form-input"
              value="${g.start_date || ''}"
            />
          </div>
        `
            : ''
        }

        <div class="form-group">
          <label class="form-label" for="goal-input-target-date">Target Deadline</label>
          <input
            id="goal-input-target-date"
            name="target_date"
            type="date"
            class="form-input"
            value="${g.target_date || ''}"
          />
        </div>

        ${
          isEditing
            ? `
          <div class="form-group" style="grid-column: span 2;">
            <label class="form-label" for="goal-input-change-reason">Reason for Deadline Change (Audit Log)</label>
            <input
              id="goal-input-change-reason"
              name="date_change_reason"
              class="form-input text-xs"
              placeholder="e.g. Adjusted timeline due to milestone additions"
              maxlength="500"
            />
          </div>
        `
            : ''
        }
      </div>

      <!-- Measurable Targets (Optional) -->
      <div class="card" style="background-color: var(--color-surface-hover); padding: var(--space-3); border: 1px dashed var(--color-border-medium);">
        <p class="text-xs font-bold" style="margin-bottom: var(--space-2); color: var(--color-text-primary);">
          Quantitative Metric (Optional)
        </p>
        <div class="grid grid-cols-3 gap-2">
          <div class="form-group">
            <label class="text-xs text-muted" for="goal-input-target-value">Target Goal</label>
            <input
              id="goal-input-target-value"
              name="target_value"
              type="number"
              step="any"
              min="0"
              class="form-input text-xs"
              placeholder="e.g. 50"
              value="${g.target_value ?? ''}"
            />
          </div>

          <div class="form-group">
            <label class="text-xs text-muted" for="goal-input-current-value">Current Progress</label>
            <input
              id="goal-input-current-value"
              name="current_value"
              type="number"
              step="any"
              min="0"
              class="form-input text-xs"
              placeholder="e.g. 10"
              value="${g.current_value ?? 0}"
            />
          </div>

          <div class="form-group">
            <label class="text-xs text-muted" for="goal-input-unit">Metric Unit</label>
            <input
              id="goal-input-unit"
              name="unit"
              class="form-input text-xs"
              placeholder="pages, km, $, etc."
              value="${g.unit || ''}"
              maxlength="50"
            />
          </div>
        </div>
      </div>
    </form>
  `;

  return renderModal({
    title,
    content,
    confirmText,
    cancelText: 'Cancel',
    confirmId: 'goal-form-submit-btn',
    cancelId: 'goal-form-cancel-btn',
    closeId: 'goal-form-close-btn',
  });
}
