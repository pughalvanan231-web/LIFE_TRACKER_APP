/**
 * Development & Preview Demo Fixtures
 * 
 * IMPORTANT:
 * These fixtures are strictly utilized when Demo Mode is explicitly enabled by the user.
 * They are clearly labeled as sample presentation data and never represent actual saved user progress.
 */

export const DEMO_GOALS = [
  {
    id: 'demo-goal-1',
    title: 'Run First Half-Marathon (21.1 km)',
    category: 'health',
    priority: 'high',
    timeframe: 'short_term',
    status: 'active',
    progress_percentage: 65,
    target_date: '2026-11-30',
    current_value: 14.0,
    target_value: 21.1,
    unit: 'km',
  },
  {
    id: 'demo-goal-2',
    title: 'Publish Technical Architecture Book',
    category: 'career',
    priority: 'high',
    timeframe: 'long_term',
    status: 'active',
    progress_percentage: 40,
    target_date: '2027-03-31',
    current_value: 4,
    target_value: 10,
    unit: 'chapters',
  },
  {
    id: 'demo-goal-3',
    title: 'Emergency Fund Savings ($20,000)',
    category: 'finance',
    priority: 'medium',
    timeframe: 'short_term',
    status: 'active',
    progress_percentage: 85,
    target_date: '2026-12-31',
    current_value: 17000,
    target_value: 20000,
    unit: 'USD',
  },
];

export const DEMO_TASKS = [
  {
    id: 'demo-task-1',
    title: 'Morning 8km interval tempo run',
    priority: 'high',
    estimated_duration: 50,
    scheduled_date: 'Today',
    status: 'completed',
    goal_title: 'Run First Half-Marathon',
  },
  {
    id: 'demo-task-2',
    title: 'Draft Chapter 4: Distributed Event Sourcing',
    priority: 'high',
    estimated_duration: 90,
    scheduled_date: 'Today',
    status: 'pending',
    goal_title: 'Publish Technical Architecture Book',
  },
  {
    id: 'demo-task-3',
    title: 'Review weekly budget and allocate auto-deposit',
    priority: 'low',
    estimated_duration: 20,
    scheduled_date: 'Today',
    status: 'pending',
    goal_title: 'Emergency Fund Savings',
  },
  {
    id: 'demo-task-4',
    title: 'Prepare mindful daily review reflection',
    priority: 'medium',
    estimated_duration: 15,
    scheduled_date: 'Tonight',
    status: 'pending',
    goal_title: 'Mindful Productivity Routine',
  },
];

export const DEMO_STATS = {
  activeGoals: 3,
  tasksDueToday: 4,
  tasksCompleted: 1,
  dailyCompletionRate: 25,
  streakDays: 5,
};
