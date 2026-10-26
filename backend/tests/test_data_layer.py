from unittest.mock import patch

import pytest

from app.exceptions import NotFoundError
from app.repositories.goal_repository import GoalRepository
from app.repositories.milestone_repository import MilestoneRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.goal import GoalCategory, GoalCreateRequest, GoalPriority, GoalUpdateRequest
from app.schemas.milestone import MilestoneCreateRequest
from app.schemas.task import TaskCreateRequest, TaskPriority
from app.services.goal_service import GoalService
from app.services.milestone_service import MilestoneService
from app.services.task_service import TaskService


class MockDocumentSnapshot:
    def __init__(self, doc_id: str, data: dict | None):
        self.id = doc_id
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict:
        return dict(self._data) if self._data else {}


class MockDocumentReference:
    def __init__(self, doc_id: str, store: dict, path: str):
        self.id = doc_id
        self.store = store
        self.path = path

    def get(self, transaction=None) -> MockDocumentSnapshot:
        data = self.store.get(self.path)
        return MockDocumentSnapshot(self.id, data)

    def set(self, data: dict, merge: bool = False):
        if merge and self.path in self.store:
            self.store[self.path].update(data)
        else:
            self.store[self.path] = dict(data)

    def update(self, data: dict):
        if self.path in self.store:
            self.store[self.path].update(data)
        else:
            self.store[self.path] = dict(data)

    def delete(self):
        self.store.pop(self.path, None)


class MockQuery:
    def __init__(self, store: dict, prefix: str):
        self.store = store
        self.prefix = prefix
        self.filters = []
        self.order_field = None
        self.order_desc = False
        self.limit_count = None

    def where(self, field: str, op: str, value):
        new_q = MockQuery(self.store, self.prefix)
        new_q.filters = list(self.filters) + [(field, op, value)]
        new_q.order_field = self.order_field
        new_q.order_desc = self.order_desc
        new_q.limit_count = self.limit_count
        return new_q

    def order_by(self, field: str, direction: str = "ASCENDING"):
        new_q = MockQuery(self.store, self.prefix)
        new_q.filters = list(self.filters)
        new_q.order_field = field
        new_q.order_desc = direction.upper() == "DESCENDING"
        new_q.limit_count = self.limit_count
        return new_q

    def limit(self, count: int):
        new_q = MockQuery(self.store, self.prefix)
        new_q.filters = list(self.filters)
        new_q.order_field = self.order_field
        new_q.order_desc = self.order_desc
        new_q.limit_count = count
        return new_q

    def stream(self):
        matched = []
        seen_user_ids = set()

        for path, data in self.store.items():
            if path.startswith(self.prefix):
                # If querying top-level "users", extract unique user ids
                if self.prefix == "users":
                    parts = path.split("/")
                    if len(parts) >= 2:
                        uid = parts[1]
                        if uid not in seen_user_ids:
                            seen_user_ids.add(uid)
                            user_data = self.store.get(f"users/{uid}") or {"uid": uid}
                            user_data.setdefault("uid", uid)
                            matched.append(MockDocumentSnapshot(uid, user_data))
                    continue

                # Apply where filters
                match = True
                for field, op, val in self.filters:
                    if op == "==" and data.get(field) != val:
                        match = False
                        break
                if match:
                    doc_id = path.split("/")[-1]
                    matched.append(MockDocumentSnapshot(doc_id, data))

        if self.order_field:
            matched.sort(
                key=lambda x: str(x.to_dict().get(self.order_field, "")),
                reverse=self.order_desc,
            )
        if self.limit_count is not None:
            matched = matched[: self.limit_count]
        return iter(matched)


class MockCollectionReference:
    def __init__(self, store: dict, path: str):
        self.store = store
        self.path = path

    def document(self, doc_id: str) -> MockDocumentReference:
        return MockDocumentReference(doc_id, self.store, f"{self.path}/{doc_id}")

    def where(self, field: str, op: str, value):
        return MockQuery(self.store, self.path).where(field, op, value)

    def order_by(self, field: str, direction: str = "ASCENDING"):
        return MockQuery(self.store, self.path).order_by(field, direction)

    def limit(self, count: int):
        return MockQuery(self.store, self.path).limit(count)

    def stream(self):
        return MockQuery(self.store, self.path).stream()


class MockFirestoreClient:
    """In-memory mock Firestore database for unit testing."""

    def __init__(self):
        self.store = {}
        self._is_mock = True

    def collection(self, name: str):
        return MockTopLevelCollection(self.store, name)

    def transaction(self):
        class MockTransaction:
            def __init__(self):
                self._read_only = False
                self._id = b"mock-tx-id"
                self._max_attempts = 5

            def update(self, ref, data):
                ref.update(data)

            def _clean_up(self):
                pass

            def _commit(self):
                pass

            def _rollback(self):
                pass

        return MockTransaction()


class MockTopLevelCollection:
    def __init__(self, store: dict, name: str):
        self.store = store
        self.name = name

    def document(self, doc_id: str):
        return MockUserDocument(self.store, f"{self.name}/{doc_id}")

    def order_by(self, field: str, direction: str = "ASCENDING"):
        return MockQuery(self.store, self.name).order_by(field, direction)

    def limit(self, count: int):
        return MockQuery(self.store, self.name).limit(count)

    def stream(self):
        return MockQuery(self.store, self.name).stream()


class MockUserDocument:
    def __init__(self, store: dict, path: str):
        self.store = store
        self.path = path
        self.id = path.split("/")[-1]

    def collection(self, subcollection: str):
        return MockCollectionReference(self.store, f"{self.path}/{subcollection}")

    def get(self, transaction=None) -> MockDocumentSnapshot:
        data = self.store.get(self.path)
        return MockDocumentSnapshot(self.id, data)

    def set(self, data: dict, merge: bool = False):
        if merge and self.path in self.store:
            self.store[self.path].update(data)
        else:
            self.store[self.path] = dict(data)

    def update(self, data: dict):
        if self.path in self.store:
            self.store[self.path].update(data)
        else:
            self.store[self.path] = dict(data)

    def delete(self):
        self.store.pop(self.path, None)


@pytest.fixture
def mock_db():
    return MockFirestoreClient()


@pytest.fixture
def goal_service(mock_db):
    repo = GoalRepository(db=mock_db)
    return GoalService(repository=repo)


@pytest.fixture
def milestone_service(mock_db):
    m_repo = MilestoneRepository(db=mock_db)
    g_repo = GoalRepository(db=mock_db)
    return MilestoneService(milestone_repo=m_repo, goal_repo=g_repo)


@pytest.fixture
def task_service(mock_db):
    t_repo = TaskRepository(db=mock_db)
    g_repo = GoalRepository(db=mock_db)
    m_repo = MilestoneRepository(db=mock_db)
    return TaskService(task_repo=t_repo, goal_repo=g_repo, milestone_repo=m_repo)


# ==============================================================================
# TESTS
# ==============================================================================


def test_goal_creation_and_cross_user_isolation(goal_service: GoalService):
    """
    SECURITY TEST: User A creates a goal.
    User A can retrieve it. User B cannot retrieve it (returns NotFoundError).
    """
    req = GoalCreateRequest(
        title="Become Senior Cloud Architect",
        description="Master distributed systems and GCP",
        category=GoalCategory.CAREER,
        priority=GoalPriority.HIGH,
    )

    # User Alpha creates goal
    goal_alpha = goal_service.create_goal("user_alpha", req)
    assert goal_alpha.id is not None
    assert goal_alpha.uid == "user_alpha"
    assert goal_alpha.title == "Become Senior Cloud Architect"

    # User Alpha can access the goal
    retrieved = goal_service.get_goal("user_alpha", goal_alpha.id)
    assert retrieved.id == goal_alpha.id

    # User Beta attempts to access User Alpha's goal -> NotFoundError (access denied / isolated)
    with pytest.raises(NotFoundError, match="was not found"):
        goal_service.get_goal("user_beta", goal_alpha.id)


def test_cross_user_milestone_reference_rejected(
    goal_service: GoalService, milestone_service: MilestoneService
):
    """
    SECURITY TEST: User Beta attempts to attach a milestone to User Alpha's goal.
    Must be strictly rejected with NotFoundError (preventing cross-user references).
    """
    # User Alpha creates goal
    goal = goal_service.create_goal(
        "user_alpha",
        GoalCreateRequest(title="Alpha Private Goal", category=GoalCategory.HEALTH),
    )

    # User Beta attempts to reference User Alpha's goal ID
    m_req = MilestoneCreateRequest(
        goal_id=goal.id,
        title="Beta Sneak Milestone",
        order=1,
    )

    with pytest.raises(NotFoundError, match="within your account"):
        milestone_service.create_milestone("user_beta", m_req)


def test_milestone_parent_validation(milestone_service: MilestoneService):
    """Attempting to create a milestone with nonexistent goal_id raises NotFoundError."""
    m_req = MilestoneCreateRequest(
        goal_id="nonexistent-goal-id-999",
        title="Orphan Milestone",
        order=1,
    )

    with pytest.raises(NotFoundError, match="within your account"):
        milestone_service.create_milestone("user_alpha", m_req)


def test_pagination_for_goals(goal_service: GoalService):
    """Verify pagination calculation, total_pages, and slice boundaries."""
    uid = "user_paginated"
    # Create 7 goals
    for i in range(1, 8):
        goal_service.create_goal(
            uid,
            GoalCreateRequest(title=f"Goal #{i}", category=GoalCategory.PERSONAL_GROWTH),
        )

    # Page 1 with limit 3 -> items 1, 2, 3
    page1 = goal_service.list_goals(uid, page=1, limit=3)
    assert page1.total_count == 7
    assert page1.total_pages == 3
    assert len(page1.items) == 3
    assert page1.has_next is True
    assert page1.has_previous is False

    # Page 2 with limit 3 -> items 4, 5, 6
    page2 = goal_service.list_goals(uid, page=2, limit=3)
    assert len(page2.items) == 3
    assert page2.has_next is True
    assert page2.has_previous is True

    # Page 3 with limit 3 -> item 7
    page3 = goal_service.list_goals(uid, page=3, limit=3)
    assert len(page3.items) == 1
    assert page3.has_next is False
    assert page3.has_previous is True


def test_safe_goal_update(goal_service: GoalService):
    """Updating a goal modifies target fields and updates timestamp without wiping document."""
    uid = "user_updater"
    created = goal_service.create_goal(
        uid,
        GoalCreateRequest(title="Initial Title", description="Keep this description"),
    )

    updated = goal_service.update_goal(
        uid,
        created.id,
        GoalUpdateRequest(title="Updated Title", progress_percentage=50),
    )

    assert updated.title == "Updated Title"
    assert updated.description == "Keep this description"
    assert updated.progress_percentage == 50
    assert updated.updated_at >= created.updated_at


def test_task_creation_and_atomic_toggle(task_service: TaskService):
    """Create a task and verify atomic completion toggle transaction."""
    uid = "user_tasker"
    task = task_service.create_task(
        uid,
        TaskCreateRequest(title="Daily Exercise", priority=TaskPriority.HIGH),
    )

    assert task.is_completed is False
    assert task.completed_at is None

    # Toggle 1: Mark completed
    toggled_1 = task_service.toggle_completion_atomic(uid, task.id)
    assert toggled_1.is_completed is True
    assert toggled_1.completed_at is not None

    # Toggle 2: Mark uncompleted
    toggled_2 = task_service.toggle_completion_atomic(uid, task.id)
    assert toggled_2.is_completed is False
    assert toggled_2.completed_at is None


def test_e2e_goals_api_endpoints(client, mock_db):
    """Verify REST API routes /api/v1/goals using authenticated test client."""
    mock_claims = {"uid": "api_test_user_888", "email": "tester@example.com"}

    with (
        patch("firebase_admin.auth.verify_id_token", return_value=mock_claims),
        patch(
            "app.repositories.firestore_base.BaseFirestoreRepository.db",
            new_callable=lambda: property(lambda self: mock_db),
        ),
    ):
        headers = {
            "Authorization": "Bearer mock.valid.jwt",
            "Content-Type": "application/json",
        }

        # 1. Create Goal via POST
        create_res = client.post(
            "/api/v1/goals",
            json={"title": "Master Cloud Security", "category": "career"},
            headers=headers,
        )
        assert create_res.status_code == 201
        goal_data = create_res.get_json()["data"]
        assert goal_data["title"] == "Master Cloud Security"
        goal_id = goal_data["id"]

        # 2. Get Goal via GET
        get_res = client.get(f"/api/v1/goals/{goal_id}", headers=headers)
        assert get_res.status_code == 200
        assert get_res.get_json()["data"]["id"] == goal_id

        # 3. List Goals with pagination
        list_res = client.get("/api/v1/goals?page=1&limit=10", headers=headers)
        assert list_res.status_code == 200
        assert list_res.get_json()["data"]["total_count"] >= 1

        # 4. Update Goal via PATCH
        patch_res = client.patch(
            f"/api/v1/goals/{goal_id}",
            json={"progress_percentage": 75},
            headers=headers,
        )
        assert patch_res.status_code == 200
        assert patch_res.get_json()["data"]["progress_percentage"] == 75

        # 5. Delete Goal via DELETE
        del_res = client.delete(f"/api/v1/goals/{goal_id}", headers=headers)
        assert del_res.status_code == 200
        assert del_res.get_json()["data"]["deleted"] is True
