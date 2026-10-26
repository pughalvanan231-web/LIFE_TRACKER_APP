/**
 * Firebase Authentication Integration Service
 * 
 * Uses the official modular Firebase JavaScript SDK:
 * - Initializes Firebase App & Auth from client-safe environment variables
 * - Manages authentication lifecycle (sign-in, sign-up, password reset, sign-out)
 * - Obtains fresh Firebase ID tokens for protected backend requests
 * - Injects token provider into shared ApiClient
 * - Synchronizes with backend GET /api/v1/me endpoint
 * - Provides human-friendly error translation without technical jargon
 * 
 * SECURITY:
 * - Never manually stores passwords or tokens in localStorage/sessionStorage.
 * - Never trusts a client-side UID as proof of authentication.
 * - Tokens are minted and validated cryptographically by Firebase.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';

import { appConfig } from './config.js';
import { appState } from './state.js';
import { api } from './api-client.js';

export class AuthService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.currentUser = null;
    this.backendProfile = null;
    this.isInitialized = false;
    this.unsubscribeAuth = null;
  }

  /**
   * Initialize Firebase SDK and register auth-state observer.
   */
  init() {
    if (this.isInitialized) return;

    if (!appConfig.isFirebaseConfigured) {
      console.warn(
        '[Life Goals AI] Firebase client configuration is missing or incomplete. Authentication is disabled until configured in .env.local.'
      );
      appState.setState({
        authLoading: false,
        isFirebaseConfigured: false,
      });
      return;
    }

    try {
      // Initialize Firebase App instance
      this.app = getApps().length > 0 ? getApp() : initializeApp(appConfig.firebase);
      this.auth = getAuth(this.app);

      // Connect to local Auth Emulator if configured
      if (appConfig.authEmulatorHost) {
        connectAuthEmulator(this.auth, appConfig.authEmulatorHost, { disableWarnings: true });
        console.log(`[Life Goals AI] Connected to Firebase Auth Emulator: ${appConfig.authEmulatorHost}`);
      }

      // Hook up ApiClient token provider
      api.setTokenProvider(async () => {
        return this.getIdToken();
      });

      // Subscribe to authentication state changes
      this.unsubscribeAuth = onAuthStateChanged(this.auth, async (firebaseUser) => {
        await this.handleAuthStateChange(firebaseUser);
      });

      this.isInitialized = true;
    } catch (err) {
      console.error('[Life Goals AI] Failed to initialize Firebase Auth:', err);
      appState.setState({
        authLoading: false,
        authError: 'Failed to initialize authentication service.',
      });
    }
  }

  /**
   * Handles user sign-in or sign-out transitions.
   */
  async handleAuthStateChange(firebaseUser) {
    if (firebaseUser) {
      this.currentUser = firebaseUser;

      // Inject fresh token provider into ApiClient
      api.setTokenProvider(async () => {
        return this.getIdToken();
      });

      // Update state immediately with Firebase User claims
      appState.setState({
        isAuthenticated: true,
        user: {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
        },
        authLoading: false,
      });

      // Fetch verified user profile from Flask backend (GET /api/v1/me)
      try {
        const response = await api.get('/me');
        if (response && response.data) {
          this.backendProfile = response.data;
          appState.setState({ backendUser: response.data });
        }
      } catch (err) {
        // Non-blocking: Backend profile sync failed, but Firebase user is authenticated
        console.warn('[Life Goals AI] Backend /me profile sync:', err.message);
      }
    } else {
      this.currentUser = null;
      this.backendProfile = null;
      api.setTokenProvider(null);

      appState.setState({
        isAuthenticated: false,
        user: null,
        backendUser: null,
        authLoading: false,
      });

      // If user is currently on a protected route, redirect to sign-in
      const currentRoute = appState.getState().currentRoute;
      const isPublicRoute = ['sign-in', 'sign-up', 'reset-password'].includes(currentRoute);
      if (!isPublicRoute && typeof window !== 'undefined') {
        window.location.hash = '#/sign-in';
      }
    }
  }

  /**
   * Retrieves a fresh, cryptographically signed Firebase ID token.
   */
  async getIdToken(forceRefresh = false) {
    if (!this.currentUser) return null;
    try {
      return await this.currentUser.getIdToken(forceRefresh);
    } catch (err) {
      console.error('[Life Goals AI] Failed to obtain ID token:', err);
      return null;
    }
  }

  /**
   * Sign in with email and password.
   */
  async signIn(email, password) {
    if (!this.auth) {
      throw new Error('Authentication service is not configured. Please check your .env.local setup.');
    }

    try {
      const cred = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      return cred.user;
    } catch (err) {
      throw new Error(this.mapFirebaseError(err.code || err.message));
    }
  }

  /**
   * Register a new user account with email, password, and display name.
   */
  async signUp(email, password, displayName = '') {
    if (!this.auth) {
      throw new Error('Authentication service is not configured. Please check your .env.local setup.');
    }

    try {
      const cred = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
      if (displayName && displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      return cred.user;
    } catch (err) {
      throw new Error(this.mapFirebaseError(err.code || err.message));
    }
  }

  /**
   * Send a password reset email.
   */
  async sendPasswordReset(email) {
    if (!this.auth) {
      throw new Error('Authentication service is not configured. Please check your .env.local setup.');
    }

    try {
      await sendPasswordResetEmail(this.auth, email.trim());
      return true;
    } catch (err) {
      throw new Error(this.mapFirebaseError(err.code || err.message));
    }
  }

  /**
   * Sign out and clear active session.
   */
  async signOut() {
    if (!this.auth) {
      appState.setState({ isAuthenticated: false, user: null, backendUser: null });
      return;
    }

    try {
      await firebaseSignOut(this.auth);
    } catch (err) {
      console.error('[Life Goals AI] Sign out error:', err);
    }
  }

  /**
   * Maps Firebase internal error codes to clear, accessible user messages.
   */
  mapFirebaseError(code) {
    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password. Please verify your credentials and try again.';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email address. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters long.';
      case 'auth/too-many-requests':
        return 'Too many unsuccessful attempts. Access has been temporarily restricted. Please try again later or reset your password.';
      case 'auth/network-request-failed':
        return 'Network connection failed. Please check your internet connection.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';
      default:
        return 'Authentication failed. Please check your details and try again.';
    }
  }

  destroy() {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
    }
  }
}

export const authService = new AuthService();
