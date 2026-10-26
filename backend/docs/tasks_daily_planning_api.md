# Life Goals AI - Task Management & Daily Planning API Contract

**Version**: `v1`  
**Base URL**: `/api/v1/tasks`  
**Security**: Bearer Token Authorization (`Authorization: Bearer <firebase_id_token>`)

---

## 📋 Task Lifecycle & Permitted State Transitions

Tasks progress through well-defined lifecycle states:
- `pending`: Task created and awaiting execution.
- `in_progress`: Task actively being worked on.
- `completed`: Task verified and finished.
- `not_completed`: Task missed or explicitly marked incomplete at end of day.
- `unverified`: Work claimed but unconfirmed/unverified.
- `cancelled`: Task cancelled without permanent database deletion.

### Permitted Transitions Table

| Current State | Permitted Next States | Rejection Status |
| :--- | :--- | :--- |
| `pending` | `in_progress`, `completed`, `not_completed`, `unverified`, `cancelled` | 400 Bad Request on other states |
| `in_progress` | `completed`, `not_completed`, `unverified`, `cancelled`, `pending` | 400 Bad Request on other states |
| `completed` | `pending`, `unverified`, `not_completed` | 400 Bad Request if directly cancelled |
| `not_completed` | `pending` (reopened), `in_progress`, `cancelled` | 400 Bad Request on other states |
| `unverified` | `completed` (verified), `not_completed` (rejected), `pending`, `cancelled` | 400 Bad Request on other states |
| `cancelled` | `pending` (reopened) | 400 Bad Request on other states |

> [!NOTE]
> Tasks are **never** marked complete automatically based on a timer, page visit, or the passage of time.

---

## 📡 Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/tasks` | Create an actionable task |
| `GET` | `/api/v1/tasks` | List tasks with filters (`date`, `goal_id`, `milestone_id`, `priority`, `status`) and pagination |
| `GET` | `/api/v1/tasks/{task_id}` | Retrieve single task |
| `PATCH`| `/api/v1/tasks/{task_id}` | Update task details & validate state transitions |
| `DELETE`| `/api/v1/tasks/{task_id}` | Delete task permanently or cancel (`?cancel=true`) |
| `POST` | `/api/v1/tasks/{task_id}/complete` | Explicitly complete task |
| `POST` | `/api/v1/tasks/{task_id}/mark-not-completed` | Explicitly mark task as not completed |
| `POST` | `/api/v1/tasks/{task_id}/mark-unverified` | Mark unconfirmed work as unverified |
| `POST` | `/api/v1/tasks/{task_id}/reschedule` | Reschedule task to new date, preserving history & snapshots |
| `POST` | `/api/v1/tasks/daily-plans` | Create/update daily plan with workload validation & idempotency |
| `GET` | `/api/v1/tasks/daily-plans/{date}` | Retrieve daily plan and scheduled task instances |
| `GET` | `/api/v1/tasks/daily-plans` | List historical daily plans with pagination |

---

## 1. Create Task

**`POST /api/v1/tasks`**

Creates a new task. Validates that any supplied `goal_id` and `milestone_id` strictly belong to the authenticated user. Automatically captures `original_due_date`.

### Request Example
```json
{
  "title": "Implement JWT Middleware",
  "description": "Write reusable decorator and unit tests",
  "priority": "high",
  "estimated_duration": 90,
  "scheduled_date": "2026-10-27",
  "due_time": "14:30",
  "goal_id": "0df8417c-b3ea-40e9-b51f-2e0f494a7e2b",
  "milestone_id": "45d1f56b-80a9-45f8-b3f4-3d0cf3b12389"
}
```

### Response Example (`201 Created`)
```json
{
  "success": true,
  "data": {
    "id": "e9b28f80-0a25-4c01-8e5a-1ec1bb6cbf10",
    "uid": "usr_alpha_123",
    "goal_id": "0df8417c-b3ea-40e9-b51f-2e0f494a7e2b",
    "milestone_id": "45d1f56b-80a9-45f8-b3f4-3d0cf3b12389",
    "title": "Implement JWT Middleware",
    "description": "Write reusable decorator and unit tests",
    "priority": "high",
    "status": "pending",
    "estimated_duration": 90,
    "original_due_date": "2026-10-27",
    "scheduled_date": "2026-10-27",
    "due_date": "2026-10-27",
    "due_time": "14:30",
    "is_completed": false,
    "completed_at": null,
    "reschedule_history": [],
    "created_at": "2026-10-26T15:10:00Z",
    "updated_at": "2026-10-26T15:10:00Z"
  },
  "message": "Task created successfully.",
  "meta": {
    "request_id": "req-9c240986-e82a-43c3-8a35-15bf2864f77c",
    "timestamp": "2026-10-26T15:10:00Z"
  }
}
```

---

## 2. List Tasks with Multi-Field Filtering

**`GET /api/v1/tasks?date=2026-10-27&status=pending&priority=high&page=1&limit=20`**

### Query Parameters
- `date`: Filter by scheduled date (`YYYY-MM-DD`).
- `goal_id`: Filter by parent goal ID.
- `milestone_id`: Filter by parent milestone ID.
- `priority`: `low`, `medium`, `high`, `urgent`.
- `status`: `pending`, `in_progress`, `completed`, `not_completed`, `unverified`, `cancelled`.
- `is_completed`: `true` or `false`.
- `page`: Page index (default: `1`).
- `limit`: Items per page (default: `20`, max: `100`).

### Response Example (`200 OK`)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "e9b28f80-0a25-4c01-8e5a-1ec1bb6cbf10",
        "uid": "usr_alpha_123",
        "title": "Implement JWT Middleware",
        "priority": "high",
        "status": "pending",
        "estimated_duration": 90,
        "scheduled_date": "2026-10-27",
        "is_completed": false,
        "created_at": "2026-10-26T15:10:00Z",
        "updated_at": "2026-10-26T15:10:00Z"
      }
    ],
    "total_count": 1,
    "page": 1,
    "limit": 20,
    "total_pages": 1,
    "has_next": false,
    "has_previous": false
  },
  "message": "Tasks retrieved successfully."
}
```

---

## 3. Explicit Task Actions

### Complete Task
**`POST /api/v1/tasks/{task_id}/complete`**
Transitions status to `completed`, sets `is_completed: true` and records `completed_at`.

### Mark Not Completed
**`POST /api/v1/tasks/{task_id}/mark-not-completed`**
Explicitly marks task uncompleted at end-of-day. Transitions status to `not_completed` and resets `completed_at`.

### Mark Unverified
**`POST /api/v1/tasks/{task_id}/mark-unverified`**
Flags task work claimed by user as unverified/pending confirmation. Transitions status to `unverified`.

---

## 4. Reschedule Task

**`POST /api/v1/tasks/{task_id}/reschedule`**

Reschedules task to a new target date while preserving:
1. `original_due_date` (immutable baseline deadline).
2. Appends entry to `reschedule_history` audit trail.
3. Preserves previous day's submitted daily task instance without altering historical snapshots.

### Request Example
```json
{
  "new_date": "2026-10-28",
  "reason": "Backend code review meeting ran late",
  "due_time": "10:00"
}
```

### Response Example (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "e9b28f80-0a25-4c01-8e5a-1ec1bb6cbf10",
    "scheduled_date": "2026-10-28",
    "original_due_date": "2026-10-27",
    "status": "pending",
    "reschedule_history": [
      {
        "previous_date": "2026-10-27",
        "new_date": "2026-10-28",
        "rescheduled_at": "2026-10-26T16:00:00Z",
        "reason": "Backend code review meeting ran late"
      }
    ]
  },
  "message": "Task rescheduled successfully."
}
```

---

## 5. Daily Planning API

### Create or Update Daily Plan
**`POST /api/v1/tasks/daily-plans`**

Idempotent: Submitting twice for the same `date` updates the existing plan document without duplicate tasks.
Validates available working minutes vs total estimated workload.

### Request Example
```json
{
  "date": "2026-10-27",
  "available_minutes": 480,
  "task_ids": [
    "e9b28f80-0a25-4c01-8e5a-1ec1bb6cbf10"
  ],
  "tasks": [
    {
      "title": "Review PR #45",
      "priority": "medium",
      "estimated_duration": 45
    }
  ],
  "notes": "Focus on high-leverage auth tasks",
  "allow_overload": false
}
```

### Workload Validation Failure Example (`400 Bad Request`)
If `total_estimated_minutes > available_minutes` and `allow_overload: false`:
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Planned workload (550 mins) exceeds daily available time (480 mins) by 70 mins. Reduce tasks or set allow_overload=true to proceed."
  }
}
```

### Response Example (`201 Created`)
```json
{
  "success": true,
  "data": {
    "id": "2026-10-27",
    "uid": "usr_alpha_123",
    "date": "2026-10-27",
    "available_minutes": 480,
    "total_estimated_minutes": 135,
    "task_count": 2,
    "completed_count": 0,
    "completion_rate": 0.0,
    "is_overloaded": false,
    "overload_minutes": 0,
    "notes": "Focus on high-leverage auth tasks",
    "tasks": [
      {
        "id": "2026-10-27_e9b28f80-0a25-4c01-8e5a-1ec1bb6cbf10",
        "date": "2026-10-27",
        "task_id": "e9b28f80-0a25-4c01-8e5a-1ec1bb6cbf10",
        "title": "Implement JWT Middleware",
        "priority": "high",
        "status": "pending",
        "estimated_duration": 90,
        "is_completed": false
      }
    ]
  },
  "message": "Daily plan recorded successfully."
}
```

---

## 6. Retrieve Daily Plan

**`GET /api/v1/tasks/daily-plans/{date}`**

Retrieves the plan for date `YYYY-MM-DD` along with all snapshot task instances.
