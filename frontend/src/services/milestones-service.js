/**
 * Milestones Data Access Service
 * 
 * Interacts with Flask goal milestones endpoints:
 * - GET    /api/v1/goals/:goal_id/milestones (List milestones under a goal)
 * - POST   /api/v1/goals/:goal_id/milestones (Create weighted milestone)
 * - PATCH  /api/v1/goals/:goal_id/milestones/:milestone_id (Update progress/details)
 * - DELETE /api/v1/goals/:goal_id/milestones/:milestone_id (Delete milestone)
 */

import { api } from './api-client.js';
import { DataEvents, DATA_TOPICS } from './data-events.js';

/**
 * @typedef {Object} MilestoneCreatePayload
 * @property {string} title
 * @property {string} [description]
 * @property {string} [target_date] - YYYY-MM-DD
 * @property {number} [order=0]
 * @property {number} [weight=1.0] - Relative weight (0 < weight <= 100)
 * 
 * @typedef {Object} MilestoneUpdatePayload
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [target_date]
 * @property {number} [order]
 * @property {number} [weight]
 * @property {boolean} [is_completed]
 * @property {string} [date_change_reason]
 */

class MilestonesService {
  constructor() {
    this._inFlightMutations = new Set();
  }

  /**
   * List all milestones for a specific goal
   * @param {string} goalId
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Array<Object>>}
   */
  async listMilestones(goalId, { signal = null } = {}) {
    if (!goalId) throw new Error('goalId is required');
    const response = await api.get(`/goals/${encodeURIComponent(goalId)}/milestones`, { signal });
    return response.data || [];
  }

  /**
   * Create a milestone attached to a parent goal
   * @param {string} goalId
   * @param {MilestoneCreatePayload} payload
   * @returns {Promise<Object>}
   */
  async createMilestone(goalId, payload) {
    if (!goalId) throw new Error('goalId is required');
    if (!payload || !payload.title) throw new Error('Milestone title is required');

    const mutationKey = `create:${goalId}:${payload.title.trim().toLowerCase()}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Milestone creation is already in progress.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.post(`/goals/${encodeURIComponent(goalId)}/milestones`, payload);
      DataEvents.emit(DATA_TOPICS.MILESTONES_CHANGED, { action: 'created', goalId, milestone: response.data });
      DataEvents.emit(DATA_TOPICS.GOALS_CHANGED, { action: 'milestone_added', goalId });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Update milestone properties or toggle completion
   * @param {string} goalId
   * @param {string} milestoneId
   * @param {MilestoneUpdatePayload} payload
   * @returns {Promise<Object>}
   */
  async updateMilestone(goalId, milestoneId, payload) {
    if (!goalId) throw new Error('goalId is required');
    if (!milestoneId) throw new Error('milestoneId is required');

    const mutationKey = `update:${goalId}:${milestoneId}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Milestone update is already processing.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.patch(
        `/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(milestoneId)}`,
        payload
      );
      DataEvents.emit(DATA_TOPICS.MILESTONES_CHANGED, { action: 'updated', goalId, milestone: response.data });
      DataEvents.emit(DATA_TOPICS.GOALS_CHANGED, { action: 'milestone_updated', goalId });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Delete a milestone from a goal
   * @param {string} goalId
   * @param {string} milestoneId
   * @returns {Promise<Object>}
   */
  async deleteMilestone(goalId, milestoneId) {
    if (!goalId) throw new Error('goalId is required');
    if (!milestoneId) throw new Error('milestoneId is required');

    const mutationKey = `delete:${goalId}:${milestoneId}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Milestone deletion is already in progress.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.delete(
        `/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(milestoneId)}`
      );
      DataEvents.emit(DATA_TOPICS.MILESTONES_CHANGED, { action: 'deleted', goalId, milestoneId });
      DataEvents.emit(DATA_TOPICS.GOALS_CHANGED, { action: 'milestone_deleted', goalId });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }
}

export const milestonesService = new MilestonesService();
