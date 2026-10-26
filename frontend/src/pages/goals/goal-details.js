/**
 * Goal Details & Milestone Management Component
 * 
 * Features:
 * - Authoritative backend progress display & milestone breakdown explanation
 * - Interactive milestone management (create, toggle complete, edit, reorder, delete)
 * - Historical timeline preserving deadline changes (date_history audit trail)
 * - Goal metadata (category, timeframe, priority, quantitative metric target)
 * - Action controls (Edit Goal, Archive / Delete Goal with confirmation)
 */

import { formatTimeframe, formatPriority, formatDateDisplay, daysRemaining } from '../../utils/formatters.js';
import { renderEmptyState } from '../../components/empty-state.js';
import { renderSkeletonText } from '../../components/loading-skeleton.js';

export function renderGoalDetails({
  goal,
  milestones = [],
  isLoadingMilestones = false,
} = {}) {
  if (!goal) {
    return `
      <div class="page-container">
        <button id="goal-back-btn" class="btn btn-outline btn-sm" style="margin-bottom: var(--space-4);">
          &larr; Back to Goals
        </button>
        <p class="text-sm text-muted">Goal not found.</p>
      </div>
    `;
  }

  const remaining = daysRemaining(goal.target_date);
  const progressPct = Math.round(goal.progress_percentage || 0);

  const completedMilestones = milestones.filter((m) => m.is_completed);
  const totalWeight = milestones.reduce((sum, m) => sum + (m.weight || 1), 0);
  const completedWeight = completedMilestones.reduce((sum, m) => sum + (m.weight || 1), 0);

  const priorityBadge =
    goal.priority === 'high'
      ? 'badge-danger'
      : goal.priority === 'medium'
      ? 'badge-warning'
      : 'badge-neutral';

  const timeframeBadge =
    goal.timeframe === 'short_term'
      ? 'badge-primary'
      : goal.timeframe === 'long_term'
      ? 'badge-teal'
      : 'badge-secondary';

  const statusBadge =
    goal.status === 'completed'
      ? 'badge-success'
      : goal.status === 'paused'
      ? 'badge-warning'
      : goal.status === 'archived'
      ? 'badge-neutral'
      : 'badge-primary';

  return `
    <div class="page-container flex flex-col gap-6">
      <!-- Top Navigation & Action Controls -->
      <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: var(--space-3);">
        <button id="goal-back-btn" class="btn btn-outline btn-sm">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span>Back to Goals Overview</span>
        </button>

        <div class="flex items-center gap-2">
          <button id="edit-goal-btn" class="btn btn-secondary btn-sm" data-goal-id="${goal.id}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>Edit Goal</span>
          </button>

          <button id="delete-goal-btn" class="btn btn-outline btn-sm" data-goal-id="${goal.id}" style="color: var(--color-danger-solid); border-color: var(--color-danger-border);">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>Delete / Archive</span>
          </button>
        </div>
      </div>

      <!-- Goal Header & Progress Card -->
      <div class="card flex flex-col gap-4">
        <div class="flex justify-between items-start" style="flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <div class="flex items-center gap-2" style="margin-bottom: var(--space-2);">
              <span class="badge ${timeframeBadge}">${formatTimeframe(goal.timeframe)}</span>
              <span class="badge ${statusBadge}">${goal.status}</span>
              <span class="badge ${priorityBadge}">${formatPriority(goal.priority)}</span>
              <span class="badge badge-neutral" style="text-transform: capitalize;">${goal.category || 'General'}</span>
            </div>
            <h2>${goal.title}</h2>
          </div>

          <div class="text-right">
            <span class="text-xs text-muted">Deadline:</span>
            <div class="font-bold text-sm" style="color: var(--color-text-primary);">
              ${formatDateDisplay(goal.target_date)}
            </div>
            <span class="text-xs font-medium" style="color: var(--color-primary-600);">${remaining}</span>
          </div>
        </div>

        ${
          goal.description
            ? `<p class="text-sm" style="color: var(--color-text-secondary); line-height: 1.6;">${goal.description}</p>`
            : ''
        }

        <!-- Progress Track & Milestone Explanation -->
        <div class="card" style="background-color: var(--color-surface-hover); padding: var(--space-4); border: 1px solid var(--color-border-subtle);">
          <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
            <div>
              <span class="font-bold text-sm">Authoritative Goal Progress</span>
              <p class="text-xs text-muted" style="margin-top: 2px;">
                ${
                  milestones.length > 0
                    ? `Driven by <strong>${completedMilestones.length} of ${milestones.length}</strong> checkpoints completed (${Math.round((completedWeight / (totalWeight || 1)) * 100)}% weighted milestone contribution).`
                    : 'Add checkpoints below to establish weighted milestone progress.'
                }
              </p>
            </div>
            <span class="font-bold text-lg" style="color: var(--color-primary-600);">${progressPct}%</span>
          </div>

          <div class="progress-track" style="height: 10px; margin-bottom: var(--space-2);">
            <div class="progress-bar" style="width: ${progressPct}%;"></div>
          </div>

          ${
            goal.target_value
              ? `
            <div class="flex justify-between text-xs text-muted" style="margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px dashed var(--color-border-subtle);">
              <span>Quantitative Progress:</span>
              <span class="font-bold" style="color: var(--color-text-primary);">
                ${goal.current_value || 0} / ${goal.target_value} ${goal.unit || ''}
              </span>
            </div>
          `
              : ''
          }
        </div>
      </div>

      <!-- Two-Column Layout: Milestones (Left) & Timeline / Audit (Right) -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6); align-items: flex-start;">
        
        <!-- Left: Milestone Management Section -->
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div>
              <h3>Milestone Checkpoints</h3>
              <p class="text-xs text-muted">Break down this goal into actionable, measurable accomplishments.</p>
            </div>
            <button id="add-milestone-btn" class="btn btn-primary btn-sm" data-goal-id="${goal.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Add Checkpoint</span>
            </button>
          </div>

          ${
            isLoadingMilestones
              ? `
            <div class="card flex flex-col gap-3">
              ${renderSkeletonText(4)}
            </div>
          `
              : milestones.length > 0
              ? `
            <div class="milestone-list">
              ${milestones
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((m, idx) => {
                  const isChecked = Boolean(m.is_completed);

                  return `
                    <div class="milestone-card ${isChecked ? 'completed' : ''}" data-milestone-id="${m.id}">
                      <div class="flex items-center gap-3" style="flex: 1;">
                        <!-- Completion Toggle Checkbox -->
                        <button
                          class="btn btn-ghost btn-icon milestone-toggle-btn"
                          data-milestone-id="${m.id}"
                          data-completed="${isChecked}"
                          aria-label="${isChecked ? 'Mark incomplete' : 'Mark completed'}"
                          style="padding: 4px; color: ${isChecked ? 'var(--color-success-solid)' : 'var(--color-text-muted)'};"
                        >
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                            ${
                              isChecked
                                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                                : '<circle cx="12" cy="12" r="10"/>'
                            }
                          </svg>
                        </button>

                        <div class="flex flex-col gap-1" style="flex: 1;">
                          <div class="flex items-center gap-2">
                            <span class="milestone-order-badge">#${m.order ?? idx + 1}</span>
                            <span class="milestone-title font-medium text-sm">${m.title}</span>
                            <span class="milestone-weight-badge">${m.weight || 1}x weight</span>
                          </div>

                          ${
                            m.description
                              ? `<p class="text-xs text-muted" style="margin-left: 2px;">${m.description}</p>`
                              : ''
                          }

                          <div class="flex items-center gap-3 text-xs text-muted">
                            ${
                              m.target_date
                                ? `<span>Target: <strong>${formatDateDisplay(m.target_date)}</strong></span>`
                                : '<span>No target date set</span>'
                            }
                            ${
                              m.completed_at
                                ? `<span style="color: var(--color-success-text);">Completed ${formatDateDisplay(m.completed_at)}</span>`
                                : ''
                            }
                          </div>
                        </div>
                      </div>

                      <!-- Milestone Actions -->
                      <div class="flex items-center gap-1">
                        <!-- Reorder Controls -->
                        <button
                          class="btn btn-ghost btn-icon milestone-move-up-btn"
                          data-milestone-id="${m.id}"
                          data-order="${m.order ?? idx + 1}"
                          title="Move Up"
                          aria-label="Move milestone up"
                          ${idx === 0 ? 'disabled style="opacity: 0.3;"' : ''}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="18 15 12 9 6 15"/>
                          </svg>
                        </button>

                        <button
                          class="btn btn-ghost btn-icon milestone-move-down-btn"
                          data-milestone-id="${m.id}"
                          data-order="${m.order ?? idx + 1}"
                          title="Move Down"
                          aria-label="Move milestone down"
                          ${idx === milestones.length - 1 ? 'disabled style="opacity: 0.3;"' : ''}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>

                        <!-- Edit Button -->
                        <button
                          class="btn btn-ghost btn-icon milestone-edit-btn"
                          data-milestone-id="${m.id}"
                          title="Edit Milestone"
                          aria-label="Edit milestone"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>

                        <!-- Delete Button -->
                        <button
                          class="btn btn-ghost btn-icon milestone-delete-btn"
                          data-milestone-id="${m.id}"
                          data-title="${m.title}"
                          title="Delete Milestone"
                          aria-label="Delete milestone"
                          style="color: var(--color-danger-solid);"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `
              : `
            ${renderEmptyState({
              title: 'No milestones defined yet',
              description: 'Break this goal into smaller milestones to see realistic progress and accountability.',
              actionText: 'Add First Checkpoint',
              actionId: 'add-milestone-empty-btn',
            })}
          `
          }
        </div>

        <!-- Right: Goal Timeline & Deadline History -->
        <div class="flex flex-col gap-4">
          <div class="card flex flex-col gap-4">
            <h3 style="font-size: var(--font-size-md);">Goal Timeline</h3>

            <div class="timeline">
              <!-- Start Date Event -->
              <div class="timeline-item">
                <div class="timeline-dot dot-completed"></div>
                <div class="timeline-content">
                  <span class="font-medium text-xs">Initiated</span>
                  <span class="timeline-date">${formatDateDisplay(goal.start_date || goal.created_at)}</span>
                </div>
              </div>

              <!-- Milestone Nodes on Timeline -->
              ${milestones
                .filter((m) => m.target_date)
                .sort((a, b) => (a.target_date > b.target_date ? 1 : -1))
                .map((m) => `
                  <div class="timeline-item">
                    <div class="timeline-dot ${m.is_completed ? 'dot-completed' : ''}"></div>
                    <div class="timeline-content">
                      <span class="font-medium text-xs ${m.is_completed ? 'text-muted' : ''}">${m.title}</span>
                      <span class="timeline-date">${formatDateDisplay(m.target_date)}</span>
                    </div>
                  </div>
                `)
                .join('')}

              <!-- Target Deadline Event -->
              <div class="timeline-item">
                <div class="timeline-dot ${goal.status === 'completed' ? 'dot-completed' : 'dot-warning'}"></div>
                <div class="timeline-content">
                  <span class="font-bold text-xs">Target Completion</span>
                  <span class="timeline-date font-bold">${formatDateDisplay(goal.target_date)}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Deadline Audit History -->
          ${
            goal.date_history && goal.date_history.length > 0
              ? `
            <div class="card flex flex-col gap-3">
              <h4 class="text-xs font-bold" style="text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted);">
                Deadline Change History
              </h4>
              <div class="flex flex-col gap-2">
                ${goal.date_history
                  .map((entry) => `
                    <div class="text-xs" style="background: var(--color-surface-hover); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);">
                      <div class="flex justify-between font-mono" style="margin-bottom: 2px;">
                        <span style="text-decoration: line-through; color: var(--color-text-muted);">${entry.previous_target_date || 'N/A'}</span>
                        <span>&rarr;</span>
                        <span class="font-bold">${entry.new_target_date}</span>
                      </div>
                      ${entry.reason ? `<p class="text-muted" style="margin-top: 2px; font-style: italic;">"${entry.reason}"</p>` : ''}
                      <span class="text-muted" style="font-size: 10px;">Changed ${formatDateDisplay(entry.changed_at)}</span>
                    </div>
                  `)
                  .join('')}
              </div>
            </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
  `;
}
