from abc import ABC, abstractmethod
from typing import Any, Dict, Generic, List, Optional, TypeVar

T = TypeVar("T")


class BaseRepository(ABC, Generic[T]):
    """Abstract base repository defining CRUD contracts for persistence."""

    @abstractmethod
    def get_by_id(self, entity_id: str) -> Optional[T]:
        """Retrieve a single entity by its unique ID."""
        pass

    @abstractmethod
    def list_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        """List entities with pagination."""
        pass

    @abstractmethod
    def create(self, data: Dict[str, Any]) -> T:
        """Create and store a new entity."""
        pass

    @abstractmethod
    def update(self, entity_id: str, data: Dict[str, Any]) -> Optional[T]:
        """Update an existing entity."""
        pass

    @abstractmethod
    def delete(self, entity_id: str) -> bool:
        """Delete an entity by its unique ID."""
        pass
