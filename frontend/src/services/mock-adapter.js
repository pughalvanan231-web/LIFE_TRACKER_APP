/**
 * Separated Mock API Adapter for Local Offline UI Development
 * 
 * RULES:
 * 1. Strictly disabled in production.
 * 2. Only active when VITE_USE_MOCK_API=true is set in development.
 * 3. Never confuses mock data with real production records.
 */

import { DEMO_GOALS, DEMO_TASKS, DEMO_STATS } from './fixtures.js';

export class MockApiAdapter {
  constructor() {
    this.goals = [...DEMO_GOALS];
    this.tasks = [...DEMO_TASKS];
  }

  async handle(method, endpoint, { params = {}, body = null } = {}) {
    // Artificial slight delay to simulate network latency realistically
    await new Promise((r) => setTimeout(r, 60));

    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const meta = { request_id: `mock-${Date.now()}`, timestamp: new Date().toISOString() };

    // GET /me
    if (cleanEndpoint === 'me') {
      return {
        success: true,
        data: {
          uid: 'mock-dev-user-001',
          email: 'developer@lifegoals.ai',
          email_verified: true,
          display_name: 'Dev User',
        },
        meta,
      };
    }

    // GET /goals
    if (cleanEndpoint === 'goals' && method === 'GET') {
      return {
        success: true,
        data: {
          items: this.goals,
          total_count: this.goals.length,
          page: 1,
          limit: 20,
        },
        meta,
      };
    }

    // POST /goals
    if (cleanEndpoint === 'goals' && method === 'POST') {
      const newGoal = {
        id: `mock-goal-${Date.now()}`,
        ...body,
        progress_percentage: 0,
        current_value: 0,
      };
      this.goals.unshift(newGoal);
      return { success: true, data: newGoal, meta };
    }

    // GET /tasks
    if (cleanEndpoint === 'tasks' && method === 'GET') {
      return {
        success: true,
        data: {
          items: this.tasks,
          total_count: this.tasks.length,
          page: 1,
          limit: 50,
        },
        meta,
      };
    }

    // POST /tasks
    if (cleanEndpoint === 'tasks' && method === 'POST') {
      const newTask = {
        id: `mock-task-${Date.now()}`,
        ...body,
        status: 'pending',
      };
      this.tasks.unshift(newTask);
      return { success: true, data: newTask, meta };
    }

    // GET /progress/daily
    if (cleanEndpoint.startsWith('progress/daily')) {
      return {
        success: true,
        data: {
          date: new Date().toISOString().split('T')[0],
          completion_rate: DEMO_STATS.dailyCompletionRate,
          total_due: DEMO_STATS.tasksDueToday,
          completed: DEMO_STATS.tasksCompleted,
        },
        meta,
      };
    }

    // Unhandled route returns undefined to fall back to regular fetch
    return undefined;
  }
}

export const mockApiAdapter = new MockApiAdapter();
