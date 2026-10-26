# Life Goals AI — Frontend Foundation

> **Phase 1: Professional Frontend Foundation**  
> Mindful productivity, purposeful goal tracking, and daily planning powered by intelligent assistance.

---

## 🎨 Design Philosophy & Aesthetics

Life Goals AI uses a warm, editorial, and calm personal productivity design system:
- **Warm Neutral Surfaces:** Soft paper tones (`#f8f6f0`, `#ffffff`, `#fcfbf8`) avoiding cold tech starkness.
- **Deep Charcoal Text:** High contrast, accessible typography (`#191c24`, `#3b4252`) using `Plus Jakarta Sans`.
- **Restrained Indigo & Teal Accents:** Focus accents (`#4f46e5`, `#0d9488`) providing visual hierarchy without overwhelming.
- **Soft Pastel Sticky Notes:** Mindful prompt cards in soft cream yellow, sage mint, sky blush, and lilac.
- **Responsive Layout:**
  - **Desktop (>= 1024px):** Fixed left navigation sidebar with clean section groupings.
  - **Mobile (< 1024px):** Fixed ergonomic bottom navigation bar for quick one-handed access.
- **Light Theme Default:** Optimized for clarity and calm daily focus.

---

## 🛠 Technology Stack

- **Core:** HTML5, CSS3, Pure Vanilla JavaScript (ES Modules).
- **Tooling & Bundler:** [Vite](https://vitejs.dev/) for sub-millisecond HMR and optimized production bundles.
- **Zero Framework Bloat:** No React, Next.js, or Vue dependencies. Maximum performance and maintainability.

---

## 📁 Directory Structure

```text
frontend/
├── index.html               # Semantic HTML5 entry document
├── package.json             # NPM package scripts & Vite dev dependency
├── vite.config.js           # Vite dev server and build configuration
├── public/
│   └── favicon.svg          # Mindful SVG application icon
├── src/
│   ├── main.js              # Application entry point & router init
│   ├── app.js               # Application Shell coordinator & event binding
│   ├── components/          # Reusable UI components
│   │   ├── sidebar.js       # Desktop navigation sidebar
│   │   ├── bottom-nav.js    # Mobile bottom navigation
│   │   ├── header.js        # Sticky top header with route titles & actions
│   │   ├── modal.js         # Accessible modal dialogs
│   │   ├── toast.js         # Floating notification toasts
│   │   ├── loading-state.js # Reusable loading spinner & status
│   │   ├── empty-state.js   # Reusable empty state cards
│   │   └── retryable-error.js # Reusable error alert with retry & correlation IDs
│   ├── pages/               # Application view controllers
│   │   ├── home.js          # Main dashboard with metrics and focus tasks
│   │   ├── goals.js         # Goals & Milestones list with progress tracks
│   │   ├── tasks.js         # Daily task scheduling & status filters
│   │   ├── progress.js      # Evening review submission & progress formulas
│   │   ├── reports.js       # Periodic performance analytics & breakdowns
│   │   └── settings.js      # Time zone, notification & theme settings
│   ├── services/
│   │   ├── auth-service.js  # Official modular Firebase Auth integration & token provider
│   │   ├── api-client.js    # Shared fetch wrapper with timeout & correlation IDs
│   │   ├── api-error.js     # Standardized ApiError class & user-friendly messages
│   │   ├── config.js        # Environment configuration resolver
│   │   ├── mock-adapter.js  # Separated mock API adapter for offline dev
│   │   ├── router.js        # Client-side hash router with authentication route guards
│   │   ├── state.js         # Centralized pub/sub state manager
│   │   └── fixtures.js      # Development demo fixtures for UI preview
│   ├── pages/               # Application view controllers
│   │   ├── auth/            # Dedicated authentication views
│   │   │   ├── auth-card-layout.js # Centered mindful branding layout
│   │   │   ├── sign-in.js   # Sign-in form with validation & show/hide password
│   │   │   ├── sign-up.js   # Registration form with password requirements
│   │   │   └── reset-password.js # Password reset request & confirmation
│   │   ├── home.js          # Main dashboard with metrics and focus tasks
│   │   ├── goals.js         # Goals & Milestones list with progress tracks
│   │   ├── tasks.js         # Daily task scheduling & status filters
│   │   ├── progress.js      # Evening review submission & progress formulas
│   │   ├── reports.js       # Periodic performance analytics & breakdowns
│   │   ├── settings.js      # Time zone, notification & theme settings
│   │   └── profile.js       # User identity claims, backend verification & sign-out
│   ├── styles/
│   │   ├── tokens.css       # Design tokens (colors, typography, spacing)
│   │   ├── global.css       # Resets, utilities, sticky note styling
│   │   ├── layout.css       # Application shell & grid layout
│   │   ├── components.css   # Buttons, cards, badges, inputs, dialogs
│   │   └── responsive.css   # Breakpoints for tablet and mobile
│   └── utils/
│       ├── dom.js           # Safe DOM manipulation helpers
│       └── formatters.js    # Date, percentage, duration formatters
└── tests/
    ├── api-client.test.js   # API client, error mapping, timeout & header tests
    ├── auth.test.js         # Firebase Auth service, error mapping & lifecycle tests
    └── basic.test.js        # Router, formatters, and fixtures tests
```

---

## 🔐 Firebase Authentication & Security Architecture

Life Goals AI uses official modular **Firebase Authentication** client SDK for client identity and session management, while the Flask backend verifies tokens via Firebase Admin SDK.

### 1. Required Client Configuration (`.env.local`)
Copy `frontend/.env.example` to `frontend/.env.local`:
```bash
cp frontend/.env.example frontend/.env.local
```

Populate the client-safe public Firebase configuration:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890

# Optional: Local Firebase Auth Emulator Host for development
# VITE_FIREBASE_AUTH_EMULATOR_HOST=http://127.0.0.1:9099
```

### 2. Client Authentication Lifecycle
1. **Zero Secret Exposure:** Only client-safe public configuration is exposed in the frontend bundle. No service accounts or server secrets are ever placed in frontend files.
2. **Cryptographic ID Token Handshake:** On user sign-in, Firebase Auth mints a signed JWT ID token. The `AuthService` injects this token into `ApiClient`, which transmits it in the `Authorization: Bearer <ID_TOKEN>` header for all protected backend requests.
3. **Backend Profile Verification:** After successful sign-in, the client queries `GET /api/v1/me` to verify backend authorization and display account data.
4. **Navigation Route Guards:**
   - Unauthenticated users attempting to access protected routes (`#/home`, `#/goals`, `#/tasks`, etc.) are automatically redirected to `#/sign-in`.
   - Authenticated users navigating to `#/sign-in` or `#/sign-up` are automatically redirected to `#/home`.
   - Signing out revokes client tokens, clears user claims, and safely returns to `#/sign-in`.

---

## 🌐 API Client & Network Architecture

The frontend integrates with the Flask backend via a centralized, robust API layer:

### 1. Environment Configuration (`.env.example`)
Copy `.env.example` to `.env.local` to override settings locally:
```bash
cp .env.example .env.local
```
- `VITE_API_BASE_URL`: Root URL of the REST API (default: `http://127.0.0.1:5000/api/v1`).
- `VITE_API_TIMEOUT_MS`: Request timeout in milliseconds (default: `15000` / 15s).
- `VITE_USE_MOCK_API`: Explicit toggle for offline UI development without backend (strictly disabled in production).

### 2. Security & Zero-Trust Perimeter
- **Zero Server Secrets:** No Gemini API keys, Firebase Admin credentials, or server secrets exist in the frontend bundle.
- **Trusted Identity Context:** The browser never supplies arbitrary user IDs as proof of identity. The backend derives the authenticated user identity strictly from verified tokens.
- **Masked Internal Errors:** Raw server tracebacks and internal connection errors are never shown to the user; clean user-friendly descriptions and correlation reference IDs are presented instead.

### 3. Error Mapping Matrix
| Status | Error Code | Behavior | Retryable |
| :--- | :--- | :--- | :--- |
| `400` | `BAD_REQUEST` | Validation error description presented | No |
| `401` | `UNAUTHORIZED` | Session expired notice | No |
| `403` | `FORBIDDEN` | Access denied notice | No |
| `404` | `NOT_FOUND` | Resource missing / removed | No |
| `409` | `CONFLICT` | Resource already exists notice | No |
| `422` | `UNPROCESSABLE_ENTITY` | Form field validation errors | No |
| `429` | `RATE_LIMIT_EXCEEDED` | Displays `Retry-After` seconds countdown | **Yes** |
| `500+`| `INTERNAL_SERVER_ERROR` | Friendly error notice + request reference ID | **Yes** |
| `Timeout`| `REQUEST_TIMEOUT` | Network timeout notice | **Yes** |


---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Run Automated Tests
```bash
npm test
```

### 3. Run Local Development Server
```bash
npm run dev
```
The server will start at: **`http://127.0.0.1:5173`**

### 4. Production Build
```bash
npm run build
```

### 5. Preview Production Build
```bash
npm run preview
```

---

## 🧪 Development Preview Fixtures

- By default, the application opens in a **clean empty state** with helpful onboarding prompts.
- Click the **"Preview Demo Data"** button in the top header to toggle sample development fixtures (goals, tasks, and completion metrics).
- A persistent banner clearly informs the user that demo records are for presentation only and are not real saved user data.

