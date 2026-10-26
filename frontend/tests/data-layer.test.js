/**
 * Automated Test Suite for Frontend Data Layer and API Integration (Phase 4)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Import UI Primitives
import {
  ValidationRules,
  validateForm,
  renderFieldError,
} from '../src/components/form-validation.js';
import {
  renderSkeletonBox,
  renderSkeletonText,
  renderSkeletonCardList,
  renderSkeletonMetricRow,
} from '../src/components/loading-skeleton.js';
import { renderConfirmDialog } from '../src/components/confirm-dialog.js';
import { renderPagination } from '../src/components/pagination.js';
import { toastManager, renderToastContainer } from '../src/components/toast.js';

// Import Data Layer Services
import { DataEvents, DATA_TOPICS } from '../src/services/data-events.js';
import { goalsService } from '../src/services/goals-service.js';
import { milestonesService } from '../src/services/milestones-service.js';
import { tasksService } from '../src/services/tasks-service.js';
import { dailyReviewsService } from '../src/services/daily-reviews-service.js';
import { progressService } from '../src/services/progress-service.js';
import { reportsService } from '../src/services/reports-service.js';
import { aiService } from '../src/services/ai-service.js';
import { settingsService, DEFAULT_USER_SETTINGS } from '../src/services/settings-service.js';
import { profileService } from '../src/services/profile-service.js';
import { api } from '../src/services/api-client.js';

// ==============================================================================
// 1. FORM VALIDATION & UI PRIMITIVES TESTS
// ==============================================================================

test('ValidationRules: validates required, email, length, numbers, and date order', () => {
  // Required
  assert.equal(ValidationRules.required('', 'Title'), 'Title is required.');
  assert.equal(ValidationRules.required('   ', 'Title'), 'Title is required.');
  assert.equal(ValidationRules.required('Valid Title', 'Title'), null);

  // Email
  assert.equal(ValidationRules.email('not-an-email'), 'Email address must be a valid email format (e.g. user@example.com).');
  assert.equal(ValidationRules.email('user@lifegoals.ai'), null);

  // Length
  const min6 = ValidationRules.minLength(6, 'Password');
  assert.equal(min6('12345'), 'Password must be at least 6 characters.');
  assert.equal(min6('123456'), null);

  // Number range
  const durationValidator = ValidationRules.numberRange(15, 480, 'Duration');
  assert.equal(durationValidator(10), 'Duration must be at least 15.');
  assert.equal(durationValidator(500), 'Duration cannot exceed 480.');
  assert.equal(durationValidator(60), null);

  // Date format & order
  const dateValidator = ValidationRules.dateFormat('Target date');
  assert.equal(dateValidator('2026/10/26'), 'Target date must be in YYYY-MM-DD format.');
  assert.equal(dateValidator('2026-10-26'), null);

  assert.equal(
    ValidationRules.dateOrder('2026-11-01', '2026-10-01', 'Start date', 'Target date'),
    'Start date cannot be later than Target date.'
  );
  assert.equal(
    ValidationRules.dateOrder('2026-10-01', '2026-11-01', 'Start date', 'Target date'),
    null
  );
});

test('validateForm: validates composite object schemas', () => {
  const schema = {
    title: [ValidationRules.required, ValidationRules.minLength(3, 'Title')],
    email: [ValidationRules.required, ValidationRules.email],
  };

  const invalidResult = validateForm({ title: 'Hi', email: 'invalid' }, schema);
  assert.equal(invalidResult.isValid, false);
  assert.ok(invalidResult.errors.title);
  assert.ok(invalidResult.errors.email);

  const validResult = validateForm(
    { title: 'Launch Product', email: 'alex@example.com' },
    schema
  );
  assert.equal(validResult.isValid, true);
  assert.deepEqual(validResult.errors, {});
});

test('UI Primitives: Skeletons, ConfirmDialog, and Pagination generate accessible markup', () => {
  // Skeleton
  const boxHtml = renderSkeletonBox({ width: '200px', height: '24px' });
  assert.ok(boxHtml.includes('class="skeleton "'));
  assert.ok(boxHtml.includes('width: 200px; height: 24px;'));

  const textHtml = renderSkeletonText(3);
  assert.ok(textHtml.includes('role="status"'));

  const cardsHtml = renderSkeletonCardList({ count: 2 });
  assert.ok(cardsHtml.includes('skeleton-card'));

  // Confirm Dialog
  const confirmHtml = renderConfirmDialog({
    title: 'Delete Goal',
    message: 'This will remove the goal and all milestones.',
    isDestructive: true,
  });
  assert.ok(confirmHtml.includes('Delete Goal'));
  assert.ok(confirmHtml.includes('btn-danger'));

  // Pagination
  const paginationHtml = renderPagination({
    page: 2,
    limit: 20,
    total: 100,
  });
  assert.ok(paginationHtml.includes('role="navigation"'));
  assert.ok(paginationHtml.includes('Showing <strong>21–40</strong> of <strong>100</strong>'));
  assert.ok(paginationHtml.includes('data-page="2"'));
});

test('ToastManager: manages notifications, dismissals, and container rendering', () => {
  toastManager.clear();
  const id1 = toastManager.show({ message: 'Goal saved!', type: 'success', duration: 0 });
  const id2 = toastManager.show({ message: 'Network warning', type: 'warning', duration: 0 });

  assert.equal(toastManager.toasts.length, 2);
  const containerHtml = renderToastContainer();
  assert.ok(containerHtml.includes('Goal saved!'));
  assert.ok(containerHtml.includes('toast-success'));
  assert.ok(containerHtml.includes('toast-warning'));

  toastManager.dismiss(id1);
  assert.equal(toastManager.toasts.length, 1);
  assert.equal(toastManager.toasts[0].id, id2);
  toastManager.clear();
});

// ==============================================================================
// 2. DATA EVENT BUS TESTS
// ==============================================================================

test('DataEvents: publishes and unsubscribes domain mutation topics', () => {
  let callCount = 0;
  let receivedPayload = null;

  const unsubscribe = DataEvents.on(DATA_TOPICS.TASKS_CHANGED, (payload) => {
    callCount++;
    receivedPayload = payload;
  });

  DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'created', taskId: 't-123' });
  assert.equal(callCount, 1);
  assert.equal(receivedPayload.action, 'created');
  assert.equal(receivedPayload.taskId, 't-123');

  unsubscribe();
  DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'deleted' });
  assert.equal(callCount, 1); // should not increment after unsubscribe
});

// ==============================================================================
// 3. SETTINGS SERVICE & ADAPTER TESTS
// ==============================================================================

test('SettingsService: adheres to contract and explicitly marks dev adapter fixtures', async () => {
  const settings = await settingsService.getSettings();
  assert.ok(settings.timezone);
  assert.equal(settings.is_dev_fixture, true);
  assert.ok(settings.dev_adapter_notice.includes('DEV_FIXTURE_ADAPTER'));

  const updated = await settingsService.updateSettings({
    daily_focus_minutes: 360,
    theme: 'dark',
  });
  assert.equal(updated.daily_focus_minutes, 360);
  assert.equal(updated.theme, 'dark');
  assert.equal(updated.is_dev_fixture, true);

  await settingsService.resetSettings();
  const reset = await settingsService.getSettings();
  assert.equal(reset.daily_focus_minutes, 240);
});

// ==============================================================================
// 4. GOALS SERVICE TESTS
// ==============================================================================

test('GoalsService: validates create inputs and prevents concurrent duplicate submissions', async () => {
  // Required title
  await assert.rejects(
    async () => goalsService.createGoal({ title: '' }),
    /Goal title is required/
  );

  // Simulate in-flight duplicate guard
  goalsService._inFlightMutations.add('create:learn spanish');
  await assert.rejects(
    async () => goalsService.createGoal({ title: 'Learn Spanish' }),
    /Goal creation is already in progress/
  );
  goalsService._inFlightMutations.delete('create:learn spanish');
});

// ==============================================================================
// 5. MILESTONES SERVICE TESTS
// ==============================================================================

test('MilestonesService: requires parent goalId and prevents duplicate creation', async () => {
  await assert.rejects(
    async () => milestonesService.createMilestone('', { title: 'Chapter 1' }),
    /goalId is required/
  );

  await assert.rejects(
    async () => milestonesService.createMilestone('goal-1', { title: '' }),
    /Milestone title is required/
  );

  milestonesService._inFlightMutations.add('create:goal-1:chapter 1');
  await assert.rejects(
    async () => milestonesService.createMilestone('goal-1', { title: 'Chapter 1' }),
    /Milestone creation is already in progress/
  );
  milestonesService._inFlightMutations.delete('create:goal-1:chapter 1');
});

// ==============================================================================
// 6. TASKS SERVICE TESTS
// ==============================================================================

test('TasksService: enforces task validation, duplicate prevention, and mutation keys', async () => {
  await assert.rejects(
    async () => tasksService.createTask({ title: '' }),
    /Task title is required/
  );

  tasksService._inFlightMutations.add('create:study algorithms:2026-10-27');
  await assert.rejects(
    async () => tasksService.createTask({ title: 'Study Algorithms', scheduled_date: '2026-10-27' }),
    /Task creation is already in progress/
  );
  tasksService._inFlightMutations.delete('create:study algorithms:2026-10-27');

  await assert.rejects(
    async () => tasksService.toggleTask(''),
    /taskId is required/
  );

  await assert.rejects(
    async () => tasksService.createDailyPlan({ date: '', available_minutes: 120 }),
    /date is required/
  );
});

// ==============================================================================
// 7. DAILY REVIEWS & PROGRESS SERVICE TESTS
// ==============================================================================

test('DailyReviewsService & ProgressService: guard in-flight submissions and validate dates', async () => {
  await assert.rejects(
    async () => dailyReviewsService.submitReview({ date: '' }),
    /Review date is required/
  );

  dailyReviewsService._inFlightMutations.add('submit:2026-10-26');
  await assert.rejects(
    async () => dailyReviewsService.submitReview({ date: '2026-10-26' }),
    /Review submission for this date is already processing/
  );
  dailyReviewsService._inFlightMutations.delete('submit:2026-10-26');

  // Progress Snapshot in-flight guard
  progressService._inFlightSnapshot = true;
  await assert.rejects(
    async () => progressService.computeSnapshot(),
    /Snapshot computation is already in progress/
  );
  progressService._inFlightSnapshot = false;
});

// ==============================================================================
// 8. AI SERVICE TESTS
// ==============================================================================

test('AIService: restricts concurrent AI operations and validates payload', async () => {
  await assert.rejects(
    async () => aiService.suggestTaskBreakdown({ task_title: '' }),
    /task_title is required for task breakdown/
  );

  // When an AI operation is already in-flight, subsequent requests should reject immediately
  aiService._inFlightAiOperation = 'suggestions';
  await assert.rejects(
    async () => aiService.generateDailySuggestions({}),
    /An AI operation is already running/
  );
  await assert.rejects(
    async () => aiService.createRecoveryPlan({}),
    /An AI operation is already running/
  );
  aiService._inFlightAiOperation = null;
});
