import logging
from typing import Any, Dict, Optional

from app.extensions import firebase

logger = logging.getLogger("app.integrations.firebase")


class FirestoreService:
    """Wrapper for Firestore operations with graceful fallback and error handling."""

    @property
    def is_connected(self) -> bool:
        return firebase.is_initialized and firebase.db is not None

    def get_document(self, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a document by ID."""
        if not self.is_connected:
            logger.warning("Firestore is not connected. Operation 'get_document' skipped.")
            return None

        doc_ref = firebase.db.collection(collection).document(doc_id)
        doc = doc_ref.get()
        return doc.to_dict() if doc.exists else None

    def set_document(self, collection: str, doc_id: str, data: Dict[str, Any], merge: bool = True) -> bool:
        """Create or update a document."""
        if not self.is_connected:
            logger.warning("Firestore is not connected. Operation 'set_document' skipped.")
            return False

        doc_ref = firebase.db.collection(collection).document(doc_id)
        doc_ref.set(data, merge=merge)
        return True
