/**
 * Daily Closing Status Component
 * 
 * Displays:
 * - 4 deterministic states: Submitted, Closed Automatically, Not Submitted, Tasks Awaiting Confirmation
 * - User's configured time zone
 * - Time until the next server-side midnight daily review deadline
 * - Explicit note that backend scheduler is authoritative and closing never depends on browser timers
 */

import { formatDate, formatDateDisplay } from '../utils/formatters.js';

/**
 * Calculate time remaining until next local midnight
 * @param {string} [timeZone='UTC']
 * @returns {{ deadlineText: string, hoursRemaining: number, minutesRemaining: number }}
 */
export function getNextMidnightDeadline(timeZone = 'UTC') {
  try {
    const now = new Date();
    // Compute current time in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    const hour = getPart('hour');
    const minute = getPart('minute');

    // Midnight is at 24:00 (1440 minutes)
    const minutesPassedToday = hour * 60 + minute;
    const minutesLeft = 1440 - minutesPassedToday;

    const hoursRemaining = Math.floor(minutesLeft / 60);
    const minutesRemaining = minutesLeft % 60;

    const deadlineText = `Tonight at 12:00 AM (${hoursRemaining}h ${minutesRemaining}m remaining)`;
    return { deadlineText, hoursRemaining, minutesRemaining };
  } catch (err) {
    return { deadlineText: 'Tonight at 12:00 AM', hoursRemaining: 0, minutesRemaining: 0 };
  }
}

/**
 * Determine the daily closing status classification
 * @param {Object} options
 * @param {Object|null} options.review - Saved review from backend
 * @param {Object|null} options.dailyProgress - Daily progress from backend
 * @param {Array<Object>} [options.tasks=[]] - Tasks scheduled for today
 * @returns {{ state: string, label: string, badgeClass: string, description: string }}
 */
export function determineClosingStatus({ review, dailyProgress, tasks = [] } = {}) {
  if (review) {
    if (review.is_late || review.summary?.includes('Automated') || review.summary?.includes('Midnight closing')) {
      return {
        state: 'closed_automatically',
        label: 'Closed Automatically',
        badgeClass: 'badge-neutral',
        description: `Closed automatically by server scheduler at midnight. Unconfirmed tasks were preserved as unverified on ${formatDate(review.created_at)}.`,
      };
    }

    return {
      state: 'submitted',
      label: 'Review Submitted',
      badgeClass: 'badge-success',
      description: `Daily review recorded and snapshot frozen on ${formatDate(review.created_at)} at ${new Date(review.created_at).toLocaleTimeString()}${review.is_correction ? ' (Corrected)' : ''}.`,
    };
  }

  // Count unconfirmed tasks awaiting user action
  const unconfirmedTasks = tasks.filter(
    (t) => t.status === 'pending' && !t.is_completed && t.status !== 'cancelled'
  );

  if (unconfirmedTasks.length > 0) {
    return {
      state: 'tasks_awaiting_confirmation',
      label: 'Awaiting Task Confirmation',
      badgeClass: 'badge-warning',
      description: `${unconfirmedTasks.length} commitment${unconfirmedTasks.length > 1 ? 's are' : ' is'} awaiting your outcome confirmation prior to midnight closing.`,
    };
  }

  return {
    state: 'not_submitted',
    label: 'Pending Evening Review',
    badgeClass: 'badge-primary',
    description: 'Schedule is clear or commitments are completed. Evening review will securely freeze today\'s progress snapshot.',
  };
}

/**
 * Render the Daily Closing Status Widget
 * @param {Object} options
 * @param {Object|null} options.review
 * @param {Object|null} options.dailyProgress
 * @param {Array<Object>} [options.tasks=[]]
 * @param {string} [options.timezone='UTC']
 * @returns {string} HTML string
 */
export function renderDailyClosingStatusCard({
  review = null,
  dailyProgress = null,
  tasks = [],
  timezone = 'UTC',
} = {}) {
  const status = determineClosingStatus({ review, dailyProgress, tasks });
  const { deadlineText } = getNextMidnightDeadline(timezone);

  return `
    <section class="card" style="border-left: 4px solid ${
      status.state === 'submitted'
        ? 'var(--color-success-solid)'
        : status.state === 'closed_automatically'
        ? 'var(--color-neutral-400)'
        : status.state === 'tasks_awaiting_confirmation'
        ? 'var(--color-warning-solid)'
        : 'var(--color-primary-600)'
    };" aria-label="Daily Closing Status">
      
      <div class="card-header" style="margin-bottom: var(--space-2);">
        <div class="flex items-center gap-2">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-primary-600);">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <h3 class="card-title" style="font-size: var(--font-size-md);">Daily Closing Status</h3>
        </div>
        <span class="badge ${status.badgeClass}">${status.label}</span>
      </div>

      <p class="text-xs text-secondary" style="line-height: 1.5; margin-bottom: var(--space-3);">
        ${status.description}
      </p>

      <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border-subtle); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3);" class="text-xs">
        <div>
          <span class="text-muted block" style="font-size: 11px;">Configured Timezone</span>
          <strong style="color: var(--color-text-primary); font-family: var(--font-mono);">${timezone}</strong>
        </div>
        <div>
          <span class="text-muted block" style="font-size: 11px;">Next Closing Deadline</span>
          <strong style="color: var(--color-primary-700);">${deadlineText}</strong>
        </div>
      </div>

      <div class="flex justify-between items-center text-xs text-muted" style="margin-top: var(--space-3); border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-3);">
        <span style="font-size: 11px;">Server-side scheduler is authoritative; closing never runs on browser timers.</span>
        <a href="#/progress" class="font-semibold" style="color: var(--color-primary-600); text-decoration: underline;">
          ${status.state === 'submitted' || status.state === 'closed_automatically' ? 'View Review Snapshot' : 'Open Daily Review'}
        </a>
      </div>
    </section>
  `;
}
