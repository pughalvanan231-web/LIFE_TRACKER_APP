from unittest.mock import patch

import pytest

from app.integrations.ai_provider import GeminiProvider, MockAIProvider
from app.schemas.goal import GoalCategory, GoalPriority, GoalTimeframe
from app.services.rate_limiter import rate_limiter
from tests.test_data_layer import MockFirestoreClient


@pytest.fixture
def test_db():
    return MockFirestoreClient()


def auth_headers(token: str = "valid.test.token") -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


# ==============================================================================
# 1. VALID AI ENDPOINT RESPONSES
# ==============================================================================


def test_ai_daily_suggestions_valid(client, test_db):
    """
    POST /api/v1/ai/daily-suggestions
    Returns validated structured task suggestions bounded by available time.
    """
    user_claims = {"uid": "ai_user_001", "email": "ai1@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create a test goal
        goal_resp = client.post(
            "/api/v1/goals",
            json={
                "title": "Complete Novel First Draft",
                "category": GoalCategory.PERSONAL_GROWTH.value,
                "priority": GoalPriority.HIGH.value,
                "timeframe": GoalTimeframe.SHORT_TERM.value,
            },
            headers=auth_headers(),
        )
        assert goal_resp.status_code == 201
        goal_id = goal_resp.get_json()["data"]["id"]

        resp = client.post(
            "/api/v1/ai/daily-suggestions",
            json={
                "target_date": "2026-10-26",
                "available_time_minutes": 120,
                "preferences": "Focus on opening chapter writing",
                "focus_goal_ids": [goal_id],
            },
            headers=auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]

        assert data["target_date"] == "2026-10-26"
        assert data["available_time_minutes"] == 120
        assert len(data["suggestions"]) > 0
        for s in data["suggestions"]:
            assert "title" in s
            assert "estimated_duration" in s
            assert "priority" in s
            assert "short_explanation" in s
            assert s["estimated_duration"] <= 120


def test_ai_revised_schedules_valid(client, test_db):
    """
    POST /api/v1/ai/revised-schedules
    Returns revised schedule separating scheduled tasks and deferred proposals.
    Requires user confirmation (requires_user_confirmation: True).
    """
    user_claims = {"uid": "ai_user_002", "email": "ai2@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        resp = client.post(
            "/api/v1/ai/revised-schedules",
            json={
                "target_date": "2026-10-26",
                "available_time_minutes": 60,
                "reasons": "Unexpected interruption cut available time in half.",
            },
            headers=auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]

        assert data["target_date"] == "2026-10-26"
        assert data["available_time_minutes"] == 60
        assert data["requires_user_confirmation"] is True
        assert len(data["scheduled_tasks"]) > 0
        assert len(data["postponed_proposals"]) > 0


def test_ai_recovery_plans_valid(client, test_db):
    """
    POST /api/v1/ai/recovery-plans
    Recovery Mode identifies overdue tasks, prioritizes triage, and proposes catch-up plan.
    """
    user_claims = {"uid": "ai_user_003", "email": "ai3@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create an overdue task in the past
        client.post(
            "/api/v1/tasks",
            json={
                "title": "Unfinished past report",
                "scheduled_date": "2026-10-20",
                "priority": "high",
                "estimated_duration": 45,
            },
            headers=auth_headers(),
        )

        resp = client.post(
            "/api/v1/ai/recovery-plans",
            json={
                "current_date": "2026-10-26",
                "available_daily_minutes": 90,
                "user_note": "Fell behind last week due to client meetings.",
            },
            headers=auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]

        assert data["overdue_tasks_count"] >= 1
        assert data["preserves_history"] is True
        assert data["requires_user_confirmation"] is True
        assert len(data["proposed_priorities"]) > 0
        assert len(data["rescheduling_proposals"]) > 0
        assert len(data["complex_tasks_breakdowns"]) > 0


def test_ai_explain_goal_progress_valid(client, test_db):
    """
    POST /api/v1/ai/explain-progress
    Returns qualitative analysis, bottlenecks, strengths, and recommended actions.
    """
    user_claims = {"uid": "ai_user_004", "email": "ai4@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create a test goal to analyze
        client.post(
            "/api/v1/goals",
            json={
                "title": "Launch Mobile App",
                "category": GoalCategory.CAREER.value,
                "priority": GoalPriority.HIGH.value,
                "timeframe": GoalTimeframe.SHORT_TERM.value,
            },
            headers=auth_headers(),
        )

        resp = client.post(
            "/api/v1/ai/explain-progress",
            json={},
            headers=auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]

        assert "overall_status" in data
        assert "completion_percentage" in data
        assert isinstance(data["insights"], list)
        assert isinstance(data["strengths"], list)
        assert isinstance(data["bottlenecks"], list)
        assert len(data["recommended_next_actions"]) > 0


def test_ai_task_breakdown_valid(client, test_db):
    """
    POST /api/v1/ai/task-breakdown
    Decomposes large tasks into bounded subtasks.
    """
    user_claims = {"uid": "ai_user_005", "email": "ai5@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        resp = client.post(
            "/api/v1/ai/task-breakdown",
            json={
                "task_title": "Build complete payment integration",
                "task_description": "Setup Stripe, webhook handlers, and customer portal",
                "max_subtasks": 3,
            },
            headers=auth_headers(),
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]

        assert data["original_task_title"] == "Build complete payment integration"
        assert len(data["subtasks"]) == 3
        assert data["total_estimated_duration"] > 0
        for subtask in data["subtasks"]:
            assert subtask["estimated_duration"] <= 60


# ==============================================================================
# 2. ERROR RESILIENCE & FAILURE MODES
# ==============================================================================


def test_ai_provider_invalid_structured_output_returns_502(client, test_db):
    """
    When the AI provider returns non-JSON or invalid structured data,
    the service maps it cleanly to HTTP 502 Bad Gateway.
    """
    user_claims = {"uid": "ai_user_006", "email": "ai6@example.com"}
    failing_provider = MockAIProvider(simulated_mode="invalid_json")

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
        patch("app.api.v1.ai.ai_service._provider", failing_provider),
    ):
        resp = client.post(
            "/api/v1/ai/daily-suggestions",
            json={"available_time_minutes": 120},
            headers=auth_headers(),
        )
        assert resp.status_code == 502
        body = resp.get_json()
        assert body["error"]["code"] == "BAD_GATEWAY"


def test_ai_provider_timeout_returns_504(client, test_db):
    """
    When the external LLM provider exceeds the timeout window,
    the service maps it cleanly to HTTP 504 Gateway Timeout.
    """
    user_claims = {"uid": "ai_user_007", "email": "ai7@example.com"}
    timeout_provider = MockAIProvider(simulated_mode="timeout")

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
        patch("app.api.v1.ai.ai_service._provider", timeout_provider),
    ):
        resp = client.post(
            "/api/v1/ai/daily-suggestions",
            json={"available_time_minutes": 120},
            headers=auth_headers(),
        )
        assert resp.status_code == 504
        body = resp.get_json()
        assert body["error"]["code"] == "GATEWAY_TIMEOUT"


def test_ai_provider_missing_credentials_returns_503(client, test_db):
    """
    When Gemini API key is missing, the service returns HTTP 503 Service Unavailable.
    """
    user_claims = {"uid": "ai_user_008", "email": "ai8@example.com"}
    gemini_without_key = GeminiProvider(api_key=None)

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
        patch("app.api.v1.ai.ai_service._provider", gemini_without_key),
    ):
        resp = client.post(
            "/api/v1/ai/daily-suggestions",
            json={"available_time_minutes": 120},
            headers=auth_headers(),
        )
        assert resp.status_code == 503
        body = resp.get_json()
        assert body["error"]["code"] == "SERVICE_UNAVAILABLE"


# ==============================================================================
# 3. DEDUPLICATION, VALIDATION & RATE LIMITING
# ==============================================================================


def test_ai_duplicate_suggestions_prevented(client, test_db):
    """
    If the user already has a task with the exact title as an AI suggestion,
    the suggestion is safely deduplicated and filtered out.
    """
    user_claims = {"uid": "ai_user_009", "email": "ai9@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create a task with the same title that mock AI returns ("Draft Chapter 1 outline")
        client.post(
            "/api/v1/tasks",
            json={
                "title": "Draft Chapter 1 outline",
                "scheduled_date": "2026-10-26",
                "priority": "high",
                "estimated_duration": 45,
            },
            headers=auth_headers(),
        )

        resp = client.post(
            "/api/v1/ai/daily-suggestions",
            json={"target_date": "2026-10-26", "available_time_minutes": 120},
            headers=auth_headers(),
        )
        assert resp.status_code == 200
        suggestions = resp.get_json()["data"]["suggestions"]

        # Ensure "Draft Chapter 1 outline" was filtered out
        titles = [s["title"].lower() for s in suggestions]
        assert "draft chapter 1 outline" not in titles
        # Other distinct suggestions remain
        assert any("review research references" in t for t in titles)


def test_ai_unauthorized_request_rejected(client):
    """
    Protected AI endpoints reject requests without valid Bearer tokens with HTTP 401.
    """
    resp = client.post(
        "/api/v1/ai/daily-suggestions",
        json={"available_time_minutes": 120},
        # No Authorization header
    )
    assert resp.status_code == 401
    assert resp.get_json()["error"]["code"] == "UNAUTHORIZED"


def test_ai_rate_limit_exceeded_returns_429(client, test_db):
    """
    Enforces per-user AI rate quota (10 requests per minute).
    Exceeding the quota returns HTTP 429 Too Many Requests with Retry-After header.
    """
    user_claims = {"uid": "ai_user_rate_limited", "email": "ratelimit@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Clean rate limiter key for test isolation
        rate_limiter.reset()

        # Execute 10 permitted requests
        for _ in range(10):
            res = client.post(
                "/api/v1/ai/daily-suggestions",
                json={"available_time_minutes": 60},
                headers=auth_headers(),
            )
            assert res.status_code == 200

        # The 11th request must exceed the quota
        overflow = client.post(
            "/api/v1/ai/daily-suggestions",
            json={"available_time_minutes": 60},
            headers=auth_headers(),
        )
        assert overflow.status_code == 429
        body = overflow.get_json()
        assert body["error"]["code"] == "TOO_MANY_REQUESTS"
        assert "Retry-After" in overflow.headers


def test_ai_referenced_goals_validation_and_sanitization(client, test_db):
    """
    Verifies that focus goals must belong to the user (returns 404 if not),
    and AI proposals never write to the database automatically.
    """
    user_claims = {"uid": "ai_user_010", "email": "ai10@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Pass non-existent focus goal ID
        resp = client.post(
            "/api/v1/ai/daily-suggestions",
            json={
                "available_time_minutes": 120,
                "focus_goal_ids": ["non_existent_goal_999"],
            },
            headers=auth_headers(),
        )
        assert resp.status_code == 404
        assert resp.get_json()["error"]["code"] == "NOT_FOUND"

        # Check task database before and after a successful suggestion call
        tasks_before = client.get("/api/v1/tasks", headers=auth_headers()).get_json()["data"]["items"]

        client.post(
            "/api/v1/ai/daily-suggestions",
            json={"available_time_minutes": 120},
            headers=auth_headers(),
        )

        tasks_after = client.get("/api/v1/tasks", headers=auth_headers()).get_json()["data"]["items"]

        # Crucial security guarantee: AI suggestion endpoints NEVER auto-create tasks in DB!
        assert len(tasks_before) == len(tasks_after)
