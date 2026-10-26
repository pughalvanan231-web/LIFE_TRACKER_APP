from datetime import datetime
from typing import Dict, Generic, List, Optional, TypeVar
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class AppBaseModel(BaseModel):
    """Base Pydantic model with strict parsing and snake_case alias options."""

    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
        arbitrary_types_allowed=True,
    )


class ResponseMeta(AppBaseModel):
    """Standardized metadata envelope for responses."""

    timestamp: datetime
    request_id: Optional[str] = None


class StandardResponse(AppBaseModel, Generic[T]):
    """Standard success API response schema."""

    success: bool = True
    message: str = "Success"
    data: Optional[T] = None
    meta: ResponseMeta


class ErrorDetail(AppBaseModel):
    """Individual field validation error detail."""

    field: str
    message: str
    type: str = "value_error"


class ErrorPayload(AppBaseModel):
    """Standardized error envelope payload."""

    code: str
    message: str
    details: Optional[List[ErrorDetail]] = None


class StandardErrorResponse(AppBaseModel):
    """Standard error API response schema."""

    success: bool = False
    error: ErrorPayload
    meta: ResponseMeta


class HealthStatusData(AppBaseModel):
    """Health check status payload schema."""

    status: str
    checks: Optional[Dict[str, str]] = None
