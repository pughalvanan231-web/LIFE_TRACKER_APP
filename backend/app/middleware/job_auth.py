import hmac
import logging
from functools import wraps
from typing import Callable, Optional
from flask import current_app, g, request

from app.exceptions import ForbiddenError, UnauthorizedError

logger = logging.getLogger("app.middleware.job_auth")


def extract_bearer_token(auth_header: Optional[str]) -> Optional[str]:
    """Extract token string from Authorization: Bearer <token> header."""
    if not auth_header or not auth_header.strip():
        return None
    parts = auth_header.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def verify_google_oidc_token(
    token: str, expected_audience: Optional[str], allowed_service_accounts: Optional[list]
) -> dict:
    """
    Verify Google Cloud OIDC token sent by Cloud Scheduler or Cloud Run.
    Validates signature, audience, expiration, and service account email.
    """
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        # Verify cryptographic signature and claims using Google's public keys
        claims = id_token.verify_oauth2_token(
            id_token=token,
            request=google_requests.Request(),
            audience=expected_audience,
        )

        email = claims.get("email")
        if not email:
            raise ForbiddenError("OIDC token does not contain a service account email claim.")

        # Check allowed service account email allowlist if configured
        if allowed_service_accounts:
            allowed_set = {sa.strip().lower() for sa in allowed_service_accounts if sa.strip()}
            if email.lower() not in allowed_set:
                logger.warning("Unauthorized service account attempted job execution: %s", email)
                raise ForbiddenError(f"Service account '{email}' is not permitted to trigger scheduled jobs.")

        return claims
    except ForbiddenError:
        raise
    except Exception as e:
        logger.error("Google OIDC token verification failed: %s", str(e))
        raise UnauthorizedError(f"Invalid Google Cloud OIDC token: {str(e)}") from e


def require_job_auth() -> Callable:
    """
    Route decorator ensuring scheduled jobs can only be invoked by authorized
    identities:
    1. Google Cloud Scheduler / Cloud Run OIDC token with least-privilege service account.
    2. Or a cryptographically verified internal JOB_SECRET_KEY header (X-Job-Secret or Bearer).
    
    Rejects unauthorized public access with HTTP 401 / 403.
    """

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # 1. Check for Pre-shared Job Secret header
            job_secret_cfg = current_app.config.get("JOB_SECRET_KEY")
            provided_secret = request.headers.get("X-Job-Secret")

            if job_secret_cfg and provided_secret:
                # Constant-time comparison to prevent timing attacks
                if hmac.compare_digest(provided_secret.strip(), job_secret_cfg.strip()):
                    g.job_invoker = "secret:pre_shared_key"
                    return fn(*args, **kwargs)
                else:
                    logger.warning("Job invocation rejected: Invalid X-Job-Secret provided.")
                    raise UnauthorizedError("Invalid job secret key.")

            # 2. Check for Google OIDC Token in Authorization header
            auth_header = request.headers.get("Authorization")
            token = extract_bearer_token(auth_header)

            if token:
                # If token matches JOB_SECRET_KEY directly (e.g. Bearer <secret>)
                if job_secret_cfg and hmac.compare_digest(token.strip(), job_secret_cfg.strip()):
                    g.job_invoker = "secret:bearer_key"
                    return fn(*args, **kwargs)

                # Attempt Google OIDC Token verification
                audience = current_app.config.get("JOB_AUDIENCE")
                allowed_sas = current_app.config.get("JOB_ALLOWED_SERVICE_ACCOUNTS", [])
                if isinstance(allowed_sas, str):
                    allowed_sas = [sa.strip() for sa in allowed_sas.split(",") if sa.strip()]

                claims = verify_google_oidc_token(
                    token=token,
                    expected_audience=audience,
                    allowed_service_accounts=allowed_sas,
                )
                g.job_invoker = f"oidc:{claims.get('email')}"
                return fn(*args, **kwargs)

            # Neither valid secret nor valid OIDC token provided
            logger.warning("Public unauthenticated access attempt to scheduled job route rejected.")
            raise UnauthorizedError(
                "Scheduled jobs require Google OIDC authentication or a valid X-Job-Secret header."
            )

        return wrapper

    return decorator
