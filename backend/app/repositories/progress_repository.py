from typing import Any, Dict, List, Optional
from app.repositories.firestore_base import BaseFirestoreRepository


class ProgressRepository(BaseFirestoreRepository):
    """Repository for daily reviews and progress snapshots under users/{uid}."""

    REVIEWS_SUBCOLLECTION = "dailyReviews"
    SNAPSHOTS_SUBCOLLECTION = "progressSnapshots"

    def create_daily_review(self, uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Record a daily review document under users/{uid}/dailyReviews."""
        try:
            col_ref = self.get_user_subcollection(uid, self.REVIEWS_SUBCOLLECTION)
            review_id = self.generate_id()
            doc_ref = col_ref.document(review_id)

            now = self.now_utc()
            data["id"] = review_id
            data["uid"] = uid
            data["created_at"] = now

            doc_ref.set(data)
            return data
        except Exception as e:
            self.handle_db_error("create_daily_review", e)
            return {}

    def list_daily_reviews(self, uid: str, limit: int = 30) -> List[Dict[str, Any]]:
        """List daily reviews for a user ordered by date descending."""
        try:
            col_ref = self.get_user_subcollection(uid, self.REVIEWS_SUBCOLLECTION)
            query = col_ref.order_by("created_at", direction="DESCENDING").limit(limit)

            results = []
            for snap in query.stream():
                item = snap.to_dict() or {}
                item["id"] = snap.id
                item["uid"] = uid
                results.append(item)
            return results
        except Exception as e:
            self.handle_db_error("list_daily_reviews", e)
            return []

    def create_progress_snapshot(self, uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Record an immutable progress metrics snapshot under users/{uid}/progressSnapshots."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SNAPSHOTS_SUBCOLLECTION)
            snapshot_id = self.generate_id()
            doc_ref = col_ref.document(snapshot_id)

            now = self.now_utc()
            data["id"] = snapshot_id
            data["uid"] = uid
            data["timestamp"] = now

            doc_ref.set(data)
            return data
        except Exception as e:
            self.handle_db_error("create_progress_snapshot", e)
            return {}

    def get_latest_progress_snapshot(self, uid: str) -> Optional[Dict[str, Any]]:
        """Retrieve the most recent progress snapshot for a user."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SNAPSHOTS_SUBCOLLECTION)
            snaps = list(col_ref.order_by("timestamp", direction="DESCENDING").limit(1).stream())
            if not snaps:
                return None
            doc = snaps[0]
            data = doc.to_dict() or {}
            data["id"] = doc.id
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error("get_latest_progress_snapshot", e)
            return None
