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
│   │   └── toast.js         # Floating notification toasts
│   ├── pages/               # Application view controllers
│   │   ├── home.js          # Main dashboard with metrics and focus tasks
│   │   ├── goals.js         # Goals & Milestones list with progress tracks
│   │   ├── tasks.js         # Daily task scheduling & status filters
│   │   ├── progress.js      # Evening review submission & progress formulas
│   │   ├── reports.js       # Periodic performance analytics & breakdowns
│   │   └── settings.js      # Time zone, notification & theme settings
│   ├── services/
│   │   ├── router.js        # Client-side hash router (#/home, #/goals, etc.)
│   │   ├── state.js         # Centralized pub/sub state manager
│   │   └── fixtures.js      # Development demo fixtures for UI preview
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
```

---

## 🚀 Getting Started

### 1. Install Dependencies
Navigate to the `frontend/` directory and install dependencies:
```bash
cd frontend
npm install
```

### 2. Run Local Development Server
Start the Vite development server with Hot Module Replacement:
```bash
npm run dev
```
The server will start at: **`http://127.0.0.1:5173`**

### 3. Production Build
Compile and bundle optimized static assets for release:
```bash
npm run build
```
The generated bundle will be written to `frontend/dist/`.

### 4. Preview Production Build
Locally preview the production build:
```bash
npm run preview
```

---

## 🧪 Development Preview Fixtures

- By default, the application opens in a **clean empty state** with helpful onboarding prompts.
- Click the **"Preview Demo Data"** button in the top header to toggle sample development fixtures (goals, tasks, and completion metrics).
- A persistent banner clearly informs the user that demo records are for presentation only and are not real saved user data.
