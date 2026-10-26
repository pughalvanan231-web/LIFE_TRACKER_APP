import logging

from flask import Blueprint, request

from app.middleware.job_auth import require_job_auth
from app.schemas.job import JobExecutionRequest
from app.services.job_service import JobService
from app.utils.responses import success_response

logger = logging.getLogger("app.api.v1.jobs")

jobs_bp = Blueprint("jobs", __name__, url_prefix="/jobs")
job_service = JobService()


@jobs_bp.route("/run-all", methods=["POST"])
@require_job_auth()
def run_all_jobs():
    """
    Execute complete scheduled background maintenance pipeline:
    1. Midnight daily review closing across timezones.
    2. Transition unconfirmed tasks to unverified.
    3. Overdue goals and milestones detection and alerts.
    4. Scheduled weekly performance summaries.
    5. Bounded user pagination and safe dry-run simulation mode.

    SECURITY: Restricted to Google Cloud Scheduler OIDC or authenticated Job Secret.
    """
    payload = request.get_json(silent=True) or {}
    req = JobExecutionRequest.model_validate(payload)

    result = job_service.run_scheduled_pipeline(
        batch_size=req.batch_size,
        simulated_now=req.simulated_now,
        dry_run=req.dry_run,
        single_user_id=req.single_user_id,
    )
    return success_response(
        data=result,
        message="Scheduled maintenance pipeline executed successfully.",
        status_code=200,
    )


@jobs_bp.route("/midnight-closing", methods=["POST"])
@require_job_auth()
def run_midnight_closing_job():
    """
    Targeted job endpoint for midnight daily review closing.
    Closes past day reviews, freezes snapshots, and marks unconfirmed tasks unverified.
    """
    payload = request.get_json(silent=True) or {}
    req = JobExecutionRequest.model_validate(payload)

    result = job_service.run_scheduled_pipeline(
        batch_size=req.batch_size,
        simulated_now=req.simulated_now,
        dry_run=req.dry_run,
        single_user_id=req.single_user_id,
    )
    return success_response(
        data=result,
        message="Midnight closing job executed successfully.",
        status_code=200,
    )


@jobs_bp.route("/overdue-detection", methods=["POST"])
@require_job_auth()
def run_overdue_detection_job():
    """
    Targeted job endpoint for scanning overdue goals and milestones.
    Dispatches alerts without mutating or deleting entities.
    """
    payload = request.get_json(silent=True) or {}
    req = JobExecutionRequest.model_validate(payload)

    result = job_service.run_scheduled_pipeline(
        batch_size=req.batch_size,
        simulated_now=req.simulated_now,
        dry_run=req.dry_run,
        single_user_id=req.single_user_id,
    )
    return success_response(
        data=result,
        message="Overdue detection job executed successfully.",
        status_code=200,
    )
