/**
 * Task Card & Digital Sticky Note Component
 * 
 * Supports both:
 * 1. Digital Sticky Note (Board View)
 * 2. Compact List Row (Compact View)
 */

import { taskColorManager, PASTEL_COLORS } from './task-colors.js';
import { formatDuration, formatPriority, formatDateDisplay } from '../../utils/formatters.js';

/**
 * Render a single task card
 * @param {Object} options
 * @param {Object} options.task
 * @param {'board'|'compact'} [options.viewMode='board']
 * @param {Array<Object>} [options.goals=[]]
 * @returns {string} HTML string
 */
export function renderTaskCard({ task, viewMode = 'board', goals = [] } = {}) {
  if (!task) return '';

  const colorId = taskColorManager.getTaskColor(task);
  const colorDef = PASTEL_COLORS.find((c) => c.id === colorId) || PASTEL_COLORS[0];
  const isCompleted = task.status === 'completed' || task.is_completed;
  const isUnverified = task.status === 'unverified';
  const isNotCompleted = task.status === 'not_completed';
  const isCancelled = task.status === 'cancelled';

  // Find linked goal title if present
  const linkedGoal = goals.find((g) => g.id === task.goal_id);
  const goalTitle = linkedGoal ? linkedGoal.title : null;

  // Rescheduled indication
  const hasBeenRescheduled = Boolean(
    (task.reschedule_history && task.reschedule_history.length > 0) ||
    (task.original_due_date && task.scheduled_date && task.original_due_date !== task.scheduled_date)
  );

  // --------------------------------------------------------------------------
  // COMPACT LIST ROW VIEW
  // --------------------------------------------------------------------------
  if (viewMode === 'compact') {
    return `
      <div
        class="task-compact-row ${isCompleted ? 'completed' : ''}"
        data-task-id="${task.id}"
        style="border-left: 6px solid ${colorDef.border};"
      >
        <div class="flex items-center gap-3" style="flex: 1; min-width: 0;">
          <!-- Completion Toggle Checkbox -->
          <button
            class="btn btn-ghost btn-icon task-toggle-btn"
            data-task-id="${task.id}"
            data-completed="${isCompleted}"
            aria-label="${isCompleted ? 'Mark incomplete' : 'Mark completed'}"
            style="padding: 2px; color: ${isCompleted ? 'var(--color-success-solid)' : 'var(--color-text-muted)'}; flex-shrink: 0;"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              ${
                isCompleted
                  ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                  : '<circle cx="12" cy="12" r="10"/>'
              }
            </svg>
          </button>

          <div class="flex flex-col gap-1" style="flex: 1; min-width: 0;">
            <div class="flex items-center gap-2" style="flex-wrap: wrap;">
              <span class="task-title font-medium text-sm text-truncate">${task.title}</span>
              ${
                isUnverified
                  ? '<span class="badge badge-neutral" style="font-size: 10px;">Unverified</span>'
                  : isNotCompleted
                  ? '<span class="badge badge-danger" style="font-size: 10px;">Not Done</span>'
                  : isCancelled
                  ? '<span class="badge badge-neutral" style="font-size: 10px;">Cancelled</span>'
                  : ''
              }
            </div>

            <div class="flex items-center gap-2 text-xs text-muted" style="flex-wrap: wrap;">
              <span>⏱ ${formatDuration(task.estimated_duration)}</span>
              ${task.due_time ? `<span>• 🕒 ${task.due_time}</span>` : ''}
              ${goalTitle ? `<span>• 🎯 ${goalTitle}</span>` : ''}
              ${
                hasBeenRescheduled
                  ? `<span style="color: var(--color-warning-solid);">• 🔁 Orig: ${formatDateDisplay(task.original_due_date)}</span>`
                  : ''
              }
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="badge ${task.priority === 'urgent' || task.priority === 'high' ? 'badge-danger' : 'badge-neutral'}" style="font-size: 10px;">
            ${formatPriority(task.priority)}
          </span>

          <!-- Action Buttons -->
          <button class="btn btn-ghost btn-icon task-focus-btn" data-task-id="${task.id}" title="Enter Focus Mode" aria-label="Enter focus mode">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>

          <button class="btn btn-ghost btn-icon task-reschedule-btn" data-task-id="${task.id}" title="Reschedule Task" aria-label="Reschedule task">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
          </button>

          <button class="btn btn-ghost btn-icon task-edit-btn" data-task-id="${task.id}" title="Edit Task" aria-label="Edit task">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          <button class="btn btn-ghost btn-icon task-delete-btn" data-task-id="${task.id}" data-title="${task.title}" title="Delete or Cancel Task" aria-label="Delete task" style="color: var(--color-danger-solid);">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // DIGITAL STICKY NOTE (BOARD VIEW)
  // --------------------------------------------------------------------------
  return `
    <div
      class="sticky-note ${colorDef.class} ${isCompleted ? 'completed' : ''}"
      data-task-id="${task.id}"
      data-color="${colorId}"
    >
      <div class="sticky-pin" aria-hidden="true"></div>

      <!-- Top Metadata & Priority -->
      <div>
        <div class="flex items-center justify-between" style="margin-bottom: var(--space-2); margin-top: 4px;">
          <div class="flex items-center gap-1">
            <span class="badge" style="background: rgba(0,0,0,0.08); color: inherit; font-size: 11px; border: none;">
              ⏱ ${formatDuration(task.estimated_duration)}
            </span>
            ${
              task.due_time
                ? `<span class="badge" style="background: rgba(0,0,0,0.08); color: inherit; font-size: 11px; border: none;">🕒 ${task.due_time}</span>`
                : ''
            }
          </div>

          <span class="badge" style="background: rgba(0,0,0,0.1); color: inherit; font-weight: var(--font-weight-bold); font-size: 10px; border: none;">
            ${formatPriority(task.priority)}
          </span>
        </div>

        <!-- Task Title & Description -->
        <h4 class="task-title" style="font-size: var(--font-size-md); font-weight: var(--font-weight-bold); line-height: 1.35; margin-bottom: var(--space-1); word-break: break-word;">
          ${task.title}
        </h4>

        ${
          task.description
            ? `<p class="text-xs" style="opacity: 0.85; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: var(--space-2);">${task.description}</p>`
            : ''
        }

        ${
          goalTitle
            ? `<div class="text-xs" style="opacity: 0.9; margin-top: 4px; font-weight: var(--font-weight-medium);">🎯 ${goalTitle}</div>`
            : ''
        }

        ${
          hasBeenRescheduled
            ? `
          <div class="text-xs" style="margin-top: 6px; padding: 2px 6px; background: rgba(0,0,0,0.08); border-radius: var(--radius-xs); display: inline-flex; align-items: center; gap: 4px;">
            <span>🔁 Orig:</span>
            <span>${formatDateDisplay(task.original_due_date)}</span>
            ${task.reschedule_history?.length > 1 ? `<span>(${task.reschedule_history.length}x)</span>` : ''}
          </div>
        `
            : ''
        }
      </div>

      <!-- Bottom Status & Actions -->
      <div style="border-top: 1px solid rgba(0,0,0,0.08); padding-top: var(--space-2); display: flex; align-items: center; justify-content: space-between;">
        <!-- Checkbox Completion -->
        <button
          class="btn btn-ghost task-toggle-btn"
          data-task-id="${task.id}"
          data-completed="${isCompleted}"
          style="padding: 4px 8px; font-size: var(--font-size-xs); color: inherit; background: rgba(0,0,0,0.06); border-radius: var(--radius-sm);"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            ${
              isCompleted
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                : '<circle cx="12" cy="12" r="10"/>'
            }
          </svg>
          <span>${isCompleted ? 'Completed' : 'Mark Done'}</span>
        </button>

        <!-- Action Icons -->
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost btn-icon task-focus-btn" data-task-id="${task.id}" title="Enter Focus Mode" aria-label="Enter focus mode" style="color: inherit; padding: 4px;">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>

          <button class="btn btn-ghost btn-icon task-reschedule-btn" data-task-id="${task.id}" title="Reschedule Task" aria-label="Reschedule task" style="color: inherit; padding: 4px;">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
          </button>

          <button class="btn btn-ghost btn-icon task-edit-btn" data-task-id="${task.id}" title="Edit Task" aria-label="Edit task" style="color: inherit; padding: 4px;">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          <button class="btn btn-ghost btn-icon task-delete-btn" data-task-id="${task.id}" data-title="${task.title}" title="Delete or Cancel Task" aria-label="Delete task" style="color: inherit; padding: 4px;">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}
