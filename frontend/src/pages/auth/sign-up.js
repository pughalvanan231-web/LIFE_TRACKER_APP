/**
 * Sign Up / Registration Page Component
 */

import { renderAuthCardLayout } from './auth-card-layout.js';
import { appConfig } from '../../services/config.js';

export function renderSignUpPage({ error = null, isSubmitting = false } = {}) {
  const isConfigured = appConfig.isFirebaseConfigured;

  const content = `
    ${
      !isConfigured
        ? `
      <div class="card" style="background-color: var(--color-warning-bg); border-color: var(--color-warning-border); padding: var(--space-4); margin-bottom: var(--space-5);">
        <p class="text-xs" style="color: var(--color-warning-text); line-height: 1.4;">
          <strong>Firebase Setup Required:</strong> Set valid Firebase client credentials in <code>frontend/.env.local</code> to enable live registration.
        </p>
      </div>
    `
        : ''
    }

    ${
      error
        ? `
      <div class="card" style="background-color: var(--color-danger-bg); border-color: var(--color-danger-border); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4);" role="alert">
        <p class="text-xs" style="color: var(--color-danger-text); font-weight: 500;">${error}</p>
      </div>
    `
        : ''
    }

    <form id="sign-up-form" class="flex flex-col gap-4" novalidate>
      <div class="form-group">
        <label class="form-label" for="signup-name">Full Name</label>
        <input
          id="signup-name"
          type="text"
          class="form-input"
          placeholder="e.g. Alex Morgan"
          autocomplete="name"
          required
          ${isSubmitting ? 'disabled' : ''}
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="signup-email">Email Address</label>
        <input
          id="signup-email"
          type="email"
          class="form-input"
          placeholder="name@example.com"
          autocomplete="email"
          required
          ${isSubmitting ? 'disabled' : ''}
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="signup-password">Password</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input
            id="signup-password"
            type="password"
            class="form-input"
            placeholder="At least 6 characters"
            autocomplete="new-password"
            required
            minlength="6"
            style="padding-right: 42px;"
            ${isSubmitting ? 'disabled' : ''}
          />
          <button
            type="button"
            id="toggle-signup-password"
            class="btn btn-ghost btn-icon"
            style="position: absolute; right: 4px; padding: 6px; color: var(--color-text-muted);"
            aria-label="Toggle password visibility"
          >
            <svg id="eye-icon-signup" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <span class="text-xs text-muted">Must be at least 6 characters long.</span>
      </div>

      <div class="form-group">
        <label class="form-label" for="signup-confirm-password">Confirm Password</label>
        <input
          id="signup-confirm-password"
          type="password"
          class="form-input"
          placeholder="Re-enter your password"
          autocomplete="new-password"
          required
          ${isSubmitting ? 'disabled' : ''}
        />
      </div>

      <div style="margin-top: var(--space-2);">
        <button
          type="submit"
          id="signup-submit-btn"
          class="btn btn-primary"
          style="width: 100%; padding: 0.75rem;"
          ${isSubmitting || !isConfigured ? 'disabled' : ''}
        >
          ${isSubmitting ? 'Creating Account...' : 'Create Account'}
        </button>
      </div>
    </form>
  `;

  const footerLinks = `
    <span>Already have an account? </span>
    <a href="#/sign-in" class="font-semibold" style="color: var(--color-primary-600);">Sign in</a>
  `;

  return renderAuthCardLayout({
    title: 'Begin Your Journey',
    subtitle: 'Create a personal account to align goals, daily actions, and habits.',
    content,
    footerLinks,
  });
}
