/**
 * Reusable Empty State Component
 */

export function renderEmptyState({
  title = 'No items found',
  description = 'Get started by creating your first entry.',
  actionText = null,
  actionId = null,
  iconSvg = null,
} = {}) {
  const defaultIcon = `
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  `;

  return `
    <div class="empty-state" role="region" aria-label="${title}">
      <div class="empty-state-icon">
        ${iconSvg || defaultIcon}
      </div>
      <h3 class="empty-state-title">${title}</h3>
      <p class="empty-state-description">${description}</p>
      ${
        actionText && actionId
          ? `<button id="${actionId}" class="btn btn-primary">${actionText}</button>`
          : ''
      }
    </div>
  `;
}
