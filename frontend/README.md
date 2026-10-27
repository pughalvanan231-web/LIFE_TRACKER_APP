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

---

## 📱 Progressive Web App (PWA) & Offline Architecture

Life Goals AI is fully compliant with the modern PWA specification:
- **Web App Manifest (`public/manifest.json`)**: Configured with `display: standalone`, primary portrait orientation, theme color `#4f46e5`, background color `#0b0f19`, and responsive application icons (192x192, 512x512, and SVG).
- **Service Worker (`public/sw.js`)**:
  - Automatically registers on secure origins (`https:` or `localhost`).
  - Pre-caches core application shell assets: `index.html`, `offline.html`, `manifest.json`, and branding icons.
  - Employs cache-first with network revalidation for static scripts and styles.
  - **CRITICAL SECURITY RULE**: Never caches authenticated backend API requests (`/api/v1/*`) or requests bearing `Authorization` headers. If the device is offline, API calls fail cleanly with status 503 and a structured error object, ensuring sensitive personal records are never persisted in shared browser caches.
- **Safe Offline Fallback (`public/offline.html`)**: When the user navigates without an internet connection, a reassuring branded offline screen explains the status and provides a one-tap reconnect button.

### 📲 Installation Instructions

#### Android (Google Chrome & Chromium)
1. Open the application in Google Chrome over HTTPS.
2. An **"Add Life Goals AI to Home screen"** prompt will appear automatically at the bottom of the screen.
3. Alternatively, tap the **⋮ (three dots)** menu in the top-right corner and select **"Install app"** or **"Add to Home screen"**.
4. Confirm by tapping **Install**. The app will launch in standalone window mode without browser URL bars.

#### iOS / iPadOS (Safari)
1. Open the application in Safari over HTTPS.
2. Tap the **Share button** (square with an upward arrow) in the bottom toolbar.
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **Add** in the top-right corner. The app will appear on your Home Screen as a standalone web application.

#### Desktop (Chrome / Edge)
1. In the address bar, look for the **Install icon** on the right side.
2. Click **Install Life Goals AI** to run it as a dedicated desktop window.

### 🔒 HTTPS Deployment Guidelines
Service workers, native notifications, and PWA installation strictly require an HTTPS context. When deploying:
1. Use an automated SSL certificate provider such as Let's Encrypt, Cloudflare SSL, or Firebase Hosting.
2. Enforce HTTP-to-HTTPS automatic redirection.
3. Ensure the backend REST API is hosted on an HTTPS domain (e.g. `https://api.lifegoals.ai`).

---

## 🤖 Android Native Packaging (Capacitor)

Life Goals AI includes native Android packaging configuration powered by [Capacitor](https://capacitorjs.com/):
- **Application ID:** `com.lifegoals.ai`
- **Application Name:** `Life Goals AI`
- **Configuration File:** [`capacitor.config.json`](file:///d:/projects/life_tracker_app/frontend/capacitor.config.json)
- **Native Android Directory:** [`frontend/android`](file:///d:/projects/life_tracker_app/frontend/android)
- **Security Rule:** Enforces `androidScheme: "https"` with `cleartext: false` to strictly prevent unencrypted HTTP traffic.

### 🧱 Environment Prerequisites for Building the APK
To assemble the native debug or release APK, the following build environment dependencies are required:
1. **JDK 17 or JDK 21**: Modern Gradle 8.14+ and Android Gradle Plugin 8.x require Java 17+.
2. **Android SDK & Build Tools**: Android SDK Platform 34 or 35 and Build-Tools 34.0.0+.
3. **Environment Variables**:
   - `ANDROID_HOME` or `ANDROID_SDK_ROOT` pointing to your local Android SDK directory (e.g. `C:\Users\<user>\AppData\Local\Android\Sdk`).
   - `JAVA_HOME` pointing to JDK 17+.

### ⚙️ Build Steps (Once Prerequisites are Installed)
```bash
# 1. Build the fresh production web bundle
npm run build

# 2. Sync the web assets into the native Android assets directory
npx cap sync android

# 3. Assemble the Debug APK using Gradle
cd android
./gradlew assembleDebug

# Output APK location:
# frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

### ⚠️ Current Environment Status & Blocker Report
- **Capacitor Android Project:** Fully scaffolded and synchronized with latest web assets in `frontend/android`.
- **Identified Blockers:**
  1. *Java Version:* Current host environment has legacy Java 8 (`1.8.0_401`), which cannot run Gradle 8.14+.
  2. *Android SDK:* `ANDROID_HOME` and `ANDROID_SDK_ROOT` are not defined in the environment.
- **Next Steps for Generating APK:** Install [Android Studio](https://developer.android.com/studio) or command-line tools with JDK 17, set `ANDROID_HOME`, and execute `cd android && ./gradlew assembleDebug`.


