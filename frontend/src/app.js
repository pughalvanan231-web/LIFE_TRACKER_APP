/**
 * Application Core Shell Coordinator
 * Coordinates layout, routing, modal dialogs, and authentication lifecycle.
 */

import { appState } from './services/state.js';
import { authService } from './services/auth-service.js';
import { router, PUBLIC_AUTH_ROUTES, PROTECTED_ROUTES } from './services/router.js';

import { renderSidebar } from './components/sidebar.js';
import { renderBottomNav } from './components/bottom-nav.js';
import { renderHeader } from './components/header.js';
import { renderModal } from './components/modal.js';
import { renderToastContainer } from './components/toast.js';
import { renderLoadingState } from './components/loading-state.js';

// Application Pages
import { renderHomePage, bindHomeEvents } from './pages/home.js';
import { renderGoalsPage, bindGoalsEvents } from './pages/goals.js';
import { renderTasksPage, bindTasksEvents } from './pages/tasks.js';
import { renderProgressPage, bindProgressEvents } from './pages/progress.js';
import { renderReportsPage, bindReportsEvents } from './pages/reports.js';
import { renderSettingsPage, bindSettingsEvents, settingsController } from './pages/settings.js';
import { renderProfilePage } from './pages/profile.js';
import { renderFocusPage, bindFocusEvents } from './pages/focus.js';
import { destroyAllCharts } from './components/chart-helper.js';
import { DataEvents, DATA_TOPICS } from './services/data-events.js';

// Auth Pages
import { renderSignInPage } from './pages/auth/sign-in.js';
import { renderSignUpPage } from './pages/auth/sign-up.js';
import { renderResetPasswordPage } from './pages/auth/reset-password.js';

export class App {
  constructor(mountElement) {
    this.mount = mountElement;
    this.unsubscribe = null;
    this.isSubmittingAuth = false;
    this.authFormError = null;
    this.passwordResetSuccess = false;
  }

  init() {
    // 1. Initialize Firebase Auth
    authService.init();

    // 2. Load settings and apply theme
    settingsController.loadSettings();

    // 3. Register visibility return listener (refresh authoritative data on app focus)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          DataEvents.emit(DATA_TOPICS.PROGRESS_CHANGED, { action: 'app_resumed' });
          DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'app_resumed' });
        }
      });
      window.addEventListener('focus', () => {
        DataEvents.emit(DATA_TOPICS.PROGRESS_CHANGED, { action: 'app_resumed' });
        DataEvents.emit(DATA_TOPICS.TASKS_CHANGED, { action: 'app_resumed' });
      });
    }

    // 4. Subscribe to application state updates
    this.unsubscribe = appState.subscribe((state) => {
      this.render(state);
    });

    // 5. Initial render
    this.render(appState.getState());
  }

  render(state) {
    destroyAllCharts();
    const { currentRoute, demoMode, isSidebarOpen, modal, notifications, isAuthenticated, authLoading, user, backendUser } = state;

    // 1. Initial Session Verification Screen
    if (authLoading) {
      this.mount.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background-color: var(--color-surface-ground);">
          ${renderLoadingState({ message: 'Verifying secure session...', size: 'lg' })}
        </div>
      `;
      return;
    }

    // 2. Public Authentication Routes (Sign In, Sign Up, Password Reset)
    if (PUBLIC_AUTH_ROUTES.includes(currentRoute)) {
      if (isAuthenticated) {
        // Authenticated users shouldn't see login screens -> redirect to dashboard
        router.navigate('home');
        return;
      }

      let authHTML = '';
      switch (currentRoute) {
        case 'sign-in':
          authHTML = renderSignInPage({
            error: this.authFormError,
            isSubmitting: this.isSubmittingAuth,
          });
          break;
        case 'sign-up':
          authHTML = renderSignUpPage({
            error: this.authFormError,
            isSubmitting: this.isSubmittingAuth,
          });
          break;
        case 'reset-password':
          authHTML = renderResetPasswordPage({
            error: this.authFormError,
            isSuccess: this.passwordResetSuccess,
            isSubmitting: this.isSubmittingAuth,
          });
          break;
      }

      this.mount.innerHTML = `
        ${authHTML}
        ${renderToastContainer(notifications)}
      `;

      this.bindAuthEvents(currentRoute);
      return;
    }

    // 3. Protected Workspace Routes
    if (!isAuthenticated) {
      // Unauthenticated access strictly blocked -> redirect to sign-in
      router.navigate('sign-in');
      return;
    }

    // Render active workspace page
    let pageHTML = '';
    switch (currentRoute) {
      case 'home':
        pageHTML = renderHomePage(demoMode);
        break;
      case 'goals':
        pageHTML = renderGoalsPage(demoMode);
        break;
      case 'tasks':
        pageHTML = renderTasksPage(demoMode);
        break;
      case 'progress':
        pageHTML = renderProgressPage(demoMode);
        break;
      case 'reports':
        pageHTML = renderReportsPage(demoMode);
        break;
      case 'focus':
        pageHTML = renderFocusPage();
        break;
      case 'settings':
        pageHTML = renderSettingsPage();
        break;
      case 'profile':
        pageHTML = renderProfilePage({ user, backendUser });
        break;
      default:
        pageHTML = renderHomePage(demoMode);
    }

    this.mount.innerHTML = `
      ${renderSidebar(currentRoute, user)}
      <div class="app-main">
        ${renderHeader(currentRoute, demoMode, user)}
        <main id="main-content" role="main">
          ${pageHTML}
        </main>
      </div>
      ${renderBottomNav(currentRoute)}
      ${renderModal(modal)}
      ${renderToastContainer(notifications)}
    `;

    // Ensure responsive sidebar state matches
    const sidebarEl = this.mount.querySelector('#app-sidebar');
    if (sidebarEl) {
      if (isSidebarOpen) {
        sidebarEl.classList.add('open');
      } else {
        sidebarEl.classList.remove('open');
      }
    }

    this.bindWorkspaceEvents();
  }

  /**
   * Bind event listeners for authentication pages.
   */
  bindAuthEvents(currentRoute) {
    // Show / Hide Password Toggles
    const setupPasswordToggle = (toggleBtnId, inputId, iconId) => {
      const toggleBtn = this.mount.querySelector(`#${toggleBtnId}`);
      const input = this.mount.querySelector(`#${inputId}`);
      if (toggleBtn && input) {
        toggleBtn.addEventListener('click', () => {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          toggleBtn.title = isPassword ? 'Hide password' : 'Show password';
        });
      }
    };

    setupPasswordToggle('toggle-signin-password', 'signin-password', 'eye-icon-signin');
    setupPasswordToggle('toggle-signup-password', 'signup-password', 'eye-icon-signup');

    // 1. Sign In Form
    const signInForm = this.mount.querySelector('#sign-in-form');
    if (signInForm) {
      signInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (this.isSubmittingAuth) return;

        const email = this.mount.querySelector('#signin-email')?.value || '';
        const password = this.mount.querySelector('#signin-password')?.value || '';

        if (!email.trim() || !password) {
          this.authFormError = 'Please enter both your email and password.';
          this.render(appState.getState());
          return;
        }

        this.isSubmittingAuth = true;
        this.authFormError = null;
        this.render(appState.getState());

        try {
          await authService.signIn(email, password);
          appState.showToast('Welcome back! Signed in successfully.', 'success');
          router.navigate('home');
        } catch (err) {
          this.authFormError = err.message;
        } finally {
          this.isSubmittingAuth = false;
          this.render(appState.getState());
        }
      });
    }

    // 2. Sign Up Form
    const signUpForm = this.mount.querySelector('#sign-up-form');
    if (signUpForm) {
      signUpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (this.isSubmittingAuth) return;

        const name = this.mount.querySelector('#signup-name')?.value || '';
        const email = this.mount.querySelector('#signup-email')?.value || '';
        const password = this.mount.querySelector('#signup-password')?.value || '';
        const confirmPassword = this.mount.querySelector('#signup-confirm-password')?.value || '';

        if (!email.trim() || !password) {
          this.authFormError = 'Please fill in all required fields.';
          this.render(appState.getState());
          return;
        }

        if (password.length < 6) {
          this.authFormError = 'Password must be at least 6 characters long.';
          this.render(appState.getState());
          return;
        }

        if (password !== confirmPassword) {
          this.authFormError = 'Passwords do not match. Please verify and re-enter.';
          this.render(appState.getState());
          return;
        }

        this.isSubmittingAuth = true;
        this.authFormError = null;
        this.render(appState.getState());

        try {
          await authService.signUp(email, password, name);
          appState.showToast('Account created successfully! Welcome to Life Goals AI.', 'success');
          router.navigate('home');
        } catch (err) {
          this.authFormError = err.message;
        } finally {
          this.isSubmittingAuth = false;
          this.render(appState.getState());
        }
      });
    }

    // 3. Password Reset Form
    const resetForm = this.mount.querySelector('#reset-password-form');
    if (resetForm) {
      resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (this.isSubmittingAuth) return;

        const email = this.mount.querySelector('#reset-email')?.value || '';
        if (!email.trim()) {
          this.authFormError = 'Please enter your registered email address.';
          this.render(appState.getState());
          return;
        }

        this.isSubmittingAuth = true;
        this.authFormError = null;
        this.passwordResetSuccess = false;
        this.render(appState.getState());

        try {
          await authService.sendPasswordReset(email);
          this.passwordResetSuccess = true;
        } catch (err) {
          this.authFormError = err.message;
        } finally {
          this.isSubmittingAuth = false;
          this.render(appState.getState());
        }
      });
    }
  }

  /**
   * Bind event listeners for workspace navigation and actions.
   */
  bindWorkspaceEvents() {
    // 1. Sign Out Button (Profile Page)
    const signoutBtn = this.mount.querySelector('#profile-signout-btn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        await authService.signOut();
        appState.showToast('You have been signed out safely.', 'info');
        router.navigate('sign-in');
      });
    }

    // 2. Demo Mode Toggles
    const demoBtn = this.mount.querySelector('#demo-mode-toggle-btn');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        appState.toggleDemoMode();
      });
    }

    const disableDemoBtn = this.mount.querySelector('#disable-demo-btn');
    if (disableDemoBtn) {
      disableDemoBtn.addEventListener('click', () => {
        appState.toggleDemoMode();
      });
    }

    // 3. Mobile Sidebar Toggle
    const sidebarToggleBtn = this.mount.querySelector('#sidebar-toggle-btn');
    if (sidebarToggleBtn) {
      sidebarToggleBtn.addEventListener('click', () => {
        appState.toggleSidebar();
      });
    }

    // 4. Goals & Milestones Interactive Events
    bindGoalsEvents(this.mount);

    // 5. Tasks & Daily Planner Interactive Events
    bindTasksEvents(this.mount);

    // 6. Home Dashboard Interactive Events
    bindHomeEvents(this.mount);

    // 7. Daily Review & Progress Interactive Events
    bindProgressEvents(this.mount);

    // 8. Reports & Analytics Interactive Events
    bindReportsEvents(this.mount);

    // 9. Focus Mode Interactive Events
    bindFocusEvents(this.mount);

    // 10. Settings & Preferences Interactive Events
    bindSettingsEvents(this.mount);

    // 7. Modal Close / Cancel / Confirm
    const modalCloseBtn = this.mount.querySelector('#modal-close-btn');
    const modalCancelBtn = this.mount.querySelector('#modal-cancel-btn');
    const modalConfirmBtn = this.mount.querySelector('#modal-confirm-btn');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => appState.closeModal());
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', () => appState.closeModal());
    if (modalConfirmBtn) {
      modalConfirmBtn.addEventListener('click', () => {
        appState.closeModal();
        appState.showToast('Item submitted successfully', 'success');
      });
    }
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
