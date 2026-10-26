/**
 * Basic Frontend Smoke Tests (Node standard test runner)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { VALID_ROUTES } from '../src/services/router.js';
import { DEMO_GOALS, DEMO_TASKS, DEMO_STATS } from '../src/services/fixtures.js';
import { formatDate, formatPercent, formatDuration } from '../src/utils/formatters.js';

test('Router valid routes include all required application sections and auth routes', () => {
  const expectedWorkspace = ['home', 'goals', 'tasks', 'progress', 'reports', 'settings', 'profile'];
  const expectedAuth = ['sign-in', 'sign-up', 'reset-password'];

  for (const route of [...expectedWorkspace, ...expectedAuth]) {
    assert.ok(VALID_ROUTES.includes(route), `Route ${route} should be in VALID_ROUTES`);
  }
});

test('Formatters correctly calculate and format numbers, dates, and durations', () => {
  assert.equal(formatPercent(78.54, 1), '78.5%');
  assert.equal(formatDuration(90), '1h 30m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDate('2026-10-26'), 'Oct 26, 2026');
});

test('Development demo fixtures have required fields and non-empty records', () => {
  assert.ok(DEMO_GOALS.length > 0);
  assert.ok(DEMO_TASKS.length > 0);
  assert.equal(typeof DEMO_STATS.activeGoals, 'number');
  assert.equal(typeof DEMO_STATS.dailyCompletionRate, 'number');
});
