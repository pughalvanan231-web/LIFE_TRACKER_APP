/**
 * Client-Side Hash Router with Authentication Route Guards
 */

import { appState } from './state.js';

export const PUBLIC_AUTH_ROUTES = ['sign-in', 'sign-up', 'reset-password'];
export const PROTECTED_ROUTES = ['home', 'goals', 'tasks', 'progress', 'reports', 'settings', 'profile'];
export const VALID_ROUTES = [...PUBLIC_AUTH_ROUTES, ...PROTECTED_ROUTES];

export class Router {
  constructor() {
    this.handleHashChange = this.handleHashChange.bind(this);
  }

  init() {
    window.addEventListener('hashchange', this.handleHashChange);
    // Initial dispatch
    this.handleHashChange();
  }

  handleHashChange() {
    const rawHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    let route = VALID_ROUTES.includes(rawHash) ? rawHash : 'home';

    const state = appState.getState();

    // Route Protection Logic (when auth is done loading)
    if (!state.authLoading) {
      if (!state.isAuthenticated && PROTECTED_ROUTES.includes(route)) {
        // Unauthenticated user trying to access protected workspace -> redirect to sign-in
        route = 'sign-in';
      } else if (state.isAuthenticated && PUBLIC_AUTH_ROUTES.includes(route)) {
        // Authenticated user trying to access sign-in / sign-up -> redirect to dashboard
        route = 'home';
      }
    }

    // Sync browser hash if redirected or empty
    if (window.location.hash !== `#/${route}`) {
      window.location.hash = `#/${route}`;
    }

    appState.setRoute(route);
  }

  navigate(route) {
    if (VALID_ROUTES.includes(route)) {
      window.location.hash = `#/${route}`;
    }
  }

  destroy() {
    window.removeEventListener('hashchange', this.handleHashChange);
  }
}

export const router = new Router();
