import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from flask import current_app

from app.exceptions import ServiceUnavailableError
from app.extensions import firebase

logger = logging.getLogger("app.integrations.notifications")


class BaseNotificationProvider(ABC):
    """Abstract interface for provider-independent push and alert dispatching."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the notification dispatch provider."""
        pass

    @abstractmethod
    def send_notification(
        self,
        recipient_id: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        device_tokens: Optional[List[str]] = None,
    ) -> bool:
        """
        Send an alert notification to the designated recipient.
        SECURITY: Implementations must NEVER log private message body or device tokens.
        """
        pass


class FirebaseCloudMessagingProvider(BaseNotificationProvider):
    """
    Firebase Cloud Messaging (FCM) dispatch provider.
    Verifies Firebase Admin SDK credentials and ensures zero private message or token logging.
    """

    @property
    def provider_name(self) -> str:
        return "fcm"

    def send_notification(
        self,
        recipient_id: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        device_tokens: Optional[List[str]] = None,
    ) -> bool:
        if not firebase.is_initialized:
            logger.warning("FCM provider skipped dispatch: Firebase is not initialized.")
            return False

        if not device_tokens:
            logger.info("FCM dispatch skipped: User %s has no registered device tokens.", recipient_id)
            return False

        try:
            from firebase_admin import messaging

            # Construct safe notification without logging private payload
            multicast = messaging.MulticastMessage(
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
                tokens=device_tokens,
            )
            response = messaging.send_each_for_multicast(multicast)
            logger.info(
                "FCM multicast dispatch completed for user %s: %s success, %s failure.",
                recipient_id,
                response.success_count,
                response.failure_count,
            )
            return response.success_count > 0
        except Exception as e:
            logger.error("FCM dispatch failure for user %s: %s", recipient_id, str(e))
            return False


class MockNotificationProvider(BaseNotificationProvider):
    """
    In-memory mock notification provider for testing and offline local development.
    Preserves audit history for test assertions without network calls.
    """

    def __init__(self):
        self.sent_dispatches: List[Dict[str, Any]] = []

    @property
    def provider_name(self) -> str:
        return "mock"

    def send_notification(
        self,
        recipient_id: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        device_tokens: Optional[List[str]] = None,
    ) -> bool:
        self.sent_dispatches.append({
            "recipient_id": recipient_id,
            "title": title,
            "body": body,
            "data": data or {},
            "token_count": len(device_tokens) if device_tokens else 0,
        })
        # Log metadata only, never raw body or tokens
        logger.info(
            "Mock alert dispatched to user %s (Data keys: %s)",
            recipient_id,
            list((data or {}).keys()),
        )
        return True

    def clear(self) -> None:
        """Clear sent dispatches audit log for test isolation."""
        self.sent_dispatches.clear()


def get_notification_provider(provider_type: Optional[str] = None) -> BaseNotificationProvider:
    """Factory to resolve configured notification provider instance."""
    resolved_type = (
        provider_type
        or (current_app.config.get("NOTIFICATION_PROVIDER") if current_app else "fcm")
        or "fcm"
    ).lower()

    if resolved_type == "mock":
        return MockNotificationProvider()
    elif resolved_type == "fcm":
        return FirebaseCloudMessagingProvider()
    else:
        raise ServiceUnavailableError(f"Unsupported notification provider '{resolved_type}'.")
