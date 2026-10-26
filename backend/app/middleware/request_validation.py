from flask import Flask, current_app, request
from werkzeug.exceptions import BadRequest

from app.utils.responses import error_response


def register_request_validation_middleware(app: Flask) -> None:
    """Enforce request body size limits, content-type checks, and strict JSON validation."""

    @app.before_request
    def validate_request_integrity():
        max_length = current_app.config.get("MAX_CONTENT_LENGTH", 1024 * 1024)

        # 1. Check Content-Length header against max limits before reading stream
        content_length = request.content_length
        if content_length is not None and content_length > max_length:
            return error_response(
                message=f"Request payload size ({content_length} bytes) exceeds maximum limit ({max_length} bytes).",
                code="REQUEST_TOO_LARGE",
                status_code=413,
            )

        # 2. Strict Content-Type and payload syntax checks for mutating methods
        if request.method in ("POST", "PUT", "PATCH"):
            # If payload exists, check Content-Type
            if content_length is not None and content_length > 0:
                content_type = request.content_type or ""
                if not content_type.startswith("application/json"):
                    return error_response(
                        message=f"Unsupported media type '{content_type}'. Content-Type must be 'application/json'.",
                        code="UNSUPPORTED_MEDIA_TYPE",
                        status_code=415,
                    )

                # Validate JSON syntax
                try:
                    # force=False ensures we only parse if valid json header
                    data = request.get_json(silent=False)
                    if data is None and content_length > 0:
                        return error_response(
                            message="Malformed or invalid JSON payload.",
                            code="MALFORMED_JSON",
                            status_code=400,
                        )
                except (BadRequest, Exception):
                    return error_response(
                        message="Malformed JSON syntax. Unable to parse request body.",
                        code="MALFORMED_JSON",
                        status_code=400,
                    )

        return None
