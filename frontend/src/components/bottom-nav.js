/**
 * Mobile Bottom Navigation Component
 */

export function renderBottomNav(currentRoute) {
  const mobileNavItems = [
    {
      route: 'home',
      label: 'Home',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
    },
    {
      route: 'goals',
      label: 'Goals',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>`,
    },
    {
      route: 'tasks',
      label: 'Tasks',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/></svg>`,
    },
    {
      route: 'progress',
      label: 'Progress',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    },
    {
      route: 'reports',
      label: 'Reports',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
    },
  ];

  return `
    <nav class="mobile-bottom-nav" aria-label="Mobile Navigation">
      ${mobileNavItems
        .map(
          (item) => `
        <a href="#/${item.route}" class="mobile-nav-item ${currentRoute === item.route ? 'active' : ''}" data-route="${item.route}">
          ${item.icon}
          <span>${item.label}</span>
        </a>
      `
        )
        .join('')}
    </nav>
  `;
}
