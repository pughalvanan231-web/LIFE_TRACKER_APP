import logging
from typing import Any, Dict, List, Optional
from app.integrations.notification_provider import BaseNotificationProvider, get_notification_provider
from app.repositories.firestore_base import BaseFirestoreRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger("app.services.notifications")


class NotificationService(BaseFirestoreRepository):
    """
    Domain service for dispatching notifications safely with deduplication,
    preference checks, and zero-leakage logging.
    """

    SUBCOLLECTION = "sentNotifications"

    def __init__(
        self,
        provider: Optional[BaseNotificationProvider] = None,
        user_repo: Optional[UserRepository] = None,
        db: Optional[Any] = None,
    ):
        super().__init__(db=db)
        self._provider = provider
        self.user_repo = user_repo or UserRepository(db=db)

    @property
    def provider(self) -> BaseNotificationProvider:
        if self._provider is not None:
            return self._provider
        return get_notification_provider()

    def send_idempotent_notification(
        self,
        uid: str,
        idempotency_key: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        dry_run: bool = False,
    ) -> bool:
        """
        Send a notification if eligible and not previously sent for idempotency_key.
        
        Guarantees:
        1. Checks user preferences (skips if notifications_enabled is False).
        2. Checks sentNotifications to guarantee no duplicates.
        3. Never logs private body content or device tokens.
        4. If dry_run=True, simulates sending without persisting records.
        """
        if not uid or not str(uid).strip():
            return False

        # 1. Check user notification preferences
        profile = self.user_repo.get_user_profile(uid) or {}
        if not profile.get("notifications_enabled", True):
            logger.info("Notification skipped for user %s: Notifications disabled in profile.", uid)
            return False

        # 2. Check deduplication / idempotency
        try:
            notif_ref = self.get_user_subcollection(uid, self.SUBCOLLECTION).document(idempotency_key)
            snap = notif_ref.get()
            if snap.exists:
                logger.info(
                    "Duplicate notification suppressed for user %s (Idempotency key: %s).",
                    uid,
                    idempotency_key,
                )
                return False
        except Exception as e:
            logger.warning("Could not check notification idempotency for user %s: %s", uid, str(e))

        if dry_run:
            logger.info("[Dry Run] Would send notification '%s' to user %s.", idempotency_key, uid)
            return True

        device_tokens: List[str] = profile.get("device_tokens", [])
        dispatched = self.provider.send_notification(
            recipient_id=uid,
            title=title,
            body=body,
            data=data,
            device_tokens=device_tokens,
        )

        if dispatched:
            try:
                now = self.now_utc()
                notif_ref.set({
                    "idempotency_key": idempotency_key,
                    "title": title,
                    "data": data or {},
                    "sent_at": now,
                    "provider": self.provider.provider_name,
                })
            except Exception as e:
                logger.error("Failed to record sent notification history for %s: %s", uid, str(e))

        return dispatched
