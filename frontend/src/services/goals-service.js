/**
 * Goals Data Access Service
 * 
 * Interacts with Flask goals endpoints:
 * - GET    /api/v1/goals (List goals with multi-factor filters and pagination)
 * - GET    /api/v1/goals/:id (Retrieve goal details)
 * - POST   /api/v1/goals (Create new user goal)
 * - PATCH  /api/v1/goals/:id (Update properties, target dates, or status)
 * - DELETE /api/v1/goals/:id (Safe archival or ?permanent=true deletion)
 */

import { api } from './api-client.js';
import { DataEvents, DATA_TOPICS } from './data-events.js';

/**
 * @typedef {'career'|'health'|'finance'|'relationships'|'personal_growth'|'lifestyle'|'other'} GoalCategory
 * @typedef {'active'|'completed'|'paused'|'archived'} GoalStatus
 * @typedef {'low'|'medium'|'high'} GoalPriority
 * @typedef {'short_term'|'medium_term'|'long_term'} GoalTimeframe
 * 
 * @typedef {Object} GoalCreatePayload
 * @property {string} title
 * @property {string} [description]
 * @property {GoalCategory} [category='personal_growth']
 * @property {GoalPriority} [priority='medium']
 * @property {GoalTimeframe} [timeframe='short_term']
 * @property {string} [start_date] - YYYY-MM-DD
 * @property {string} [target_date] - YYYY-MM-DD
 * @property {number} [target_value]
 * @property {number} [current_value]
 * @property {string} [unit]
 * 
 * @typedef {Object} GoalUpdatePayload
 * @property {string} [title]
 * @property {string} [description]
 * @property {GoalCategory} [category]
 * @property {GoalPriority} [priority]
 * @property {GoalTimeframe} [timeframe]
 * @property {GoalStatus} [status]
 * @property {string} [target_date]
 * @property {number} [target_value]
 * @property {number} [current_value]
 * @property {string} [unit]
 * @property {string} [date_change_reason]
 */

class GoalsService {
  constructor() {
    this._inFlightMutations = new Set();
    this._activeAbortControllers = new Map();
  }

  /**
   * Cancel any pending fetch operation matching an operation tag
   * @param {string} tag
   */
  cancelPendingRequest(tag) {
    if (this._activeAbortControllers.has(tag)) {
      this._activeAbortControllers.get(tag).abort();
      this._activeAbortControllers.delete(tag);
    }
  }

  /**
   * List goals with multi-field filtering, sorting, and pagination
   * @param {Object} [filters]
   * @param {GoalStatus} [filters.status]
   * @param {GoalCategory} [filters.category]
   * @param {GoalTimeframe} [filters.timeframe]
   * @param {GoalPriority} [filters.priority]
   * @param {string} [filters.sort_by='created_at']
   * @param {'asc'|'desc'} [filters.sort_order='desc']
   * @param {number} [filters.page=1]
   * @param {number} [filters.limit=20]
   * @param {AbortSignal} [filters.signal]
   * @returns {Promise<{ items: Array<Object>, total: number, page: number, limit: number, total_pages: number }>}
   */
  async listGoals(filters = {}) {
    const {
      status,
      category,
      timeframe,
      priority,
      sort_by = 'created_at',
      sort_order = 'desc',
      page = 1,
      limit = 20,
      signal = null,
    } = filters;

    // Auto-cancel previous uncompleted list request if called without an explicit external signal
    if (!signal) {
      this.cancelPendingRequest('listGoals');
      const controller = new AbortController();
      this._activeAbortControllers.set('listGoals', controller);
      filters.signal = controller.signal;
    }

    try {
      const queryParams = { sort_by, sort_order, page, limit };
      if (status) queryParams.status = status;
      if (category) queryParams.category = category;
      if (timeframe) queryParams.timeframe = timeframe;
      if (priority) queryParams.priority = priority;

      const response = await api.get('/goals', {
        params: queryParams,
        signal: filters.signal,
      });

      return response.data;
    } finally {
      this._activeAbortControllers.delete('listGoals');
    }
  }

  /**
   * Retrieve single goal by ID
   * @param {string} goalId
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getGoal(goalId, { signal = null } = {}) {
    if (!goalId) throw new Error('goalId is required');
    const response = await api.get(`/goals/${encodeURIComponent(goalId)}`, { signal });
    return response.data;
  }

  /**
   * Create a new goal.
   * Prevents duplicate in-flight submissions with identical payload signatures.
   * 
   * @param {GoalCreatePayload} payload
   * @returns {Promise<Object>}
   */
  async createGoal(payload) {
    if (!payload || !payload.title) {
      throw new Error('Goal title is required');
    }

    const mutationKey = `create:${payload.title.trim().toLowerCase()}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Goal creation is already in progress. Please wait.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.post('/goals', payload);
      DataEvents.emit(DATA_TOPICS.GOALS_CHANGED, { action: 'created', goal: response.data });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Update goal details, target dates, or status
   * @param {string} goalId
   * @param {GoalUpdatePayload} payload
   * @returns {Promise<Object>}
   */
  async updateGoal(goalId, payload) {
    if (!goalId) throw new Error('goalId is required');

    const mutationKey = `update:${goalId}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('An update for this goal is already processing.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.patch(`/goals/${encodeURIComponent(goalId)}`, payload);
      DataEvents.emit(DATA_TOPICS.GOALS_CHANGED, { action: 'updated', goal: response.data });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Archive or permanently delete a goal
   * @param {string} goalId
   * @param {Object} [options]
   * @param {boolean} [options.permanent=false]
   * @returns {Promise<Object>}
   */
  async deleteGoal(goalId, { permanent = false } = {}) {
    if (!goalId) throw new Error('goalId is required');

    const mutationKey = `delete:${goalId}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Deletion for this goal is already processing.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.delete(`/goals/${encodeURIComponent(goalId)}`, {
        params: { permanent: permanent ? 'true' : 'false' },
      });
      DataEvents.emit(DATA_TOPICS.GOALS_CHANGED, { action: 'deleted', goalId, permanent });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }
}

export const goalsService = new GoalsService();
