from flask import Blueprint, g, request

from app.middleware.auth import require_auth
from app.schemas.task import TaskCreateRequest, TaskUpdateRequest
from app.services.task_service import TaskService
from app.utils.responses import success_response

tasks_bp = Blueprint("tasks", __name__, url_prefix="/tasks")
task_service = TaskService()


@tasks_bp.route("", methods=["POST"])
@require_auth()
def create_task():
    """Create a new task for the authenticated user."""
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
    """List tasks for the authenticated user with pagination and filters."""
    goal_id = request.args.get("goal_id")
    is_completed_str = request.args.get("is_completed")
    is_completed = None
    if is_completed_str is not None:
        is_completed = is_completed_str.lower() in ("true", "1", "yes")

    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))

    paginated = task_service.list_tasks(
        g.current_user.uid,
        goal_id=goal_id,
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
    """Retrieve a single task."""
    task = task_service.get_task(g.current_user.uid, task_id)
    return success_response(
        data=task.model_dump(mode="json"),
        message="Task retrieved successfully.",
    )


@tasks_bp.route("/<task_id>", methods=["PATCH"])
@require_auth()
def update_task(task_id: str):
    """Update an existing task."""
    payload = request.get_json(silent=False) or {}
    req = TaskUpdateRequest.model_validate(payload)
    updated = task_service.update_task(g.current_user.uid, task_id, req)
    return success_response(
        data=updated.model_dump(mode="json"),
        message="Task updated successfully.",
    )


@tasks_bp.route("/<task_id>/toggle", methods=["POST"])
@require_auth()
def toggle_task(task_id: str):
    """Atomically toggle task completion state in a transaction."""
    toggled = task_service.toggle_completion_atomic(g.current_user.uid, task_id)
    return success_response(
        data=toggled.model_dump(mode="json"),
        message="Task completion state toggled successfully.",
    )


@tasks_bp.route("/<task_id>", methods=["DELETE"])
@require_auth()
def delete_task(task_id: str):
    """Delete a task."""
    task_service.delete_task(g.current_user.uid, task_id)
    return success_response(
        data={"id": task_id, "deleted": True},
        message="Task deleted successfully.",
    )
