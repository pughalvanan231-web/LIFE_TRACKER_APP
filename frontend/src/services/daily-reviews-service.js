/**
 * Daily Reviews Data Access Service
 * 
 * Interacts with Flask daily review endpoints:
 * - POST /api/v1/reviews (Record or correct a daily review and freeze snapshots)
 * - GET  /api/v1/reviews (List recent daily reviews)
 * - GET  /api/v1/reviews/:date (Retrieve review and frozen task snapshot for date)
 * - GET  /api/v1/reviews/:date/task-history (Retrieve historical task records)
 */

import { api } from './api-client.js';
import { DataEvents, DATA_TOPICS } from './data-events.js';

/**
 * @typedef {Object} DailyReviewCreatePayload
 * @property {string} date - Calendar date YYYY-MM-DD
 * @property {string} [summary] - Overall summary
 * @property {string} [wins] - Accomplishments
 * @property {string} [challenges] - Obstacles faced
 * @property {number} [rating=3] - 1 to 5
 * @property {boolean} [is_correction=false] - Deliberate correction
 * @property {string} [timezone='UTC'] - IANA timezone
 */

class DailyReviewsService {
  constructor() {
    this._inFlightMutations = new Set();
  }

  /**
   * Submit or correct a daily review
   * @param {DailyReviewCreatePayload} payload
   * @returns {Promise<Object>}
   */
  async submitReview(payload) {
    if (!payload || !payload.date) {
      throw new Error('Review date is required');
    }

    const mutationKey = `submit:${payload.date}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Review submission for this date is already processing.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.post('/reviews', payload);
      DataEvents.emit(DATA_TOPICS.REVIEWS_CHANGED, { action: 'saved', review: response.data });
      DataEvents.emit(DATA_TOPICS.PROGRESS_CHANGED, { action: 'review_recorded', date: payload.date });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * List recent daily reviews
   * @param {Object} [options]
   * @param {number} [options.limit=30]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Array<Object>>}
   */
  async listReviews({ limit = 30, signal = null } = {}) {
    const response = await api.get('/reviews', {
      params: { limit },
      signal,
    });
    return response.data || [];
  }

  /**
   * Retrieve daily review and frozen task snapshot for date
   * @param {string} date - YYYY-MM-DD
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getReview(date, { signal = null } = {}) {
    if (!date) throw new Error('date is required');
    const response = await api.get(`/reviews/${encodeURIComponent(date)}`, { signal });
    return response.data;
  }

  /**
   * Retrieve task historical records and snapshots for a specific date
   * @param {string} date - YYYY-MM-DD
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Array<Object>>}
   */
  async getTaskHistory(date, { signal = null } = {}) {
    if (!date) throw new Error('date is required');
    const response = await api.get(`/reviews/${encodeURIComponent(date)}/task-history`, { signal });
    return response.data || [];
  }
}

export const dailyReviewsService = new DailyReviewsService();
