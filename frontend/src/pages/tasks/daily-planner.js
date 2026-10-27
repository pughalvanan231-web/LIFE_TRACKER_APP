/**
 * Daily Planner Schedule & Workload Meter Component
 * 
 * Provides:
 * - Date navigator (Prev day, Today, Next day, Custom date)
 * - Available focus time setting
 * - Workload capacity bar with overload warning
 * - Priority grouping (High/Urgent, Medium, Low)
 * - View mode toggle (Sticky Board vs Compact List)
 */

import { renderTaskCard } from './task-card.js';
import { formatDuration, formatDateDisplay } from '../../utils/formatters.js';

export function renderDailyPlanner({
  selectedDate,
  tasks = [],
  availableMinutes = 240,
  viewMode = 'board', // 'board' | 'compact'
  groupByPriority = true,
  goals = [],
} = {}) {
  // Calculate workload metrics
  const activeTasks = tasks.filter((t) => t.status !== 'cancelled');
  const totalPlannedDuration = activeTasks.reduce((sum, t) => sum + (t.estimated_duration || 30), 0);
  const completedTasks = activeTasks.filter((t) => t.status === 'completed' || t.is_completed);
  const completedDuration = completedTasks.reduce((sum, t) => sum + (t.estimated_duration || 30), 0);

  const capacityPct = Math.round((totalPlannedDuration / (availableMinutes || 1)) * 100);
  const isOverloaded = totalPlannedDuration > availableMinutes;
  const overloadDelta = totalPlannedDuration - availableMinutes;

  const barColor =
    capacityPct > 100
      ? 'var(--color-danger-solid)'
      : capacityPct > 80
      ? 'var(--color-warning-solid)'
      : 'var(--color-success-solid)';

  // Group by priority
  const highTasks = tasks.filter((t) => t.priority === 'urgent' || t.priority === 'high');
  const mediumTasks = tasks.filter((t) => t.priority === 'medium');
  const lowTasks = tasks.filter((t) => t.priority === 'low');

  const containerClass = viewMode === 'board' ? 'sticky-board' : 'task-compact-list';

  return `
    <div class="flex flex-col gap-5">
      <!-- 1. Workload Summary & Capacity Meter -->
      <div class="workload-meter">
        <div class="flex justify-between items-center" style="flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <div class="flex items-center gap-2">
              <h3 style="font-size: var(--font-size-md);">Estimated Day Workload</h3>
              <span class="badge ${isOverloaded ? 'badge-danger' : 'badge-primary'}" style="font-size: 11px;">
                ${capacityPct}% of capacity
              </span>
            </div>
            <p class="text-xs text-muted" style="margin-top: 2px;">
              ${completedTasks.length} of ${activeTasks.length} tasks completed • ${formatDuration(completedDuration)} done of ${formatDuration(totalPlannedDuration)} planned.
            </p>
          </div>

          <!-- Available Time Control -->
          <div class="flex items-center gap-2">
            <label for="planner-available-minutes" class="text-xs text-muted font-medium">Available Focus:</label>
            <div class="flex items-center gap-1">
              <input
                id="planner-available-minutes"
                type="number"
                min="15"
                max="960"
                step="15"
                class="form-input text-xs"
                style="width: 80px; padding: 0.35rem 0.5rem;"
                value="${availableMinutes}"
                title="Set total focus minutes available for this day"
              />
              <span class="text-xs text-muted">mins</span>
            </div>
          </div>
        </div>

        <!-- Workload Bar -->
        <div class="workload-bar-track">
          <div
            class="workload-bar-fill"
            style="width: ${Math.min(capacityPct, 100)}%; background-color: ${barColor};"
          ></div>
        </div>

        <!-- Overload Warning Banner -->
        ${
          isOverloaded
            ? `
          <div class="workload-warning-banner" role="alert">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <strong>Overload Warning:</strong> Planned workload (${formatDuration(totalPlannedDuration)}) exceeds available time (${formatDuration(availableMinutes)}) by <strong>${formatDuration(overloadDelta)}</strong>. Consider rescheduling tasks to protect focus quality.
            </div>
          </div>
        `
            : ''
        }
      </div>

      <!-- 2. Priority Groupings or Flat View -->
      ${
        groupByPriority
          ? `
        <div class="flex flex-col gap-6">
          <!-- Urgent & High Priority Section -->
          ${
            highTasks.length > 0
              ? `
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between" style="border-bottom: 2px solid var(--color-danger-border); padding-bottom: 4px;">
                <span class="font-bold text-xs" style="color: var(--color-danger-text); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;">
                  <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-danger-solid);"></span>
                  High & Urgent Priority (${highTasks.length})
                </span>
                <span class="text-xs text-muted">${formatDuration(highTasks.reduce((s, t) => s + (t.estimated_duration || 0), 0))}</span>
              </div>
              <div class="${containerClass}">
                ${highTasks.map((task) => renderTaskCard({ task, viewMode, goals })).join('')}
              </div>
            </div>
          `
              : ''
          }

          <!-- Medium Priority Section -->
          ${
            mediumTasks.length > 0
              ? `
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between" style="border-bottom: 2px solid var(--color-warning-border); padding-bottom: 4px;">
                <span class="font-bold text-xs" style="color: var(--color-warning-text); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;">
                  <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-warning-solid);"></span>
                  Medium Priority (${mediumTasks.length})
                </span>
                <span class="text-xs text-muted">${formatDuration(mediumTasks.reduce((s, t) => s + (t.estimated_duration || 0), 0))}</span>
              </div>
              <div class="${containerClass}">
                ${mediumTasks.map((task) => renderTaskCard({ task, viewMode, goals })).join('')}
              </div>
            </div>
          `
              : ''
          }

          <!-- Low Priority Section -->
          ${
            lowTasks.length > 0
              ? `
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between" style="border-bottom: 2px solid var(--color-border-subtle); padding-bottom: 4px;">
                <span class="font-bold text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;">
                  <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-muted);"></span>
                  Low Priority (${lowTasks.length})
                </span>
                <span class="text-xs text-muted">${formatDuration(lowTasks.reduce((s, t) => s + (t.estimated_duration || 0), 0))}</span>
              </div>
              <div class="${containerClass}">
                ${lowTasks.map((task) => renderTaskCard({ task, viewMode, goals })).join('')}
              </div>
            </div>
          `
              : ''
          }
        </div>
      `
          : `
        <div class="${containerClass}">
          ${tasks.map((task) => renderTaskCard({ task, viewMode, goals })).join('')}
        </div>
      `
      }
    </div>
  `;
}
