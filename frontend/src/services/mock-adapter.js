/**
 * Separated Development Fixture Adapter for Offline / Local UI Prototyping
 * 
 * RULES:
 * 1. Strictly disabled in production.
 * 2. Only active when VITE_USE_MOCK_API=true is explicitly set in development.
 * 3. Never makes mock data look like real persisted records (all records tagged with _is_dev_fixture).
 */

import { DEMO_GOALS, DEMO_TASKS, DEMO_STATS } from './fixtures.js';

export class MockApiAdapter {
  constructor() {
    this.goals = DEMO_GOALS.map((g) => ({
      ...g,
      _is_dev_fixture: true,
      title: `[DEV_FIXTURE] ${g.title}`,
    }));
    this.tasks = DEMO_TASKS.map((t) => ({
      ...t,
      _is_dev_fixture: true,
      title: `[DEV_FIXTURE] ${t.title}`,
    }));
  }

  async handle(method, endpoint, { params = {}, body = null } = {}) {
    // Artificial slight delay to simulate network latency realistically
    await new Promise((r) => setTimeout(r, 60));

    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const meta = {
      request_id: `dev-fixture-${Date.now()}`,
      timestamp: new Date().toISOString(),
      is_dev_fixture: true,
      notice: '[DEV_FIXTURE_ADAPTER: Explicit offline development fixture]',
    };

    // GET /me
    if (cleanEndpoint === 'me') {
      return {
        success: true,
        data: {
          uid: 'dev-fixture-user-001',
          email: 'developer@lifegoals.ai',
          email_verified: true,
          display_name: '[DEV_FIXTURE] Local Developer',
          _is_dev_fixture: true,
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
          total: this.goals.length,
          page: 1,
          limit: 20,
          total_pages: 1,
          _is_dev_fixture: true,
        },
        meta,
      };
    }

    // POST /goals
    if (cleanEndpoint === 'goals' && method === 'POST') {
      const newGoal = {
        id: `dev-fixture-goal-${Date.now()}`,
        ...body,
        _is_dev_fixture: true,
        progress_percentage: 0,
        current_value: body?.current_value || 0,
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
          total: this.tasks.length,
          page: 1,
          limit: 50,
          total_pages: 1,
          _is_dev_fixture: true,
        },
        meta,
      };
    }

    // POST /tasks
    if (cleanEndpoint === 'tasks' && method === 'POST') {
      const newTask = {
        id: `dev-fixture-task-${Date.now()}`,
        ...body,
        _is_dev_fixture: true,
        status: body?.status || 'pending',
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
          _is_dev_fixture: true,
        },
        meta,
      };
    }

    // Unhandled route returns undefined to fall back to regular fetch
    return undefined;
  }
}

export const mockApiAdapter = new MockApiAdapter();
