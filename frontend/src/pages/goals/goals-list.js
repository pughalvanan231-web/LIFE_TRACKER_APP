/**
 * Goals List Overview Component
 * 
 * Displays searchable, filterable, and sortable cards of user goals.
 */

import { renderSkeletonCardList } from '../../components/loading-skeleton.js';
import { renderEmptyState } from '../../components/empty-state.js';
import { renderRetryableError } from '../../components/retryable-error.js';
import { formatTimeframe, formatPriority, formatDateDisplay, daysRemaining } from '../../utils/formatters.js';

export function renderGoalsList({
  goals = [],
  isLoading = false,
  error = null,
  filters = { timeframe: '', status: '', category: '', search: '', sort_by: 'created_at' },
  onRetry = null,
} = {}) {
  // 1. Loading Skeleton State
  if (isLoading && (!goals || goals.length === 0)) {
    return `
      <div class="page-container">
        <div class="flex items-center justify-between">
          <div>
            <h2>Goals & Aspirations</h2>
            <p class="text-sm text-muted">Loading your commitments...</p>
          </div>
          <button class="btn btn-primary" disabled>
            <span>+ New Goal</span>
          </button>
        </div>
        ${renderSkeletonCardList({ count: 6, layout: 'grid' })}
      </div>
    `;
  }

  // 2. Error State
  if (error) {
    return `
      <div class="page-container">
        <h2>Goals & Aspirations</h2>
        ${renderRetryableError({
          error,
          retryButtonId: 'goals-retry-btn',
          title: 'Unable to Load Goals',
        })}
      </div>
    `;
  }

  // Filter client-side search query
  const searchQuery = (filters.search || '').trim().toLowerCase();
  const visibleGoals = goals.filter((g) => {
    if (!searchQuery) return true;
    const matchTitle = (g.title || '').toLowerCase().includes(searchQuery);
    const matchDesc = (g.description || '').toLowerCase().includes(searchQuery);
    const matchCat = (g.category || '').toLowerCase().includes(searchQuery);
    return matchTitle || matchDesc || matchCat;
  });

  return `
    <div class="page-container">
      <!-- Header & New Goal CTA -->
      <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: var(--space-4);">
        <div>
          <h2>Goals & Aspirations</h2>
          <p class="text-sm text-muted">Create structured, timeframed goals backed by measurable progress.</p>
        </div>
        <button id="add-goal-btn" class="btn btn-primary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>New Goal</span>
        </button>
      </div>

      <!-- Search, Filter & Sort Controls -->
      <div class="card flex flex-col gap-3" style="padding: var(--space-4);">
        <div class="filter-bar">
          <!-- Search Bar -->
          <div class="search-input-wrapper">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              id="goals-search-input"
              class="form-input text-sm"
              placeholder="Search goals by title, category, description..."
              value="${filters.search || ''}"
              aria-label="Search goals"
            />
          </div>

          <!-- Timeframe Segmented Control -->
          <div class="flex gap-1" style="background: var(--color-surface-hover); padding: 3px; border-radius: var(--radius-md);">
            <button class="btn btn-sm ${!filters.timeframe ? 'btn-primary' : 'btn-ghost'}" data-filter-timeframe="">All</button>
            <button class="btn btn-sm ${filters.timeframe === 'short_term' ? 'btn-primary' : 'btn-ghost'}" data-filter-timeframe="short_term">Short-Term</button>
            <button class="btn btn-sm ${filters.timeframe === 'medium_term' ? 'btn-primary' : 'btn-ghost'}" data-filter-timeframe="medium_term">Medium-Term</button>
            <button class="btn btn-sm ${filters.timeframe === 'long_term' ? 'btn-primary' : 'btn-ghost'}" data-filter-timeframe="long_term">Long-Term</button>
          </div>

          <!-- Status Dropdown -->
          <div class="flex items-center gap-2">
            <label for="goals-status-select" class="text-xs text-muted">Status:</label>
            <select id="goals-status-select" class="form-select text-xs" style="width: auto; padding: 0.35rem 0.6rem;">
              <option value="" ${!filters.status ? 'selected' : ''}>All Statuses</option>
              <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="completed" ${filters.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="paused" ${filters.status === 'paused' ? 'selected' : ''}>Paused</option>
              <option value="archived" ${filters.status === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
          </div>

          <!-- Sort Order Dropdown -->
          <div class="flex items-center gap-2">
            <label for="goals-sort-select" class="text-xs text-muted">Sort By:</label>
            <select id="goals-sort-select" class="form-select text-xs" style="width: auto; padding: 0.35rem 0.6rem;">
              <option value="created_at" ${filters.sort_by === 'created_at' ? 'selected' : ''}>Recently Created</option>
              <option value="target_date" ${filters.sort_by === 'target_date' ? 'selected' : ''}>Target Deadline</option>
              <option value="priority" ${filters.sort_by === 'priority' ? 'selected' : ''}>Priority Level</option>
              <option value="progress_percentage" ${filters.sort_by === 'progress_percentage' ? 'selected' : ''}>Progress %</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Goals Grid or Empty State -->
      ${
        visibleGoals.length > 0
          ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--space-5);">
          ${visibleGoals
            .map((goal) => {
              const remaining = daysRemaining(goal.target_date);
              const progressPct = Math.round(goal.progress_percentage || 0);

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
                <div class="card flex flex-col justify-between goal-card-clickable" data-goal-id="${goal.id}" style="gap: var(--space-4);" tabindex="0" role="button" aria-label="View details for ${goal.title}">
                  <div>
                    <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
                      <div class="flex items-center gap-1">
                        <span class="badge ${timeframeBadge}">${formatTimeframe(goal.timeframe)}</span>
                        <span class="badge ${statusBadge}">${goal.status}</span>
                      </div>
                      <span class="badge ${priorityBadge}">${formatPriority(goal.priority)}</span>
                    </div>

                    <h3 style="font-size: var(--font-size-md); margin-bottom: var(--space-1);">${goal.title}</h3>
                    ${
                      goal.description
                        ? `<p class="text-xs text-muted" style="margin-bottom: var(--space-2); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${goal.description}</p>`
                        : ''
                    }
                    <span class="badge badge-neutral" style="text-transform: capitalize;">${goal.category || 'General'}</span>
                  </div>

                  <div>
                    <div class="flex justify-between text-xs" style="margin-bottom: 4px;">
                      <span class="text-muted">Target: ${formatDateDisplay(goal.target_date)} (${remaining})</span>
                      <span class="font-bold">${progressPct}%</span>
                    </div>

                    <div class="progress-track" style="margin-bottom: var(--space-2);">
                      <div class="progress-bar" style="width: ${progressPct}%;"></div>
                    </div>

                    <div class="flex justify-between items-center text-xs" style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-3); margin-top: var(--space-2);">
                      <span class="text-muted">
                        ${
                          goal.target_value
                            ? `Metric: <strong>${goal.current_value || 0}</strong> / ${goal.target_value} ${goal.unit || ''}`
                            : 'Milestones tracked'
                        }
                      </span>
                      <span class="font-bold" style="color: var(--color-primary-600); display: flex; align-items: center; gap: 4px;">
                        <span>View Milestones</span>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `
          : goals.length > 0 && visibleGoals.length === 0
          ? `
        ${renderEmptyState({
          title: 'No matching goals found',
          description: 'Try adjusting your search query, status filters, or timeframe options.',
          actionText: 'Reset Filters',
          actionId: 'reset-filters-btn',
        })}
      `
          : `
        ${renderEmptyState({
          title: 'No goals created yet',
          description: 'Goals give direction to daily actions. Define your first aspiration to start tracking milestones.',
          actionText: 'Define Your First Goal',
          actionId: 'add-goal-empty-btn',
        })}
      `
      }
    </div>
  `;
}
