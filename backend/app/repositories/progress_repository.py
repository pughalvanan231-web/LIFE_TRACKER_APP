from typing import Any, Dict, List, Optional
from app.repositories.firestore_base import BaseFirestoreRepository


class ProgressRepository(BaseFirestoreRepository):
    """
    Repository for daily reviews and progress snapshots under:
      - users/{uid}/dailyReviews/{date}
      - users/{uid}/progressSnapshots/{snapshotId}
    """

    REVIEWS_SUBCOLLECTION = "dailyReviews"
    SNAPSHOTS_SUBCOLLECTION = "progressSnapshots"

    def get_daily_review_by_date(self, uid: str, date: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve daily review for a specific calendar date (YYYY-MM-DD).
        Each user has at most one review per local date.
        """
        try:
            doc_ref = self.get_user_subcollection(uid, self.REVIEWS_SUBCOLLECTION).document(date)
            snap = doc_ref.get()
            if not snap.exists:
                return None
            data = snap.to_dict() or {}
            data["id"] = snap.id
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error(f"get_daily_review_by_date({date})", e)
            return None

    def save_daily_review(
        self, uid: str, date: str, data: Dict[str, Any], is_correction: bool = False
    ) -> Dict[str, Any]:
        """
        Save or update a daily review for a user on a given local date.
        Using date as the document key prevents duplicate reviews for the same day.
        """
        try:
            doc_ref = self.get_user_subcollection(uid, self.REVIEWS_SUBCOLLECTION).document(date)
            now = self.now_utc()
            data["id"] = date
            data["uid"] = uid
            data["date"] = date

            snap = doc_ref.get()
            if snap.exists:
                existing = snap.to_dict() or {}
                data["created_at"] = existing.get("created_at", now)
                data["updated_at"] = now
                if is_correction:
                    data["is_correction"] = True
                    data["corrected_at"] = now
                doc_ref.set(data, merge=True)
            else:
                data["created_at"] = now
                data["updated_at"] = now
                data.setdefault("is_correction", False)
                doc_ref.set(data)

            return data
        except Exception as e:
            self.handle_db_error(f"save_daily_review({date})", e)
            return {}

    def create_daily_review(self, uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Backward-compatible helper redirecting to save_daily_review."""
        date = data.get("date")
        if not date:
            date = self.now_utc().strftime("%Y-%m-%d")
        return self.save_daily_review(uid, date, data, is_correction=data.get("is_correction", False))

    def list_daily_reviews(self, uid: str, limit: int = 30) -> List[Dict[str, Any]]:
        """List daily reviews for a user ordered by date descending."""
        try:
            col_ref = self.get_user_subcollection(uid, self.REVIEWS_SUBCOLLECTION)
            query = col_ref.order_by("date", direction="DESCENDING").limit(limit)

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

    def list_daily_reviews_between_dates(
        self, uid: str, start_date: str, end_date: str
    ) -> List[Dict[str, Any]]:
        """Retrieve all reviews in a date range [start_date, end_date] inclusive."""
        try:
            col_ref = self.get_user_subcollection(uid, self.REVIEWS_SUBCOLLECTION)
            # Fetch reviews where date >= start_date and date <= end_date
            all_reviews = []
            for snap in col_ref.stream():
                item = snap.to_dict() or {}
                d = item.get("date")
                if d and start_date <= d <= end_date:
                    item["id"] = snap.id
                    item["uid"] = uid
                    all_reviews.append(item)
            all_reviews.sort(key=lambda x: x.get("date", ""))
            return all_reviews
        except Exception as e:
            self.handle_db_error(f"list_daily_reviews_between_dates({start_date}, {end_date})", e)
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
