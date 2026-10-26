/**
 * Settings & Preferences Page Component
 */

export function renderSettingsPage() {
  return `
    <div class="page-container">
      <div>
        <h2>Settings & Preferences</h2>
        <p class="text-sm text-muted">Configure your local timezone, notification channels, and account preferences.</p>
      </div>

      <div class="flex flex-col gap-6" style="max-width: 760px;">
        <!-- Time Zone & Closing Schedule -->
        <section class="card flex flex-col gap-4">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <h3 class="card-title">Time Zone & Midnight Closing</h3>
              <p class="card-subtitle">Server-side scheduled jobs respect your local day boundary.</p>
            </div>
            <span class="badge badge-primary">Essential</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="setting-timezone">Local Time Zone</label>
            <select id="setting-timezone" class="form-select">
              <option value="UTC" selected>UTC (Coordinated Universal Time)</option>
              <option value="America/New_York">America/New_York (Eastern Time)</option>
              <option value="America/Chicago">America/Chicago (Central Time)</option>
              <option value="America/Denver">America/Denver (Mountain Time)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Europe/Paris">Europe/Paris (CET)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            </select>
            <span class="text-xs text-muted">Daily review closing occurs automatically at 00:00:00 in your configured local timezone.</span>
          </div>
        </section>

        <!-- Notification Preferences -->
        <section class="card flex flex-col gap-4">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <h3 class="card-title">Notifications & Reminders</h3>
              <p class="card-subtitle">Manage push reminders and daily summary alerts.</p>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <label class="flex items-center gap-3" style="cursor: pointer;">
              <input type="checkbox" checked style="width: 18px; height: 18px; accent-color: var(--color-primary-600);" />
              <div>
                <div class="text-sm font-semibold">Evening Review Reminders</div>
                <div class="text-xs text-muted">Notify me 1 hour prior to local midnight closing.</div>
              </div>
            </label>

            <label class="flex items-center gap-3" style="cursor: pointer;">
              <input type="checkbox" checked style="width: 18px; height: 18px; accent-color: var(--color-primary-600);" />
              <div>
                <div class="text-sm font-semibold">Overdue Milestone Alerts</div>
                <div class="text-xs text-muted">Alert when a key milestone has passed without completion.</div>
              </div>
            </label>

            <label class="flex items-center gap-3" style="cursor: pointer;">
              <input type="checkbox" checked style="width: 18px; height: 18px; accent-color: var(--color-primary-600);" />
              <div>
                <div class="text-sm font-semibold">Weekly Monday Morning Summary</div>
                <div class="text-xs text-muted">Prepare and send a performance digest on Monday at 08:00 AM.</div>
              </div>
            </label>
          </div>
        </section>

        <!-- Theme & Appearance -->
        <section class="card flex flex-col gap-4">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <h3 class="card-title">Appearance</h3>
              <p class="card-subtitle">Visual theme and surface styling</p>
            </div>
          </div>

          <div class="flex gap-4">
            <div style="border: 2px solid var(--color-primary-600); border-radius: var(--radius-lg); padding: var(--space-4); background-color: var(--color-surface-card); flex: 1; cursor: pointer;">
              <div class="font-bold text-sm">Light Warm Neutral (Default)</div>
              <div class="text-xs text-muted" style="margin-top: 2px;">Warm paper surfaces, deep charcoal text, accessible contrast.</div>
            </div>
            <div style="border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); padding: var(--space-4); background-color: #1e1e24; color: #f3f3f3; flex: 1; opacity: 0.6; cursor: not-allowed;" title="Dark theme ready for subsequent release">
              <div class="font-bold text-sm">Sleek Obsidian (Coming Soon)</div>
              <div class="text-xs" style="margin-top: 2px; color: #a0a0a0;">Dark slate surfaces with glowing indigo highlights.</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
