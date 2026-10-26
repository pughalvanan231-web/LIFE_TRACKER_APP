/**
 * Reports & Performance Analytics Page Component
 */

export function renderReportsPage(demoMode) {
  return `
    <div class="page-container">
      <div class="flex items-center justify-between">
        <div>
          <h2>Performance & Reports</h2>
          <p class="text-sm text-muted">Periodic summaries, habit consistency, and objective trajectory audits.</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm">Weekly Report</button>
          <button class="btn btn-ghost btn-sm">Monthly Report</button>
        </div>
      </div>

      ${
        demoMode
          ? `
        <div class="flex flex-col gap-6">
          <!-- Metric Highlights -->
          <div class="grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);">
            <div class="stat-card">
              <span class="stat-header">Weekly Completion Rate</span>
              <span class="stat-value">78.5%</span>
              <span class="stat-footnote text-muted">22 of 28 tasks completed</span>
            </div>
            <div class="stat-card">
              <span class="stat-header">Unverified Closed</span>
              <span class="stat-value">3</span>
              <span class="stat-footnote text-muted">Unconfirmed at midnight</span>
            </div>
            <div class="stat-card">
              <span class="stat-header">Focus Hours Logged</span>
              <span class="stat-value">21.5h</span>
              <span class="stat-footnote text-muted">Across 7 active days</span>
            </div>
            <div class="stat-card">
              <span class="stat-header">Goal Milestones Hit</span>
              <span class="stat-value">2</span>
              <span class="stat-footnote text-muted">Health & Career tracks</span>
            </div>
          </div>

          <!-- Weekly Reflection Breakdown -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Weekly Performance Snapshot</h3>
                <p class="card-subtitle">Monday through Sunday aggregated metrics</p>
              </div>
              <span class="badge badge-success">High Consistency</span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--space-3); text-align: center; margin-top: var(--space-4);">
              ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                .map(
                  (day, idx) => `
                <div style="background-color: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3); border: 1px solid var(--color-border-subtle);">
                  <div class="text-xs font-bold text-muted">${day}</div>
                  <div style="font-size: var(--font-size-md); font-weight: 800; margin: 4px 0; color: ${idx === 5 ? 'var(--color-danger-solid)' : 'var(--color-primary-700)'};">
                    ${idx === 5 ? '40%' : '80%'}
                  </div>
                  <div class="text-xs text-muted">${idx === 5 ? '2/5' : '4/5'} done</div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      `
          : `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h3 class="empty-state-title">No reports compiled yet</h3>
          <p class="empty-state-description">Reports are generated dynamically as you submit daily reviews and complete scheduled commitments.</p>
          <a href="#/progress" class="btn btn-primary">Submit First Review</a>
        </div>
      `
      }
    </div>
  `;
}
