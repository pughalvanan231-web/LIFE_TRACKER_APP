from typing import Any, Dict, List, Optional

from app.repositories.firestore_base import BaseFirestoreRepository


class MilestoneRepository(BaseFirestoreRepository):
    """Repository for user-scoped milestones stored under users/{uid}/milestones/{milestoneId}."""

    SUBCOLLECTION = "milestones"

    def get_by_id(self, uid: str, milestone_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single milestone belonging to the specified user."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(milestone_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None
            data = snapshot.to_dict() or {}
            data["id"] = snapshot.id
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error(f"get_milestone({milestone_id})", e)
            return None

    def list_by_goal(self, uid: str, goal_id: str) -> List[Dict[str, Any]]:
        """List all milestones for a specific goal belonging to the user, ordered by order."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION)
            query = col_ref.where("goal_id", "==", goal_id).order_by("order", direction="ASCENDING")

            results = []
            for snap in query.stream():
                item = snap.to_dict() or {}
                item["id"] = snap.id
                item["uid"] = uid
                results.append(item)
            return results
        except Exception as e:
            self.handle_db_error(f"list_milestones_by_goal({goal_id})", e)
            return []

    def create_milestone(self, uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new milestone document strictly under users/{uid}/milestones."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION)
            milestone_id = self.generate_id()
            doc_ref = col_ref.document(milestone_id)

            now = self.now_utc()
            data["id"] = milestone_id
            data["uid"] = uid
            data["is_completed"] = data.get("is_completed", False)
            data.setdefault("weight", 1.0)
            data.setdefault("date_history", [])
            data["created_at"] = now
            data["updated_at"] = now

            doc_ref.set(data)
            return data
        except Exception as e:
            self.handle_db_error("create_milestone", e)
            return {}

    def update_milestone(
        self, uid: str, milestone_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update fields of an existing milestone."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(milestone_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None

            now = self.now_utc()
            updates["updated_at"] = now
            if updates.get("is_completed") is True and not snapshot.to_dict().get("is_completed"):
                updates["completed_at"] = now
            elif updates.get("is_completed") is False:
                updates["completed_at"] = None

            doc_ref.set(updates, merge=True)
            updated_snap = doc_ref.get()
            result = updated_snap.to_dict() or {}
            result["id"] = updated_snap.id
            result["uid"] = uid
            return result
        except Exception as e:
            self.handle_db_error(f"update_milestone({milestone_id})", e)
            return None

    def delete_milestone(self, uid: str, milestone_id: str) -> bool:
        """Delete a milestone document under users/{uid}/milestones/{milestoneId}."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(milestone_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return False
            doc_ref.delete()
            return True
        except Exception as e:
            self.handle_db_error(f"delete_milestone({milestone_id})", e)
            return False

    def delete_all_by_goal(self, uid: str, goal_id: str) -> int:
        """Cascade delete all milestones belonging to a goal."""
        try:
            milestones = self.list_by_goal(uid, goal_id)
            deleted_count = 0
            for m in milestones:
                if self.delete_milestone(uid, m["id"]):
                    deleted_count += 1
            return deleted_count
        except Exception as e:
            self.handle_db_error(f"delete_all_by_goal({goal_id})", e)
            return 0
