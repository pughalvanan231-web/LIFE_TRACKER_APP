/**
 * Progress Data Access Service
 * 
 * Interacts with Flask progress calculation endpoints:
 * - GET  /api/v1/progress/daily (or /api/v1/progress/daily/:date)
 * - GET  /api/v1/progress/goals/short-term (Weighted milestone progress)
 * - GET  /api/v1/progress/goals/long-term (Weighted milestone progress)
 * - POST /api/v1/progress/snapshot (Compute & persist metrics snapshot)
 */

import { api } from './api-client.js';
import { DataEvents, DATA_TOPICS } from './data-events.js';

class ProgressService {
  constructor() {
    this._inFlightSnapshot = false;
  }

  /**
   * Retrieve daily task completion progress for dashboard
   * Formula: (completed tasks due / all tasks due) * 100
   * 
   * @param {Object} [options]
   * @param {string} [options.date] - Optional date YYYY-MM-DD (defaults to today)
   * @param {string} [options.timezone='UTC'] - User IANA timezone
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getDailyProgress({ date = null, timezone = 'UTC', signal = null } = {}) {
    const endpoint = date ? `/progress/daily/${encodeURIComponent(date)}` : '/progress/daily';
    const response = await api.get(endpoint, {
      params: { timezone },
      headers: { 'X-User-Timezone': timezone },
      signal,
    });
    return response.data;
  }

  /**
   * Retrieve progress across all short-term goals
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getShortTermGoalsProgress({ signal = null } = {}) {
    const response = await api.get('/progress/goals/short-term', { signal });
    return response.data;
  }

  /**
   * Retrieve progress across all long-term goals
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getLongTermGoalsProgress({ signal = null } = {}) {
    const response = await api.get('/progress/goals/long-term', { signal });
    return response.data;
  }

  /**
   * Compute and persist progress snapshot
   * @returns {Promise<Object>}
   */
  async computeSnapshot() {
    if (this._inFlightSnapshot) {
      throw new Error('Snapshot computation is already in progress.');
    }

    this._inFlightSnapshot = true;

    try {
      const response = await api.post('/progress/snapshot');
      DataEvents.emit(DATA_TOPICS.PROGRESS_CHANGED, { action: 'snapshot_created', snapshot: response.data });
      return response.data;
    } finally {
      this._inFlightSnapshot = false;
    }
  }
}

export const progressService = new ProgressService();
