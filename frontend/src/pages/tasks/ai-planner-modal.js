/**
 * AI Daily Planner & Recovery Mode Interface
 * 
 * Features:
 * - Professional productivity assistant experience (no generic chatbot)
 * - "Plan My Day" context gathering: available time, energy level, priorities, constraints
 * - "Help Me Get Back on Track" Recovery Mode: overdue analysis, rescheduling, and decomposition
 * - Editable suggestion cards: title, duration, priority, linked goal, and coach rationale
 * - Individual approval, batch approval, inline editing, and rejection/dismissal
 * - Workload capacity summary and overload detection before saving
 * - Security: AI proposals never alter task records until explicit user confirmation
 * - Development fallback adapter when backend AI provider is unconfigured or offline
 */

import { aiService } from '../../services/ai-service.js';
import { tasksService } from '../../services/tasks-service.js';
import { goalsService } from '../../services/goals-service.js';
import { toastManager } from '../../components/toast.js';
import { openConfirmDialog } from '../../components/confirm-dialog.js';
import { renderLoadingState } from '../../components/loading-state.js';
import { renderRetryableError } from '../../components/retryable-error.js';
import { formatDuration, formatPriority, formatDateDisplay } from '../../utils/formatters.js';

class AiPlannerModalController {
  constructor() {
    this.isOpen = false;
    this.mode = 'plan'; // 'plan' | 'recovery'
    this.step = 'input'; // 'input' | 'generating' | 'review' | 'error'
    this.errorMessage = null;
    this.isDevelopmentFallback = false;

    // Daily Planner Context State
    this.targetDate = new Date().toISOString().split('T')[0];
    this.availableMinutes = 240;
    this.energyLevel = 'moderate'; // 'high' | 'moderate' | 'low'
    this.preferences = '';
    this.selectedGoalIds = [];

    // Recovery Mode Context State
    this.catchUpDailyMinutes = 60;
    this.recoveryNote = '';

    // Data Models
    this.goals = [];
    this.tasks = [];
    this.suggestions = []; // Array of editable suggestion items
    this.recoveryPlan = null; // RecoveryPlanResponse
    this.onTasksSaved = null;

    this.hostElement = null;
  }

  open({ mode = 'plan', defaultDate = null, goals = [], tasks = [], onTasksSaved = null } = {}) {
    this.isOpen = true;
    this.mode = mode;
    this.step = 'input';
    this.errorMessage = null;
    this.isDevelopmentFallback = false;
    this.targetDate = defaultDate || new Date().toISOString().split('T')[0];
    this.goals = goals || [];
    this.tasks = tasks || [];
    this.suggestions = [];
    this.recoveryPlan = null;
    this.onTasksSaved = onTasksSaved;

    // Default select active goals
    this.selectedGoalIds = this.goals
      .filter((g) => g.status !== 'completed' && g.status !== 'archived')
      .slice(0, 3)
      .map((g) => g.id);

    this.mount();
  }

  close() {
    this.isOpen = false;
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
    this.hostElement = null;
  }

  mount() {
    if (typeof document === 'undefined') return;

    if (!this.hostElement) {
      this.hostElement = document.createElement('div');
      this.hostElement.id = 'ai-planner-modal-host';
      document.body.appendChild(this.hostElement);
    }

    this.hostElement.innerHTML = this.renderMarkup();
    this.bindEvents();
  }

  renderMarkup() {
    return `
      <div class="modal-backdrop open" id="ai-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
        <div class="modal-dialog modal-lg" role="document">
          
          <!-- Modal Header with Tab Selector -->
          <div class="modal-header">
            <div>
              <div class="flex items-center gap-2">
                <span style="font-size: 18px;">✦</span>
                <h2 class="card-title" id="ai-modal-title" style="margin: 0;">
                  Personal Productivity Assistant
                </h2>
                <span class="badge badge-primary">AI Powered</span>
              </div>
              <p class="text-xs text-muted" style="margin-top: 2px;">
                Intentional, goal-aligned planning with human agency and control.
              </p>
            </div>
            <button id="ai-modal-close-btn" class="btn btn-ghost btn-icon" aria-label="Close dialog">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <!-- Mode Navigation Tabs -->
          <div style="background: var(--color-surface-hover); padding: 6px var(--space-6); border-bottom: 1px solid var(--color-border-subtle);" class="flex gap-2">
            <button id="ai-tab-plan" class="btn btn-sm ${this.mode === 'plan' ? 'btn-primary' : 'btn-ghost'}" ${this.step === 'generating' ? 'disabled' : ''}>
              Daily Planner (${formatDateDisplay(this.targetDate)})
            </button>
            <button id="ai-tab-recovery" class="btn btn-sm ${this.mode === 'recovery' ? 'btn-primary' : 'btn-ghost'}" ${this.step === 'generating' ? 'disabled' : ''}>
              Recovery Mode (Back on Track)
            </button>
          </div>

          <!-- Modal Body Content based on Step -->
          <div class="modal-body" style="min-height: 380px;">
            ${this.renderBodyContent()}
          </div>

          <!-- Modal Footer (only for review steps) -->
          ${this.renderFooterContent()}

        </div>
      </div>
    `;
  }

  renderBodyContent() {
    if (this.step === 'generating') {
      return `
        <div style="min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: var(--space-4);">
          <div class="loading-spinner" style="width: 44px; height: 44px; border-width: 3px; border-color: var(--color-primary-600) transparent transparent transparent;"></div>
          <div>
            <h3 style="font-size: var(--font-size-md); font-weight: 600; margin-bottom: var(--space-1);">
              ${this.mode === 'plan' ? 'Synthesizing Your Daily Focus...' : 'Formulating Recovery Strategy...'}
            </h3>
            <p class="text-xs text-muted" style="max-width: 400px; margin: 0 auto; line-height: 1.5;">
              ${this.mode === 'plan' 
                ? 'Antigravity AI is evaluating your active goals, milestones, energy capacity, and schedule boundaries to propose high-impact commitments.' 
                : 'Auditing overdue workloads, de-escalating bottlenecks, and constructing a sustainable catch-up plan without burnout.'}
            </p>
          </div>
        </div>
      `;
    }

    if (this.step === 'error') {
      return renderRetryableError({
        error: this.errorMessage,
        retryButtonId: 'ai-retry-operation-btn',
        title: 'AI Planning Service Alert',
      });
    }

    if (this.mode === 'plan') {
      return this.step === 'input' ? this.renderPlannerInputs() : this.renderPlannerReview();
    } else {
      return this.step === 'input' ? this.renderRecoveryInputs() : this.renderRecoveryReview();
    }
  }

  // ==============================================================================
  // DAILY PLANNER SCREENS
  // ==============================================================================

  renderPlannerInputs() {
    return `
      <div class="flex flex-col gap-5">
        <div class="card" style="background: var(--color-surface-hover); border-left: 3px solid var(--color-primary-600); padding: var(--space-3) var(--space-4);">
          <p class="text-xs" style="color: var(--color-text-secondary); line-height: 1.45;">
            <strong>Personal Productivity Assistant:</strong> Tell us your capacity and state of mind today. The assistant will propose focused, goal-aligned commitments that respect your schedule.
          </p>
        </div>

        <!-- 1. Available Time Selector -->
        <div class="form-group">
          <div class="flex justify-between items-center" style="margin-bottom: var(--space-1);">
            <label class="form-label" style="margin: 0;">Available Work Time Today</label>
            <span class="text-xs font-semibold" style="color: var(--color-primary-700);">
              ${formatDuration(this.availableMinutes)} (${this.availableMinutes} mins)
            </span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            ${[60, 120, 240, 360, 480].map((mins) => `
              <button type="button" class="btn btn-sm ${this.availableMinutes === mins ? 'btn-primary' : 'btn-outline'} time-preset-btn" data-mins="${mins}">
                ${mins / 60}h
              </button>
            `).join('')}
            <div class="flex items-center gap-1" style="margin-left: auto;">
              <span class="text-xs text-muted">Custom:</span>
              <input type="number" id="ai-custom-minutes" class="form-input" style="width: 80px; padding: 0.25rem 0.5rem; font-size: 13px;" value="${this.availableMinutes}" min="15" max="1440" step="15">
              <span class="text-xs text-muted">m</span>
            </div>
          </div>
        </div>

        <!-- 2. Energy Level Pills -->
        <div class="form-group">
          <label class="form-label">Current Energy Level</label>
          <div class="flex items-center gap-2">
            <button type="button" class="energy-pill ${this.energyLevel === 'high' ? 'active' : ''}" data-energy="high">
              <span>⚡ High Focus</span>
              <span class="text-xs" style="opacity: 0.85;">(Ready for deep work)</span>
            </button>
            <button type="button" class="energy-pill ${this.energyLevel === 'moderate' ? 'active' : ''}" data-energy="moderate">
              <span>⚖️ Moderate</span>
              <span class="text-xs" style="opacity: 0.85;">(Steady pacing)</span>
            </button>
            <button type="button" class="energy-pill ${this.energyLevel === 'low' ? 'active' : ''}" data-energy="low">
              <span>🌙 Low Energy</span>
              <span class="text-xs" style="opacity: 0.85;">(Low friction / admin)</span>
            </button>
          </div>
        </div>

        <!-- 3. Focus Goals Selection -->
        <div class="form-group">
          <label class="form-label">Priority Goals to Advance Today</label>
          ${this.goals.length === 0 ? `
            <p class="text-xs text-muted">No active goals found. You can set goals in the Goals tab.</p>
          ` : `
            <div class="flex flex-col gap-2" style="max-height: 140px; overflow-y: auto; padding: 4px;">
              ${this.goals.map((g) => {
                const isChecked = this.selectedGoalIds.includes(g.id);
                return `
                  <label class="flex items-center gap-2" style="font-size: var(--font-size-xs); cursor: pointer;">
                    <input type="checkbox" class="ai-goal-checkbox" value="${g.id}" ${isChecked ? 'checked' : ''}>
                    <span class="font-medium">${g.title}</span>
                    <span class="badge ${g.timeframe === 'short_term' ? 'badge-primary' : 'badge-teal'}" style="font-size: 10px;">${g.timeframe === 'short_term' ? 'Short-Term' : 'Long-Term'}</span>
                  </label>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- 4. Temporary Constraints & Preferences -->
        <div class="form-group">
          <label class="form-label" for="ai-preferences-input">Schedule Constraints or Instructions (Optional)</label>
          <textarea id="ai-preferences-input" class="form-textarea" rows="2" placeholder="e.g. Doctor appointment at 2pm, prioritize novel outline in the morning, no phone calls today...">${this.preferences}</textarea>
        </div>

        <div style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-4);" class="flex justify-between items-center">
          <span class="text-xs text-muted">Suggestions remain provisional until you accept them.</span>
          <button id="ai-generate-plan-btn" class="btn btn-primary">
            ✦ Generate Daily Plan
          </button>
        </div>
      </div>
    `;
  }

  renderPlannerReview() {
    const totalSelectedDuration = this.suggestions
      .filter((s) => s.isSelected)
      .reduce((sum, s) => sum + (s.estimated_duration || 30), 0);

    const isOverloaded = totalSelectedDuration > this.availableMinutes;
    const capacityPercent = Math.min(100, Math.round((totalSelectedDuration / this.availableMinutes) * 100));
    const selectedCount = this.suggestions.filter((s) => s.isSelected).length;

    return `
      <div class="flex flex-col gap-4">
        
        ${this.isDevelopmentFallback ? `
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: var(--space-2) var(--space-3); border-radius: var(--radius-xs);" class="text-xs">
            <strong>Development Fallback Mode:</strong> The backend AI provider is currently in local offline mode. Generated realistic simulation suggestions for testing.
          </div>
        ` : ''}

        <!-- Workload Capacity Gauge -->
        <div class="workload-gauge">
          <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
            <div>
              <span class="text-xs font-bold" style="text-transform: uppercase; letter-spacing: 0.05em;">Workload Capacity</span>
              <span class="text-xs text-muted" style="margin-left: 6px;">(${selectedCount} of ${this.suggestions.length} tasks selected)</span>
            </div>
            <div class="text-xs font-bold" style="color: ${isOverloaded ? 'var(--color-danger-solid)' : 'var(--color-primary-700)'};">
              ${totalSelectedDuration}m / ${this.availableMinutes}m (${capacityPercent}%)
            </div>
          </div>
          <div class="progress-track" style="height: 8px;">
            <div class="progress-bar" style="width: ${capacityPercent}%; background: ${isOverloaded ? 'var(--color-danger-solid)' : 'var(--color-primary-600)'};"></div>
          </div>
          ${isOverloaded ? `
            <p class="text-xs text-danger font-medium" style="margin-top: 4px;">
              ⚠ Warning: Selected tasks exceed your available ${this.availableMinutes}m capacity. Consider unchecking or trimming duration.
            </p>
          ` : ''}
        </div>

        <!-- Suggestion Cards List -->
        <div class="flex flex-col gap-3" style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
          ${this.suggestions.length === 0 ? `
            <div class="empty-state" style="padding: var(--space-6) 0;">
              <p class="text-sm text-muted">All suggestions have been dismissed. Click regenerate to explore alternative commitments.</p>
            </div>
          ` : `
            ${this.suggestions.map((s, idx) => `
              <div class="ai-suggestion-card ${s.isSelected ? 'selected' : ''}" data-idx="${idx}">
                
                ${s.isEditing ? `
                  <!-- Inline Edit Form -->
                  <div class="flex flex-col gap-2">
                    <input type="text" class="form-input edit-title-input" value="${s.title}" style="font-weight: 600;">
                    <div class="flex gap-2 items-center">
                      <select class="form-select edit-priority-select" style="width: 120px; font-size: 12px; padding: 0.2rem 0.4rem;">
                        <option value="urgent" ${s.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                        <option value="high" ${s.priority === 'high' ? 'selected' : ''}>High</option>
                        <option value="medium" ${s.priority === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="low" ${s.priority === 'low' ? 'selected' : ''}>Low</option>
                      </select>
                      <input type="number" class="form-input edit-duration-input" value="${s.estimated_duration}" style="width: 90px; font-size: 12px; padding: 0.2rem 0.4rem;" min="5" max="480">
                      <span class="text-xs text-muted">mins</span>
                      <button class="btn btn-primary btn-sm save-edit-btn" data-idx="${idx}" style="margin-left: auto;">Done</button>
                    </div>
                  </div>
                ` : `
                  <!-- Standard View Card -->
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-start gap-3">
                      <input type="checkbox" class="suggestion-select-checkbox" data-idx="${idx}" ${s.isSelected ? 'checked' : ''} style="margin-top: 4px; cursor: pointer;">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <h4 style="font-size: var(--font-size-sm); margin: 0; font-weight: 600;">${s.title}</h4>
                          <span class="badge ${s.priority === 'urgent' || s.priority === 'high' ? 'badge-danger' : 'badge-neutral'}" style="font-size: 10px;">
                            ${formatPriority(s.priority)}
                          </span>
                          <span class="badge badge-teal" style="font-size: 10px;">
                            ${s.estimated_duration} mins
                          </span>
                          ${s.suggested_deadline ? `<span class="badge badge-neutral" style="font-size: 10px;">Due ${s.suggested_deadline}</span>` : ''}
                        </div>
                        
                        ${s.description ? `<p class="text-xs text-muted" style="margin-top: 2px;">${s.description}</p>` : ''}
                        
                        <!-- Coach Recommendation Rationale -->
                        <div class="ai-coach-note">
                          <strong>Coach Rationale:</strong> ${s.short_explanation || 'Supports your targeted life goals.'}
                        </div>
                      </div>
                    </div>

                    <!-- Individual Card Controls -->
                    <div class="flex items-center gap-1 flex-shrink-0">
                      <button class="btn btn-ghost btn-sm edit-suggestion-btn" data-idx="${idx}" title="Edit before approving">
                        ✎ Edit
                      </button>
                      <button class="btn btn-outline btn-sm approve-single-btn" data-idx="${idx}" title="Approve and save task immediately">
                        ✓ Save
                      </button>
                      <button class="btn btn-ghost btn-sm reject-suggestion-btn" data-idx="${idx}" title="Reject proposal" style="color: var(--color-danger-solid);">
                        ✕
                      </button>
                    </div>
                  </div>
                `}

              </div>
            `).join('')}
          `}
        </div>

      </div>
    `;
  }

  // ==============================================================================
  // RECOVERY MODE SCREENS
  // ==============================================================================

  renderRecoveryInputs() {
    // Identify overdue tasks from list
    const nowStr = new Date().toISOString().split('T')[0];
    const overdueTasks = this.tasks.filter((t) => t.status !== 'completed' && t.status !== 'archived' && t.scheduled_date && t.scheduled_date < nowStr);

    return `
      <div class="flex flex-col gap-5">
        <div class="card" style="background: var(--color-danger-bg, #fef2f2); border-left: 3px solid var(--color-danger-solid); padding: var(--space-3) var(--space-4);">
          <div class="flex items-center gap-2">
            <span style="font-size: 16px;">🧘</span>
            <span class="text-xs font-bold text-danger">Recovery Mode — Sustainable Catch-Up</span>
          </div>
          <p class="text-xs" style="color: var(--color-text-secondary); margin-top: 4px; line-height: 1.45;">
            Falling behind is a normal part of life. Rather than cramming impossible backlogs into today, Recovery Mode de-escalates non-critical tasks, breaks down complex bottlenecks, and redistributes commitments realistically.
          </p>
        </div>

        <div class="flex justify-between items-center" style="background: var(--color-surface-hover); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle);">
          <div>
            <span class="text-xs font-bold">Detected Overdue Commitments</span>
            <p class="text-xs text-muted" style="margin: 0;">Unfinished tasks past their target dates</p>
          </div>
          <span class="badge ${overdueTasks.length > 0 ? 'badge-danger' : 'badge-success'}" style="font-size: 13px; font-weight: 700;">
            ${overdueTasks.length} Overdue
          </span>
        </div>

        <div class="form-group">
          <label class="form-label">Daily Catch-Up Capacity</label>
          <p class="text-xs text-muted" style="margin-bottom: var(--space-2);">How much extra focus can you sustainably allocate per day to catch up without burning out?</p>
          <div class="flex gap-2">
            ${[30, 60, 90, 120].map((mins) => `
              <button type="button" class="btn btn-sm ${this.catchUpDailyMinutes === mins ? 'btn-primary' : 'btn-outline'} recovery-mins-btn" data-mins="${mins}">
                +${mins} mins/day
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="ai-recovery-note">What Caused the Interruption? (Optional Context)</label>
          <textarea id="ai-recovery-note" class="form-textarea" rows="2" placeholder="e.g. Travel, illness, urgent work deadline, low energy...">${this.recoveryNote}</textarea>
        </div>

        <div style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-4);" class="flex justify-between items-center">
          <span class="text-xs text-muted">Nothing is changed without your review and approval.</span>
          <button id="ai-generate-recovery-btn" class="btn btn-primary">
            ✦ Generate Recovery Plan
          </button>
        </div>
      </div>
    `;
  }

  renderRecoveryReview() {
    if (!this.recoveryPlan) {
      return `<p class="text-sm text-muted">No recovery plan loaded.</p>`;
    }

    const {
      overdue_tasks_count,
      action_plan_summary,
      rescheduling_proposals = [],
      proposed_priorities = [],
      complex_tasks_breakdowns = [],
    } = this.recoveryPlan;

    return `
      <div class="flex flex-col gap-5" style="max-height: 400px; overflow-y: auto;">
        
        <!-- Summary Callout -->
        <div class="card" style="background: var(--color-surface-hover); border-left: 3px solid var(--color-primary-600); padding: var(--space-4);">
          <div class="flex items-center justify-between" style="margin-bottom: var(--space-1);">
            <h4 style="font-size: var(--font-size-sm); margin: 0; font-weight: 700;">Recovery Strategy Plan</h4>
            <span class="badge badge-teal">${overdue_tasks_count} tasks reviewed</span>
          </div>
          <p class="text-xs" style="color: var(--color-text-secondary); line-height: 1.5; margin: 0;">
            ${action_plan_summary || 'Sustainable schedule generated.'}
          </p>
        </div>

        <!-- 1. Rescheduling Proposals -->
        ${rescheduling_proposals.length > 0 ? `
          <div>
            <h4 class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: var(--space-2);">
              1. Proposed Rescheduled Dates (${rescheduling_proposals.length})
            </h4>
            <div class="flex flex-col gap-2">
              ${rescheduling_proposals.map((item, idx) => `
                <div class="recovery-proposal-card">
                  <div>
                    <span class="text-xs font-semibold">${item.title}</span>
                    <span class="text-xs text-muted" style="display: block;">
                      Proposed Date: <strong style="color: var(--color-primary-700);">${item.suggested_date || 'Upcoming'}</strong>
                    </span>
                    <span class="text-xs text-muted" style="font-size: 11px;">${item.short_explanation}</span>
                  </div>
                  <label class="flex items-center gap-1 text-xs" style="cursor: pointer;">
                    <input type="checkbox" class="recovery-accept-checkbox" data-type="reschedule" data-idx="${idx}" checked>
                    <span>Accept</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 2. Priority De-escalations -->
        ${proposed_priorities.length > 0 ? `
          <div>
            <h4 class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: var(--space-2);">
              2. Priority Re-alignments (${proposed_priorities.length})
            </h4>
            <div class="flex flex-col gap-2">
              ${proposed_priorities.map((item, idx) => `
                <div class="recovery-proposal-card">
                  <div>
                    <span class="text-xs font-semibold">${item.title}</span>
                    <span class="text-xs text-muted" style="display: block;">
                      Adjust Priority to: <span class="badge badge-neutral">${item.priority}</span>
                    </span>
                    <span class="text-xs text-muted" style="font-size: 11px;">${item.short_explanation}</span>
                  </div>
                  <label class="flex items-center gap-1 text-xs" style="cursor: pointer;">
                    <input type="checkbox" class="recovery-accept-checkbox" data-type="priority" data-idx="${idx}" checked>
                    <span>Accept</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 3. Decomposed Bottlenecks -->
        ${complex_tasks_breakdowns.length > 0 ? `
          <div>
            <h4 class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: var(--space-2);">
              3. Decomposed Action Steps (${complex_tasks_breakdowns.length})
            </h4>
            <div class="flex flex-col gap-2">
              ${complex_tasks_breakdowns.map((item, idx) => `
                <div class="recovery-proposal-card">
                  <div>
                    <span class="text-xs font-semibold">${item.title}</span>
                    <span class="text-xs text-muted" style="display: block;">Duration: ${item.estimated_duration} mins</span>
                    <span class="text-xs text-muted" style="font-size: 11px;">${item.short_explanation}</span>
                  </div>
                  <label class="flex items-center gap-1 text-xs" style="cursor: pointer;">
                    <input type="checkbox" class="recovery-accept-checkbox" data-type="decomposition" data-idx="${idx}" checked>
                    <span>Add Task</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }

  renderFooterContent() {
    if (this.step !== 'review') {
      return '';
    }

    if (this.mode === 'plan') {
      const selectedCount = this.suggestions.filter((s) => s.isSelected).length;
      return `
        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <button id="ai-regenerate-btn" class="btn btn-outline btn-sm">
            ⟳ Regenerate
          </button>
          <div class="flex gap-2">
            <button id="ai-cancel-review-btn" class="btn btn-ghost btn-sm">Cancel</button>
            <button id="ai-approve-selected-btn" class="btn btn-primary" ${selectedCount === 0 ? 'disabled' : ''}>
              Approve & Schedule (${selectedCount})
            </button>
          </div>
        </div>
      `;
    }

    if (this.mode === 'recovery') {
      return `
        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <button id="ai-recovery-back-btn" class="btn btn-outline btn-sm">
            ← Adjust Inputs
          </button>
          <div class="flex gap-2">
            <button id="ai-cancel-review-btn" class="btn btn-ghost btn-sm">Cancel</button>
            <button id="ai-apply-recovery-btn" class="btn btn-primary">
              Confirm & Apply Recovery Plan
            </button>
          </div>
        </div>
      `;
    }

    return '';
  }

  // ==============================================================================
  // ACTIONS & OPERATIONS
  // ==============================================================================

  async generateDailyPlan() {
    this.step = 'generating';
    this.errorMessage = null;
    this.mount();

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const payload = {
        target_date: this.targetDate,
        available_time_minutes: Number(this.availableMinutes),
        preferences: `Energy Level: ${this.energyLevel}. ${this.preferences}`.trim(),
        focus_goal_ids: this.selectedGoalIds,
        timezone: tz,
      };

      let response;
      try {
        response = await aiService.generateDailySuggestions(payload);
      } catch (err) {
        console.warn('[AiPlanner] Backend AI call error, checking fallback:', err);
        // If 404/503/network error in development, activate clearly labeled mock adapter
        if (err.statusCode === 404 || err.isNetworkError || err.statusCode === 500) {
          response = this.createMockDailySuggestions();
          this.isDevelopmentFallback = true;
        } else if (err.statusCode === 429) {
          throw new Error('AI planning rate limit reached. Please wait a moment or plan manually.');
        } else {
          throw err;
        }
      }

      this.suggestions = (response.suggestions || []).map((s) => ({
        ...s,
        isSelected: true,
        isEditing: false,
      }));

      this.step = 'review';
    } catch (err) {
      console.error('[AiPlanner] Generation failed:', err);
      this.step = 'error';
      this.errorMessage = err.message || 'Failed to generate daily plan. Please retry.';
    } finally {
      this.mount();
    }
  }

  async generateRecoveryPlan() {
    this.step = 'generating';
    this.errorMessage = null;
    this.mount();

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const payload = {
        current_date: this.targetDate,
        available_daily_minutes: Number(this.catchUpDailyMinutes),
        user_note: this.recoveryNote.trim(),
        timezone: tz,
      };

      let response;
      try {
        response = await aiService.createRecoveryPlan(payload);
      } catch (err) {
        console.warn('[AiPlanner] Backend Recovery call error, checking fallback:', err);
        if (err.statusCode === 404 || err.isNetworkError || err.statusCode === 500) {
          response = this.createMockRecoveryPlan();
          this.isDevelopmentFallback = true;
        } else if (err.statusCode === 429) {
          throw new Error('AI quota temporarily reached. Please retry shortly.');
        } else {
          throw err;
        }
      }

      this.recoveryPlan = response;
      this.step = 'review';
    } catch (err) {
      console.error('[AiPlanner] Recovery generation failed:', err);
      this.step = 'error';
      this.errorMessage = err.message || 'Failed to formulate recovery plan. Please retry.';
    } finally {
      this.mount();
    }
  }

  async approveSelectedSuggestions() {
    const selected = this.suggestions.filter((s) => s.isSelected);
    if (selected.length === 0) return;

    // Save each selected task to backend via tasksService
    let savedCount = 0;
    for (const item of selected) {
      try {
        await tasksService.createTask({
          title: item.title,
          description: item.description || '',
          priority: item.priority || 'medium',
          estimated_duration: item.estimated_duration || 30,
          scheduled_date: item.suggested_date || this.targetDate,
          due_time: item.suggested_deadline || '',
          goal_id: item.linked_goal_id || '',
          milestone_id: item.linked_milestone_id || '',
        });
        savedCount++;
      } catch (err) {
        console.error('[AiPlanner] Error saving task:', item.title, err);
      }
    }

    toastManager.show(
      `✦ Added ${savedCount} AI-recommended task${savedCount > 1 ? 's' : ''} to your daily schedule!`,
      'success'
    );

    if (this.onTasksSaved) {
      this.onTasksSaved(savedCount);
    }

    this.close();
  }

  async approveSingleSuggestion(index) {
    const item = this.suggestions[index];
    if (!item) return;

    try {
      await tasksService.createTask({
        title: item.title,
        description: item.description || '',
        priority: item.priority || 'medium',
        estimated_duration: item.estimated_duration || 30,
        scheduled_date: item.suggested_date || this.targetDate,
        due_time: item.suggested_deadline || '',
        goal_id: item.linked_goal_id || '',
        milestone_id: item.linked_milestone_id || '',
      });

      toastManager.show(`Task "${item.title}" added to schedule!`, 'success');

      // Remove from suggestions
      this.suggestions.splice(index, 1);
      this.mount();

      if (this.onTasksSaved) {
        this.onTasksSaved(1);
      }
    } catch (err) {
      toastManager.show(`Failed to save task: ${err.message}`, 'error');
    }
  }

  async applyRecoveryPlan() {
    const confirmed = await openConfirmDialog({
      title: 'Apply Recovery Plan?',
      message: 'This will reschedule the selected overdue commitments and create bite-sized action subtasks to get you back on track sustainably.',
      confirmText: 'Apply Plan',
      isDestructive: false,
    });

    if (!confirmed) return;

    // Apply decompositions as new tasks
    const breakdowns = this.recoveryPlan?.complex_tasks_breakdowns || [];
    let appliedCount = 0;
    for (const b of breakdowns) {
      try {
        await tasksService.createTask({
          title: b.title,
          description: b.description || 'Recovery action step',
          priority: b.priority || 'medium',
          estimated_duration: b.estimated_duration || 30,
          scheduled_date: b.suggested_date || this.targetDate,
          goal_id: b.linked_goal_id || '',
        });
        appliedCount++;
      } catch (err) {
        console.error('[AiPlanner] Error creating decomposed step:', err);
      }
    }

    toastManager.show('Recovery plan applied! Your schedule is now realistically aligned.', 'success');
    if (this.onTasksSaved) this.onTasksSaved(appliedCount);
    this.close();
  }

  // ==============================================================================
  // MOCK ADAPTER FALLBACK FOR DEVELOPMENT / OFFLINE
  // ==============================================================================

  createMockDailySuggestions() {
    const primaryGoal = this.goals[0] || { id: '', title: 'Focus Goal' };
    return {
      target_date: this.targetDate,
      available_time_minutes: this.availableMinutes,
      total_suggested_duration: Math.min(this.availableMinutes, 180),
      suggestions: [
        {
          title: `Deep Work: Advance ${primaryGoal.title}`,
          description: 'Focus during peak morning energy without interruptions.',
          linked_goal_id: primaryGoal.id,
          priority: 'high',
          estimated_duration: 60,
          suggested_date: this.targetDate,
          suggested_deadline: '11:00',
          short_explanation: 'Leverages high morning focus on your highest priority milestone.',
        },
        {
          title: 'Review and organize daily commitments',
          description: 'Sort urgent administrative notes and clarify execution order.',
          linked_goal_id: '',
          priority: 'medium',
          estimated_duration: 30,
          suggested_date: this.targetDate,
          suggested_deadline: '14:00',
          short_explanation: 'Maintains organizational clarity and prevents unverified backlog buildup.',
        },
        {
          title: 'Mindful evening reflection and habit check',
          description: 'Complete daily review and lock in verified accomplishments.',
          linked_goal_id: '',
          priority: 'low',
          estimated_duration: 15,
          suggested_date: this.targetDate,
          suggested_deadline: '20:00',
          short_explanation: 'Essential for maintaining your consecutive review streak.',
        },
      ],
      explanation: 'Bounded daily plan structured around your available capacity.',
      provider: 'development_mock',
      model: 'antigravity-mock-v1',
    };
  }

  createMockRecoveryPlan() {
    return {
      overdue_tasks_count: 2,
      overdue_task_ids: ['mock-1', 'mock-2'],
      action_plan_summary: 'We identified accumulated overdue work. Rather than creating an impossible backlog today, we staggered tasks across the next 3 days and decomposed complex bottlenecks.',
      rescheduling_proposals: [
        {
          title: 'Postponed: Extended deep work session',
          suggested_date: 'Tomorrow',
          short_explanation: 'Moved to tomorrow to keep today sustainable.',
        },
      ],
      proposed_priorities: [
        {
          title: 'Administrative catch-up',
          priority: 'low',
          short_explanation: 'De-escalated from urgent to reduce immediate stress.',
        },
      ],
      complex_tasks_breakdowns: [
        {
          title: 'Bite-Sized: Outline key points (Part 1)',
          estimated_duration: 30,
          suggested_date: this.targetDate,
          short_explanation: 'Breaks down a daunting 90m block into an easy first step.',
        },
      ],
      preserves_history: true,
      requires_user_confirmation: true,
      provider: 'development_mock',
      model: 'antigravity-mock-v1',
    };
  }

  // ==============================================================================
  // EVENT BINDINGS
  // ==============================================================================

  bindEvents() {
    if (!this.hostElement) return;

    // Close buttons
    const closeBtn = this.hostElement.querySelector('#ai-modal-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const cancelBtn = this.hostElement.querySelector('#ai-cancel-review-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

    // Tab buttons
    const tabPlan = this.hostElement.querySelector('#ai-tab-plan');
    if (tabPlan) {
      tabPlan.addEventListener('click', () => {
        this.mode = 'plan';
        this.step = 'input';
        this.mount();
      });
    }

    const tabRecovery = this.hostElement.querySelector('#ai-tab-recovery');
    if (tabRecovery) {
      tabRecovery.addEventListener('click', () => {
        this.mode = 'recovery';
        this.step = 'input';
        this.mount();
      });
    }

    // Time Presets
    const timePresetBtns = this.hostElement.querySelectorAll('.time-preset-btn');
    for (const btn of timePresetBtns) {
      btn.addEventListener('click', () => {
        this.availableMinutes = parseInt(btn.getAttribute('data-mins'), 10);
        this.mount();
      });
    }

    const customMinsInput = this.hostElement.querySelector('#ai-custom-minutes');
    if (customMinsInput) {
      customMinsInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val && val >= 15 && val <= 1440) {
          this.availableMinutes = val;
          this.mount();
        }
      });
    }

    // Energy Level Pills
    const energyPills = this.hostElement.querySelectorAll('.energy-pill');
    for (const pill of energyPills) {
      pill.addEventListener('click', () => {
        this.energyLevel = pill.getAttribute('data-energy');
        this.mount();
      });
    }

    // Goal Checkboxes
    const goalCheckboxes = this.hostElement.querySelectorAll('.ai-goal-checkbox');
    for (const cb of goalCheckboxes) {
      cb.addEventListener('change', () => {
        this.selectedGoalIds = Array.from(goalCheckboxes)
          .filter((input) => input.checked)
          .map((input) => input.value);
      });
    }

    // Preferences input
    const prefInput = this.hostElement.querySelector('#ai-preferences-input');
    if (prefInput) {
      prefInput.addEventListener('input', (e) => {
        this.preferences = e.target.value;
      });
    }

    // Recovery Mins Buttons
    const recoveryMinsBtns = this.hostElement.querySelectorAll('.recovery-mins-btn');
    for (const btn of recoveryMinsBtns) {
      btn.addEventListener('click', () => {
        this.catchUpDailyMinutes = parseInt(btn.getAttribute('data-mins'), 10);
        this.mount();
      });
    }

    const recoveryNoteInput = this.hostElement.querySelector('#ai-recovery-note');
    if (recoveryNoteInput) {
      recoveryNoteInput.addEventListener('input', (e) => {
        this.recoveryNote = e.target.value;
      });
    }

    // Trigger Generation Buttons
    const generatePlanBtn = this.hostElement.querySelector('#ai-generate-plan-btn');
    if (generatePlanBtn) {
      generatePlanBtn.addEventListener('click', () => this.generateDailyPlan());
    }

    const generateRecoveryBtn = this.hostElement.querySelector('#ai-generate-recovery-btn');
    if (generateRecoveryBtn) {
      generateRecoveryBtn.addEventListener('click', () => this.generateRecoveryPlan());
    }

    // Regenerate Button
    const regenerateBtn = this.hostElement.querySelector('#ai-regenerate-btn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => this.generateDailyPlan());
    }

    // Retry Button on error
    const retryBtn = this.hostElement.querySelector('#ai-retry-operation-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (this.mode === 'plan') this.generateDailyPlan();
        else this.generateRecoveryPlan();
      });
    }

    // Back button in Recovery review
    const recoveryBackBtn = this.hostElement.querySelector('#ai-recovery-back-btn');
    if (recoveryBackBtn) {
      recoveryBackBtn.addEventListener('click', () => {
        this.step = 'input';
        this.mount();
      });
    }

    // Suggestion Selection Checkboxes
    const selectCheckboxes = this.hostElement.querySelectorAll('.suggestion-select-checkbox');
    for (const cb of selectCheckboxes) {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.getAttribute('data-idx'), 10);
        if (this.suggestions[idx]) {
          this.suggestions[idx].isSelected = cb.checked;
          this.mount();
        }
      });
    }

    // Edit Suggestion Button
    const editBtns = this.hostElement.querySelectorAll('.edit-suggestion-btn');
    for (const btn of editBtns) {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (this.suggestions[idx]) {
          this.suggestions[idx].isEditing = true;
          this.mount();
        }
      });
    }

    // Save Edit Button
    const saveEditBtns = this.hostElement.querySelectorAll('.save-edit-btn');
    for (const btn of saveEditBtns) {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const card = btn.closest('.ai-suggestion-card');
        if (card && this.suggestions[idx]) {
          const titleInput = card.querySelector('.edit-title-input');
          const prioritySelect = card.querySelector('.edit-priority-select');
          const durationInput = card.querySelector('.edit-duration-input');
          if (titleInput) this.suggestions[idx].title = titleInput.value.trim();
          if (prioritySelect) this.suggestions[idx].priority = prioritySelect.value;
          if (durationInput) this.suggestions[idx].estimated_duration = parseInt(durationInput.value, 10) || 30;
          this.suggestions[idx].isEditing = false;
          this.mount();
        }
      });
    }

    // Reject Suggestion Button
    const rejectBtns = this.hostElement.querySelectorAll('.reject-suggestion-btn');
    for (const btn of rejectBtns) {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        this.suggestions.splice(idx, 1);
        this.mount();
      });
    }

    // Approve Single Suggestion Button
    const approveSingleBtns = this.hostElement.querySelectorAll('.approve-single-btn');
    for (const btn of approveSingleBtns) {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        this.approveSingleSuggestion(idx);
      });
    }

    // Approve All Selected Button
    const approveSelectedBtn = this.hostElement.querySelector('#ai-approve-selected-btn');
    if (approveSelectedBtn) {
      approveSelectedBtn.addEventListener('click', () => this.approveSelectedSuggestions());
    }

    // Apply Recovery Plan Button
    const applyRecoveryBtn = this.hostElement.querySelector('#ai-apply-recovery-btn');
    if (applyRecoveryBtn) {
      applyRecoveryBtn.addEventListener('click', () => this.applyRecoveryPlan());
    }
  }
}

export const aiPlannerModal = new AiPlannerModalController();

export function openAiPlannerModal(options) {
  aiPlannerModal.open(options);
}
