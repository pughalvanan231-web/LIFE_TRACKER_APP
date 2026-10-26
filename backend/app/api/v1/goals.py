from flask import Blueprint, g, request

from app.middleware.auth import require_auth
from app.schemas.goal import GoalCreateRequest, GoalUpdateRequest
from app.schemas.milestone import MilestoneCreateRequest, MilestoneUpdateRequest
from app.services.goal_service import GoalService
from app.services.milestone_service import MilestoneService
from app.utils.responses import success_response

goals_bp = Blueprint("goals", __name__, url_prefix="/goals")
goal_service = GoalService()
milestone_service = MilestoneService()


# ==============================================================================
# GOALS ENDPOINTS
# ==============================================================================


@goals_bp.route("", methods=["POST"])
@require_auth()
def create_goal():
    """
    Create a new user goal.
    Supports timeframes, categories, priorities, measurable metrics, and custom dates.
    """
    payload = request.get_json(silent=False) or {}
    req = GoalCreateRequest.model_validate(payload)
    goal = goal_service.create_goal(g.current_user.uid, req)
    return success_response(
        data=goal.model_dump(mode="json"),
        message="Goal created successfully.",
        status_code=201,
    )


@goals_bp.route("", methods=["GET"])
@require_auth()
def list_goals():
    """
    List user goals with filtering, sorting, and pagination.

    Query Params:
        status: active, completed, paused, archived
        category: career, health, finance, etc.
        timeframe: short_term, medium_term, long_term
        priority: low, medium, high
        sort_by: created_at, target_date, priority, title, progress_percentage
        sort_order: asc, desc (default desc)
        page: int (default 1)
        limit: int (default 20, max 100)
    """
    status = request.args.get("status")
    category = request.args.get("category")
    timeframe = request.args.get("timeframe")
    priority = request.args.get("priority")
    sort_by = request.args.get("sort_by", "created_at")
    sort_order = request.args.get("sort_order", "desc")
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))

    paginated = goal_service.list_goals(
        g.current_user.uid,
        status=status,
        category=category,
        timeframe=timeframe,
        priority=priority,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        limit=limit,
    )
    return success_response(
        data=paginated.model_dump(mode="json"),
        message="Goals retrieved successfully.",
    )


@goals_bp.route("/<goal_id>", methods=["GET"])
@require_auth()
def get_goal(goal_id: str):
    """Retrieve a specific goal by ID for the authenticated user."""
    goal = goal_service.get_goal(g.current_user.uid, goal_id)
    return success_response(
        data=goal.model_dump(mode="json"),
        message="Goal retrieved successfully.",
    )


@goals_bp.route("/<goal_id>", methods=["PATCH"])
@require_auth()
def update_goal(goal_id: str):
    """
    Update goal properties, deadlines, and status.
    Preserves historical deadline modifications and validates transitions.
    """
    payload = request.get_json(silent=False) or {}
    req = GoalUpdateRequest.model_validate(payload)
    updated = goal_service.update_goal(g.current_user.uid, goal_id, req)
    return success_response(
        data=updated.model_dump(mode="json"),
        message="Goal updated successfully.",
    )


@goals_bp.route("/<goal_id>", methods=["DELETE"])
@require_auth()
def delete_goal(goal_id: str):
    """
    Delete or archive a goal.
    Default behavior uses safe archival. Provide ?permanent=true for cascading permanent removal.
    """
    permanent = request.args.get("permanent", "false").lower() in ("true", "1", "yes")
    result = goal_service.delete_goal(g.current_user.uid, goal_id, permanent=permanent)
    message = "Goal permanently deleted." if permanent else "Goal safely archived."
    return success_response(
        data=result,
        message=message,
    )


# ==============================================================================
# MILESTONES ENDPOINTS
# ==============================================================================


@goals_bp.route("/<goal_id>/milestones", methods=["POST"])
@require_auth()
def create_milestone(goal_id: str):
    """Create a milestone attached to a specific goal with relative weight."""
    payload = request.get_json(silent=False) or {}
    req = MilestoneCreateRequest.model_validate(payload)
    milestone = milestone_service.create_milestone(g.current_user.uid, goal_id, req)
    return success_response(
        data=milestone.model_dump(mode="json"),
        message="Milestone created successfully.",
        status_code=201,
    )


@goals_bp.route("/<goal_id>/milestones", methods=["GET"])
@require_auth()
def list_milestones(goal_id: str):
    """List all milestones for a specific goal."""
    milestones = milestone_service.list_milestones_for_goal(g.current_user.uid, goal_id)
    return success_response(
        data=[m.model_dump(mode="json") for m in milestones],
        message="Milestones retrieved successfully.",
    )


@goals_bp.route("/<goal_id>/milestones/<milestone_id>", methods=["PATCH"])
@require_auth()
def update_milestone(goal_id: str, milestone_id: str):
    """
    Update a milestone.
    Validates that milestone belongs to the requested goal and updates parent goal progress.
    """
    payload = request.get_json(silent=False) or {}
    req = MilestoneUpdateRequest.model_validate(payload)
    updated = milestone_service.update_milestone(g.current_user.uid, goal_id, milestone_id, req)
    return success_response(
        data=updated.model_dump(mode="json"),
        message="Milestone updated successfully.",
    )


@goals_bp.route("/<goal_id>/milestones/<milestone_id>", methods=["DELETE"])
@require_auth()
def delete_milestone(goal_id: str, milestone_id: str):
    """Delete a milestone and update parent goal progress."""
    milestone_service.delete_milestone(g.current_user.uid, goal_id, milestone_id)
    return success_response(
        data={"id": milestone_id, "goal_id": goal_id, "deleted": True},
        message="Milestone deleted successfully.",
    )
