/**
 * Tasks & Daily Planning Data Access Service
 * 
 * Interacts with Flask task endpoints:
 * - GET    /api/v1/tasks (Multi-filter query: date, goal, milestone, priority, status, pagination)
 * - GET    /api/v1/tasks/:id (Retrieve task)
 * - POST   /api/v1/tasks (Create task)
 * - PATCH  /api/v1/tasks/:id (Update task properties)
 * - DELETE /api/v1/tasks/:id (Delete or ?cancel=true)
 * - POST   /api/v1/tasks/:id/complete (Explicitly mark completed)
 * - POST   /api/v1/tasks/:id/mark-not-completed (Explicitly mark not completed)
 * - POST   /api/v1/tasks/:id/mark-unverified (Mark unverified)
 * - POST   /api/v1/tasks/:id/reschedule (Preserves original due date and audit history)
 * - POST   /api/v1/tasks/:id/toggle (Atomic toggle in transaction)
 * - POST   /api/v1/tasks/daily-plans (Record daily plan with workload validation)
 * - GET    /api/v1/tasks/daily-plans/:date (Retrieve daily plan for date)
 * - GET    /api/v1/tasks/daily-plans (List past daily plans)
 */

import { api } from './api-client.js';
import { DataEvents, DATA_TOPICS } from './data-events.js';

/**
 * @typedef {'low'|'medium'|'high'|'urgent'} TaskPriority
 * @typedef {'pending'|'in_progress'|'completed'|'not_completed'|'unverified'|'cancelled'} TaskStatus
 * @typedef {'none'|'daily'|'weekly'|'monthly'} TaskRecurrence
 * 
 * @typedef {Object} TaskCreatePayload
 * @property {string} title
 * @property {string} [description]
 * @property {string} [goal_id]
 * @property {string} [milestone_id]
 * @property {TaskPriority} [priority='medium']
 * @property {TaskStatus} [status='pending']
 * @property {TaskRecurrence} [recurrence='none']
 * @property {number} [estimated_duration=30] - Minutes (1 to 1440)
 * @property {string} [scheduled_date] - YYYY-MM-DD
 * @property {string} [original_due_date] - YYYY-MM-DD
 * @property {string} [due_time] - HH:MM
 * 
 * @typedef {Object} TaskUpdatePayload
 * @property {string} [title]
 * @property {string} [description]
 * @property {TaskPriority} [priority]
 * @property {TaskStatus} [status]
 * @property {TaskRecurrence} [recurrence]
 * @property {number} [estimated_duration]
 * @property {string} [scheduled_date]
 * @property {string} [due_time]
 * @property {string} [goal_id]
 * @property {string} [milestone_id]
 */

class TasksService {
  constructor() {
    this._inFlightMutations = new Set();
    this._activeAbortControllers = new Map();
  }

  cancelPendingRequest(tag) {
    if (this._activeAbortControllers.has(tag)) {
      this._activeAbortControllers.get(tag).abort();
      this._activeAbortControllers.delete(tag);
    }
  }

  /**
   * List tasks matching multi-parameter criteria
   * @param {Object} [filters]
   * @param {string} [filters.date] - Filter by scheduled date (YYYY-MM-DD)
   * @param {string} [filters.goal_id]
   * @param {string} [filters.milestone_id]
   * @param {TaskPriority} [filters.priority]
   * @param {TaskStatus} [filters.status]
   * @param {boolean} [filters.is_completed]
   * @param {number} [filters.page=1]
   * @param {number} [filters.limit=20]
   * @param {AbortSignal} [filters.signal]
   * @returns {Promise<{ items: Array<Object>, total: number, page: number, limit: number, total_pages: number }>}
   */
  async listTasks(filters = {}) {
    const {
      date,
      goal_id,
      milestone_id,
      priority,
      status,
      is_completed,
      page = 1,
      limit = 20,
      signal = null,
    } = filters;

    if (!signal) {
      this.cancelPendingRequest('listTasks');
      const controller = new AbortController();
      this._activeAbortControllers.set('listTasks', controller);
      filters.signal = controller.signal;
    }

    try {
      const queryParams = { page, limit };
      if (date) queryParams.date = date;
      if (goal_id) queryParams.goal_id = goal_id;
      if (milestone_id) queryParams.milestone_id = milestone_id;
      if (priority) queryParams.priority = priority;
      if (status) queryParams.status = status;
      if (is_completed !== undefined && is_completed !== null) {
        queryParams.is_completed = String(is_completed);
      }

      const response = await api.get('/tasks', {
        params: queryParams,
        signal: filters.signal,
      });

      return response.data;
    } finally {
      this._activeAbortControllers.delete('listTasks');
    }
  }

  /**
   * Retrieve a single task by ID
   * @param {string} taskId
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getTask(taskId, { signal = null } = {}) {
    if (!taskId) throw new Error('taskId is required');
    const response = await api.get(`/tasks/${encodeURIComponent(taskId)}`, { signal });
    return response.data;
  }

  /**
   * Create a new task with duration and scheduling parameters
   * @param {TaskCreatePayload} payload
   * @returns {Promise<Object>}
   */
  async createTask(payload) {
    if (!payload || !payload.title) {
      throw new Error('Task title is required');
    }

    const mutationKey = `create:${payload.title.trim().toLowerCase()}:${payload.scheduled_date || 'nodate'}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Task creation is already in progress.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.post('/tasks', payload);
      DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'created', task: response.data });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Update task fields
   * @param {string} taskId
   * @param {TaskUpdatePayload} payload
   * @returns {Promise<Object>}
   */
  async updateTask(taskId, payload) {
    if (!taskId) throw new Error('taskId is required');

    const mutationKey = `update:${taskId}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Task update is already in flight.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.patch(`/tasks/${encodeURIComponent(taskId)}`, payload);
      DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'updated', task: response.data });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Delete or cancel a task
   * @param {string} taskId
   * @param {Object} [options]
   * @param {boolean} [options.cancel=false] - True to transition to 'cancelled' status instead of deleting
   * @returns {Promise<Object>}
   */
  async deleteTask(taskId, { cancel = false } = {}) {
    if (!taskId) throw new Error('taskId is required');

    const mutationKey = `delete:${taskId}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Task deletion/cancellation is already processing.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.delete(`/tasks/${encodeURIComponent(taskId)}`, {
        params: { cancel: cancel ? 'true' : 'false' },
      });
      DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: cancel ? 'cancelled' : 'deleted', taskId });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Atomically toggle completion state
   * @param {string} taskId
   * @returns {Promise<Object>}
   */
  async toggleTask(taskId) {
    if (!taskId) throw new Error('taskId is required');

    const mutationKey = `toggle:${taskId}`;
    if (this._inFlightMutations.has(mutationKey)) {
      throw new Error('Task toggle is already processing.');
    }

    this._inFlightMutations.add(mutationKey);

    try {
      const response = await api.post(`/tasks/${encodeURIComponent(taskId)}/toggle`);
      DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'toggled', task: response.data });
      return response.data;
    } finally {
      this._inFlightMutations.delete(mutationKey);
    }
  }

  /**
   * Explicitly complete a task
   * @param {string} taskId
   * @returns {Promise<Object>}
   */
  async completeTask(taskId) {
    if (!taskId) throw new Error('taskId is required');
    const response = await api.post(`/tasks/${encodeURIComponent(taskId)}/complete`);
    DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'completed', task: response.data });
    return response.data;
  }

  /**
   * Explicitly mark task as not completed
   * @param {string} taskId
   * @returns {Promise<Object>}
   */
  async markNotCompleted(taskId) {
    if (!taskId) throw new Error('taskId is required');
    const response = await api.post(`/tasks/${encodeURIComponent(taskId)}/mark-not-completed`);
    DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'marked_not_completed', task: response.data });
    return response.data;
  }

  /**
   * Mark unconfirmed work as unverified
   * @param {string} taskId
   * @returns {Promise<Object>}
   */
  async markUnverified(taskId) {
    if (!taskId) throw new Error('taskId is required');
    const response = await api.post(`/tasks/${encodeURIComponent(taskId)}/mark-unverified`);
    DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'marked_unverified', task: response.data });
    return response.data;
  }

  /**
   * Reschedule a task to a new target date
   * @param {string} taskId
   * @param {{ new_date: string, reason?: string }} payload
   * @returns {Promise<Object>}
   */
  async rescheduleTask(taskId, payload) {
    if (!taskId) throw new Error('taskId is required');
    if (!payload || !payload.new_date) throw new Error('new_date is required');

    const response = await api.post(`/tasks/${encodeURIComponent(taskId)}/reschedule`, payload);
    DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'rescheduled', task: response.data });
    return response.data;
  }

  // --------------------------------------------------------------------------
  // DAILY PLANNING API
  // --------------------------------------------------------------------------

  /**
   * Create or update a daily plan
   * @param {Object} payload
   * @param {string} payload.date - YYYY-MM-DD
   * @param {number} payload.available_minutes
   * @param {Array<string>} payload.target_task_ids
   * @param {string} [payload.notes]
   * @returns {Promise<Object>}
   */
  async createDailyPlan(payload) {
    if (!payload || !payload.date) throw new Error('date is required');
    if (!payload.available_minutes) throw new Error('available_minutes is required');

    const response = await api.post('/tasks/daily-plans', payload);
    DataEvents.emit(DATA_TOPICS.DAILY_PLANS_CHANGED, { action: 'created', plan: response.data });
    return response.data;
  }

  /**
   * Retrieve daily plan and scheduled task instances for a date
   * @param {string} date - YYYY-MM-DD
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getDailyPlan(date, { signal = null } = {}) {
    if (!date) throw new Error('date is required');
    const response = await api.get(`/tasks/daily-plans/${encodeURIComponent(date)}`, { signal });
    return response.data;
  }

  /**
   * List historical daily plans
   * @param {Object} [options]
   * @param {number} [options.page=1]
   * @param {number} [options.limit=15]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async listDailyPlans({ page = 1, limit = 15, signal = null } = {}) {
    const response = await api.get('/tasks/daily-plans', {
      params: { page, limit },
      signal,
    });
    return response.data;
  }
}

export const tasksService = new TasksService();
