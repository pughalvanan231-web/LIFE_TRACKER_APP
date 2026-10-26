from typing import Any, Dict, List, Optional, Tuple

from app.repositories.firestore_base import BaseFirestoreRepository


class TaskRepository(BaseFirestoreRepository):
    """
    Repository for user-scoped tasks, daily task instances, and daily plans.
    Data layout:
      - users/{uid}/tasks/{taskId}
      - users/{uid}/dailyPlans/{date}
      - users/{uid}/dailyTaskInstances/{date_taskId}
    """

    SUBCOLLECTION = "tasks"
    PLANS_SUBCOLLECTION = "dailyPlans"
    INSTANCES_SUBCOLLECTION = "dailyTaskInstances"

    # ==========================================================================
    # TASK CRUD OPERATIONS
    # ==========================================================================

    def get_by_id(self, uid: str, task_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single task belonging strictly to the specified user."""
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
        date: Optional[str] = None,
        goal_id: Optional[str] = None,
        milestone_id: Optional[str] = None,
        priority: Optional[str] = None,
        status: Optional[str] = None,
        is_completed: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List tasks with multi-field filtering and bounded pagination."""
        try:
            col_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION)
            query = col_ref

            if date:
                query = query.where("scheduled_date", "==", date)
            if goal_id:
                query = query.where("goal_id", "==", goal_id)
            if milestone_id:
                query = query.where("milestone_id", "==", milestone_id)
            if priority:
                query = query.where("priority", "==", priority)
            if status:
                query = query.where("status", "==", status)
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
            data.setdefault("status", "pending")
            data.setdefault("priority", "medium")
            data.setdefault("estimated_duration", 30)
            data.setdefault("is_completed", False)
            data.setdefault("reschedule_history", [])

            sched_date = data.get("scheduled_date") or data.get("due_date")
            data["scheduled_date"] = sched_date
            data["due_date"] = sched_date
            if "original_due_date" not in data or not data["original_due_date"]:
                data["original_due_date"] = sched_date

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

            # Sync due_date and scheduled_date
            if "scheduled_date" in updates and "due_date" not in updates:
                updates["due_date"] = updates["scheduled_date"]
            elif "due_date" in updates and "scheduled_date" not in updates:
                updates["scheduled_date"] = updates["due_date"]

            # Sync is_completed and completed_at
            if updates.get("is_completed") is True or updates.get("status") == "completed":
                updates["is_completed"] = True
                updates["status"] = "completed"
                if not snapshot.to_dict().get("is_completed"):
                    updates["completed_at"] = now
            elif updates.get("is_completed") is False:
                updates["is_completed"] = False
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
                new_status = "completed" if new_completed else "pending"
                now = self.now_utc()
                updates = {
                    "is_completed": new_completed,
                    "status": new_status,
                    "updated_at": now,
                    "completed_at": now if new_completed else None,
                }
                tx.update(doc_ref, updates)
                task_data.update(updates)
                task_data["id"] = snap.id
                task_data["uid"] = uid
                return task_data

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

    # ==========================================================================
    # DAILY PLANS & TASK INSTANCES (HISTORICAL SNAPSHOTS)
    # ==========================================================================

    def create_or_update_daily_plan(self, uid: str, plan_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create or update a daily plan record under users/{uid}/dailyPlans/{date}.
        Using the date as the document key guarantees idempotency and prevents
        duplicate plan entries on repeated submissions.
        """
        try:
            date_key = plan_data["date"]
            doc_ref = self.get_user_subcollection(uid, self.PLANS_SUBCOLLECTION).document(date_key)
            now = self.now_utc()

            existing = doc_ref.get()
            if existing.exists:
                existing_dict = existing.to_dict() or {}
                plan_data["created_at"] = existing_dict.get("created_at", now)
                plan_data["updated_at"] = now
                plan_data["id"] = date_key
                plan_data["uid"] = uid
                doc_ref.set(plan_data, merge=True)
            else:
                plan_data["id"] = date_key
                plan_data["uid"] = uid
                plan_data["created_at"] = now
                plan_data["updated_at"] = now
                doc_ref.set(plan_data)

            return plan_data
        except Exception as e:
            self.handle_db_error("create_or_update_daily_plan", e)
            return {}

    def get_daily_plan(self, uid: str, date: str) -> Optional[Dict[str, Any]]:
        """Retrieve daily plan for a given calendar date."""
        try:
            doc_ref = self.get_user_subcollection(uid, self.PLANS_SUBCOLLECTION).document(date)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                return None
            data = snapshot.to_dict() or {}
            data["id"] = snapshot.id
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error(f"get_daily_plan({date})", e)
            return None

    def list_daily_plans(
        self, uid: str, limit: int = 30, offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List daily plans ordered by date descending."""
        try:
            col_ref = self.get_user_subcollection(uid, self.PLANS_SUBCOLLECTION)
            query = col_ref.order_by("date", direction="DESCENDING")
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
            self.handle_db_error("list_daily_plans", e)
            return [], 0

    def create_or_update_task_instance(
        self, uid: str, instance_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Record a task instance snapshot for a specific date:
        users/{uid}/dailyTaskInstances/{date}_{task_id}
        Guarantees idempotent submission per task per date.
        """
        try:
            instance_id = f"{instance_data['date']}_{instance_data['task_id']}"
            doc_ref = self.get_user_subcollection(uid, self.INSTANCES_SUBCOLLECTION).document(
                instance_id
            )
            now = self.now_utc()
            instance_data["id"] = instance_id
            instance_data["uid"] = uid

            snap = doc_ref.get()
            if snap.exists:
                existing_inst = snap.to_dict() or {}
                instance_data["created_at"] = existing_inst.get("created_at", now)
                instance_data["updated_at"] = now
                doc_ref.set(instance_data, merge=True)
            else:
                instance_data["created_at"] = now
                instance_data["updated_at"] = now
                doc_ref.set(instance_data)

            return instance_data
        except Exception as e:
            self.handle_db_error("create_or_update_task_instance", e)
            return {}

    def get_task_instances_by_date(self, uid: str, date: str) -> List[Dict[str, Any]]:
        """Retrieve all task instance snapshots submitted for a calendar date."""
        try:
            col_ref = self.get_user_subcollection(uid, self.INSTANCES_SUBCOLLECTION)
            query = col_ref.where("date", "==", date)
            results = []
            for snap in query.stream():
                item = snap.to_dict() or {}
                item["id"] = snap.id
                item["uid"] = uid
                results.append(item)
            return results
        except Exception as e:
            self.handle_db_error(f"get_task_instances_by_date({date})", e)
            return []

    def mark_instance_rescheduled(
        self, uid: str, date: str, task_id: str, new_date: str
    ) -> Optional[Dict[str, Any]]:
        """
        Marks a daily task instance as rescheduled to a future date.
        Crucially preserves the historical snapshot of the task on the original day.
        """
        try:
            instance_id = f"{date}_{task_id}"
            doc_ref = self.get_user_subcollection(uid, self.INSTANCES_SUBCOLLECTION).document(
                instance_id
            )
            snap = doc_ref.get()
            if not snap.exists:
                return None

            now = self.now_utc()
            updates = {
                "rescheduled_to": new_date,
                "status": "not_completed",
                "updated_at": now,
            }
            doc_ref.set(updates, merge=True)
            updated_snap = doc_ref.get()
            data = updated_snap.to_dict() or {}
            data["id"] = updated_snap.id
            data["uid"] = uid
            return data
        except Exception as e:
            self.handle_db_error(f"mark_instance_rescheduled({instance_id})", e)
            return None
