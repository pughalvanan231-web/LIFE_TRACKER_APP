/**
 * Centralized API Client
 * 
 * Features:
 * - Shared fetch wrapper
 * - Environment-configured base URL
 * - Request timeouts and signal cancellation via AbortController
 * - Correlation ID tracking (X-Request-ID)
 * - Safe JSON parsing and structured ApiError conversion
 * - Token provider injection ready for Firebase Auth (Phase 3)
 * - Optional separated mock adapter for local UI prototyping
 * 
 * SECURITY:
 * - Never logs authorization tokens, passwords, or private task contents.
 * - Never exposes raw server stack traces.
 */

import { appConfig } from './config.js';
import { ApiError } from './api-error.js';
import { mockApiAdapter } from './mock-adapter.js';

export class ApiClient {
  constructor({ baseUrl = appConfig.apiBaseUrl, timeoutMs = appConfig.apiTimeoutMs } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.tokenProvider = null;
  }

  /**
   * Inject an asynchronous token provider (e.g. Firebase Auth user.getIdToken()).
   * Ready for Phase 3 integration without modifying API callers.
   */
  setTokenProvider(providerFn) {
    if (typeof providerFn !== 'function' && providerFn !== null) {
      throw new TypeError('Token provider must be a function or null');
    }
    this.tokenProvider = providerFn;
  }

  /**
   * Constructs the full request URL with query parameters.
   */
  buildUrl(endpoint, params = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`${this.baseUrl}${cleanEndpoint}`);

    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Main HTTP request dispatcher.
   */
  async request(endpoint, {
    method = 'GET',
    params = {},
    body = null,
    headers = {},
    timeout = this.timeoutMs,
    signal = null,
  } = {}) {
    // Check if Mock Adapter is explicitly enabled in development
    if (appConfig.useMockApi) {
      const mockResponse = await mockApiAdapter.handle(method, endpoint, { params, body });
      if (mockResponse !== undefined) {
        return mockResponse;
      }
    }

    const url = this.buildUrl(endpoint, params);

    // Setup request headers
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has('Accept')) {
      requestHeaders.set('Accept', 'application/json');
    }

    // Attach Bearer token if token provider is configured
    if (this.tokenProvider && !requestHeaders.has('Authorization')) {
      try {
        const token = await this.tokenProvider();
        if (token) {
          requestHeaders.set('Authorization', `Bearer ${token}`);
        }
      } catch (err) {
        throw new ApiError({
          message: 'Failed to retrieve authentication token.',
          statusCode: 401,
          code: 'AUTH_TOKEN_PROVIDER_FAILED',
        });
      }
    }

    let requestBody = null;
    if (body !== null && body !== undefined) {
      if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
        requestHeaders.set('Content-Type', 'application/json');
        requestBody = JSON.stringify(body);
      } else {
        requestBody = body;
      }
    }

    // Timeout & Cancellation management
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Link external cancellation signal if provided
    let linkedSignal = controller.signal;
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        signal: linkedSignal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new ApiError({
          message: `Request timed out after ${timeout}ms.`,
          statusCode: 408,
          code: 'REQUEST_TIMEOUT',
          isTimeout: true,
        });
      }
      throw new ApiError({
        message: err.message || 'Network connection failed.',
        statusCode: 0,
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Extract correlation / request ID
    const requestId =
      response.headers.get('X-Request-ID') ||
      response.headers.get('X-Correlation-ID') ||
      null;

    // Retry-After header for 429 / 503
    const retryAfter = response.headers.get('Retry-After');

    // Parse Response Body
    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new ApiError({
          message: 'Failed to parse JSON response from server.',
          statusCode: response.status,
          code: 'JSON_PARSE_ERROR',
          requestId,
        });
      }
    } else {
      // Non-JSON response (e.g. gateway HTML error)
      const text = await response.text();
      data = { text };
    }

    // Handle HTTP Error responses
    if (!response.ok) {
      const errorPayload = data && typeof data === 'object' ? data.error || data : {};
      const errorCode = errorPayload.code || `HTTP_${response.status}`;
      const errorMessage =
        errorPayload.message ||
        data.message ||
        `Request failed with status ${response.status}`;

      throw new ApiError({
        message: errorMessage,
        statusCode: response.status,
        code: errorCode,
        details: errorPayload.details || null,
        requestId: (data && data.meta && data.meta.request_id) || requestId,
        retryAfter: retryAfter ? parseInt(retryAfter, 10) : null,
      });
    }

    // Return parsed payload (supports backend envelope format { success, data, meta })
    return data;
  }

  // Convenience HTTP Methods
  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body = {}, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  patch(endpoint, body = {}, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  }

  put(endpoint, body = {}, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Global shared singleton instance
export const api = new ApiClient();
