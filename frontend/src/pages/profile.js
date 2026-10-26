/**
 * Account & Profile Page Component
 */

export function renderProfilePage({ user, backendUser }) {
  const email = user?.email || 'Not available';
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const emailVerified = user?.emailVerified;
  const uid = user?.uid || 'Not available';

  const backendSynced = Boolean(backendUser && backendUser.uid);
  const backendEmail = backendUser?.email || email;

  return `
    <div class="page-container" style="max-width: 780px;">
      <div class="flex items-center justify-between">
        <div>
          <h2>Account & Identity</h2>
          <p class="text-sm text-muted">Manage your personal profile and verified authentication credentials.</p>
        </div>
        <button id="profile-signout-btn" class="btn btn-outline btn-sm">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>Sign Out</span>
        </button>
      </div>

      <!-- Identity Card -->
      <section class="card flex flex-col gap-6">
        <div class="flex items-center gap-4">
          <div style="width: 56px; height: 56px; border-radius: var(--radius-full); background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800)); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; box-shadow: var(--shadow-sm);">
            ${displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style="font-size: var(--font-size-lg); font-weight: 700;">${displayName}</h3>
            <div class="flex items-center gap-2" style="margin-top: 3px;">
              <span class="text-xs text-muted">${email}</span>
              <span class="badge ${emailVerified ? 'badge-success' : 'badge-warning'}">
                ${emailVerified ? 'Verified' : 'Unverified Email'}
              </span>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-4);" class="grid-2">
          <div class="form-group">
            <label class="form-label text-xs text-muted">Verified Firebase Identity (UID)</label>
            <div style="background-color: var(--color-surface-hover); padding: 0.5rem 0.75rem; border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary); word-break: break-all; border: 1px solid var(--color-border-subtle);">
              ${uid}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label text-xs text-muted">Backend Token Verification (/api/v1/me)</label>
            <div style="display: flex; align-items: center; gap: var(--space-2); padding: 0.5rem 0.75rem;">
              <span class="badge ${backendSynced ? 'badge-success' : 'badge-neutral'}">
                ${backendSynced ? '✓ Cryptographically Verified' : 'Awaiting sync'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Security Guarantees Section -->
      <section class="card flex flex-col gap-3">
        <h3 class="card-title" style="font-size: var(--font-size-md);">Security & Session Architecture</h3>
        <ul class="flex flex-col gap-2 text-xs text-muted" style="list-style: disc; padding-left: var(--space-4); line-height: 1.5;">
          <li>All API requests transmit a freshly signed Firebase ID token in the <code>Authorization: Bearer</code> header.</li>
          <li>Your unique user identifier is verified server-side using Google's public cryptographic keys.</li>
          <li>Passwords and private security tokens are never saved or accessible in browser local storage.</li>
          <li>Signing out revokes the client session and clears local authentication contexts immediately.</li>
        </ul>
      </section>
    </div>
  `;
}
