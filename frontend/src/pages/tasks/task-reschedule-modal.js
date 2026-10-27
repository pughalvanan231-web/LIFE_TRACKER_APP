/**
 * Task Rescheduling Modal Component
 * 
 * Safely carries forward unfinished tasks while preserving original due dates
 * and protecting historical daily review snapshots from modification.
 */

import { renderModal } from '../../components/modal.js';
import { formatDateDisplay } from '../../utils/formatters.js';

export function renderTaskRescheduleModal({ task, isSubmitting = false } = {}) {
  if (!task) return '';

  // Default new date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultNewDate = tomorrow.toISOString().split('T')[0];

  const content = `
    <form id="task-reschedule-form" novalidate class="flex flex-col gap-4">
      <div class="card" style="background-color: var(--color-surface-hover); padding: var(--space-3); border: 1px solid var(--color-border-subtle);">
        <h4 style="font-size: var(--font-size-sm); margin-bottom: 2px;">${task.title}</h4>
        <div class="flex items-center gap-2 text-xs text-muted" style="margin-top: 4px; flex-wrap: wrap;">
          <span>Current Scheduled: <strong>${formatDateDisplay(task.scheduled_date)}</strong></span>
          <span>•</span>
          <span>Original Deadline: <strong>${formatDateDisplay(task.original_due_date || task.scheduled_date)}</strong></span>
          ${
            task.reschedule_history?.length > 0
              ? `<span>• Rescheduled ${task.reschedule_history.length} time(s)</span>`
              : ''
          }
        </div>
      </div>

      <!-- New Scheduled Date -->
      <div class="form-group">
        <label class="form-label" for="reschedule-input-date">
          Carry Forward To New Date <span style="color: var(--color-danger-solid);">*</span>
        </label>
        <input
          id="reschedule-input-date"
          name="new_date"
          type="date"
          class="form-input"
          value="${defaultNewDate}"
          required
        />
      </div>

      <!-- Optional New Time -->
      <div class="form-group">
        <label class="form-label" for="reschedule-input-time">Target Time (Optional)</label>
        <input
          id="reschedule-input-time"
          name="due_time"
          type="time"
          class="form-input text-xs"
          value="${task.due_time || ''}"
        />
      </div>

      <!-- Reschedule Reason (Audit Trail) -->
      <div class="form-group">
        <label class="form-label" for="reschedule-input-reason">Reason for Carrying Forward</label>
        <input
          id="reschedule-input-reason"
          name="reason"
          class="form-input text-xs"
          placeholder="e.g., Extended focus on priority milestone or delayed dependencies"
          maxlength="500"
        />
      </div>

      <!-- Snapshot & Integrity Notice -->
      <div class="text-xs text-muted" style="background: rgba(0,0,0,0.03); padding: var(--space-3); border-radius: var(--radius-sm); line-height: 1.5; border-left: 3px solid var(--color-primary-600);">
        🛡️ <strong>Historical Integrity:</strong> The original due date remains preserved in the audit log. Previously submitted daily review snapshots are immutable and will not be altered.
      </div>
    </form>
  `;

  return renderModal({
    title: 'Reschedule Task',
    content,
    confirmText: isSubmitting ? 'Rescheduling...' : 'Confirm Reschedule',
    cancelText: 'Cancel',
    confirmId: 'reschedule-submit-btn',
    cancelId: 'reschedule-cancel-btn',
    closeId: 'reschedule-close-btn',
  });
}
