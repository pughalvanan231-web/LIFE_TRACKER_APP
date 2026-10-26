/**
 * User Settings Data Access Service & Backend Contract Definition
 * 
 * BACKEND CONTRACT DEFINITION:
 * ==============================================================================
 * Expected Endpoint:
 *   GET   /api/v1/me/settings
 *   PATCH /api/v1/me/settings
 * 
 * Expected Request / Response Schema:
 * {
 *   "timezone": "America/New_York",        // string, valid IANA timezone identifier
 *   "daily_focus_minutes": 240,            // integer, 15 to 1440
 *   "theme": "system",                     // "light" | "dark" | "system"
 *   "week_start": "monday",                // "monday" | "sunday"
 *   "notifications_enabled": true,         // boolean
 *   "reminder_time": "09:00",              // string, HH:MM 24hr format
 *   "updated_at": "2026-10-26T12:00:00Z"   // ISO-8601 UTC timestamp
 * }
 * ==============================================================================
 * 
 * NOTE: The Flask backend repository layer (UserRepository) includes support for user
 * settings and timezones, but a public REST route has not yet been exposed in api/v1.
 * 
 * This service implements the precise contract specification above. It uses an
 * EXPLICITLY LABELED development adapter that stores preferences locally until the
 * backend REST endpoints are finalized.
 */

import { DataEvents, DATA_TOPICS } from './data-events.js';

const SETTINGS_STORAGE_KEY = 'life_goals_user_settings_dev_adapter';

export const DEFAULT_USER_SETTINGS = Object.freeze({
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  daily_focus_minutes: 240,
  theme: 'system',
  week_start: 'monday',
  notifications_enabled: true,
  reminder_time: '09:00',
  is_dev_fixture: true,
  dev_adapter_notice: '[DEV_FIXTURE_ADAPTER: Backend settings endpoint contract pending implementation]',
});

class SettingsService {
  constructor() {
    this._memorySettings = null;
    this.isDevelopmentAdapter = true;
  }

  /**
   * Retrieve current user settings.
   * Uses development adapter until backend REST route is deployed.
   * 
   * @returns {Promise<Object>}
   */
  async getSettings() {
    if (this._memorySettings) {
      return { ...this._memorySettings };
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
          this._memorySettings = { ...DEFAULT_USER_SETTINGS, ...JSON.parse(stored) };
          return { ...this._memorySettings };
        }
      } catch (err) {
        console.warn('[SettingsService] Failed to read settings from storage:', err);
      }
    }

    this._memorySettings = { ...DEFAULT_USER_SETTINGS };
    return { ...this._memorySettings };
  }

  /**
   * Update user settings.
   * @param {Object} partialSettings
   * @returns {Promise<Object>}
   */
  async updateSettings(partialSettings) {
    const current = await this.getSettings();
    const updated = {
      ...current,
      ...partialSettings,
      updated_at: new Date().toISOString(),
      is_dev_fixture: true,
      dev_adapter_notice: '[DEV_FIXTURE_ADAPTER: Backend settings endpoint contract pending implementation]',
    };

    this._memorySettings = updated;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('[SettingsService] Failed to persist settings to storage:', err);
      }
    }

    DataEvents.emit(DATA_TOPICS.SETTINGS_CHANGED, updated);
    return updated;
  }

  /**
   * Reset settings to defaults
   * @returns {Promise<Object>}
   */
  async resetSettings() {
    this._memorySettings = { ...DEFAULT_USER_SETTINGS };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    DataEvents.emit(DATA_TOPICS.SETTINGS_CHANGED, this._memorySettings);
    return this._memorySettings;
  }
}

export const settingsService = new SettingsService();
