from functools import wraps
from typing import Callable, Optional
from flask import current_app, g, request

from app.exceptions import RateLimitExceededError
from app.services.rate_limiter import rate_limiter


def _get_client_identifier() -> str:
    """Extract client IP address or authenticated subject identifier for rate limiting."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.remote_addr or "127.0.0.1"

    user_id = getattr(g, "user_id", None) or getattr(request, "user_id", None)
    return f"user:{user_id}" if user_id else f"ip:{client_ip}"


def rate_limit(
    max_requests: Optional[int] = None,
    window_seconds: int = 60,
    scope: str = "default",
) -> Callable:
    """
    Decorator to enforce request rate limits on specific routes.
    Raises RateLimitExceededError (HTTP 429) with Retry-After when exceeded.
    """

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_app.config.get("RATE_LIMIT_ENABLED", True):
                return fn(*args, **kwargs)

            limit = (
                max_requests
                if max_requests is not None
                else current_app.config.get("RATE_LIMIT_DEFAULT_PER_MINUTE", 60)
            )

            client_id = _get_client_identifier()
            key = f"rate_limit:{scope}:{client_id}"

            is_allowed, remaining, retry_after = rate_limiter.check_rate_limit(
                key=key,
                max_requests=limit,
                window_seconds=window_seconds,
            )

            if not is_allowed:
                raise RateLimitExceededError(
                    message=f"Rate limit exceeded for scope '{scope}'. Please wait {retry_after}s before retrying.",
                    retry_after=retry_after,
                )

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def ai_usage_limit(
    max_requests: Optional[int] = None,
    window_seconds: int = 60,
) -> Callable:
    """
    Dedicated rate and cost quota decorator for AI / LLM orchestration operations.
    Protects against high inference costs and abuse.
    """

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_app.config.get("RATE_LIMIT_ENABLED", True):
                return fn(*args, **kwargs)

            limit = (
                max_requests
                if max_requests is not None
                else current_app.config.get("RATE_LIMIT_AI_PER_MINUTE", 10)
            )

            client_id = _get_client_identifier()
            key = f"ai_quota:{client_id}"

            is_allowed, remaining, retry_after = rate_limiter.check_rate_limit(
                key=key,
                max_requests=limit,
                window_seconds=window_seconds,
            )

            if not is_allowed:
                raise RateLimitExceededError(
                    message=f"AI operation quota exceeded. Max {limit} requests per minute. Retry in {retry_after}s.",
                    retry_after=retry_after,
                    details={"quota_scope": "ai_inference", "limit": limit},
                )

            return fn(*args, **kwargs)

        return wrapper

    return decorator
