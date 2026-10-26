from datetime import datetime, timezone
from typing import Any, Dict, Optional
from flask import g, jsonify, Response


def _build_meta(custom_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Build metadata envelope including tracing request ID and UTC timestamp."""
    request_id = getattr(g, "request_id", None)
    meta: Dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if request_id:
        meta["request_id"] = request_id
    if custom_meta:
        meta.update(custom_meta)
    return meta


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200,
    meta: Optional[Dict[str, Any]] = None,
) -> tuple[Response, int]:
    """Format and return a standardized success JSON response."""
    payload: Dict[str, Any] = {
        "success": True,
        "message": message,
        "data": data,
        "meta": _build_meta(meta),
    }
    return jsonify(payload), status_code


def error_response(
    message: str = "An error occurred",
    code: str = "INTERNAL_SERVER_ERROR",
    details: Any = None,
    status_code: int = 500,
    meta: Optional[Dict[str, Any]] = None,
) -> tuple[Response, int]:
    """Format and return a standardized error JSON response."""
    payload: Dict[str, Any] = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details,
        },
        "meta": _build_meta(meta),
    }
    return jsonify(payload), status_code
