/**
 * Automated Test Suite for Goals and Milestones Frontend (Phase 5)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ValidationRules, validateForm } from '../src/components/form-validation.js';
import { renderGoalsList } from '../src/pages/goals/goals-list.js';
import { renderGoalDetails } from '../src/pages/goals/goal-details.js';
import { renderGoalFormModal } from '../src/pages/goals/goal-form-modal.js';
import { renderMilestoneFormModal } from '../src/pages/goals/milestone-form-modal.js';
import { goalsController } from '../src/pages/goals.js';

// ==============================================================================
// 1. GOAL FORM VALIDATION TESTS
// ==============================================================================

test('Goal Form Validation: validates required title, length, and chronological dates', () => {
  const goalRules = {
    title: [ValidationRules.isRequired('Goal Title'), ValidationRules.maxLength(200, 'Goal Title')],
  };

  // Missing title
  const invalidTitle = validateForm({ title: '' }, goalRules);
  assert.equal(invalidTitle.isValid, false);
  assert.equal(invalidTitle.errors.title, 'Goal Title is required.');

  // Valid title
  const validTitle = validateForm({ title: 'Run a marathon' }, goalRules);
  assert.equal(validTitle.isValid, true);

  // Chronological Date Ordering
  const invalidDates = ValidationRules.dateOrder(
    '2026-12-01',
    '2026-06-01',
    'Start date',
    'Target deadline'
  );
  assert.equal(invalidDates, 'Start date cannot be later than Target deadline.');

  const validDates = ValidationRules.dateOrder(
    '2026-01-01',
    '2026-12-31',
    'Start date',
    'Target deadline'
  );
  assert.equal(validDates, null);
});

// ==============================================================================
// 2. MILESTONE VALIDATION & WEIGHT TESTS
// ==============================================================================

test('Milestone Validation: enforces title, non-negative order, and valid weight range', () => {
  const milestoneRules = {
    title: [ValidationRules.required, ValidationRules.maxLength(200, 'Milestone Title')],
    weight: [ValidationRules.numberRange(0.1, 100, 'Relative Weight')],
    order: [ValidationRules.numberRange(0, 9999, 'Sequence Order')],
  };

  // Missing title
  const noTitle = validateForm({ title: '', weight: 1.0, order: 1 }, milestoneRules);
  assert.equal(noTitle.isValid, false);

  // Invalid weight <= 0 or > 100
  const invalidWeight = validateForm({ title: 'Read book', weight: 0.05, order: 1 }, milestoneRules);
  assert.equal(invalidWeight.isValid, false);
  assert.ok(invalidWeight.errors.weight.includes('at least 0.1'));

  // Valid milestone
  const validMilestone = validateForm({ title: 'Read 5 chapters', weight: 2.0, order: 2 }, milestoneRules);
  assert.equal(validMilestone.isValid, true);
});

// ==============================================================================
// 3. GOAL DETAILS & TIMELINE RENDERING
// ==============================================================================

test('Goal Details: explains progress through milestones and renders timeline & audit log', () => {
  const mockGoal = {
    id: 'goal-arch-101',
    title: 'Cloud Architect Certification',
    description: 'Complete all professional domain reviews and exam labs',
    category: 'career',
    timeframe: 'short_term',
    priority: 'high',
    status: 'active',
    progress_percentage: 67,
    start_date: '2026-09-01',
    target_date: '2026-12-15',
    target_value: 10,
    current_value: 6,
    unit: 'labs',
    date_history: [
      {
        previous_target_date: '2026-11-30',
        new_target_date: '2026-12-15',
        reason: 'Added extra practice exam simulations',
        changed_at: '2026-10-15T10:00:00Z',
      },
    ],
  };

  const mockMilestones = [
    {
      id: 'm-1',
      title: 'Pass Fundamentals Quiz',
      order: 1,
      weight: 1.0,
      is_completed: true,
      target_date: '2026-09-20',
    },
    {
      id: 'm-2',
      title: 'Complete 6 Hands-on Labs',
      order: 2,
      weight: 2.0,
      is_completed: true,
      target_date: '2026-10-25',
    },
    {
      id: 'm-3',
      title: 'Pass Full Simulation Exam',
      order: 3,
      weight: 2.0,
      is_completed: false,
      target_date: '2026-12-10',
    },
  ];

  const html = renderGoalDetails({
    goal: mockGoal,
    milestones: mockMilestones,
    isLoadingMilestones: false,
  });

  // Verify authoritative progress and milestone explanation
  assert.ok(html.includes('Cloud Architect Certification'));
  assert.ok(html.includes('67%'));
  assert.ok(html.includes('2 of 3')); // 2 completed milestones out of 3
  assert.ok(html.includes('weighted milestone contribution'));

  // Verify milestone list cards
  assert.ok(html.includes('Pass Fundamentals Quiz'));
  assert.ok(html.includes('Complete 6 Hands-on Labs'));
  assert.ok(html.includes('Pass Full Simulation Exam'));

  // Verify timeline & date change audit trail
  assert.ok(html.includes('Goal Timeline'));
  assert.ok(html.includes('Deadline Change History'));
  assert.ok(html.includes('Added extra practice exam simulations'));
  assert.ok(html.includes('2026-11-30'));
  assert.ok(html.includes('2026-12-15'));
});

// ==============================================================================
// 4. GOALS LIST & EMPTY STATES
// ==============================================================================

test('Goals List: renders loading skeleton, empty state, and populated card grid', () => {
  // Loading skeleton
  const loadingHtml = renderGoalsList({ isLoading: true, goals: [] });
  assert.ok(loadingHtml.includes('skeleton-card'));

  // Populated list
  const populatedHtml = renderGoalsList({
    goals: [
      {
        id: 'g-1',
        title: 'Run 10K',
        category: 'health',
        timeframe: 'short_term',
        priority: 'high',
        status: 'active',
        target_date: '2026-11-30',
        progress_percentage: 45,
      },
    ],
    isLoading: false,
  });
  assert.ok(populatedHtml.includes('Run 10K'));
  assert.ok(populatedHtml.includes('badge-danger')); // high priority

  // Empty state when search matches nothing
  const noMatchHtml = renderGoalsList({
    goals: [{ id: 'g-1', title: 'Run 10K', category: 'health' }],
    filters: { search: 'nonexistent-query-xyz' },
  });
  assert.ok(noMatchHtml.includes('No matching goals found'));
  assert.ok(noMatchHtml.includes('Reset Filters'));
});

// ==============================================================================
// 5. GOALS CONTROLLER VIEW SWITCHING & STATE
// ==============================================================================

test('GoalsController: manages view state and filters', () => {
  // Initial list view
  goalsController.setView('list');
  assert.equal(goalsController.view, 'list');
  assert.equal(goalsController.selectedGoalId, null);

  // Switch to details
  goalsController.setView('details', 'goal-test-999');
  assert.equal(goalsController.view, 'details');
  assert.equal(goalsController.selectedGoalId, 'goal-test-999');

  // Return to list view
  goalsController.setView('list');
  assert.equal(goalsController.view, 'list');
  assert.equal(goalsController.selectedGoalId, null);
});

test('Goal and Milestone Modals: render required accessibility and input elements', () => {
  const goalModalHtml = renderGoalFormModal({ goal: null });
  assert.ok(goalModalHtml.includes('Define New Life Goal'));
  assert.ok(goalModalHtml.includes('id="goal-input-title"'));
  assert.ok(goalModalHtml.includes('id="goal-input-category"'));
  assert.ok(goalModalHtml.includes('id="goal-input-timeframe"'));
  assert.ok(goalModalHtml.includes('id="goal-input-target-date"'));
  assert.ok(goalModalHtml.includes('id="goal-input-target-value"'));

  const milestoneModalHtml = renderMilestoneFormModal({ goalId: 'goal-123', milestone: null });
  assert.ok(milestoneModalHtml.includes('Add Checkpoint Milestone'));
  assert.ok(milestoneModalHtml.includes('id="milestone-input-title"'));
  assert.ok(milestoneModalHtml.includes('id="milestone-input-weight"'));
  assert.ok(milestoneModalHtml.includes('id="milestone-input-order"'));
});
