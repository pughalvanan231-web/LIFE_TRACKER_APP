/**
 * Application Entry Point
 * Initializes router and mounts the App shell.
 */

import { App } from './app.js';
import { router } from './services/router.js';

document.addEventListener('DOMContentLoaded', () => {
  const mountEl = document.getElementById('app');
  if (!mountEl) {
    console.error('Fatal: #app root element not found.');
    return;
  }

  const app = new App(mountEl);
  app.init();
  router.init();

  // Register PWA Service Worker
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker active with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  console.log('Life Goals AI frontend foundation successfully initialized.');
});

