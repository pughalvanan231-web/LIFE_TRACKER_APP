/**
 * Client-Side Hash Router
 * Mindfully handles URL hash changes, browser history, and active page dispatching.
 */

import { appState } from './state.js';

export const VALID_ROUTES = ['home', 'goals', 'tasks', 'progress', 'reports', 'settings'];

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
    const route = VALID_ROUTES.includes(rawHash) ? rawHash : 'home';
    
    // Sync to window hash if empty or invalid
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
