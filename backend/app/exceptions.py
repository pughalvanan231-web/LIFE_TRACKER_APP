from typing import Any


class AppException(Exception):
    """Base application domain exception."""

    status_code: int = 500
    code: str = "INTERNAL_SERVER_ERROR"
    message: str = "An unexpected error occurred."

    def __init__(
        self,
        message: str | None = None,
        code: str | None = None,
        status_code: int | None = None,
        details: Any = None,
    ):
        super().__init__(message or self.message)
        if message:
            self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.details = details


class BadRequestError(AppException):
    status_code = 400
    code = "BAD_REQUEST"
    message = "Invalid request payload or parameters."


class UnauthorizedError(AppException):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Authentication credentials are required or invalid."


class ForbiddenError(AppException):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to access this resource."


class NotFoundError(AppException):
    status_code = 404
    code = "NOT_FOUND"
    message = "The requested resource was not found."


class ConflictError(AppException):
    status_code = 409
    code = "CONFLICT"
    message = "Resource conflict detected."


class PayloadTooLargeError(AppException):
    status_code = 413
    code = "REQUEST_TOO_LARGE"
    message = "Request payload exceeds the maximum allowed size limit."


class UnsupportedMediaTypeError(AppException):
    status_code = 415
    code = "UNSUPPORTED_MEDIA_TYPE"
    message = "Unsupported Content-Type header. Expected 'application/json'."


class RateLimitExceededError(AppException):
    status_code = 429
    code = "TOO_MANY_REQUESTS"
    message = "Rate limit exceeded. Please retry after the specified window."

    def __init__(
        self,
        message: str | None = None,
        retry_after: int = 60,
        details: Any = None,
    ):
        super().__init__(
            message=message or self.message,
            code="TOO_MANY_REQUESTS",
            status_code=429,
            details=details,
        )
        self.retry_after = retry_after


class ServiceUnavailableError(AppException):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    message = "A dependent service is currently unavailable."
