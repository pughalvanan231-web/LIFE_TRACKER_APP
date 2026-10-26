from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import Field, model_validator
from app.schemas.common import AppBaseModel


class GoalCategory(str, Enum):
    CAREER = "career"
    HEALTH = "health"
    FINANCE = "finance"
    RELATIONSHIPS = "relationships"
    PERSONAL_GROWTH = "personal_growth"
    LIFESTYLE = "lifestyle"
    OTHER = "other"


class GoalStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    ARCHIVED = "archived"


class GoalPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class GoalTimeframe(str, Enum):
    SHORT_TERM = "short_term"    # Typically < 3 months
    MEDIUM_TERM = "medium_term"  # 3 - 12 months
    LONG_TERM = "long_term"      # 1+ years


class DateHistoryEntry(AppBaseModel):
    """Audit entry preserving historical changes to goal deadlines."""

    previous_target_date: Optional[str] = None
    new_target_date: Optional[str] = None
    changed_at: datetime
    reason: Optional[str] = None


class GoalCreateRequest(AppBaseModel):
    """Payload to create a new user goal."""

    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: GoalCategory = GoalCategory.PERSONAL_GROWTH
    priority: GoalPriority = GoalPriority.MEDIUM
    timeframe: GoalTimeframe = GoalTimeframe.SHORT_TERM

    # Timeline dates
    start_date: Optional[str] = Field(default=None, description="ISO-8601 start date (YYYY-MM-DD)")
    target_date: Optional[str] = Field(default=None, description="ISO-8601 target completion deadline (YYYY-MM-DD)")

    # Measurable metrics
    target_value: Optional[float] = Field(default=None, ge=0, description="Quantitative target (e.g. 10.0)")
    current_value: Optional[float] = Field(default=0.0, ge=0, description="Current progress metric")
    unit: Optional[str] = Field(default=None, max_length=50, description="Metric unit (e.g. 'kg', 'pages', '$')")

    @model_validator(mode="after")
    def validate_dates_order(self):
        """Ensure start_date <= target_date if both are specified."""
        if self.start_date and self.target_date:
            if self.start_date > self.target_date:
                raise ValueError("start_date cannot be after target_date.")
        return self


class GoalUpdateRequest(AppBaseModel):
    """Payload to update an existing goal."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[GoalCategory] = None
    priority: Optional[GoalPriority] = None
    timeframe: Optional[GoalTimeframe] = None
    status: Optional[GoalStatus] = None

    start_date: Optional[str] = None
    target_date: Optional[str] = None
    date_change_reason: Optional[str] = Field(default=None, max_length=500, description="Reason for deadline change")

    target_value: Optional[float] = Field(default=None, ge=0)
    current_value: Optional[float] = Field(default=None, ge=0)
    unit: Optional[str] = Field(default=None, max_length=50)

    progress_percentage: Optional[int] = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_dates_order(self):
        """Ensure start_date <= target_date if both are updated."""
        if self.start_date and self.target_date:
            if self.start_date > self.target_date:
                raise ValueError("start_date cannot be after target_date.")
        return self


class GoalResponse(AppBaseModel):
    """Complete representation of a user goal."""

    id: str
    uid: str
    title: str
    description: Optional[str] = None
    category: GoalCategory
    priority: GoalPriority
    timeframe: GoalTimeframe = GoalTimeframe.SHORT_TERM
    status: GoalStatus

    start_date: Optional[str] = None
    target_date: Optional[str] = None

    target_value: Optional[float] = None
    current_value: float = 0.0
    unit: Optional[str] = None

    progress_percentage: int = 0
    date_history: List[DateHistoryEntry] = []

    archived_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
