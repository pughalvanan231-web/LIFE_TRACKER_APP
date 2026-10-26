"""
CORS (Cross-Origin Resource Sharing) Middleware.

SECURITY NOTICE:
CORS is a browser-enforced security mechanism designed to restrict which web frontends
can make cross-origin HTTP requests to this API. CORS DOES NOT provide authentication,
authorization, or server-to-server security. Attackers using curl, scripts, or non-browser
clients can bypass CORS entirely. All sensitive operations MUST verify authentication tokens
(e.g., Firebase Auth JWTs) independently of CORS.
"""

from typing import Set
from flask import Flask, Response, current_app, request
from app.utils.responses import error_response


def _get_allowed_origins() -> Set[str]:
    """Retrieve the set of allowed origins from configuration."""
    origins_raw = current_app.config.get("CORS_ALLOWED_ORIGINS_RAW", "")
    if not origins_raw:
        return set()
    return {
        origin.strip()
        for origin in origins_raw.split(",")
        if origin.strip()
    }


def register_cors_middleware(app: Flask) -> None:
    """Register explicit environment-based CORS origin filtering and preflight handling."""

    @app.before_request
    def handle_cors_preflight():
        """Handle CORS OPTIONS preflight requests against the explicit origin allowlist."""
        if request.method != "OPTIONS":
            return None

        origin = request.headers.get("Origin")
        if not origin:
            # Not a CORS preflight request
            return None

        allowed_origins = _get_allowed_origins()
        supports_credentials = current_app.config.get("CORS_SUPPORTS_CREDENTIALS", True)

        if origin in allowed_origins:
            response = Response(status=204)
            # Never return wildcard when credentials or sensitive data are involved
            response.headers["Access-Control-Allow-Origin"] = origin
            if supports_credentials:
                response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )
            response.headers["Access-Control-Allow-Headers"] = (
                "Authorization, Content-Type, X-Request-ID, X-Correlation-ID, Accept, Origin"
            )
            response.headers["Access-Control-Max-Age"] = "86400"
            response.headers["Vary"] = "Origin"
            return response

        # Origin not in allowlist
        return error_response(
            message=f"Origin '{origin}' is not permitted by CORS policy.",
            code="CORS_FORBIDDEN",
            status_code=403,
        )

    @app.after_request
    def attach_cors_headers(response: Response) -> Response:
        """Attach CORS response headers if origin is present and explicitly allowed."""
        origin = request.headers.get("Origin")
        if not origin:
            return response

        allowed_origins = _get_allowed_origins()
        supports_credentials = current_app.config.get("CORS_SUPPORTS_CREDENTIALS", True)

        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            if supports_credentials:
                response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers.add("Vary", "Origin")

        return response
