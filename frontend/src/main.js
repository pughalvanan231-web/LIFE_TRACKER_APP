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

  console.log('Life Goals AI frontend foundation successfully initialized.');
});
