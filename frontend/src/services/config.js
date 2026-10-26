/**
 * Frontend Application Configuration
 * Resolves environment variables from Vite runtime safely.
 */

const isProd = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD;
const isDev = !isProd;

// Resolve browser-facing API Base URL
function resolveApiBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  // Default development fallback
  return isProd ? '/api/v1' : 'http://127.0.0.1:5000/api/v1';
}

// Resolve request timeout in milliseconds
function resolveTimeoutMs() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_TIMEOUT_MS) {
    const val = parseInt(import.meta.env.VITE_API_TIMEOUT_MS, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 15000; // 15 seconds default
}

// Resolve mock API usage (Strictly forbidden in production)
function resolveUseMockApi() {
  if (isProd) return false;
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USE_MOCK_API) {
    return import.meta.env.VITE_USE_MOCK_API === 'true';
  }
  return false;
}

export const appConfig = {
  apiBaseUrl: resolveApiBaseUrl(),
  apiTimeoutMs: resolveTimeoutMs(),
  useMockApi: resolveUseMockApi(),
  isProd,
  isDev,
};
