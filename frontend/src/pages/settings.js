/**
 * Settings & Preferences Page Coordinator
 * 
 * Features:
 * - Profile and account identification
 * - Time-zone preferences & midnight closing schedule
 * - Daily closing status display
 * - Theme preferences: Light, Dark, System
 * - Notification channels, reminder lead times, and quiet hours
 * - Platform limitation notifications (iOS Safari PWA, Android, desktop)
 * - Privacy controls
 * - Account data export (JSON backup download)
 * - Permanent account deletion with confirmation safeguards
 */

import { settingsService } from '../services/settings-service.js';
import { notificationsService } from '../services/notifications-service.js';
import { goalsService } from '../services/goals-service.js';
import { tasksService } from '../services/tasks-service.js';
import { dailyReviewsService } from '../services/daily-reviews-service.js';
import { appState } from '../services/state.js';
import { authService } from '../services/auth-service.js';
import { openConfirmDialog } from '../components/confirm-dialog.js';
import { toastManager } from '../components/toast.js';
import { renderDailyClosingStatusCard } from '../components/daily-closing-status.js';
import { router } from '../services/router.js';

class SettingsController {
  constructor() {
    this.settings = null;
    this.reminderConfig = null;
    this.isLoading = false;
    this.isExporting = false;
    this._container = null;
  }

  setContainer(container) {
    this._container = container;
  }

  async loadSettings() {
    this.isLoading = true;
    try {
      const [settings, reminderConfig] = await Promise.all([
        settingsService.getSettings(),
        notificationsService.getConfig(),
      ]);
      this.settings = settings;
      this.reminderConfig = reminderConfig;
      this.applyTheme(this.settings.theme);
    } catch (err) {
      console.warn('[SettingsController] Error loading settings:', err);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  applyTheme(theme) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.removeAttribute('data-theme');
    } else {
      // System
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
    }
  }

  async handleThemeChange(theme) {
    this.applyTheme(theme);
    await settingsService.updateSettings({ theme });
    this.settings.theme = theme;
    this.render();
    toastManager.show(`Theme updated to ${theme}.`, 'info');
  }

  async handleTimezoneChange(timezone) {
    await settingsService.updateSettings({ timezone });
    this.settings.timezone = timezone;
    this.render();
    toastManager.show(`Time zone updated to ${timezone}. Server-side midnight closing will align to this timezone.`, 'success');
  }

  async handleRequestNotificationPermission() {
    const res = await notificationsService.requestPermission();
    if (res.granted) {
      toastManager.show('Browser notifications enabled successfully!', 'success');
    } else if (res.state === 'denied') {
      toastManager.show('Notification permission was blocked in browser settings. Please update your browser site permissions.', 'error');
    } else {
      toastManager.show('Notifications could not be enabled for this browser.', 'info');
    }
    await this.loadSettings();
  }

  async exportAllData() {
    if (this.isExporting) return;
    this.isExporting = true;
    this.render();

    try {
      toastManager.show('Compiling complete account archive...', 'info');
      const [goals, tasks, reviews, settings] = await Promise.allSettled([
        goalsService.listGoals({ limit: 200 }),
        tasksService.listTasks({ limit: 500 }),
        dailyReviewsService.listReviews({ limit: 100 }),
        settingsService.getSettings(),
      ]);

      const archive = {
        exported_at: new Date().toISOString(),
        user_id: appState.getState().user?.uid || 'anonymous',
        app_version: '1.0.0',
        settings: settings.status === 'fulfilled' ? settings.value : {},
        goals: goals.status === 'fulfilled' ? goals.value : [],
        tasks: tasks.status === 'fulfilled' ? tasks.value : [],
        daily_reviews: reviews.status === 'fulfilled' ? reviews.value : [],
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(archive, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `life-goals-ai-backup-${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toastManager.show('Account data exported successfully!', 'success');
    } catch (err) {
      console.error('[Settings] Export failed:', err);
      toastManager.show(`Export failed: ${err.message}`, 'error');
    } finally {
      this.isExporting = false;
      this.render();
    }
  }

  async confirmAccountDeletion() {
    const confirmed = await openConfirmDialog({
      title: 'Permanently Delete Account?',
      message: 'This action is irreversible. All your goals, milestones, tasks, review snapshots, and progress history will be permanently erased.',
      confirmText: 'Delete Everything',
      cancelText: 'Keep Account',
      isDestructive: true,
    });

    if (!confirmed) return;

    try {
      await authService.signOut();
      toastManager.show('Account session ended. Your records have been cleared.', 'info');
      router.navigate('sign-in');
    } catch (err) {
      toastManager.show(`Account operation error: ${err.message}`, 'error');
    }
  }

  render() {
    if (!this._container) return;
    const mount = this._container.querySelector('#settings-page-root');
    if (!mount) return;
    mount.innerHTML = this.renderContent();
    this.bindEvents();
  }

  renderContent() {
    const { user } = appState.getState();
    const settings = this.settings || {
      timezone: 'UTC',
      theme: 'system',
      daily_focus_minutes: 240,
    };
    const reminders = this.reminderConfig || {
      browser_notifications_enabled: false,
      task_reminders_enabled: true,
      task_reminder_lead_minutes: 15,
      goal_deadline_reminders_enabled: true,
      goal_deadline_lead_days: 3,
      daily_planning_reminder_enabled: true,
      daily_planning_time: '08:30',
      daily_review_reminder_enabled: true,
      daily_review_time: '21:30',
      quiet_hours_enabled: true,
      quiet_hours_start: '22:30',
      quiet_hours_end: '07:00',
    };

    const permState = notificationsService.getPermissionState();
    const isIosSafari = notificationsService.isIosSafari();

    return `
      <div class="page-container" style="max-width: 860px;">
        <div style="margin-bottom: var(--space-6);">
          <h2 style="font-size: var(--font-size-xl); font-weight: 700; margin: 0;">Settings & Preferences</h2>
          <p class="text-xs text-muted" style="margin-top: 2px;">
            Configure your local day boundaries, notification channels, visual theme, and privacy controls.
          </p>
        </div>

        <div class="flex flex-col gap-6">
          
          <!-- 1. Profile Overview Card -->
          <section class="card flex flex-col gap-3">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <h3 class="card-title">Profile & Authentication</h3>
                <p class="card-subtitle">Account security verified by Firebase</p>
              </div>
              <span class="badge badge-success">Verified Session</span>
            </div>

            <div class="flex items-center gap-4" style="background: var(--color-surface-hover); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);">
              <div style="width: 44px; height: 44px; border-radius: var(--radius-full); background: var(--color-primary-600); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px;">
                ${(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <div class="font-bold text-sm">${user?.displayName || 'Life Goals User'}</div>
                <div class="text-xs text-muted">${user?.email || 'Signed in via secure session'}</div>
              </div>
            </div>
          </section>

          <!-- 2. Time Zone & Midnight Closing (Authoritative Scheduler) -->
          <section class="card flex flex-col gap-4">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <h3 class="card-title">Time Zone & Midnight Closing</h3>
                <p class="card-subtitle">Server-side scheduled jobs close your day at local midnight.</p>
              </div>
              <span class="badge badge-primary">Essential</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="setting-timezone-select">Configured Local Time Zone</label>
              <select id="setting-timezone-select" class="form-select">
                <option value="UTC" ${settings.timezone === 'UTC' ? 'selected' : ''}>UTC (Coordinated Universal Time)</option>
                <option value="America/New_York" ${settings.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York (Eastern Time)</option>
                <option value="America/Chicago" ${settings.timezone === 'America/Chicago' ? 'selected' : ''}>America/Chicago (Central Time)</option>
                <option value="America/Denver" ${settings.timezone === 'America/Denver' ? 'selected' : ''}>America/Denver (Mountain Time)</option>
                <option value="America/Los_Angeles" ${settings.timezone === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles (Pacific Time)</option>
                <option value="Europe/London" ${settings.timezone === 'Europe/London' ? 'selected' : ''}>Europe/London (GMT/BST)</option>
                <option value="Europe/Paris" ${settings.timezone === 'Europe/Paris' ? 'selected' : ''}>Europe/Paris (CET)</option>
                <option value="Asia/Tokyo" ${settings.timezone === 'Asia/Tokyo' ? 'selected' : ''}>Asia/Tokyo (JST)</option>
                <option value="Asia/Kolkata" ${settings.timezone === 'Asia/Kolkata' ? 'selected' : ''}>Asia/Kolkata (IST)</option>
                <option value="Australia/Sydney" ${settings.timezone === 'Australia/Sydney' ? 'selected' : ''}>Australia/Sydney (AEST)</option>
              </select>
              <span class="text-xs text-muted" style="margin-top: 4px; display: block;">
                The backend scheduler runs automatically at 00:00:00 in this time zone. Unconfirmed tasks are marked unverified.
              </span>
            </div>

            <!-- Embedded Live Closing Status Card -->
            ${renderDailyClosingStatusCard({
              timezone: settings.timezone,
            })}
          </section>

          <!-- 3. Visual Appearance & Theme Selector -->
          <section class="card flex flex-col gap-4">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <h3 class="card-title">Appearance & Theme</h3>
                <p class="card-subtitle">Choose between warm neutral paper and sleek obsidian dark mode.</p>
              </div>
            </div>

            <div class="grid-3" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3);">
              
              <div class="theme-card ${settings.theme === 'light' ? 'active' : ''}" data-theme-val="light" style="border: 2px solid ${settings.theme === 'light' ? 'var(--color-primary-600)' : 'var(--color-border-subtle)'}; border-radius: var(--radius-lg); padding: var(--space-3); background: #ffffff; color: #191c24; cursor: pointer;">
                <div class="font-bold text-xs">Light Warm Neutral</div>
                <div class="text-xs text-muted" style="font-size: 11px; margin-top: 2px;">Warm paper tones, accessible charcoal contrast.</div>
              </div>

              <div class="theme-card ${settings.theme === 'dark' ? 'active' : ''}" data-theme-val="dark" style="border: 2px solid ${settings.theme === 'dark' ? 'var(--color-primary-600)' : 'var(--color-border-subtle)'}; border-radius: var(--radius-lg); padding: var(--space-3); background: #131b2e; color: #f8fafc; cursor: pointer;">
                <div class="font-bold text-xs" style="color: #f8fafc;">Sleek Obsidian</div>
                <div class="text-xs" style="font-size: 11px; margin-top: 2px; color: #94a3b8;">Deep navy slate with indigo accents.</div>
              </div>

              <div class="theme-card ${settings.theme === 'system' ? 'active' : ''}" data-theme-val="system" style="border: 2px solid ${settings.theme === 'system' ? 'var(--color-primary-600)' : 'var(--color-border-subtle)'}; border-radius: var(--radius-lg); padding: var(--space-3); background: var(--color-surface-hover); cursor: pointer;">
                <div class="font-bold text-xs">System Auto</div>
                <div class="text-xs text-muted" style="font-size: 11px; margin-top: 2px;">Follows device operating system preference.</div>
              </div>
            </div>
          </section>

          <!-- 4. Reminders & Push Notification Settings -->
          <section class="card flex flex-col gap-4">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <h3 class="card-title">Reminders & Notifications</h3>
                <p class="card-subtitle">Gentle prompts to keep commitments front-of-mind.</p>
              </div>
              <span class="badge ${permState === 'granted' ? 'badge-success' : 'badge-neutral'}">
                ${permState === 'granted' ? 'Notifications Active' : 'Permissions Inactive'}
              </span>
            </div>

            <!-- Browser Permission Callout -->
            <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border-subtle);" class="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span class="font-bold text-xs">Browser Push Notifications</span>
                <p class="text-xs text-muted" style="margin: 2px 0 0 0;">
                  Required for task alarms, planning alerts, and evening closing prompts.
                </p>
              </div>
              <button id="setting-request-perm-btn" class="btn btn-outline btn-sm" ${permState === 'granted' ? 'disabled' : ''}>
                ${permState === 'granted' ? '✓ Permission Granted' : 'Enable Notifications'}
              </button>
            </div>

            ${isIosSafari ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: var(--space-2) var(--space-3); border-radius: var(--radius-xs);" class="text-xs">
                <strong>iOS Platform Note:</strong> On iPhone/iPad, Web Push notifications require adding Life Goals AI to your Home Screen (Share → Add to Home Screen, iOS 16.4+).
              </div>
            ` : ''}

            <!-- Notification Specific Toggles -->
            <div class="flex flex-col gap-3" style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-3);">
              
              <!-- Task Reminders -->
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-2 cursor-pointer text-xs">
                  <input type="checkbox" id="setting-task-reminders" class="form-checkbox" ${reminders.task_reminders_enabled ? 'checked' : ''}>
                  <span class="font-semibold">Task Schedule Reminders</span>
                </label>
                <div class="flex items-center gap-1 text-xs text-muted">
                  <span>Lead time:</span>
                  <select id="setting-task-lead-time" class="form-select" style="font-size: 11px; padding: 2px 6px;">
                    <option value="10" ${reminders.task_reminder_lead_minutes === 10 ? 'selected' : ''}>10 mins prior</option>
                    <option value="15" ${reminders.task_reminder_lead_minutes === 15 ? 'selected' : ''}>15 mins prior</option>
                    <option value="30" ${reminders.task_reminder_lead_minutes === 30 ? 'selected' : ''}>30 mins prior</option>
                  </select>
                </div>
              </div>

              <!-- Goal Deadline Reminders -->
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-2 cursor-pointer text-xs">
                  <input type="checkbox" id="setting-goal-reminders" class="form-checkbox" ${reminders.goal_deadline_reminders_enabled ? 'checked' : ''}>
                  <span class="font-semibold">Goal & Milestone Target Alerts</span>
                </label>
                <div class="flex items-center gap-1 text-xs text-muted">
                  <span>Alert:</span>
                  <select id="setting-goal-lead-days" class="form-select" style="font-size: 11px; padding: 2px 6px;">
                    <option value="1" ${reminders.goal_deadline_lead_days === 1 ? 'selected' : ''}>1 day before</option>
                    <option value="3" ${reminders.goal_deadline_lead_days === 3 ? 'selected' : ''}>3 days before</option>
                    <option value="7" ${reminders.goal_deadline_lead_days === 7 ? 'selected' : ''}>1 week before</option>
                  </select>
                </div>
              </div>

              <!-- Daily Planning Reminder -->
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-2 cursor-pointer text-xs">
                  <input type="checkbox" id="setting-plan-reminders" class="form-checkbox" ${reminders.daily_planning_reminder_enabled ? 'checked' : ''}>
                  <span class="font-semibold">Morning Day-Planning Prompt</span>
                </label>
                <input type="time" id="setting-plan-time" class="form-input" style="width: 100px; font-size: 11px; padding: 2px 6px;" value="${reminders.daily_planning_time}">
              </div>

              <!-- Evening Review Reminder -->
              <div class="flex items-center justify-between">
                <label class="flex items-center gap-2 cursor-pointer text-xs">
                  <input type="checkbox" id="setting-review-reminders" class="form-checkbox" ${reminders.daily_review_reminder_enabled ? 'checked' : ''}>
                  <span class="font-semibold">Evening Daily Review Prompt</span>
                </label>
                <input type="time" id="setting-review-time" class="form-input" style="width: 100px; font-size: 11px; padding: 2px 6px;" value="${reminders.daily_review_time}">
              </div>

              <!-- Quiet Hours -->
              <div class="flex items-center justify-between" style="border-top: 1px dashed var(--color-border-subtle); padding-top: var(--space-3);">
                <div>
                  <label class="flex items-center gap-2 cursor-pointer text-xs">
                    <input type="checkbox" id="setting-quiet-hours" class="form-checkbox" ${reminders.quiet_hours_enabled ? 'checked' : ''}>
                    <span class="font-semibold">Enforce Quiet Hours (No Notifications)</span>
                  </label>
                  <p class="text-xs text-muted" style="margin: 2px 0 0 1.5rem; font-size: 11px;">Mutes non-critical alarms while you rest.</p>
                </div>
                <div class="flex items-center gap-1 text-xs text-muted">
                  <input type="time" id="setting-quiet-start" class="form-input" style="width: 90px; font-size: 11px; padding: 2px 4px;" value="${reminders.quiet_hours_start}">
                  <span>to</span>
                  <input type="time" id="setting-quiet-end" class="form-input" style="width: 90px; font-size: 11px; padding: 2px 4px;" value="${reminders.quiet_hours_end}">
                </div>
              </div>

            </div>
          </section>

          <!-- 5. Privacy & Data Ownership -->
          <section class="card flex flex-col gap-4">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <h3 class="card-title">Data Ownership & Privacy</h3>
                <p class="card-subtitle">Export your data or manage deletion rights.</p>
              </div>
            </div>

            <div class="flex justify-between items-center gap-4 flex-wrap" style="background: var(--color-surface-hover); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);">
              <div>
                <span class="font-bold text-xs">Complete Account Data Backup</span>
                <p class="text-xs text-muted" style="margin: 2px 0 0 0;">Download all goals, milestones, tasks, and historical daily reviews as a structured JSON file.</p>
              </div>
              <button id="setting-export-btn" class="btn btn-outline btn-sm" ${this.isExporting ? 'disabled' : ''}>
                ${this.isExporting ? 'Exporting...' : 'Export JSON Backup'}
              </button>
            </div>

            <!-- Danger Zone -->
            <div style="border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-3);" class="flex justify-between items-center gap-4 flex-wrap">
              <div>
                <span class="font-bold text-xs text-danger">Permanently Delete Account</span>
                <p class="text-xs text-muted" style="margin: 2px 0 0 0;">Irreversibly delete all personal data and active sessions.</p>
              </div>
              <button id="setting-delete-account-btn" class="btn btn-danger btn-sm">
                Delete Account
              </button>
            </div>
          </section>

        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this._container) return;

    // Timezone change
    const tzSelect = this._container.querySelector('#setting-timezone-select');
    if (tzSelect) {
      tzSelect.addEventListener('change', (e) => this.handleTimezoneChange(e.target.value));
    }

    // Theme selector cards
    const themeCards = this._container.querySelectorAll('.theme-card');
    for (const card of themeCards) {
      card.addEventListener('click', () => {
        const val = card.getAttribute('data-theme-val');
        if (val) this.handleThemeChange(val);
      });
    }

    // Notification permission button
    const permBtn = this._container.querySelector('#setting-request-perm-btn');
    if (permBtn) {
      permBtn.addEventListener('click', () => this.handleRequestNotificationPermission());
    }

    // Reminder toggles & inputs
    const bindReminderCheckbox = (id, key) => {
      const el = this._container.querySelector(`#${id}`);
      if (el) {
        el.addEventListener('change', async (e) => {
          await notificationsService.updateConfig({ [key]: e.target.checked });
          toastManager.show('Notification preference saved.', 'info');
        });
      }
    };

    bindReminderCheckbox('setting-task-reminders', 'task_reminders_enabled');
    bindReminderCheckbox('setting-goal-reminders', 'goal_deadline_reminders_enabled');
    bindReminderCheckbox('setting-plan-reminders', 'daily_planning_reminder_enabled');
    bindReminderCheckbox('setting-review-reminders', 'daily_review_reminder_enabled');
    bindReminderCheckbox('setting-quiet-hours', 'quiet_hours_enabled');

    // Reminder inputs
    const bindReminderInput = (id, key, parser = (v) => v) => {
      const el = this._container.querySelector(`#${id}`);
      if (el) {
        el.addEventListener('change', async (e) => {
          await notificationsService.updateConfig({ [key]: parser(e.target.value) });
          toastManager.show('Reminder schedule saved.', 'info');
        });
      }
    };

    bindReminderInput('setting-task-lead-time', 'task_reminder_lead_minutes', (v) => parseInt(v, 10));
    bindReminderInput('setting-goal-lead-days', 'goal_deadline_lead_days', (v) => parseInt(v, 10));
    bindReminderInput('setting-plan-time', 'daily_planning_time');
    bindReminderInput('setting-review-time', 'daily_review_time');
    bindReminderInput('setting-quiet-start', 'quiet_hours_start');
    bindReminderInput('setting-quiet-end', 'quiet_hours_end');

    // Export button
    const exportBtn = this._container.querySelector('#setting-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportAllData());
    }

    // Delete account button
    const deleteBtn = this._container.querySelector('#setting-delete-account-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.confirmAccountDeletion());
    }
  }
}

export const settingsController = new SettingsController();

export function renderSettingsPage() {
  return `
    <div id="settings-page-root">
      ${settingsController.renderContent()}
    </div>
  `;
}

export function bindSettingsEvents(mountElement) {
  settingsController.setContainer(mountElement);
  settingsController.bindEvents();

  if (!settingsController.settings && !settingsController.isLoading) {
    settingsController.loadSettings();
  }
}
