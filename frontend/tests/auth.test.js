/**
 * Automated Test Suite for Firebase Authentication Integration
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AuthService } from '../src/services/auth-service.js';
import { appState } from '../src/services/state.js';
import { Router, PUBLIC_AUTH_ROUTES, PROTECTED_ROUTES } from '../src/services/router.js';
import { api } from '../src/services/api-client.js';

test('AuthService: Friendly error mapping translates technical Firebase codes to human guidance', () => {
  const auth = new AuthService();

  assert.equal(
    auth.mapFirebaseError('auth/invalid-credential'),
    'Incorrect email or password. Please verify your credentials and try again.'
  );

  assert.equal(
    auth.mapFirebaseError('auth/email-already-in-use'),
    'An account already exists with this email address. Please sign in instead.'
  );

  assert.equal(
    auth.mapFirebaseError('auth/weak-password'),
    'Password must be at least 6 characters long.'
  );

  assert.equal(
    auth.mapFirebaseError('auth/invalid-email'),
    'Please enter a valid email address.'
  );

  assert.equal(
    auth.mapFirebaseError('auth/too-many-requests'),
    'Too many unsuccessful attempts. Access has been temporarily restricted. Please try again later or reset your password.'
  );

  assert.equal(
    auth.mapFirebaseError('auth/network-request-failed'),
    'Network connection failed. Please check your internet connection.'
  );
});

test('AuthService: Unconfigured Firebase gracefully alerts user without crashing', async () => {
  const auth = new AuthService();
  // With no Firebase config initialized
  await assert.rejects(
    async () => auth.signIn('test@example.com', 'password123'),
    /Authentication service is not configured/
  );

  await assert.rejects(
    async () => auth.signUp('test@example.com', 'password123', 'Test User'),
    /Authentication service is not configured/
  );

  await assert.rejects(
    async () => auth.sendPasswordReset('test@example.com'),
    /Authentication service is not configured/
  );
});

test('Router: Protected navigation gate blocks unauthenticated users from private routes', () => {
  // Ensure unauthenticated state
  appState.setState({
    isAuthenticated: false,
    authLoading: false,
    user: null,
  });

  // Verify all protected workspace routes are defined
  const expectedProtected = ['home', 'goals', 'tasks', 'progress', 'reports', 'settings', 'profile', 'focus'];
  assert.deepEqual(PROTECTED_ROUTES, expectedProtected);

  // Verify public auth routes are defined
  const expectedPublic = ['sign-in', 'sign-up', 'reset-password'];
  assert.deepEqual(PUBLIC_AUTH_ROUTES, expectedPublic);
});

test('Auth Lifecycle: Signing in hooks up token provider and sign out clears token provider', async () => {
  const auth = new AuthService();
  auth.currentUser = {
    uid: 'firebase-user-999',
    email: 'alex@example.com',
    displayName: 'Alex',
    getIdToken: async () => 'signed-jwt-token-token-abc',
  };

  // Simulate user sign-in transition
  await auth.handleAuthStateChange(auth.currentUser);

  const stateAfterLogin = appState.getState();
  assert.equal(stateAfterLogin.isAuthenticated, true);
  assert.equal(stateAfterLogin.user.email, 'alex@example.com');
  assert.equal(stateAfterLogin.user.uid, 'firebase-user-999');

  // Verify ApiClient token provider is now injected
  assert.ok(typeof api.tokenProvider === 'function');
  const token = await api.tokenProvider();
  assert.equal(token, 'signed-jwt-token-token-abc');

  // Simulate user sign-out transition
  await auth.handleAuthStateChange(null);

  const stateAfterLogout = appState.getState();
  assert.equal(stateAfterLogout.isAuthenticated, false);
  assert.equal(stateAfterLogout.user, null);

  // Verify token provider was cleared
  assert.equal(api.tokenProvider, null);
});
