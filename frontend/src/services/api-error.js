/**
 * Standardized API Error Class
 * Captures HTTP status, backend error codes, correlation IDs, and friendly messages.
 */

export class ApiError extends Error {
  constructor({
    message = 'An unexpected error occurred.',
    statusCode = 0,
    code = 'UNKNOWN_ERROR',
    details = null,
    requestId = null,
    retryAfter = null,
    isTimeout = false,
    isNetworkError = false,
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
    this.isTimeout = isTimeout;
    this.isNetworkError = isNetworkError;

    // Determine whether this request can be safely retried
    this.isRetryable =
      isTimeout ||
      isNetworkError ||
      [408, 429, 502, 503, 504].includes(statusCode);

    // Convenience flag for authentication/permission issues
    this.isAuthError = statusCode === 401 || statusCode === 403;
  }

  /**
   * Returns a friendly, human-readable description for UI display.
   * Never exposes raw internal server stack traces to users.
   */
  getUserFriendlyMessage() {
    if (this.isTimeout) {
      return 'The request timed out. Please check your connection and try again.';
    }
    if (this.isNetworkError) {
      return 'Unable to reach the server. Please check your internet connection.';
    }

    switch (this.statusCode) {
      case 400:
        return this.message || 'The request was invalid. Please check your inputs.';
      case 401:
        return 'Your session has expired or authentication is required. Please sign in again.';
      case 403:
        return 'You do not have permission to access or modify this resource.';
      case 404:
        return 'The requested resource was not found or has been removed.';
      case 409:
        return this.message || 'A conflicting record already exists.';
      case 422:
        return this.message || 'Validation failed. Please verify the provided details.';
      case 429:
        return `Too many requests. Please wait ${this.retryAfter ? `${this.retryAfter} seconds` : 'a moment'} before trying again.`;
      case 500:
      case 502:
      case 503:
      case 504:
        return 'The server encountered an issue. Our team has been notified. Please try again shortly.';
      default:
        return this.message || 'An unexpected error occurred. Please try again.';
    }
  }
}
