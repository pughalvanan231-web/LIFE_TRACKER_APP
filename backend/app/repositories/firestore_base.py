import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from google.api_core.exceptions import GoogleAPIError

from app.exceptions import ServiceUnavailableError
from app.extensions import firebase

logger = logging.getLogger("app.repositories.firestore")


class BaseFirestoreRepository:
    """
    Base repository ensuring strict user scoping, consistent timestamps,
    and structured error translation for Cloud Firestore.
    """

    def __init__(self, db: Optional[Any] = None):
        self._db_override = db

    @property
    def db(self) -> Any:
        """Resolve current active Firestore client."""
        if self._db_override is not None:
            return self._db_override
        if not firebase.is_initialized or firebase.db is None:
            raise ServiceUnavailableError("Firestore database is not initialized.")
        return firebase.db

    def get_user_subcollection(self, uid: str, subcollection: str):
        """
        Construct a strictly user-scoped subcollection reference.
        SECURITY: Guarantees that queries and document accesses are rooted in users/{uid}.
        """
        if not uid or not str(uid).strip():
            raise ValueError("A valid, non-empty user UID is required.")
        return self.db.collection("users").document(str(uid).strip()).collection(subcollection)

    def generate_id(self) -> str:
        """Generate a cryptographically random unique document identifier."""
        return str(uuid.uuid4())

    def now_utc(self) -> datetime:
        """Return the current time in UTC."""
        return datetime.now(timezone.utc)

    def handle_db_error(self, operation: str, exc: Exception) -> None:
        """Translate Google Cloud / Firestore exceptions into safe domain exceptions."""
        logger.error("Firestore failure during '%s': %s", operation, str(exc), exc_info=True)
        if isinstance(exc, (GoogleAPIError, ConnectionError, TimeoutError)):
            raise ServiceUnavailableError("Database service is temporarily unavailable. Please retry.") from exc
        raise ServiceUnavailableError("An unexpected database error occurred.") from exc
