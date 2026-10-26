/**
 * Home Page - Professional Dashboard
 */

import { DEMO_STATS, DEMO_GOALS, DEMO_TASKS } from '../services/fixtures.js';

export function renderHomePage(demoMode) {
  const stats = demoMode ? DEMO_STATS : { activeGoals: 0, tasksDueToday: 0, tasksCompleted: 0, dailyCompletionRate: 0, streakDays: 0 };

  return `
    <div class="page-container">
      ${
        demoMode
          ? `
        <div class="demo-banner">
          <div class="demo-banner-content">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>Development Preview Active:</strong> Displaying sample fixtures for UI demonstration. Sample records are never saved as user data.</span>
          </div>
          <button id="disable-demo-btn" class="btn btn-ghost btn-sm">Turn Off</button>
        </div>
      `
          : ''
      }

      <!-- Metric Highlights Grid -->
      <section class="grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);" aria-label="Key Performance Metrics">
        <div class="stat-card">
          <div class="stat-header">
            <span>Active Goals</span>
            <span class="badge badge-primary">Focused</span>
          </div>
          <div class="stat-value">${stats.activeGoals}</div>
          <div class="stat-footnote">
            <span class="text-muted">Long-term & short-term targets</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-header">
            <span>Tasks Due Today</span>
            <span class="badge badge-teal">Daily Plan</span>
          </div>
          <div class="stat-value">${stats.tasksDueToday}</div>
          <div class="stat-footnote">
            <span class="text-muted">${stats.tasksCompleted} completed so far</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-header">
            <span>Daily Completion</span>
            <span class="badge ${stats.dailyCompletionRate > 50 ? 'badge-success' : 'badge-neutral'}">Today</span>
          </div>
          <div class="stat-value">${stats.dailyCompletionRate}%</div>
          <div class="progress-track" style="margin-top: 4px;">
            <div class="progress-bar" style="width: ${stats.dailyCompletionRate}%;"></div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-header">
            <span>Mindful Streak</span>
            <span class="badge badge-warning">Consistency</span>
          </div>
          <div class="stat-value">${stats.streakDays} <span style="font-size: var(--font-size-sm); font-weight: 500;">days</span></div>
          <div class="stat-footnote">
            <span class="text-muted">Consecutive daily reviews</span>
          </div>
        </div>
      </section>

      <!-- Main Two-Column Layout -->
      <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: var(--space-6);" class="grid-2">
        <!-- Left Column: Daily Focus & Actionable Tasks -->
        <section class="card" aria-label="Today's Priority Tasks">
          <div class="card-header">
            <div>
              <h2 class="card-title">Today's Focus</h2>
              <p class="card-subtitle">Actionable commitments scheduled for today</p>
            </div>
            <a href="#/tasks" class="btn btn-outline btn-sm">View All Tasks</a>
          </div>

          ${
            demoMode
              ? `
            <div class="flex flex-col gap-3">
              ${DEMO_TASKS.map(
                (task) => `
                <div class="card" style="padding: var(--space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-color: ${task.status === 'completed' ? 'var(--color-border-subtle)' : 'var(--color-border-medium)'};">
                  <div class="flex items-center gap-3">
                    <div style="width: 22px; height: 22px; border-radius: var(--radius-sm); border: 2px solid ${task.status === 'completed' ? 'var(--color-success-solid)' : 'var(--color-border-strong)'}; background-color: ${task.status === 'completed' ? 'var(--color-success-solid)' : 'transparent'}; display: flex; align-items: center; justify-content: center; color: white;">
                      ${task.status === 'completed' ? '✓' : ''}
                    </div>
                    <div>
                      <h4 style="font-size: var(--font-size-sm); text-decoration: ${task.status === 'completed' ? 'line-through' : 'none'}; color: ${task.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)'};">${task.title}</h4>
                      <div class="flex items-center gap-2 text-xs text-muted" style="margin-top: 2px;">
                        <span>${task.estimated_duration} mins</span>
                        <span>•</span>
                        <span>${task.goal_title}</span>
                      </div>
                    </div>
                  </div>
                  <span class="badge ${task.priority === 'high' ? 'badge-danger' : 'badge-neutral'}">${task.priority}</span>
                </div>
              `
              ).join('')}
            </div>
          `
              : `
            <div class="empty-state">
              <div class="empty-state-icon">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </div>
              <h3 class="empty-state-title">No tasks scheduled for today</h3>
              <p class="empty-state-description">Your schedule is completely open. Plan 2-3 focused commitments aligned to your core goals.</p>
              <a href="#/tasks" class="btn btn-primary">Create Your First Task</a>
            </div>
          `
          }
        </section>

        <!-- Right Column: Goals Overview & Mindful Sticky Notes -->
        <div class="flex flex-col gap-6">
          <section class="card" aria-label="Goal Progress Overview">
            <div class="card-header">
              <div>
                <h2 class="card-title">Priority Goals</h2>
                <p class="card-subtitle">Trajectory and completion</p>
              </div>
              <a href="#/goals" class="btn btn-outline btn-sm">Manage</a>
            </div>

            ${
              demoMode
                ? `
              <div class="flex flex-col gap-4">
                ${DEMO_GOALS.map(
                  (goal) => `
                  <div>
                    <div class="flex justify-between text-xs" style="margin-bottom: 4px;">
                      <span class="font-semibold">${goal.title}</span>
                      <span class="text-muted">${goal.progress_percentage}%</span>
                    </div>
                    <div class="progress-track">
                      <div class="progress-bar" style="width: ${goal.progress_percentage}%;"></div>
                    </div>
                    <div class="flex justify-between text-xs text-muted" style="margin-top: 4px;">
                      <span>Target: ${goal.target_date}</span>
                      <span>${goal.current_value} / ${goal.target_value} ${goal.unit}</span>
                    </div>
                  </div>
                `
                ).join('')}
              </div>
            `
                : `
              <div class="empty-state" style="padding: var(--space-8) var(--space-4);">
                <div class="empty-state-icon" style="width: 48px; height: 48px; margin-bottom: var(--space-3);">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="6"/>
                    <circle cx="12" cy="12" r="2"/>
                  </svg>
                </div>
                <h3 class="empty-state-title" style="font-size: var(--font-size-md);">No goals set yet</h3>
                <p class="empty-state-description" style="font-size: var(--font-size-xs); margin-bottom: var(--space-4);">Define short or long-term goals with measurable milestones.</p>
                <a href="#/goals" class="btn btn-outline btn-sm">Set a Goal</a>
              </div>
            `
            }
          </section>

          <!-- Mindful Reflection Sticky Note -->
          <section class="sticky-note yellow" aria-label="Daily Mindful Prompt">
            <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
              <span class="font-bold text-xs" style="text-transform: uppercase; letter-spacing: 0.05em;">Mindful Reflection</span>
              <span class="text-xs">Evening Closing</span>
            </div>
            <p style="font-size: var(--font-size-sm); color: inherit; line-height: 1.5;">
              "True progress is made not by doing everything at once, but by showing up consistently for the few things that matter most."
            </p>
            <div style="margin-top: var(--space-3);" class="flex justify-between items-center">
              <span class="text-xs" style="opacity: 0.85;">Midnight review automatically secures unconfirmed work.</span>
              <a href="#/progress" class="font-semibold text-xs" style="color: inherit; text-decoration: underline;">Review Day</a>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}
