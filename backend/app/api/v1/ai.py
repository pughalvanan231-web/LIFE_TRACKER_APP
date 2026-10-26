import logging

from flask import Blueprint, g, request

from app.middleware.auth import require_auth
from app.middleware.rate_limit import ai_usage_limit
from app.schemas.ai import (
    DailyTaskSuggestionsRequest,
    ExplainGoalProgressRequest,
    RecoveryPlanRequest,
    RevisedScheduleRequest,
    TaskBreakdownRequest,
)
from app.services.ai_service import AIService
from app.utils.responses import success_response

logger = logging.getLogger("app.api.v1.ai")

ai_bp = Blueprint("ai", __name__, url_prefix="/ai")
ai_service = AIService()


@ai_bp.route("/daily-suggestions", methods=["POST"])
@require_auth()
@ai_usage_limit()
def generate_daily_suggestions():
    """
    Generate bounded daily task suggestions based on authenticated user's
    active goals, milestones, task history, and available daily minutes.
    """
    uid = g.user_id
    payload = request.get_json(silent=True) or {}
    req = DailyTaskSuggestionsRequest.model_validate(payload)
    result = ai_service.generate_daily_suggestions(uid, req)
    return success_response(
        data=result.model_dump(),
        message="Daily task suggestions generated successfully.",
        status_code=200,
    )


@ai_bp.route("/revised-schedules", methods=["POST"])
@require_auth()
@ai_usage_limit()
def generate_revised_schedule():
    """
    Generate schedule revisions when available time or priorities shift.
    Proposes scheduled tasks and deferred backlog items for user confirmation.
    """
    uid = g.user_id
    payload = request.get_json(silent=True) or {}
    req = RevisedScheduleRequest.model_validate(payload)
    result = ai_service.generate_revised_schedule(uid, req)
    return success_response(
        data=result.model_dump(),
        message="Revised schedule proposals generated successfully.",
        status_code=200,
    )


@ai_bp.route("/recovery-plans", methods=["POST"])
@require_auth()
@ai_usage_limit()
def create_recovery_plan():
    """
    Recovery Mode: Identifies accumulated overdue work, recommends realistic
    priorities, decomposes complex bottlenecks, and proposes a sustainable catch-up schedule.
    """
    uid = g.user_id
    payload = request.get_json(silent=True) or {}
    req = RecoveryPlanRequest.model_validate(payload)
    result = ai_service.create_recovery_plan(uid, req)
    return success_response(
        data=result.model_dump(),
        message="Recovery plan generated successfully.",
        status_code=200,
    )


@ai_bp.route("/explain-progress", methods=["POST"])
@require_auth()
@ai_usage_limit()
def explain_goal_progress():
    """
    Explain goal progress trends, strengths, bottlenecks, and recommended next steps
    for a specific goal or overall user progress.
    """
    uid = g.user_id
    payload = request.get_json(silent=True) or {}
    req = ExplainGoalProgressRequest.model_validate(payload)
    result = ai_service.explain_goal_progress(uid, req)
    return success_response(
        data=result.model_dump(),
        message="Goal progress explanation generated successfully.",
        status_code=200,
    )


@ai_bp.route("/task-breakdown", methods=["POST"])
@require_auth()
@ai_usage_limit()
def suggest_task_breakdown():
    """
    Decompose a large or complex task into small, actionable, sequential subtasks.
    """
    uid = g.user_id
    payload = request.get_json(silent=True) or {}
    req = TaskBreakdownRequest.model_validate(payload)
    result = ai_service.suggest_task_breakdown(uid, req)
    return success_response(
        data=result.model_dump(),
        message="Task breakdown generated successfully.",
        status_code=200,
    )
