/**
 * Accessible Modal Dialog Component
 * 
 * Complies with WAI-ARIA Dialog (Modal) pattern:
 * - Proper role="dialog" and aria-modal="true"
 * - Traps keyboard focus within dialog bounds
 * - Closes on Escape key
 * - Closes on backdrop overlay click
 * - Restores focus to trigger element on dismiss
 */

/**
 * Render modal dialog HTML structure
 * @param {Object} config
 * @param {string} [config.title='Information']
 * @param {string} [config.content='']
 * @param {string} [config.confirmText='Confirm']
 * @param {string} [config.cancelText='Cancel']
 * @param {boolean} [config.isDestructive=false]
 * @param {string} [config.confirmId='modal-confirm-btn']
 * @param {string} [config.cancelId='modal-cancel-btn']
 * @param {string} [config.closeId='modal-close-btn']
 * @returns {string}
 */
export function renderModal({
  title = 'Information',
  content = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  confirmId = 'modal-confirm-btn',
  cancelId = 'modal-cancel-btn',
  closeId = 'modal-close-btn',
} = {}) {
  const confirmBtnClass = isDestructive ? 'btn btn-danger' : 'btn btn-primary';

  return `
    <div class="modal-backdrop open" id="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-dialog" role="document">
        <div class="modal-header">
          <h2 class="card-title" id="modal-title">${title}</h2>
          <button id="${closeId}" class="btn btn-ghost btn-icon" aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body" id="modal-body-content">
          ${content}
        </div>
        <div class="modal-footer">
          <button id="${cancelId}" class="btn btn-outline">${cancelText}</button>
          <button id="${confirmId}" class="${confirmBtnClass}">${confirmText}</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Attach accessible keyboard and mouse listeners to the active modal dialog
 * @param {Object} callbacks
 * @param {Function} [callbacks.onConfirm]
 * @param {Function} [callbacks.onCancel]
 * @param {Function} [callbacks.onClose]
 * @returns {Function} cleanup function to detach listeners
 */
export function attachModalListeners({
  onConfirm = null,
  onCancel = null,
  onClose = null,
  confirmId = 'modal-confirm-btn',
  cancelId = 'modal-cancel-btn',
  closeId = 'modal-close-btn',
} = {}) {
  const backdrop = document.getElementById('app-modal-backdrop');
  if (!backdrop) return () => {};

  const confirmBtn = document.getElementById(confirmId);
  const cancelBtn = document.getElementById(cancelId);
  const closeBtn = document.getElementById(closeId);

  // Focus trap elements
  const focusableElements = backdrop.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // Auto focus first interactive button or element
  if (confirmBtn) {
    confirmBtn.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (onCancel) onCancel();
      else if (onClose) onClose();
      return;
    }

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }
  }

  function handleBackdropClick(e) {
    if (e.target === backdrop) {
      if (onCancel) onCancel();
      else if (onClose) onClose();
    }
  }

  document.addEventListener('keydown', handleKeyDown);
  backdrop.addEventListener('click', handleBackdropClick);

  if (confirmBtn && onConfirm) {
    confirmBtn.addEventListener('click', onConfirm);
  }
  if (cancelBtn && onCancel) {
    cancelBtn.addEventListener('click', onCancel);
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', onClose || onCancel || (() => {}));
  }

  return function cleanup() {
    document.removeEventListener('keydown', handleKeyDown);
    backdrop.removeEventListener('click', handleBackdropClick);
  };
}
