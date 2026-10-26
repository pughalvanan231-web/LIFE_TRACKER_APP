from flask import Blueprint, g, request

from app.exceptions import BadRequestError
from app.middleware.auth import require_auth
from app.services.progress_service import ProgressService
from app.utils.responses import success_response

reports_bp = Blueprint("reports", __name__, url_prefix="/reports")
progress_service = ProgressService()


@reports_bp.route("/weekly", methods=["GET"])
@require_auth()
def get_weekly_report():
    """
    Generate weekly report across 7 calendar days leading to end_date.
    Distinguishes completed, not-completed, postponed, and unverified work.
    Agrees with saved daily reviews.
    """
    end_date = request.args.get("end_date")
    tz_str = request.headers.get("X-User-Timezone") or request.args.get("timezone", "UTC")

    report = progress_service.generate_weekly_report(
        g.current_user.uid, end_date_str=end_date, tz_str=tz_str
    )
    return success_response(
        data=report.model_dump(mode="json"),
        message="Weekly performance report generated successfully.",
    )


@reports_bp.route("/monthly", methods=["GET"])
@require_auth()
def get_monthly_report():
    """
    Generate monthly report for a calendar month (YYYY-MM) or past 30 days.
    Distinguishes completed, not-completed, postponed, and unverified work.
    """
    month = request.args.get("month")
    tz_str = request.headers.get("X-User-Timezone") or request.args.get("timezone", "UTC")

    report = progress_service.generate_monthly_report(
        g.current_user.uid, month_str=month, tz_str=tz_str
    )
    return success_response(
        data=report.model_dump(mode="json"),
        message="Monthly performance report generated successfully.",
    )


@reports_bp.route("/custom", methods=["GET"])
@require_auth()
def get_custom_report():
    """
    Generate custom date-range performance report across [start_date, end_date].
    Validates date boundary ordering and range size.
    """
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    if not start_date or not end_date:
        raise BadRequestError("Both 'start_date' and 'end_date' query parameters are required.")

    tz_str = request.headers.get("X-User-Timezone") or request.args.get("timezone", "UTC")

    report = progress_service.generate_report(
        g.current_user.uid,
        start_date=start_date,
        end_date=end_date,
        report_type="custom",
        tz_str=tz_str,
    )
    return success_response(
        data=report.model_dump(mode="json"),
        message="Custom date-range performance report generated successfully.",
    )
