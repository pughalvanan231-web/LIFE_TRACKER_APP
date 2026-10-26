import logging
from typing import Any, Dict, List, Optional

from app.repositories.firestore_base import BaseFirestoreRepository

logger = logging.getLogger("app.repositories.user")


class UserRepository(BaseFirestoreRepository):
    """
    Repository for user account profiles, settings, and notification tokens
    stored under users/{uid}.
    Provides bounded, paginated user enumeration for scheduled background jobs.
    """

    COLLECTION = "users"

    def get_user_profile(self, uid: str) -> Optional[Dict[str, Any]]:
        """Retrieve user profile metadata, preferences, and timezone."""
        try:
            doc_ref = self.db.collection(self.COLLECTION).document(str(uid).strip())
            snap = doc_ref.get()
            if not snap.exists:
                return None
            data = snap.to_dict() or {}
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error(f"get_user_profile({uid})", e)
            return None

    def save_user_profile(
        self, uid: str, data: Dict[str, Any], merge: bool = True
    ) -> Dict[str, Any]:
        """Save or update user profile preferences, timezone, or notification tokens."""
        try:
            doc_ref = self.db.collection(self.COLLECTION).document(str(uid).strip())
            now = self.now_utc()
            data["uid"] = uid
            data["updated_at"] = now
            if not merge:
                data.setdefault("created_at", now)
            doc_ref.set(data, merge=merge)
            return data
        except Exception as e:
            self.handle_db_error(f"save_user_profile({uid})", e)
            return data

    def list_users_paginated(
        self, limit: int = 50, start_after_uid: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List users in bounded chunks using Firestore pagination.
        Guarantees that background jobs stream through users without memory explosion.
        """
        try:
            query = self.db.collection(self.COLLECTION)
            if start_after_uid:
                query = query.where("uid", ">", start_after_uid)
            query = query.limit(limit)

            users = []
            for snap in query.stream():
                data = snap.to_dict() or {}
                data["uid"] = snap.id
                users.append(data)
            return users
        except Exception as e:
            self.handle_db_error("list_users_paginated", e)
            return []
