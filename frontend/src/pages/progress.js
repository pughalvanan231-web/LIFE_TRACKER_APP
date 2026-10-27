/**
 * Daily Review & Progress Page
 * 
 * Features:
 * - Daily review submission & historical snapshot inspection
 * - Task status categorization (Completed, Not Completed, Unverified, Rescheduled)
 * - Educational clarification on unverified status (does not imply failure)
 * - Pre-submission confirmation dialog
 * - Post-submission frozen snapshot display with timestamp
 * - Duplicate submission prevention and deliberate correction flow
 * - Live backend integration (no sample data in production)
 */

import { dailyReviewsService } from '../services/daily-reviews-service.js';
import { progressService } from '../services/progress-service.js';
import { openConfirmDialog } from '../components/confirm-dialog.js';
import { toastManager } from '../components/toast.js';
import { renderSkeletonCardList } from '../components/loading-skeleton.js';
import { renderRetryableError } from '../components/retryable-error.js';
import { formatDate, formatDateDisplay } from '../utils/formatters.js';

class ProgressReviewController {
  constructor() {
    this.selectedDate = new Date().toISOString().split('T')[0];
    this.review = null;
    this.dailyProgress = null;
    this.isLoading = false;
    this.isSubmitting = false;
    this.error = null;
    this.isCorrectionMode = false;

    // Form inputs state
    this.rating = 4;
    this.wins = '';
    this.challenges = '';
    this.summary = '';

    this._container = null;
  }

  setContainer(container) {
    this._container = container;
  }

  async loadDate(date) {
    if (date) this.selectedDate = date;
    this.isLoading = true;
    this.error = null;
    this.isCorrectionMode = false;
    this.render();

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      // 1. Check if a frozen review already exists for this date
      try {
        const reviewData = await dailyReviewsService.getReview(this.selectedDate);
        this.review = reviewData;
        this.dailyProgress = null;
        this.rating = reviewData.rating || 4;
        this.wins = reviewData.wins || '';
        this.challenges = reviewData.challenges || '';
        this.summary = reviewData.summary || '';
      } catch (err) {
        // If 404, no review recorded yet -> load live daily progress
        if (err.status === 404) {
          this.review = null;
          const progressData = await progressService.getDailyProgress({
            date: this.selectedDate,
            timezone: tz,
          });
          this.dailyProgress = progressData;
          this.rating = 4;
          this.wins = '';
          this.challenges = '';
          this.summary = '';
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error('[ProgressReview] Load error:', err);
      this.error = err.message || 'Failed to load daily progress for this date.';
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  async handleFormSubmit() {
    if (this.isSubmitting) return;

    // Confirmation dialog before final submission
    const isCorrection = Boolean(this.review) || this.isCorrectionMode;
    const confirmMessage = isCorrection
      ? `You are submitting a correction for ${this.selectedDate}. Your updated reflection and progress snapshot will be permanently recorded.`
      : `Ready to submit your daily review for ${this.selectedDate}? Unconfirmed tasks will be saved as unverified (which does not mean failure), and today's snapshot will be permanently frozen.`;

    const confirmed = await openConfirmDialog({
      title: isCorrection ? 'Submit Review Correction?' : 'Submit Daily Review?',
      message: confirmMessage,
      confirmText: isCorrection ? 'Submit Correction' : 'Submit Daily Review',
      isDestructive: false,
    });

    if (!confirmed) return;

    this.isSubmitting = true;
    this.render();

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const payload = {
        date: this.selectedDate,
        rating: Number(this.rating),
        wins: this.wins.trim(),
        challenges: this.challenges.trim(),
        summary: this.summary.trim(),
        is_correction: isCorrection,
        timezone: tz,
      };

      const savedReview = await dailyReviewsService.submitReview(payload);
      toastManager.show(
        isCorrection
          ? 'Daily review correction recorded successfully.'
          : 'Daily review submitted! Progress snapshot has been securely frozen.',
        'success'
      );

      this.review = savedReview;
      this.dailyProgress = null;
      this.isCorrectionMode = false;
    } catch (err) {
      console.error('[ProgressReview] Submit error:', err);
      toastManager.show(err.message || 'Failed to submit daily review. Please retry.', 'error');
    } finally {
      this.isSubmitting = false;
      this.render();
    }
  }

  render() {
    if (!this._container) return;
    const mount = this._container.querySelector('#progress-page-root');
    if (!mount) return;
    mount.innerHTML = this.renderContent();
    this.bindEvents();
  }

  renderContent() {
    if (this.isLoading) {
      return `
        <div style="padding: var(--space-6) 0;">
          ${renderSkeletonCardList(2)}
        </div>
      `;
    }

    if (this.error) {
      return renderRetryableError({
        message: this.error,
        retryId: 'progress-retry-btn',
      });
    }

    const isReviewed = Boolean(this.review);
    const tasks = isReviewed
      ? (this.review.task_snapshots || [])
      : (this.dailyProgress?.tasks || []);

    const completedTasks = tasks.filter((t) => t.status === 'completed' || t.is_completed);
    const notCompletedTasks = tasks.filter((t) => t.status === 'not_completed');
    const unverifiedTasks = tasks.filter((t) => t.status === 'unverified' || (t.status === 'pending' && !t.is_completed));
    const rescheduledTasks = tasks.filter((t) => t.status === 'postponed' || Boolean(t.rescheduled_to));

    const totalTasks = isReviewed
      ? this.review.total_tasks
      : (this.dailyProgress?.total_tasks || tasks.length);

    const completionRate = isReviewed
      ? Math.round(this.review.completion_rate || 0)
      : Math.round(this.dailyProgress?.completion_percentage || 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = this.selectedDate === todayStr;

    return `
      <!-- Date Bar & Review Status Header -->
      <div class="card" style="margin-bottom: var(--space-6); background: var(--color-surface-card);">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--color-primary-50); color: var(--color-primary-700); display: flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 style="font-size: var(--font-size-xl); font-weight: 700; margin: 0;">
                  ${formatDateDisplay(this.selectedDate)}
                </h2>
                ${isToday ? '<span class="badge badge-teal">Today</span>' : ''}
                ${
                  isReviewed
                    ? '<span class="badge badge-success">✓ Review Saved & Snapshot Frozen</span>'
                    : '<span class="badge badge-neutral">Pending Evening Review</span>'
                }
              </div>
              <p class="text-xs text-muted" style="margin-top: 2px;">
                ${
                  isReviewed
                    ? `Snapshot frozen on ${formatDate(this.review.created_at)} at ${new Date(this.review.created_at).toLocaleTimeString()}${this.review.is_correction ? ' (Corrected)' : ''}`
                    : 'Server-side closing preserves verified work and protects metric integrity.'
                }
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button id="progress-prev-day-btn" class="btn btn-outline btn-sm" title="Previous Day">
              ← Prev Day
            </button>
            <input type="date" id="progress-date-picker" class="form-input" style="padding: 0.35rem 0.6rem; font-size: 13px;" value="${this.selectedDate}" max="${todayStr}">
            <button id="progress-today-btn" class="btn btn-outline btn-sm" ${isToday ? 'disabled' : ''}>
              Today
            </button>
          </div>
        </div>
      </div>

      <!-- Main Layout: Task Breakdown (Left) vs Evening Reflection / Submission (Right) -->
      <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: var(--space-6);" class="grid-2">
        
        <!-- LEFT COLUMN: Authoritative Task Status Breakdown -->
        <div class="flex flex-col gap-5">
          
          <!-- Key Metric Stats Card -->
          <div class="card" style="padding: var(--space-4);">
            <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
              <span class="text-xs font-semibold text-muted" style="text-transform: uppercase; letter-spacing: 0.05em;">
                Daily Task Completion Rate
              </span>
              <span class="font-bold text-lg" style="color: ${completionRate >= 70 ? 'var(--color-success-solid)' : 'var(--color-primary-700)'};">
                ${completionRate}%
              </span>
            </div>
            <div class="progress-track" style="height: 10px;">
              <div class="progress-bar" style="width: ${completionRate}%; background: ${completionRate >= 70 ? 'var(--color-success-solid)' : 'var(--color-primary-600)'};"></div>
            </div>
            <div class="flex justify-between items-center text-xs text-muted" style="margin-top: var(--space-2);">
              <span>${completedTasks.length} of ${totalTasks} tasks completed</span>
              <span>Based on tasks due on this calendar day</span>
            </div>
          </div>

          <!-- Educational Clarification Alert: Unverified Tasks -->
          <div style="background-color: var(--color-surface-hover); border-left: 4px solid var(--color-primary-500); padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm); border: 1px solid var(--color-border-subtle);">
            <div class="flex items-start gap-2">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-primary-600); flex-shrink: 0; margin-top: 2px;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <div class="text-xs" style="color: var(--color-text-secondary); line-height: 1.45;">
                <strong>What does Unverified mean?</strong> An unverified status indicates that a task's completion was not explicitly confirmed prior to midnight closing. 
                <span style="color: var(--color-text-primary); font-weight: 600;">It does not mean you failed.</span> It provides an honest record of unconfirmed commitments so historical snapshots remain trustworthy.
              </div>
            </div>
          </div>

          <!-- Task Categories Accordion / Lists -->
          <div class="card flex flex-col gap-4">
            <h3 class="card-title" style="font-size: var(--font-size-md);">
              Task Breakdown (${tasks.length} total)
            </h3>

            ${tasks.length === 0 ? `
              <div class="empty-state" style="padding: var(--space-6) 0;">
                <p class="text-sm text-muted">No scheduled commitments recorded for this day.</p>
              </div>
            ` : `
              <!-- 1. Completed Tasks -->
              <div>
                <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
                  <span class="text-xs font-bold text-success flex items-center gap-1">
                    <span>✓</span> Completed Tasks (${completedTasks.length})
                  </span>
                  <span class="badge badge-success">Done</span>
                </div>
                ${completedTasks.length === 0 ? '<p class="text-xs text-muted" style="margin-left: 1rem;">None completed yet.</p>' : `
                  <div class="flex flex-col gap-2">
                    ${completedTasks.map((t) => `
                      <div class="card" style="padding: 0.6rem 0.8rem; display: flex; align-items: center; justify-content: space-between; background: var(--color-surface-hover); border-left: 3px solid var(--color-success-solid);">
                        <span class="text-xs font-medium" style="text-decoration: line-through; color: var(--color-text-muted);">${t.title}</span>
                        <span class="text-xs text-muted">${t.estimated_duration || 30}m</span>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>

              <!-- 2. Explicitly Marked Not Completed -->
              <div style="margin-top: var(--space-2);">
                <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
                  <span class="text-xs font-bold text-danger flex items-center gap-1">
                    <span>✗</span> Marked Not Completed (${notCompletedTasks.length})
                  </span>
                  <span class="badge badge-danger">Not Done</span>
                </div>
                ${notCompletedTasks.length === 0 ? '<p class="text-xs text-muted" style="margin-left: 1rem;">None explicitly marked incomplete.</p>' : `
                  <div class="flex flex-col gap-2">
                    ${notCompletedTasks.map((t) => `
                      <div class="card" style="padding: 0.6rem 0.8rem; display: flex; align-items: center; justify-content: space-between; background: var(--color-surface-hover); border-left: 3px solid var(--color-danger-solid);">
                        <span class="text-xs font-medium text-danger">${t.title}</span>
                        <span class="text-xs text-muted">${t.estimated_duration || 30}m</span>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>

              <!-- 3. Unverified Tasks -->
              <div style="margin-top: var(--space-2);">
                <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
                  <span class="text-xs font-bold text-muted flex items-center gap-1">
                    <span>?</span> Unverified Commitments (${unverifiedTasks.length})
                  </span>
                  <span class="badge badge-neutral">Unconfirmed</span>
                </div>
                ${unverifiedTasks.length === 0 ? '<p class="text-xs text-muted" style="margin-left: 1rem;">No unverified commitments.</p>' : `
                  <div class="flex flex-col gap-2">
                    ${unverifiedTasks.map((t) => `
                      <div class="card" style="padding: 0.6rem 0.8rem; display: flex; align-items: center; justify-content: space-between; background: var(--color-surface-hover); border-left: 3px solid var(--color-neutral-400);">
                        <div>
                          <span class="text-xs font-medium">${t.title}</span>
                          <span class="text-xs text-muted" style="display: block; font-size: 11px;">Not confirmed before closing</span>
                        </div>
                        <span class="badge badge-neutral" style="font-size: 10px;">Unverified</span>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>

              <!-- 4. Rescheduled Tasks -->
              <div style="margin-top: var(--space-2);">
                <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
                  <span class="text-xs font-bold flex items-center gap-1" style="color: var(--color-warning-solid);">
                    <span>⟳</span> Rescheduled Commitments (${rescheduledTasks.length})
                  </span>
                  <span class="badge badge-warning">Postponed</span>
                </div>
                ${rescheduledTasks.length === 0 ? '<p class="text-xs text-muted" style="margin-left: 1rem;">No tasks postponed.</p>' : `
                  <div class="flex flex-col gap-2">
                    ${rescheduledTasks.map((t) => `
                      <div class="card" style="padding: 0.6rem 0.8rem; display: flex; align-items: center; justify-content: space-between; background: var(--color-surface-hover); border-left: 3px solid var(--color-warning-solid);">
                        <div>
                          <span class="text-xs font-medium">${t.title}</span>
                          <span class="text-xs text-muted" style="display: block; font-size: 11px;">
                            ${t.rescheduled_to ? `Moved to ${t.rescheduled_to}` : 'Postponed'}
                          </span>
                        </div>
                        <span class="badge badge-warning" style="font-size: 10px;">Rescheduled</span>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            `}
          </div>
        </div>

        <!-- RIGHT COLUMN: Review Form / Saved Review Summary -->
        <div class="flex flex-col gap-5">
          ${isReviewed && !this.isCorrectionMode ? `
            <!-- Saved Review Card (Frozen Mode) -->
            <section class="card flex flex-col gap-4" style="border: 1px solid var(--color-border-subtle); background: var(--color-surface-card);">
              <div class="card-header" style="margin-bottom: 0;">
                <div>
                  <h3 class="card-title">Recorded Daily Review</h3>
                  <p class="card-subtitle">Saved on ${formatDate(this.review.created_at)}</p>
                </div>
                <span class="badge badge-success">Snapshot Locked</span>
              </div>

              <div class="form-group">
                <label class="form-label text-xs">Satisfaction Rating</label>
                <div style="font-size: 20px; color: #f59e0b; letter-spacing: 2px;">
                  ${'★'.repeat(this.review.rating || 3)}${'☆'.repeat(5 - (this.review.rating || 3))}
                  <span class="text-xs text-muted" style="font-size: 12px; margin-left: 8px;">(${this.review.rating || 3} of 5)</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label text-xs">Wins & Accomplishments</label>
                <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3); font-size: var(--font-size-sm); min-height: 50px;">
                  ${this.review.wins || '<span class="text-muted italic">No specific wins recorded.</span>'}
                </div>
              </div>

              <div class="form-group">
                <label class="form-label text-xs">Challenges & Obstacles</label>
                <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3); font-size: var(--font-size-sm); min-height: 50px;">
                  ${this.review.challenges || '<span class="text-muted italic">No specific challenges noted.</span>'}
                </div>
              </div>

              ${this.review.summary ? `
                <div class="form-group">
                  <label class="form-label text-xs">Overall Summary</label>
                  <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3); font-size: var(--font-size-sm);">
                    ${this.review.summary}
                  </div>
                </div>
              ` : ''}

              <div style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-4);" class="flex justify-between items-center">
                <span class="text-xs text-muted">Need to amend this record?</span>
                <button id="progress-edit-correction-btn" class="btn btn-outline btn-sm">
                  Submit Correction
                </button>
              </div>
            </section>
          ` : `
            <!-- Review Submission / Correction Form -->
            <section class="card flex flex-col gap-4">
              <div class="card-header" style="margin-bottom: 0;">
                <div>
                  <h3 class="card-title">
                    ${this.isCorrectionMode ? 'Submit Review Correction' : 'Evening Review Submission'}
                  </h3>
                  <p class="card-subtitle">
                    ${this.isCorrectionMode ? 'Update reflection and refresh historical snapshot.' : 'Reflect mindfully before midnight to freeze confirmed progress.'}
                  </p>
                </div>
                <span class="badge ${this.isCorrectionMode ? 'badge-warning' : 'badge-primary'}">
                  ${this.isCorrectionMode ? 'Correction Mode' : 'Daily Closing'}
                </span>
              </div>

              <div class="form-group">
                <label class="form-label">Day Satisfaction Rating</label>
                <div class="flex gap-2" id="star-rating-container">
                  ${[1, 2, 3, 4, 5].map((star) => `
                    <button type="button" class="btn ${this.rating >= star ? 'btn-primary' : 'btn-outline'} btn-sm star-rating-btn" data-star="${star}" style="font-size: 16px; padding: 0.35rem 0.75rem;" title="${star} Star">
                      ★ ${star}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="review-wins-input">Wins & Accomplishments</label>
                <textarea id="review-wins-input" class="form-textarea" rows="3" placeholder="What went well today? What commitments are you proud of completing?">${this.wins}</textarea>
              </div>

              <div class="form-group">
                <label class="form-label" for="review-challenges-input">Challenges & Obstacles</label>
                <textarea id="review-challenges-input" class="form-textarea" rows="2" placeholder="What friction or bottlenecks slowed you down? What will you adjust tomorrow?">${this.challenges}</textarea>
              </div>

              <div class="form-group">
                <label class="form-label" for="review-summary-input">Daily Reflection Summary (Optional)</label>
                <textarea id="review-summary-input" class="form-textarea" rows="2" placeholder="Overall takeaway or closing mindful note...">${this.summary}</textarea>
              </div>

              <div class="flex justify-between items-center" style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-4);">
                <div class="text-xs text-muted" style="max-width: 65%;">
                  <span>Accidental duplicate submissions are safely prevented.</span>
                </div>
                <div class="flex gap-2">
                  ${this.isCorrectionMode ? `
                    <button id="progress-cancel-correction-btn" class="btn btn-ghost btn-sm" type="button">Cancel</button>
                  ` : ''}
                  <button id="progress-submit-review-btn" class="btn btn-primary" ${this.isSubmitting ? 'disabled' : ''}>
                    ${this.isSubmitting ? 'Saving Snapshot...' : (this.isCorrectionMode ? 'Save Correction' : 'Submit Daily Review')}
                  </button>
                </div>
              </div>
            </section>
          `}

          <!-- Mindful Formula Sticky Note -->
          <section class="sticky-note sage" style="margin-top: var(--space-2);">
            <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
              <span class="font-bold text-xs" style="text-transform: uppercase; letter-spacing: 0.05em;">Integrity Formula</span>
              <span class="text-xs">Deterministic</span>
            </div>
            <p style="font-size: var(--font-size-xs); line-height: 1.5; font-family: var(--font-mono);">
              Completion % = (Completed Tasks / Total Tasks Due) × 100
            </p>
            <p class="text-xs" style="margin-top: var(--space-2); opacity: 0.9;">
              Unverified tasks remain in the denominator. Reviewing before midnight is your mindful practice to lock in earned achievements.
            </p>
          </section>
        </div>

      </div>
    `;
  }

  bindEvents() {
    if (!this._container) return;

    // 1. Date Picker
    const datePicker = this._container.querySelector('#progress-date-picker');
    if (datePicker) {
      datePicker.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) this.loadDate(val);
      });
    }

    // 2. Previous Day Button
    const prevDayBtn = this._container.querySelector('#progress-prev-day-btn');
    if (prevDayBtn) {
      prevDayBtn.addEventListener('click', () => {
        const current = new Date(this.selectedDate);
        current.setDate(current.getDate() - 1);
        this.loadDate(current.toISOString().split('T')[0]);
      });
    }

    // 3. Today Button
    const todayBtn = this._container.querySelector('#progress-today-btn');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const todayStr = new Date().toISOString().split('T')[0];
        this.loadDate(todayStr);
      });
    }

    // 4. Star Rating Buttons
    const starBtns = this._container.querySelectorAll('.star-rating-btn');
    for (const btn of starBtns) {
      btn.addEventListener('click', () => {
        const ratingVal = parseInt(btn.getAttribute('data-star'), 10);
        if (ratingVal) {
          this.rating = ratingVal;
          this.render();
        }
      });
    }

    // 5. Textarea Inputs (preserve user input)
    const winsInput = this._container.querySelector('#review-wins-input');
    if (winsInput) {
      winsInput.addEventListener('input', (e) => {
        this.wins = e.target.value;
      });
    }

    const challengesInput = this._container.querySelector('#review-challenges-input');
    if (challengesInput) {
      challengesInput.addEventListener('input', (e) => {
        this.challenges = e.target.value;
      });
    }

    const summaryInput = this._container.querySelector('#review-summary-input');
    if (summaryInput) {
      summaryInput.addEventListener('input', (e) => {
        this.summary = e.target.value;
      });
    }

    // 6. Submit Daily Review Button
    const submitBtn = this._container.querySelector('#progress-submit-review-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleFormSubmit());
    }

    // 7. Edit Correction Button
    const editCorrectionBtn = this._container.querySelector('#progress-edit-correction-btn');
    if (editCorrectionBtn) {
      editCorrectionBtn.addEventListener('click', () => {
        this.isCorrectionMode = true;
        this.render();
      });
    }

    // 8. Cancel Correction Button
    const cancelCorrectionBtn = this._container.querySelector('#progress-cancel-correction-btn');
    if (cancelCorrectionBtn) {
      cancelCorrectionBtn.addEventListener('click', () => {
        this.isCorrectionMode = false;
        this.render();
      });
    }

    // 9. Retry Button on Error
    const retryBtn = this._container.querySelector('#progress-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadDate(this.selectedDate));
    }
  }
}

export const progressController = new ProgressReviewController();

export function renderProgressPage() {
  return `
    <div class="page-container" id="progress-page-root">
      ${progressController.renderContent()}
    </div>
  `;
}

export function bindProgressEvents(mountElement) {
  progressController.setContainer(mountElement);
  progressController.bindEvents();
  // Trigger initial data load if not yet populated
  if (!progressController.review && !progressController.dailyProgress && !progressController.isLoading) {
    progressController.loadDate(progressController.selectedDate);
  }
}
