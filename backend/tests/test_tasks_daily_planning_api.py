from unittest.mock import patch

import pytest

from app.schemas.task import TaskPriority, TaskStatus
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
# TASK CRUD & FILTERING TESTS
# ==============================================================================


def test_create_task_with_metadata_and_original_deadline(client, test_db):
    """
    POST /api/v1/tasks
    Verifies task creation with estimated duration, due time, scheduled date,
    and automatic preservation of original_due_date.
    """
    user_claims = {"uid": "user_task_001", "email": "dev@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        payload = {
            "title": "Design Database Schema",
            "description": "Define Firestore document paths and index strategies",
            "priority": TaskPriority.URGENT.value,
            "estimated_duration": 75,
            "scheduled_date": "2026-10-27",
            "due_time": "15:00",
        }

        res = client.post("/api/v1/tasks", json=payload, headers=auth_headers())
        assert res.status_code == 201
        body = res.get_json()
        assert body["success"] is True
        task = body["data"]

        assert task["title"] == payload["title"]
        assert task["priority"] == TaskPriority.URGENT.value
        assert task["status"] == TaskStatus.PENDING.value
        assert task["estimated_duration"] == 75
        assert task["scheduled_date"] == "2026-10-27"
        assert task["original_due_date"] == "2026-10-27"
        assert task["due_time"] == "15:00"
        assert task["is_completed"] is False
        assert task["completed_at"] is None
        assert task["reschedule_history"] == []
        assert "id" in task
        assert "created_at" in task


def test_list_tasks_multi_field_filtering_and_pagination(client, test_db):
    """
    GET /api/v1/tasks
    Tests filtering by scheduled date, priority, and status with bounded pagination.
    """
    user_claims = {"uid": "user_filter_002"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create 3 tasks
        tasks = [
            {"title": "Task A", "priority": "high", "status": "pending", "scheduled_date": "2026-10-27"},
            {"title": "Task B", "priority": "low", "status": "in_progress", "scheduled_date": "2026-10-27"},
            {"title": "Task C", "priority": "high", "status": "pending", "scheduled_date": "2026-10-28"},
        ]
        for t in tasks:
            client.post("/api/v1/tasks", json=t, headers=auth_headers())

        # 1. Filter by scheduled date
        res_date = client.get("/api/v1/tasks?date=2026-10-27", headers=auth_headers())
        assert res_date.status_code == 200
        items_date = res_date.get_json()["data"]["items"]
        assert len(items_date) == 2
        assert all(it["scheduled_date"] == "2026-10-27" for it in items_date)

        # 2. Filter by priority
        res_priority = client.get("/api/v1/tasks?priority=high", headers=auth_headers())
        assert res_priority.status_code == 200
        items_prio = res_priority.get_json()["data"]["items"]
        assert len(items_prio) == 2

        # 3. Filter by status
        res_status = client.get("/api/v1/tasks?status=in_progress", headers=auth_headers())
        assert res_status.status_code == 200
        items_status = res_status.get_json()["data"]["items"]
        assert len(items_status) == 1
        assert items_status[0]["title"] == "Task B"

        # 4. Pagination
        res_paged = client.get("/api/v1/tasks?page=1&limit=2", headers=auth_headers())
        assert res_paged.status_code == 200
        paged_data = res_paged.get_json()["data"]
        assert len(paged_data["items"]) == 2
        assert paged_data["total_count"] == 3
        assert paged_data["has_next"] is True


def test_task_status_transitions_and_rejections(client, test_db):
    """
    PATCH /api/v1/tasks/{task_id}
    Enforces valid state transition table:
    pending -> in_progress (valid)
    in_progress -> completed (valid)
    completed -> cancelled (invalid, returns 400 Bad Request)
    """
    user_claims = {"uid": "user_trans_003"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        res = client.post("/api/v1/tasks", json={"title": "Status Test Task"}, headers=auth_headers())
        task_id = res.get_json()["data"]["id"]

        # 1. pending -> in_progress (valid)
        r1 = client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"status": TaskStatus.IN_PROGRESS.value},
            headers=auth_headers(),
        )
        assert r1.status_code == 200
        assert r1.get_json()["data"]["status"] == TaskStatus.IN_PROGRESS.value

        # 2. in_progress -> completed (valid)
        r2 = client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"status": TaskStatus.COMPLETED.value},
            headers=auth_headers(),
        )
        assert r2.status_code == 200
        assert r2.get_json()["data"]["status"] == TaskStatus.COMPLETED.value
        assert r2.get_json()["data"]["is_completed"] is True

        # 3. completed -> cancelled (invalid: completed tasks cannot be directly cancelled)
        r3 = client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"status": TaskStatus.CANCELLED.value},
            headers=auth_headers(),
        )
        assert r3.status_code == 400
        assert "Invalid status transition" in r3.get_json()["error"]["message"]


# ==============================================================================
# EXPLICIT LIFECYCLE ACTION ENDPOINTS
# ==============================================================================


def test_explicit_task_completion_lifecycle(client, test_db):
    """
    POST /api/v1/tasks/{task_id}/complete
    POST /api/v1/tasks/{task_id}/mark-not-completed
    POST /api/v1/tasks/{task_id}/mark-unverified
    Tasks are NEVER completed automatically by passage of time or timer.
    """
    user_claims = {"uid": "user_lifecycle_004"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        create_res = client.post(
            "/api/v1/tasks",
            json={"title": "Explicit Lifecycle Task"},
            headers=auth_headers(),
        )
        task_id = create_res.get_json()["data"]["id"]

        # 1. Complete task explicitly
        comp_res = client.post(f"/api/v1/tasks/{task_id}/complete", headers=auth_headers())
        assert comp_res.status_code == 200
        task_c = comp_res.get_json()["data"]
        assert task_c["status"] == TaskStatus.COMPLETED.value
        assert task_c["is_completed"] is True
        assert task_c["completed_at"] is not None

        # 2. Mark unverified (work claimed but unconfirmed)
        unver_res = client.post(f"/api/v1/tasks/{task_id}/mark-unverified", headers=auth_headers())
        assert unver_res.status_code == 200
        assert unver_res.get_json()["data"]["status"] == TaskStatus.UNVERIFIED.value

        # 3. Mark not completed (missed or rejected)
        not_comp_res = client.post(
            f"/api/v1/tasks/{task_id}/mark-not-completed", headers=auth_headers()
        )
        assert not_comp_res.status_code == 200
        task_nc = not_comp_res.get_json()["data"]
        assert task_nc["status"] == TaskStatus.NOT_COMPLETED.value
        assert task_nc["is_completed"] is False
        assert task_nc["completed_at"] is None


def test_delete_vs_cancel_task(client, test_db):
    """
    DELETE /api/v1/tasks/{task_id}
    - ?cancel=true transitions task to 'cancelled' without deleting document.
    - default: removes document completely.
    """
    user_claims = {"uid": "user_del_cancel_005"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # 1. Cancel task
        res1 = client.post("/api/v1/tasks", json={"title": "Cancelled Task"}, headers=auth_headers())
        t1_id = res1.get_json()["data"]["id"]

        cancel_res = client.delete(f"/api/v1/tasks/{t1_id}?cancel=true", headers=auth_headers())
        assert cancel_res.status_code == 200
        assert cancel_res.get_json()["data"]["cancelled"] is True

        get_res1 = client.get(f"/api/v1/tasks/{t1_id}", headers=auth_headers())
        assert get_res1.status_code == 200
        assert get_res1.get_json()["data"]["status"] == TaskStatus.CANCELLED.value

        # 2. Delete task permanently
        res2 = client.post("/api/v1/tasks", json={"title": "Deleted Task"}, headers=auth_headers())
        t2_id = res2.get_json()["data"]["id"]

        del_res = client.delete(f"/api/v1/tasks/{t2_id}", headers=auth_headers())
        assert del_res.status_code == 200
        assert del_res.get_json()["data"]["deleted"] is True

        get_res2 = client.get(f"/api/v1/tasks/{t2_id}", headers=auth_headers())
        assert get_res2.status_code == 404


# ==============================================================================
# RESCHEDULING & HISTORICAL SNAPSHOT PRESERVATION
# ==============================================================================


def test_reschedule_preserves_original_deadline_and_daily_snapshot(client, test_db):
    """
    POST /api/v1/tasks/{task_id}/reschedule
    Moving a task to tomorrow must:
    1. Preserve original_due_date.
    2. Maintain reschedule_history audit trail with reason and timestamps.
    3. Crucially NOT alter or delete yesterday's submitted daily task instance snapshot.
    """
    user_claims = {"uid": "user_reschedule_006"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # 1. Create task scheduled for Day 1
        create_res = client.post(
            "/api/v1/tasks",
            json={
                "title": "Write Backend Integration Tests",
                "scheduled_date": "2026-10-27",
                "estimated_duration": 60,
            },
            headers=auth_headers(),
        )
        task_id = create_res.get_json()["data"]["id"]

        # 2. Submit Daily Plan for Day 1
        plan_day1 = client.post(
            "/api/v1/tasks/daily-plans",
            json={"date": "2026-10-27", "available_minutes": 480, "task_ids": [task_id]},
            headers=auth_headers(),
        )
        assert plan_day1.status_code == 201

        # Verify Day 1 instance exists
        plan_get_day1 = client.get("/api/v1/tasks/daily-plans/2026-10-27", headers=auth_headers())
        assert len(plan_get_day1.get_json()["data"]["tasks"]) == 1

        # 3. Reschedule task to Day 2
        reschedule_payload = {
            "new_date": "2026-10-28",
            "reason": "Production hotfix took priority",
            "due_time": "11:00",
        }
        resched_res = client.post(
            f"/api/v1/tasks/{task_id}/reschedule",
            json=reschedule_payload,
            headers=auth_headers(),
        )
        assert resched_res.status_code == 200
        task_data = resched_res.get_json()["data"]

        # Verify scheduling & history
        assert task_data["scheduled_date"] == "2026-10-28"
        assert task_data["original_due_date"] == "2026-10-27"
        assert len(task_data["reschedule_history"]) == 1
        entry = task_data["reschedule_history"][0]
        assert entry["previous_date"] == "2026-10-27"
        assert entry["new_date"] == "2026-10-28"
        assert entry["reason"] == "Production hotfix took priority"

        # 4. Crucial verification: Day 1's submitted historical record is preserved!
        plan_get_day1_after = client.get("/api/v1/tasks/daily-plans/2026-10-27", headers=auth_headers())
        assert plan_get_day1_after.status_code == 200
        tasks_day1 = plan_get_day1_after.get_json()["data"]["tasks"]
        assert len(tasks_day1) == 1
        assert tasks_day1[0]["rescheduled_to"] == "2026-10-28"
        assert tasks_day1[0]["status"] == TaskStatus.NOT_COMPLETED.value


# ==============================================================================
# DAILY PLANNING API & WORKLOAD VALIDATION
# ==============================================================================


def test_daily_plan_workload_validation_and_overload_protection(client, test_db):
    """
    POST /api/v1/tasks/daily-plans
    Validates available time vs estimated workload:
    - If total workload exceeds available minutes and allow_overload=false, rejects with 400.
    - If allow_overload=true, creates plan with is_overloaded=true.
    """
    user_claims = {"uid": "user_workload_007"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create 2 heavy tasks (300 mins each = 600 mins total)
        t1 = client.post(
            "/api/v1/tasks",
            json={"title": "Heavy Task 1", "estimated_duration": 300},
            headers=auth_headers(),
        ).get_json()["data"]["id"]

        t2 = client.post(
            "/api/v1/tasks",
            json={"title": "Heavy Task 2", "estimated_duration": 300},
            headers=auth_headers(),
        ).get_json()["data"]["id"]

        # 1. Attempt plan with 480 mins available (600 > 480) with allow_overload=false
        res_reject = client.post(
            "/api/v1/tasks/daily-plans",
            json={
                "date": "2026-10-27",
                "available_minutes": 480,
                "task_ids": [t1, t2],
                "allow_overload": False,
            },
            headers=auth_headers(),
        )
        assert res_reject.status_code == 400
        assert "Planned workload (600 mins) exceeds daily available time" in res_reject.get_json()["error"]["message"]

        # 2. Allow overload explicitly
        res_allow = client.post(
            "/api/v1/tasks/daily-plans",
            json={
                "date": "2026-10-27",
                "available_minutes": 480,
                "task_ids": [t1, t2],
                "allow_overload": True,
            },
            headers=auth_headers(),
        )
        assert res_allow.status_code == 201
        plan = res_allow.get_json()["data"]
        assert plan["total_estimated_minutes"] == 600
        assert plan["is_overloaded"] is True
        assert plan["overload_minutes"] == 120


def test_daily_plan_duplicate_submission_prevented(client, test_db):
    """
    POST /api/v1/tasks/daily-plans
    Submitting a plan twice for the same date must update existing record and
    NOT duplicate task instances or daily plan records.
    """
    user_claims = {"uid": "user_idempotent_008"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        t1 = client.post(
            "/api/v1/tasks",
            json={"title": "Unique Task", "estimated_duration": 60},
            headers=auth_headers(),
        ).get_json()["data"]["id"]

        # Submission 1
        res1 = client.post(
            "/api/v1/tasks/daily-plans",
            json={"date": "2026-10-27", "available_minutes": 480, "task_ids": [t1], "notes": "Initial notes"},
            headers=auth_headers(),
        )
        assert res1.status_code == 201

        # Submission 2 (same date, updated notes)
        res2 = client.post(
            "/api/v1/tasks/daily-plans",
            json={"date": "2026-10-27", "available_minutes": 480, "task_ids": [t1], "notes": "Updated notes"},
            headers=auth_headers(),
        )
        assert res2.status_code == 201
        plan2 = res2.get_json()["data"]
        assert plan2["notes"] == "Updated notes"

        # Verify only 1 daily plan exists and exactly 1 task instance exists
        list_plans = client.get("/api/v1/tasks/daily-plans", headers=auth_headers())
        assert list_plans.get_json()["data"]["total_count"] == 1
        get_plan = client.get("/api/v1/tasks/daily-plans/2026-10-27", headers=auth_headers())
        assert len(get_plan.get_json()["data"]["tasks"]) == 1


# ==============================================================================
# CROSS-USER SECURITY TESTS
# ==============================================================================


def test_cross_user_task_and_plan_isolation(client, test_db):
    """
    ZERO-TRUST SECURITY:
    1. User cannot link a task to another user's goal or milestone.
    2. User B cannot access, reschedule, complete, or plan User A's tasks.
    All cross-user unauthorized accesses must return 404 Not Found.
    """
    alice_claims = {"uid": "alice_uid", "email": "alice@example.com"}
    bob_claims = {"uid": "bob_uid", "email": "bob@example.com"}

    with patch(
        "app.repositories.firestore_base.BaseFirestoreRepository.db",
        new_callable=lambda: property(lambda self: test_db),
    ):
        # 1. Alice creates a private goal and a task
        with patch("firebase_admin.auth.verify_id_token", return_value=alice_claims):
            goal_res = client.post(
                "/api/v1/goals",
                json={"title": "Alice Secret Goal"},
                headers=auth_headers(),
            )
            alice_goal_id = goal_res.get_json()["data"]["id"]

            task_res = client.post(
                "/api/v1/tasks",
                json={"title": "Alice Private Task", "goal_id": alice_goal_id},
                headers=auth_headers(),
            )
            alice_task_id = task_res.get_json()["data"]["id"]

        # 2. Bob attempts unauthorized operations
        with patch("firebase_admin.auth.verify_id_token", return_value=bob_claims):
            # Bob cannot link a new task to Alice's goal
            tamper_create = client.post(
                "/api/v1/tasks",
                json={"title": "Bob Sneak Task", "goal_id": alice_goal_id},
                headers=auth_headers(),
            )
            assert tamper_create.status_code == 404

            # Bob cannot GET Alice's task
            assert client.get(f"/api/v1/tasks/{alice_task_id}", headers=auth_headers()).status_code == 404

            # Bob cannot complete Alice's task
            assert (
                client.post(f"/api/v1/tasks/{alice_task_id}/complete", headers=auth_headers()).status_code
                == 404
            )

            # Bob cannot reschedule Alice's task
            assert (
                client.post(
                    f"/api/v1/tasks/{alice_task_id}/reschedule",
                    json={"new_date": "2026-10-29"},
                    headers=auth_headers(),
                ).status_code
                == 404
            )

            # Bob cannot DELETE Alice's task
            assert client.delete(f"/api/v1/tasks/{alice_task_id}", headers=auth_headers()).status_code == 404

            # Bob cannot schedule Alice's task into his daily plan
            bob_plan = client.post(
                "/api/v1/tasks/daily-plans",
                json={"date": "2026-10-27", "task_ids": [alice_task_id]},
                headers=auth_headers(),
            )
            assert bob_plan.status_code == 404
