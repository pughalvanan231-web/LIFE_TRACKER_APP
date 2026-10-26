from datetime import datetime
from typing import List, Optional
from pydantic import Field
from app.schemas.common import AppBaseModel
from app.schemas.goal import DateHistoryEntry


class MilestoneCreateRequest(AppBaseModel):
    """Payload to create a milestone under a specific goal."""

    goal_id: Optional[str] = Field(default=None, description="Parent goal ID if supplied in body")
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    target_date: Optional[str] = Field(default=None, description="ISO-8601 target completion date (YYYY-MM-DD)")
    order: int = Field(default=0, ge=0)
    weight: float = Field(
        default=1.0,
        gt=0,
        le=100.0,
        description="Relative weight for progress contribution towards parent goal",
    )


class MilestoneUpdateRequest(AppBaseModel):
    """Payload to update an existing milestone."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    target_date: Optional[str] = None
    order: Optional[int] = Field(default=None, ge=0)
    weight: Optional[float] = Field(default=None, gt=0, le=100.0)
    is_completed: Optional[bool] = None
    date_change_reason: Optional[str] = Field(default=None, max_length=500)


class MilestoneResponse(AppBaseModel):
    """Complete representation of a goal milestone."""

    id: str
    uid: str
    goal_id: str
    title: str
    description: Optional[str] = None
    target_date: Optional[str] = None
    order: int = 0
    weight: float = 1.0
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    date_history: List[DateHistoryEntry] = []
    created_at: datetime
    updated_at: datetime
