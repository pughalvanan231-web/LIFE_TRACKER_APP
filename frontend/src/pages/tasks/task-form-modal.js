/**
 * Task Creation & Editing Modal Form Component
 * 
 * Includes fields for title, description, priority, scheduled date, due time,
 * estimated duration, goal & milestone linkages, recurrence, and pastel sticky-note color.
 */

import { renderModal } from '../../components/modal.js';
import { PASTEL_COLORS, taskColorManager } from './task-colors.js';

export function renderTaskFormModal({
  task = null,
  defaultDate = new Date().toISOString().split('T')[0],
  goals = [],
  milestones = [],
  isSubmitting = false,
  errorMessage = null,
} = {}) {
  const isEditing = Boolean(task && task.id);
  const title = isEditing ? 'Edit Task Details' : 'Create Actionable Task';
  const confirmText = isSubmitting ? 'Saving...' : isEditing ? 'Update Task' : 'Schedule Task';

  const t = task || {
    title: '',
    description: '',
    priority: 'medium',
    status: 'pending',
    recurrence: 'none',
    estimated_duration: 30,
    scheduled_date: defaultDate,
    due_time: '',
    goal_id: '',
    milestone_id: '',
  };

  const currentColor = task ? taskColorManager.getTaskColor(task) : 'yellow';

  const content = `
    <form id="task-modal-form" novalidate class="flex flex-col gap-4">
      ${
        errorMessage
          ? `
        <div class="card" style="border-left: 4px solid var(--color-danger-solid); background-color: var(--color-danger-bg); padding: var(--space-3);" role="alert">
          <p class="text-xs" style="color: var(--color-danger-solid); font-weight: var(--font-weight-medium);">${errorMessage}</p>
        </div>
      `
          : ''
      }

      <!-- Sticky Note Color Picker -->
      <div class="form-group">
        <label class="form-label" style="margin-bottom: var(--space-1);">Sticky Note Color</label>
        <div class="color-swatch-picker" role="radiogroup" aria-label="Select note color">
          ${PASTEL_COLORS.map(
            (c) => `
            <button
              type="button"
              class="color-swatch ${c.id === currentColor ? 'active' : ''}"
              data-color-id="${c.id}"
              style="background-color: ${c.bg}; border-color: ${c.id === currentColor ? c.border : 'transparent'};"
              title="${c.name}"
              aria-label="${c.name}"
            ></button>
          `
          ).join('')}
        </div>
        <input type="hidden" id="task-input-color" name="color" value="${currentColor}" />
      </div>

      <!-- Task Title -->
      <div class="form-group">
        <label class="form-label" for="task-input-title">
          Task Title <span style="color: var(--color-danger-solid);">*</span>
        </label>
        <input
          id="task-input-title"
          name="title"
          class="form-input"
          placeholder="e.g., Draft weekly executive report or review pull requests"
          value="${t.title || ''}"
          required
          maxlength="200"
          autocomplete="off"
        />
      </div>

      <!-- Description / Checklist Notes -->
      <div class="form-group">
        <label class="form-label" for="task-input-description">Action Checklist / Notes</label>
        <textarea
          id="task-input-description"
          name="description"
          class="form-textarea text-xs"
          rows="2"
          placeholder="Subtasks, context, reference links, or key deliverables..."
          maxlength="1000"
        >${t.description || ''}</textarea>
      </div>

      <!-- Priority, Duration & Time -->
      <div class="grid grid-cols-3 gap-3">
        <div class="form-group">
          <label class="form-label" for="task-input-priority">Priority</label>
          <select id="task-input-priority" name="priority" class="form-select text-xs">
            <option value="urgent" ${t.priority === 'urgent' ? 'selected' : ''}>Urgent Priority</option>
            <option value="high" ${t.priority === 'high' ? 'selected' : ''}>High Priority</option>
            <option value="medium" ${t.priority === 'medium' ? 'selected' : ''}>Medium Priority</option>
            <option value="low" ${t.priority === 'low' ? 'selected' : ''}>Low Priority</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="task-input-duration">Duration (Mins)</label>
          <input
            id="task-input-duration"
            name="estimated_duration"
            type="number"
            min="5"
            max="1440"
            step="5"
            class="form-input text-xs"
            value="${t.estimated_duration ?? 30}"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="task-input-time">Due Time (Optional)</label>
          <input
            id="task-input-time"
            name="due_time"
            type="time"
            class="form-input text-xs"
            value="${t.due_time || ''}"
          />
        </div>
      </div>

      <!-- Date & Recurrence -->
      <div class="grid grid-cols-2 gap-3">
        <div class="form-group">
          <label class="form-label" for="task-input-scheduled-date">Scheduled Date</label>
          <input
            id="task-input-scheduled-date"
            name="scheduled_date"
            type="date"
            class="form-input text-xs"
            value="${t.scheduled_date || defaultDate}"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="task-input-recurrence">Recurrence</label>
          <select id="task-input-recurrence" name="recurrence" class="form-select text-xs">
            <option value="none" ${t.recurrence === 'none' ? 'selected' : ''}>Does not repeat</option>
            <option value="daily" ${t.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${t.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="monthly" ${t.recurrence === 'monthly' ? 'selected' : ''}>Monthly</option>
          </select>
        </div>
      </div>

      <!-- Goal & Milestone Linkage -->
      <div class="grid grid-cols-2 gap-3">
        <div class="form-group">
          <label class="form-label" for="task-input-goal">Link to Goal (Optional)</label>
          <select id="task-input-goal" name="goal_id" class="form-select text-xs">
            <option value="">-- No Linked Goal --</option>
            ${goals
              .map(
                (g) => `<option value="${g.id}" ${t.goal_id === g.id ? 'selected' : ''}>${g.title}</option>`
              )
              .join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="task-input-milestone">Link to Milestone (Optional)</label>
          <select id="task-input-milestone" name="milestone_id" class="form-select text-xs">
            <option value="">-- No Milestone --</option>
            ${milestones
              .map(
                (m) => `<option value="${m.id}" ${t.milestone_id === m.id ? 'selected' : ''}>${m.title}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>

      ${
        isEditing
          ? `
        <div class="form-group">
          <label class="form-label" for="task-input-status">Task Lifecycle Status</label>
          <select id="task-input-status" name="status" class="form-select text-xs">
            <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="not_completed" ${t.status === 'not_completed' ? 'selected' : ''}>Explicitly Not Completed</option>
            <option value="unverified" ${t.status === 'unverified' ? 'selected' : ''}>Unverified</option>
            <option value="cancelled" ${t.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
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
    confirmId: 'task-form-submit-btn',
    cancelId: 'task-form-cancel-btn',
    closeId: 'task-form-close-btn',
  });
}
