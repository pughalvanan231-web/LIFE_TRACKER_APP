/**
 * Tasks & Daily Planning Page Component
 */

import { DEMO_TASKS } from '../services/fixtures.js';

export function renderTasksPage(demoMode) {
  const tasks = demoMode ? DEMO_TASKS : [];

  return `
    <div class="page-container">
      <div class="flex items-center justify-between">
        <div>
          <h2>Daily Tasks & Planning</h2>
          <p class="text-sm text-muted">Plan your day, protect your focus time, and track execution.</p>
        </div>
        <button id="add-task-btn" class="btn btn-primary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>New Task</span>
        </button>
      </div>

      <!-- Date & Status Filter Bar -->
      <div class="flex justify-between items-center" style="border-bottom: 1px solid var(--color-border-subtle); padding-bottom: var(--space-3);">
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm">Today</button>
          <button class="btn btn-ghost btn-sm">Tomorrow</button>
          <button class="btn btn-ghost btn-sm">Upcoming</button>
        </div>
        <div class="flex gap-2 items-center">
          <span class="text-xs text-muted">Status:</span>
          <select class="form-select" style="padding: 0.25rem 0.5rem; font-size: var(--font-size-xs); width: auto;">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>
      </div>

      ${
        tasks.length > 0
          ? `
        <div class="flex flex-col gap-3">
          ${tasks.map(
            (task) => `
            <div class="card flex items-center justify-between gap-4" style="padding: var(--space-4);">
              <div class="flex items-center gap-4">
                <input type="checkbox" ${task.status === 'completed' ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--color-primary-600);" />
                <div>
                  <h4 style="font-size: var(--font-size-base); text-decoration: ${task.status === 'completed' ? 'line-through' : 'none'}; color: ${task.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)'};">${task.title}</h4>
                  <div class="flex items-center gap-2 text-xs text-muted" style="margin-top: 3px;">
                    <span>⏱ ${task.estimated_duration} mins</span>
                    <span>•</span>
                    <span>🎯 ${task.goal_title}</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <span class="badge ${task.priority === 'high' ? 'badge-danger' : 'badge-neutral'}">${task.priority}</span>
                <span class="badge ${task.status === 'completed' ? 'badge-success' : 'badge-neutral'}">${task.status}</span>
              </div>
            </div>
          `
          ).join('')}
        </div>
      `
          : `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
              <path d="M7 7h.01"/>
            </svg>
          </div>
          <h3 class="empty-state-title">No tasks in your daily plan</h3>
          <p class="empty-state-description">A calm day starts with clear priorities. Schedule 3 essential tasks to make steady headway on your goals.</p>
          <button id="add-task-empty-btn" class="btn btn-primary">Schedule a Task</button>
        </div>
      `
      }
    </div>
  `;
}
