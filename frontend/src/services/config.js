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

// Resolve Firebase Client SDK configuration
function resolveFirebaseConfig() {
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return null;
  }

  const env = import.meta.env;
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
  };

  return config;
}

// Check if Firebase configuration is complete and not a placeholder
function checkIsFirebaseConfigured(config) {
  if (!config) return false;
  const { apiKey, projectId } = config;
  if (!apiKey || !projectId) return false;
  // Guard against placeholders
  if (apiKey.includes('Placeholder') || projectId.includes('your-project-id')) {
    return false;
  }
  return true;
}

const firebaseConfig = resolveFirebaseConfig();
const isFirebaseConfigured = checkIsFirebaseConfigured(firebaseConfig);
const authEmulatorHost =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || null
    : null;

export const appConfig = {
  apiBaseUrl: resolveApiBaseUrl(),
  apiTimeoutMs: resolveTimeoutMs(),
  useMockApi: resolveUseMockApi(),
  firebase: firebaseConfig,
  isFirebaseConfigured,
  authEmulatorHost,
  isProd,
  isDev,
};
