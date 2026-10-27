/**
 * Application Top Header Component
 */

const ROUTE_TITLES = {
  home: { title: 'Dashboard', subtitle: 'Mindful productivity & daily alignment' },
  goals: { title: 'Goals & Milestones', subtitle: 'Long-term aspirations and measurable progress' },
  tasks: { title: 'Daily Tasks & Planning', subtitle: 'Actionable steps aligned to your priorities' },
  progress: { title: 'Daily Review & Progress', subtitle: 'Reflection, habit consistency, and completion tracking' },
  reports: { title: 'Reports & Analytics', subtitle: 'Historical performance breakdowns and trends' },
  focus: { title: 'Focus Mode', subtitle: 'Distraction-free single task execution and session tracking' },
  settings: { title: 'Settings', subtitle: 'Preferences, time zones, and notifications' },
  profile: { title: 'Account & Profile', subtitle: 'Identity, security, and verified session claims' },
};

export function renderHeader(currentRoute, demoMode, user) {
  const meta = ROUTE_TITLES[currentRoute] || ROUTE_TITLES.home;
  const initials = user?.displayName ? user.displayName.substring(0, 2).toUpperCase() : 'LG';

  return `
    <header class="app-header">
      <div class="header-title-wrap">
        <button id="sidebar-toggle-btn" class="btn btn-ghost btn-icon mobile-menu-toggle" aria-label="Toggle Navigation Menu">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div>
          <h1 class="header-title">${meta.title}</h1>
          <p class="text-xs text-muted" style="margin-top: 1px;">${meta.subtitle}</p>
        </div>
      </div>

      <div class="header-actions">
        <!-- Demo Mode Toggle -->
        <button id="demo-mode-toggle-btn" class="btn ${demoMode ? 'btn-primary' : 'btn-outline'} btn-sm" title="Toggle sample preview fixtures for UI inspection">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          <span>${demoMode ? 'Demo Fixtures Active' : 'Preview Demo Data'}</span>
        </button>

        <!-- User Profile Avatar Pill -->
        <a href="#/profile" class="flex items-center gap-2" style="padding-left: var(--space-2); border-left: 1px solid var(--color-border-subtle);" title="Account Profile">
          <div style="width: 34px; height: 34px; border-radius: var(--radius-full); background: var(--color-primary-50); border: 1.5px solid var(--color-primary-200); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: var(--color-primary-700); transition: transform var(--transition-fast);">
            ${initials}
          </div>
        </a>
      </div>
    </header>
  `;
}
