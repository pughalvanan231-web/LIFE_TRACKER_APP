/**
 * Password Reset Page Component
 */

import { renderAuthCardLayout } from './auth-card-layout.js';
import { appConfig } from '../../services/config.js';

export function renderResetPasswordPage({ error = null, isSuccess = false, isSubmitting = false } = {}) {
  const isConfigured = appConfig.isFirebaseConfigured;

  const content = `
    ${
      !isConfigured
        ? `
      <div class="card" style="background-color: var(--color-warning-bg); border-color: var(--color-warning-border); padding: var(--space-4); margin-bottom: var(--space-5);">
        <p class="text-xs" style="color: var(--color-warning-text); line-height: 1.4;">
          <strong>Firebase Setup Required:</strong> Set valid Firebase client credentials in <code>frontend/.env.local</code> to enable password reset emails.
        </p>
      </div>
    `
        : ''
    }

    ${
      isSuccess
        ? `
      <div class="card" style="background-color: var(--color-success-bg); border-color: var(--color-success-border); padding: var(--space-5); text-align: center;">
        <div style="width: 44px; height: 44px; border-radius: var(--radius-full); background: var(--color-success-solid); color: white; display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-3);">
          ✓
        </div>
        <h3 style="font-size: var(--font-size-md); font-weight: 700; color: var(--color-success-text); margin-bottom: var(--space-1);">Instructions Sent</h3>
        <p class="text-xs" style="color: var(--color-success-text); line-height: 1.5;">
          A password reset link has been dispatched to your email address. Please follow the instructions to securely reset your credentials.
        </p>
        <div style="margin-top: var(--space-4);">
          <a href="#/sign-in" class="btn btn-outline btn-sm">Return to Sign In</a>
        </div>
      </div>
    `
        : `
      ${
        error
          ? `
        <div class="card" style="background-color: var(--color-danger-bg); border-color: var(--color-danger-border); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4);" role="alert">
          <p class="text-xs" style="color: var(--color-danger-text); font-weight: 500;">${error}</p>
        </div>
      `
          : ''
      }

      <form id="reset-password-form" class="flex flex-col gap-4" novalidate>
        <div class="form-group">
          <label class="form-label" for="reset-email">Account Email</label>
          <input
            id="reset-email"
            type="email"
            class="form-input"
            placeholder="name@example.com"
            autocomplete="email"
            required
            ${isSubmitting ? 'disabled' : ''}
          />
          <span class="text-xs text-muted">We will send a secure link to reset your account credentials.</span>
        </div>

        <div style="margin-top: var(--space-2);">
          <button
            type="submit"
            id="reset-submit-btn"
            class="btn btn-primary"
            style="width: 100%; padding: 0.75rem;"
            ${isSubmitting || !isConfigured ? 'disabled' : ''}
          >
            ${isSubmitting ? 'Sending Link...' : 'Send Password Reset Link'}
          </button>
        </div>
      </form>
    `
    }
  `;

  const footerLinks = `
    <a href="#/sign-in" class="font-semibold" style="color: var(--color-primary-600);">← Back to Sign In</a>
  `;

  return renderAuthCardLayout({
    title: 'Reset Password',
    subtitle: 'Enter your registered email address to receive recovery instructions.',
    content,
    footerLinks,
  });
}
