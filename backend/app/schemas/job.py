from typing import Optional

from pydantic import BaseModel, Field


class JobExecutionRequest(BaseModel):
    """Payload to trigger or simulate a scheduled background job."""

    dry_run: bool = Field(
        default=False,
        description="Simulate job execution without persisting state changes or sending push alerts",
    )
    simulated_now: Optional[str] = Field(
        default=None,
        description="Simulated reference UTC time in ISO format (e.g. 2026-10-27T00:05:00Z)",
    )
    batch_size: int = Field(
        default=50,
        ge=1,
        le=500,
        description="Maximum users to process per batch iteration",
    )
    single_user_id: Optional[str] = Field(
        default=None,
        description="Optional single user UID to process (useful for targeted debugging and tests)",
    )


class JobExecutionResponse(BaseModel):
    """Execution audit summary returned by the scheduled job pipeline."""

    status: str
    dry_run: bool
    simulated_now: Optional[str] = None
    reference_utc: str
    users_processed: int
    reviews_closed: int
    tasks_marked_unverified: int
    overdue_goals_detected: int
    overdue_milestones_detected: int
    summaries_prepared: int
    notifications_dispatched: int
    execution_duration_ms: int
