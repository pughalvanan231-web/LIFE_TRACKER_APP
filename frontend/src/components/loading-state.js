/**
 * Reusable Loading State Component
 */

export function renderLoadingState({ message = 'Loading your commitments...', size = 'md' } = {}) {
  const dimension = size === 'sm' ? 20 : size === 'lg' ? 44 : 32;

  return `
    <div class="loading-state-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--space-8); gap: var(--space-3);" role="status" aria-live="polite">
      <div style="width: ${dimension}px; height: ${dimension}px; border: 3px solid var(--color-border-subtle); border-top-color: var(--color-primary-600); border-radius: var(--radius-full); animation: spin 800ms linear infinite;"></div>
      <p class="text-xs text-muted" style="letter-spacing: 0.02em;">${message}</p>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;
}
