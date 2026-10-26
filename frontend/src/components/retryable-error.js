/**
 * Reusable Retryable Error Component
 * 
 * Safely presents error state to users:
 * - Human-readable explanation
 * - Error code badge
 * - Correlation ID tracking pill (if provided by backend)
 * - "Try Again" action trigger
 * - Never shows raw server tracebacks
 */

import { ApiError } from '../services/api-error.js';

export function renderRetryableError({
  error,
  retryButtonId = 'error-retry-btn',
  title = 'Unable to Load Data',
} = {}) {
  const isApiError = error instanceof ApiError;
  const userMessage = isApiError
    ? error.getUserFriendlyMessage()
    : (error && error.message) || 'An unexpected error occurred. Please try again.';

  const errorCode = isApiError ? error.code : 'CLIENT_ERROR';
  const requestId = isApiError ? error.requestId : null;
  const isRetryable = isApiError ? error.isRetryable : true;

  return `
    <div class="card" style="border-left: 4px solid var(--color-danger-solid); max-width: 600px; margin: 0 auto; width: 100%;" role="alert">
      <div class="flex items-start gap-4">
        <div style="width: 40px; height: 40px; border-radius: var(--radius-md); background-color: var(--color-danger-bg); color: var(--color-danger-solid); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <div class="flex flex-col gap-2" style="flex: 1;">
          <div class="flex items-center justify-between">
            <h3 style="font-size: var(--font-size-md); font-weight: var(--font-weight-bold);">${title}</h3>
            <span class="badge badge-danger">${errorCode}</span>
          </div>

          <p class="text-sm" style="color: var(--color-text-secondary); line-height: 1.5;">${userMessage}</p>

          ${
            requestId
              ? `
            <div class="text-xs text-muted" style="margin-top: 2px;">
              <span>Reference ID: </span>
              <code style="font-family: var(--font-mono); font-size: 11px; background: var(--color-surface-hover); padding: 2px 6px; border-radius: var(--radius-xs);">${requestId}</code>
            </div>
          `
              : ''
          }

          ${
            isRetryable
              ? `
            <div style="margin-top: var(--space-3);">
              <button id="${retryButtonId}" class="btn btn-outline btn-sm">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                <span>Try Again</span>
              </button>
            </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
  `;
}
