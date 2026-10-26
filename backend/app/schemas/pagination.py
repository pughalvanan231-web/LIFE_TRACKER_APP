from typing import Generic, List, TypeVar

from app.schemas.common import AppBaseModel

T = TypeVar("T")


class PaginatedListResponse(AppBaseModel, Generic[T]):
    """Standard pagination envelope for collection listings."""

    items: List[T]
    total_count: int
    page: int
    limit: int
    total_pages: int
    has_next: bool
    has_previous: bool
