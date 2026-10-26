import logging
from typing import Any, Dict, List

from flask import Flask
from pydantic import ValidationError as PydanticValidationError
from werkzeug.exceptions import (
    BadRequest,
    Forbidden,
    HTTPException,
    NotFound,
    RequestEntityTooLarge,
    TooManyRequests,
    Unauthorized,
    UnsupportedMediaType,
)

from app.exceptions import AppException, RateLimitExceededError
from app.utils.responses import error_response

logger = logging.getLogger("app.error_handler")


def format_pydantic_errors(error: PydanticValidationError) -> List[Dict[str, Any]]:
    """Format Pydantic validation errors into consistent API details."""
    formatted = []
    for err in error.errors():
        field_loc = ".".join(str(loc) for loc in err.get("loc", []))
        formatted.append({
            "field": field_loc if field_loc else "body",
            "message": err.get("msg", "Validation error"),
            "type": err.get("type", "value_error"),
        })
    return formatted


def register_error_handlers(app: Flask) -> None:
    """Register application-wide centralized error handlers."""

    @app.errorhandler(AppException)
    def handle_app_exception(error: AppException):
        logger.warning(
            "Application error [%s]: %s (Details: %s)",
            error.code,
            error.message,
            error.details,
        )
        resp, code = error_response(
            message=error.message,
            code=error.code,
            details=error.details,
            status_code=error.status_code,
        )
        if isinstance(error, RateLimitExceededError) and hasattr(error, "retry_after"):
            resp.headers["Retry-After"] = str(error.retry_after)
        return resp, code

    @app.errorhandler(PydanticValidationError)
    def handle_pydantic_validation_error(error: PydanticValidationError):
        details = format_pydantic_errors(error)
        logger.info("Validation failure: %s", details)
        return error_response(
            message="Request validation failed.",
            code="VALIDATION_ERROR",
            details=details,
            status_code=422,
        )

    @app.errorhandler(RequestEntityTooLarge)
    def handle_entity_too_large(error: RequestEntityTooLarge):
        logger.warning("Request payload too large: %s", str(error))
        return error_response(
            message="Request payload exceeds maximum allowed size.",
            code="REQUEST_TOO_LARGE",
            status_code=413,
        )

    @app.errorhandler(UnsupportedMediaType)
    def handle_unsupported_media_type(error: UnsupportedMediaType):
        return error_response(
            message="Unsupported media type. Content-Type must be 'application/json'.",
            code="UNSUPPORTED_MEDIA_TYPE",
            status_code=415,
        )

    @app.errorhandler(TooManyRequests)
    def handle_too_many_requests(error: TooManyRequests):
        resp, code = error_response(
            message="Too many requests. Please slow down and try again later.",
            code="TOO_MANY_REQUESTS",
            status_code=429,
        )
        resp.headers["Retry-After"] = getattr(error, "retry_after", "60")
        return resp, code

    @app.errorhandler(Unauthorized)
    def handle_unauthorized(error: Unauthorized):
        return error_response(
            message=error.description or "Authentication credentials required.",
            code="UNAUTHORIZED",
            status_code=401,
        )

    @app.errorhandler(Forbidden)
    def handle_forbidden(error: Forbidden):
        return error_response(
            message=error.description or "Access to this resource is forbidden.",
            code="FORBIDDEN",
            status_code=403,
        )

    @app.errorhandler(NotFound)
    def handle_not_found(error: NotFound):
        return error_response(
            message=error.description or "The requested resource was not found.",
            code="NOT_FOUND",
            status_code=404,
        )

    @app.errorhandler(BadRequest)
    def handle_bad_request(error: BadRequest):
        return error_response(
            message=error.description or "Bad request syntax or parameters.",
            code="BAD_REQUEST",
            status_code=400,
        )

    @app.errorhandler(HTTPException)
    def handle_http_exception(error: HTTPException):
        code_name = getattr(error, "name", "HTTP_ERROR").upper().replace(" ", "_")
        return error_response(
            message=error.description or "HTTP error occurred",
            code=code_name,
            details=None,
            status_code=error.code or 500,
        )

    @app.errorhandler(Exception)
    def handle_unexpected_exception(error: Exception):
        logger.exception("Unhandled server exception: %s", str(error))
        # Mask internal errors from client in production and non-debug modes
        is_debug = app.config.get("DEBUG", False)
        message = str(error) if is_debug else "An unexpected internal server error occurred."
        return error_response(
            message=message,
            code="INTERNAL_SERVER_ERROR",
            status_code=500,
        )
