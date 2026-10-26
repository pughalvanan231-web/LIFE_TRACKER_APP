/**
 * Toast Notification Primitive
 * 
 * Accessible, animated notifications for application state changes (success, error, warning, info).
 */

class ToastManager {
  constructor() {
    this.toasts = [];
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.toasts);
    }
  }

  /**
   * Display a toast notification
   * @param {Object} options
   * @param {string} options.message - Message to display
   * @param {'success'|'error'|'warning'|'info'} [options.type='info'] - Severity variant
   * @param {number} [options.duration=4000] - Duration in ms before auto-dismiss (0 for sticky)
   * @returns {string} Toast ID
   */
  show({ message, type = 'info', duration = 4000 }) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toastItem = { id, message, type, duration };
    this.toasts.push(toastItem);
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  dismiss(id) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

export const toastManager = new ToastManager();

/**
 * Render Toast Container HTML
 * @param {Array<Object>} [notifications]
 * @returns {string} HTML string
 */
export function renderToastContainer(notifications = null) {
  const items = notifications !== null ? notifications : toastManager.toasts;
  if (!items || items.length === 0) return '';

  return `
    <div class="toast-container" aria-live="polite" role="region" aria-label="Notifications">
      ${items
        .map((n) => {
          const typeClass =
            n.type === 'success'
              ? 'toast-success'
              : n.type === 'error'
              ? 'toast-error'
              : n.type === 'warning'
              ? 'toast-warning'
              : 'toast-info';

          return `
            <div class="toast ${typeClass}" data-id="${n.id}" role="status">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                ${
                  n.type === 'success'
                    ? '<polyline points="20 6 9 17 4 12"/>'
                    : n.type === 'error'
                    ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
                    : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
                }
              </svg>
              <span>${n.message}</span>
              <button class="toast-dismiss-btn" data-toast-id="${n.id}" aria-label="Dismiss notification" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 8px;opacity:0.8;">
                &times;
              </button>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}
