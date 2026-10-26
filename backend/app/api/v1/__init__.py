from flask import Blueprint, g, request

from app.api.v1.ai import ai_bp
from app.api.v1.goals import goals_bp
from app.api.v1.jobs import jobs_bp
from app.api.v1.progress import progress_bp
from app.api.v1.reports import reports_bp
from app.api.v1.tasks import tasks_bp
from app.middleware.auth import require_auth, require_ownership
from app.middleware.rate_limit import ai_usage_limit
from app.schemas.auth import SafeUserProfile
from app.utils.responses import success_response

api_v1_bp = Blueprint("api_v1", __name__, url_prefix="/api/v1")

# Register resource sub-blueprints under /api/v1
api_v1_bp.register_blueprint(goals_bp)
api_v1_bp.register_blueprint(tasks_bp)
api_v1_bp.register_blueprint(progress_bp)
api_v1_bp.register_blueprint(reports_bp)
api_v1_bp.register_blueprint(ai_bp)
api_v1_bp.register_blueprint(jobs_bp)


@api_v1_bp.route("/", methods=["GET"])
@api_v1_bp.route("/info", methods=["GET"])
def api_info():
    """Information endpoint for API v1."""
    return success_response(
        data={
            "api": "Life Goals AI API",
            "version": "v1",
            "status": "active",
            "endpoints": [
                "/api/v1/info",
                "/api/v1/me",
                "/api/v1/goals",
                "/api/v1/tasks",
                "/api/v1/reviews",
                "/api/v1/progress/snapshot",
                "/api/v1/ai/quota-check",
                "/health/live",
                "/health/ready",
            ],
        },
        message="Life Goals AI API v1 is operational",
    )


@api_v1_bp.route("/me", methods=["GET"])
@require_auth()
def get_my_profile():
    """
    Retrieve authenticated user profile information.
    
    SECURITY: The UID is derived exclusively from the verified Firebase token claims.
    Any UID parameters supplied in query string or body are ignored.
    """
    user = g.current_user
    safe_profile = SafeUserProfile(
        uid=user.uid,
        email=user.email,
        email_verified=user.email_verified,
        display_name=user.name,
        photo_url=user.picture,
    )
    return success_response(
        data=safe_profile.model_dump(),
        message="User profile retrieved successfully.",
    )


@api_v1_bp.route("/users/<user_id>/data", methods=["GET"])
@require_auth()
@require_ownership(user_id_param="user_id")
def get_user_data(user_id: str):
    """
    Example protected resource route demonstrating authorization separation.
    A valid token from User A cannot access User B's resources.
    """
    return success_response(
        data={"user_id": user_id, "status": "authorized"},
        message="User resource accessed successfully.",
    )


@api_v1_bp.route("/ai/quota-check", methods=["POST"])
@ai_usage_limit(max_requests=10, window_seconds=60)
def check_ai_quota():
    """Sample AI route protected by AI usage limit quotas."""
    payload = request.get_json(silent=True) or {}
    return success_response(
        data={
            "status": "permitted",
            "operation": "ai_quota_check",
            "received": payload,
        },
        message="AI operation permitted within current quota.",
    )
