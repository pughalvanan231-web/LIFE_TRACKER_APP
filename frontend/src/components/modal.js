/**
 * Modal Dialog Component
 */

export function renderModal(modalConfig) {
  if (!modalConfig) return '';

  const { title = 'Information', content = '', confirmText = 'Confirm', cancelText = 'Cancel', onConfirm = null } = modalConfig;

  return `
    <div class="modal-backdrop open" id="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-dialog">
        <div class="modal-header">
          <h2 class="card-title" id="modal-title">${title}</h2>
          <button id="modal-close-btn" class="btn btn-ghost btn-icon" aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          <button id="modal-cancel-btn" class="btn btn-outline">${cancelText}</button>
          <button id="modal-confirm-btn" class="btn btn-primary">${confirmText}</button>
        </div>
      </div>
    </div>
  `;
}
