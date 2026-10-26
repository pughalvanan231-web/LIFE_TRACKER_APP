/**
 * Reports Data Access Service
 * 
 * Interacts with Flask reporting endpoints:
 * - GET /api/v1/reports/weekly (Weekly performance across 7 days)
 * - GET /api/v1/reports/monthly (Monthly performance for YYYY-MM)
 * - GET /api/v1/reports/custom (Custom date range performance report)
 */

import { api } from './api-client.js';

class ReportsService {
  constructor() {
    this._activeAbortControllers = new Map();
  }

  cancelPendingReport(tag) {
    if (this._activeAbortControllers.has(tag)) {
      this._activeAbortControllers.get(tag).abort();
      this._activeAbortControllers.delete(tag);
    }
  }

  /**
   * Retrieve weekly performance report
   * @param {Object} [options]
   * @param {string} [options.endDate] - YYYY-MM-DD
   * @param {string} [options.timezone='UTC'] - IANA timezone
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getWeeklyReport({ endDate = null, timezone = 'UTC', signal = null } = {}) {
    if (!signal) {
      this.cancelPendingReport('weekly');
      const controller = new AbortController();
      this._activeAbortControllers.set('weekly', controller);
      signal = controller.signal;
    }

    try {
      const params = { timezone };
      if (endDate) params.end_date = endDate;

      const response = await api.get('/reports/weekly', {
        params,
        headers: { 'X-User-Timezone': timezone },
        signal,
      });
      return response.data;
    } finally {
      this._activeAbortControllers.delete('weekly');
    }
  }

  /**
   * Retrieve monthly performance report
   * @param {Object} [options]
   * @param {string} [options.month] - YYYY-MM
   * @param {string} [options.timezone='UTC']
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getMonthlyReport({ month = null, timezone = 'UTC', signal = null } = {}) {
    if (!signal) {
      this.cancelPendingReport('monthly');
      const controller = new AbortController();
      this._activeAbortControllers.set('monthly', controller);
      signal = controller.signal;
    }

    try {
      const params = { timezone };
      if (month) params.month = month;

      const response = await api.get('/reports/monthly', {
        params,
        headers: { 'X-User-Timezone': timezone },
        signal,
      });
      return response.data;
    } finally {
      this._activeAbortControllers.delete('monthly');
    }
  }

  /**
   * Retrieve custom date range performance report
   * @param {Object} options
   * @param {string} options.startDate - YYYY-MM-DD
   * @param {string} options.endDate - YYYY-MM-DD
   * @param {string} [options.timezone='UTC']
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getCustomReport({ startDate, endDate, timezone = 'UTC', signal = null } = {}) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required for custom reports');
    }

    if (!signal) {
      this.cancelPendingReport('custom');
      const controller = new AbortController();
      this._activeAbortControllers.set('custom', controller);
      signal = controller.signal;
    }

    try {
      const response = await api.get('/reports/custom', {
        params: {
          start_date: startDate,
          end_date: endDate,
          timezone,
        },
        headers: { 'X-User-Timezone': timezone },
        signal,
      });
      return response.data;
    } finally {
      this._activeAbortControllers.delete('custom');
    }
  }
}

export const reportsService = new ReportsService();
