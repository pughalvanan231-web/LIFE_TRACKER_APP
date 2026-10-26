import logging
import os
from typing import Any, Dict, Optional
from flask import Flask

from app.exceptions import ServiceUnavailableError, UnauthorizedError

logger = logging.getLogger("app.extensions.firebase")


class FirebaseExtension:
    """Manages Firebase Admin SDK, Authentication, and Cloud Firestore client lifecycle."""

    def __init__(self, app: Optional[Flask] = None):
        self.app = app
        self._firebase_app: Optional[Any] = None
        self._db: Optional[Any] = None
        self.is_initialized: bool = False

        if app is not None:
            self.init_app(app)

    def init_app(self, app: Flask) -> None:
        """Initialize Firebase Admin and Firestore client if credentials are provided."""
        self.app = app
        creds_path = app.config.get("FIREBASE_CREDENTIALS_PATH")
        project_id = app.config.get("FIREBASE_PROJECT_ID")

        # Allow basic application execution & test suites without requiring credentials
        if not creds_path and not project_id:
            logger.info("Firebase credentials not configured. Firebase running in mock/uninitialized mode.")
            self.is_initialized = False
            return

        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            # Check if default app is already initialized
            try:
                self._firebase_app = firebase_admin.get_app()
                self.is_initialized = True
            except ValueError:
                options: Dict[str, Any] = {}
                if project_id:
                    options["projectId"] = project_id

                if creds_path and os.path.exists(creds_path):
                    cred = credentials.Certificate(creds_path)
                    self._firebase_app = firebase_admin.initialize_app(cred, options=options)
                else:
                    # Fallback to Application Default Credentials
                    self._firebase_app = firebase_admin.initialize_app(options=options)

                self.is_initialized = True

            self._db = firestore.client(app=self._firebase_app)
            logger.info("Firebase Admin and Cloud Firestore initialized successfully.")

        except Exception as e:
            logger.warning(
                "Firebase initialization skipped or failed: %s. Application will start in standalone mode.",
                str(e),
            )
            self.is_initialized = False
            self._db = None

    @property
    def db(self) -> Optional[Any]:
        """Accessor for the Cloud Firestore client."""
        return self._db

    def verify_token(self, id_token: str, check_revoked: bool = False) -> Dict[str, Any]:
        """
        Verify a Firebase ID token using the Firebase Admin SDK.
        
        Raises:
            UnauthorizedError: if the token is expired, revoked, or invalid.
            ServiceUnavailableError: if Firebase Admin is uninitialized or keys are unreachable.
        """
        if not id_token or not isinstance(id_token, str) or not id_token.strip():
            raise UnauthorizedError("Authentication token cannot be empty.")

        try:
            from firebase_admin import auth

            return auth.verify_id_token(
                id_token.strip(),
                app=self._firebase_app,
                check_revoked=check_revoked,
            )
        except ImportError as e:
            logger.error("firebase_admin library not available: %s", str(e))
            raise ServiceUnavailableError("Authentication service is unavailable.") from e
        except auth.ExpiredIdTokenError as e:
            logger.info("ID token expired: %s", str(e))
            raise UnauthorizedError("Firebase ID token has expired. Please refresh your session.") from e
        except auth.RevokedIdTokenError as e:
            logger.warning("ID token revoked: %s", str(e))
            raise UnauthorizedError("Firebase ID token has been revoked.") from e
        except auth.InvalidIdTokenError as e:
            logger.info("Invalid ID token: %s", str(e))
            raise UnauthorizedError("Firebase ID token is invalid.") from e
        except auth.CertificateFetchError as e:
            logger.error("Failed to fetch public certificates from Google: %s", str(e))
            raise ServiceUnavailableError("Authentication provider certificates temporarily unreachable.") from e
        except ValueError as e:
            logger.info("Token validation ValueError: %s", str(e))
            raise UnauthorizedError(f"Invalid token format: {str(e)}") from e
        except Exception as e:
            logger.warning("Unexpected token verification error: %s", str(e))
            raise UnauthorizedError("Authentication token verification failed.") from e

    def check_health(self) -> Dict[str, str]:
        """
        Check Firebase connectivity status safely.
        Never exposes keys, credentials paths, or private project identifiers.
        """
        if not self.is_initialized or self._db is None:
            return {"status": "not_configured"}

        try:
            return {"status": "configured"}
        except Exception:
            return {"status": "unavailable"}


firebase = FirebaseExtension()
