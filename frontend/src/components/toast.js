/**
 * Toast Stack Component
 */

export function renderToastContainer(notifications) {
  if (!notifications || notifications.length === 0) return '';

  return `
    <div class="toast-container" aria-live="polite">
      ${notifications
        .map(
          (n) => `
        <div class="toast" data-id="${n.id}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>${n.message}</span>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}
