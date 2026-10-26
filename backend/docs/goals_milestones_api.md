# Goals & Milestones API Contract

Version: `v1`  
Base URL: `/api/v1`  
Authentication: `Authorization: Bearer <Firebase_ID_Token>`  
Content-Type: `application/json`

---

## 1. Goals Endpoints

### 1.1 Create Goal
- **Endpoint**: `POST /api/v1/goals`
- **Description**: Creates a new goal classified by timeframe, category, priority, measurable metrics, and target dates.
- **Request Body**:
```json
{
  "title": "Master Cloud Security Architecture",
  "description": "Achieve professional cloud architect & security certifications.",
  "category": "career",
  "priority": "high",
  "timeframe": "medium_term",
  "start_date": "2026-11-01",
  "target_date": "2027-04-30",
  "target_value": 4.0,
  "current_value": 1.0,
  "unit": "certifications"
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "Goal created successfully.",
  "data": {
    "id": "e4f8d2b9-1111-4a55-8e77-99abcdef0123",
    "uid": "verified_user_uid",
    "title": "Master Cloud Security Architecture",
    "description": "Achieve professional cloud architect & security certifications.",
    "category": "career",
    "priority": "high",
    "timeframe": "medium_term",
    "status": "active",
    "start_date": "2026-11-01",
    "target_date": "2027-04-30",
    "target_value": 4.0,
    "current_value": 1.0,
    "unit": "certifications",
    "progress_percentage": 0,
    "date_history": [],
    "archived_at": null,
    "created_at": "2026-10-26T14:50:00Z",
    "updated_at": "2026-10-26T14:50:00Z"
  },
  "meta": {
    "request_id": "4b684cb3-078a-4c22-b53d-24959db62c90",
    "timestamp": "2026-10-26T14:50:00Z"
  }
}
```

---

### 1.2 List Goals
- **Endpoint**: `GET /api/v1/goals`
- **Query Parameters**:
  - `status`: `active`, `completed`, `paused`, `archived`
  - `category`: `career`, `health`, `finance`, `relationships`, `personal_growth`, `lifestyle`, `other`
  - `timeframe`: `short_term`, `medium_term`, `long_term`
  - `priority`: `low`, `medium`, `high`
  - `sort_by`: `created_at`, `target_date`, `priority`, `title`, `progress_percentage` (default `created_at`)
  - `sort_order`: `asc`, `desc` (default `desc`)
  - `page`: integer (default `1`)
  - `limit`: integer (default `20`, max `100`)
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Goals retrieved successfully.",
  "data": {
    "items": [
      {
        "id": "e4f8d2b9-1111-4a55-8e77-99abcdef0123",
        "uid": "verified_user_uid",
        "title": "Master Cloud Security Architecture",
        "category": "career",
        "priority": "high",
        "timeframe": "medium_term",
        "status": "active",
        "progress_percentage": 50,
        "created_at": "2026-10-26T14:50:00Z",
        "updated_at": "2026-10-26T14:55:00Z"
      }
    ],
    "total_count": 1,
    "page": 1,
    "limit": 20,
    "total_pages": 1,
    "has_next": false,
    "has_previous": false
  },
  "meta": {
    "request_id": "995bf2ea-b8fc-4fc8-9f3b-ef54c86e0da8",
    "timestamp": "2026-10-26T14:51:00Z"
  }
}
```

---

### 1.3 Get Goal by ID
- **Endpoint**: `GET /api/v1/goals/{goal_id}`
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Goal retrieved successfully.",
  "data": {
    "id": "e4f8d2b9-1111-4a55-8e77-99abcdef0123",
    "uid": "verified_user_uid",
    "title": "Master Cloud Security Architecture",
    "status": "active",
    "progress_percentage": 50
  }
}
```

---

### 1.4 Update Goal
- **Endpoint**: `PATCH /api/v1/goals/{goal_id}`
- **Description**: Updates fields and preserves historical deadline modifications.
- **Request Body**:
```json
{
  "target_date": "2027-06-30",
  "date_change_reason": "Adjusted timeline due to additional certification module."
}
```
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Goal updated successfully.",
  "data": {
    "id": "e4f8d2b9-1111-4a55-8e77-99abcdef0123",
    "target_date": "2027-06-30",
    "date_history": [
      {
        "previous_target_date": "2027-04-30",
        "new_target_date": "2027-06-30",
        "changed_at": "2026-10-26T14:52:00Z",
        "reason": "Adjusted timeline due to additional certification module."
      }
    ],
    "updated_at": "2026-10-26T14:52:00Z"
  }
}
```

---

### 1.5 Delete or Archive Goal
- **Endpoint**: `DELETE /api/v1/goals/{goal_id}?permanent=false`
- **Safe Archival (Default)**:
```json
{
  "success": true,
  "message": "Goal safely archived.",
  "data": {
    "id": "e4f8d2b9-1111-4a55-8e77-99abcdef0123",
    "archived": true,
    "status": "archived",
    "policy": "archival"
  }
}
```
- **Permanent Removal**: `DELETE /api/v1/goals/{goal_id}?permanent=true`

---

## 2. Milestones Endpoints

### 2.1 Create Milestone
- **Endpoint**: `POST /api/v1/goals/{goal_id}/milestones`
- **Request Body**:
```json
{
  "title": "Complete GCP Cloud Engineer Exam",
  "description": "Pass associate certification exam.",
  "target_date": "2026-12-15",
  "order": 1,
  "weight": 2.0
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "Milestone created successfully.",
  "data": {
    "id": "m111-2222-3333-4444",
    "uid": "verified_user_uid",
    "goal_id": "e4f8d2b9-1111-4a55-8e77-99abcdef0123",
    "title": "Complete GCP Cloud Engineer Exam",
    "weight": 2.0,
    "order": 1,
    "is_completed": false,
    "completed_at": null,
    "date_history": []
  }
}
```

---

### 2.2 List Milestones for Goal
- **Endpoint**: `GET /api/v1/goals/{goal_id}/milestones`
- **Response** (`200 OK`): Array of milestones for the specified goal.

---

### 2.3 Update Milestone
- **Endpoint**: `PATCH /api/v1/goals/{goal_id}/milestones/{milestone_id}`
- **Request Body**:
```json
{
  "is_completed": true
}
```
- **Response** (`200 OK`): Returns updated milestone with `completed_at` populated. Parent goal's `progress_percentage` is automatically recalculated.

---

### 2.4 Delete Milestone
- **Endpoint**: `DELETE /api/v1/goals/{goal_id}/milestones/{milestone_id}`
- **Response** (`200 OK`): Removes milestone and recalculates parent goal progress.
