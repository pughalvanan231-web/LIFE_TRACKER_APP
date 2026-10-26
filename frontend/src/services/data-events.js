/**
 * Data Event Bus for Cache Invalidation & Automatic UI Refresh
 * 
 * Enables services to notify active UI views when mutations succeed (e.g. creating/deleting a task,
 * updating a goal, submitting a review) so visible data automatically stays in sync.
 */

class DataEventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to a specific data event (e.g. 'goals:changed', 'tasks:changed')
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Emit a data event
   * @param {string} event - Event name
   * @param {*} [payload] - Optional event payload
   */
  emit(event, payload = null) {
    const set = this.listeners.get(event);
    if (set) {
      for (const callback of set) {
        try {
          callback(payload);
        } catch (err) {
          console.error(`[DataEventBus] Error in listener for "${event}":`, err);
        }
      }
    }
  }

  /**
   * Clear all listeners (for test cleanup)
   */
  clear() {
    this.listeners.clear();
  }
}

export const DataEvents = new DataEventBus();

export const DATA_TOPICS = {
  GOALS_CHANGED: 'goals:changed',
  MILESTONES_CHANGED: 'milestones:changed',
  TASKS_CHANGED: 'tasks:changed',
  DAILY_PLANS_CHANGED: 'daily-plans:changed',
  REVIEWS_CHANGED: 'reviews:changed',
  PROGRESS_CHANGED: 'progress:changed',
  SETTINGS_CHANGED: 'settings:changed',
  PROFILE_CHANGED: 'profile:changed',
};
