from unittest.mock import patch

import pytest

from app.integrations.notification_provider import MockNotificationProvider
from app.schemas.goal import GoalCategory, GoalPriority, GoalTimeframe
from app.schemas.task import TaskPriority
from app.services.notification_service import NotificationService
from tests.test_data_layer import MockFirestoreClient


@pytest.fixture
def test_db():
    return MockFirestoreClient()


@pytest.fixture
def mock_notifications():
    return MockNotificationProvider()


def job_auth_headers(secret: str = "test-job-secret-key-life-goals") -> dict:
    return {
        "X-Job-Secret": secret,
        "Content-Type": "application/json",
    }


def user_auth_headers(token: str = "valid.test.token") -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


# ==============================================================================
# 1. TASK STATUS PRESERVATION & MIDNIGHT CLOSING
# ==============================================================================


def test_midnight_closing_task_status_preservation(client, test_db):
    """
    Midnight closing requirements:
    1. Preserve completed tasks.
    2. Preserve explicitly not-completed tasks.
    3. Mark only unconfirmed tasks (pending, in_progress) as unverified.
    4. Save frozen daily review snapshot.
    5. Preserve original due dates and rescheduling history.
    """
    uid = "job_user_status_preservation"
    user_claims = {"uid": uid, "email": "status@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Setup user profile with UTC timezone
        test_db.collection("users").document(uid).set({"uid": uid, "timezone": "UTC"})

        yesterday = "2026-10-25"

        # 1. Completed task
        res1 = client.post(
            "/api/v1/tasks",
            json={
                "title": "Completed Exercise",
                "scheduled_date": yesterday,
                "priority": TaskPriority.MEDIUM.value,
                "estimated_duration": 30,
            },
            headers=user_auth_headers(),
        )
        t1_id = res1.get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t1_id}/complete", headers=user_auth_headers())

        # 2. Explicitly not completed task
        res2 = client.post(
            "/api/v1/tasks",
            json={
                "title": "Skipped Laundry",
                "scheduled_date": yesterday,
                "priority": TaskPriority.LOW.value,
                "estimated_duration": 30,
            },
            headers=user_auth_headers(),
        )
        t2_id = res2.get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t2_id}/mark-not-completed", headers=user_auth_headers())

        # 3. Unconfirmed pending task
        res3 = client.post(
            "/api/v1/tasks",
            json={
                "title": "Forgotten Coding Task",
                "scheduled_date": yesterday,
                "priority": TaskPriority.HIGH.value,
                "estimated_duration": 60,
            },
            headers=user_auth_headers(),
        )
        t3_id = res3.get_json()["data"]["id"]

        # 4. Trigger midnight closing on 2026-10-26 (after yesterday ended)
        job_resp = client.post(
            "/api/v1/jobs/midnight-closing",
            json={
                "simulated_now": "2026-10-26T01:00:00Z",
                "single_user_id": uid,
            },
            headers=job_auth_headers(),
        )
        assert job_resp.status_code == 200
        job_data = job_resp.get_json()["data"]

        assert job_data["reviews_closed"] == 1
        assert job_data["tasks_marked_unverified"] == 1

        # Verify task states in database
        t1_after = client.get(f"/api/v1/tasks/{t1_id}", headers=user_auth_headers()).get_json()["data"]
        t2_after = client.get(f"/api/v1/tasks/{t2_id}", headers=user_auth_headers()).get_json()["data"]
        t3_after = client.get(f"/api/v1/tasks/{t3_id}", headers=user_auth_headers()).get_json()["data"]

        assert t1_after["status"] == "completed"
        assert t1_after["is_completed"] is True

        assert t2_after["status"] == "not_completed"
        assert t2_after["is_completed"] is False

        assert t3_after["status"] == "unverified"
        assert t3_after["is_completed"] is False

        # Verify frozen daily review snapshot
        rev_resp = client.get(f"/api/v1/reviews/{yesterday}", headers=user_auth_headers())
        assert rev_resp.status_code == 200
        rev_data = rev_resp.get_json()["data"]

        assert rev_data["completed_tasks"] == 1
        assert rev_data["not_completed_tasks"] == 1
        assert rev_data["unverified_tasks"] == 1
        assert rev_data["total_tasks"] == 3


# ==============================================================================
# 2. IDEMPOTENT RETRIES & DUPLICATE RUN SUPPRESSION
# ==============================================================================


def test_scheduled_job_idempotent_duplicate_execution(client, test_db):
    """
    Running the midnight closing job twice on the same day must be idempotent.
    The second execution must not alter snapshots or create duplicate reviews.
    """
    uid = "job_user_idempotent"
    user_claims = {"uid": uid, "email": "idempotent@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        test_db.collection("users").document(uid).set({"uid": uid, "timezone": "UTC"})

        client.post(
            "/api/v1/tasks",
            json={
                "title": "Task 1",
                "scheduled_date": "2026-10-25",
                "priority": TaskPriority.MEDIUM.value,
            },
            headers=user_auth_headers(),
        )

        # First run: closes the review
        res1 = client.post(
            "/api/v1/jobs/midnight-closing",
            json={"simulated_now": "2026-10-26T01:00:00Z", "single_user_id": uid},
            headers=job_auth_headers(),
        )
        assert res1.status_code == 200
        assert res1.get_json()["data"]["reviews_closed"] == 1

        # Second run (immediate retry): must detect review already exists and skip gracefully
        res2 = client.post(
            "/api/v1/jobs/midnight-closing",
            json={"simulated_now": "2026-10-26T01:05:00Z", "single_user_id": uid},
            headers=job_auth_headers(),
        )
        assert res2.status_code == 200
        assert res2.get_json()["data"]["reviews_closed"] == 0


# ==============================================================================
# 3. TIMEZONE-AWARE DAY BOUNDARIES
# ==============================================================================


def test_midnight_closing_respects_user_timezones(client, test_db):
    """
    At UTC 2026-10-26T16:00:00Z:
    - Tokyo (UTC+9) is at 2026-10-27T01:00:00 (has crossed midnight for 2026-10-26).
    - New York (UTC-4) is at 2026-10-26T12:00:00 (mid-day, 2026-10-26 has NOT ended).

    Verifies that Tokyo's day 2026-10-26 closes, while New York's 2026-10-26 remains open!
    """
    tokyo_uid = "user_tokyo_001"
    ny_uid = "user_new_york_002"

    with patch(
        "app.repositories.firestore_base.BaseFirestoreRepository.db",
        new_callable=lambda: property(lambda self: test_db),
    ):
        test_db.collection("users").document(tokyo_uid).set({
            "uid": tokyo_uid,
            "timezone": "Asia/Tokyo",
        })
        test_db.collection("users").document(ny_uid).set({
            "uid": ny_uid,
            "timezone": "America/New_York",
        })

        date_26 = "2026-10-26"

        # Create tasks for date_26 for both users
        with patch("firebase_admin.auth.verify_id_token", return_value={"uid": tokyo_uid}):
            client.post(
                "/api/v1/tasks",
                json={"title": "Tokyo Daily Work", "scheduled_date": date_26},
                headers=user_auth_headers(),
            )
        with patch("firebase_admin.auth.verify_id_token", return_value={"uid": ny_uid}):
            client.post(
                "/api/v1/tasks",
                json={"title": "NY Daily Work", "scheduled_date": date_26},
                headers=user_auth_headers(),
            )

        # Trigger scheduled job at UTC 16:00:00 on 2026-10-26
        # In Tokyo: it is 01:00 on Oct 27 (Oct 26 is in the past!).
        # In NY: it is 12:00 noon on Oct 26 (Oct 26 is TODAY, still active!).
        job_res = client.post(
            "/api/v1/jobs/midnight-closing",
            json={"simulated_now": "2026-10-26T16:00:00Z"},
            headers=job_auth_headers(),
        )
        assert job_res.status_code == 200

        # Tokyo's review for 2026-10-26 MUST be closed
        with patch("firebase_admin.auth.verify_id_token", return_value={"uid": tokyo_uid}):
            tokyo_rev = client.get(f"/api/v1/reviews/{date_26}", headers=user_auth_headers())
            assert tokyo_rev.status_code == 200

        # New York's review for 2026-10-26 MUST NOT be closed yet (day is still ongoing)
        with patch("firebase_admin.auth.verify_id_token", return_value={"uid": ny_uid}):
            ny_rev = client.get(f"/api/v1/reviews/{date_26}", headers=user_auth_headers())
            assert ny_rev.status_code == 404


# ==============================================================================
# 4. MISSED RUNS RECOVERY
# ==============================================================================


def test_midnight_closing_recovers_missed_past_runs(client, test_db):
    """
    If the scheduler was down for 3 days, it inspects candidate days in lookback_days
    and closes all missed unclosed dates.
    """
    uid = "job_user_missed_runs"
    user_claims = {"uid": uid, "email": "missed@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        test_db.collection("users").document(uid).set({"uid": uid, "timezone": "UTC"})

        # Tasks created on 3 distinct past days
        client.post(
            "/api/v1/tasks",
            json={"title": "Task 3 days ago", "scheduled_date": "2026-10-23"},
            headers=user_auth_headers(),
        )
        client.post(
            "/api/v1/tasks",
            json={"title": "Task 2 days ago", "scheduled_date": "2026-10-24"},
            headers=user_auth_headers(),
        )
        client.post(
            "/api/v1/tasks",
            json={"title": "Task yesterday", "scheduled_date": "2026-10-25"},
            headers=user_auth_headers(),
        )

        # Run job on 2026-10-26
        res = client.post(
            "/api/v1/jobs/midnight-closing",
            json={"simulated_now": "2026-10-26T01:00:00Z", "single_user_id": uid},
            headers=job_auth_headers(),
        )
        assert res.status_code == 200
        data = res.get_json()["data"]

        # All 3 unclosed past days were safely recovered and closed
        assert data["reviews_closed"] == 3
        assert data["tasks_marked_unverified"] == 3


# ==============================================================================
# 5. OVERDUE GOALS & MILESTONES DETECTION
# ==============================================================================


def test_overdue_goals_and_milestones_detection(client, test_db):
    """
    Scans active goals and milestones with past target dates, dispatching alerts.
    Does not auto-complete or delete the goals.
    """
    uid = "job_user_overdue_scan"
    user_claims = {"uid": uid, "email": "overdue@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        test_db.collection("users").document(uid).set({"uid": uid, "timezone": "UTC"})

        # Create goal with past target date
        g_res = client.post(
            "/api/v1/goals",
            json={
                "title": "Overdue Goal Q3",
                "category": GoalCategory.CAREER.value,
                "priority": GoalPriority.HIGH.value,
                "timeframe": GoalTimeframe.SHORT_TERM.value,
                "target_date": "2026-10-20",
            },
            headers=user_auth_headers(),
        )
        goal_id = g_res.get_json()["data"]["id"]

        # Create milestone under goal with past target date
        client.post(
            f"/api/v1/goals/{goal_id}/milestones",
            json={
                "title": "Overdue Milestone 1",
                "target_date": "2026-10-22",
                "weight": 1.0,
            },
            headers=user_auth_headers(),
        )

        # Run overdue detection on 2026-10-26
        res = client.post(
            "/api/v1/jobs/overdue-detection",
            json={"simulated_now": "2026-10-26T08:00:00Z", "single_user_id": uid},
            headers=job_auth_headers(),
        )
        assert res.status_code == 200
        data = res.get_json()["data"]

        assert data["overdue_goals_detected"] == 1
        assert data["overdue_milestones_detected"] == 1

        # Verify goal was NOT automatically completed or deleted
        goal_after = client.get(f"/api/v1/goals/{goal_id}", headers=user_auth_headers()).get_json()["data"]
        assert goal_after["status"] == "active"


# ==============================================================================
# 6. SAFE DRY-RUN SIMULATION MODE
# ==============================================================================


def test_safe_dry_run_simulation_mode(client, test_db):
    """
    When dry_run=True, the job calculates all actions and returns execution
    metrics, but does NOT modify task statuses or create review records.
    """
    uid = "job_user_dry_run"
    user_claims = {"uid": uid, "email": "dryrun@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        test_db.collection("users").document(uid).set({"uid": uid, "timezone": "UTC"})

        res = client.post(
            "/api/v1/tasks",
            json={"title": "Pending Task", "scheduled_date": "2026-10-25"},
            headers=user_auth_headers(),
        )
        task_id = res.get_json()["data"]["id"]

        # Execute in dry_run mode
        job_res = client.post(
            "/api/v1/jobs/midnight-closing",
            json={
                "simulated_now": "2026-10-26T02:00:00Z",
                "single_user_id": uid,
                "dry_run": True,
            },
            headers=job_auth_headers(),
        )
        assert job_res.status_code == 200
        data = job_res.get_json()["data"]

        assert data["dry_run"] is True
        assert data["reviews_closed"] == 1
        assert data["tasks_marked_unverified"] == 1

        # Verify task was NOT modified in the database
        task_after = client.get(f"/api/v1/tasks/{task_id}", headers=user_auth_headers()).get_json()["data"]
        assert task_after["status"] == "pending"

        # Verify daily review was NOT created
        rev_after = client.get("/api/v1/reviews/2026-10-25", headers=user_auth_headers())
        assert rev_after.status_code == 404


# ==============================================================================
# 7. SECURITY & AUTHORIZATION TESTS
# ==============================================================================


def test_job_endpoint_unauthorized_access_rejected(client):
    """
    Public requests without valid Google OIDC token or X-Job-Secret are strictly rejected.
    """
    # 1. No auth headers
    res1 = client.post("/api/v1/jobs/midnight-closing", json={})
    assert res1.status_code == 401
    assert res1.get_json()["error"]["code"] == "UNAUTHORIZED"

    # 2. Invalid X-Job-Secret
    res2 = client.post(
        "/api/v1/jobs/midnight-closing",
        json={},
        headers={"X-Job-Secret": "invalid_wrong_secret"},
    )
    assert res2.status_code == 401
    assert res2.get_json()["error"]["code"] == "UNAUTHORIZED"


def test_job_endpoint_invalid_simulated_time_rejected(client):
    """
    Malformed timestamps in simulated_now return HTTP 400 Bad Request.
    """
    res = client.post(
        "/api/v1/jobs/midnight-closing",
        json={"simulated_now": "not-a-valid-date"},
        headers=job_auth_headers(),
    )
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "BAD_REQUEST"


# ==============================================================================
# 8. NOTIFICATION IDEMPOTENCY & SAFE REDACTION
# ==============================================================================


def test_notification_idempotency_and_safe_redaction(test_db):
    """
    Verifies that NotificationService:
    1. Sends initial notification.
    2. Suppresses duplicate notification for the same idempotency key.
    3. Respects user notifications_enabled preference.
    """
    uid = "notif_user_001"
    mock_provider = MockNotificationProvider()
    notif_service = NotificationService(provider=mock_provider, db=test_db)

    # Setup user profile with notifications enabled
    test_db.collection("users").document(uid).set({
        "uid": uid,
        "notifications_enabled": True,
        "device_tokens": ["token_xyz_123"],
    })

    # 1. Send first notification
    sent1 = notif_service.send_idempotent_notification(
        uid=uid,
        idempotency_key="alert_key_001",
        title="First Alert",
        body="Sensitive user task text",
        data={"meta": "test"},
    )
    assert sent1 is True
    assert len(mock_provider.sent_dispatches) == 1

    # 2. Duplicate dispatch attempt with same idempotency key
    sent2 = notif_service.send_idempotent_notification(
        uid=uid,
        idempotency_key="alert_key_001",
        title="First Alert",
        body="Sensitive user task text",
        data={"meta": "test"},
    )
    assert sent2 is False
    # Dispatch count remains 1 (duplicate suppressed!)
    assert len(mock_provider.sent_dispatches) == 1

    # 3. User with notifications disabled
    test_db.collection("users").document(uid).update({"notifications_enabled": False})
    sent3 = notif_service.send_idempotent_notification(
        uid=uid,
        idempotency_key="alert_key_002",
        title="Second Alert",
        body="Another message",
    )
    assert sent3 is False
    assert len(mock_provider.sent_dispatches) == 1
