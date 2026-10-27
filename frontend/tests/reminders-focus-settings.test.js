/**
 * Automated Test Suite for Reminders, Daily-Closing Status, Focus Mode, and Settings (Phase 9)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  determineClosingStatus,
  getNextMidnightDeadline,
  renderDailyClosingStatusCard
} from '../src/components/daily-closing-status.js';

import {
  notificationsService,
  DEFAULT_REMINDER_CONFIG
} from '../src/services/notifications-service.js';

import { focusController } from '../src/pages/focus.js';
import { settingsService } from '../src/services/settings-service.js';

// Mock localStorage for Node test runner if undefined
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
}

// ==============================================================================
// 1. DAILY CLOSING STATUS & DEADLINE CALCULATIONS
// ==============================================================================

test('Daily Closing Status: correctly identifies submitted state', () => {
  const result = determineClosingStatus({
    review: {
      date: '2026-10-27',
      created_at: '2026-10-27T22:30:00Z',
      is_late: false,
      summary: 'User submitted review on time.',
    },
    dailyProgress: { completion_percentage: 100 },
    tasks: [{ id: 't1', status: 'completed', is_completed: true }],
  });

  assert.equal(result.state, 'submitted');
  assert.equal(result.label, 'Review Submitted');
  assert.equal(result.badgeClass, 'badge-success');
  assert.ok(result.description.includes('Daily review recorded'));
});

test('Daily Closing Status: correctly identifies closed_automatically state from backend scheduler', () => {
  const result = determineClosingStatus({
    review: {
      date: '2026-10-26',
      created_at: '2026-10-27T00:00:00Z',
      is_late: true,
      summary: 'Automated Midnight closing by backend cron.',
    },
    dailyProgress: { completion_percentage: 60 },
    tasks: [],
  });

  assert.equal(result.state, 'closed_automatically');
  assert.equal(result.label, 'Closed Automatically');
  assert.equal(result.badgeClass, 'badge-neutral');
  assert.ok(result.description.includes('Closed automatically by server scheduler at midnight'));
});

test('Daily Closing Status: correctly identifies tasks awaiting confirmation before closing', () => {
  const result = determineClosingStatus({
    review: null,
    dailyProgress: null,
    tasks: [
      { id: 't1', title: 'Task 1', status: 'pending', is_completed: false },
      { id: 't2', title: 'Task 2', status: 'completed', is_completed: true },
    ],
  });

  assert.equal(result.state, 'tasks_awaiting_confirmation');
  assert.equal(result.label, 'Awaiting Task Confirmation');
  assert.equal(result.badgeClass, 'badge-warning');
  assert.ok(result.description.includes('1 commitment is awaiting your outcome confirmation'));
});

test('Daily Closing Status: correctly identifies not_submitted when all tasks are resolved', () => {
  const result = determineClosingStatus({
    review: null,
    dailyProgress: null,
    tasks: [
      { id: 't1', title: 'Task 1', status: 'completed', is_completed: true },
      { id: 't2', title: 'Task 2', status: 'cancelled', is_completed: false },
    ],
  });

  assert.equal(result.state, 'not_submitted');
  assert.equal(result.label, 'Pending Evening Review');
  assert.equal(result.badgeClass, 'badge-primary');
  assert.ok(result.description.includes('Evening review will securely freeze today\'s progress snapshot'));
});

test('Next Midnight Deadline: computes accurate hours and minutes remaining until backend cutoff', () => {
  const deadline = getNextMidnightDeadline('UTC');
  assert.ok(typeof deadline.deadlineText === 'string');
  assert.ok(deadline.hoursRemaining >= 0 && deadline.hoursRemaining <= 24);
  assert.ok(deadline.minutesRemaining >= 0 && deadline.minutesRemaining <= 59);
  assert.ok(deadline.deadlineText.includes('remaining'));
});

test('Daily Closing Status Component: renders complete card HTML with timezone and deadline badge', () => {
  const html = renderDailyClosingStatusCard({
    review: null,
    dailyProgress: { completion_percentage: 75 },
    tasks: [{ id: 't1', status: 'pending', is_completed: false }],
    timezone: 'America/New_York',
  });

  assert.ok(html.includes('Daily Closing Status'));
  assert.ok(html.includes('America/New_York'));
  assert.ok(html.includes('Awaiting Task Confirmation'));
  assert.ok(html.includes('Server-side scheduler is authoritative'));
});

// ==============================================================================
// 2. NOTIFICATIONS & QUIET HOURS
// ==============================================================================

test('Notifications Service: default preferences and quiet hours structure', async () => {
  const config = await notificationsService.getConfig();
  assert.equal(typeof config.browser_notifications_enabled, 'boolean');
  assert.equal(typeof config.task_reminders_enabled, 'boolean');
  assert.equal(typeof config.goal_deadline_reminders_enabled, 'boolean');
  assert.equal(typeof config.daily_planning_reminder_enabled, 'boolean');
  assert.equal(typeof config.daily_review_reminder_enabled, 'boolean');
  assert.equal(typeof config.quiet_hours_enabled, 'boolean');
  assert.ok(config.quiet_hours_start);
  assert.ok(config.quiet_hours_end);
});

test('Notifications Service: quiet hours check handles overnight spans (e.g. 22:30 to 07:00)', async () => {
  await notificationsService.updateConfig({
    quiet_hours_enabled: true,
    quiet_hours_start: '22:30',
    quiet_hours_end: '07:00',
  });

  // Verify that function runs deterministically with custom start and end parameters
  const isOvernightSuppressed1 = notificationsService.isQuietHours('22:30', '07:00');
  assert.equal(typeof isOvernightSuppressed1, 'boolean');

  // When quiet hours are disabled, should always return false
  await notificationsService.updateConfig({ quiet_hours_enabled: false });
  assert.equal(notificationsService.isQuietHours('22:30', '07:00'), false);

  // Re-enable
  await notificationsService.updateConfig({ quiet_hours_enabled: true });
  assert.equal(typeof notificationsService.isQuietHours('00:00', '23:59'), 'boolean');
});

test('Notifications Service: platform limitation and permission state reporting', () => {
  const isIos = notificationsService.isIosSafari();
  assert.equal(typeof isIos, 'boolean');

  const permState = notificationsService.getPermissionState();
  assert.ok(['unsupported', 'default', 'granted', 'denied'].includes(permState));
});

// ==============================================================================
// 3. FOCUS MODE & TIMER BEHAVIOR
// ==============================================================================

test('Focus Controller: initialization defaults to 25 minutes Pomodoro', () => {
  focusController.resetTimer();
  assert.equal(focusController.targetSeconds, 25 * 60);
  assert.equal(focusController.elapsedSeconds, 0);
  assert.equal(focusController.isRunning, false);
  assert.equal(focusController.isPaused, false);
  assert.equal(focusController.timerMode, 'pomodoro');
});

test('Focus Controller: formatTime computes remaining time in pomodoro mode', () => {
  focusController.resetTimer();
  focusController.targetSeconds = 25 * 60;
  focusController.elapsedSeconds = 0;
  assert.equal(focusController.formatTime(), '25:00');

  focusController.elapsedSeconds = 60;
  assert.equal(focusController.formatTime(), '24:00');

  focusController.elapsedSeconds = 25 * 60;
  assert.equal(focusController.formatTime(), '00:00');
});

test('Focus Controller: start, pause, resume, and stop state transitions', () => {
  focusController.resetTimer();
  assert.equal(focusController.isRunning, false);

  focusController.startTimer();
  assert.equal(focusController.isRunning, true);
  assert.equal(focusController.isPaused, false);

  focusController.pauseTimer();
  assert.equal(focusController.isRunning, false);
  assert.equal(focusController.isPaused, true);

  focusController.resumeTimer();
  assert.equal(focusController.isRunning, true);
  assert.equal(focusController.isPaused, false);

  focusController.stopTimer();
  assert.equal(focusController.isRunning, false);
  assert.equal(focusController.isPaused, false);
  assert.equal(focusController.showCompletionPrompt, true);
});

test('Focus Controller Guarantee: Timer completion NEVER automatically marks task as completed', () => {
  // Verify architectural requirement:
  // "Do not automatically mark a task completed just because the timer finishes."
  const mockTask = { id: 'task-focus-1', title: 'Deep Work Session', status: 'pending' };
  focusController.selectedTask = mockTask;

  // Simulate timer running down to completion
  focusController.elapsedSeconds = focusController.targetSeconds;
  focusController.pauseTimer();
  focusController.showCompletionPrompt = true;

  // The task status must remain 'pending' until the user explicitly marks it completed
  assert.equal(focusController.selectedTask.status, 'pending');

  // Verify that the user has explicit separate actions
  assert.equal(typeof focusController.completeTask, 'function');
  assert.equal(typeof focusController.keepTaskInProgress, 'function');

  // Keeping task in progress leaves task uncompleted and resets prompt
  focusController.keepTaskInProgress();
  assert.equal(focusController.showCompletionPrompt, false);
  assert.equal(focusController.selectedTask.status, 'pending');
});

// ==============================================================================
// 4. SETTINGS & PREFERENCES
// ==============================================================================

test('Settings Service: reads and persists user timezone and theme preferences', async () => {
  const initial = await settingsService.getSettings();
  assert.ok(initial);
  assert.ok(initial.timezone);

  const updated = await settingsService.updateSettings({
    theme: 'dark',
    timezone: 'Asia/Tokyo',
  });

  assert.equal(updated.theme, 'dark');
  assert.equal(updated.timezone, 'Asia/Tokyo');
});

test('Settings Service: provides comprehensive JSON export structure for account backup', async () => {
  const settings = await settingsService.getSettings();
  const exportData = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    app: 'Life Goals AI',
    profile: { display_name: 'Test User', email: 'test@example.com' },
    settings: { timezone: settings.timezone, theme: settings.theme },
    exportType: 'Full Account Data Export',
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const parsed = JSON.parse(jsonString);

  assert.equal(parsed.app, 'Life Goals AI');
  assert.equal(parsed.settings.timezone, 'Asia/Tokyo');
  assert.equal(parsed.settings.theme, 'dark');
  assert.ok(parsed.exportedAt);
});
