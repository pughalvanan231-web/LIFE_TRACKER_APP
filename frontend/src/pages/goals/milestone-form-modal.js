/**
 * Milestone Creation & Editing Modal Component
 * 
 * Includes fields for title, description, target date, sequence order,
 * relative weight contribution to parent goal, and completion status.
 */

import { renderModal } from '../../components/modal.js';

export function renderMilestoneFormModal({
  goalId,
  milestone = null,
  isSubmitting = false,
  errorMessage = null,
} = {}) {
  const isEditing = Boolean(milestone && milestone.id);
  const title = isEditing ? 'Edit Goal Milestone' : 'Add Checkpoint Milestone';
  const confirmText = isSubmitting ? 'Saving...' : isEditing ? 'Update Milestone' : 'Add Milestone';

  const m = milestone || {
    title: '',
    description: '',
    target_date: '',
    order: 1,
    weight: 1.0,
    is_completed: false,
  };

  const content = `
    <form id="milestone-modal-form" novalidate class="flex flex-col gap-4">
      ${
        errorMessage
          ? `
        <div class="card" style="border-left: 4px solid var(--color-danger-solid); background-color: var(--color-danger-bg); padding: var(--space-3);" role="alert">
          <p class="text-xs" style="color: var(--color-danger-solid); font-weight: var(--font-weight-medium);">${errorMessage}</p>
        </div>
      `
          : ''
      }

      <div class="form-group">
        <label class="form-label" for="milestone-input-title">
          Milestone Title <span style="color: var(--color-danger-solid);">*</span>
        </label>
        <input
          id="milestone-input-title"
          name="title"
          class="form-input"
          placeholder="e.g. Complete Fundamentals Course & Practice Exams"
          value="${m.title || ''}"
          required
          maxlength="200"
          autocomplete="off"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="milestone-input-description">Key Requirements / Notes</label>
        <textarea
          id="milestone-input-description"
          name="description"
          class="form-textarea text-xs"
          rows="2"
          placeholder="Specific deliverables or criteria that verify this checkpoint is reached"
          maxlength="1000"
        >${m.description || ''}</textarea>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="form-group">
          <label class="form-label" for="milestone-input-target-date">Target Date</label>
          <input
            id="milestone-input-target-date"
            name="target_date"
            type="date"
            class="form-input text-xs"
            value="${m.target_date || ''}"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="milestone-input-order">Sequence Order</label>
          <input
            id="milestone-input-order"
            name="order"
            type="number"
            min="0"
            class="form-input text-xs"
            value="${m.order ?? 1}"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="milestone-input-weight">Relative Weight</label>
          <input
            id="milestone-input-weight"
            name="weight"
            type="number"
            step="0.5"
            min="0.1"
            max="100"
            class="form-input text-xs"
            value="${m.weight ?? 1.0}"
            title="Weight determines how much this milestone contributes to goal progress"
          />
        </div>
      </div>

      ${
        isEditing
          ? `
        <div class="flex items-center gap-2" style="margin-top: var(--space-1);">
          <input
            type="checkbox"
            id="milestone-input-completed"
            name="is_completed"
            ${m.is_completed ? 'checked' : ''}
            style="width: 16px; height: 16px; cursor: pointer;"
          />
          <label for="milestone-input-completed" class="text-xs font-medium" style="cursor: pointer;">
            Mark checkpoint completed
          </label>
        </div>

        <div class="form-group" style="margin-top: var(--space-2);">
          <label class="form-label text-xs" for="milestone-input-change-reason">Reason for Date Change (Audit Log)</label>
          <input
            id="milestone-input-change-reason"
            name="date_change_reason"
            class="form-input text-xs"
            placeholder="e.g. Rescheduled after dependencies delayed"
            maxlength="500"
          />
        </div>
      `
          : ''
      }
    </form>
  `;

  return renderModal({
    title,
    content,
    confirmText,
    cancelText: 'Cancel',
    confirmId: 'milestone-form-submit-btn',
    cancelId: 'milestone-form-cancel-btn',
    closeId: 'milestone-form-close-btn',
  });
}
