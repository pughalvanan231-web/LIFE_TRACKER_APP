from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import Field
from app.schemas.common import AppBaseModel


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    NOT_COMPLETED = "not_completed"
    UNVERIFIED = "unverified"
    CANCELLED = "cancelled"


class TaskRecurrence(str, Enum):
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class RescheduleHistoryEntry(AppBaseModel):
    """Historical audit entry preserved whenever a task is rescheduled."""

    previous_date: Optional[str] = None
    new_date: str
    rescheduled_at: datetime
    reason: Optional[str] = None


class TaskCreateRequest(AppBaseModel):
    """Payload to create an actionable task, optionally linked to a goal and milestone."""

    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    goal_id: Optional[str] = Field(default=None, description="Optional parent goal ID")
    milestone_id: Optional[str] = Field(default=None, description="Optional parent milestone ID")
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    recurrence: TaskRecurrence = TaskRecurrence.NONE

    # Workload and scheduling
    estimated_duration: int = Field(
        default=30, ge=1, le=1440, description="Estimated duration in minutes (1 to 1440)"
    )
    scheduled_date: Optional[str] = Field(
        default=None, description="Scheduled date for task execution (YYYY-MM-DD)"
    )
    original_due_date: Optional[str] = Field(
        default=None, description="Initial due date before any rescheduling (YYYY-MM-DD)"
    )
    due_date: Optional[str] = Field(
        default=None, description="Alias for scheduled_date for backwards compatibility"
    )
    due_time: Optional[str] = Field(
        default=None, description="Optional specific time for task (HH:MM format, e.g. '14:30')"
    )


class TaskUpdateRequest(AppBaseModel):
    """Payload to update an existing task."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    recurrence: Optional[TaskRecurrence] = None
    estimated_duration: Optional[int] = Field(default=None, ge=1, le=1440)
    scheduled_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    is_completed: Optional[bool] = None


class TaskRescheduleRequest(AppBaseModel):
    """Payload to reschedule a task to a different date with reason tracking."""

    new_date: str = Field(description="Target new scheduled date (YYYY-MM-DD)")
    reason: Optional[str] = Field(default=None, max_length=500, description="Reason for rescheduling")
    due_time: Optional[str] = Field(default=None, description="Optional updated due time (HH:MM)")


class TaskResponse(AppBaseModel):
    """Complete representation of a user task."""

    id: str
    uid: str
    goal_id: Optional[str] = None
    milestone_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    recurrence: TaskRecurrence = TaskRecurrence.NONE

    # Duration and scheduling
    estimated_duration: int = 30
    original_due_date: Optional[str] = None
    scheduled_date: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None

    # Lifecycle state
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    reschedule_history: List[RescheduleHistoryEntry] = Field(default_factory=list)

    # Timestamps
    created_at: datetime
    updated_at: datetime


class DailyTaskInstanceResponse(AppBaseModel):
    """Snapshot record of a task scheduled for a specific calendar date."""

    id: str
    date: str
    task_id: str
    title: str
    priority: TaskPriority
    status: TaskStatus
    estimated_duration: int
    is_completed: bool = False
    due_time: Optional[str] = None
    rescheduled_to: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DailyPlanCreateRequest(AppBaseModel):
    """Payload to create or update a user's daily plan."""

    date: str = Field(description="Plan date in YYYY-MM-DD format")
    available_minutes: int = Field(
        default=480, ge=1, le=1440, description="Available working minutes for the day (e.g. 480 = 8h)"
    )
    task_ids: List[str] = Field(
        default_factory=list, description="IDs of existing tasks included in this daily plan"
    )
    tasks: Optional[List[TaskCreateRequest]] = Field(
        default=None, description="Optional new tasks to create and associate with the plan"
    )
    notes: Optional[str] = Field(default=None, max_length=2000, description="Daily planning notes")
    allow_overload: bool = Field(
        default=False, description="If True, allows plan submission even when workload exceeds available minutes"
    )


class DailyPlanResponse(AppBaseModel):
    """Daily plan record with calculated workload and task instances."""

    id: str
    uid: str
    date: str
    available_minutes: int
    total_estimated_minutes: int
    task_count: int
    completed_count: int
    completion_rate: float
    is_overloaded: bool
    overload_minutes: int
    notes: Optional[str] = None
    tasks: List[DailyTaskInstanceResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
