from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import Field
from app.schemas.common import AppBaseModel


class DailyReviewCreateRequest(AppBaseModel):
    """Payload to record a daily reflective review."""

    date: str = Field(description="Date string YYYY-MM-DD")
    summary: str = Field(min_length=1, max_length=2000)
    wins: Optional[str] = Field(default=None, max_length=1000)
    challenges: Optional[str] = Field(default=None, max_length=1000)
    rating: int = Field(ge=1, le=5, description="Day rating from 1 to 5")


class DailyReviewResponse(AppBaseModel):
    """Representation of a daily review."""

    id: str
    uid: str
    date: str
    summary: str
    wins: Optional[str] = None
    challenges: Optional[str] = None
    rating: int
    created_at: datetime


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
