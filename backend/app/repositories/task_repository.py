from typing import Any, Dict, List, Optional, Tuple
from app.repositories.firestore_base import BaseFirestoreRepository


class TaskRepository(BaseFirestoreRepository):
    """Repository for user-scoped tasks stored under users/{uid}/tasks/{taskId}."""

    SUBCOLLECTION = "tasks"

    def get_by_id(self, uid: str, task_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single task belonging to the specified user."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(task_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None
            data = snapshot.to_dict() or {}
            data["id"] = snapshot.id
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error(f"get_task({task_id})", e)
            return None

    def list_tasks(
        self,
        uid: str,
        goal_id: Optional[str] = None,
        is_completed: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List tasks with optional filters and pagination under users/{uid}/tasks."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION)
            query = col_ref

            if goal_id:
                query = query.where("goal_id", "==", goal_id)
            if is_completed is not None:
                query = query.where("is_completed", "==", is_completed)

            query = query.order_by("created_at", direction="DESCENDING")

            all_matching = list(query.stream())
            total_count = len(all_matching)
            paginated = all_matching[offset : offset + limit]

            results = []
            for snap in paginated:
                item = snap.to_dict() or {}
                item["id"] = snap.id
                item["uid"] = uid
                results.append(item)

            return results, total_count
        except Exception as e:
            self.handle_db_error("list_tasks", e)
            return [], 0

    def create_task(self, uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new task strictly scoped to users/{uid}/tasks."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION)
            task_id = self.generate_id()
            doc_ref = col_ref.document(task_id)

            now = self.now_utc()
            data["id"] = task_id
            data["uid"] = uid
            data["is_completed"] = data.get("is_completed", False)
            data["created_at"] = now
            data["updated_at"] = now

            doc_ref.set(data)
            return data
        except Exception as e:
            self.handle_db_error("create_task", e)
            return {}

    def update_task(
        self, uid: str, task_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update fields of an existing task."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(task_id)
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
            self.handle_db_error(f"update_task({task_id})", e)
            return None

    def delete_task(self, uid: str, task_id: str) -> bool:
        """Delete a task document under users/{uid}/tasks/{taskId}."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(task_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return False
            doc_ref.delete()
            return True
        except Exception as e:
            self.handle_db_error(f"delete_task({task_id})", e)
            return False

    def toggle_task_completion_transaction(self, uid: str, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Atomic transaction to toggle task completion state.
        Ensures consistent read-modify-write without race conditions.
        """
        try:
            doc_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(task_id)
            transaction = self.db.transaction()

            def _execute(tx):
                snap = doc_ref.get(transaction=tx)
                if not snap.exists:
                    return None
                task_data = snap.to_dict() or {}
                new_completed = not task_data.get("is_completed", False)
                now = self.now_utc()
                updates = {
                    "is_completed": new_completed,
                    "updated_at": now,
                    "completed_at": now if new_completed else None,
                }
                tx.update(doc_ref, updates)
                task_data.update(updates)
                task_data["id"] = snap.id
                task_data["uid"] = uid
                return task_data

            # If running against in-memory mock during tests, execute directly
            if getattr(self.db, "_is_mock", False):
                return _execute(transaction)

            import firebase_admin.firestore

            @firebase_admin.firestore.transactional
            def update_in_transaction(tx):
                return _execute(tx)

            return update_in_transaction(transaction)
        except Exception as e:
            self.handle_db_error(f"toggle_task_transaction({task_id})", e)
            return None
