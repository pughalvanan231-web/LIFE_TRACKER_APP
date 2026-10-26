/**
 * AI Operations Data Access Service
 * 
 * Interacts with secure Flask AI endpoints:
 * - POST /api/v1/ai/daily-suggestions (Bounded daily task suggestions based on goals & history)
 * - POST /api/v1/ai/revised-schedules (Schedule adjustments for shifting priorities)
 * - POST /api/v1/ai/recovery-plans (Sustainable catch-up plans for overdue workloads)
 * - POST /api/v1/ai/explain-progress (AI explanations of progress bottlenecks and strengths)
 * - POST /api/v1/ai/task-breakdown (Decomposition into sequential subtasks)
 * - POST /api/v1/ai/quota-check (Rate-limit and quota verification)
 */

import { api } from './api-client.js';

class AIService {
  constructor() {
    this._inFlightAiOperation = null;
  }

  /**
   * Generate daily task suggestions based on goals, milestones, and available minutes
   * @param {Object} [payload]
   * @param {string} [payload.target_date] - YYYY-MM-DD
   * @param {number} [payload.available_time_minutes] - 15 to 1440
   * @param {string} [payload.preferences]
   * @param {Array<string>} [payload.focus_goal_ids]
   * @param {string} [payload.timezone='UTC']
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async generateDailySuggestions(payload = {}, { signal = null } = {}) {
    if (this._inFlightAiOperation) {
      throw new Error('An AI operation is already running. Please wait for it to complete.');
    }

    this._inFlightAiOperation = 'suggestions';

    try {
      const response = await api.post('/ai/daily-suggestions', payload, {
        timeout: 45000, // AI generation can take slightly longer
        signal,
      });
      return response.data;
    } finally {
      this._inFlightAiOperation = null;
    }
  }

  /**
   * Generate revised schedule when available time or priorities shift
   * @param {Object} payload
   * @param {string} [payload.target_date]
   * @param {number} payload.available_time_minutes
   * @param {string} [payload.reasons]
   * @param {string} [payload.timezone='UTC']
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async generateRevisedSchedule(payload, { signal = null } = {}) {
    if (this._inFlightAiOperation) {
      throw new Error('An AI operation is already running. Please wait for it to complete.');
    }

    this._inFlightAiOperation = 'revise';

    try {
      const response = await api.post('/ai/revised-schedules', payload, {
        timeout: 45000,
        signal,
      });
      return response.data;
    } finally {
      this._inFlightAiOperation = null;
    }
  }

  /**
   * Create recovery plan for accumulated overdue tasks
   * @param {Object} [payload]
   * @param {string} [payload.target_date]
   * @param {number} [payload.focus_goals_count]
   * @param {string} [payload.urgency_level]
   * @param {number} [payload.max_daily_minutes]
   * @param {string} [payload.timezone='UTC']
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async createRecoveryPlan(payload = {}, { signal = null } = {}) {
    if (this._inFlightAiOperation) {
      throw new Error('An AI operation is already running. Please wait for it to complete.');
    }

    this._inFlightAiOperation = 'recovery';

    try {
      const response = await api.post('/ai/recovery-plans', payload, {
        timeout: 45000,
        signal,
      });
      return response.data;
    } finally {
      this._inFlightAiOperation = null;
    }
  }

  /**
   * Explain goal progress strengths, bottlenecks, and recommendations
   * @param {Object} payload
   * @param {string} [payload.goal_id]
   * @param {string} [payload.analysis_period]
   * @param {string} [payload.user_question]
   * @param {string} [payload.timezone='UTC']
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async explainGoalProgress(payload = {}, { signal = null } = {}) {
    if (this._inFlightAiOperation) {
      throw new Error('An AI operation is already running. Please wait for it to complete.');
    }

    this._inFlightAiOperation = 'explain';

    try {
      const response = await api.post('/ai/explain-progress', payload, {
        timeout: 45000,
        signal,
      });
      return response.data;
    } finally {
      this._inFlightAiOperation = null;
    }
  }

  /**
   * Break down a large task into sequential actionable subtasks
   * @param {Object} payload
   * @param {string} payload.task_title
   * @param {string} [payload.task_description]
   * @param {number} [payload.target_duration_minutes]
   * @param {number} [payload.max_subtasks]
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async suggestTaskBreakdown(payload, { signal = null } = {}) {
    if (!payload || !payload.task_title) {
      throw new Error('task_title is required for task breakdown');
    }

    if (this._inFlightAiOperation) {
      throw new Error('An AI operation is already running. Please wait for it to complete.');
    }

    this._inFlightAiOperation = 'breakdown';

    try {
      const response = await api.post('/ai/task-breakdown', payload, {
        timeout: 45000,
        signal,
      });
      return response.data;
    } finally {
      this._inFlightAiOperation = null;
    }
  }

  /**
   * Verify rate-limit and quota status
   * @returns {Promise<Object>}
   */
  async checkQuota() {
    const response = await api.post('/ai/quota-check', {});
    return response.data;
  }
}

export const aiService = new AIService();
