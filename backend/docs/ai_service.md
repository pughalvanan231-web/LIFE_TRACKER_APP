# Secure AI Service Architecture & API Specification

## 1. Architectural Overview & Security Guarantees

The Life Goals AI backend features a **provider-independent, server-side AI orchestration layer** designed with defense-in-depth principles. All AI interactions occur strictly on the backend; the frontend never interacts with LLM providers directly and never receives API keys.

```
[ Frontend Client ]
        │  Bearer JWT (Firebase ID Token)
        ▼
[ Backend /api/v1/ai/* ]
        │  1. Authenticate Token (@require_auth) -> Derive g.user_id
        │  2. Enforce AI Rate Quota (@ai_usage_limit: 10 req/min)
        │  3. Validate Input Schemas (Pydantic v2)
        │  4. User Scope Boundary Check (goals, milestones, tasks)
        ▼
[ AIService Layer ]
        │  - Sanitize user commentary (delimit untrusted prompt text)
        │  - Filter & cap context size (avoid token overflow)
        │  - Deduplicate suggestions against existing user tasks
        │  - Propose non-destructive structured actions (NO auto-DB mutation)
        ▼
[ BaseAIProvider Interface ]
       ╱                     ╲
      ▼                       ▼
[ GeminiProvider ]        [ MockAIProvider ]
(Google Gemini REST)    (Deterministic Local Testing)
```

### Core Security Guarantees
1. **Server-Side Key Isolation**: All Gemini API keys remain securely on the server. Keys are loaded from environment variables and never logged, reflected in responses, or checked into source control.
2. **Untrusted Prompt Delimitation**: User notes, reflections, and preferences are explicitly isolated within markdown code blocks and tagged as untrusted commentary. System prompts instruct the LLM to ignore any imperative commands or prompt injection attempts within user text.
3. **Strict User Scoping**: AI context assembly queries the Firestore database solely via the verified `uid` derived from the cryptographically validated Firebase ID token.
4. **Reference Validation**: Any `linked_goal_id` or `linked_milestone_id` referenced in AI proposals is checked against the user's actual database records. Any hallucinations or cross-user references are automatically scrubbed to `null`.
5. **Non-Destructive Proposals**: The AI service **never** directly alters, reschedules, creates, or deletes database records. It returns structured proposals that require explicit user approval via existing task and planning APIs.
6. **Quota & Rate Protection**: Per-user sliding-window rate limiting prevents runaway token costs and denial-of-wallet attacks (`RATE_LIMIT_AI_PER_MINUTE=10`).
7. **Timeout Resilience**: Outbound LLM requests enforce a strict timeout (`AI_TIMEOUT_SECONDS=30.0`), mapping provider delays to clean HTTP 504 Gateway Timeout responses without leaking thread pools.

---

## 2. Configuration & Environment Variables

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `AI_PROVIDER` | string | `gemini` | Active provider: `gemini` (production/dev) or `mock` (offline testing) |
| `GEMINI_API_KEY` | string | `None` | Google AI Studio Gemini API key. Required when `AI_PROVIDER=gemini`. |
| `GEMINI_MODEL` | string | `gemini-1.5-flash` | Gemini model name (e.g. `gemini-1.5-flash`, `gemini-2.0-flash`) |
| `AI_TIMEOUT_SECONDS` | float | `30.0` | Maximum seconds allowed for LLM inference before returning HTTP 504 |
| `RATE_LIMIT_AI_PER_MINUTE` | int | `10` | Maximum AI requests permitted per user per minute |
| `AI_MAX_SUGGESTIONS_PER_REQUEST` | int | `10` | Maximum number of structured suggestions returned per call |
| `AI_MAX_INPUT_PROMPT_LENGTH` | int | `2000` | Maximum input prompt length in characters |

---

## 3. Endpoints Specification

### 3.1 Daily Task Suggestions
**`POST /api/v1/ai/daily-suggestions`**

Generates bounded, prioritized task suggestions based on active goals, milestones, and daily available minutes. Automatically deduplicates against existing tasks and within the suggestion batch.

**Request Body (`DailyTaskSuggestionsRequest`)**:
```json
{
  "target_date": "2026-10-26",
  "available_time_minutes": 180,
  "preferences": "Focus on high-leverage writing and documentation tasks before lunch.",
  "focus_goal_ids": ["goal_123"],
  "timezone": "America/New_York"
}
```

**Success Response (`200 OK`)**:
```json
{
  "status": "success",
  "data": {
    "target_date": "2026-10-26",
    "available_time_minutes": 180,
    "total_suggested_duration": 90,
    "suggestions": [
      {
        "title": "Draft Chapter 1 outline",
        "description": "Outline main plot points and character goals for the opening chapter.",
        "linked_goal_id": "goal_123",
        "linked_milestone_id": null,
        "priority": "high",
        "estimated_duration": 45,
        "suggested_date": "2026-10-26",
        "suggested_deadline": "2026-10-26",
        "short_explanation": "Directly advances writing milestone for Q4."
      }
    ],
    "explanation": "Balanced schedule within your 180 available minutes.",
    "provider": "gemini",
    "model": "gemini-1.5-flash"
  },
  "message": "Daily task suggestions generated successfully.",
  "meta": { "request_id": "req-...", "timestamp": "..." }
}
```

---

### 3.2 Revised Schedules
**`POST /api/v1/ai/revised-schedules`**

Proposes realistic schedule modifications when user capacity drops or urgent priorities intervene. Splits tasks into confirmed `scheduled_tasks` and deferred `postponed_proposals`. Requires user confirmation.

**Request Body (`RevisedScheduleRequest`)**:
```json
{
  "target_date": "2026-10-26",
  "available_time_minutes": 60,
  "reasons": "Unexpected urgent client call reduced available focus time.",
  "timezone": "UTC"
}
```

**Success Response (`200 OK`)**:
```json
{
  "status": "success",
  "data": {
    "target_date": "2026-10-26",
    "available_time_minutes": 60,
    "total_planned_duration": 45,
    "scheduled_tasks": [
      {
        "title": "Urgent bug fix review",
        "priority": "urgent",
        "estimated_duration": 45,
        "suggested_date": "2026-10-26",
        "short_explanation": "Critical priority task retained in revised schedule."
      }
    ],
    "postponed_proposals": [
      {
        "title": "Refactor styling system",
        "priority": "low",
        "estimated_duration": 60,
        "suggested_date": "2026-10-27",
        "short_explanation": "Can be deferred safely without blocking current milestones."
      }
    ],
    "explanation": "Downscaled schedule to fit 60-minute window, deferring non-urgent refactoring.",
    "requires_user_confirmation": true,
    "provider": "gemini",
    "model": "gemini-1.5-flash"
  }
}
```

---

### 3.3 Recovery Mode & Catch-up Plans
**`POST /api/v1/ai/recovery-plans`**

Activates Recovery Mode to tackle accumulated backlog and prevent burnout. Identifies overdue tasks, proposes prioritized triage, breaks down overwhelming items, and distributes catch-up tasks across upcoming days.

**Request Body (`RecoveryPlanRequest`)**:
```json
{
  "current_date": "2026-10-26",
  "available_daily_minutes": 120,
  "user_note": "Fell behind last week due to illness. Feeling overwhelmed by overdue tasks.",
  "timezone": "UTC"
}
```

**Success Response (`200 OK`)**:
```json
{
  "status": "success",
  "data": {
    "overdue_tasks_count": 2,
    "overdue_task_ids": ["task-101", "task-102"],
    "proposed_priorities": [
      {
        "title": "Finish core documentation",
        "priority": "high",
        "estimated_duration": 40,
        "suggested_date": "2026-10-26",
        "short_explanation": "Clears outstanding overdue blocker."
      }
    ],
    "rescheduling_proposals": [
      {
        "title": "Overdue backlog item 2",
        "priority": "medium",
        "estimated_duration": 30,
        "suggested_date": "2026-10-28",
        "short_explanation": "Prevents cognitive overload and catch-up fatigue."
      }
    ],
    "complex_tasks_breakdowns": [
      {
        "title": "Setup database migration step 1",
        "priority": "medium",
        "estimated_duration": 20,
        "suggested_date": "2026-10-27",
        "short_explanation": "Step 1 of complex task breakdown."
      }
    ],
    "action_plan_summary": "Identified 2 overdue tasks, reprioritizing the critical one and spreading the remainder across the week.",
    "preserves_history": true,
    "requires_user_confirmation": true,
    "provider": "gemini",
    "model": "gemini-1.5-flash"
  }
}
```

---

### 3.4 Explain Goal Progress
**`POST /api/v1/ai/explain-progress`**

Analyzes qualitative patterns, milestone metrics, and task completion velocity across goals.

**Request Body (`ExplainGoalProgressRequest`)**:
```json
{
  "goal_id": "goal_123",
  "timezone": "America/New_York"
}
```

**Success Response (`200 OK`)**:
```json
{
  "status": "success",
  "data": {
    "goal_id": "goal_123",
    "overall_status": "in_progress",
    "completion_percentage": 65.5,
    "insights": [
      "Strong momentum on short-term milestones with 80% completion rate.",
      "Long-term goal milestones require steady incremental task planning."
    ],
    "strengths": [
      "High daily consistency during mid-week reviews."
    ],
    "bottlenecks": [
      "Weekend tasks tend to be postponed due to over-optimistic time estimation."
    ],
    "recommended_next_actions": [
      {
        "title": "Allocate buffer time for Friday review",
        "priority": "medium",
        "estimated_duration": 30,
        "suggested_date": "2026-10-30",
        "short_explanation": "Addresses root bottleneck of weekend postponements."
      }
    ],
    "explanation": "You are on track to meet Q4 milestones with solid weekday execution.",
    "provider": "gemini",
    "model": "gemini-1.5-flash"
  }
}
```

---

### 3.5 Task Breakdown
**`POST /api/v1/ai/task-breakdown`**

Decomposes large, intimidating, or ambiguous tasks into 2 to 10 bite-sized, sequential subtasks (15 to 60 minutes each).

**Request Body (`TaskBreakdownRequest`)**:
```json
{
  "task_title": "Launch new feature",
  "task_description": "Define scope, code backend, and write tests",
  "max_subtasks": 3
}
```

**Success Response (`200 OK`)**:
```json
{
  "status": "success",
  "data": {
    "original_task_title": "Launch new feature",
    "linked_goal_id": null,
    "linked_milestone_id": null,
    "subtasks": [
      {
        "title": "Draft feature specification",
        "priority": "high",
        "estimated_duration": 40,
        "suggested_date": "2026-10-26",
        "short_explanation": "Step 1: Planning and scope definition."
      },
      {
        "title": "Implement core backend endpoint",
        "priority": "high",
        "estimated_duration": 60,
        "suggested_date": "2026-10-27",
        "short_explanation": "Step 2: Backend implementation."
      },
      {
        "title": "Add unit and integration tests",
        "priority": "medium",
        "estimated_duration": 45,
        "suggested_date": "2026-10-28",
        "short_explanation": "Step 3: Verification and test suite."
      }
    ],
    "total_estimated_duration": 145,
    "explanation": "Decomposed large initiative into 3 manageable steps under 60 minutes each.",
    "provider": "gemini",
    "model": "gemini-1.5-flash"
  }
}
```

---

## 4. Error Codes & Failure Modes

| Status | Code | Cause | Mitigation |
| :--- | :--- | :--- | :--- |
| `400` | `BAD_REQUEST` | Missing task title or invalid payload schema | Correct request fields to match schema |
| `401` | `UNAUTHORIZED` | Missing or invalid Bearer token | Provide valid verified Firebase ID token |
| `404` | `NOT_FOUND` | Focus goal, milestone, or task ID does not exist | Ensure entity exists under user scope |
| `429` | `TOO_MANY_REQUESTS` | Per-user AI rate limit exceeded (10/min) | Wait for `Retry-After` seconds before reissuing |
| `502` | `BAD_GATEWAY` | LLM generated invalid JSON or invalid schema | Handled by service; retry request |
| `503` | `SERVICE_UNAVAILABLE` | `GEMINI_API_KEY` missing or provider down | Configure API key in server environment |
| `504` | `GATEWAY_TIMEOUT` | Provider inference exceeded `AI_TIMEOUT_SECONDS` | Downstream LLM latency; retry later |
