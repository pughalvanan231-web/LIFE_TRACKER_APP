/**
 * Reusable Confirmation Dialog Primitive
 * 
 * Provides standard interactive confirmation modals for destructive or critical actions
 * (e.g. deleting a goal, resetting a review, discarding edits).
 */

import { renderModal, attachModalListeners } from './modal.js';

/**
 * Render HTML markup for a confirmation dialog
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmText='Confirm']
 * @param {string} [options.cancelText='Cancel']
 * @param {boolean} [options.isDestructive=false]
 * @returns {string} HTML string
 */
export function renderConfirmDialog({
  title = 'Are you sure?',
  message = 'Please confirm this action to proceed.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
} = {}) {
  const content = `
    <div class="confirm-dialog-body" style="display: flex; gap: var(--space-4); align-items: flex-start;">
      <div style="width: 40px; height: 40px; border-radius: var(--radius-full); background: ${
        isDestructive ? 'var(--color-danger-bg)' : 'var(--color-surface-hover)'
      }; color: ${
    isDestructive ? 'var(--color-danger-solid)' : 'var(--color-primary-600)'
  }; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          ${
            isDestructive
              ? `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                 <line x1="12" y1="9" x2="12" y2="13"/>
                 <line x1="12" y1="17" x2="12.01" y2="17"/>`
              : `<circle cx="12" cy="12" r="10"/>
                 <line x1="12" y1="16" x2="12" y2="12"/>
                 <line x1="12" y1="8" x2="12.01" y2="8"/>`
          }
        </svg>
      </div>
      <div>
        <p class="text-sm" style="color: var(--color-text-secondary); line-height: 1.5;">${message}</p>
      </div>
    </div>
  `;

  return renderModal({
    title,
    content,
    confirmText,
    cancelText,
    isDestructive,
    confirmId: 'confirm-dialog-ok-btn',
    cancelId: 'confirm-dialog-cancel-btn',
    closeId: 'confirm-dialog-close-btn',
  });
}

/**
 * Mounts confirmation dialog dynamically into document.body and returns a Promise resolving to boolean
 * @param {Object} options
 * @returns {Promise<boolean>} resolves true if confirmed, false if cancelled/closed
 */
export function openConfirmDialog({
  title = 'Are you sure?',
  message = 'Please confirm this action to proceed.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
} = {}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(true);
      return;
    }

    const host = document.createElement('div');
    host.id = 'confirm-dialog-host';
    host.innerHTML = renderConfirmDialog({
      title,
      message,
      confirmText,
      cancelText,
      isDestructive,
    });
    document.body.appendChild(host);

    let cleanup = null;

    const closeDialog = (result) => {
      if (cleanup) cleanup();
      if (host.parentNode) host.parentNode.removeChild(host);
      resolve(result);
    };

    cleanup = attachModalListeners({
      onConfirm: () => closeDialog(true),
      onCancel: () => closeDialog(false),
      onClose: () => closeDialog(false),
      confirmId: 'confirm-dialog-ok-btn',
      cancelId: 'confirm-dialog-cancel-btn',
      closeId: 'confirm-dialog-close-btn',
    });
  });
}
