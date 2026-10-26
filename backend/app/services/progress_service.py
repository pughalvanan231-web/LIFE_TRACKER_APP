from typing import List, Optional
from app.repositories.goal_repository import GoalRepository
from app.repositories.progress_repository import ProgressRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.progress import (
    DailyReviewCreateRequest,
    DailyReviewResponse,
    ProgressSnapshotResponse,
)


class ProgressService:
    """Domain service managing user reflection reviews and aggregated progress metrics."""

    def __init__(
        self,
        progress_repo: Optional[ProgressRepository] = None,
        goal_repo: Optional[GoalRepository] = None,
        task_repo: Optional[TaskRepository] = None,
    ):
        self.progress_repo = progress_repo or ProgressRepository()
        self.goal_repo = goal_repo or GoalRepository()
        self.task_repo = task_repo or TaskRepository()

    def record_daily_review(self, uid: str, req: DailyReviewCreateRequest) -> DailyReviewResponse:
        """Create a daily review entry for the user."""
        payload = req.model_dump(exclude_unset=True)
        created_data = self.progress_repo.create_daily_review(uid, payload)
        return DailyReviewResponse.model_validate(created_data)

    def list_daily_reviews(self, uid: str, limit: int = 30) -> List[DailyReviewResponse]:
        """List recent daily reviews for the user."""
        reviews = self.progress_repo.list_daily_reviews(uid, limit=limit)
        return [DailyReviewResponse.model_validate(r) for r in reviews]

    def compute_and_save_snapshot(self, uid: str) -> ProgressSnapshotResponse:
        """
        Compute an aggregated progress metrics snapshot across user's goals and tasks,
        persisting it for historical trend tracking.
        """
        goals, total_goals = self.goal_repo.list_goals(uid, limit=1000)
        active_goals = sum(1 for g in goals if g.get("status") == "active")
        completed_goals = sum(1 for g in goals if g.get("status") == "completed")

        tasks, total_tasks = self.task_repo.list_tasks(uid, limit=1000)
        completed_tasks = sum(1 for t in tasks if t.get("is_completed") is True)

        completion_rate = (
            round((completed_tasks / total_tasks) * 100.0, 1) if total_tasks > 0 else 0.0
        )

        snapshot_payload = {
            "total_goals": total_goals,
            "active_goals": active_goals,
            "completed_goals": completed_goals,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "overall_completion_rate": completion_rate,
            "metrics": {
                "active_goals_ratio": round(active_goals / total_goals, 2) if total_goals > 0 else 0.0,
            },
        }

        created = self.progress_repo.create_progress_snapshot(uid, snapshot_payload)
        return ProgressSnapshotResponse.model_validate(created)
