/**
 * Goals Page Component
 */

import { DEMO_GOALS } from '../services/fixtures.js';

export function renderGoalsPage(demoMode) {
  const goals = demoMode ? DEMO_GOALS : [];

  return `
    <div class="page-container">
      <div class="flex items-center justify-between">
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

      <!-- Filter Controls -->
      <div class="flex gap-2 items-center" style="border-bottom: 1px solid var(--color-border-subtle); padding-bottom: var(--space-3);">
        <button class="btn btn-primary btn-sm">All Goals</button>
        <button class="btn btn-ghost btn-sm">Short-Term</button>
        <button class="btn btn-ghost btn-sm">Long-Term</button>
        <button class="btn btn-ghost btn-sm">Archived</button>
      </div>

      ${
        goals.length > 0
          ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--space-5);">
          ${goals.map(
            (goal) => `
            <div class="card flex flex-col justify-between" style="gap: var(--space-4);">
              <div>
                <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
                  <span class="badge ${goal.timeframe === 'short_term' ? 'badge-primary' : 'badge-teal'}">
                    ${goal.timeframe === 'short_term' ? 'Short-Term' : 'Long-Term'}
                  </span>
                  <span class="badge ${goal.priority === 'high' ? 'badge-danger' : 'badge-neutral'}">${goal.priority}</span>
                </div>
                <h3 style="font-size: var(--font-size-md); margin-bottom: var(--space-2);">${goal.title}</h3>
                <span class="badge badge-neutral" style="text-transform: capitalize;">${goal.category}</span>
              </div>

              <div>
                <div class="flex justify-between text-xs" style="margin-bottom: 4px;">
                  <span class="text-muted">Target: ${goal.target_date}</span>
                  <span class="font-bold">${goal.progress_percentage}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-bar" style="width: ${goal.progress_percentage}%;"></div>
                </div>
                <div class="flex justify-between text-xs text-muted" style="margin-top: 6px;">
                  <span>Metric: ${goal.current_value} / ${goal.target_value} ${goal.unit}</span>
                  <span class="font-medium" style="color: var(--color-primary-600); cursor: pointer;">View Milestones →</span>
                </div>
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
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
          </div>
          <h3 class="empty-state-title">No goals created yet</h3>
          <p class="empty-state-description">Goals give direction to daily actions. Create short-term sprints or long-term multi-year aspirations.</p>
          <button id="add-goal-empty-btn" class="btn btn-primary">Define Your First Goal</button>
        </div>
      `
      }
    </div>
  `;
}
