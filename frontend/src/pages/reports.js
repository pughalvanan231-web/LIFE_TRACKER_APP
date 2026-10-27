/**
 * Reports & Performance Analytics Page
 * 
 * Features:
 * - Daily, Weekly, Monthly, and Custom Date-Range reporting selectors
 * - Chart.js stacked bar visualization of completed, not done, unverified, and postponed tasks
 * - Accessible summary data table for screen readers and mobile screens
 * - Live authoritative backend data (no hardcoded sample metrics in production)
 * - Clear distinction between daily task completion and cumulative goal mastery
 * - Zero-data states, loading skeletons, and retryable error handling
 */

import { reportsService } from '../services/reports-service.js';
import { progressService } from '../services/progress-service.js';
import { renderDailyBreakdownChart, destroyChart } from '../components/chart-helper.js';
import { renderSkeletonCardList } from '../components/loading-skeleton.js';
import { renderRetryableError } from '../components/retryable-error.js';
import { renderEmptyState } from '../components/empty-state.js';
import { formatDate, formatDateDisplay } from '../utils/formatters.js';
import { appState } from '../services/state.js';

class ReportsController {
  constructor() {
    this.rangeType = 'weekly'; // 'daily' | 'weekly' | 'monthly' | 'custom'
    const today = new Date().toISOString().split('T')[0];
    this.endDate = today;
    this.startDate = '';
    this.selectedMonth = today.substring(0, 7); // YYYY-MM
    this.selectedDay = today;

    this.report = null;
    this.isLoading = false;
    this.error = null;
    this._container = null;
  }

  setContainer(container) {
    this._container = container;
  }

  async loadReport() {
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      let reportData = null;

      if (this.rangeType === 'daily') {
        // Run single-day custom report or get daily progress
        reportData = await reportsService.getCustomReport({
          startDate: this.selectedDay,
          endDate: this.selectedDay,
          timezone: tz,
        });
      } else if (this.rangeType === 'weekly') {
        reportData = await reportsService.getWeeklyReport({
          endDate: this.endDate || null,
          timezone: tz,
        });
      } else if (this.rangeType === 'monthly') {
        reportData = await reportsService.getMonthlyReport({
          month: this.selectedMonth || null,
          timezone: tz,
        });
      } else if (this.rangeType === 'custom') {
        if (!this.startDate || !this.endDate) {
          throw new Error('Please select both start date and end date for custom reports.');
        }
        if (this.startDate > this.endDate) {
          throw new Error('Start date cannot be after end date.');
        }
        reportData = await reportsService.getCustomReport({
          startDate: this.startDate,
          endDate: this.endDate,
          timezone: tz,
        });
      }

      this.report = reportData;
    } catch (err) {
      console.error('[ReportsController] Load error:', err);
      this.error = err.message || 'Failed to generate performance report.';
    } finally {
      this.isLoading = false;
      this.render();
      // Render chart once DOM is updated
      this.attachChart();
    }
  }

  attachChart() {
    if (!this._container || !this.report || this.report.total_tasks_scheduled === 0) return;
    const canvas = this._container.querySelector('#report-breakdown-canvas');
    if (!canvas) return;

    // Render stacked bar chart from helper
    try {
      renderDailyBreakdownChart('report-breakdown-canvas', this.report.daily_breakdown || []);
    } catch (err) {
      console.warn('[ReportsController] Chart render warning:', err);
    }
  }

  render() {
    if (!this._container) return;
    const mount = this._container.querySelector('#reports-page-root');
    if (!mount) return;
    mount.innerHTML = this.renderContent();
    this.bindEvents();
  }

  renderContent() {
    const today = new Date().toISOString().split('T')[0];

    return `
      <!-- Header & Range Selectors -->
      <div class="card" style="margin-bottom: var(--space-6); background: var(--color-surface-card);">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 style="font-size: var(--font-size-xl); font-weight: 700; margin: 0;">Performance & Reports</h2>
            <p class="text-xs text-muted" style="margin-top: 2px;">
              Objective trajectory audits derived from frozen daily review snapshots.
            </p>
          </div>

          <!-- Range Type Tabs -->
          <div class="flex gap-1" style="background: var(--color-surface-hover); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle);">
            <button class="btn btn-sm ${this.rangeType === 'daily' ? 'btn-primary' : 'btn-ghost'} range-selector-btn" data-range="daily">
              Daily
            </button>
            <button class="btn btn-sm ${this.rangeType === 'weekly' ? 'btn-primary' : 'btn-ghost'} range-selector-btn" data-range="weekly">
              Weekly
            </button>
            <button class="btn btn-sm ${this.rangeType === 'monthly' ? 'btn-primary' : 'btn-ghost'} range-selector-btn" data-range="monthly">
              Monthly
            </button>
            <button class="btn btn-sm ${this.rangeType === 'custom' ? 'btn-primary' : 'btn-ghost'} range-selector-btn" data-range="custom">
              Custom Range
            </button>
          </div>
        </div>

        <!-- Secondary Controls based on Selected Range -->
        <div style="border-top: 1px solid var(--color-border-subtle); margin-top: var(--space-4); padding-top: var(--space-4);" class="flex flex-wrap items-center justify-between gap-3">
          ${this.renderRangeSpecificControls(today)}
        </div>
      </div>

      <!-- Main Report Body -->
      ${this.renderReportBody()}
    `;
  }

  renderRangeSpecificControls(today) {
    if (this.rangeType === 'daily') {
      return `
        <div class="flex items-center gap-2">
          <label class="text-xs text-muted font-medium">Select Day:</label>
          <input type="date" id="report-day-picker" class="form-input" style="padding: 0.3rem 0.6rem; font-size: 13px;" value="${this.selectedDay}" max="${today}">
          <button id="report-day-apply-btn" class="btn btn-outline btn-sm">Load Day</button>
        </div>
        <span class="text-xs text-muted">Audits single calendar day performance</span>
      `;
    }

    if (this.rangeType === 'weekly') {
      return `
        <div class="flex items-center gap-2">
          <label class="text-xs text-muted font-medium">Week Ending On:</label>
          <input type="date" id="report-week-end-picker" class="form-input" style="padding: 0.3rem 0.6rem; font-size: 13px;" value="${this.endDate || today}" max="${today}">
          <button id="report-week-apply-btn" class="btn btn-outline btn-sm">Load Week</button>
        </div>
        <span class="text-xs text-muted">7 consecutive calendar days leading up to the selected date</span>
      `;
    }

    if (this.rangeType === 'monthly') {
      return `
        <div class="flex items-center gap-2">
          <label class="text-xs text-muted font-medium">Month (YYYY-MM):</label>
          <input type="month" id="report-month-picker" class="form-input" style="padding: 0.3rem 0.6rem; font-size: 13px;" value="${this.selectedMonth}" max="${today.substring(0, 7)}">
          <button id="report-month-apply-btn" class="btn btn-outline btn-sm">Load Month</button>
        </div>
        <span class="text-xs text-muted">Complete calendar month aggregate metrics</span>
      `;
    }

    if (this.rangeType === 'custom') {
      return `
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-xs text-muted font-medium">From:</label>
          <input type="date" id="report-custom-start" class="form-input" style="padding: 0.3rem 0.6rem; font-size: 13px;" value="${this.startDate}">
          <label class="text-xs text-muted font-medium">To:</label>
          <input type="date" id="report-custom-end" class="form-input" style="padding: 0.3rem 0.6rem; font-size: 13px;" value="${this.endDate || today}" max="${today}">
          <button id="report-custom-apply-btn" class="btn btn-primary btn-sm">Generate Report</button>
        </div>
        <span class="text-xs text-muted">Custom interval evaluation</span>
      `;
    }

    return '';
  }

  renderReportBody() {
    if (this.isLoading) {
      return `
        <div style="padding: var(--space-4) 0;">
          <div class="grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); margin-bottom: var(--space-6);">
            ${renderSkeletonCardList(4)}
          </div>
          ${renderSkeletonCardList(1)}
        </div>
      `;
    }

    if (this.error) {
      return renderRetryableError({
        message: this.error,
        retryId: 'reports-retry-btn',
      });
    }

    if (!this.report) {
      return `
        <div class="empty-state">
          <p class="text-sm text-muted">Select a date range and click generate to load your performance report.</p>
        </div>
      `;
    }

    const {
      start_date,
      end_date,
      total_days,
      active_days,
      total_tasks_scheduled,
      completed_count,
      not_completed_count,
      postponed_count,
      unverified_count,
      overall_completion_rate,
      daily_breakdown,
    } = this.report;

    const rate = Math.round(overall_completion_rate || 0);

    // Empty state handling when no tasks are scheduled in this period
    if (total_tasks_scheduled === 0) {
      return `
        <div class="card" style="margin-bottom: var(--space-6);">
          ${renderEmptyState({
            title: 'No Task Activity in This Period',
            description: `No commitments were scheduled between ${formatDate(start_date)} and ${formatDate(end_date)}. Schedule tasks in your daily planner or choose another date range.`,
            actionText: 'Go to Daily Planner',
            actionId: 'reports-empty-planner-btn',
          })}
        </div>
      `;
    }

    return `
      <div class="flex flex-col gap-6">
        
        <!-- Summary Stat Cards -->
        <section class="grid-4" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);" aria-label="Report Summary Metrics">
          
          <div class="stat-card">
            <div class="stat-header">
              <span>Overall Completion</span>
              <span class="badge ${rate >= 70 ? 'badge-success' : 'badge-neutral'}">Rate</span>
            </div>
            <div class="stat-value">${rate}%</div>
            <div class="progress-track" style="margin-top: 4px; height: 6px;">
              <div class="progress-bar" style="width: ${rate}%; background: ${rate >= 70 ? 'var(--color-success-solid)' : 'var(--color-primary-600)'};"></div>
            </div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>${completed_count} of ${total_tasks_scheduled} tasks completed</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <span>Active Commitment Days</span>
              <span class="badge badge-teal">Consistency</span>
            </div>
            <div class="stat-value">${active_days} <span style="font-size: var(--font-size-sm); font-weight: 500;">/ ${total_days} days</span></div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>Days with scheduled tasks</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <span>Unverified Tasks</span>
              <span class="badge badge-neutral" title="Unconfirmed commitments">Unconfirmed</span>
            </div>
            <div class="stat-value">${unverified_count}</div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>Unconfirmed prior to closing</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <span>Postponed / Rescheduled</span>
              <span class="badge badge-warning">Adjusted</span>
            </div>
            <div class="stat-value">${postponed_count}</div>
            <div class="stat-footnote text-muted" style="margin-top: 6px;">
              <span>Rescheduled for future days</span>
            </div>
          </div>
        </section>

        <!-- Metric Integrity Callout -->
        <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border-subtle);" class="flex items-start gap-3">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-primary-600); flex-shrink: 0; margin-top: 2px;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div class="text-xs" style="color: var(--color-text-secondary); line-height: 1.45;">
            <strong>Objective Progress Distinction:</strong> 
            Daily completion measures tasks completed vs scheduled due in the period. Unverified tasks are kept in the denominator to preserve mathematical integrity. 
            <span style="color: var(--color-text-primary); font-weight: 600;">Unverified does not mean failure</span>; it reflects untracked outcomes.
          </div>
        </div>

        <!-- Chart.js Visualization Card -->
        <section class="card" aria-label="Task Status Breakdown Chart">
          <div class="card-header">
            <div>
              <h3 class="card-title">Daily Task Distribution</h3>
              <p class="card-subtitle">
                Period: ${formatDate(start_date)} through ${formatDate(end_date)}
              </p>
            </div>
            <div class="flex items-center gap-3 text-xs">
              <span class="flex items-center gap-1"><span style="width: 10px; height: 10px; background: #059669; border-radius: 2px; display: inline-block;"></span> Completed</span>
              <span class="flex items-center gap-1"><span style="width: 10px; height: 10px; background: #dc2626; border-radius: 2px; display: inline-block;"></span> Not Done</span>
              <span class="flex items-center gap-1"><span style="width: 10px; height: 10px; background: #94a3b8; border-radius: 2px; display: inline-block;"></span> Unverified</span>
              <span class="flex items-center gap-1"><span style="width: 10px; height: 10px; background: #d97706; border-radius: 2px; display: inline-block;"></span> Postponed</span>
            </div>
          </div>

          <!-- Canvas Container -->
          <div style="position: relative; height: 260px; width: 100%; margin-top: var(--space-4);">
            <canvas id="report-breakdown-canvas"></canvas>
          </div>
        </section>

        <!-- Accessible Data Summary Table (Screen Reader & Mobile Friendly) -->
        <section class="card" aria-label="Daily Metric Details Table">
          <div class="card-header">
            <div>
              <h3 class="card-title">Daily Breakdown Table</h3>
              <p class="card-subtitle">Accessible tabular summary of all dates in report</p>
            </div>
          </div>

          <div style="overflow-x: auto; margin-top: var(--space-2);">
            <table class="table" style="width: 100%; font-size: var(--font-size-xs); text-align: left; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid var(--color-border-subtle); color: var(--color-text-muted);">
                  <th style="padding: 0.6rem 0.8rem;">Date</th>
                  <th style="padding: 0.6rem 0.8rem; text-align: right;">Completed</th>
                  <th style="padding: 0.6rem 0.8rem; text-align: right;">Not Done</th>
                  <th style="padding: 0.6rem 0.8rem; text-align: right;">Unverified</th>
                  <th style="padding: 0.6rem 0.8rem; text-align: right;">Postponed</th>
                  <th style="padding: 0.6rem 0.8rem; text-align: right;">Total Due</th>
                  <th style="padding: 0.6rem 0.8rem; text-align: right;">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                ${daily_breakdown.map((d) => `
                  <tr style="border-bottom: 1px solid var(--color-border-subtle); background: ${d.is_empty ? 'transparent' : 'var(--color-surface-hover)'};">
                    <td style="padding: 0.6rem 0.8rem; font-weight: 600;">
                      ${formatDateDisplay(d.date)}
                      ${d.is_empty ? '<span class="text-muted italic" style="font-weight: 400; margin-left: 4px;">(Rest day)</span>' : ''}
                    </td>
                    <td style="padding: 0.6rem 0.8rem; text-align: right; color: var(--color-success-solid); font-weight: 600;">${d.completed_count}</td>
                    <td style="padding: 0.6rem 0.8rem; text-align: right; color: var(--color-danger-solid);">${d.not_completed_count}</td>
                    <td style="padding: 0.6rem 0.8rem; text-align: right; color: var(--color-text-muted);">${d.unverified_count}</td>
                    <td style="padding: 0.6rem 0.8rem; text-align: right; color: var(--color-warning-solid);">${d.postponed_count}</td>
                    <td style="padding: 0.6rem 0.8rem; text-align: right; font-weight: 600;">${d.total_due}</td>
                    <td style="padding: 0.6rem 0.8rem; text-align: right; font-weight: 700; color: ${d.completion_rate >= 70 ? 'var(--color-success-solid)' : 'var(--color-text-primary)'};">
                      ${d.is_empty ? '—' : `${Math.round(d.completion_rate)}%`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    `;
  }

  bindEvents() {
    if (!this._container) return;

    // 1. Range Selector Buttons
    const rangeBtns = this._container.querySelectorAll('.range-selector-btn');
    for (const btn of rangeBtns) {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-range');
        if (type && type !== this.rangeType) {
          destroyChart('report-breakdown-canvas');
          this.rangeType = type;
          this.loadReport();
        }
      });
    }

    // 2. Daily Range Controls
    const dayPicker = this._container.querySelector('#report-day-picker');
    const dayApplyBtn = this._container.querySelector('#report-day-apply-btn');
    if (dayApplyBtn && dayPicker) {
      dayApplyBtn.addEventListener('click', () => {
        if (dayPicker.value) {
          this.selectedDay = dayPicker.value;
          this.loadReport();
        }
      });
    }

    // 3. Weekly Range Controls
    const weekEndPicker = this._container.querySelector('#report-week-end-picker');
    const weekApplyBtn = this._container.querySelector('#report-week-apply-btn');
    if (weekApplyBtn && weekEndPicker) {
      weekApplyBtn.addEventListener('click', () => {
        if (weekEndPicker.value) {
          this.endDate = weekEndPicker.value;
          this.loadReport();
        }
      });
    }

    // 4. Monthly Range Controls
    const monthPicker = this._container.querySelector('#report-month-picker');
    const monthApplyBtn = this._container.querySelector('#report-month-apply-btn');
    if (monthApplyBtn && monthPicker) {
      monthApplyBtn.addEventListener('click', () => {
        if (monthPicker.value) {
          this.selectedMonth = monthPicker.value;
          this.loadReport();
        }
      });
    }

    // 5. Custom Range Controls
    const customStart = this._container.querySelector('#report-custom-start');
    const customEnd = this._container.querySelector('#report-custom-end');
    const customApplyBtn = this._container.querySelector('#report-custom-apply-btn');
    if (customApplyBtn && customStart && customEnd) {
      customApplyBtn.addEventListener('click', () => {
        this.startDate = customStart.value;
        this.endDate = customEnd.value;
        this.loadReport();
      });
    }

    // 6. Retry Button
    const retryBtn = this._container.querySelector('#reports-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadReport());
    }

    // 7. Empty State Planner Button
    const emptyPlannerBtn = this._container.querySelector('#reports-empty-planner-btn');
    if (emptyPlannerBtn) {
      emptyPlannerBtn.addEventListener('click', () => {
        window.location.hash = '#/tasks';
      });
    }
  }
}

export const reportsController = new ReportsController();

export function renderReportsPage() {
  return `
    <div class="page-container" id="reports-page-root">
      ${reportsController.renderContent()}
    </div>
  `;
}

export function bindReportsEvents(mountElement) {
  reportsController.setContainer(mountElement);
  reportsController.bindEvents();

  if (!reportsController.report && !reportsController.isLoading) {
    reportsController.loadReport();
  }
}
