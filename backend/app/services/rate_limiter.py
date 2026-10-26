import time
from abc import ABC, abstractmethod
from collections import defaultdict
from threading import Lock
from typing import Dict, List, Tuple


class BaseRateLimiter(ABC):
    """Abstract interface for rate limiting and resource quota management."""

    @abstractmethod
    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> Tuple[bool, int, int]:
        """
        Check if an operation identified by `key` is allowed within the window.
        
        Returns:
            Tuple of (is_allowed: bool, remaining_requests: int, retry_after_seconds: int)
        """
        pass


class InMemorySlidingWindowRateLimiter(BaseRateLimiter):
    """
    Thread-safe in-memory sliding-window log rate limiter.
    Easily swappable with a distributed Redis or Firestore quota backend in production.
    """

    def __init__(self):
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._lock = Lock()

    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> Tuple[bool, int, int]:
        now = time.time()
        window_start = now - window_seconds

        with self._lock:
            # Prune timestamps outside current window
            timestamps = [ts for ts in self._requests[key] if ts > window_start]
            self._requests[key] = timestamps

            if len(timestamps) >= max_requests:
                # Calculate when the oldest request in the window expires
                oldest_in_window = timestamps[0]
                retry_after = max(1, int(oldest_in_window + window_seconds - now))
                return False, 0, retry_after

            # Allow request and record timestamp
            timestamps.append(now)
            remaining = max(0, max_requests - len(timestamps))
            return True, remaining, 0

    def reset(self) -> None:
        """Clear all stored rate limit entries (useful for testing)."""
        with self._lock:
            self._requests.clear()


# Default singleton instance
rate_limiter = InMemorySlidingWindowRateLimiter()
