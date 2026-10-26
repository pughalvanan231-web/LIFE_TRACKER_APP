from datetime import datetime, timezone
import math
from typing import List, Optional
from app.exceptions import BadRequestError, NotFoundError
from app.repositories.goal_repository import GoalRepository
from app.repositories.milestone_repository import MilestoneRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.pagination import PaginatedListResponse
from app.schemas.task import (
    DailyPlanCreateRequest,
    DailyPlanResponse,
    DailyTaskInstanceResponse,
    TaskCreateRequest,
    TaskRescheduleRequest,
    TaskResponse,
    TaskStatus,
    TaskUpdateRequest,
)

VALID_TASK_TRANSITIONS = {
    TaskStatus.PENDING: {
        TaskStatus.IN_PROGRESS,
        TaskStatus.COMPLETED,
        TaskStatus.NOT_COMPLETED,
        TaskStatus.UNVERIFIED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.IN_PROGRESS: {
        TaskStatus.COMPLETED,
        TaskStatus.NOT_COMPLETED,
        TaskStatus.UNVERIFIED,
        TaskStatus.CANCELLED,
        TaskStatus.PENDING,
    },
    TaskStatus.COMPLETED: {
        TaskStatus.PENDING,
        TaskStatus.UNVERIFIED,
        TaskStatus.NOT_COMPLETED,
    },
    TaskStatus.NOT_COMPLETED: {
        TaskStatus.PENDING,
        TaskStatus.IN_PROGRESS,
        TaskStatus.CANCELLED,
    },
    TaskStatus.UNVERIFIED: {
        TaskStatus.COMPLETED,
        TaskStatus.NOT_COMPLETED,
        TaskStatus.PENDING,
        TaskStatus.CANCELLED,
    },
    TaskStatus.CANCELLED: {
        TaskStatus.PENDING,
    },
}


class TaskService:
    """
    Domain service managing user tasks, lifecycle state transitions,
    safe rescheduling, and daily planning workloads.
    """

    def __init__(
        self,
        task_repo: Optional[TaskRepository] = None,
        goal_repo: Optional[GoalRepository] = None,
        milestone_repo: Optional[MilestoneRepository] = None,
    ):
        self.task_repo = task_repo or TaskRepository()
        self.goal_repo = goal_repo or GoalRepository()
        self.milestone_repo = milestone_repo or MilestoneRepository()

    # ==========================================================================
    # TASK LIFECYCLE & RETRIEVAL
    # ==========================================================================

    def get_task(self, uid: str, task_id: str) -> TaskResponse:
        """Retrieve a task belonging strictly to the authenticated user."""
        data = self.task_repo.get_by_id(uid, task_id)
        if not data:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return TaskResponse.model_validate(data)

    def list_tasks(
        self,
        uid: str,
        date: Optional[str] = None,
        goal_id: Optional[str] = None,
        milestone_id: Optional[str] = None,
        priority: Optional[str] = None,
        status: Optional[str] = None,
        is_completed: Optional[bool] = None,
        page: int = 1,
        limit: int = 20,
    ) -> PaginatedListResponse[TaskResponse]:
        """List tasks for the authenticated user with multi-field filtering and pagination."""
        page = max(1, page)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit

        items_data, total_count = self.task_repo.list_tasks(
            uid,
            date=date,
            goal_id=goal_id,
            milestone_id=milestone_id,
            priority=priority,
            status=status,
            is_completed=is_completed,
            limit=limit,
            offset=offset,
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
        Create a new task.
        Strictly validates that any referenced goal or milestone belongs to the authenticated user.
        Preserves original deadline.
        """
        if req.goal_id:
            goal = self.goal_repo.get_by_id(uid, req.goal_id)
            if not goal:
                raise NotFoundError(f"Referenced goal '{req.goal_id}' was not found within your account.")

        if req.milestone_id:
            milestone = self.milestone_repo.get_by_id(uid, req.milestone_id)
            if not milestone:
                raise NotFoundError(
                    f"Referenced milestone '{req.milestone_id}' was not found within your account."
                )

        payload = req.model_dump()
        payload.setdefault("status", TaskStatus.PENDING.value)
        payload.setdefault("is_completed", False)
        payload.setdefault("reschedule_history", [])

        # Preserve original deadline
        sched = payload.get("scheduled_date") or payload.get("due_date")
        payload["scheduled_date"] = sched
        payload["due_date"] = sched
        if not payload.get("original_due_date"):
            payload["original_due_date"] = sched

        created_data = self.task_repo.create_task(uid, payload)
        return TaskResponse.model_validate(created_data)

    def update_task(self, uid: str, task_id: str, req: TaskUpdateRequest) -> TaskResponse:
        """
        Update an existing task belonging to the user.
        Enforces valid state transition rules if status is modified.
        """
        existing = self.task_repo.get_by_id(uid, task_id)
        if not existing:
            raise NotFoundError(f"Task '{task_id}' was not found.")

        updates = req.model_dump(exclude_unset=True, exclude_none=True)
        if not updates:
            return TaskResponse.model_validate(existing)

        # Validate status transition if requested
        if "status" in updates:
            new_status = TaskStatus(updates["status"])
            current_status = TaskStatus(existing.get("status", TaskStatus.PENDING.value))
            if current_status != new_status:
                allowed = VALID_TASK_TRANSITIONS.get(current_status, set())
                if new_status not in allowed:
                    raise BadRequestError(
                        f"Invalid status transition from '{current_status.value}' to '{new_status.value}'."
                    )
                if new_status == TaskStatus.COMPLETED:
                    updates["is_completed"] = True
                elif new_status in (TaskStatus.PENDING, TaskStatus.NOT_COMPLETED, TaskStatus.CANCELLED):
                    updates["is_completed"] = False

        if "is_completed" in updates and "status" not in updates:
            if updates["is_completed"] is True:
                updates["status"] = TaskStatus.COMPLETED.value
            else:
                updates["status"] = TaskStatus.PENDING.value

        updated_data = self.task_repo.update_task(uid, task_id, updates)
        if not updated_data:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return TaskResponse.model_validate(updated_data)

    def complete_task(self, uid: str, task_id: str) -> TaskResponse:
        """
        Explicitly mark a task as completed.
        Never completed automatically by timer or page view.
        """
        existing = self.task_repo.get_by_id(uid, task_id)
        if not existing:
            raise NotFoundError(f"Task '{task_id}' was not found.")

        current_status = TaskStatus(existing.get("status", TaskStatus.PENDING.value))
        allowed = VALID_TASK_TRANSITIONS.get(current_status, set())
        if TaskStatus.COMPLETED not in allowed and current_status != TaskStatus.COMPLETED:
            raise BadRequestError(
                f"Cannot mark task completed from status '{current_status.value}'."
            )

        now = datetime.now(timezone.utc)
        updates = {
            "status": TaskStatus.COMPLETED.value,
            "is_completed": True,
            "completed_at": now.isoformat(),
        }
        updated = self.task_repo.update_task(uid, task_id, updates)
        return TaskResponse.model_validate(updated)

    def mark_not_completed(self, uid: str, task_id: str) -> TaskResponse:
        """Explicitly mark a task as not completed (e.g., missed daily commitment)."""
        existing = self.task_repo.get_by_id(uid, task_id)
        if not existing:
            raise NotFoundError(f"Task '{task_id}' was not found.")

        current_status = TaskStatus(existing.get("status", TaskStatus.PENDING.value))
        allowed = VALID_TASK_TRANSITIONS.get(current_status, set())
        if TaskStatus.NOT_COMPLETED not in allowed and current_status != TaskStatus.NOT_COMPLETED:
            raise BadRequestError(
                f"Cannot mark task not completed from status '{current_status.value}'."
            )

        updates = {
            "status": TaskStatus.NOT_COMPLETED.value,
            "is_completed": False,
            "completed_at": None,
        }
        updated = self.task_repo.update_task(uid, task_id, updates)
        return TaskResponse.model_validate(updated)

    def mark_unverified(self, uid: str, task_id: str) -> TaskResponse:
        """Mark unconfirmed work as unverified."""
        existing = self.task_repo.get_by_id(uid, task_id)
        if not existing:
            raise NotFoundError(f"Task '{task_id}' was not found.")

        current_status = TaskStatus(existing.get("status", TaskStatus.PENDING.value))
        allowed = VALID_TASK_TRANSITIONS.get(current_status, set())
        if TaskStatus.UNVERIFIED not in allowed and current_status != TaskStatus.UNVERIFIED:
            raise BadRequestError(
                f"Cannot mark task unverified from status '{current_status.value}'."
            )

        updates = {
            "status": TaskStatus.UNVERIFIED.value,
        }
        updated = self.task_repo.update_task(uid, task_id, updates)
        return TaskResponse.model_validate(updated)

    def reschedule_task(self, uid: str, task_id: str, req: TaskRescheduleRequest) -> TaskResponse:
        """
        Reschedule a task to a new target date while preserving:
        1. original_due_date (never altered).
        2. reschedule_history audit trail.
        3. previous day's submitted daily task instance (not silently altered).
        """
        existing = self.task_repo.get_by_id(uid, task_id)
        if not existing:
            raise NotFoundError(f"Task '{task_id}' was not found.")

        prev_date = existing.get("scheduled_date") or existing.get("due_date")
        history = list(existing.get("reschedule_history", []))

        now_str = datetime.now(timezone.utc).isoformat()
        history.append({
            "previous_date": prev_date,
            "new_date": req.new_date,
            "rescheduled_at": now_str,
            "reason": req.reason,
        })

        # Preserve the previous day's snapshot if an instance existed
        if prev_date and prev_date != req.new_date:
            self.task_repo.mark_instance_rescheduled(uid, prev_date, task_id, req.new_date)

        updates = {
            "scheduled_date": req.new_date,
            "due_date": req.new_date,
            "reschedule_history": history,
            "status": TaskStatus.PENDING.value,
            "is_completed": False,
        }
        if req.due_time:
            updates["due_time"] = req.due_time

        updated = self.task_repo.update_task(uid, task_id, updates)
        return TaskResponse.model_validate(updated)

    def delete_or_cancel_task(self, uid: str, task_id: str, cancel_only: bool = False) -> dict:
        """Delete task or cancel it based on cancel_only flag."""
        existing = self.task_repo.get_by_id(uid, task_id)
        if not existing:
            raise NotFoundError(f"Task '{task_id}' was not found.")

        if cancel_only:
            current_status = TaskStatus(existing.get("status", TaskStatus.PENDING.value))
            allowed = VALID_TASK_TRANSITIONS.get(current_status, set())
            if TaskStatus.CANCELLED not in allowed:
                raise BadRequestError(
                    f"Cannot cancel task from status '{current_status.value}'."
                )
            self.task_repo.update_task(uid, task_id, {"status": TaskStatus.CANCELLED.value})
            return {"id": task_id, "status": TaskStatus.CANCELLED.value, "cancelled": True}

        success = self.task_repo.delete_task(uid, task_id)
        if not success:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return {"id": task_id, "deleted": True}

    def toggle_completion_atomic(self, uid: str, task_id: str) -> TaskResponse:
        """Atomically toggle task completion state."""
        result = self.task_repo.toggle_task_completion_transaction(uid, task_id)
        if not result:
            raise NotFoundError(f"Task '{task_id}' was not found.")
        return TaskResponse.model_validate(result)

    def delete_task(self, uid: str, task_id: str) -> bool:
        """Backward-compatible delete method."""
        return self.delete_or_cancel_task(uid, task_id, cancel_only=False)["deleted"]

    # ==========================================================================
    # DAILY PLANNING & WORKLOAD VALIDATION
    # ==========================================================================

    def create_daily_plan(self, uid: str, req: DailyPlanCreateRequest) -> DailyPlanResponse:
        """
        Create or update a daily plan.
        Requirements:
        1. Validates available time vs total estimated workload.
        2. Idempotent submission: avoids duplicate tasks/instances when submitted twice.
        3. Records separate daily task instances maintaining historical day records.
        """
        target_tasks: List[dict] = []

        # 1. Collect and verify existing tasks
        for t_id in req.task_ids:
            task_dict = self.task_repo.get_by_id(uid, t_id)
            if not task_dict:
                raise NotFoundError(
                    f"Referenced task '{t_id}' was not found within your account."
                )
            target_tasks.append(task_dict)

        # 2. Create any new tasks requested inline with plan
        if req.tasks:
            for new_t_req in req.tasks:
                new_t_req.scheduled_date = req.date
                new_task = self.create_task(uid, new_t_req)
                target_tasks.append(new_task.model_dump())

        # 3. Workload capacity validation
        total_estimated = sum(int(t.get("estimated_duration", 30)) for t in target_tasks)
        is_overloaded = total_estimated > req.available_minutes
        overload_minutes = max(0, total_estimated - req.available_minutes)

        if is_overloaded and not req.allow_overload:
            raise BadRequestError(
                f"Planned workload ({total_estimated} mins) exceeds daily available time "
                f"({req.available_minutes} mins) by {overload_minutes} mins. "
                "Reduce tasks or set allow_overload=true to proceed."
            )

        # 4. Record/update task instances for this day snapshot
        instances: List[DailyTaskInstanceResponse] = []
        now = datetime.now(timezone.utc)

        for t in target_tasks:
            # Ensure task is scheduled for this date
            if t.get("scheduled_date") != req.date:
                self.task_repo.update_task(uid, t["id"], {
                    "scheduled_date": req.date,
                    "due_date": req.date,
                })

            instance_payload = {
                "date": req.date,
                "task_id": t["id"],
                "title": t.get("title", ""),
                "priority": t.get("priority", "medium"),
                "status": t.get("status", "pending"),
                "estimated_duration": int(t.get("estimated_duration", 30)),
                "is_completed": t.get("is_completed", False),
                "due_time": t.get("due_time"),
            }
            saved_instance = self.task_repo.create_or_update_task_instance(uid, instance_payload)
            instances.append(DailyTaskInstanceResponse.model_validate(saved_instance))

        # 5. Persist daily plan summary
        task_count = len(target_tasks)
        completed_count = sum(1 for t in target_tasks if t.get("is_completed") is True)
        completion_rate = round((completed_count / task_count) * 100, 1) if task_count > 0 else 0.0

        plan_payload = {
            "id": req.date,
            "uid": uid,
            "date": req.date,
            "available_minutes": req.available_minutes,
            "total_estimated_minutes": total_estimated,
            "task_count": task_count,
            "completed_count": completed_count,
            "completion_rate": completion_rate,
            "is_overloaded": is_overloaded,
            "overload_minutes": overload_minutes,
            "notes": req.notes,
        }
        saved_plan = self.task_repo.create_or_update_daily_plan(uid, plan_payload)
        saved_plan["tasks"] = [inst.model_dump() for inst in instances]
        saved_plan.setdefault("created_at", now)
        saved_plan.setdefault("updated_at", now)

        return DailyPlanResponse.model_validate(saved_plan)

    def get_daily_plan(self, uid: str, date: str) -> DailyPlanResponse:
        """Retrieve daily plan with attached task instances for a specific date."""
        plan_data = self.task_repo.get_daily_plan(uid, date)
        if not plan_data:
            raise NotFoundError(f"No daily plan found for date '{date}'.")

        # Load attached task instances
        instances_data = self.task_repo.get_task_instances_by_date(uid, date)
        plan_data["tasks"] = instances_data
        return DailyPlanResponse.model_validate(plan_data)

    def list_daily_plans(
        self, uid: str, page: int = 1, limit: int = 15
    ) -> PaginatedListResponse[DailyPlanResponse]:
        """List daily plans with pagination."""
        page = max(1, page)
        limit = max(1, min(limit, 50))
        offset = (page - 1) * limit

        plans_data, total_count = self.task_repo.list_daily_plans(uid, limit=limit, offset=offset)
        total_pages = math.ceil(total_count / limit) if total_count > 0 else 1

        items = []
        for p in plans_data:
            instances = self.task_repo.get_task_instances_by_date(uid, p["date"])
            p["tasks"] = instances
            items.append(DailyPlanResponse.model_validate(p))

        return PaginatedListResponse[DailyPlanResponse](
            items=items,
            total_count=total_count,
            page=page,
            limit=limit,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        )
