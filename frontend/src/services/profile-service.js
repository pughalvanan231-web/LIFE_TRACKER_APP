/**
 * User Profile Data Access Service
 * 
 * Interacts with authenticated user profile endpoints in the Flask backend:
 * - GET /api/v1/me (Derived strictly from verified Firebase token claims)
 * - GET /api/v1/users/:id/data (User ownership-verified data)
 */

import { api } from './api-client.js';
import { DataEvents, DATA_TOPICS } from './data-events.js';

/**
 * @typedef {Object} UserProfile
 * @property {string} uid - Verified Firebase User ID
 * @property {string} email - Account email address
 * @property {boolean} email_verified - Whether email address is verified
 * @property {string|null} display_name - User display name
 * @property {string|null} photo_url - Profile avatar URL
 */

class ProfileService {
  constructor() {
    this._cachedProfile = null;
    this._inFlightProfilePromise = null;
  }

  /**
   * Retrieve authenticated user profile from GET /api/v1/me
   * Deduplicates concurrent in-flight requests and caches result.
   * 
   * @param {Object} [options]
   * @param {boolean} [options.force=false] - Force reload from server, bypassing memory cache
   * @param {AbortSignal} [options.signal] - Optional cancellation signal
   * @returns {Promise<UserProfile>}
   */
  async getProfile({ force = false, signal = null } = {}) {
    if (!force && this._cachedProfile) {
      return this._cachedProfile;
    }

    if (this._inFlightProfilePromise) {
      return this._inFlightProfilePromise;
    }

    this._inFlightProfilePromise = (async () => {
      try {
        const response = await api.get('/me', { signal });
        this._cachedProfile = response.data;
        DataEvents.emit(DATA_TOPICS.PROFILE_CHANGED, this._cachedProfile);
        return this._cachedProfile;
      } finally {
        this._inFlightProfilePromise = null;
      }
    })();

    return this._inFlightProfilePromise;
  }

  /**
   * Retrieve resource data for an authorized user ID
   * @param {string} userId
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>}
   */
  async getUserData(userId, { signal = null } = {}) {
    if (!userId) {
      throw new Error('userId is required to fetch user data');
    }
    const response = await api.get(`/users/${encodeURIComponent(userId)}/data`, { signal });
    return response.data;
  }

  /**
   * Invalidate cached profile on logout or update
   */
  clearCache() {
    this._cachedProfile = null;
    this._inFlightProfilePromise = null;
  }
}

export const profileService = new ProfileService();
