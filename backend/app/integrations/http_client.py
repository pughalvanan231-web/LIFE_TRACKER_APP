import logging
from typing import Any, Dict, Optional

import requests
from requests.exceptions import Timeout

from app.middleware.error_handler import AppException

logger = logging.getLogger("app.integrations.http")


class ExternalServiceTimeoutError(AppException):
    """Raised when an external API or upstream service call times out."""

    status_code = 504
    code = "GATEWAY_TIMEOUT"
    message = "An external service did not respond within the configured timeout window."


class SafeHttpClient:
    """HTTP client wrapper with enforced timeouts and structured error handling."""

    def __init__(self, default_timeout: float = 10.0):
        self.default_timeout = default_timeout
        self._session = requests.Session()

    def get(
        self,
        url: str,
        timeout: Optional[float] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs: Any,
    ) -> requests.Response:
        """Execute GET request with enforced timeout."""
        return self._request("GET", url, timeout=timeout, headers=headers, **kwargs)

    def post(
        self,
        url: str,
        timeout: Optional[float] = None,
        json: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs: Any,
    ) -> requests.Response:
        """Execute POST request with enforced timeout."""
        return self._request("POST", url, timeout=timeout, json=json, headers=headers, **kwargs)

    def _request(
        self,
        method: str,
        url: str,
        timeout: Optional[float] = None,
        **kwargs: Any,
    ) -> requests.Response:
        effective_timeout = timeout if timeout is not None else self.default_timeout
        try:
            return self._session.request(method=method, url=url, timeout=effective_timeout, **kwargs)
        except Timeout as e:
            logger.error("External call to %s timed out after %ss: %s", url, effective_timeout, str(e))
            raise ExternalServiceTimeoutError(
                message=f"External service call timed out after {effective_timeout}s.",
                details={"target_url": url, "timeout_seconds": effective_timeout},
            ) from e
