from flask import Blueprint, g, request

from app.middleware.auth import require_auth
from app.schemas.progress import DailyReviewCreateRequest
from app.services.progress_service import ProgressService
from app.utils.responses import success_response

progress_bp = Blueprint("progress", __name__)
progress_service = ProgressService()


@progress_bp.route("/reviews", methods=["POST"])
@require_auth()
def create_review():
    """Create a daily reflective review."""
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
