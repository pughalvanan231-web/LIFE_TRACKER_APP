from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import Field

from app.schemas.common import AppBaseModel


class TaskSnapshotItem(AppBaseModel):
    """Frozen snapshot of a task state recorded at review or report time."""

    task_id: str
    title: str
    priority: str = "medium"
    status: str = "pending"
    estimated_duration: int = 30
    scheduled_date: Optional[str] = None
    is_completed: bool = False
    rescheduled_to: Optional[str] = None


class DailyReviewCreateRequest(AppBaseModel):
    """Payload to record or correct a daily reflective review."""

    date: str = Field(description="Calendar date string YYYY-MM-DD")
    summary: Optional[str] = Field(default=None, max_length=2000, description="Overall summary of the day")
    wins: Optional[str] = Field(default=None, max_length=1000, description="Key wins and accomplishments")
    challenges: Optional[str] = Field(default=None, max_length=1000, description="Obstacles and challenges faced")
    rating: int = Field(default=3, ge=1, le=5, description="Day satisfaction rating from 1 to 5")
    is_correction: bool = Field(default=False, description="Whether this submission is a deliberate correction")
    timezone: str = Field(default="UTC", description="User local timezone (e.g., 'America/New_York', 'UTC')")


class DailyReviewResponse(AppBaseModel):
    """Complete frozen daily review record including task snapshot breakdown."""

    id: str
    uid: str
    date: str
    summary: Optional[str] = None
    wins: Optional[str] = None
    challenges: Optional[str] = None
    rating: int = 3

    # Task metrics breakdown
    total_tasks: int = 0
    completed_tasks: int = 0
    not_completed_tasks: int = 0
    unverified_tasks: int = 0
    postponed_tasks: int = 0
    completion_rate: float = 0.0
    is_empty_state: bool = True

    # Audit & metadata
    is_late: bool = False
    is_correction: bool = False
    corrected_at: Optional[datetime] = None
    task_snapshots: List[TaskSnapshotItem] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DailyProgressResponse(AppBaseModel):
    """Current day task completion status for dashboard."""

    date: str
    total_tasks: int = 0
    completed_tasks: int = 0
    not_completed_tasks: int = 0
    unverified_tasks: int = 0
    postponed_tasks: int = 0
    completion_percentage: float = 0.0
    is_empty_state: bool = True
    is_reviewed: bool = False
    tasks: List[TaskSnapshotItem] = Field(default_factory=list)


class GoalProgressItem(AppBaseModel):
    """Measurable progress details for an individual goal."""

    goal_id: str
    title: str
    timeframe: str
    category: str
    priority: str
    status: str
    progress_percentage: int
    total_milestones: int = 0
    completed_milestones: int = 0
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    target_date: Optional[str] = None


class GoalProgressListResponse(AppBaseModel):
    """Aggregated progress for classified goals (short-term or long-term)."""

    timeframe: str
    count: int
    average_progress: float
    goals: List[GoalProgressItem] = Field(default_factory=list)


class DailyReportMetric(AppBaseModel):
    """Metrics for a single calendar day inside a multi-day report."""

    date: str
    completed_count: int = 0
    not_completed_count: int = 0
    postponed_count: int = 0
    unverified_count: int = 0
    total_due: int = 0
    completion_rate: float = 0.0
    is_empty: bool = True


class PerformanceReportResponse(AppBaseModel):
    """Aggregated performance report (weekly, monthly, or custom date-range)."""

    report_type: str
    start_date: str
    end_date: str
    timezone: str
    total_days: int
    active_days: int
    total_tasks_scheduled: int
    completed_count: int
    not_completed_count: int
    postponed_count: int
    unverified_count: int
    overall_completion_rate: float
    daily_breakdown: List[DailyReportMetric] = Field(default_factory=list)
    generated_at: datetime


class ProgressSnapshotResponse(AppBaseModel):
    """Calculated metrics snapshot of a user's progress."""

    id: str
    uid: str
    timestamp: datetime
    total_goals: int
    active_goals: int
    completed_goals: int
    total_tasks: int
    completed_tasks: int
    overall_completion_rate: float
    metrics: Dict[str, Any] = {}
