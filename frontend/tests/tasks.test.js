/**
 * Automated Test Suite for Tasks and Daily Planner Frontend (Phase 6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ValidationRules, validateForm } from '../src/components/form-validation.js';
import { taskColorManager, PASTEL_COLORS } from '../src/pages/tasks/task-colors.js';
import { renderTaskCard } from '../src/pages/tasks/task-card.js';
import { renderDailyPlanner } from '../src/pages/tasks/daily-planner.js';
import { renderTaskFormModal } from '../src/pages/tasks/task-form-modal.js';
import { renderTaskRescheduleModal } from '../src/pages/tasks/task-reschedule-modal.js';
import { tasksController } from '../src/pages/tasks.js';

// ==============================================================================
// 1. TASK FORM VALIDATION TESTS
// ==============================================================================

test('Task Form Validation: enforces required title and duration bounds', () => {
  const taskRules = {
    title: [ValidationRules.isRequired('Task Title'), ValidationRules.maxLength(200, 'Task Title')],
    duration: [ValidationRules.numberRange(1, 1440, 'Estimated Duration')],
  };

  // Missing title
  const invalidTitle = validateForm({ title: '', duration: 30 }, taskRules);
  assert.equal(invalidTitle.isValid, false);
  assert.equal(invalidTitle.errors.title, 'Task Title is required.');

  // Duration out of bounds
  const zeroDuration = validateForm({ title: 'Valid task', duration: 0 }, taskRules);
  assert.equal(zeroDuration.isValid, false);
  assert.ok(zeroDuration.errors.duration.includes('at least 1'));

  const excessiveDuration = validateForm({ title: 'Valid task', duration: 1500 }, taskRules);
  assert.equal(excessiveDuration.isValid, false);
  assert.ok(excessiveDuration.errors.duration.includes('cannot exceed 1440'));

  // Valid task
  const validTask = validateForm({ title: 'Draft proposal', duration: 45 }, taskRules);
  assert.equal(validTask.isValid, true);
  assert.deepEqual(validTask.errors, {});
});

// ==============================================================================
// 2. PASTEL COLOR PALETTE & COLOR MANAGER TESTS
// ==============================================================================

test('TaskColorManager: manages pastel sticky colors with deterministic priority fallback', () => {
  assert.equal(PASTEL_COLORS.length, 6);
  const colorIds = PASTEL_COLORS.map((c) => c.id);
  assert.ok(colorIds.includes('yellow'));
  assert.ok(colorIds.includes('rose'));
  assert.ok(colorIds.includes('mint'));
  assert.ok(colorIds.includes('sky'));
  assert.ok(colorIds.includes('lavender'));
  assert.ok(colorIds.includes('peach'));

  // Priority-based fallbacks
  assert.equal(taskColorManager.getTaskColor({ priority: 'urgent' }), 'rose');
  assert.equal(taskColorManager.getTaskColor({ priority: 'high' }), 'peach');
  assert.equal(taskColorManager.getTaskColor({ priority: 'low' }), 'mint');
  assert.equal(taskColorManager.getTaskColor({ priority: 'medium' }), 'yellow');

  // Explicit color override
  taskColorManager.setTaskColor('test-task-1', 'sky');
  assert.equal(taskColorManager.getTaskColor({ id: 'test-task-1', priority: 'urgent' }), 'sky');
});

// ==============================================================================
// 3. TASK CARD & STICKY NOTE RENDERING TESTS
// ==============================================================================

test('Task Card: renders digital sticky note with pastel styling and audit tags', () => {
  const mockTask = {
    id: 'task-101',
    title: 'Implement Authentication API',
    description: 'Verify token headers and claims',
    priority: 'high',
    status: 'pending',
    estimated_duration: 60,
    scheduled_date: '2026-10-28',
    original_due_date: '2026-10-26',
    due_time: '14:30',
    reschedule_history: [
      {
        previous_date: '2026-10-26',
        new_date: '2026-10-28',
        reason: 'Blocked on emulator setup',
        rescheduled_at: '2026-10-26T18:00:00Z',
      },
    ],
  };

  // 1. Board View (Sticky Note)
  const boardHtml = renderTaskCard({ task: mockTask, viewMode: 'board' });
  assert.ok(boardHtml.includes('sticky-note'));
  assert.ok(boardHtml.includes('Implement Authentication API'));
  assert.ok(boardHtml.includes('⏱ 1h')); // 60 mins formatted
  assert.ok(boardHtml.includes('🕒 14:30'));
  assert.ok(boardHtml.includes('High Priority'));
  assert.ok(boardHtml.includes('🔁 Orig:')); // Indicates carry-forward from original due date

  // 2. Compact List View
  const compactHtml = renderTaskCard({ task: mockTask, viewMode: 'compact' });
  assert.ok(compactHtml.includes('task-compact-row'));
  assert.ok(compactHtml.includes('Implement Authentication API'));
  assert.ok(compactHtml.includes('border-left: 6px solid'));
});

// ==============================================================================
// 4. DAILY PLANNER WORKLOAD METER & OVERLOAD WARNING TESTS
// ==============================================================================

test('Daily Planner: calculates workload capacity and displays overload warnings', () => {
  const mockTasks = [
    { id: 't1', title: 'Task A', priority: 'high', estimated_duration: 120, status: 'completed', is_completed: true },
    { id: 't2', title: 'Task B', priority: 'medium', estimated_duration: 90, status: 'pending' },
    { id: 't3', title: 'Task C', priority: 'urgent', estimated_duration: 90, status: 'pending' },
  ]; // Total planned: 300 mins. Completed: 120 mins.

  // Available focus: 240 mins (Capacity = 300 / 240 = 125% -> Overloaded!)
  const plannerHtml = renderDailyPlanner({
    selectedDate: '2026-10-27',
    tasks: mockTasks,
    availableMinutes: 240,
    viewMode: 'board',
    groupByPriority: true,
  });

  assert.ok(plannerHtml.includes('125% of capacity'));
  assert.ok(plannerHtml.includes('Estimated Day Workload'));
  assert.ok(plannerHtml.includes('Overload Warning:'));
  assert.ok(plannerHtml.includes('exceeds available time'));
  assert.ok(plannerHtml.includes('High & Urgent Priority'));
  assert.ok(plannerHtml.includes('Medium Priority'));

  // When under capacity (e.g. 400 mins available)
  const underCapacityHtml = renderDailyPlanner({
    selectedDate: '2026-10-27',
    tasks: mockTasks,
    availableMinutes: 400,
    viewMode: 'board',
    groupByPriority: true,
  });
  assert.ok(!underCapacityHtml.includes('Overload Warning:'));
  assert.ok(underCapacityHtml.includes('75% of capacity'));
});

// ==============================================================================
// 5. RESCHEDULE & INTEGRITY MODAL TESTS
// ==============================================================================

test('Task Reschedule Modal: safeguards historical audit integrity', () => {
  const mockTask = {
    id: 'task-carry-1',
    title: 'Finalize Deployment Pipeline',
    scheduled_date: '2026-10-27',
    original_due_date: '2026-10-25',
    reschedule_history: [{ previous_date: '2026-10-25', new_date: '2026-10-27' }],
  };

  const modalHtml = renderTaskRescheduleModal({ task: mockTask });
  assert.ok(modalHtml.includes('Reschedule Task'));
  assert.ok(modalHtml.includes('Finalize Deployment Pipeline'));
  assert.ok(modalHtml.includes('id="reschedule-input-date"'));
  assert.ok(modalHtml.includes('Historical Integrity'));
  assert.ok(modalHtml.includes('Previously submitted daily review snapshots are immutable'));
});

// ==============================================================================
// 6. TASKS CONTROLLER STATE & VIEW SWITCHING TESTS
// ==============================================================================

test('TasksController: manages view modes, date tabs, and available minutes', () => {
  // View mode toggle
  tasksController.setViewMode('compact');
  assert.equal(tasksController.viewMode, 'compact');
  tasksController.setViewMode('board');
  assert.equal(tasksController.viewMode, 'board');

  // Available minutes configuration
  tasksController.setAvailableMinutes(360);
  assert.equal(tasksController.availableMinutes, 360);

  // Tab switching
  tasksController.setTab('tomorrow');
  assert.equal(tasksController.viewTab, 'tomorrow');
  tasksController.setTab('today');
  assert.equal(tasksController.viewTab, 'today');
});
