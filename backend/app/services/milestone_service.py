from datetime import datetime, timezone
from typing import List, Optional, Union
from app.exceptions import BadRequestError, NotFoundError
from app.repositories.goal_repository import GoalRepository
from app.repositories.milestone_repository import MilestoneRepository
from app.schemas.milestone import (
    MilestoneCreateRequest,
    MilestoneResponse,
    MilestoneUpdateRequest,
)


class MilestoneService:
    """
    Domain service for goal milestones.
    Enforces goal-milestone relationship integrity, date history preservation,
    and automatic parent goal progress recalculation.
    """

    def __init__(
        self,
        milestone_repo: Optional[MilestoneRepository] = None,
        goal_repo: Optional[GoalRepository] = None,
    ):
        self.milestone_repo = milestone_repo or MilestoneRepository()
        self.goal_repo = goal_repo or GoalRepository()

    def _recalculate_goal_progress(self, uid: str, goal_id: str) -> None:
        """Internal helper to recalculate parent goal's progress percentage."""
        milestones = self.milestone_repo.list_by_goal(uid, goal_id)
        if not milestones:
            self.goal_repo.update_goal(uid, goal_id, {"progress_percentage": 0})
            return

        total_weight = sum(float(m.get("weight", 1.0)) for m in milestones)
        if total_weight <= 0:
            return

        completed_weight = sum(
            float(m.get("weight", 1.0))
            for m in milestones
            if m.get("is_completed") is True
        )
        progress = min(100, max(0, int(round((completed_weight / total_weight) * 100))))
        self.goal_repo.update_goal(uid, goal_id, {"progress_percentage": progress})

    def get_milestone(self, uid: str, goal_id: str, milestone_id: str) -> MilestoneResponse:
        """
        Retrieve a milestone and verify it strictly belongs to the specified goal.
        """
        data = self.milestone_repo.get_by_id(uid, milestone_id)
        if not data:
            raise NotFoundError(f"Milestone '{milestone_id}' was not found.")

        # Ensure milestone belongs to the requested goal
        if str(data.get("goal_id")) != str(goal_id):
            raise BadRequestError(
                f"Milestone '{milestone_id}' does not belong to goal '{goal_id}'."
            )

        return MilestoneResponse.model_validate(data)

    def list_milestones_for_goal(self, uid: str, goal_id: str) -> List[MilestoneResponse]:
        """
        List all milestones for a specific goal.
        Validates parent goal exists under the authorized user.
        """
        parent_goal = self.goal_repo.get_by_id(uid, goal_id)
        if not parent_goal:
            raise NotFoundError(f"Parent goal '{goal_id}' was not found.")

        milestones_data = self.milestone_repo.list_by_goal(uid, goal_id)
        return [MilestoneResponse.model_validate(m) for m in milestones_data]

    def create_milestone(
        self,
        uid: str,
        goal_id_or_req: Union[str, MilestoneCreateRequest],
        req: Optional[MilestoneCreateRequest] = None,
    ) -> MilestoneResponse:
        """
        Create a milestone under a user's goal.
        Supports both create_milestone(uid, goal_id, req) and create_milestone(uid, req).
        SECURITY & INTEGRITY: Strictly validates that the referenced goal exists
        within the user's account and recalculates goal progress.
        """
        if isinstance(goal_id_or_req, MilestoneCreateRequest):
            req = goal_id_or_req
            goal_id = req.goal_id
        else:
            goal_id = goal_id_or_req

        if not goal_id or not req:
            raise NotFoundError("Referenced parent goal was not found within your account.")

        parent_goal = self.goal_repo.get_by_id(uid, goal_id)
        if not parent_goal:
            raise NotFoundError(
                f"Referenced parent goal '{goal_id}' was not found within your account."
            )

        payload = req.model_dump()
        payload["goal_id"] = goal_id
        payload.setdefault("is_completed", False)
        payload.setdefault("date_history", [])

        created_data = self.milestone_repo.create_milestone(uid, payload)

        # Recalculate goal progress
        self._recalculate_goal_progress(uid, goal_id)

        return MilestoneResponse.model_validate(created_data)

    def update_milestone(
        self, uid: str, goal_id: str, milestone_id: str, req: MilestoneUpdateRequest
    ) -> MilestoneResponse:
        """
        Update milestone fields, track date changes, and recalculate goal progress.
        """
        existing = self.milestone_repo.get_by_id(uid, milestone_id)
        if not existing:
            raise NotFoundError(f"Milestone '{milestone_id}' was not found.")

        # Integrity check: Ensure milestone belongs to specified goal
        if str(existing.get("goal_id")) != str(goal_id):
            raise BadRequestError(
                f"Milestone '{milestone_id}' does not belong to goal '{goal_id}'."
            )

        updates = req.model_dump(exclude_unset=True, exclude_none=True)
        if not updates:
            return MilestoneResponse.model_validate(existing)

        # Preserve historical date tracking if target_date changed
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

        updated_data = self.milestone_repo.update_milestone(uid, milestone_id, updates)
        if not updated_data:
            raise NotFoundError(f"Milestone '{milestone_id}' was not found.")

        # If completion state or weight changed, recalculate parent goal progress
        if "is_completed" in updates or "weight" in updates:
            self._recalculate_goal_progress(uid, goal_id)

        return MilestoneResponse.model_validate(updated_data)

    def delete_milestone(self, uid: str, goal_id: str, milestone_id: str) -> bool:
        """
        Delete a milestone and update parent goal progress.
        """
        existing = self.milestone_repo.get_by_id(uid, milestone_id)
        if not existing:
            raise NotFoundError(f"Milestone '{milestone_id}' was not found.")

        if str(existing.get("goal_id")) != str(goal_id):
            raise BadRequestError(
                f"Milestone '{milestone_id}' does not belong to goal '{goal_id}'."
            )

        success = self.milestone_repo.delete_milestone(uid, milestone_id)
        if not success:
            raise NotFoundError(f"Milestone '{milestone_id}' was not found.")

        self._recalculate_goal_progress(uid, goal_id)
        return True
