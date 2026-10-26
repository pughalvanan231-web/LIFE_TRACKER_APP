/**
 * Daily Review & Progress Page Component
 */

export function renderProgressPage(demoMode) {
  return `
    <div class="page-container">
      <div>
        <h2>Daily Review & Reflection</h2>
        <p class="text-sm text-muted">Mindfully reflect on your daily wins, note obstacles, and secure your frozen progress snapshot.</p>
      </div>

      <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: var(--space-6);" class="grid-2">
        <!-- Review Submission Card -->
        <section class="card flex flex-col gap-5">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <h3 class="card-title">Evening Review Submission</h3>
              <p class="card-subtitle">Reflect before midnight to preserve confirmed completions.</p>
            </div>
            <span class="badge badge-primary">Daily Closing</span>
          </div>

          <div class="form-group">
            <label class="form-label">Day Satisfaction Rating</label>
            <div class="flex gap-2">
              ${[1, 2, 3, 4, 5]
                .map(
                  (star) => `
                <button class="btn btn-outline btn-sm" style="font-size: 16px; padding: 0.4rem 0.8rem;" title="${star} Star">
                  ${'★'.repeat(star)}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Wins & Accomplishments</label>
            <textarea class="form-textarea" rows="3" placeholder="What went well today? What accomplishments are you proud of?">${demoMode ? 'Maintained 8km tempo pace and completed novel chapter outline without distractions.' : ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Challenges & Friction</label>
            <textarea class="form-textarea" rows="2" placeholder="What obstacles slowed you down? What will you adjust tomorrow?">${demoMode ? 'Afternoon context switching between emails disrupted deep work block.' : ''}</textarea>
          </div>

          <div class="flex justify-between items-center" style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-4);">
            <div class="text-xs text-muted">
              <span>Server-side midnight closing will freeze unconfirmed tasks as unverified.</span>
            </div>
            <button id="save-review-btn" class="btn btn-primary">Save Daily Review</button>
          </div>
        </section>

        <!-- Informational / Progress Formula Card -->
        <div class="flex flex-col gap-5">
          <section class="card flex flex-col gap-4">
            <h3 class="card-title">Progress Integrity Rules</h3>
            <p class="text-sm text-secondary">
              Life Goals AI uses rigorous, deterministic progress calculation formulas:
            </p>

            <div style="background-color: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-4); border: 1px solid var(--color-border-subtle); font-family: var(--font-mono); font-size: var(--font-size-xs);">
              Daily Completion % = (Completed Tasks Due / Total Tasks Due) × 100
            </div>

            <ul class="flex flex-col gap-2 text-xs text-muted" style="list-style: disc; padding-left: var(--space-4);">
              <li>Unverified tasks at midnight are <strong>never</strong> counted as completed.</li>
              <li>Rescheduling tasks preserves original historical snapshots.</li>
              <li>Goal milestones carry relative weights ensuring accurate goal completion.</li>
            </ul>
          </section>

          <!-- Soft Pastel Sticky Note -->
          <section class="sticky-note sage">
            <h4 class="font-bold text-xs" style="text-transform: uppercase; margin-bottom: var(--space-1);">Mindful Habit</h4>
            <p class="text-sm">
              Reviewing your commitments daily reinforces psychological accountability and prevents unverified backlog accumulation.
            </p>
          </section>
        </div>
      </div>
    </div>
  `;
}
