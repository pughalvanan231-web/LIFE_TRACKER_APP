import math
from datetime import datetime, timezone
from typing import Optional

from app.exceptions import BadRequestError, NotFoundError
from app.repositories.goal_repository import GoalRepository
from app.repositories.milestone_repository import MilestoneRepository
from app.schemas.goal import GoalCreateRequest, GoalResponse, GoalStatus, GoalUpdateRequest
from app.schemas.pagination import PaginatedListResponse

VALID_STATUS_TRANSITIONS = {
    GoalStatus.ACTIVE: {GoalStatus.COMPLETED, GoalStatus.PAUSED, GoalStatus.ARCHIVED},
    GoalStatus.PAUSED: {GoalStatus.ACTIVE, GoalStatus.ARCHIVED},
    GoalStatus.COMPLETED: {GoalStatus.ACTIVE, GoalStatus.ARCHIVED},
    GoalStatus.ARCHIVED: {GoalStatus.ACTIVE},  # Reopen/unarchive
}


class GoalService:
    """Domain service managing user goals business logic, validation, and historical integrity."""

    def __init__(
        self,
        repository: Optional[GoalRepository] = None,
        milestone_repository: Optional[MilestoneRepository] = None,
    ):
        self.repo = repository or GoalRepository()
        self.milestone_repo = milestone_repository or MilestoneRepository()

    def get_goal(self, uid: str, goal_id: str) -> GoalResponse:
        """Retrieve a goal belonging strictly to the authenticated user."""
        goal_data = self.repo.get_by_id(uid, goal_id)
        if not goal_data:
            raise NotFoundError(f"Goal '{goal_id}' was not found.")
        return GoalResponse.model_validate(goal_data)

    def list_goals(
        self,
        uid: str,
        status: Optional[str] = None,
        category: Optional[str] = None,
        timeframe: Optional[str] = None,
        priority: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        page: int = 1,
        limit: int = 20,
    ) -> PaginatedListResponse[GoalResponse]:
        """List goals for the authenticated user with multi-field filtering, sorting, and pagination."""
        page = max(1, page)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit

        # Allowed sort fields
        allowed_sort_fields = {"created_at", "target_date", "priority", "title", "progress_percentage"}
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"

        items_data, total_count = self.repo.list_goals(
            uid,
            status=status,
            category=category,
            timeframe=timeframe,
            priority=priority,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            offset=offset,
        )

        total_pages = math.ceil(total_count / limit) if total_count > 0 else 1
        items = [GoalResponse.model_validate(item) for item in items_data]

        return PaginatedListResponse[GoalResponse](
            items=items,
            total_count=total_count,
            page=page,
            limit=limit,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        )

    def create_goal(self, uid: str, req: GoalCreateRequest) -> GoalResponse:
        """Create a new goal with initial status, metrics, and date validation."""
        payload = req.model_dump()
        payload.setdefault("status", GoalStatus.ACTIVE.value)
        payload.setdefault("progress_percentage", 0)
        payload.setdefault("date_history", [])

        created_data = self.repo.create_goal(uid, payload)
        return GoalResponse.model_validate(created_data)

    def update_goal(self, uid: str, goal_id: str, req: GoalUpdateRequest) -> GoalResponse:
        """
        Update an existing goal with:
        - Date history preservation
        - Status transition validation
        - Deadline overdue safety (never automatically complete on deadline pass)
        """
        existing = self.repo.get_by_id(uid, goal_id)
        if not existing:
            raise NotFoundError(f"Goal '{goal_id}' was not found.")

        updates = req.model_dump(exclude_unset=True, exclude_none=True)
        if not updates:
            return GoalResponse.model_validate(existing)

        # 1. Status transition validation
        current_status = GoalStatus(existing.get("status", GoalStatus.ACTIVE.value))
        new_status_val = updates.get("status")
        if new_status_val:
            new_status = GoalStatus(new_status_val)
            if new_status != current_status:
                allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
                if new_status not in allowed:
                    raise BadRequestError(
                        f"Invalid status transition from '{current_status.value}' to '{new_status.value}'."
                    )
                # If archiving, record archived_at
                if new_status == GoalStatus.ARCHIVED:
                    updates["archived_at"] = datetime.now(timezone.utc)
                elif current_status == GoalStatus.ARCHIVED:
                    updates["archived_at"] = None

        # 2. Date validation across existing & updated dates
        effective_start = updates.get("start_date") or existing.get("start_date")
        effective_target = updates.get("target_date") or existing.get("target_date")
        if effective_start and effective_target and effective_start > effective_target:
            raise BadRequestError(
                f"start_date ({effective_start}) cannot be after target_date ({effective_target})."
            )

        # 3. Preserve historical information when deadlines change
        if "target_date" in updates and updates["target_date"] != existing.get("target_date"):
            history = list(existing.get("date_history") or [])
            history.append({
                "previous_target_date": existing.get("target_date"),
                "new_target_date": updates["target_date"],
                "changed_at": datetime.now(timezone.utc),
                "reason": updates.pop("date_change_reason", None),
            })
            updates["date_history"] = history
        else:
            updates.pop("date_change_reason", None)

        updated_data = self.repo.update_goal(uid, goal_id, updates)
        if not updated_data:
            raise NotFoundError(f"Goal '{goal_id}' was not found.")

        return GoalResponse.model_validate(updated_data)

    def recalculate_goal_progress(self, uid: str, goal_id: str) -> int:
        """
        Recalculate goal progress percentage based on milestone weights.
        Formula: (sum of completed milestone weights / total milestone weights) * 100
        """
        milestones = self.milestone_repo.list_by_goal(uid, goal_id)
        if not milestones:
            return 0

        total_weight = sum(float(m.get("weight", 1.0)) for m in milestones)
        if total_weight <= 0:
            return 0

        completed_weight = sum(
            float(m.get("weight", 1.0))
            for m in milestones
            if m.get("is_completed") is True
        )
        new_progress = min(100, max(0, int(round((completed_weight / total_weight) * 100))))

        self.repo.update_goal(uid, goal_id, {"progress_percentage": new_progress})
        return new_progress

    def delete_goal(self, uid: str, goal_id: str, permanent: bool = False) -> dict:
        """
        Safe deletion / archival policy:
        - Default: Soft-deletes (archives) the goal, preserving history.
        - Permanent=True: Cascades deletion across associated milestones and removes document.
        """
        existing = self.repo.get_by_id(uid, goal_id)
        if not existing:
            raise NotFoundError(f"Goal '{goal_id}' was not found.")

        if permanent:
            # Cascade delete all milestones
            self.milestone_repo.delete_all_by_goal(uid, goal_id)
            self.repo.delete_goal(uid, goal_id)
            return {"id": goal_id, "deleted": True, "policy": "permanent"}

        # Safe archival policy
        self.repo.archive_goal(uid, goal_id)
        return {
            "id": goal_id,
            "archived": True,
            "deleted": True,
            "status": GoalStatus.ARCHIVED.value,
            "policy": "archival",
        }
