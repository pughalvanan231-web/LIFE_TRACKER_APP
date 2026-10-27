/**
 * Sticky Note Pastel Palette & Storage Helper
 */

export const PASTEL_COLORS = [
  { id: 'yellow', name: 'Sunny Yellow', class: 'sticky-yellow', bg: '#fef9c3', border: '#fde047', text: '#713f12' },
  { id: 'rose', name: 'Pastel Rose', class: 'sticky-rose', bg: '#ffe4e6', border: '#fecdd3', text: '#881337' },
  { id: 'mint', name: 'Fresh Mint', class: 'sticky-mint', bg: '#dcfce7', border: '#bbf7d0', text: '#14532d' },
  { id: 'sky', name: 'Sky Blue', class: 'sticky-sky', bg: '#e0f2fe', border: '#bae6fd', text: '#0c4a6e' },
  { id: 'lavender', name: 'Soft Lavender', class: 'sticky-lavender', bg: '#f3e8ff', border: '#e9d5ff', text: '#581c87' },
  { id: 'peach', name: 'Warm Peach', class: 'sticky-peach', bg: '#ffedd5', border: '#fed7aa', text: '#7c2d12' },
];

const COLOR_STORAGE_KEY = 'life_goals_task_sticky_colors';

class TaskColorManager {
  constructor() {
    this._colorMap = this._loadColorMap();
  }

  _loadColorMap() {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(COLOR_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
      } catch {
        // ignore
      }
    }
    return {};
  }

  _saveColorMap() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(this._colorMap));
      } catch {
        // ignore
      }
    }
  }

  /**
   * Get sticky note color for a task.
   * If not explicitly chosen, falls back to a deterministic color based on priority.
   * @param {Object} task
   * @returns {string} color ID ('yellow' | 'rose' | 'mint' | 'sky' | 'lavender' | 'peach')
   */
  getTaskColor(task) {
    if (!task) return 'yellow';
    if (this._colorMap[task.id]) {
      return this._colorMap[task.id];
    }

    // Deterministic priority-based fallback
    if (task.priority === 'urgent') return 'rose';
    if (task.priority === 'high') return 'peach';
    if (task.priority === 'low') return 'mint';
    return 'yellow';
  }

  /**
   * Associate a color with a task ID
   * @param {string} taskId
   * @param {string} colorId
   */
  setTaskColor(taskId, colorId) {
    if (!taskId) return;
    this._colorMap[taskId] = colorId;
    this._saveColorMap();
  }
}

export const taskColorManager = new TaskColorManager();
