from unittest.mock import patch

import pytest

from app.schemas.goal import GoalCategory, GoalPriority, GoalTimeframe
from app.schemas.task import TaskStatus
from tests.test_data_layer import MockFirestoreClient


@pytest.fixture
def test_db():
    return MockFirestoreClient()


def auth_headers(token: str = "valid.test.token", tz: str = "UTC") -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-User-Timezone": tz,
    }


# ==============================================================================
# DAILY REVIEW TESTS
# ==============================================================================


def test_daily_review_preserves_states_and_marks_unconfirmed_unverified(client, test_db):
    """
    POST /api/v1/reviews
    Requirements:
    1. Preserve completed tasks.
    2. Preserve explicitly not-completed tasks.
    3. Mark unconfirmed tasks (pending / in_progress) as unverified at review closing.
    4. Save a dated snapshot of relevant task information.
    """
    user_claims = {"uid": "user_rev_001", "email": "reviewer@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        target_date = "2026-10-27"

        # 1. Create Task 1: Completed
        t1_res = client.post(
            "/api/v1/tasks",
            json={"title": "Task 1 (Completed)", "scheduled_date": target_date},
            headers=auth_headers(),
        )
        t1_id = t1_res.get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t1_id}/complete", headers=auth_headers())

        # 2. Create Task 2: Explicitly Not Completed
        t2_res = client.post(
            "/api/v1/tasks",
            json={"title": "Task 2 (Not Completed)", "scheduled_date": target_date},
            headers=auth_headers(),
        )
        t2_id = t2_res.get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t2_id}/mark-not-completed", headers=auth_headers())

        # 3. Create Task 3: Left in pending state (unconfirmed work)
        t3_res = client.post(
            "/api/v1/tasks",
            json={"title": "Task 3 (Left Pending)", "scheduled_date": target_date},
            headers=auth_headers(),
        )
        t3_id = t3_res.get_json()["data"]["id"]

        # 4. Submit Daily Review for target_date
        review_payload = {
            "date": target_date,
            "summary": "Reviewed day's progress.",
            "rating": 4,
            "timezone": "UTC",
        }
        rev_res = client.post("/api/v1/reviews", json=review_payload, headers=auth_headers())
        assert rev_res.status_code == 201
        review = rev_res.get_json()["data"]

        # Assert task metric breakdown
        assert review["total_tasks"] == 3
        assert review["completed_tasks"] == 1
        assert review["not_completed_tasks"] == 1
        assert review["unverified_tasks"] == 1
        assert review["completion_rate"] == 33.3  # (1 / 3) * 100
        assert review["is_empty_state"] is False

        # Verify Task 3 in database was updated to 'unverified' upon closing
        t3_db = client.get(f"/api/v1/tasks/{t3_id}", headers=auth_headers()).get_json()["data"]
        assert t3_db["status"] == TaskStatus.UNVERIFIED.value

        # Verify snapshots captured
        snapshots = review["task_snapshots"]
        assert len(snapshots) == 3
        statuses = {s["task_id"]: s["status"] for s in snapshots}
        assert statuses[t1_id] == TaskStatus.COMPLETED.value
        assert statuses[t2_id] == TaskStatus.NOT_COMPLETED.value
        assert statuses[t3_id] == TaskStatus.UNVERIFIED.value


def test_daily_review_prevents_duplicate_and_handles_corrections_and_lateness(client, test_db):
    """
    POST /api/v1/reviews
    1. Prevents duplicate review submissions for the same user and date without correction flag.
    2. Allows updates when is_correction=true.
    3. Flags late submissions when submitted for past dates.
    """
    user_claims = {"uid": "user_rev_002"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        past_date = "2020-01-01"

        # 1. Initial submission for past date
        res1 = client.post(
            "/api/v1/reviews",
            json={"date": past_date, "summary": "Initial summary", "rating": 3},
            headers=auth_headers(),
        )
        assert res1.status_code == 201
        rev1 = res1.get_json()["data"]
        assert rev1["is_late"] is True
        assert rev1["is_correction"] is False

        # 2. Duplicate submission without correction flag is rejected (400)
        res_dup = client.post(
            "/api/v1/reviews",
            json={"date": past_date, "summary": "Accidental duplicate", "rating": 3},
            headers=auth_headers(),
        )
        assert res_dup.status_code == 400
        assert "already exists" in res_dup.get_json()["error"]["message"]

        # 3. Explicit correction submission is accepted
        res_corr = client.post(
            "/api/v1/reviews",
            json={"date": past_date, "summary": "Corrected summary", "rating": 5, "is_correction": True},
            headers=auth_headers(),
        )
        assert res_corr.status_code == 201
        rev_corr = res_corr.get_json()["data"]
        assert rev_corr["summary"] == "Corrected summary"
        assert rev_corr["rating"] == 5
        assert rev_corr["is_correction"] is True


def test_historical_snapshot_preservation_when_future_tasks_change(client, test_db):
    """
    Submitting a review preserves a frozen snapshot.
    If a task is later modified or rescheduled, the review's historical record remains unchanged.
    """
    user_claims = {"uid": "user_hist_003"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        date_d1 = "2026-10-25"
        t_res = client.post(
            "/api/v1/tasks",
            json={"title": "Original Task Title", "scheduled_date": date_d1},
            headers=auth_headers(),
        )
        t_id = t_res.get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t_id}/complete", headers=auth_headers())

        # Submit review for D1
        client.post(
            "/api/v1/reviews",
            json={"date": date_d1, "summary": "Day 1 Review"},
            headers=auth_headers(),
        )

        # Now edit task title and reschedule it to D2
        client.patch(
            f"/api/v1/tasks/{t_id}",
            json={"title": "Altered Task Title In Future"},
            headers=auth_headers(),
        )
        client.post(
            f"/api/v1/tasks/{t_id}/reschedule",
            json={"new_date": "2026-10-26", "reason": "Moved forward"},
            headers=auth_headers(),
        )

        # Retrieve Day 1 review: must strictly preserve original snapshot
        rev_d1 = client.get(f"/api/v1/reviews/{date_d1}", headers=auth_headers()).get_json()["data"]
        assert rev_d1["completed_tasks"] == 1
        assert rev_d1["task_snapshots"][0]["title"] == "Original Task Title"
        assert rev_d1["task_snapshots"][0]["scheduled_date"] == date_d1

        # Also verify task history endpoint returns frozen snapshot
        history = client.get(f"/api/v1/reviews/{date_d1}/task-history", headers=auth_headers()).get_json()["data"]
        assert len(history) == 1
        assert history[0]["title"] == "Original Task Title"


# ==============================================================================
# PROGRESS CALCULATIONS & EMPTY STATE TESTS
# ==============================================================================


def test_daily_progress_empty_state_and_calculation(client, test_db):
    """
    GET /api/v1/progress/daily/{date}
    Deterministic test:
    - 0 tasks returns 0.0% completion and is_empty_state=true.
    - Tasks calculate exact completion percentage.
    """
    user_claims = {"uid": "user_prog_004"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        empty_date = "2026-10-20"
        res_empty = client.get(f"/api/v1/progress/daily/{empty_date}", headers=auth_headers())
        assert res_empty.status_code == 200
        p_empty = res_empty.get_json()["data"]
        assert p_empty["total_tasks"] == 0
        assert p_empty["completed_tasks"] == 0
        assert p_empty["completion_percentage"] == 0.0
        assert p_empty["is_empty_state"] is True

        # Add 2 tasks on active_date (1 completed, 1 pending)
        active_date = "2026-10-21"
        t1 = client.post(
            "/api/v1/tasks",
            json={"title": "Task A", "scheduled_date": active_date},
            headers=auth_headers(),
        ).get_json()["data"]["id"]
        client.post(
            "/api/v1/tasks",
            json={"title": "Task B", "scheduled_date": active_date},
            headers=auth_headers(),
        )
        client.post(f"/api/v1/tasks/{t1}/complete", headers=auth_headers())

        res_active = client.get(f"/api/v1/progress/daily/{active_date}", headers=auth_headers())
        assert res_active.status_code == 200
        p_active = res_active.get_json()["data"]
        assert p_active["total_tasks"] == 2
        assert p_active["completed_tasks"] == 1
        assert p_active["completion_percentage"] == 50.0
        assert p_active["is_empty_state"] is False


def test_goal_progress_weighted_milestones_and_metrics_separation(client, test_db):
    """
    GET /api/v1/progress/goals/short-term
    GET /api/v1/progress/goals/long-term
    CRITICAL: Goal progress is calculated from weighted milestones or quantitative targets.
    Daily task completion percentage is NEVER substituted for goal progress.
    """
    user_claims = {"uid": "user_goal_prog_005"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # 1. Create short-term goal with 2 milestones (weights: 1.0 and 3.0)
        g_st = client.post(
            "/api/v1/goals",
            json={
                "title": "Pass Kubernetes Certification",
                "timeframe": GoalTimeframe.SHORT_TERM.value,
                "category": GoalCategory.CAREER.value,
                "priority": GoalPriority.HIGH.value,
            },
            headers=auth_headers(),
        ).get_json()["data"]
        g_st_id = g_st["id"]

        # Milestone 1 (Weight 1.0)
        m1 = client.post(
            f"/api/v1/goals/{g_st_id}/milestones",
            json={"title": "Read Docs", "weight": 1.0},
            headers=auth_headers(),
        ).get_json()["data"]["id"]

        # Milestone 2 (Weight 3.0)
        client.post(
            f"/api/v1/goals/{g_st_id}/milestones",
            json={"title": "Hands-on Mock Labs", "weight": 3.0},
            headers=auth_headers(),
        )

        # Complete Milestone 1 (Weight 1.0 / 4.0 = 25%)
        client.patch(
            f"/api/v1/goals/{g_st_id}/milestones/{m1}",
            json={"is_completed": True},
            headers=auth_headers(),
        )

        # 2. Create long-term goal with quantitative metric (current 40 / target 100 = 40%)
        client.post(
            "/api/v1/goals",
            json={
                "title": "Save Emergency Fund",
                "timeframe": GoalTimeframe.LONG_TERM.value,
                "target_value": 100.0,
                "current_value": 40.0,
                "unit": "thousand_dollars",
            },
            headers=auth_headers(),
        )

        # Check short-term goal progress endpoint
        st_res = client.get("/api/v1/progress/goals/short-term", headers=auth_headers())
        assert st_res.status_code == 200
        st_data = st_res.get_json()["data"]
        assert st_data["count"] == 1
        assert st_data["goals"][0]["progress_percentage"] == 25
        assert st_data["goals"][0]["completed_milestones"] == 1

        # Check long-term goal progress endpoint
        lt_res = client.get("/api/v1/progress/goals/long-term", headers=auth_headers())
        assert lt_res.status_code == 200
        lt_data = lt_res.get_json()["data"]
        assert lt_data["count"] == 1
        assert lt_data["goals"][0]["progress_percentage"] == 40


# ==============================================================================
# REPORTING TESTS (WEEKLY, MONTHLY, CUSTOM) & INTEGRITY
# ==============================================================================


def test_reports_distinguish_unverified_and_never_claim_unverified_completed(client, test_db):
    """
    GET /api/v1/reports/custom
    CRITICAL: Never allow a report to claim that unverified tasks were completed.
    Must accurately distinguish completed, not_completed, postponed, and unverified work.
    """
    user_claims = {"uid": "user_report_006"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        day1 = "2026-10-10"

        # 1. Completed task
        t_comp = client.post(
            "/api/v1/tasks", json={"title": "Completed", "scheduled_date": day1}, headers=auth_headers()
        ).get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t_comp}/complete", headers=auth_headers())

        # 2. Not completed task
        t_not = client.post(
            "/api/v1/tasks", json={"title": "Not Completed", "scheduled_date": day1}, headers=auth_headers()
        ).get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t_not}/mark-not-completed", headers=auth_headers())

        # 3. Unverified task
        t_unv = client.post(
            "/api/v1/tasks", json={"title": "Unverified", "scheduled_date": day1}, headers=auth_headers()
        ).get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t_unv}/mark-unverified", headers=auth_headers())

        # 4. Postponed task (rescheduled to day2)
        t_postp = client.post(
            "/api/v1/tasks", json={"title": "Postponed", "scheduled_date": day1}, headers=auth_headers()
        ).get_json()["data"]["id"]
        # Submit plan for day 1 so instance is captured
        client.post(
            "/api/v1/tasks/daily-plans",
            json={"date": day1, "task_ids": [t_postp]},
            headers=auth_headers(),
        )
        client.post(
            f"/api/v1/tasks/{t_postp}/reschedule",
            json={"new_date": "2026-10-11", "reason": "Pushed to tomorrow"},
            headers=auth_headers(),
        )

        # Generate report for day1
        rep_res = client.get(
            f"/api/v1/reports/custom?start_date={day1}&end_date={day1}", headers=auth_headers()
        )
        assert rep_res.status_code == 200
        rep = rep_res.get_json()["data"]

        # Check total scheduled tasks across window
        assert rep["completed_count"] == 1
        assert rep["not_completed_count"] == 1
        assert rep["unverified_count"] == 1
        assert rep["postponed_count"] == 1

        # Total due = 1 + 1 + 1 + 1 = 4. Completion rate = (1 / 4) * 100 = 25.0%
        # Unverified is NEVER in completed_count!
        assert rep["overall_completion_rate"] == 25.0


def test_report_agrees_with_saved_daily_reviews(client, test_db):
    """
    Weekly/custom report results must strictly agree with saved daily reviews.
    """
    user_claims = {"uid": "user_report_agree_007"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        rev_date = "2026-10-15"

        t = client.post(
            "/api/v1/tasks",
            json={"title": "Daily Task", "scheduled_date": rev_date},
            headers=auth_headers(),
        ).get_json()["data"]["id"]
        client.post(f"/api/v1/tasks/{t}/complete", headers=auth_headers())

        # Submit review: 1 task, 1 completed = 100%
        rev_res = client.post(
            "/api/v1/reviews",
            json={"date": rev_date, "summary": "100% Day"},
            headers=auth_headers(),
        )
        assert rev_res.get_json()["data"]["completion_rate"] == 100.0

        # Generate report spanning rev_date
        rep_res = client.get(
            "/api/v1/reports/custom?start_date=2026-10-14&end_date=2026-10-16",
            headers=auth_headers(),
        )
        assert rep_res.status_code == 200
        rep = rep_res.get_json()["data"]

        # The day breakdown for rev_date must match review exactly
        day_stat = next(d for d in rep["daily_breakdown"] if d["date"] == rev_date)
        assert day_stat["completed_count"] == 1
        assert day_stat["completion_rate"] == 100.0
        assert day_stat["is_empty"] is False


def test_custom_report_date_validation(client, test_db):
    """GET /api/v1/reports/custom rejects start_date > end_date with 400 Bad Request."""
    user_claims = {"uid": "user_date_val_008"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        res = client.get(
            "/api/v1/reports/custom?start_date=2026-10-20&end_date=2026-10-10",
            headers=auth_headers(),
        )
        assert res.status_code == 400
        assert "cannot be after end date" in res.get_json()["error"]["message"]


# ==============================================================================
# CROSS-USER SECURITY TESTS
# ==============================================================================


def test_cross_user_review_and_report_isolation(client, test_db):
    """
    ZERO-TRUST SECURITY:
    User A's daily reviews and progress are completely isolated from User B.
    User B cannot retrieve User A's daily review or task history.
    """
    alice_claims = {"uid": "alice_uid", "email": "alice@example.com"}
    bob_claims = {"uid": "bob_uid", "email": "bob@example.com"}

    with patch(
        "app.repositories.firestore_base.BaseFirestoreRepository.db",
        new_callable=lambda: property(lambda self: test_db),
    ):
        rev_date = "2026-10-18"

        # Alice creates a task and review
        with patch("firebase_admin.auth.verify_id_token", return_value=alice_claims):
            client.post(
                "/api/v1/tasks",
                json={"title": "Alice Private Review Task", "scheduled_date": rev_date},
                headers=auth_headers(),
            )
            client.post(
                "/api/v1/reviews",
                json={"date": rev_date, "summary": "Alice confidential notes"},
                headers=auth_headers(),
            )

        # Bob attempts to access Alice's review
        with patch("firebase_admin.auth.verify_id_token", return_value=bob_claims):
            # Bob cannot GET Alice's review
            assert client.get(f"/api/v1/reviews/{rev_date}", headers=auth_headers()).status_code == 404

            # Bob cannot GET task history for Alice's date
            bob_hist = client.get(f"/api/v1/reviews/{rev_date}/task-history", headers=auth_headers())
            assert len(bob_hist.get_json()["data"]) == 0
