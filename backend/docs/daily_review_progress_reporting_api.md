# Life Goals AI - Daily Review, Progress & Reporting API Contract

**Version**: `v1`  
**Security**: Bearer Token Authorization (`Authorization: Bearer <firebase_id_token>`)  
**Timezone Support**: Resolves calendar dates and boundaries using the user's local timezone supplied via `X-User-Timezone` header or `timezone` query parameter (defaults to `UTC`).

---

## 📐 Formulas, Definitions & Assumptions

### 1. Daily Task Completion Formula
$$\text{Daily Completion \%} = \left(\frac{\text{completed tasks due on day}}{\text{all tasks due on day}}\right) \times 100$$

- **Numerator**: Tasks with status `completed` (or `is_completed: true` where status is not `unverified`).
- **Denominator**: All tasks due on that day, consisting of:
  $$\text{Total Due} = \text{Completed} + \text{Not Completed} + \text{Unverified} + \text{Postponed}$$
- **Empty State Rule**: If no tasks were scheduled or due on that day (`Total Due == 0`), completion is explicitly returned as `0.0%` with `is_empty_state: true`. Division by zero is strictly guarded against.
- **Unverified Tasks Rule**: Unverified tasks are **never** counted as completed.

### 2. Goal Progress Formula
Goal progress is calculated strictly from measurable, weighted milestones or quantitative targets:
- **Milestone-Weighted Formula**:
  $$\text{Milestone Progress \%} = \min\left(100, \max\left(0, \text{round}\left(\frac{\sum \text{completed milestone weights}}{\sum \text{total milestone weights}} \times 100\right)\right)\right)$$
- **Quantitative Target Metric Formula**:
  $$\text{Metric Progress \%} = \min\left(100, \max\left(0, \text{round}\left(\frac{\text{current\_value}}{\text{target\_value}} \times 100\right)\right)\right)$$
- **Architecture Integrity Rule**: Daily task completion percentages are **never** substituted for actual goal progress. Goal progress reflects cumulative, milestone-driven growth.

### 3. Report Categories
Every report categorizes tasks into four distinct buckets:
- `completed_count`: Verified and finished tasks.
- `not_completed_count`: Missed or explicitly uncompleted tasks.
- `postponed_count`: Tasks that were rescheduled or moved to future dates.
- `unverified_count`: Tasks whose work is unconfirmed.

### 4. Agreement with Saved Daily Reviews
When generating weekly, monthly, or custom date-range reports:
- The reporting engine checks for existing saved daily reviews.
- If a daily review exists for a calendar date, the report uses the review's frozen snapshot metrics.
- This ensures 100% agreement between the user's historical saved reviews and aggregated performance reports, even if tasks are modified or rescheduled in the future.

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/reviews` | Submit or correct a daily review |
| `GET` | `/api/v1/reviews` | List recent daily reviews |
| `GET` | `/api/v1/reviews/{date}` | Retrieve daily review for a specific date (`YYYY-MM-DD`) |
| `GET` | `/api/v1/reviews/{date}/task-history` | Retrieve task history and frozen snapshots for a date |
| `GET` | `/api/v1/progress/daily` | Retrieve daily completion progress for dashboard |
| `GET` | `/api/v1/progress/daily/{date}` | Retrieve daily progress for a specific calendar date |
| `GET` | `/api/v1/progress/goals/short-term` | Retrieve measurable progress for short-term goals |
| `GET` | `/api/v1/progress/goals/long-term` | Retrieve measurable progress for long-term goals |
| `GET` | `/api/v1/reports/weekly` | Generate 7-day weekly performance report |
| `GET` | `/api/v1/reports/monthly` | Generate calendar month performance report |
| `GET` | `/api/v1/reports/custom` | Generate custom date-range performance report |

---

## 1. Submit Daily Review

**`POST /api/v1/reviews`**

Submits a daily reflection review:
- Preserves all completed and explicitly not-completed tasks.
- Automatically transitions any unconfirmed tasks (still `pending` or `in_progress`) to `unverified` status upon review closure.
- Saves a frozen dated snapshot of task details.
- Prevents duplicate reviews for the same user and date (requires `is_correction: true` to update an existing review).
- Detects late submissions (submitted after the user's local date).

### Request Example
```json
{
  "date": "2026-10-27",
  "summary": "Solid productive day. Completed core auth module.",
  "wins": "Fixed Firestore transaction edge cases in TaskService.",
  "challenges": "Felt tired in the afternoon.",
  "rating": 4,
  "is_correction": false,
  "timezone": "America/New_York"
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
    "summary": "Solid productive day. Completed core auth module.",
    "wins": "Fixed Firestore transaction edge cases in TaskService.",
    "challenges": "Felt tired in the afternoon.",
    "rating": 4,
    "total_tasks": 3,
    "completed_tasks": 2,
    "not_completed_tasks": 0,
    "unverified_tasks": 1,
    "postponed_tasks": 0,
    "completion_rate": 66.7,
    "is_empty_state": false,
    "is_late": false,
    "is_correction": false,
    "corrected_at": null,
    "task_snapshots": [
      {
        "task_id": "t1-auth",
        "title": "Implement JWT Middleware",
        "priority": "high",
        "status": "completed",
        "estimated_duration": 60,
        "is_completed": true,
        "rescheduled_to": null
      },
      {
        "task_id": "t2-test",
        "title": "Write unit tests",
        "priority": "medium",
        "status": "completed",
        "estimated_duration": 45,
        "is_completed": true,
        "rescheduled_to": null
      },
      {
        "task_id": "t3-unconfirmed",
        "title": "Update documentation",
        "priority": "low",
        "status": "unverified",
        "estimated_duration": 30,
        "is_completed": false,
        "rescheduled_to": null
      }
    ],
    "created_at": "2026-10-27T22:00:00Z",
    "updated_at": "2026-10-27T22:00:00Z"
  },
  "message": "Daily review recorded successfully."
}
```

---

## 2. Daily Progress (Dashboard)

**`GET /api/v1/progress/daily?timezone=America/New_York`**

Returns today's progress using the exact same calculation formula as reports.

### Empty State Response Example (`200 OK`)
When no tasks were scheduled for that day:
```json
{
  "success": true,
  "data": {
    "date": "2026-10-27",
    "total_tasks": 0,
    "completed_tasks": 0,
    "not_completed_tasks": 0,
    "unverified_tasks": 0,
    "postponed_tasks": 0,
    "completion_percentage": 0.0,
    "is_empty_state": true,
    "is_reviewed": false,
    "tasks": []
  },
  "message": "Daily progress retrieved successfully."
}
```

---

## 3. Short-Term & Long-Term Goal Progress

**`GET /api/v1/progress/goals/short-term`**  
**`GET /api/v1/progress/goals/long-term`**

Computes milestone-weighted or quantitative metric progress for all classified goals.

### Response Example (`200 OK`)
```json
{
  "success": true,
  "data": {
    "timeframe": "short_term",
    "count": 2,
    "average_progress": 62.5,
    "goals": [
      {
        "goal_id": "goal-gcp-cert",
        "title": "Pass GCP Cloud Architect Exam",
        "timeframe": "short_term",
        "category": "career",
        "priority": "high",
        "status": "active",
        "progress_percentage": 75,
        "total_milestones": 4,
        "completed_milestones": 3,
        "target_value": null,
        "current_value": null,
        "unit": null,
        "target_date": "2026-11-30"
      },
      {
        "goal_id": "goal-read-books",
        "title": "Read System Design Books",
        "timeframe": "short_term",
        "category": "personal_growth",
        "priority": "medium",
        "status": "active",
        "progress_percentage": 50,
        "total_milestones": 0,
        "completed_milestones": 0,
        "target_value": 4.0,
        "current_value": 2.0,
        "unit": "books",
        "target_date": "2026-12-15"
      }
    ]
  },
  "message": "Short-term goals progress retrieved successfully."
}
```

---

## 4. Performance Reports (Weekly, Monthly, Custom)

**`GET /api/v1/reports/weekly`**  
**`GET /api/v1/reports/monthly?month=2026-10`**  
**`GET /api/v1/reports/custom?start_date=2026-10-01&end_date=2026-10-15`**

### Response Example (`200 OK`)
```json
{
  "success": true,
  "data": {
    "report_type": "weekly",
    "start_date": "2026-10-21",
    "end_date": "2026-10-27",
    "timezone": "UTC",
    "total_days": 7,
    "active_days": 5,
    "total_tasks_scheduled": 15,
    "completed_count": 10,
    "not_completed_count": 2,
    "postponed_count": 1,
    "unverified_count": 2,
    "overall_completion_rate": 66.7,
    "daily_breakdown": [
      {
        "date": "2026-10-27",
        "completed_count": 2,
        "not_completed_count": 0,
        "postponed_count": 0,
        "unverified_count": 1,
        "total_due": 3,
        "completion_rate": 66.7,
        "is_empty": false
      }
    ],
    "generated_at": "2026-10-27T16:00:00Z"
  },
  "message": "Weekly performance report generated successfully."
}
```
