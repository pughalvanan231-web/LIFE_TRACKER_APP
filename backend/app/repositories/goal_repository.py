from typing import Any, Dict, List, Optional, Tuple
from app.repositories.firestore_base import BaseFirestoreRepository


class GoalRepository(BaseFirestoreRepository):
    """Repository for user-scoped goals stored under users/{uid}/goals/{goalId}."""

    SUBCOLLECTION = "goals"

    def get_by_id(self, uid: str, goal_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single goal belonging to the specified user."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(goal_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None
            data = snapshot.to_dict() or {}
            data["id"] = snapshot.id
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error(f"get_goal({goal_id})", e)
            return None

    def list_goals(
        self,
        uid: str,
        status: Optional[str] = None,
        category: Optional[str] = None,
        timeframe: Optional[str] = None,
        priority: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List goals belonging to the specified user with multi-field filtering, sorting, and pagination.
        Guaranteed to only query within users/{uid}/goals.
        """
        try:
            col_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION)
            query = col_ref

            # Apply where filters
            if status:
                query = query.where("status", "==", status)
            if category:
                query = query.where("category", "==", category)
            if timeframe:
                query = query.where("timeframe", "==", timeframe)
            if priority:
                query = query.where("priority", "==", priority)

            direction = "DESCENDING" if sort_order.lower() == "desc" else "ASCENDING"
            query = query.order_by(sort_by, direction=direction)

            # Fetch matching documents
            all_matching = list(query.stream())
            total_count = len(all_matching)

            # Apply pagination slice
            paginated_snapshots = all_matching[offset : offset + limit]

            results = []
            for snap in paginated_snapshots:
                item = snap.to_dict() or {}
                item["id"] = snap.id
                item["uid"] = uid
                results.append(item)

            return results, total_count
        except Exception as e:
            self.handle_db_error("list_goals", e)
            return [], 0

    def create_goal(self, uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new goal document strictly under users/{uid}/goals."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION)
            goal_id = self.generate_id()
            doc_ref = col_ref.document(goal_id)

            now = self.now_utc()
            data["id"] = goal_id
            data["uid"] = uid
            data["created_at"] = now
            data["updated_at"] = now
            data.setdefault("progress_percentage", 0)
            data.setdefault("date_history", [])

            doc_ref.set(data)
            return data
        except Exception as e:
            self.handle_db_error("create_goal", e)
            return {}

    def update_goal(self, uid: str, goal_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update fields of an existing goal without replacing the entire document."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(goal_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None

            updates["updated_at"] = self.now_utc()
            doc_ref.set(updates, merge=True)

            updated_snap = doc_ref.get()
            result = updated_snap.to_dict() or {}
            result["id"] = updated_snap.id
            result["uid"] = uid
            return result
        except Exception as e:
            self.handle_db_error(f"update_goal({goal_id})", e)
            return None

    def archive_goal(self, uid: str, goal_id: str) -> Optional[Dict[str, Any]]:
        """Safe deletion policy: Archive the goal rather than destroying data."""
        now = self.now_utc()
        return self.update_goal(
            uid,
            goal_id,
            {"status": "archived", "archived_at": now},
        )

    def delete_goal(self, uid: str, goal_id: str) -> bool:
        """Permanently delete a goal document under users/{uid}/goals/{goalId}."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(goal_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return False
            doc_ref.delete()
            return True
        except Exception as e:
            self.handle_db_error(f"delete_goal({goal_id})", e)
            return False
