from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import Field
from app.schemas.common import AppBaseModel


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TaskRecurrence(str, Enum):
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class TaskCreateRequest(AppBaseModel):
    """Payload to create an actionable task, optionally linked to a goal and milestone."""

    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    goal_id: Optional[str] = Field(default=None, description="Optional parent goal ID")
    milestone_id: Optional[str] = Field(default=None, description="Optional parent milestone ID")
    priority: TaskPriority = TaskPriority.MEDIUM
    recurrence: TaskRecurrence = TaskRecurrence.NONE
    due_date: Optional[str] = None


class TaskUpdateRequest(AppBaseModel):
    """Payload to update an existing task."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    priority: Optional[TaskPriority] = None
    recurrence: Optional[TaskRecurrence] = None
    is_completed: Optional[bool] = None
    due_date: Optional[str] = None


class TaskResponse(AppBaseModel):
    """Complete representation of a user task."""

    id: str
    uid: str
    goal_id: Optional[str] = None
    milestone_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: TaskPriority
    recurrence: TaskRecurrence
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    due_date: Optional[str] = None
    created_at: datetime
    updated_at: datetime
