/**
 * Notifications & Reminders Service
 * 
 * Manages:
 * - Browser Notification permission lifecycle with pre-flight explanations
 * - Task reminders, goal deadline alerts, daily planning, and evening review reminders
 * - Quiet hours verification
 * - Platform limitation detection (iOS Safari PWA, Android, desktop browsers)
 * - Persisting reminder preferences through settingsService
 */

import { settingsService } from './settings-service.js';
import { DataEvents, DATA_TOPICS } from './data-events.js';

export const REMINDER_SETTINGS_STORAGE_KEY = 'life_goals_reminders_config';

export const DEFAULT_REMINDER_CONFIG = Object.freeze({
  browser_notifications_enabled: false,
  task_reminders_enabled: true,
  task_reminder_lead_minutes: 15, // 10, 15, 30, 60
  goal_deadline_reminders_enabled: true,
  goal_deadline_lead_days: 3, // 1, 3, 7
  daily_planning_reminder_enabled: true,
  daily_planning_time: '08:30',
  daily_review_reminder_enabled: true,
  daily_review_time: '21:30',
  quiet_hours_enabled: true,
  quiet_hours_start: '22:30',
  quiet_hours_end: '07:00',
});

class NotificationsService {
  constructor() {
    this._config = null;
  }

  /**
   * Check if the current browser environment supports the Web Notifications API
   * @returns {boolean}
   */
  isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Detect iOS Safari platform to display PWA installation note if relevant
   * @returns {boolean}
   */
  isIosSafari() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isStandalone = typeof window !== 'undefined' && ('standalone' in window.navigator) && window.navigator.standalone;
    return isIos && !isStandalone;
  }

  /**
   * Get current permission state: 'granted' | 'denied' | 'default' | 'unsupported'
   * @returns {string}
   */
  getPermissionState() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Retrieve active reminder configuration
   * @returns {Promise<Object>}
   */
  async getConfig() {
    if (this._config) return { ...this._config };

    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(REMINDER_SETTINGS_STORAGE_KEY);
        if (stored) {
          this._config = { ...DEFAULT_REMINDER_CONFIG, ...JSON.parse(stored) };
          return { ...this._config };
        }
      } catch (err) {
        console.warn('[NotificationsService] Failed to read reminder config:', err);
      }
    }

    this._config = { ...DEFAULT_REMINDER_CONFIG };
    return { ...this._config };
  }

  /**
   * Update reminder configuration
   * @param {Object} partial
   * @returns {Promise<Object>}
   */
  async updateConfig(partial) {
    const current = await this.getConfig();
    const updated = { ...current, ...partial };
    this._config = updated;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(REMINDER_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('[NotificationsService] Failed to save reminder config:', err);
      }
    }

    DataEvents.emit(DATA_TOPICS.SETTINGS_CHANGED, { reminders: updated });
    return updated;
  }

  /**
   * Request native browser notification permission
   * @returns {Promise<{granted: boolean, state: string, error?: string}>}
   */
  async requestPermission() {
    if (!this.isSupported()) {
      return { granted: false, state: 'unsupported', error: 'Notifications are not supported by this browser.' };
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';

      await this.updateConfig({ browser_notifications_enabled: granted });
      return { granted, state: permission };
    } catch (err) {
      console.error('[NotificationsService] Permission request failed:', err);
      return { granted: false, state: 'denied', error: err.message };
    }
  }

  /**
   * Determine whether current time falls within user-configured quiet hours
   * @param {string} [startTime] - HH:MM
   * @param {string} [endTime] - HH:MM
   * @returns {boolean}
   */
  isQuietHours(startTime = null, endTime = null) {
    const cfg = this._config || DEFAULT_REMINDER_CONFIG;
    if (!cfg.quiet_hours_enabled) return false;

    const start = startTime || cfg.quiet_hours_start || '22:30';
    const end = endTime || cfg.quiet_hours_end || '07:00';

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = start.split(':').map((v) => parseInt(v, 10));
    const [endH, endM] = end.split(':').map((v) => parseInt(v, 10));

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Overnight range (e.g. 22:30 to 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Same-day range
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Dispatch a local reminder notification if permitted and outside quiet hours
   * @param {string} title
   * @param {Object} [options]
   * @returns {boolean} true if shown
   */
  showNotification(title, options = {}) {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return false;
    }

    if (!options.bypassQuietHours && this.isQuietHours()) {
      console.info('[NotificationsService] Suppressed reminder during quiet hours:', title);
      return false;
    }

    try {
      new Notification(title, {
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-badge.png',
        ...options,
      });
      return true;
    } catch (err) {
      console.warn('[NotificationsService] Could not display notification:', err);
      return false;
    }
  }
}

export const notificationsService = new NotificationsService();
