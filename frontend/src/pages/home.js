/**
 * Home Page - Professional Dashboard
 * 
 * Features:
 * - Live authoritative backend statistics (zero hardcoded sample metrics in production)
 * - Today's task summary & daily completion percentage
 * - Short-term and long-term goal progress breakdown
 * - Upcoming deadlines and delayed milestones / goals at risk
 * - Recent activity feed (recent reviews & completed commitments)
 * - Clear distinction between daily completion vs. goal progress metrics
 * - Loading skeletons, zero-data empty states, and retryable error handling
 */

import { progressService } from '../services/progress-service.js';
import { goalsService } from '../services/goals-service.js';
import { tasksService } from '../services/tasks-service.js';
import { dailyReviewsService } from '../services/daily-reviews-service.js';
import { appState } from '../services/state.js';
import { DEMO_STATS, DEMO_GOALS, DEMO_TASKS } from '../services/fixtures.js';
import { renderSkeletonCardList } from '../components/loading-skeleton.js';
import { renderRetryableError } from '../components/retryable-error.js';
import { formatDate, formatDateDisplay, daysRemaining, formatPriority } from '../utils/formatters.js';
import { openAiPlannerModal } from './tasks/ai-planner-modal.js';
import { renderDailyClosingStatusCard } from '../components/daily-closing-status.js';
import { DataEvents, DATA_TOPICS } from '../services/data-events.js';

class DashboardController {
  constructor() {
    this.isLoading = false;
    this.error = null;
    this.data = {
      daily: null,
      shortTerm: null,
      longTerm: null,
      goals: [],
      tasks: [],
      recentReviews: [],
    };
    this._container = null;

    // Reactively refresh when app is resumed or progress/tasks change
    DataEvents.on(DATA_TOPICS.PROGRESS_CHANGED, () => {
      if (!this.isLoading) this.loadDashboardData();
    });
    DataEvents.on(DATA_TOPICS.TASKS_CHANGED, () => {
      if (!this.isLoading) this.loadDashboardData();
    });
  }

  setContainer(container) {
    this._container = container;
  }

  async loadDashboardData() {
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      const [dailyRes, shortTermRes, longTermRes, goalsRes, tasksRes, reviewsRes] = await Promise.allSettled([
        progressService.getDailyProgress({ timezone: tz }),
        progressService.getShortTermGoalsProgress(),
        progressService.getLongTermGoalsProgress(),
        goalsService.listGoals({ limit: 50 }),
        tasksService.listTasks({ limit: 50 }),
        dailyReviewsService.listReviews({ limit: 5 }),
      ]);

      this.data.daily = dailyRes.status === 'fulfilled' ? dailyRes.value : { completion_percentage: 0, total_tasks: 0, completed_tasks: 0, tasks: [] };
      this.data.shortTerm = shortTermRes.status === 'fulfilled' ? shortTermRes.value : { count: 0, average_progress: 0, goals: [] };
      this.data.longTerm = longTermRes.status === 'fulfilled' ? longTermRes.value : { count: 0, average_progress: 0, goals: [] };
      this.data.goals = goalsRes.status === 'fulfilled' ? goalsRes.value : [];
      this.data.tasks = tasksRes.status === 'fulfilled' ? tasksRes.value : [];
      this.data.recentReviews = reviewsRes.status === 'fulfilled' ? reviewsRes.value : [];
    } catch (err) {
      console.error('[Dashboard] Error loading metrics:', err);
      this.error = err.message || 'Failed to load dashboard metrics from backend.';
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  render() {
    if (!this._container) return;
    const mount = this._container.querySelector('#dashboard-page-root');
    if (!mount) return;
    mount.innerHTML = this.renderContent(appState.getState().demoMode);
    this.bindEvents();
  }

  renderContent(demoMode) {
    if (demoMode) {
      return this.renderDemoContent();
    }

    if (this.isLoading) {
      return `
        <div style="padding: var(--space-4) 0;">
          <div class="grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); margin-bottom: var(--space-6);">
            ${renderSkeletonCardList(4)}
          </div>
          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: var(--space-6);">
            ${renderSkeletonCardList(2)}
          </div>
        </div>
      `;
    }

    if (this.error) {
      return renderRetryableError({
        message: this.error,
        retryId: 'dashboard-retry-btn',
      });
    }

    const { daily, shortTerm, longTerm, goals, tasks, recentReviews } = this.data;
    const dailyRate = Math.round(daily?.completion_percentage || 0);
    const shortTermAvg = Math.round(shortTerm?.average_progress || 0);
    const longTermAvg = Math.round(longTerm?.average_progress || 0);
    const activeGoalsCount = goals.filter((g) => g.status !== 'completed' && g.status !== 'archived').length;

    // Filter today's tasks
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter((t) => t.scheduled_date === todayStr);

    // Identify Upcoming Deadlines (goals with target_date in the future, sorted by nearest)
    const upcomingDeadlines = goals
      .filter((g) => g.target_date && g.target_date >= todayStr && g.status !== 'completed')
      .sort((a, b) => a.target_date.localeCompare(b.target_date))
      .slice(0, 4);

    // Identify Delayed Milestones & Goals At Risk
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const goalsAtRisk = goals.filter((g) => {
      if (g.status === 'completed' || g.status === 'archived') return false;
      if (!g.target_date) return false;
      const t = new Date(g.target_date);
      t.setHours(0, 0, 0, 0);
      const isOverdue = t < now;
      const isUrgentAndLagging = t - now < 14 * 86400000 && (g.progress_percentage || 0) < 40;
      return isOverdue || isUrgentAndLagging;
    });

    return `
      <div class="page-container">
        <!-- Metric Cards Grid -->
        <section class="grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);" aria-label="Key Performance Indicators">
          
          <!-- Metric 1: Daily Task Completion % -->
          <div class="stat-card">
            <div class="stat-header">
              <span>Today's Completion</span>
              <span class="badge ${dailyRate >= 70 ? 'badge-success' : 'badge-neutral'}">Daily Rate</span>
            </div>
            <div class="stat-value">${dailyRate}%</div>
            <div class="progress-track" style="margin-top: 4px; height: 6px;">
              <div class="progress-bar" style="width: ${dailyRate}%; background: ${dailyRate >= 70 ? 'var(--color-success-solid)' : 'var(--color-primary-600)'};"></div>
            </div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>${daily?.completed_tasks || 0} of ${daily?.total_tasks || 0} tasks completed</span>
            </div>
          </div>

          <!-- Metric 2: Short-Term Goal Progress -->
          <div class="stat-card">
            <div class="stat-header">
              <span>Short-Term Goals</span>
              <span class="badge badge-primary">Milestones</span>
            </div>
            <div class="stat-value">${shortTermAvg}%</div>
            <div class="progress-track" style="margin-top: 4px; height: 6px;">
              <div class="progress-bar" style="width: ${shortTermAvg}%;"></div>
            </div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>${shortTerm?.count || 0} active short-term goals</span>
            </div>
          </div>

          <!-- Metric 3: Long-Term Goal Progress -->
          <div class="stat-card">
            <div class="stat-header">
              <span>Long-Term Goals</span>
              <span class="badge badge-teal">Trajectory</span>
            </div>
            <div class="stat-value">${longTermAvg}%</div>
            <div class="progress-track" style="margin-top: 4px; height: 6px;">
              <div class="progress-bar" style="width: ${longTermAvg}%; background: var(--color-teal-600, #0d9488);"></div>
            </div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>${longTerm?.count || 0} active long-term goals</span>
            </div>
          </div>

          <!-- Metric 4: Active Goals & Focus -->
          <div class="stat-card">
            <div class="stat-header">
              <span>Active Goals</span>
              <span class="badge badge-warning">Focus</span>
            </div>
            <div class="stat-value">${activeGoalsCount}</div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>Across all categories</span>
            </div>
          </div>
        </section>

        <!-- Metric Explanation Callout -->
        <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border-subtle); margin: var(--space-5) 0;" class="flex items-start gap-3">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-primary-600); flex-shrink: 0; margin-top: 2px;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div class="text-xs" style="color: var(--color-text-secondary); line-height: 1.45;">
            <strong>Understanding your metrics:</strong> 
            <span style="color: var(--color-text-primary); font-weight: 600;">Daily Completion</span> measures scheduled tasks finished today (unverified tasks stay in denominator).
            <span style="color: var(--color-text-primary); font-weight: 600;"> Goal Progress</span> is strictly calculated from weighted milestone completion and quantitative target achievement.
          </div>
        </div>

        <!-- Main Two-Column Layout -->
        <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: var(--space-6);" class="grid-2">
          
          <!-- LEFT COLUMN: Today's Focus & Recent Activity -->
          <div class="flex flex-col gap-6">
            
            <!-- Today's Task Commitments -->
            <section class="card" aria-label="Today's Commitments">
              <div class="card-header">
                <div>
                  <h2 class="card-title">Today's Focus</h2>
                  <p class="card-subtitle">Scheduled commitments for ${formatDateDisplay(todayStr)}</p>
                </div>
                <div class="flex gap-2">
                  <button id="home-ai-plan-btn" class="btn btn-outline btn-sm" style="border-color: var(--color-primary-500); color: var(--color-primary-700);" title="AI Plan My Day">
                    ✦ Plan My Day
                  </button>
                  <a href="#/tasks" class="btn btn-outline btn-sm">Planner</a>
                  <a href="#/progress" class="btn btn-primary btn-sm">Evening Review</a>
                </div>
              </div>

              ${todayTasks.length === 0 ? `
                <div class="empty-state" style="padding: var(--space-6) var(--space-4);">
                  <div class="empty-state-icon" style="width: 44px; height: 44px;">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 11 12 14 22 4"/>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                  </div>
                  <h3 class="empty-state-title" style="font-size: var(--font-size-md);">No tasks scheduled for today</h3>
                  <p class="empty-state-description" style="font-size: var(--font-size-xs);">Your daily planner is clear. Schedule 2-3 focused commitments aligned with your priority goals.</p>
                  <a href="#/tasks" class="btn btn-outline btn-sm" style="margin-top: var(--space-3);">Add Daily Task</a>
                </div>
              ` : `
                <div class="flex flex-col gap-3">
                  ${todayTasks.map((t) => `
                    <div class="card" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); background: var(--color-surface-hover); border-left: 3px solid ${t.status === 'completed' ? 'var(--color-success-solid)' : 'var(--color-primary-500)'};">
                      <div class="flex items-center gap-3">
                        <div style="width: 22px; height: 22px; border-radius: var(--radius-sm); border: 2px solid ${t.status === 'completed' ? 'var(--color-success-solid)' : 'var(--color-border-strong)'}; background: ${t.status === 'completed' ? 'var(--color-success-solid)' : 'transparent'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 13px;">
                          ${t.status === 'completed' ? '✓' : ''}
                        </div>
                        <div>
                          <h4 style="font-size: var(--font-size-sm); margin: 0; text-decoration: ${t.status === 'completed' ? 'line-through' : 'none'}; color: ${t.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)'};">
                            ${t.title}
                          </h4>
                          <div class="flex items-center gap-2 text-xs text-muted" style="margin-top: 2px;">
                            <span>${t.estimated_duration || 30} mins</span>
                            ${t.goal_title ? `<span>•</span><span>${t.goal_title}</span>` : ''}
                          </div>
                        </div>
                      </div>
                      <span class="badge ${t.priority === 'urgent' || t.priority === 'high' ? 'badge-danger' : 'badge-neutral'}">
                        ${formatPriority(t.priority)}
                      </span>
                    </div>
                  `).join('')}
                </div>
              `}
            </section>

            <!-- Recent Activity Feed -->
            <section class="card" aria-label="Recent Account Activity">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Recent Activity</h3>
                  <p class="card-subtitle">Frozen reviews & completed commitments</p>
                </div>
              </div>

              ${recentReviews.length === 0 ? `
                <p class="text-xs text-muted">No historical daily reviews recorded yet. Submit your first evening review to begin building your streak.</p>
              ` : `
                <div class="flex flex-col gap-3">
                  ${recentReviews.map((rev) => `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background: var(--color-surface-hover); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle);">
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-bold">${formatDateDisplay(rev.date)}</span>
                          <span class="badge badge-success" style="font-size: 10px;">${Math.round(rev.completion_rate || 0)}% Done</span>
                        </div>
                        <p class="text-xs text-muted" style="margin-top: 2px;">
                          ${rev.wins ? `Wins: ${rev.wins.substring(0, 50)}${rev.wins.length > 50 ? '...' : ''}` : 'Mindful review recorded.'}
                        </p>
                      </div>
                      <div style="color: #f59e0b; font-size: 14px;">
                        ${'★'.repeat(rev.rating || 3)}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </section>
          </div>

          <!-- RIGHT COLUMN: Deadlines, Delayed Milestones & Goals At Risk -->
          <div class="flex flex-col gap-6">
            
            <!-- Daily Closing Status Widget -->
            ${renderDailyClosingStatusCard({
              review: recentReviews.find((r) => r.date === todayStr) || null,
              dailyProgress: daily,
              tasks: todayTasks,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            })}

            <!-- Upcoming Deadlines -->
            <section class="card" aria-label="Upcoming Deadlines">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Upcoming Deadlines</h3>
                  <p class="card-subtitle">Nearest milestone target dates</p>
                </div>
                <a href="#/goals" class="btn btn-outline btn-sm">Goals</a>
              </div>

              ${upcomingDeadlines.length === 0 ? `
                <p class="text-xs text-muted">No upcoming deadlines scheduled in the near future.</p>
              ` : `
                <div class="flex flex-col gap-3">
                  ${upcomingDeadlines.map((g) => `
                    <div style="padding: var(--space-3); background: var(--color-surface-hover); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle);">
                      <div class="flex justify-between items-center text-xs" style="margin-bottom: 4px;">
                        <span class="font-semibold">${g.title}</span>
                        <span class="badge badge-teal">${daysRemaining(g.target_date)}</span>
                      </div>
                      <div class="progress-track" style="height: 6px;">
                        <div class="progress-bar" style="width: ${g.progress_percentage || 0}%;"></div>
                      </div>
                      <div class="flex justify-between text-xs text-muted" style="margin-top: 4px;">
                        <span>Target: ${formatDate(g.target_date)}</span>
                        <span>${g.progress_percentage || 0}% progress</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </section>

            <!-- Delayed Milestones & Goals At Risk -->
            <section class="card" aria-label="Delayed Milestones & Goals At Risk">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Goals at Risk</h3>
                  <p class="card-subtitle">Items requiring proactive adjustment</p>
                </div>
                <div class="flex items-center gap-2">
                  ${goalsAtRisk.length > 0 ? `
                    <button id="home-ai-recovery-btn" class="btn btn-outline btn-sm" style="border-color: var(--color-warning-border, #f59e0b); color: var(--color-warning-solid, #d97706);" title="Recovery Mode: Get Back on Track">
                      ✦ Recovery Mode
                    </button>
                  ` : ''}
                  <span class="badge ${goalsAtRisk.length > 0 ? 'badge-danger' : 'badge-success'}">
                    ${goalsAtRisk.length > 0 ? `${goalsAtRisk.length} At Risk` : 'Healthy'}
                  </span>
                </div>
              </div>

              ${goalsAtRisk.length === 0 ? `
                <div style="padding: var(--space-4); text-align: center; background: var(--color-surface-hover); border-radius: var(--radius-md);">
                  <div style="color: var(--color-success-solid); font-size: 20px; margin-bottom: 4px;">✓</div>
                  <p class="text-xs font-semibold text-success">All goals on schedule</p>
                  <p class="text-xs text-muted" style="margin-top: 2px;">No overdue targets or lagging milestones detected.</p>
                </div>
              ` : `
                <div class="flex flex-col gap-3">
                  ${goalsAtRisk.map((g) => `
                    <div style="padding: var(--space-3); background: var(--color-danger-bg, #fef2f2); border-left: 3px solid var(--color-danger-solid); border-radius: var(--radius-md);">
                      <div class="flex justify-between items-center text-xs">
                        <span class="font-bold text-danger">${g.title}</span>
                        <span class="badge badge-danger">${daysRemaining(g.target_date)}</span>
                      </div>
                      <p class="text-xs text-muted" style="margin-top: 4px;">
                        Target date was ${formatDate(g.target_date)}. Progress stands at ${g.progress_percentage || 0}%.
                      </p>
                    </div>
                  `).join('')}
                </div>
              `}
            </section>

            <!-- Mindful Reflection Callout -->
            <section class="sticky-note yellow">
              <div class="flex items-center justify-between" style="margin-bottom: var(--space-1);">
                <span class="font-bold text-xs" style="text-transform: uppercase;">Mindful Reflection</span>
                <span class="text-xs">Evening Habit</span>
              </div>
              <p style="font-size: var(--font-size-xs); line-height: 1.5;">
                "True progress is made not by doing everything at once, but by showing up consistently for the few things that matter most."
              </p>
              <div style="margin-top: var(--space-3);" class="flex justify-between items-center">
                <span class="text-xs" style="opacity: 0.85;">Daily snapshot preserves unverified work.</span>
                <a href="#/progress" class="font-semibold text-xs" style="text-decoration: underline;">Review Day</a>
              </div>
            </section>

          </div>
        </div>
      </div>
    `;
  }

  renderDemoContent() {
    return `
      <div class="page-container">
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

        <section class="grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);" aria-label="Key Performance Metrics">
          <div class="stat-card">
            <div class="stat-header"><span>Active Goals</span><span class="badge badge-primary">Focused</span></div>
            <div class="stat-value">${DEMO_STATS.activeGoals}</div>
            <div class="stat-footnote text-muted"><span>Long-term & short-term targets</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-header"><span>Tasks Due Today</span><span class="badge badge-teal">Daily Plan</span></div>
            <div class="stat-value">${DEMO_STATS.tasksDueToday}</div>
            <div class="stat-footnote text-muted"><span>${DEMO_STATS.tasksCompleted} completed so far</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-header"><span>Daily Completion</span><span class="badge badge-success">Today</span></div>
            <div class="stat-value">${DEMO_STATS.dailyCompletionRate}%</div>
            <div class="progress-track" style="margin-top: 4px;"><div class="progress-bar" style="width: ${DEMO_STATS.dailyCompletionRate}%;"></div></div>
          </div>
          <div class="stat-card">
            <div class="stat-header"><span>Mindful Streak</span><span class="badge badge-warning">Consistency</span></div>
            <div class="stat-value">${DEMO_STATS.streakDays} <span style="font-size: var(--font-size-sm); font-weight: 500;">days</span></div>
            <div class="stat-footnote text-muted"><span>Consecutive daily reviews</span></div>
          </div>
        </section>

        <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: var(--space-6); margin-top: var(--space-6);" class="grid-2">
          <section class="card">
            <div class="card-header">
              <div><h2 class="card-title">Today's Focus</h2><p class="card-subtitle">Actionable commitments scheduled for today</p></div>
              <a href="#/tasks" class="btn btn-outline btn-sm">View All Tasks</a>
            </div>
            <div class="flex flex-col gap-3">
              ${DEMO_TASKS.map((task) => `
                <div class="card" style="padding: var(--space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-color: ${task.status === 'completed' ? 'var(--color-border-subtle)' : 'var(--color-border-medium)'};">
                  <div class="flex items-center gap-3">
                    <div style="width: 22px; height: 22px; border-radius: var(--radius-sm); border: 2px solid ${task.status === 'completed' ? 'var(--color-success-solid)' : 'var(--color-border-strong)'}; background-color: ${task.status === 'completed' ? 'var(--color-success-solid)' : 'transparent'}; display: flex; align-items: center; justify-content: center; color: white;">
                      ${task.status === 'completed' ? '✓' : ''}
                    </div>
                    <div>
                      <h4 style="font-size: var(--font-size-sm); text-decoration: ${task.status === 'completed' ? 'line-through' : 'none'}; color: ${task.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)'};">${task.title}</h4>
                      <div class="flex items-center gap-2 text-xs text-muted" style="margin-top: 2px;">
                        <span>${task.estimated_duration} mins</span><span>•</span><span>${task.goal_title}</span>
                      </div>
                    </div>
                  </div>
                  <span class="badge ${task.priority === 'high' ? 'badge-danger' : 'badge-neutral'}">${task.priority}</span>
                </div>
              `).join('')}
            </div>
          </section>

          <div class="flex flex-col gap-6">
            <section class="card">
              <div class="card-header">
                <div><h2 class="card-title">Priority Goals</h2><p class="card-subtitle">Trajectory and completion</p></div>
                <a href="#/goals" class="btn btn-outline btn-sm">Manage</a>
              </div>
              <div class="flex flex-col gap-4">
                ${DEMO_GOALS.map((goal) => `
                  <div>
                    <div class="flex justify-between text-xs" style="margin-bottom: 4px;">
                      <span class="font-semibold">${goal.title}</span><span class="text-muted">${goal.progress_percentage}%</span>
                    </div>
                    <div class="progress-track"><div class="progress-bar" style="width: ${goal.progress_percentage}%;"></div></div>
                    <div class="flex justify-between text-xs text-muted" style="margin-top: 4px;">
                      <span>Target: ${goal.target_date}</span><span>${goal.current_value} / ${goal.target_value} ${goal.unit}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this._container) return;

    // Retry Button
    const retryBtn = this._container.querySelector('#dashboard-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadDashboardData());
    }

    // Disable Demo Button
    const disableDemoBtn = this._container.querySelector('#disable-demo-btn');
    if (disableDemoBtn) {
      disableDemoBtn.addEventListener('click', () => {
        appState.toggleDemoMode();
      });
    }

    // AI Assistant Buttons
    const aiPlanBtn = this._container.querySelector('#home-ai-plan-btn');
    if (aiPlanBtn) {
      aiPlanBtn.addEventListener('click', () => {
        openAiPlannerModal({
          mode: 'plan',
          goals: this.data.goals,
          tasks: this.data.tasks,
          onTasksSaved: () => this.loadDashboardData(),
        });
      });
    }

    const aiRecoveryBtn = this._container.querySelector('#home-ai-recovery-btn');
    if (aiRecoveryBtn) {
      aiRecoveryBtn.addEventListener('click', () => {
        openAiPlannerModal({
          mode: 'recovery',
          goals: this.data.goals,
          tasks: this.data.tasks,
          onTasksSaved: () => this.loadDashboardData(),
        });
      });
    }
  }
}

export const dashboardController = new DashboardController();

export function renderHomePage(demoMode) {
  return `
    <div id="dashboard-page-root">
      ${dashboardController.renderContent(demoMode)}
    </div>
  `;
}

export function bindHomeEvents(mountElement) {
  dashboardController.setContainer(mountElement);
  dashboardController.bindEvents();

  if (!appState.getState().demoMode && !dashboardController.data.daily && !dashboardController.isLoading) {
    dashboardController.loadDashboardData();
  }
}
