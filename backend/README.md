# Life Goals AI - Backend Service

A secure, hardened Python/Flask backend foundation for the Life Goals AI platform featuring Firebase Authentication (JWT ID token verification), Cloud Firestore user-scoped data access layer, strict CORS allowlisting, comprehensive security headers, payload size enforcement, safe logging with automatic redaction, and extensible AI quota/rate limiting.

---

## 🛠 Tech Stack

- **Runtime**: Python 3.11+
- **Framework**: Flask 3.1.0 (Application Factory pattern)
- **Identity & Auth**: Firebase Authentication & Firebase Admin SDK (Cryptographic ID Token verification)
- **Database**: Cloud Firestore (User-scoped subcollections & transactions)
- **Validation**: Pydantic v2 (Strict request schema contracts)
- **Testing**: pytest (35 automated tests)
- **Linter & Formatter**: Ruff
- **Production WSGI Server**: Gunicorn (Linux/Container deployment)
- **Containerization**: Docker (Multi-stage non-root container)

---

## 📁 Directory Structure

```text
backend/
├── app/
│   ├── __init__.py               # Flask Application Factory (create_app)
│   ├── config.py                 # Typed configuration & production security validation
│   ├── exceptions.py             # Domain exceptions (AppException, UnauthorizedError, etc.)
│   ├── extensions.py             # Firebase Admin, Auth token verification & Firestore lifecycle
│   ├── api/
│   │   ├── __init__.py           # API blueprint registration
│   │   ├── health.py             # Configurable /health/live and /health/ready probes
│   │   └── v1/
│   │       ├── __init__.py       # /api/v1 blueprints (GET /api/v1/me, info)
│   │       ├── goals.py          # /api/v1/goals & milestone endpoints
│   │       ├── progress.py       # /api/v1/reviews & progress snapshot endpoints
│   │       └── tasks.py          # /api/v1/tasks endpoints & atomic completion toggle
│   ├── middleware/
│   │   ├── auth.py               # Reusable @require_auth & @require_ownership decorators
│   │   ├── cors.py               # Explicit origin-allowlist CORS enforcement
│   │   ├── error_handler.py      # Centralized error mapping (400, 401, 403, 404, 413, 415, 422, 429, 500)
│   │   ├── logging.py            # Structured JSON logging & sensitive data redaction
│   │   ├── rate_limit.py         # Route rate limiting & @ai_usage_limit decorators
│   │   ├── request_id.py         # Distributed request & correlation ID tracing
│   │   ├── request_validation.py # Payload size limits (1MB) & JSON integrity checks
│   │   └── security_headers.py   # Security headers (CSP, HSTS, X-Frame-Options, etc.)
│   ├── schemas/
│   │   ├── auth.py               # AuthenticatedUser context & SafeUserProfile models
│   │   ├── common.py             # Pydantic response & error contract models
│   │   ├── goal.py               # Goal request & response models
│   │   ├── milestone.py          # Milestone request & response models
│   │   ├── pagination.py         # Generic PaginatedListResponse schema
│   │   ├── progress.py           # DailyReview & ProgressSnapshot models
│   │   └── task.py               # Task request & response models
│   ├── repositories/
│   │   ├── base.py               # Abstract BaseRepository CRUD interface
│   │   ├── firestore_base.py     # Base Firestore repository (user-scoped document refs)
│   │   ├── goal_repository.py    # User-scoped goal repository
│   │   ├── milestone_repository.py # User-scoped milestone repository
│   │   ├── progress_repository.py# User-scoped daily review & snapshot repository
│   │   └── task_repository.py    # User-scoped task repository with transactions
│   ├── services/
│   │   ├── goal_service.py       # Goal business logic & pagination
│   │   ├── milestone_service.py  # Milestone logic & cross-user reference rejection
│   │   ├── progress_service.py   # Progress snapshot aggregation & reflection reviews
│   │   ├── rate_limiter.py       # Sliding-window rate limiter & quota manager
│   │   └── task_service.py       # Task service & atomic completion toggles
│   └── utils/
│       └── responses.py          # Standardized JSON response envelope helpers
├── tests/
│   ├── conftest.py               # Pytest test client fixtures
│   ├── test_auth.py              # Firebase ID token authentication & ownership tests
│   ├── test_data_layer.py        # Firestore data layer, isolation, parent checks & pagination
│   ├── test_health.py            # Health probes & basic routing tests
│   └── test_security_config.py   # Security, CORS, size limits & error tests
├── .env.example                  # Documented environment variables template
├── .gitignore                    # Git ignore rules (secrets, venvs, caches)
├── Dockerfile                    # Multi-user production container definition
├── requirements.txt              # Pinned dependency manifest
├── run.py                        # Local development runner
├── wsgi.py                       # Production WSGI entry point
└── README.md                     # Service documentation
```

---

## 🗄 Firestore Data Model & Access Policy

### 1. User-Scoped Hierarchical Layout
All private user documents are strictly partitioned under each user's unique identifier (`users/{uid}`):

```text
users/{uid}
├── goals/{goalId}
├── milestones/{milestoneId}
├── tasks/{taskId}
├── dailyReviews/{reviewId}
└── progressSnapshots/{snapshotId}
```

### 2. Core Access Rules & Integrity Guarantees
- **Strict User Scoping**: Repositories construct references strictly through `users/{uid}/{subcollection}`. Private records are **never** queried globally and filtered on the client.
- **Parent Document Validation**: Milestones and tasks with parent references (`goal_id`, `milestone_id`) verify that the parent exists **within the same user scope**, strictly rejecting cross-user reference injection.
- **Consistent Timestamps**: All entities track `created_at` and `updated_at` timestamps in UTC.
- **Safe Partial Updates**: Updates use Firestore merge operations to preserve unmutated fields.
- **Atomic Transactions**: Sensitive multi-step operations (e.g. task completion toggles) use transactions to guarantee read-modify-write atomicity without race conditions.

### 3. Firestore Security Rules (`firestore.rules`)
Under the **Backend-as-Proxy** architecture, all client interaction is routed through the authenticated Flask API. Direct browser and mobile client reads and writes are denied by default:
```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{allSubcollections=**} {
      allow read, write: if false; // Mediated strictly by backend
    }
  }
}
```

### 4. Composite Indexes (`firestore.indexes.json`)
The following composite indexes are configured:
- `goals`: `(status ASC, created_at DESC)`
- `milestones`: `(goal_id ASC, order ASC)`
- `tasks`: `(goal_id ASC, created_at DESC)`
- `tasks`: `(is_completed ASC, created_at DESC)`
- `dailyReviews`: `(created_at DESC)`
- `progressSnapshots`: `(timestamp DESC)`

---

## 🛠 Local Development with Firebase Emulator Suite

You can develop and run against the **Firebase Local Emulator Suite** without connecting to live cloud resources or incurring costs:

### Step 1: Install & Start Emulators
```powershell
npm install -g firebase-tools
firebase emulators:start --only firestore,auth
```

### Step 2: Configure Environment
In your `backend/.env`, set:
```env
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```
The Google Cloud Firestore and Firebase Admin SDKs will automatically route all operations to the local emulator without requiring private keys.

---

## 🧪 Testing and Quality Assurance

Run all 92 automated tests (covering authentication, cross-user isolation, parent validation, pagination, transactions, security, goals/milestones, task management, daily planning lifecycles, daily reviews, weighted milestone progress, deterministic reporting, secure AI orchestration, timezone-aware scheduled jobs, database outages, and hardening audits):
```powershell
$env:PYTHONPATH="backend"
backend\.venv\Scripts\pytest -v backend/tests
```

Run Ruff linter and code style checks:
```powershell
backend\.venv\Scripts\ruff check backend
```

---

## 💻 Running the Application Locally

```powershell
$env:PYTHONPATH="backend"
backend\.venv\Scripts\python backend/run.py
```
The server will start at `http://127.0.0.1:5000`.

---

## 📡 API Endpoints Summary

- Production Release Audit & Hardening Report: [`docs/production_release_audit.md`](file:///d:/projects/life_tracker_app/backend/docs/production_release_audit.md)
- Goals & Milestones API Contract: [`docs/goals_milestones_api.md`](file:///d:/projects/life_tracker_app/backend/docs/goals_milestones_api.md)
- Tasks & Daily Planning API Contract: [`docs/tasks_daily_planning_api.md`](file:///d:/projects/life_tracker_app/backend/docs/tasks_daily_planning_api.md)
- Daily Review, Progress & Reporting API Contract: [`docs/daily_review_progress_reporting_api.md`](file:///d:/projects/life_tracker_app/backend/docs/daily_review_progress_reporting_api.md)
- AI Service Architecture & Contract: [`docs/ai_service.md`](file:///d:/projects/life_tracker_app/backend/docs/ai_service.md)
- Scheduled Backend Jobs Architecture & Production Setup: [`docs/scheduled_jobs.md`](file:///d:/projects/life_tracker_app/backend/docs/scheduled_jobs.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health/live` | No | Liveness probe |
| `GET` | `/health/ready` | No | Readiness probe (checks Firestore status safely) |
| `GET` | `/api/v1/info` | No | API metadata & routes |
| `GET` | `/api/v1/me` | **Yes** | Safe account information of authenticated user |
| `POST`| `/api/v1/goals` | **Yes** | Create user goal with timeframe, metrics, and dates |
| `GET` | `/api/v1/goals` | **Yes** | List user goals with pagination, filtering & sorting |
| `GET` | `/api/v1/goals/<id>` | **Yes** | Retrieve single goal |
| `PATCH`| `/api/v1/goals/<id>` | **Yes** | Update goal fields, validates status flow & records date history |
| `DELETE`| `/api/v1/goals/<id>` | **Yes** | Delete goal (safe archival by default, `?permanent=true` hard delete) |
| `POST`| `/api/v1/goals/<id>/milestones` | **Yes** | Create milestone under goal with relative progress weight |
| `GET` | `/api/v1/goals/<id>/milestones` | **Yes** | List milestones for goal |
| `PATCH`| `/api/v1/goals/<id>/milestones/<m_id>` | **Yes** | Update milestone, tracks date changes & recalculates goal progress |
| `DELETE`| `/api/v1/goals/<id>/milestones/<m_id>` | **Yes** | Delete milestone and recalculates parent goal progress |
| `POST`| `/api/v1/tasks` | **Yes** | Create actionable task with duration, deadlines & goal/milestone links |
| `GET` | `/api/v1/tasks` | **Yes** | List tasks with filters (`date`, `goal_id`, `milestone_id`, `priority`, `status`) |
| `GET` | `/api/v1/tasks/<id>` | **Yes** | Retrieve single task |
| `PATCH`| `/api/v1/tasks/<id>` | **Yes** | Update task fields & validate permitted state transitions |
| `DELETE`| `/api/v1/tasks/<id>` | **Yes** | Delete task permanently or cancel (`?cancel=true`) |
| `POST`| `/api/v1/tasks/<id>/complete` | **Yes** | Explicitly complete task (never completed automatically) |
| `POST`| `/api/v1/tasks/<id>/mark-not-completed` | **Yes** | Explicitly mark task as not completed |
| `POST`| `/api/v1/tasks/<id>/mark-unverified` | **Yes** | Mark unconfirmed work as unverified |
| `POST`| `/api/v1/tasks/<id>/reschedule` | **Yes** | Reschedule task, preserving original deadline & daily snapshot |
| `POST`| `/api/v1/tasks/<id>/toggle` | **Yes** | Atomically toggle task completion |
| `POST`| `/api/v1/tasks/daily-plans` | **Yes** | Create/update daily plan with workload validation & idempotency |
| `GET` | `/api/v1/tasks/daily-plans/<date>` | **Yes** | Retrieve daily plan and scheduled task instances |
| `GET` | `/api/v1/tasks/daily-plans` | **Yes** | List historical daily plans with pagination |
| `POST`| `/api/v1/reviews` | **Yes** | Submit daily review, freezes task snapshots, marks unconfirmed unverified |
| `GET` | `/api/v1/reviews/<date>` | **Yes** | Retrieve daily review and frozen task snapshot for date |
| `GET` | `/api/v1/reviews/<date>/task-history` | **Yes** | Retrieve frozen snapshot or task history for date |
| `GET` | `/api/v1/reviews` | **Yes** | List recent daily reviews |
| `GET` | `/api/v1/progress/daily` | **Yes** | Current local date daily progress (empty state supported) |
| `GET` | `/api/v1/progress/daily/<date>` | **Yes** | Daily progress calculation for specific date |
| `GET` | `/api/v1/progress/goals/short-term` | **Yes** | Short-term goal progress based on weighted milestones |
| `GET` | `/api/v1/progress/goals/long-term` | **Yes** | Long-term goal progress based on weighted milestones |
| `GET` | `/api/v1/reports/weekly` | **Yes** | Weekly performance report with daily breakdown |
| `GET` | `/api/v1/reports/monthly` | **Yes** | Monthly performance report with daily breakdown |
| `GET` | `/api/v1/reports/custom` | **Yes** | Custom date-range performance report (`start_date`, `end_date`) |
| `POST`| `/api/v1/ai/daily-suggestions` | **Yes** | Generate bounded daily task suggestions with deduplication & goal linkage |
| `POST`| `/api/v1/ai/revised-schedules` | **Yes** | Generate revised schedules proposing task shifts requiring confirmation |
| `POST`| `/api/v1/ai/recovery-plans` | **Yes** | Recovery mode triage, prioritization, backlog decomposition & catch-up plan |
| `POST`| `/api/v1/ai/explain-progress` | **Yes** | Qualitative goal progress explanation, strengths, bottlenecks, next actions |
| `POST`| `/api/v1/ai/task-breakdown` | **Yes** | Decompose large or complex tasks into 2-10 actionable subtasks |
| `POST`| `/api/v1/ai/quota-check` | No | Sample AI route protected by `@ai_usage_limit` |
| `POST`| `/api/v1/jobs/midnight-closing` | **Job Auth** | Hourly scheduled job closing past unclosed days per user timezone |
| `POST`| `/api/v1/jobs/overdue-detection` | **Job Auth** | Hourly scheduled job detecting overdue goals & milestones |
| `POST`| `/api/v1/jobs/run-all` | **Job Auth** | Unified pipeline: midnight closing, overdue detection & weekly summaries |


