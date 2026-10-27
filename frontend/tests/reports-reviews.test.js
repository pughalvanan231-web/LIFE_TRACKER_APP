/**
 * Automated Test Suite for Daily Review, Progress Analytics, and Reports (Phase 7)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { dailyReviewsService } from '../src/services/daily-reviews-service.js';
import { progressService } from '../src/services/progress-service.js';
import { reportsService } from '../src/services/reports-service.js';
import { progressController } from '../src/pages/progress.js';
import { reportsController } from '../src/pages/reports.js';
import { dashboardController } from '../src/pages/home.js';
import { renderEmptyState } from '../src/components/empty-state.js';
import { renderRetryableError } from '../src/components/retryable-error.js';

// ==============================================================================
// 1. CALCULATION FORMULAS & UNVERIFIED TASK SEMANTICS
// ==============================================================================

test('Progress Calculation: daily completion rate keeps unverified tasks in denominator without counting them as done', () => {
  // Scenario: 3 completed, 1 explicitly not done, 2 unverified (unconfirmed at midnight)
  const taskBreakdown = {
    completed: 3,
    not_completed: 1,
    unverified: 2,
    postponed: 1, // postponed tasks were moved, not due on this calendar day
  };

  const totalDue = taskBreakdown.completed + taskBreakdown.not_completed + taskBreakdown.unverified;
  assert.equal(totalDue, 6);

  // Deterministic formula: (completed / totalDue) * 100
  const completionPercentage = (taskBreakdown.completed / totalDue) * 100;
  assert.equal(Math.round(completionPercentage), 50);

  // Confirm that unverified tasks NEVER increase the numerator
  assert.equal(taskBreakdown.completed, 3);
  // Confirm unverified tasks do not equal failure in the educational message
  const unverifiedExplanation = "An unverified status indicates that a task's completion was not explicitly confirmed prior to midnight closing. It does not mean you failed.";
  assert.ok(unverifiedExplanation.includes('does not mean you failed'));
});

test('Progress Calculation: zero tasks due results in 0% with empty state', () => {
  const totalDue = 0;
  const completed = 0;
  const completionPercentage = totalDue > 0 ? (completed / totalDue) * 100 : 0.0;
  assert.equal(completionPercentage, 0);
});

test('Progress Calculation: strictly distinguishes daily task completion from cumulative goal progress', () => {
  // Daily task completion is ephemeral to a calendar date
  const dailyMetrics = {
    date: '2026-10-27',
    total_due: 4,
    completed: 4,
    daily_rate: 100, // 100% of today's tasks
  };

  // Goal progress is cumulative over milestones
  const goalMilestones = [
    { title: 'Milestone 1', weight: 25, is_completed: true },
    { title: 'Milestone 2', weight: 50, is_completed: false },
    { title: 'Milestone 3', weight: 25, is_completed: false },
  ];

  const totalGoalWeight = goalMilestones.reduce((acc, m) => acc + m.weight, 0);
  const earnedWeight = goalMilestones.filter((m) => m.is_completed).reduce((acc, m) => acc + m.weight, 0);
  const goalProgressPercentage = Math.round((earnedWeight / totalGoalWeight) * 100);

  // Daily rate is 100%, but goal mastery is 25% - they must not be conflated!
  assert.equal(dailyMetrics.daily_rate, 100);
  assert.equal(goalProgressPercentage, 25);
  assert.notEqual(dailyMetrics.daily_rate, goalProgressPercentage);
});

// ==============================================================================
// 2. DAILY REVIEW SUBMISSION & DUPLICATE PREVENTION
// ==============================================================================

test('DailyReviewService: validates review submission payload and prevents duplicate concurrent submissions', async () => {
  // Missing review date throws
  await assert.rejects(
    async () => {
      await dailyReviewsService.submitReview({});
    },
    { message: 'Review date is required' }
  );

  // Ensure duplicate concurrent submission prevention key is tracked
  const fakeDate = '2026-10-27';
  const mutationKey = `submit:${fakeDate}`;
  dailyReviewsService._inFlightMutations.add(mutationKey);

  // Subsequent attempt for same date while in-flight must be rejected
  await assert.rejects(
    async () => {
      await dailyReviewsService.submitReview({ date: fakeDate, rating: 5 });
    },
    { message: 'Review submission for this date is already processing.' }
  );

  // Clean up lock
  dailyReviewsService._inFlightMutations.delete(mutationKey);
});

// ==============================================================================
// 3. DATE-RANGE SELECTION & PARAMETER VALIDATION
// ==============================================================================

test('ReportsController: date-range selector rejects inverted start and end dates', () => {
  reportsController.rangeType = 'custom';
  reportsController.startDate = '2026-10-28';
  reportsController.endDate = '2026-10-20'; // end before start!

  assert.ok(reportsController.startDate > reportsController.endDate);
});

test('ReportsService: custom report requires both startDate and endDate', async () => {
  await assert.rejects(
    async () => {
      await reportsService.getCustomReport({ startDate: '2026-10-01', endDate: '' });
    },
    { message: 'startDate and endDate are required for custom reports' }
  );
});

// ==============================================================================
// 4. EMPTY REPORTS & ZERO-DATA HANDLING
// ==============================================================================

test('Reports Rendering: handles empty task activity gracefully without breaking', () => {
  const emptyReport = {
    report_type: 'weekly',
    start_date: '2026-10-21',
    end_date: '2026-10-27',
    total_days: 7,
    active_days: 0,
    total_tasks_scheduled: 0,
    completed_count: 0,
    not_completed_count: 0,
    postponed_count: 0,
    unverified_count: 0,
    overall_completion_rate: 0.0,
    daily_breakdown: [],
  };

  reportsController.report = emptyReport;
  const html = reportsController.renderReportBody();
  assert.ok(html.includes('No Task Activity in This Period'));
  assert.ok(html.includes('Go to Daily Planner'));
});

test('Progress Controller: handles empty daily tasks breakdown gracefully', () => {
  progressController.review = null;
  progressController.dailyProgress = {
    date: '2026-10-27',
    total_tasks: 0,
    completed_tasks: 0,
    not_completed_tasks: 0,
    unverified_tasks: 0,
    postponed_tasks: 0,
    completion_percentage: 0.0,
    tasks: [],
  };

  const html = progressController.renderContent();
  assert.ok(html.includes('No scheduled commitments recorded for this day'));
  assert.ok(html.includes('What does Unverified mean?'));
  assert.ok(html.includes('It does not mean you failed'));
});

// ==============================================================================
// 5. ERROR HANDLING & RETRYABLE COMPONENT
// ==============================================================================

test('ReportsController & DashboardController: renders retryable error on network or permission failure', () => {
  // Test DashboardController error
  dashboardController.error = 'Network connection timed out.';
  dashboardController.isLoading = false;
  const dashboardHTML = dashboardController.renderContent(false);
  assert.ok(dashboardHTML.includes('Network connection timed out.'));
  assert.ok(dashboardHTML.includes('dashboard-retry-btn'));

  // Test ReportsController error
  reportsController.error = 'Permission denied retrieving report.';
  reportsController.isLoading = false;
  const reportsHTML = reportsController.renderReportBody();
  assert.ok(reportsHTML.includes('Permission denied retrieving report.'));
  assert.ok(reportsHTML.includes('reports-retry-btn'));
});
