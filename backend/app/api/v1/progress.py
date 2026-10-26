from flask import Blueprint, g, request

from app.middleware.auth import require_auth
from app.schemas.goal import GoalTimeframe
from app.schemas.progress import DailyReviewCreateRequest
from app.services.progress_service import ProgressService
from app.utils.responses import success_response

progress_bp = Blueprint("progress", __name__)
progress_service = ProgressService()


# ==============================================================================
# DAILY REVIEW ENDPOINTS
# ==============================================================================


@progress_bp.route("/reviews", methods=["POST"])
@require_auth()
def create_review():
    """
    Submit or correct a daily review.
    Preserves completed and not-completed tasks.
    Marks unconfirmed tasks as unverified at closing.
    Saves a dated snapshot of task details and prevents duplicates.
    """
    payload = request.get_json(silent=False) or {}
    req = DailyReviewCreateRequest.model_validate(payload)
    review = progress_service.record_daily_review(g.current_user.uid, req)
    return success_response(
        data=review.model_dump(mode="json"),
        message="Daily review recorded successfully.",
        status_code=201,
    )


@progress_bp.route("/reviews", methods=["GET"])
@require_auth()
def list_reviews():
    """List recent daily reviews for the authenticated user."""
    limit = int(request.args.get("limit", 30))
    reviews = progress_service.list_daily_reviews(g.current_user.uid, limit=limit)
    return success_response(
        data=[r.model_dump(mode="json") for r in reviews],
        message="Daily reviews retrieved successfully.",
    )


@progress_bp.route("/reviews/<date>", methods=["GET"])
@require_auth()
def get_review(date: str):
    """Retrieve daily review and frozen task snapshot for a specific date (YYYY-MM-DD)."""
    review = progress_service.get_daily_review(g.current_user.uid, date)
    return success_response(
        data=review.model_dump(mode="json"),
        message="Daily review retrieved successfully.",
    )


@progress_bp.route("/reviews/<date>/task-history", methods=["GET"])
@require_auth()
def get_task_history(date: str):
    """Retrieve historical task records and snapshots for a specific date."""
    history = progress_service.get_task_history_for_date(g.current_user.uid, date)
    return success_response(
        data=[h.model_dump(mode="json") for h in history],
        message="Task history retrieved successfully.",
    )


# ==============================================================================
# PROGRESS ENDPOINTS (DAILY & GOAL PROGRESS)
# ==============================================================================


@progress_bp.route("/progress/daily", methods=["GET"])
@progress_bp.route("/progress/daily/<date>", methods=["GET"])
@require_auth()
def get_daily_progress(date: str = None):
    """
    Retrieve daily task completion progress for dashboard.
    Formula: (completed tasks due that day / all tasks due that day) * 100.
    Shows proper empty state when no tasks are due.
    """
    tz_str = request.headers.get("X-User-Timezone") or request.args.get("timezone", "UTC")
    progress = progress_service.get_daily_progress(g.current_user.uid, date_str=date, tz_str=tz_str)
    return success_response(
        data=progress.model_dump(mode="json"),
        message="Daily progress retrieved successfully.",
    )


@progress_bp.route("/progress/goals/short-term", methods=["GET"])
@require_auth()
def get_short_term_goals_progress():
    """
    Retrieve progress for all short-term goals.
    Strictly based on weighted milestones or explicit target metrics.
    """
    result = progress_service.get_goal_progress_by_timeframe(
        g.current_user.uid, timeframe=GoalTimeframe.SHORT_TERM
    )
    return success_response(
        data=result.model_dump(mode="json"),
        message="Short-term goals progress retrieved successfully.",
    )


@progress_bp.route("/progress/goals/long-term", methods=["GET"])
@require_auth()
def get_long_term_goals_progress():
    """
    Retrieve progress for all long-term goals.
    Strictly based on weighted milestones or explicit target metrics.
    """
    result = progress_service.get_goal_progress_by_timeframe(
        g.current_user.uid, timeframe=GoalTimeframe.LONG_TERM
    )
    return success_response(
        data=result.model_dump(mode="json"),
        message="Long-term goals progress retrieved successfully.",
    )


@progress_bp.route("/progress/snapshot", methods=["POST"])
@require_auth()
def compute_snapshot():
    """Compute and persist an aggregated metrics progress snapshot."""
    snapshot = progress_service.compute_and_save_snapshot(g.current_user.uid)
    return success_response(
        data=snapshot.model_dump(mode="json"),
        message="Progress snapshot computed and persisted successfully.",
        status_code=201,
    )
