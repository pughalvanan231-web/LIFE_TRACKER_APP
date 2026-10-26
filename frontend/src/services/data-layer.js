/**
 * Centralized Data Layer Registry
 * 
 * Re-exports all data access services, UI primitives, event topics, and API utilities
 * to guarantee that page components never need scattered direct fetch calls.
 */

// Shared API Client & Errors
export { api, ApiClient } from './api-client.js';
export { ApiError } from './api-error.js';

// Event Bus
export { DataEvents, DATA_TOPICS } from './data-events.js';

// Domain Services
export { authService } from './auth-service.js';
export { profileService } from './profile-service.js';
export { goalsService } from './goals-service.js';
export { milestonesService } from './milestones-service.js';
export { tasksService } from './tasks-service.js';
export { dailyReviewsService } from './daily-reviews-service.js';
export { progressService } from './progress-service.js';
export { reportsService } from './reports-service.js';
export { aiService } from './ai-service.js';
export { settingsService, DEFAULT_USER_SETTINGS } from './settings-service.js';
