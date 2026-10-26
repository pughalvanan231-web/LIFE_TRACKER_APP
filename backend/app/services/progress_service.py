from datetime import date as dt_date
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from app.exceptions import BadRequestError, NotFoundError
from app.repositories.goal_repository import GoalRepository
from app.repositories.milestone_repository import MilestoneRepository
from app.repositories.progress_repository import ProgressRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.goal import GoalTimeframe
from app.schemas.progress import (
    DailyProgressResponse,
    DailyReportMetric,
    DailyReviewCreateRequest,
    DailyReviewResponse,
    GoalProgressItem,
    GoalProgressListResponse,
    PerformanceReportResponse,
    ProgressSnapshotResponse,
    TaskSnapshotItem,
)
from app.schemas.task import TaskStatus


class ProgressService:
    """
    Domain service managing:
      1. Daily reflection reviews with closing unverified task enforcement.
      2. Daily dashboard progress calculations.
      3. Short-term and long-term goal progress based on weighted milestones.
      4. Weekly, monthly, and custom date-range performance reporting.
    """

    def __init__(
        self,
        progress_repo: Optional[ProgressRepository] = None,
        goal_repo: Optional[GoalRepository] = None,
        task_repo: Optional[TaskRepository] = None,
        milestone_repo: Optional[MilestoneRepository] = None,
    ):
        self.progress_repo = progress_repo or ProgressRepository()
        self.goal_repo = goal_repo or GoalRepository()
        self.task_repo = task_repo or TaskRepository()
        self.milestone_repo = milestone_repo or MilestoneRepository()

    # ==========================================================================
    # TIMEZONE & DATE UTILITIES
    # ==========================================================================

    def _resolve_timezone(self, tz_str: Optional[str]) -> Any:
        """Resolve ZoneInfo from timezone string, defaulting to UTC on None or invalid."""
        if not tz_str:
            try:
                return ZoneInfo("UTC")
            except Exception:
                return timezone.utc
        try:
            return ZoneInfo(tz_str.strip())
        except Exception:
            try:
                return ZoneInfo("UTC")
            except Exception:
                return timezone.utc

    def _get_local_date_str(self, tz: ZoneInfo) -> str:
        """Get the current calendar date string (YYYY-MM-DD) in the user's timezone."""
        return datetime.now(tz).strftime("%Y-%m-%d")

    # ==========================================================================
    # CORE CALCULATION FORMULAS
    # ==========================================================================

    @staticmethod
    def _normalize_status(val: Any) -> str:
        """Extract plain string status whether Enum member or str."""
        if hasattr(val, "value"):
            return str(val.value).lower()
        s = str(val).lower() if val is not None else ""
        if s.startswith("taskstatus."):
            return s.split(".", 1)[1]
        return s

    @staticmethod
    def calculate_tasks_breakdown(
        tasks: List[Dict[str, Any]]
    ) -> Tuple[int, int, int, int, int, float, bool]:
        """
        Shared core calculation engine for daily progress and multi-day reports.

        FORMULA:
          Daily completion % = (completed tasks due that day / all tasks due that day) * 100

        RULES:
          - Unverified tasks are NEVER counted as completed.
          - Postponed/rescheduled tasks are tracked separately.
          - If total tasks due is 0, returns completion=0.0 and is_empty=True.
        """
        if not tasks:
            return 0, 0, 0, 0, 0, 0.0, True

        completed = 0
        not_completed = 0
        unverified = 0
        postponed = 0

        for t in tasks:
            status = ProgressService._normalize_status(t.get("status", ""))
            is_completed = t.get("is_completed") is True
            rescheduled_to = t.get("rescheduled_to")

            if rescheduled_to:
                postponed += 1
            elif status == TaskStatus.COMPLETED.value or (is_completed and status != TaskStatus.UNVERIFIED.value):
                completed += 1
            elif status == TaskStatus.UNVERIFIED.value:
                unverified += 1
            elif status in (TaskStatus.NOT_COMPLETED.value, TaskStatus.CANCELLED.value):
                not_completed += 1
            else:
                # Pending or in-progress tasks
                not_completed += 1

        total_due = completed + not_completed + unverified + postponed
        completion_rate = round((completed / total_due) * 100.0, 1) if total_due > 0 else 0.0
        is_empty = total_due == 0

        return total_due, completed, not_completed, unverified, postponed, completion_rate, is_empty

    # ==========================================================================
    # DAILY REVIEW SUBMISSION & RETRIEVAL
    # ==========================================================================

    def record_daily_review(self, uid: str, req: DailyReviewCreateRequest) -> DailyReviewResponse:
        """
        Submit or correct a daily review for a specific calendar date.

        Requirements:
        1. Preserve completed tasks.
        2. Preserve explicitly not-completed tasks.
        3. Mark unconfirmed tasks (pending / in_progress) as unverified at closing.
        4. Save a frozen dated snapshot of task details.
        5. Prevent duplicate reviews (require is_correction=true to update).
        6. Detect late submissions (submitted after user's local date).
        """
        user_tz = self._resolve_timezone(req.timezone)
        current_local_date = self._get_local_date_str(user_tz)
        is_late = req.date < current_local_date

        # Check for existing review
        existing_review = self.progress_repo.get_daily_review_by_date(uid, req.date)
        if existing_review and not req.is_correction:
            raise BadRequestError(
                f"A daily review already exists for date '{req.date}'. "
                "Set is_correction=true to submit corrections."
            )

        # Retrieve tasks scheduled for this date
        tasks, _ = self.task_repo.list_tasks(uid, date=req.date, limit=500)

        # Also retrieve any daily instances submitted for this date
        instances = self.task_repo.get_task_instances_by_date(uid, req.date)
        instances_by_id = {inst["task_id"]: inst for inst in instances}

        task_snapshots: List[Dict[str, Any]] = []

        # Process each task due on this day
        for t in tasks:
            status = self._normalize_status(t.get("status", TaskStatus.PENDING.value))
            # Rule 3: Mark unconfirmed tasks (still pending or in_progress) as UNVERIFIED at closing
            if status in (TaskStatus.PENDING.value, TaskStatus.IN_PROGRESS.value):
                status = TaskStatus.UNVERIFIED.value
                self.task_repo.update_task(uid, t["id"], {"status": status})
                t["status"] = status

            # Check if this task was marked rescheduled in its instance
            inst = instances_by_id.get(t["id"])
            rescheduled_to = inst.get("rescheduled_to") if inst else None

            task_snapshots.append({
                "task_id": t["id"],
                "title": t.get("title", ""),
                "priority": t.get("priority", "medium"),
                "status": status,
                "estimated_duration": int(t.get("estimated_duration", 30)),
                "scheduled_date": t.get("scheduled_date") or req.date,
                "is_completed": t.get("is_completed", False),
                "rescheduled_to": rescheduled_to,
            })

        total_due, comp, not_comp, unver, postp, comp_rate, is_empty = self.calculate_tasks_breakdown(
            task_snapshots
        )

        review_payload = {
            "date": req.date,
            "summary": req.summary,
            "wins": req.wins,
            "challenges": req.challenges,
            "rating": req.rating,
            "total_tasks": total_due,
            "completed_tasks": comp,
            "not_completed_tasks": not_comp,
            "unverified_tasks": unver,
            "postponed_tasks": postp,
            "completion_rate": comp_rate,
            "is_empty_state": is_empty,
            "is_late": is_late,
            "is_correction": req.is_correction,
            "task_snapshots": task_snapshots,
        }

        saved_review = self.progress_repo.save_daily_review(
            uid, req.date, review_payload, is_correction=req.is_correction
        )
        return DailyReviewResponse.model_validate(saved_review)

    def get_daily_review(self, uid: str, date: str) -> DailyReviewResponse:
        """Retrieve the daily review for a specific date."""
        data = self.progress_repo.get_daily_review_by_date(uid, date)
        if not data:
            raise NotFoundError(f"No daily review found for date '{date}'.")
        return DailyReviewResponse.model_validate(data)

    def list_daily_reviews(self, uid: str, limit: int = 30) -> List[DailyReviewResponse]:
        """List daily reviews for the authenticated user."""
        reviews = self.progress_repo.list_daily_reviews(uid, limit=limit)
        return [DailyReviewResponse.model_validate(r) for r in reviews]

    def get_task_history_for_date(self, uid: str, date: str) -> List[TaskSnapshotItem]:
        """
        Retrieve the historical task records for a given date.
        If a frozen daily review exists, returns its preserved snapshots.
        Otherwise, returns the current task state for that date.
        """
        review = self.progress_repo.get_daily_review_by_date(uid, date)
        if review and review.get("task_snapshots"):
            return [TaskSnapshotItem.model_validate(s) for s in review["task_snapshots"]]

        # Fallback to current tasks scheduled for date
        tasks, _ = self.task_repo.list_tasks(uid, date=date, limit=500)
        return [
            TaskSnapshotItem(
                task_id=t["id"],
                title=t.get("title", ""),
                priority=t.get("priority", "medium"),
                status=t.get("status", "pending"),
                estimated_duration=int(t.get("estimated_duration", 30)),
                scheduled_date=t.get("scheduled_date") or date,
                is_completed=t.get("is_completed", False),
            )
            for t in tasks
        ]

    # ==========================================================================
    # DAILY PROGRESS CALCULATION (DASHBOARD)
    # ==========================================================================

    def get_daily_progress(
        self, uid: str, date_str: Optional[str] = None, tz_str: Optional[str] = "UTC"
    ) -> DailyProgressResponse:
        """
        Compute daily task completion percentage using the same formula as reports.
        Shows proper empty state when no tasks are due.
        """
        tz = self._resolve_timezone(tz_str)
        target_date = date_str or self._get_local_date_str(tz)

        # Check if a frozen review already exists for this date
        review = self.progress_repo.get_daily_review_by_date(uid, target_date)
        if review:
            return DailyProgressResponse(
                date=target_date,
                total_tasks=review.get("total_tasks", 0),
                completed_tasks=review.get("completed_tasks", 0),
                not_completed_tasks=review.get("not_completed_tasks", 0),
                unverified_tasks=review.get("unverified_tasks", 0),
                postponed_tasks=review.get("postponed_tasks", 0),
                completion_percentage=review.get("completion_rate", 0.0),
                is_empty_state=review.get("is_empty_state", True),
                is_reviewed=True,
                tasks=[TaskSnapshotItem.model_validate(s) for s in review.get("task_snapshots", [])],
            )

        # Otherwise calculate from live tasks and daily instances
        tasks, _ = self.task_repo.list_tasks(uid, date=target_date, limit=500)
        instances = self.task_repo.get_task_instances_by_date(uid, target_date)
        task_map = {t["id"]: t for t in tasks}
        for inst in instances:
            t_id = inst.get("task_id")
            if t_id not in task_map:
                task_map[t_id] = {
                    "id": t_id,
                    "title": inst.get("title", ""),
                    "priority": inst.get("priority", "medium"),
                    "status": inst.get("status", "not_completed"),
                    "estimated_duration": inst.get("estimated_duration", 30),
                    "scheduled_date": target_date,
                    "rescheduled_to": inst.get("rescheduled_to"),
                    "is_completed": inst.get("is_completed", False),
                }
            elif inst.get("rescheduled_to"):
                task_map[t_id]["rescheduled_to"] = inst.get("rescheduled_to")

        all_day_tasks = list(task_map.values())
        total_due, comp, not_comp, unver, postp, comp_rate, is_empty = self.calculate_tasks_breakdown(all_day_tasks)

        snapshot_items = [
            TaskSnapshotItem(
                task_id=t.get("id", t.get("task_id", "")),
                title=t.get("title", ""),
                priority=t.get("priority", "medium"),
                status=t.get("status", "pending"),
                estimated_duration=int(t.get("estimated_duration", 30)),
                scheduled_date=t.get("scheduled_date") or target_date,
                is_completed=t.get("is_completed", False),
                rescheduled_to=t.get("rescheduled_to"),
            )
            for t in all_day_tasks
        ]

        return DailyProgressResponse(
            date=target_date,
            total_tasks=total_due,
            completed_tasks=comp,
            not_completed_tasks=not_comp,
            unverified_tasks=unver,
            postponed_tasks=postp,
            completion_percentage=comp_rate,
            is_empty_state=is_empty,
            is_reviewed=False,
            tasks=snapshot_items,
        )

    # ==========================================================================
    # GOAL PROGRESS (MEASURABLE MILESTONES & TARGET METRICS)
    # ==========================================================================

    def get_goal_progress_by_timeframe(
        self, uid: str, timeframe: GoalTimeframe
    ) -> GoalProgressListResponse:
        """
        Calculate goal progress strictly based on measurable weighted milestones
        or quantitative target metrics.
        CRITICAL: Never substitutes daily task completion for actual goal progress.
        """
        goals, _ = self.goal_repo.list_goals(uid, timeframe=timeframe.value, limit=500)
        items: List[GoalProgressItem] = []

        for g in goals:
            g_id = g["id"]
            milestones = self.milestone_repo.list_by_goal(uid, g_id)

            total_milestones = len(milestones)
            completed_milestones = sum(1 for m in milestones if m.get("is_completed") is True)

            # 1. Milestone weight formula
            if milestones:
                total_w = sum(float(m.get("weight", 1.0)) for m in milestones)
                comp_w = sum(
                    float(m.get("weight", 1.0)) for m in milestones if m.get("is_completed") is True
                )
                progress = min(100, max(0, int(round((comp_w / total_w) * 100)))) if total_w > 0 else 0
            # 2. Quantitative target metric formula
            elif g.get("target_value") and float(g["target_value"]) > 0:
                t_val = float(g["target_value"])
                c_val = float(g.get("current_value") or 0.0)
                progress = min(100, max(0, int(round((c_val / t_val) * 100))))
            # 3. Fallback to explicitly recorded goal progress
            else:
                progress = int(g.get("progress_percentage", 0))

            items.append(
                GoalProgressItem(
                    goal_id=g_id,
                    title=g.get("title", ""),
                    timeframe=timeframe.value,
                    category=g.get("category", "other"),
                    priority=g.get("priority", "medium"),
                    status=g.get("status", "active"),
                    progress_percentage=progress,
                    total_milestones=total_milestones,
                    completed_milestones=completed_milestones,
                    target_value=g.get("target_value"),
                    current_value=g.get("current_value"),
                    unit=g.get("unit"),
                    target_date=g.get("target_date"),
                )
            )

        avg_progress = (
            round(sum(it.progress_percentage for it in items) / len(items), 1) if items else 0.0
        )

        return GoalProgressListResponse(
            timeframe=timeframe.value,
            count=len(items),
            average_progress=avg_progress,
            goals=items,
        )

    # ==========================================================================
    # PERFORMANCE REPORTING (WEEKLY, MONTHLY, CUSTOM)
    # ==========================================================================

    def generate_report(
        self,
        uid: str,
        start_date: str,
        end_date: str,
        report_type: str = "custom",
        tz_str: Optional[str] = "UTC",
    ) -> PerformanceReportResponse:
        """
        Generate a multi-day performance report across a date range [start_date, end_date].
        Uses saved daily reviews where available to guarantee agreement with user reviews.
        Distinguishes completed, not-completed, postponed, and unverified tasks.
        """
        if start_date > end_date:
            raise BadRequestError(f"Start date '{start_date}' cannot be after end date '{end_date}'.")

        tz = self._resolve_timezone(tz_str)
        s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        e_date = datetime.strptime(end_date, "%Y-%m-%d").date()

        days_count = (e_date - s_date).days + 1
        if days_count > 366:
            raise BadRequestError("Report date range cannot exceed 366 days.")

        # Pre-fetch saved reviews in this window
        saved_reviews = self.progress_repo.list_daily_reviews_between_dates(uid, start_date, end_date)
        reviews_by_date = {r["date"]: r for r in saved_reviews}

        daily_breakdown: List[DailyReportMetric] = []
        total_completed = 0
        total_not_completed = 0
        total_postponed = 0
        total_unverified = 0
        active_days = 0

        curr = s_date
        while curr <= e_date:
            d_str = curr.strftime("%Y-%m-%d")

            # Check if frozen daily review exists
            if d_str in reviews_by_date:
                r = reviews_by_date[d_str]
                comp = int(r.get("completed_tasks", 0))
                not_comp = int(r.get("not_completed_tasks", 0))
                unver = int(r.get("unverified_tasks", 0))
                postp = int(r.get("postponed_tasks", 0))
                tot = int(r.get("total_tasks", 0))
                rate = float(r.get("completion_rate", 0.0))
                is_empty = bool(r.get("is_empty_state", True))
            else:
                # Live tasks and daily instances calculation
                tasks, _ = self.task_repo.list_tasks(uid, date=d_str, limit=500)
                instances = self.task_repo.get_task_instances_by_date(uid, d_str)
                task_map = {t["id"]: t for t in tasks}
                for inst in instances:
                    t_id = inst.get("task_id")
                    if t_id not in task_map:
                        task_map[t_id] = {
                            "id": t_id,
                            "title": inst.get("title", ""),
                            "priority": inst.get("priority", "medium"),
                            "status": inst.get("status", "not_completed"),
                            "estimated_duration": inst.get("estimated_duration", 30),
                            "scheduled_date": d_str,
                            "rescheduled_to": inst.get("rescheduled_to"),
                            "is_completed": inst.get("is_completed", False),
                        }
                    elif inst.get("rescheduled_to"):
                        task_map[t_id]["rescheduled_to"] = inst.get("rescheduled_to")

                all_day_tasks = list(task_map.values())
                tot, comp, not_comp, unver, postp, rate, is_empty = self.calculate_tasks_breakdown(all_day_tasks)

            if not is_empty:
                active_days += 1

            total_completed += comp
            total_not_completed += not_comp
            total_postponed += postp
            total_unverified += unver

            daily_breakdown.append(
                DailyReportMetric(
                    date=d_str,
                    completed_count=comp,
                    not_completed_count=not_comp,
                    postponed_count=postp,
                    unverified_count=unver,
                    total_due=tot,
                    completion_rate=rate,
                    is_empty=is_empty,
                )
            )
            curr += timedelta(days=1)

        total_due_all = total_completed + total_not_completed + total_postponed + total_unverified
        overall_completion = (
            round((total_completed / total_due_all) * 100.0, 1) if total_due_all > 0 else 0.0
        )

        return PerformanceReportResponse(
            report_type=report_type,
            start_date=start_date,
            end_date=end_date,
            timezone=tz.key if hasattr(tz, "key") else str(tz),
            total_days=days_count,
            active_days=active_days,
            total_tasks_scheduled=total_due_all,
            completed_count=total_completed,
            not_completed_count=total_not_completed,
            postponed_count=total_postponed,
            unverified_count=total_unverified,
            overall_completion_rate=overall_completion,
            daily_breakdown=daily_breakdown,
            generated_at=datetime.now(timezone.utc),
        )

    def generate_weekly_report(
        self, uid: str, end_date_str: Optional[str] = None, tz_str: Optional[str] = "UTC"
    ) -> PerformanceReportResponse:
        """Generate weekly report for the 7 days leading up to end_date."""
        tz = self._resolve_timezone(tz_str)
        if end_date_str:
            e_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        else:
            e_date = datetime.now(tz).date()

        s_date = e_date - timedelta(days=6)
        return self.generate_report(
            uid,
            start_date=s_date.strftime("%Y-%m-%d"),
            end_date=e_date.strftime("%Y-%m-%d"),
            report_type="weekly",
            tz_str=tz_str,
        )

    def generate_monthly_report(
        self, uid: str, month_str: Optional[str] = None, tz_str: Optional[str] = "UTC"
    ) -> PerformanceReportResponse:
        """
        Generate monthly report for a calendar month (YYYY-MM)
        or past 30 days if month is not specified.
        """
        tz = self._resolve_timezone(tz_str)
        if month_str:
            year, month = map(int, month_str.split("-"))
            s_date = dt_date(year, month, 1)
            # Find next month 1st day minus 1
            if month == 12:
                next_month = dt_date(year + 1, 1, 1)
            else:
                next_month = dt_date(year, month + 1, 1)
            e_date = next_month - timedelta(days=1)
        else:
            e_date = datetime.now(tz).date()
            s_date = e_date - timedelta(days=29)

        return self.generate_report(
            uid,
            start_date=s_date.strftime("%Y-%m-%d"),
            end_date=e_date.strftime("%Y-%m-%d"),
            report_type="monthly",
            tz_str=tz_str,
        )

    def compute_and_save_snapshot(self, uid: str) -> ProgressSnapshotResponse:
        """Compute an aggregated metrics progress snapshot for backward compatibility."""
        goals, total_goals = self.goal_repo.list_goals(uid, limit=1000)
        active_goals = sum(1 for g in goals if g.get("status") == "active")
        completed_goals = sum(1 for g in goals if g.get("status") == "completed")

        tasks, total_tasks = self.task_repo.list_tasks(uid, limit=1000)
        completed_tasks = sum(1 for t in tasks if t.get("is_completed") is True)

        completion_rate = (
            round((completed_tasks / total_tasks) * 100.0, 1) if total_tasks > 0 else 0.0
        )

        snapshot_payload = {
            "total_goals": total_goals,
            "active_goals": active_goals,
            "completed_goals": completed_goals,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "overall_completion_rate": completion_rate,
            "metrics": {
                "active_goals_ratio": round(active_goals / total_goals, 2) if total_goals > 0 else 0.0,
            },
        }

        created = self.progress_repo.create_progress_snapshot(uid, snapshot_payload)
        return ProgressSnapshotResponse.model_validate(created)
