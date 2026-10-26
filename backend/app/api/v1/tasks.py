from flask import Blueprint, g, request

from app.middleware.auth import require_auth
from app.schemas.task import (
    DailyPlanCreateRequest,
    TaskCreateRequest,
    TaskRescheduleRequest,
    TaskUpdateRequest,
)
from app.services.task_service import TaskService
from app.utils.responses import success_response

tasks_bp = Blueprint("tasks", __name__, url_prefix="/tasks")
task_service = TaskService()


# ==============================================================================
# DAILY PLANNING ENDPOINTS (Declared first to avoid /<task_id> collision)
# ==============================================================================


@tasks_bp.route("/daily-plans", methods=["POST"])
@require_auth()
def create_daily_plan():
    """
    Create or update a daily plan.
    Validates workload against available minutes and prevents duplicate plan creation.
    """
    payload = request.get_json(silent=False) or {}
    req = DailyPlanCreateRequest.model_validate(payload)
    plan = task_service.create_daily_plan(g.current_user.uid, req)
    return success_response(
        data=plan.model_dump(mode="json"),
        message="Daily plan recorded successfully.",
        status_code=201,
    )


@tasks_bp.route("/daily-plans", methods=["GET"])
@require_auth()
def list_daily_plans():
    """List historical daily plans with pagination."""
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 15))

    paginated = task_service.list_daily_plans(g.current_user.uid, page=page, limit=limit)
    return success_response(
        data=paginated.model_dump(mode="json"),
        message="Daily plans retrieved successfully.",
    )


@tasks_bp.route("/daily-plans/<date>", methods=["GET"])
@require_auth()
def get_daily_plan(date: str):
    """Retrieve daily plan and scheduled task instances for a specific date (YYYY-MM-DD)."""
    plan = task_service.get_daily_plan(g.current_user.uid, date)
    return success_response(
        data=plan.model_dump(mode="json"),
        message="Daily plan retrieved successfully.",
    )


# ==============================================================================
# TASK CRUD & LISTING ENDPOINTS
# ==============================================================================


@tasks_bp.route("", methods=["POST"])
@require_auth()
def create_task():
    """Create a new task with duration, deadlines, and optional goal/milestone references."""
    payload = request.get_json(silent=False) or {}
    req = TaskCreateRequest.model_validate(payload)
    task = task_service.create_task(g.current_user.uid, req)
    return success_response(
        data=task.model_dump(mode="json"),
        message="Task created successfully.",
        status_code=201,
    )


@tasks_bp.route("", methods=["GET"])
@require_auth()
def list_tasks():
    """
    List tasks for the authenticated user with multi-field filtering and pagination.
    Supported filters: date, goal_id, milestone_id, priority, status, is_completed.
    """
    date = request.args.get("date")
    goal_id = request.args.get("goal_id")
    milestone_id = request.args.get("milestone_id")
    priority = request.args.get("priority")
    status = request.args.get("status")

    is_completed_str = request.args.get("is_completed")
    is_completed = None
    if is_completed_str is not None:
        is_completed = is_completed_str.lower() in ("true", "1", "yes")

    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))

    paginated = task_service.list_tasks(
        g.current_user.uid,
        date=date,
        goal_id=goal_id,
        milestone_id=milestone_id,
        priority=priority,
        status=status,
        is_completed=is_completed,
        page=page,
        limit=limit,
    )
    return success_response(
        data=paginated.model_dump(mode="json"),
        message="Tasks retrieved successfully.",
    )


@tasks_bp.route("/<task_id>", methods=["GET"])
@require_auth()
def get_task(task_id: str):
    """Retrieve a single task strictly belonging to the authenticated user."""
    task = task_service.get_task(g.current_user.uid, task_id)
    return success_response(
        data=task.model_dump(mode="json"),
        message="Task retrieved successfully.",
    )


@tasks_bp.route("/<task_id>", methods=["PATCH"])
@require_auth()
def update_task(task_id: str):
    """Update task fields while validating status transitions."""
    payload = request.get_json(silent=False) or {}
    req = TaskUpdateRequest.model_validate(payload)
    updated = task_service.update_task(g.current_user.uid, task_id, req)
    return success_response(
        data=updated.model_dump(mode="json"),
        message="Task updated successfully.",
    )


@tasks_bp.route("/<task_id>", methods=["DELETE"])
@require_auth()
def delete_task(task_id: str):
    """
    Delete or cancel a task.
    Provide ?cancel=true to transition task to 'cancelled' status without deleting it.
    """
    cancel_only = request.args.get("cancel", "false").lower() in ("true", "1", "yes")
    result = task_service.delete_or_cancel_task(g.current_user.uid, task_id, cancel_only=cancel_only)
    message = "Task cancelled successfully." if cancel_only else "Task deleted successfully."
    return success_response(
        data=result,
        message=message,
    )


# ==============================================================================
# EXPLICIT LIFECYCLE ACTION ENDPOINTS
# ==============================================================================


@tasks_bp.route("/<task_id>/complete", methods=["POST"])
@require_auth()
def complete_task(task_id: str):
    """Explicitly mark a task as completed."""
    task = task_service.complete_task(g.current_user.uid, task_id)
    return success_response(
        data=task.model_dump(mode="json"),
        message="Task completed successfully.",
    )


@tasks_bp.route("/<task_id>/mark-not-completed", methods=["POST"])
@require_auth()
def mark_not_completed(task_id: str):
    """Explicitly mark a task as not completed."""
    task = task_service.mark_not_completed(g.current_user.uid, task_id)
    return success_response(
        data=task.model_dump(mode="json"),
        message="Task marked as not completed.",
    )


@tasks_bp.route("/<task_id>/mark-unverified", methods=["POST"])
@require_auth()
def mark_unverified(task_id: str):
    """Mark unconfirmed work as unverified."""
    task = task_service.mark_unverified(g.current_user.uid, task_id)
    return success_response(
        data=task.model_dump(mode="json"),
        message="Task marked as unverified.",
    )


@tasks_bp.route("/<task_id>/reschedule", methods=["POST"])
@require_auth()
def reschedule_task(task_id: str):
    """
    Reschedule a task to a new target date.
    Preserves original deadline, audit history, and daily task instance snapshots.
    """
    payload = request.get_json(silent=False) or {}
    req = TaskRescheduleRequest.model_validate(payload)
    task = task_service.reschedule_task(g.current_user.uid, task_id, req)
    return success_response(
        data=task.model_dump(mode="json"),
        message="Task rescheduled successfully.",
    )


@tasks_bp.route("/<task_id>/toggle", methods=["POST"])
@require_auth()
def toggle_task(task_id: str):
    """Atomically toggle task completion state in a Firestore transaction."""
    toggled = task_service.toggle_completion_atomic(g.current_user.uid, task_id)
    return success_response(
        data=toggled.model_dump(mode="json"),
        message="Task completion state toggled successfully.",
    )
