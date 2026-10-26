/**
 * Authentication Centered Card Layout
 * Visually consistent with Life Goals AI warm neutral design system.
 */

export function renderAuthCardLayout({ title, subtitle, content, footerLinks = '' }) {
  return `
    <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--space-6); background-color: var(--color-surface-ground);">
      <!-- Brand Header -->
      <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: var(--space-6); text-align: center;">
        <div style="width: 48px; height: 48px; border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600)); display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); margin-bottom: var(--space-3);">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
        </div>
        <h1 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-extrabold); letter-spacing: -0.02em;">Life Goals AI</h1>
        <p class="text-xs text-muted" style="margin-top: 2px;">Mindful personal productivity & purpose-driven goal tracking</p>
      </div>

      <!-- Auth Card Box -->
      <div class="card" style="max-width: 440px; width: 100%; padding: var(--space-8); box-shadow: var(--shadow-lg); border-color: var(--color-border-subtle); background-color: var(--color-surface-card);">
        <div style="margin-bottom: var(--space-6);">
          <h2 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-bold);">${title}</h2>
          <p class="text-xs text-muted" style="margin-top: 4px;">${subtitle}</p>
        </div>

        ${content}

        ${
          footerLinks
            ? `
          <div style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border-subtle); text-align: center; font-size: var(--font-size-xs); color: var(--color-text-muted);">
            ${footerLinks}
          </div>
        `
            : ''
        }
      </div>

      <!-- Mindful Footer Quote -->
      <div style="margin-top: var(--space-8); text-align: center; max-width: 380px;">
        <p class="text-xs text-muted" style="line-height: 1.5; font-style: italic;">
          "Small daily disciplines repeated consistently lead to profound long-term transformations."
        </p>
      </div>
    </div>
  `;
}
