"""
Authentication and Authorization Middleware for Firebase ID Tokens.

SECURITY RULES:
1. Never trust a `uid` supplied in the request body, URL parameters, query string,
   or arbitrary custom headers. The authenticated identity is derived strictly from
   the verified Firebase ID token claims (`decoded_token["uid"]`).
2. Authentication verifies the token identity; authorization ensures that the
   authenticated identity is permitted to access or modify specific resources.
"""

from functools import wraps
from typing import Callable, Optional

from flask import g, request

from app.exceptions import ForbiddenError, UnauthorizedError
from app.extensions import firebase
from app.schemas.auth import AuthenticatedUser


def extract_bearer_token(auth_header: Optional[str]) -> str:
    """
    Extract and validate Bearer token from HTTP Authorization header.

    Raises:
        UnauthorizedError: If header is missing, malformed, or empty.
    """
    if not auth_header or not auth_header.strip():
        raise UnauthorizedError("Authorization header is required.")

    parts = auth_header.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedError(
            "Invalid Authorization header format. Expected 'Bearer <token>'."
        )

    token = parts[1].strip()
    if not token:
        raise UnauthorizedError("Bearer token cannot be empty.")

    return token


def require_auth(check_revoked: bool = False) -> Callable:
    """
    Route decorator requiring a valid, verified Firebase ID token.
    Populates `flask.g.current_user` and `flask.g.user_id`.
    """

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization")
            token = extract_bearer_token(auth_header)

            # Verify token via Firebase Admin SDK
            decoded_claims = firebase.verify_token(token, check_revoked=check_revoked)

            # Build authenticated user context strictly from verified claims
            try:
                current_user = AuthenticatedUser.from_token_claims(decoded_claims)
            except ValueError as e:
                raise UnauthorizedError(f"Invalid user claims in token: {str(e)}") from e

            # Establish trusted request context
            g.current_user = current_user
            g.user_id = current_user.uid

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_ownership(user_id_param: str = "user_id") -> Callable:
    """
    Authorization decorator ensuring that the authenticated user strictly owns
    the resource identified in the route's URL parameters.

    Prevents authenticated User A from accessing User B's resources.
    """

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            current_user: Optional[AuthenticatedUser] = getattr(g, "current_user", None)
            if not current_user:
                raise UnauthorizedError("Authentication required before authorization check.")

            target_user_id = kwargs.get(user_id_param)
            if not target_user_id:
                raise ForbiddenError("Target resource owner not specified.")

            if str(current_user.uid) != str(target_user_id):
                raise ForbiddenError(
                    "You do not have permission to access resources belonging to another user."
                )

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def verify_resource_ownership(resource_owner_uid: str) -> None:
    """
    Imperative helper to verify ownership of a document or entity.
    Raises ForbiddenError if the authenticated user is not the owner.
    """
    current_user: Optional[AuthenticatedUser] = getattr(g, "current_user", None)
    if not current_user:
        raise UnauthorizedError("Authentication required.")

    if str(current_user.uid) != str(resource_owner_uid):
        raise ForbiddenError(
            "Access denied. You do not have permission to operate on this resource."
        )


def get_current_user() -> Optional[AuthenticatedUser]:
    """Retrieve the current trusted authenticated user from request context."""
    return getattr(g, "current_user", None)
