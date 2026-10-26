/**
 * Formatting utilities for dates, numbers, and durations.
 */

export function formatDate(dateStr, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', options).format(d);
}

export function formatPercent(value, decimals = 0) {
  if (typeof value !== 'number' || isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return 'No deadline set';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

export function daysRemaining(targetDateStr) {
  if (!targetDateStr) return 'No deadline';
  const target = new Date(targetDateStr);
  if (isNaN(target.getTime())) return '';
  const now = new Date();
  // reset hours to midnight for date-only comparison
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays > 1) return `${diffDays} days left`;
  if (diffDays === -1) return '1 day overdue';
  return `${Math.abs(diffDays)} days overdue`;
}

export function formatTimeframe(timeframe) {
  switch (timeframe) {
    case 'short_term':
      return 'Short-Term';
    case 'medium_term':
      return 'Medium-Term';
    case 'long_term':
      return 'Long-Term';
    default:
      return 'General';
  }
}

export function formatPriority(priority) {
  switch (priority) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High Priority';
    case 'medium':
      return 'Medium Priority';
    case 'low':
      return 'Low Priority';
    default:
      return 'Medium Priority';
  }
}

