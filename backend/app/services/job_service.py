import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from app.exceptions import BadRequestError
from app.repositories.goal_repository import GoalRepository
from app.repositories.milestone_repository import MilestoneRepository
from app.repositories.progress_repository import ProgressRepository
from app.repositories.task_repository import TaskRepository
from app.repositories.user_repository import UserRepository
from app.schemas.progress import DailyReviewCreateRequest
from app.schemas.task import TaskStatus
from app.services.notification_service import NotificationService
from app.services.progress_service import ProgressService

logger = logging.getLogger("app.services.jobs")


class JobService:
    """
    Service coordinating scheduled backend background jobs:
    1. Midnight daily review closing across per-user timezones.
    2. Marking unconfirmed tasks as unverified at review closing.
    3. Creating and freezing daily review snapshots.
    4. Recovering missed scheduled executions.
    5. Detecting overdue goals and milestones.
    6. Preparing scheduled progress summaries.
    7. Sending eligible reminders with idempotency.
    8. Safe dry-run and time simulation mode.
    """

    def __init__(
        self,
        user_repo: Optional[UserRepository] = None,
        task_repo: Optional[TaskRepository] = None,
        progress_repo: Optional[ProgressRepository] = None,
        goal_repo: Optional[GoalRepository] = None,
        milestone_repo: Optional[MilestoneRepository] = None,
        progress_service: Optional[ProgressService] = None,
        notification_service: Optional[NotificationService] = None,
    ):
        self.user_repo = user_repo or UserRepository()
        self.task_repo = task_repo or TaskRepository()
        self.progress_repo = progress_repo or ProgressRepository()
        self.goal_repo = goal_repo or GoalRepository()
        self.milestone_repo = milestone_repo or MilestoneRepository()
        self.progress_service = progress_service or ProgressService(
            progress_repo=self.progress_repo,
            goal_repo=self.goal_repo,
            task_repo=self.task_repo,
            milestone_repo=self.milestone_repo,
        )
        self.notification_service = notification_service or NotificationService(
            user_repo=self.user_repo
        )

    # ==========================================================================
    # TIMEZONE & SIMULATION UTILITIES
    # ==========================================================================

    def _resolve_tz(self, tz_str: Optional[str]) -> Any:
        if not tz_str:
            return timezone.utc
        try:
            return ZoneInfo(tz_str.strip())
        except Exception:
            return timezone.utc

    def _get_reference_utc_time(self, simulated_now: Optional[str]) -> datetime:
        """Resolve effective UTC reference time for the execution."""
        if simulated_now:
            try:
                # Support ISO format timestamps
                dt = datetime.fromisoformat(simulated_now.replace("Z", "+00:00"))
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except Exception as e:
                raise BadRequestError(f"Invalid simulated_now timestamp: {str(e)}") from e
        return datetime.now(timezone.utc)

    # ==========================================================================
    # 1. MIDNIGHT CLOSING & UNVERIFIED TASK SNAPSHOTS
    # ==========================================================================

    def close_daily_reviews_for_user(
        self,
        uid: str,
        user_tz: Any,
        ref_utc: datetime,
        lookback_days: int = 7,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Process midnight closing for a single user across their local day boundaries.
        Idempotent: skips dates that already have frozen daily reviews.
        Recovers from missed past runs by inspecting lookback_days.
        """
        local_now = ref_utc.astimezone(user_tz)
        local_today_date = local_now.date()

        reviews_closed = 0
        tasks_marked_unverified = 0
        notifications_sent = 0

        # Inspect candidate dates in the past (yesterday and previous unclosed days)
        for days_ago in range(1, lookback_days + 1):
            past_date = local_today_date - timedelta(days=days_ago)
            past_date_str = past_date.strftime("%Y-%m-%d")

            # 1. Idempotency: Check if daily review already exists for this date
            existing_review = self.progress_repo.get_daily_review_by_date(uid, past_date_str)
            if existing_review:
                continue

            # 2. Check if tasks or daily plan existed for this date
            tasks, _ = self.task_repo.list_tasks(uid, date=past_date_str, limit=500)
            instances = self.task_repo.get_task_instances_by_date(uid, past_date_str)

            if not tasks and not instances:
                # No tasks scheduled for this past date, nothing to close
                continue

            # 3. Transition unconfirmed tasks to unverified and collect snapshots
            unverified_count_for_day = 0
            for t in tasks:
                raw_status = t.get("status", "")
                status_str = (
                    raw_status.value.lower()
                    if hasattr(raw_status, "value")
                    else str(raw_status).lower().replace("taskstatus.", "")
                )
                if status_str in ("pending", "in_progress"):
                    unverified_count_for_day += 1
                    if not dry_run:
                        self.task_repo.update_task(
                            uid, t["id"], {"status": TaskStatus.UNVERIFIED.value}
                        )

            tasks_marked_unverified += unverified_count_for_day

            # 4. Save frozen daily review snapshot
            if not dry_run:
                # Refresh tasks list with updated statuses
                updated_tasks, _ = self.task_repo.list_tasks(uid, date=past_date_str, limit=500)
                review_req = DailyReviewCreateRequest(
                    date=past_date_str,
                    summary=f"Automated midnight closing executed for {past_date_str}.",
                    wins=None,
                    challenges=None,
                    rating=3,
                    is_correction=False,
                    timezone=str(user_tz),
                )
                self.progress_service.record_daily_review(uid, review_req)
                reviews_closed += 1

                # Send closing alert notification
                dispatched = self.notification_service.send_idempotent_notification(
                    uid=uid,
                    idempotency_key=f"midnight_closing_{past_date_str}",
                    title="Daily Review Closed",
                    body=f"Your day for {past_date_str} has been closed and task progress frozen.",
                    data={"date": past_date_str, "type": "midnight_closing"},
                    dry_run=dry_run,
                )
                if dispatched:
                    notifications_sent += 1
            else:
                reviews_closed += 1
                logger.info(
                    "[Dry Run] Would close review for user %s on %s (Unverified tasks: %s)",
                    uid,
                    past_date_str,
                    unverified_count_for_day,
                )

        return {
            "reviews_closed": reviews_closed,
            "tasks_marked_unverified": tasks_marked_unverified,
            "notifications_sent": notifications_sent,
        }

    # ==========================================================================
    # 2. OVERDUE GOALS & MILESTONES DETECTION
    # ==========================================================================

    def detect_overdue_goals_and_milestones_for_user(
        self,
        uid: str,
        user_tz: Any,
        ref_utc: datetime,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Identify active goals and milestones whose deadlines have passed.
        Dispatches idempotent notifications without automatically completing or deleting.
        """
        local_now = ref_utc.astimezone(user_tz)
        local_today_str = local_now.strftime("%Y-%m-%d")

        overdue_goals = 0
        overdue_milestones = 0
        notifications_sent = 0

        # Query active user goals
        goals, _ = self.goal_repo.list_goals(uid, status="active", limit=50)

        for g in goals:
            target_date = g.get("target_date")
            if target_date and target_date < local_today_str:
                overdue_goals += 1
                dispatched = self.notification_service.send_idempotent_notification(
                    uid=uid,
                    idempotency_key=f"overdue_goal_{g['id']}_{local_today_str}",
                    title="Goal Target Date Overdue",
                    body=f"Target date for '{g.get('title')}' was {target_date}.",
                    data={"goal_id": g["id"], "type": "overdue_goal"},
                    dry_run=dry_run,
                )
                if dispatched:
                    notifications_sent += 1

            # Check milestones under this goal
            milestones = self.milestone_repo.list_by_goal(uid, g["id"])
            for m in milestones:
                m_target = m.get("target_date")
                is_comp = m.get("is_completed", False)
                if m_target and m_target < local_today_str and not is_comp:
                    overdue_milestones += 1
                    dispatched = self.notification_service.send_idempotent_notification(
                        uid=uid,
                        idempotency_key=f"overdue_milestone_{m['id']}_{local_today_str}",
                        title="Milestone Overdue",
                        body=f"Milestone '{m.get('title')}' passed target date {m_target}.",
                        data={"goal_id": g["id"], "milestone_id": m["id"], "type": "overdue_milestone"},
                        dry_run=dry_run,
                    )
                    if dispatched:
                        notifications_sent += 1

        return {
            "overdue_goals_detected": overdue_goals,
            "overdue_milestones_detected": overdue_milestones,
            "notifications_sent": notifications_sent,
        }

    # ==========================================================================
    # 3. SCHEDULED PROGRESS SUMMARIES
    # ==========================================================================

    def prepare_scheduled_summaries_for_user(
        self,
        uid: str,
        user_tz: Any,
        ref_utc: datetime,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate weekly progress summaries if today is the user's weekly summary day (e.g. Monday).
        """
        local_now = ref_utc.astimezone(user_tz)
        local_weekday = local_now.weekday()  # 0 is Monday

        summaries_prepared = 0
        notifications_sent = 0

        # Check if today is Monday (weekly summary day)
        if local_weekday == 0:
            last_week_start = (local_now.date() - timedelta(days=7)).strftime("%Y-%m-%d")
            last_week_end = (local_now.date() - timedelta(days=1)).strftime("%Y-%m-%d")

            report_key = f"weekly_summary_{last_week_start}"

            if not dry_run:
                try:
                    # Generate report strictly from saved reviews
                    self.progress_service.generate_report(
                        uid=uid,
                        start_date=last_week_start,
                        end_date=last_week_end,
                        tz_str=str(user_tz),
                    )
                    summaries_prepared += 1
                except Exception as e:
                    logger.warning("Could not generate scheduled summary for %s: %s", uid, str(e))

                dispatched = self.notification_service.send_idempotent_notification(
                    uid=uid,
                    idempotency_key=report_key,
                    title="Weekly Progress Summary Ready",
                    body=f"Your performance review for week {last_week_start} is ready.",
                    data={"start_date": last_week_start, "end_date": last_week_end, "type": "weekly_summary"},
                    dry_run=dry_run,
                )
                if dispatched:
                    notifications_sent += 1
            else:
                summaries_prepared += 1
                logger.info("[Dry Run] Would prepare weekly summary for user %s (%s)", uid, report_key)

        return {
            "summaries_prepared": summaries_prepared,
            "notifications_sent": notifications_sent,
        }

    # ==========================================================================
    # 4. MASTER BATCH RUNNER (BOUNDED & PAGINATED)
    # ==========================================================================

    def run_scheduled_pipeline(
        self,
        batch_size: int = 50,
        simulated_now: Optional[str] = None,
        dry_run: bool = False,
        single_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Master execution pipeline. Streams through users in bounded pages,
        processing midnight closings, overdue detections, and summaries.
        """
        start_time = time.time()
        ref_utc = self._get_reference_utc_time(simulated_now)

        total_users = 0
        total_reviews_closed = 0
        total_tasks_unverified = 0
        total_overdue_goals = 0
        total_overdue_milestones = 0
        total_summaries = 0
        total_notifications = 0

        logger.info(
            "Scheduled pipeline starting (Ref UTC: %s, DryRun: %s, SingleUser: %s, BatchSize: %s)",
            ref_utc.isoformat(),
            dry_run,
            single_user_id,
            batch_size,
        )

        if single_user_id:
            profile = self.user_repo.get_user_profile(single_user_id) or {"uid": single_user_id}
            user_pages = [[profile]]
        else:
            # Stream all users in bounded pages
            user_pages = []
            cursor = None
            while True:
                users_page = self.user_repo.list_users_paginated(
                    limit=batch_size, start_after_uid=cursor
                )
                if not users_page:
                    break
                user_pages.append(users_page)
                if len(users_page) < batch_size:
                    break
                cursor = users_page[-1]["uid"]

        for page in user_pages:
            for user in page:
                uid = user.get("uid")
                if not uid:
                    continue

                total_users += 1
                user_tz = self._resolve_tz(user.get("timezone", "UTC"))

                # 1. Midnight Closing
                closing_res = self.close_daily_reviews_for_user(
                    uid=uid,
                    user_tz=user_tz,
                    ref_utc=ref_utc,
                    lookback_days=7,
                    dry_run=dry_run,
                )
                total_reviews_closed += closing_res["reviews_closed"]
                total_tasks_unverified += closing_res["tasks_marked_unverified"]
                total_notifications += closing_res["notifications_sent"]

                # 2. Overdue Goals & Milestones
                overdue_res = self.detect_overdue_goals_and_milestones_for_user(
                    uid=uid,
                    user_tz=user_tz,
                    ref_utc=ref_utc,
                    dry_run=dry_run,
                )
                total_overdue_goals += overdue_res["overdue_goals_detected"]
                total_overdue_milestones += overdue_res["overdue_milestones_detected"]
                total_notifications += overdue_res["notifications_sent"]

                # 3. Scheduled Summaries
                summary_res = self.prepare_scheduled_summaries_for_user(
                    uid=uid,
                    user_tz=user_tz,
                    ref_utc=ref_utc,
                    dry_run=dry_run,
                )
                total_summaries += summary_res["summaries_prepared"]
                total_notifications += summary_res["notifications_sent"]

        duration_ms = int((time.time() - start_time) * 1000)

        result = {
            "status": "completed",
            "dry_run": dry_run,
            "simulated_now": simulated_now,
            "reference_utc": ref_utc.isoformat(),
            "users_processed": total_users,
            "reviews_closed": total_reviews_closed,
            "tasks_marked_unverified": total_tasks_unverified,
            "overdue_goals_detected": total_overdue_goals,
            "overdue_milestones_detected": total_overdue_milestones,
            "summaries_prepared": total_summaries,
            "notifications_dispatched": total_notifications,
            "execution_duration_ms": duration_ms,
        }

        logger.info("Scheduled pipeline completed in %sms: %s", duration_ms, result)
        return result
