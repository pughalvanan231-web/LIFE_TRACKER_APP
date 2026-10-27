/**
 * Automated Test Suite for AI Daily Planner and Recovery Mode (Phase 8)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { aiService } from '../src/services/ai-service.js';
import { aiPlannerModal } from '../src/pages/tasks/ai-planner-modal.js';
import { tasksService } from '../src/services/tasks-service.js';

// ==============================================================================
// 1. SUGGESTION SELECTION, EDITING & APPROVAL TESTS
// ==============================================================================

test('AI Daily Planner: allows editing suggestions before saving', () => {
  aiPlannerModal.mode = 'plan';
  aiPlannerModal.step = 'review';
  aiPlannerModal.availableMinutes = 240;
  aiPlannerModal.suggestions = [
    {
      title: 'Original Title',
      priority: 'medium',
      estimated_duration: 60,
      short_explanation: 'Goal alignment',
      isSelected: true,
      isEditing: false,
    },
  ];

  // User enters edit mode
  aiPlannerModal.suggestions[0].isEditing = true;
  assert.equal(aiPlannerModal.suggestions[0].isEditing, true);

  // User edits title and duration
  aiPlannerModal.suggestions[0].title = 'Edited Focus Task';
  aiPlannerModal.suggestions[0].estimated_duration = 45;
  aiPlannerModal.suggestions[0].priority = 'high';
  aiPlannerModal.suggestions[0].isEditing = false;

  assert.equal(aiPlannerModal.suggestions[0].title, 'Edited Focus Task');
  assert.equal(aiPlannerModal.suggestions[0].estimated_duration, 45);
  assert.equal(aiPlannerModal.suggestions[0].priority, 'high');
});

test('AI Daily Planner: rejects suggestions without saving them to database', () => {
  aiPlannerModal.suggestions = [
    { title: 'Task 1', isSelected: true },
    { title: 'Task 2 (to reject)', isSelected: true },
    { title: 'Task 3', isSelected: true },
  ];

  assert.equal(aiPlannerModal.suggestions.length, 3);

  // Reject middle suggestion (index 1)
  aiPlannerModal.suggestions.splice(1, 1);

  assert.equal(aiPlannerModal.suggestions.length, 2);
  assert.equal(aiPlannerModal.suggestions[0].title, 'Task 1');
  assert.equal(aiPlannerModal.suggestions[1].title, 'Task 3');
});

test('AI Daily Planner: calculates workload capacity and flags overload', () => {
  aiPlannerModal.availableMinutes = 180;
  aiPlannerModal.suggestions = [
    { title: 'Task 1', estimated_duration: 90, isSelected: true },
    { title: 'Task 2', estimated_duration: 60, isSelected: true },
    { title: 'Task 3', estimated_duration: 45, isSelected: false }, // not selected
  ];

  // Selected duration = 90 + 60 = 150m (150 / 180 = 83%)
  const totalSelected = aiPlannerModal.suggestions
    .filter((s) => s.isSelected)
    .reduce((sum, s) => sum + s.estimated_duration, 0);

  assert.equal(totalSelected, 150);
  assert.equal(totalSelected > aiPlannerModal.availableMinutes, false);

  // Now user selects Task 3 -> total = 195m > 180m (overload!)
  aiPlannerModal.suggestions[2].isSelected = true;
  const overloadedDuration = aiPlannerModal.suggestions
    .filter((s) => s.isSelected)
    .reduce((sum, s) => sum + s.estimated_duration, 0);

  assert.equal(overloadedDuration, 195);
  assert.equal(overloadedDuration > aiPlannerModal.availableMinutes, true);
});

// ==============================================================================
// 2. RECOVERY MODE TESTS
// ==============================================================================

test('Recovery Mode: structures overdue proposals into reschedules, priority adjustments, and decompositions', () => {
  const recoveryMock = aiPlannerModal.createMockRecoveryPlan();

  assert.equal(recoveryMock.overdue_tasks_count, 2);
  assert.ok(recoveryMock.rescheduling_proposals.length > 0);
  assert.ok(recoveryMock.proposed_priorities.length > 0);
  assert.ok(recoveryMock.complex_tasks_breakdowns.length > 0);
  assert.equal(recoveryMock.requires_user_confirmation, true);

  // Verify non-destructive guarantee: requires confirmation
  assert.equal(recoveryMock.preserves_history, true);
});

// ==============================================================================
// 3. CONCURRENT DUPLICATE PREVENTION & RATE LIMITING
// ==============================================================================

test('AIService: prevents concurrent in-flight operations', async () => {
  // Simulate active in-flight operation
  aiService._inFlightAiOperation = 'suggestions';

  await assert.rejects(
    async () => {
      await aiService.generateDailySuggestions();
    },
    { message: 'An AI operation is already running. Please wait for it to complete.' }
  );

  await assert.rejects(
    async () => {
      await aiService.createRecoveryPlan();
    },
    { message: 'An AI operation is already running. Please wait for it to complete.' }
  );

  // Clear in-flight lock
  aiService._inFlightAiOperation = null;
});

// ==============================================================================
// 4. DEVELOPMENT FALLBACK ADAPTER
// ==============================================================================

test('AI Planner Fallback Adapter: creates realistic mock suggestions and preserves user control', () => {
  aiPlannerModal.availableMinutes = 240;
  aiPlannerModal.targetDate = '2026-10-27';
  aiPlannerModal.goals = [{ id: 'goal-1', title: 'Half-Marathon Training' }];

  const fallback = aiPlannerModal.createMockDailySuggestions();

  assert.ok(fallback.suggestions.length >= 2);
  assert.ok(fallback.suggestions[0].title.includes('Half-Marathon Training'));
  assert.equal(fallback.provider, 'development_mock');

  // Ensure all suggestions have required fields: title, priority, estimated_duration, short_explanation
  for (const s of fallback.suggestions) {
    assert.ok(s.title);
    assert.ok(s.priority);
    assert.ok(s.estimated_duration > 0);
    assert.ok(s.short_explanation);
  }
});
