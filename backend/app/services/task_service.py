import math
from typing import Optional
from app.exceptions import NotFoundError
from app.repositories.goal_repository import GoalRepository
from app.repositories.milestone_repository import MilestoneRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.pagination import PaginatedListResponse
from app.schemas.task import TaskCreateRequest, TaskResponse, TaskUpdateRequest


class TaskService:
    """Domain service managing user tasks, validation, and consistency transactions."""

    def __init__(
        self,
        task_repo: Optional[TaskRepository] = None,
        goal_repo: Optional[GoalRepository] = None,
        milestone_repo: Optional[MilestoneRepository] = None,
    ):
        self.task_repo = task_repo or TaskRepository()
        self.goal_repo = goal_repo or GoalRepository()
        self.milestone_repo = milestone_repo or MilestoneRepository()

    def get_task(self, uid: str, task_id: str) -> TaskResponse:
        """Retrieve a task belonging to the user."""
        data = self.task_repo.get_by_id(uid, task_id)
        if not data:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return TaskResponse.model_validate(data)

    def list_tasks(
        self,
        uid: str,
        goal_id: Optional[str] = None,
        is_completed: Optional[bool] = None,
        page: int = 1,
        limit: int = 20,
    ) -> PaginatedListResponse[TaskResponse]:
        """List tasks for the authenticated user with validated pagination."""
        page = max(1, page)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit

        items_data, total_count = self.task_repo.list_tasks(
            uid, goal_id=goal_id, is_completed=is_completed, limit=limit, offset=offset
        )

        total_pages = math.ceil(total_count / limit) if total_count > 0 else 1
        items = [TaskResponse.model_validate(item) for item in items_data]

        return PaginatedListResponse[TaskResponse](
            items=items,
            total_count=total_count,
            page=page,
            limit=limit,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        )

    def create_task(self, uid: str, req: TaskCreateRequest) -> TaskResponse:
        """
        Create a task. Validates that referenced goal or milestone belong to the user.
        """
        if req.goal_id:
            goal = self.goal_repo.get_by_id(uid, req.goal_id)
            if not goal:
                raise NotFoundError(f"Referenced goal '{req.goal_id}' was not found.")

        if req.milestone_id:
            milestone = self.milestone_repo.get_by_id(uid, req.milestone_id)
            if not milestone:
                raise NotFoundError(f"Referenced milestone '{req.milestone_id}' was not found.")

        payload = req.model_dump()
        payload.setdefault("is_completed", False)
        created_data = self.task_repo.create_task(uid, payload)
        return TaskResponse.model_validate(created_data)

    def update_task(self, uid: str, task_id: str, req: TaskUpdateRequest) -> TaskResponse:
        """Update an existing task belonging to the user."""
        updates = req.model_dump(exclude_unset=True, exclude_none=True)
        if not updates:
            return self.get_task(uid, task_id)

        updated_data = self.task_repo.update_task(uid, task_id, updates)
        if not updated_data:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return TaskResponse.model_validate(updated_data)

    def toggle_completion_atomic(self, uid: str, task_id: str) -> TaskResponse:
        """Atomically toggle task completion status in a Firestore transaction."""
        result = self.task_repo.toggle_task_completion_transaction(uid, task_id)
        if not result:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return TaskResponse.model_validate(result)

    def delete_task(self, uid: str, task_id: str) -> bool:
        """Delete a task document."""
        success = self.task_repo.delete_task(uid, task_id)
        if not success:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return True
