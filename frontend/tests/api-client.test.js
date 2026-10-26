/**
 * Automated Test Suite for Frontend API Client & Error Handling
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiClient } from '../src/services/api-client.js';
import { ApiError } from '../src/services/api-error.js';

test('ApiClient: URL construction correctly joins endpoints and serializes query parameters', () => {
  const client = new ApiClient({ baseUrl: 'http://127.0.0.1:5000/api/v1' });

  // Simple endpoint
  assert.equal(
    client.buildUrl('/goals'),
    'http://127.0.0.1:5000/api/v1/goals'
  );

  // Endpoint without leading slash
  assert.equal(
    client.buildUrl('tasks'),
    'http://127.0.0.1:5000/api/v1/tasks'
  );

  // Query parameters
  const urlWithParams = client.buildUrl('/goals', {
    timeframe: 'short_term',
    limit: 20,
    offset: 0,
    empty: '',
    nullVal: null,
    undefinedVal: undefined,
  });

  assert.equal(
    urlWithParams,
    'http://127.0.0.1:5000/api/v1/goals?timeframe=short_term&limit=20&offset=0'
  );
});

test('ApiClient: Injects authentication token from token provider when configured', async () => {
  let capturedHeaders = null;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    capturedHeaders = options.headers;
    return new Response(JSON.stringify({ success: true, data: { status: 'ok' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:5000/api/v1' });
    client.setTokenProvider(async () => 'mock-firebase-id-token-xyz');

    await client.get('/goals');

    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders.get('Authorization'), 'Bearer mock-firebase-id-token-xyz');
    assert.equal(capturedHeaders.get('Accept'), 'application/json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ApiClient: Parses backend error responses and maps to ApiError with correlation ID', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down.',
        },
        meta: {
          request_id: 'corr-id-98765',
        },
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '45',
          'X-Request-ID': 'corr-id-98765',
        },
      }
    );
  };

  try {
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:5000/api/v1' });
    await assert.rejects(
      async () => client.get('/tasks'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 429);
        assert.equal(err.code, 'RATE_LIMIT_EXCEEDED');
        assert.equal(err.requestId, 'corr-id-98765');
        assert.equal(err.retryAfter, 45);
        assert.equal(err.isRetryable, true);
        assert.match(err.getUserFriendlyMessage(), /wait 45 seconds/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ApiClient: Handles non-JSON response gracefully (e.g. 502 Bad Gateway HTML)', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: {
        'Content-Type': 'text/html',
        'X-Request-ID': 'gateway-err-1122',
      },
    });
  };

  try {
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:5000/api/v1' });
    await assert.rejects(
      async () => client.post('/goals', { title: 'Test' }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 502);
        assert.equal(err.requestId, 'gateway-err-1122');
        assert.equal(err.isRetryable, true);
        assert.match(err.getUserFriendlyMessage(), /server encountered an issue/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ApiClient: Request timeout aborts connection and yields isTimeout=true', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        reject(abortErr);
      });
    });
  };

  try {
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:5000/api/v1',
      timeoutMs: 50, // Short 50ms timeout
    });

    await assert.rejects(
      async () => client.get('/progress/daily'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.isTimeout, true);
        assert.equal(err.code, 'REQUEST_TIMEOUT');
        assert.equal(err.isRetryable, true);
        assert.match(err.getUserFriendlyMessage(), /request timed out/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ApiError: Protects user from raw internal stack traces across 4xx and 5xx errors', () => {
  const authErr = new ApiError({ statusCode: 401, code: 'UNAUTHORIZED' });
  assert.equal(authErr.isAuthError, true);
  assert.match(authErr.getUserFriendlyMessage(), /session has expired/i);

  const forbiddenErr = new ApiError({ statusCode: 403, code: 'FORBIDDEN' });
  assert.equal(forbiddenErr.isAuthError, true);
  assert.match(forbiddenErr.getUserFriendlyMessage(), /do not have permission/i);

  const notFoundErr = new ApiError({ statusCode: 404, code: 'NOT_FOUND' });
  assert.match(notFoundErr.getUserFriendlyMessage(), /resource was not found/i);

  const internalErr = new ApiError({
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Traceback (most recent call last):\n  File "app/server.py", line 42 in run\n    raise DatabaseError()',
  });
  // Verify raw server traceback is NOT in the user-friendly message!
  assert.doesNotMatch(internalErr.getUserFriendlyMessage(), /Traceback/);
  assert.match(internalErr.getUserFriendlyMessage(), /server encountered an issue/i);
});
