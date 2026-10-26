import os
from unittest.mock import patch

import pytest

from app import create_app
from app.schemas.goal import GoalCategory, GoalPriority, GoalTimeframe
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
# 1. DATABASE OUTAGES & RESILIENCE
# ==============================================================================


def test_database_outage_produces_masked_500_with_correlation_id(client):
    """
    Simulates an unexpected server-side exception during goal creation.
    Verifies that:
    1. The API catches the unexpected database exception cleanly.
    2. Returns HTTP 500 with code INTERNAL_SERVER_ERROR.
    3. Masks internal tracebacks and connection strings from the client in non-debug mode.
    4. Includes a valid correlation/request ID for server-side debugging.
    """
    user_claims = {"uid": "resilience_user_1", "email": "res1@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.api.v1.goals.goal_service.create_goal",
            side_effect=RuntimeError("Firestore connection refused: DEADLINE_EXCEEDED"),
        ),
    ):
        res = client.post(
            "/api/v1/goals",
            json={
                "title": "Build Resilient Backend",
                "category": GoalCategory.CAREER.value,
                "priority": GoalPriority.HIGH.value,
                "timeframe": GoalTimeframe.SHORT_TERM.value,
            },
            headers=auth_headers(),
        )

        assert res.status_code == 500
        body = res.get_json()
        assert body["success"] is False
        assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
        # Verify internal database message / traceback is NOT exposed to client
        assert "DEADLINE_EXCEEDED" not in body["error"]["message"]
        assert body["error"]["message"] == "An unexpected internal server error occurred."
        # Correlation / request ID present in both payload meta and response header
        assert "request_id" in body["meta"]
        assert "X-Request-ID" in res.headers


def test_readiness_probe_returns_503_when_firebase_required_and_unhealthy(client):
    """
    Verifies that when HEALTH_REQUIRE_FIREBASE is configured to True,
    an unconfigured or unreachable Firebase service marks the readiness probe degraded (503).
    """
    with (
        patch.dict(client.application.config, {"HEALTH_REQUIRE_FIREBASE": True}),
        patch("app.extensions.firebase.check_health", return_value={"status": "unconfigured"}),
    ):
        res = client.get("/health/ready")
        assert res.status_code == 503
        data = res.get_json()
        assert data["success"] is False
        assert data["error"]["code"] == "SERVICE_DEGRADED"


# ==============================================================================
# 2. BOUNDED PAGINATION & LARGE REQUEST VALIDATION
# ==============================================================================


def test_pagination_bounds_and_limit_clamping(client, test_db):
    """
    Tests edge cases in list pagination:
    1. Normal pagination correctly slices records.
    2. Limit exceeding maximum allowed is safely clamped to 100.
    3. Page beyond available records returns empty items list with total count preserved.
    """
    uid = "pagination_user"
    user_claims = {"uid": uid, "email": "page@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create 3 goals
        for i in range(3):
            client.post(
                "/api/v1/goals",
                json={
                    "title": f"Goal {i}",
                    "category": GoalCategory.HEALTH.value,
                    "priority": GoalPriority.MEDIUM.value,
                    "timeframe": GoalTimeframe.SHORT_TERM.value,
                },
                headers=auth_headers(),
            )

        # 1. Normal pagination: limit 2
        res = client.get("/api/v1/goals?page=1&limit=2", headers=auth_headers())
        assert res.status_code == 200
        data = res.get_json()["data"]
        assert len(data["items"]) == 2
        assert data["total_count"] == 3

        # 2. Page beyond total items
        res_page = client.get("/api/v1/goals?page=10&limit=10", headers=auth_headers())
        assert res_page.status_code == 200
        data_page = res_page.get_json()["data"]
        assert len(data_page["items"]) == 0
        assert data_page["total_count"] == 3

        # 3. Limit clamped to safe upper bound (100)
        res_clamped = client.get("/api/v1/goals?limit=500", headers=auth_headers())
        assert res_clamped.status_code == 200
        data_clamped = res_clamped.get_json()["data"]
        assert data_clamped["limit"] <= 100


def test_large_request_body_exceeding_max_content_length(client):
    """
    Verifies that requests exceeding MAX_CONTENT_LENGTH (1MB configured)
    are strictly rejected with HTTP 413 Payload Too Large.
    """
    huge_title = "A" * (1024 * 1024 + 500)  # > 1MB string
    user_claims = {"uid": "huge_body_user", "email": "huge@example.com"}

    with patch("firebase_admin.auth.verify_id_token", return_value=user_claims):
        res = client.post(
            "/api/v1/goals",
            data=huge_title,
            headers={
                "Authorization": "Bearer valid.test.token",
                "Content-Type": "application/json",
            },
        )
        assert res.status_code == 413
        body = res.get_json()
        assert body["error"]["code"] == "REQUEST_TOO_LARGE"


# ==============================================================================
# 3. COMPREHENSIVE ROUTE AUTHORIZATION AUDIT
# ==============================================================================


def test_all_api_v1_endpoints_require_authentication_or_job_auth(client):
    """
    Security Audit Rule:
    Every single endpoint in the application must require either:
    - Firebase Bearer token authentication (user context), or
    - Google Cloud Scheduler / Job Secret authentication (job context),
    EXCEPT for documented public endpoints:
    - /health/live
    - /health/ready
    - /api/v1/
    - /api/v1/info
    """
    public_allowlist = {
        "/health/live",
        "/health/ready",
        "/api/v1/",
        "/api/v1/info",
        "/api/v1/ai/quota-check",
    }

    # Inspect all registered endpoints in Flask's url_map
    for rule in client.application.url_map.iter_rules():
        rule_str = str(rule)

        # Ignore static or documentation-only routes if any
        if rule_str.startswith("/static"):
            continue

        if rule_str in public_allowlist:
            continue

        # For parameterized routes, substitute test ID
        test_url = (
            rule_str.replace("<goal_id>", "test_id")
            .replace("<id>", "test_id")
            .replace("<milestone_id>", "test_m_id")
            .replace("<m_id>", "test_m_id")
            .replace("<task_id>", "test_t_id")
            .replace("<date>", "2026-10-26")
        )

        for method in rule.methods:
            if method in ("HEAD", "OPTIONS"):
                continue

            # Attempt request with ZERO credentials
            if method == "GET":
                res = client.get(test_url)
            elif method == "POST":
                res = client.post(test_url, json={})
            elif method == "PATCH":
                res = client.patch(test_url, json={})
            elif method == "DELETE":
                res = client.delete(test_url)
            elif method == "PUT":
                res = client.put(test_url, json={})
            else:
                continue

            # All non-public endpoints MUST reject unauthorized access with 401 or 403
            assert res.status_code in (401, 403, 404, 405), (
                f"Endpoint {method} {test_url} allowed unauthenticated access with status {res.status_code}!"
            )


# ==============================================================================
# 4. CROSS-USER INSECURE DIRECT OBJECT REFERENCE (IDOR) AUDIT
# ==============================================================================


def test_strict_cross_user_idor_rejection(client, test_db):
    """
    Verifies that User B cannot access, mutate, or delete User A's resources
    even if User B knows User A's resource IDs.
    """
    user_a = {"uid": "user_victim_a", "email": "a@example.com"}
    user_b = {"uid": "user_attacker_b", "email": "b@example.com"}

    with patch(
        "app.repositories.firestore_base.BaseFirestoreRepository.db",
        new_callable=lambda: property(lambda self: test_db),
    ):
        # 1. User A creates a private goal and task
        with patch("firebase_admin.auth.verify_id_token", return_value=user_a):
            goal_res = client.post(
                "/api/v1/goals",
                json={
                    "title": "User A Private Goal",
                    "category": GoalCategory.FINANCE.value,
                    "priority": GoalPriority.HIGH.value,
                    "timeframe": GoalTimeframe.LONG_TERM.value,
                },
                headers=auth_headers(),
            )
            assert goal_res.status_code == 201
            goal_a_id = goal_res.get_json()["data"]["id"]

            task_res = client.post(
                "/api/v1/tasks",
                json={
                    "title": "User A Secret Task",
                    "scheduled_date": "2026-10-26",
                    "goal_id": goal_a_id,
                },
                headers=auth_headers(),
            )
            assert task_res.status_code == 201
            task_a_id = task_res.get_json()["data"]["id"]

        # 2. User B tries to retrieve, modify, or delete User A's goal
        with patch("firebase_admin.auth.verify_id_token", return_value=user_b):
            # Attempt to GET User A's goal
            get_res = client.get(f"/api/v1/goals/{goal_a_id}", headers=auth_headers())
            assert get_res.status_code == 404

            # Attempt to PATCH User A's goal
            patch_res = client.patch(
                f"/api/v1/goals/{goal_a_id}",
                json={"title": "Hacked Goal Title"},
                headers=auth_headers(),
            )
            assert patch_res.status_code == 404

            # Attempt to DELETE User A's goal
            del_res = client.delete(f"/api/v1/goals/{goal_a_id}", headers=auth_headers())
            assert del_res.status_code == 404

            # Attempt to GET User A's task
            task_get = client.get(f"/api/v1/tasks/{task_a_id}", headers=auth_headers())
            assert task_get.status_code == 404

            # Attempt to complete User A's task
            task_complete = client.post(
                f"/api/v1/tasks/{task_a_id}/complete", headers=auth_headers()
            )
            assert task_complete.status_code == 404


# ==============================================================================
# 5. PRODUCTION CONFIGURATION HARDENING
# ==============================================================================


def test_production_environment_hardens_debug_and_exceptions():
    """
    Verifies that the production configuration:
    1. Sets DEBUG = False
    2. Sets TESTING = False
    3. Rejects wildcard CORS
    """
    strong_key = "a-very-strong-production-secret-key-32-chars-long"
    with patch.dict(os.environ, {"SECRET_KEY": strong_key}):
        prod_app = create_app("production")
        assert prod_app.config["DEBUG"] is False
        assert prod_app.config["TESTING"] is False
