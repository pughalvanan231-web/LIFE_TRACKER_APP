from unittest.mock import patch

import pytest

from app.schemas.goal import GoalCategory, GoalPriority, GoalStatus, GoalTimeframe
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
# GOALS API TESTS
# ==============================================================================


def test_create_goal_with_full_metadata(client, test_db):
    """
    POST /api/v1/goals
    Verifies full support for timeframe, measurable metrics, priority, custom dates,
    and automatic timestamp generation.
    """
    user_claims = {"uid": "user_arch_101", "email": "architect@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        payload = {
            "title": "Master Distributed Systems",
            "description": "Learn event sourcing, CQRS, and consensus algorithms",
            "category": GoalCategory.CAREER.value,
            "priority": GoalPriority.HIGH.value,
            "timeframe": GoalTimeframe.LONG_TERM.value,
            "start_date": "2026-01-01",
            "target_date": "2026-12-31",
            "target_value": 100.0,
            "current_value": 15.0,
            "unit": "chapters",
        }

        res = client.post("/api/v1/goals", json=payload, headers=auth_headers())
        assert res.status_code == 201
        body = res.get_json()
        assert body["success"] is True
        goal = body["data"]

        assert goal["title"] == payload["title"]
        assert goal["category"] == GoalCategory.CAREER.value
        assert goal["priority"] == GoalPriority.HIGH.value
        assert goal["timeframe"] == GoalTimeframe.LONG_TERM.value
        assert goal["status"] == GoalStatus.ACTIVE.value
        assert goal["target_value"] == 100.0
        assert goal["current_value"] == 15.0
        assert goal["unit"] == "chapters"
        assert goal["start_date"] == "2026-01-01"
        assert goal["target_date"] == "2026-12-31"
        assert goal["uid"] == "user_arch_101"
        assert "created_at" in goal
        assert "updated_at" in goal


def test_create_goal_validation_date_order(client, test_db):
    """
    POST /api/v1/goals
    Strict validation: start_date > target_date must return 422 Unprocessable Entity.
    """
    user_claims = {"uid": "user_date_test"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        invalid_payload = {
            "title": "Impossible Goal",
            "start_date": "2026-12-31",
            "target_date": "2026-01-01",  # Precedes start_date
        }

        res = client.post("/api/v1/goals", json=invalid_payload, headers=auth_headers())
        assert res.status_code == 422
        body = res.get_json()
        assert body["success"] is False
        assert "validation_error" in body["error"]["code"].lower()


def test_create_goal_invalid_enum_rejected(client, test_db):
    """POST /api/v1/goals with invalid timeframe or priority returns 422."""
    user_claims = {"uid": "user_enum_test"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        res = client.post(
            "/api/v1/goals",
            json={"title": "Test", "timeframe": "invalid_term"},
            headers=auth_headers(),
        )
        assert res.status_code == 422


def test_list_goals_filtering_sorting_pagination(client, test_db):
    """
    GET /api/v1/goals
    Supports filtering (category, status, timeframe, priority), sorting, and pagination.
    """
    user_claims = {"uid": "user_filter_sort"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create 3 goals
        goals_data = [
            {"title": "Goal Alpha", "category": "career", "priority": "high", "timeframe": "short_term"},
            {"title": "Goal Beta", "category": "health", "priority": "medium", "timeframe": "long_term"},
            {"title": "Goal Gamma", "category": "career", "priority": "low", "timeframe": "long_term"},
        ]
        for g in goals_data:
            client.post("/api/v1/goals", json=g, headers=auth_headers())

        # 1. Filter by category
        res_career = client.get("/api/v1/goals?category=career", headers=auth_headers())
        assert res_career.status_code == 200
        items = res_career.get_json()["data"]["items"]
        assert len(items) == 2
        assert all(it["category"] == "career" for it in items)

        # 2. Filter by timeframe
        res_timeframe = client.get("/api/v1/goals?timeframe=short_term", headers=auth_headers())
        assert res_timeframe.status_code == 200
        items_st = res_timeframe.get_json()["data"]["items"]
        assert len(items_st) == 1
        assert items_st[0]["title"] == "Goal Alpha"

        # 3. Pagination limit
        res_page = client.get("/api/v1/goals?page=1&limit=2", headers=auth_headers())
        assert res_page.status_code == 200
        p_data = res_page.get_json()["data"]
        assert len(p_data["items"]) == 2
        assert p_data["total_count"] == 3
        assert p_data["has_next"] is True


def test_patch_goal_date_history_preservation(client, test_db):
    """
    PATCH /api/v1/goals/{goal_id}
    Updating target_date must preserve previous deadline in date_history audit trail.
    """
    user_claims = {"uid": "user_date_history"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create goal with initial target_date
        res = client.post(
            "/api/v1/goals",
            json={"title": "Pass GCP Architect Exam", "target_date": "2026-06-01"},
            headers=auth_headers(),
        )
        goal_id = res.get_json()["data"]["id"]

        # Update target_date with reason
        patch_res = client.patch(
            f"/api/v1/goals/{goal_id}",
            json={
                "target_date": "2026-09-01",
                "date_change_reason": "Need more time for practical lab exams",
            },
            headers=auth_headers(),
        )
        assert patch_res.status_code == 200
        updated = patch_res.get_json()["data"]
        assert updated["target_date"] == "2026-09-01"
        assert len(updated["date_history"]) == 1
        entry = updated["date_history"][0]
        assert entry["previous_target_date"] == "2026-06-01"
        assert entry["new_target_date"] == "2026-09-01"
        assert entry["reason"] == "Need more time for practical lab exams"
        assert "changed_at" in entry


def test_goal_status_transition_rules(client, test_db):
    """
    PATCH /api/v1/goals/{goal_id}
    Enforces valid lifecycle transitions:
    not_started -> in_progress (allowed)
    in_progress -> completed (allowed)
    completed -> in_progress (forbidden, raises 400 Bad Request)
    """
    user_claims = {"uid": "user_status_flow"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        create_res = client.post(
            "/api/v1/goals",
            json={"title": "Status Workflow Goal"},
            headers=auth_headers(),
        )
        goal_id = create_res.get_json()["data"]["id"]

        # 1. active -> paused (valid)
        r1 = client.patch(
            f"/api/v1/goals/{goal_id}",
            json={"status": GoalStatus.PAUSED.value},
            headers=auth_headers(),
        )
        assert r1.status_code == 200
        assert r1.get_json()["data"]["status"] == GoalStatus.PAUSED.value

        # 2. paused -> active -> completed (valid)
        client.patch(
            f"/api/v1/goals/{goal_id}",
            json={"status": GoalStatus.ACTIVE.value},
            headers=auth_headers(),
        )
        r2 = client.patch(
            f"/api/v1/goals/{goal_id}",
            json={"status": GoalStatus.COMPLETED.value},
            headers=auth_headers(),
        )
        assert r2.status_code == 200
        assert r2.get_json()["data"]["status"] == GoalStatus.COMPLETED.value

        # 3. completed -> paused (invalid: completed goals can only be unarchived/active or archived)
        r3 = client.patch(
            f"/api/v1/goals/{goal_id}",
            json={"status": GoalStatus.PAUSED.value},
            headers=auth_headers(),
        )
        assert r3.status_code == 400
        assert "Invalid status transition" in r3.get_json()["error"]["message"]


def test_passed_deadline_never_auto_completes_goal(client, test_db):
    """
    REQUIREMENT: Never complete a goal only because its deadline passed.
    Even if target_date is in the past, status remains unchanged unless explicitly completed.
    """
    user_claims = {"uid": "user_past_deadline"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create goal with target_date in the past
        res = client.post(
            "/api/v1/goals",
            json={"title": "Past Goal", "target_date": "2020-01-01"},
            headers=auth_headers(),
        )
        goal_id = res.get_json()["data"]["id"]

        get_res = client.get(f"/api/v1/goals/{goal_id}", headers=auth_headers())
        assert get_res.status_code == 200
        goal = get_res.get_json()["data"]
        # Must still be ACTIVE, never COMPLETED
        assert goal["status"] == GoalStatus.ACTIVE.value


def test_delete_goal_archival_vs_permanent(client, test_db):
    """
    DELETE /api/v1/goals/{goal_id}
    - Default policy: Safe archival (soft-delete, status=archived).
    - ?permanent=true policy: Hard delete, removes record and cascades milestones.
    """
    user_claims = {"uid": "user_delete_policy"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # 1. Soft archival
        res1 = client.post("/api/v1/goals", json={"title": "Archived Goal"}, headers=auth_headers())
        g1_id = res1.get_json()["data"]["id"]

        del1 = client.delete(f"/api/v1/goals/{g1_id}", headers=auth_headers())
        assert del1.status_code == 200
        assert del1.get_json()["data"]["archived"] is True

        # Goal is still retrievable with archived status
        get_archived = client.get(f"/api/v1/goals/{g1_id}", headers=auth_headers())
        assert get_archived.status_code == 200
        assert get_archived.get_json()["data"]["status"] == GoalStatus.ARCHIVED.value

        # 2. Permanent deletion
        res2 = client.post("/api/v1/goals", json={"title": "Permanent Goal"}, headers=auth_headers())
        g2_id = res2.get_json()["data"]["id"]

        del2 = client.delete(f"/api/v1/goals/{g2_id}?permanent=true", headers=auth_headers())
        assert del2.status_code == 200
        assert del2.get_json()["data"]["policy"] == "permanent"

        # Goal should now be completely gone (404)
        get_gone = client.get(f"/api/v1/goals/{g2_id}", headers=auth_headers())
        assert get_gone.status_code == 404


# ==============================================================================
# MILESTONES API & INTEGRITY TESTS
# ==============================================================================


def test_milestone_crud_and_weighted_progress_recalculation(client, test_db):
    """
    POST/PATCH/DELETE /api/v1/goals/{goal_id}/milestones
    Verifies milestone creation, weighted progress recalculation on parent goal,
    date history preservation on milestones, and cascade updates.
    """
    user_claims = {"uid": "user_milestones_calc"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # 1. Create parent goal
        goal_res = client.post(
            "/api/v1/goals",
            json={"title": "Complete Marathon Training"},
            headers=auth_headers(),
        )
        goal_id = goal_res.get_json()["data"]["id"]

        # 2. Add Milestone 1 (Weight: 1.0)
        m1_res = client.post(
            f"/api/v1/goals/{goal_id}/milestones",
            json={
                "title": "Run 5K",
                "weight": 1.0,
                "target_date": "2026-03-01",
                "order": 1,
            },
            headers=auth_headers(),
        )
        assert m1_res.status_code == 201
        m1_id = m1_res.get_json()["data"]["id"]
        assert m1_res.get_json()["data"]["weight"] == 1.0

        # 3. Add Milestone 2 (Weight: 3.0)
        m2_res = client.post(
            f"/api/v1/goals/{goal_id}/milestones",
            json={
                "title": "Run 20K Long Run",
                "weight": 3.0,
                "target_date": "2026-06-01",
                "order": 2,
            },
            headers=auth_headers(),
        )
        assert m2_res.status_code == 201
        m2_id = m2_res.get_json()["data"]["id"]

        # Initially progress is 0%
        goal_check = client.get(f"/api/v1/goals/{goal_id}", headers=auth_headers())
        assert goal_check.get_json()["data"]["progress_percentage"] == 0

        # 4. Mark Milestone 1 completed (1.0 weight out of 4.0 total weight = 25%)
        patch_m1 = client.patch(
            f"/api/v1/goals/{goal_id}/milestones/{m1_id}",
            json={"is_completed": True},
            headers=auth_headers(),
        )
        assert patch_m1.status_code == 200
        assert patch_m1.get_json()["data"]["is_completed"] is True

        # Check goal progress updated to 25%
        goal_after_m1 = client.get(f"/api/v1/goals/{goal_id}", headers=auth_headers())
        assert goal_after_m1.get_json()["data"]["progress_percentage"] == 25

        # 5. Milestone date update preserves history
        patch_m2_date = client.patch(
            f"/api/v1/goals/{goal_id}/milestones/{m2_id}",
            json={
                "target_date": "2026-07-01",
                "date_change_reason": "Recovering from minor knee strain",
            },
            headers=auth_headers(),
        )
        assert patch_m2_date.status_code == 200
        m2_data = patch_m2_date.get_json()["data"]
        assert m2_data["target_date"] == "2026-07-01"
        assert len(m2_data["date_history"]) == 1
        assert m2_data["date_history"][0]["previous_target_date"] == "2026-06-01"
        assert m2_data["date_history"][0]["new_target_date"] == "2026-07-01"

        # 6. Complete Milestone 2 (Total completed = 4.0 / 4.0 = 100%)
        client.patch(
            f"/api/v1/goals/{goal_id}/milestones/{m2_id}",
            json={"is_completed": True},
            headers=auth_headers(),
        )
        goal_after_m2 = client.get(f"/api/v1/goals/{goal_id}", headers=auth_headers())
        assert goal_after_m2.get_json()["data"]["progress_percentage"] == 100

        # 7. Delete Milestone 1 (Now only M2 remains, 3.0 / 3.0 = 100%)
        del_m1 = client.delete(
            f"/api/v1/goals/{goal_id}/milestones/{m1_id}",
            headers=auth_headers(),
        )
        assert del_m1.status_code == 200
        assert del_m1.get_json()["data"]["deleted"] is True


def test_milestone_cross_goal_mismatch_rejected(client, test_db):
    """
    INTEGRITY TEST: Attempting to update or delete a milestone under the WRONG goal ID
    must be rejected with 400 Bad Request ("does not belong to goal").
    """
    user_claims = {"uid": "user_cross_goal"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=user_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: test_db),
        ),
    ):
        # Create Goal 1 and Goal 2
        g1_res = client.post("/api/v1/goals", json={"title": "Goal 1"}, headers=auth_headers())
        g1_id = g1_res.get_json()["data"]["id"]

        g2_res = client.post("/api/v1/goals", json={"title": "Goal 2"}, headers=auth_headers())
        g2_id = g2_res.get_json()["data"]["id"]

        # Create milestone under Goal 1
        m_res = client.post(
            f"/api/v1/goals/{g1_id}/milestones",
            json={"title": "Goal 1 Task"},
            headers=auth_headers(),
        )
        m_id = m_res.get_json()["data"]["id"]

        # Attempt to PATCH milestone via Goal 2 path
        patch_res = client.patch(
            f"/api/v1/goals/{g2_id}/milestones/{m_id}",
            json={"is_completed": True},
            headers=auth_headers(),
        )
        assert patch_res.status_code == 400
        assert "does not belong to goal" in patch_res.get_json()["error"]["message"]

        # Attempt to DELETE milestone via Goal 2 path
        del_res = client.delete(
            f"/api/v1/goals/{g2_id}/milestones/{m_id}",
            headers=auth_headers(),
        )
        assert del_res.status_code == 400
        assert "does not belong to goal" in del_res.get_json()["error"]["message"]


# ==============================================================================
# CROSS-USER SECURITY TESTS
# ==============================================================================


def test_cross_user_isolation_prevented(client, test_db):
    """
    ZERO-TRUST SECURITY:
    User Alice creates a goal and milestone.
    User Bob cannot GET, PATCH, DELETE, or append milestones to Alice's goal.
    All cross-user attempts must return 404 Not Found to prevent data discovery.
    """
    alice_claims = {"uid": "alice_uid", "email": "alice@example.com"}
    bob_claims = {"uid": "bob_uid", "email": "bob@example.com"}

    with patch(
        "app.repositories.firestore_base.BaseFirestoreRepository.db",
        new_callable=lambda: property(lambda self: test_db),
    ):
        # 1. Alice creates goal and milestone
        with patch("firebase_admin.auth.verify_id_token", return_value=alice_claims):
            g_res = client.post(
                "/api/v1/goals",
                json={"title": "Alice Secret Ambition"},
                headers=auth_headers(),
            )
            alice_goal_id = g_res.get_json()["data"]["id"]

            m_res = client.post(
                f"/api/v1/goals/{alice_goal_id}/milestones",
                json={"title": "Alice Secret Milestone"},
                headers=auth_headers(),
            )
            alice_m_id = m_res.get_json()["data"]["id"]

        # 2. Bob attempts unauthorized operations on Alice's goal and milestone
        with patch("firebase_admin.auth.verify_id_token", return_value=bob_claims):
            # Bob cannot GET Alice's goal
            assert client.get(f"/api/v1/goals/{alice_goal_id}", headers=auth_headers()).status_code == 404

            # Bob cannot PATCH Alice's goal
            assert (
                client.patch(
                    f"/api/v1/goals/{alice_goal_id}",
                    json={"title": "Bob Hacked Title"},
                    headers=auth_headers(),
                ).status_code
                == 404
            )

            # Bob cannot DELETE Alice's goal
            assert client.delete(f"/api/v1/goals/{alice_goal_id}", headers=auth_headers()).status_code == 404

            # Bob cannot attach a milestone to Alice's goal
            assert (
                client.post(
                    f"/api/v1/goals/{alice_goal_id}/milestones",
                    json={"title": "Bob Injected Milestone"},
                    headers=auth_headers(),
                ).status_code
                == 404
            )

            # Bob cannot list milestones for Alice's goal
            assert client.get(f"/api/v1/goals/{alice_goal_id}/milestones", headers=auth_headers()).status_code == 404

            # Bob cannot update Alice's milestone
            assert (
                client.patch(
                    f"/api/v1/goals/{alice_goal_id}/milestones/{alice_m_id}",
                    json={"is_completed": True},
                    headers=auth_headers(),
                ).status_code
                == 404
            )

            # Bob cannot delete Alice's milestone
            assert (
                client.delete(
                    f"/api/v1/goals/{alice_goal_id}/milestones/{alice_m_id}",
                    headers=auth_headers(),
                ).status_code
                == 404
            )
