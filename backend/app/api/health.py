from flask import Blueprint, current_app

from app.extensions import firebase
from app.utils.responses import error_response, success_response

health_bp = Blueprint("health", __name__)


@health_bp.route("/health/live", methods=["GET"])
def liveness():
    """
    Kubernetes / Container liveness probe.
    Confirms the application process is running and able to handle HTTP traffic.
    """
    return success_response(
        data={"status": "alive"},
        message="Service is alive",
        status_code=200,
    )


@health_bp.route("/health/ready", methods=["GET"])
def readiness():
    """
    Kubernetes / Container readiness probe.
    Verifies that system dependencies and basic runtime health are ready.
    Configurable via HEALTH_REQUIRE_FIREBASE setting.
    Crucially avoids revealing credentials, internal URLs, or secrets.
    """
    firebase_health = firebase.check_health()
    firebase_status = firebase_health.get("status", "unknown")

    checks = {
        "app": "ok",
        "firebase": firebase_status,
    }

    require_firebase = current_app.config.get("HEALTH_REQUIRE_FIREBASE", False)

    # If configuration strictly requires Firebase and it's not configured/available
    if require_firebase and firebase_status != "configured":
        return error_response(
            message="Service is degraded. Required dependency (Firebase) is not ready.",
            code="SERVICE_DEGRADED",
            details={"status": "degraded", "checks": checks},
            status_code=503,
        )

    # Otherwise app core is operational and ready to serve traffic
    return success_response(
        data={
            "status": "ready",
            "checks": checks,
        },
        message="Service is ready",
        status_code=200,
    )
