/**
 * Sign In Page Component
 */

import { renderAuthCardLayout } from './auth-card-layout.js';
import { appConfig } from '../../services/config.js';

export function renderSignInPage({ error = null, isSubmitting = false } = {}) {
  const isConfigured = appConfig.isFirebaseConfigured;

  const content = `
    ${
      !isConfigured
        ? `
      <div class="card" style="background-color: var(--color-warning-bg); border-color: var(--color-warning-border); padding: var(--space-4); margin-bottom: var(--space-5);">
        <div class="flex items-start gap-3">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--color-warning-text)" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <h4 style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-warning-text);">Firebase Setup Required</h4>
            <p class="text-xs" style="color: var(--color-warning-text); margin-top: 2px; line-height: 1.4;">
              Authentication credentials are not configured. Copy <code>frontend/.env.example</code> to <code>.env.local</code> and set your client API keys.
            </p>
          </div>
        </div>
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

    <form id="sign-in-form" class="flex flex-col gap-4" novalidate>
      <div class="form-group">
        <label class="form-label" for="signin-email">Email Address</label>
        <input
          id="signin-email"
          type="email"
          class="form-input"
          placeholder="name@example.com"
          autocomplete="email"
          required
          ${isSubmitting ? 'disabled' : ''}
        />
      </div>

      <div class="form-group">
        <div class="flex justify-between items-center">
          <label class="form-label" for="signin-password">Password</label>
          <a href="#/reset-password" class="text-xs text-muted" style="text-decoration: underline;">Forgot password?</a>
        </div>
        <div style="position: relative; display: flex; align-items: center;">
          <input
            id="signin-password"
            type="password"
            class="form-input"
            placeholder="Enter your password"
            autocomplete="current-password"
            required
            style="padding-right: 42px;"
            ${isSubmitting ? 'disabled' : ''}
          />
          <button
            type="button"
            id="toggle-signin-password"
            class="btn btn-ghost btn-icon"
            style="position: absolute; right: 4px; padding: 6px; color: var(--color-text-muted);"
            aria-label="Toggle password visibility"
          >
            <svg id="eye-icon-signin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>

      <div style="margin-top: var(--space-2);">
        <button
          type="submit"
          id="signin-submit-btn"
          class="btn btn-primary"
          style="width: 100%; padding: 0.75rem;"
          ${isSubmitting || !isConfigured ? 'disabled' : ''}
        >
          ${isSubmitting ? 'Signing In...' : 'Sign In'}
        </button>
      </div>
    </form>
  `;

  const footerLinks = `
    <span>Don't have an account? </span>
    <a href="#/sign-up" class="font-semibold" style="color: var(--color-primary-600);">Create one now</a>
  `;

  return renderAuthCardLayout({
    title: 'Welcome Back',
    subtitle: 'Sign in to access your goals, daily plans, and reviews.',
    content,
    footerLinks,
  });
}
