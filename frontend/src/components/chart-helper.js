/**
 * Chart.js Integration Helper
 * 
 * Manages responsive, accessible Chart.js instances with automatic cleanup
 * to prevent canvas reuse errors and memory leaks.
 */

import { Chart, registerables } from 'chart.js';

// Register all standard Chart.js controllers, elements, scales, and plugins
Chart.register(...registerables);

// Track active chart instances by canvas element ID
const activeCharts = new Map();

/**
 * Destroy active chart instance on a canvas if it exists
 * @param {string} canvasId
 */
export function destroyChart(canvasId) {
  if (activeCharts.has(canvasId)) {
    try {
      activeCharts.get(canvasId).destroy();
    } catch (err) {
      console.warn(`[ChartHelper] Error destroying chart on canvas ${canvasId}:`, err);
    }
    activeCharts.delete(canvasId);
  }
}

/**
 * Destroy all active chart instances (e.g. on route change)
 */
export function destroyAllCharts() {
  for (const [id, chart] of activeCharts.entries()) {
    try {
      chart.destroy();
    } catch {
      // ignore
    }
  }
  activeCharts.clear();
}

/**
 * Create or replace a Daily Breakdown Stacked Bar Chart
 * @param {string} canvasId
 * @param {Array<Object>} dailyMetrics - Array of DailyReportMetric
 * @returns {Chart|null}
 */
export function renderDailyBreakdownChart(canvasId, dailyMetrics = []) {
  if (typeof document === 'undefined') return null;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  destroyChart(canvasId);

  const labels = dailyMetrics.map((d) => {
    // Format YYYY-MM-DD to Mon DD
    const parts = d.date.split('-');
    if (parts.length === 3) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${monthNames[mIdx]} ${parseInt(parts[2], 10)}`;
    }
    return d.date;
  });

  const completedData = dailyMetrics.map((d) => d.completed_count || 0);
  const notCompletedData = dailyMetrics.map((d) => d.not_completed_count || 0);
  const unverifiedData = dailyMetrics.map((d) => d.unverified_count || 0);
  const postponedData = dailyMetrics.map((d) => d.postponed_count || 0);

  const ctx = canvas.getContext('2d');
  const chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Completed',
          data: completedData,
          backgroundColor: '#059669', // Emerald
          borderRadius: 4,
          stack: 'tasks',
        },
        {
          label: 'Not Done',
          data: notCompletedData,
          backgroundColor: '#dc2626', // Red
          borderRadius: 4,
          stack: 'tasks',
        },
        {
          label: 'Unverified',
          data: unverifiedData,
          backgroundColor: '#94a3b8', // Slate
          borderRadius: 4,
          stack: 'tasks',
        },
        {
          label: 'Postponed',
          data: postponedData,
          backgroundColor: '#d97706', // Amber
          borderRadius: 4,
          stack: 'tasks',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { size: 12, family: 'Inter, system-ui, sans-serif' },
            color: '#475569',
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            afterBody(tooltipItems) {
              const dataIndex = tooltipItems[0]?.dataIndex;
              if (dataIndex !== undefined && dailyMetrics[dataIndex]) {
                const day = dailyMetrics[dataIndex];
                return `Rate: ${Math.round(day.completion_rate || 0)}% (Due: ${day.total_due || 0})`;
              }
              return '';
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#64748b' },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 11 }, color: '#64748b' },
          grid: { color: 'rgba(226, 232, 240, 0.6)' },
        },
      },
    },
  });

  activeCharts.set(canvasId, chartInstance);
  return chartInstance;
}

/**
 * Create or replace a Goal Progress Doughnut/Bar Comparison Chart
 * @param {string} canvasId
 * @param {Array<Object>} goals - Array of GoalProgressItem
 * @returns {Chart|null}
 */
export function renderGoalProgressChart(canvasId, goals = []) {
  if (typeof document === 'undefined') return null;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  destroyChart(canvasId);

  const labels = goals.slice(0, 7).map((g) => g.title);
  const progressData = goals.slice(0, 7).map((g) => Math.round(g.progress_percentage || 0));

  const ctx = canvas.getContext('2d');
  const chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Progress %',
          data: progressData,
          backgroundColor: '#4f46e5', // Indigo
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: 'y', // Horizontal bars for readability
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Mastery: ${ctx.raw}%`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: (val) => `${val}%`, font: { size: 10 } },
          grid: { color: 'rgba(226, 232, 240, 0.6)' },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11, weight: '500' }, color: '#334155' },
        },
      },
    },
  });

  activeCharts.set(canvasId, chartInstance);
  return chartInstance;
}
