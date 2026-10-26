# Life Goals AI — Frontend Data Layer & Backend API Contracts

This document specifies the exact API contracts consumed by the frontend data-access layer. Every endpoint corresponds strictly to the Flask REST API route definitions and Pydantic schemas under `backend/app/api/v1` and `backend/app/schemas`.

---

## 1. Authentication & Security
- **Bearer Tokens**: All protected endpoints require `Authorization: Bearer <firebase_id_token>`.
- **Identity Isolation**: The authenticated UID is extracted strictly from verified token claims on the server. Client-supplied UIDs in URL query parameters or JSON bodies are ignored.
- **Client Networking**: Handled exclusively through `frontend/src/services/api-client.js`. Direct browser queries to Firestore are strictly prohibited.

---

## 2. Service Endpoints & Contract Definitions

### User Profile (`profile-service.js`)
| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/me` | Retrieve verified safe user profile (`uid`, `email`, `display_name`, `photo_url`, `email_verified`) | Active |
| `GET` | `/api/v1/users/:user_id/data` | Authorization isolation check (proves user A cannot read user B data) | Active |

---

### Goals & Aspirations (`goals-service.js`)
| Method | Endpoint | Query / Body Parameters | Response Shape | Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/goals` | `status`, `category`, `timeframe`, `priority`, `sort_by`, `sort_order`, `page`, `limit` | Paginated list `{ items: Goal[], total, page, limit, total_pages }` | Active |
| `POST` | `/api/v1/goals` | `{ title, description?, category?, priority?, timeframe?, start_date?, target_date?, target_value?, current_value?, unit? }` | Created `Goal` (HTTP 201) | Active |
| `GET` | `/api/v1/goals/:id` | None | Single `Goal` object | Active |
| `PATCH` | `/api/v1/goals/:id` | `{ title?, description?, category?, priority?, timeframe?, status?, target_date?, target_value?, current_value?, unit?, date_change_reason? }` | Updated `Goal` | Active |
| `DELETE` | `/api/v1/goals/:id` | `?permanent=true` (optional, default is safe archival) | `{ id, deleted: true }` | Active |

---

### Milestones (`milestones-service.js`)
| Method | Endpoint | Query / Body Parameters | Response Shape | Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/goals/:goal_id/milestones` | None | Array of `Milestone[]` | Active |
| `POST` | `/api/v1/goals/:goal_id/milestones` | `{ title, description?, target_date?, order?, weight? }` | Created `Milestone` (HTTP 201) | Active |
| `PATCH` | `/api/v1/goals/:goal_id/milestones/:id` | `{ title?, description?, target_date?, order?, weight?, is_completed?, date_change_reason? }` | Updated `Milestone` | Active |
| `DELETE` | `/api/v1/goals/:goal_id/milestones/:id` | None | `{ id, goal_id, deleted: true }` | Active |

---

### Tasks & Daily Planning (`tasks-service.js`)
| Method | Endpoint | Query / Body Parameters | Response Shape | Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tasks` | `date`, `goal_id`, `milestone_id`, `priority`, `status`, `is_completed`, `page`, `limit` | Paginated list `{ items: Task[], total, page, limit, total_pages }` | Active |
| `POST` | `/api/v1/tasks` | `{ title, description?, goal_id?, milestone_id?, priority?, status?, recurrence?, estimated_duration, scheduled_date?, original_due_date?, due_time? }` | Created `Task` (HTTP 201) | Active |
| `GET` | `/api/v1/tasks/:id` | None | Single `Task` object | Active |
| `PATCH` | `/api/v1/tasks/:id` | `{ title?, description?, priority?, status?, recurrence?, estimated_duration?, scheduled_date?, due_time?, goal_id?, milestone_id? }` | Updated `Task` | Active |
| `DELETE` | `/api/v1/tasks/:id` | `?cancel=true` (cancels instead of deleting) | `{ id, deleted: true, status? }` | Active |
| `POST` | `/api/v1/tasks/:id/complete` | None | Updated `Task` (`status: completed`) | Active |
| `POST` | `/api/v1/tasks/:id/mark-not-completed` | None | Updated `Task` (`status: not_completed`) | Active |
| `POST` | `/api/v1/tasks/:id/mark-unverified` | None | Updated `Task` (`status: unverified`) | Active |
| `POST` | `/api/v1/tasks/:id/reschedule` | `{ new_date, reason? }` | Updated `Task` with audit entry | Active |
| `POST` | `/api/v1/tasks/:id/toggle` | None | Toggled `Task` state in Firestore transaction | Active |
| `POST` | `/api/v1/tasks/daily-plans` | `{ date, available_minutes, target_task_ids, notes? }` | Created `DailyPlan` (HTTP 201) | Active |
| `GET` | `/api/v1/tasks/daily-plans/:date` | None | `DailyPlan` with scheduled tasks | Active |
| `GET` | `/api/v1/tasks/daily-plans` | `page`, `limit` | Paginated list of plans | Active |

---

### Daily Reviews & Progress (`daily-reviews-service.js` & `progress-service.js`)
| Method | Endpoint | Query / Body Parameters | Response Shape | Status |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/reviews` | `{ date, summary?, wins?, challenges?, rating?, is_correction?, timezone? }` | Created `DailyReview` with frozen task snapshot (HTTP 201) | Active |
| `GET` | `/api/v1/reviews` | `limit` (default: 30) | Array of recent `DailyReview[]` | Active |
| `GET` | `/api/v1/reviews/:date` | None | `DailyReview` and frozen snapshot | Active |
| `GET` | `/api/v1/reviews/:date/task-history` | None | Historical task records | Active |
| `GET` | `/api/v1/progress/daily` | `timezone` (query/header: `X-User-Timezone`) | `{ date, completion_rate, total_due, completed, not_completed, unverified, is_empty_state }` | Active |
| `GET` | `/api/v1/progress/daily/:date` | `timezone` | Daily progress for date | Active |
| `GET` | `/api/v1/progress/goals/short-term` | None | Goal progress array based on weighted milestones | Active |
| `GET` | `/api/v1/progress/goals/long-term` | None | Goal progress array based on weighted milestones | Active |
| `POST` | `/api/v1/progress/snapshot` | None | Computed and saved snapshot (HTTP 201) | Active |

---

### Performance Reports (`reports-service.js`)
| Method | Endpoint | Query Parameters | Response Shape | Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reports/weekly` | `end_date`, `timezone` | 7-day review agreement metrics, completion rate, daily points | Active |
| `GET` | `/api/v1/reports/monthly` | `month` (YYYY-MM), `timezone` | Monthly performance breakdown | Active |
| `GET` | `/api/v1/reports/custom` | `start_date`, `end_date`, `timezone` | Custom date range report | Active |

---

### AI Operations (`ai-service.js`)
| Method | Endpoint | Body Parameters | Response Shape | Status |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/ai/daily-suggestions` | `{ target_date?, available_time_minutes?, preferences?, focus_goal_ids?, timezone? }` | `{ suggestions: TaskSuggestionItem[], explanation, provider, model }` | Active |
| `POST` | `/api/v1/ai/revised-schedules` | `{ target_date?, available_time_minutes, reasons?, timezone? }` | Proposed scheduled tasks & postponed proposals | Active |
| `POST` | `/api/v1/ai/recovery-plans` | `{ target_date?, focus_goals_count?, urgency_level?, max_daily_minutes?, timezone? }` | Catch-up recovery plan proposals | Active |
| `POST` | `/api/v1/ai/explain-progress` | `{ goal_id?, analysis_period?, user_question?, timezone? }` | Explanation, strengths, bottlenecks, next actions | Active |
| `POST` | `/api/v1/ai/task-breakdown` | `{ task_title, task_description?, target_duration_minutes?, max_subtasks? }` | Sequential subtasks breakdown | Active |
| `POST` | `/api/v1/ai/quota-check` | `{}` | Quota status | Active |

---

### User Settings Contract (`settings-service.js`)
*Status: Defined Contract with Explicit Development Fixture Adapter*

```json
// Expected Endpoint: GET /api/v1/me/settings, PATCH /api/v1/me/settings
{
  "timezone": "America/New_York",
  "daily_focus_minutes": 240,
  "theme": "system",
  "week_start": "monday",
  "notifications_enabled": true,
  "reminder_time": "09:00",
  "updated_at": "2026-10-26T12:00:00Z"
}
```
**Development Adapter Notice**: Until the Flask backend exposes a public REST route for settings, the frontend uses an explicit development fixture adapter (`settings-service.js`) that persists in local client storage with the notice:
`[DEV_FIXTURE_ADAPTER: Backend settings endpoint contract pending implementation]`.

---

## 3. Concurrency, In-Flight Deduplication & Stale Request Cancellation
1. **Duplicate Prevention**: All mutating operations (`createGoal`, `createTask`, `submitReview`, `toggleTask`, etc.) enforce in-flight mutex guards. Rapid accidental double-clicks or repeated submissions reject instantly with user-friendly notices.
2. **Request Cancellation**: Query endpoints (`listGoals`, `listTasks`, `getWeeklyReport`) support `AbortController` signals to safely cancel stale queries when filters change quickly.
3. **Reactive Refresh**: Mutating operations broadcast domain events through `DataEvents` (`goals:changed`, `tasks:changed`, `reviews:changed`, etc.) so visible views automatically re-render fresh data.
