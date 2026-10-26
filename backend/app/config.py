import os
from dataclasses import dataclass
from typing import Dict, List, Type


class ConfigurationError(ValueError):
    """Raised when environment or runtime configuration is invalid or insecure."""
    pass


INSECURE_SECRET_KEYS = {
    "change-me-in-production-super-secret-key",
    "development-secret-key-life-goals-ai-change-in-prod",
    "test-secret-key-life-goals-ai",
    "secret",
    "password",
    "123456",
}


@dataclass
class BaseConfig:
    """Base configuration settings shared across all environments."""

    ENV: str = os.getenv("FLASK_ENV", "production")
    DEBUG: bool = False
    TESTING: bool = False

    # Security: Secret key for session signing and crypto operations
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "development-secret-key-life-goals-ai-change-in-prod",
    )

    # API Prefix
    API_PREFIX: str = os.getenv("API_PREFIX", "/api/v1")

    # CORS Configuration
    CORS_ALLOWED_ORIGINS_RAW: str = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
    )
    CORS_SUPPORTS_CREDENTIALS: bool = os.getenv(
        "CORS_SUPPORTS_CREDENTIALS", "true"
    ).lower() in ("true", "1", "yes")

    # Request limits
    MAX_CONTENT_LENGTH_BYTES: int = int(
        os.getenv("MAX_CONTENT_LENGTH_BYTES", str(1024 * 1024))
    )  # Default 1MB

    # External service timeouts (seconds)
    EXTERNAL_TIMEOUT_SECONDS: float = float(
        os.getenv("EXTERNAL_TIMEOUT_SECONDS", "10.0")
    )
    AI_TIMEOUT_SECONDS: float = float(os.getenv("AI_TIMEOUT_SECONDS", "30.0"))

    # AI Provider & Model Configuration
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "gemini").lower()
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    AI_MAX_SUGGESTIONS_PER_REQUEST: int = int(
        os.getenv("AI_MAX_SUGGESTIONS_PER_REQUEST", "10")
    )
    AI_MAX_INPUT_PROMPT_LENGTH: int = int(
        os.getenv("AI_MAX_INPUT_PROMPT_LENGTH", "2000")
    )

    # Scheduled Jobs & Google OIDC Invocation
    JOB_SECRET_KEY: str | None = os.getenv("JOB_SECRET_KEY")
    JOB_AUDIENCE: str | None = os.getenv("JOB_AUDIENCE")
    JOB_ALLOWED_SERVICE_ACCOUNTS_RAW: str = os.getenv(
        "JOB_ALLOWED_SERVICE_ACCOUNTS", ""
    )
    JOB_BATCH_SIZE: int = int(os.getenv("JOB_BATCH_SIZE", "50"))

    # Push Notifications & Reminders
    NOTIFICATION_PROVIDER: str = os.getenv("NOTIFICATION_PROVIDER", "fcm").lower()
    NOTIFICATIONS_ENABLED: bool = os.getenv(
        "NOTIFICATIONS_ENABLED", "true"
    ).lower() in ("true", "1", "yes")

    # Health & Readiness behavior
    HEALTH_REQUIRE_FIREBASE: bool = os.getenv(
        "HEALTH_REQUIRE_FIREBASE", "false"
    ).lower() in ("true", "1", "yes")

    # Rate limiting & Quotas
    RATE_LIMIT_ENABLED: bool = os.getenv(
        "RATE_LIMIT_ENABLED", "true"
    ).lower() in ("true", "1", "yes")
    RATE_LIMIT_DEFAULT_PER_MINUTE: int = int(
        os.getenv("RATE_LIMIT_DEFAULT_PER_MINUTE", "60")
    )
    RATE_LIMIT_AI_PER_MINUTE: int = int(
        os.getenv("RATE_LIMIT_AI_PER_MINUTE", "10")
    )

    # Firebase & Cloud Firestore
    FIREBASE_PROJECT_ID: str | None = os.getenv("FIREBASE_PROJECT_ID")
    FIREBASE_CREDENTIALS_PATH: str | None = os.getenv("FIREBASE_CREDENTIALS_PATH")

    # Observability & Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    JSON_LOGS: bool = os.getenv("JSON_LOGS", "false").lower() in ("true", "1", "yes")

    # Server settings
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "5000"))

    @property
    def cors_allowed_origins(self) -> List[str]:
        """Parsed list of allowed CORS origins."""
        if not self.CORS_ALLOWED_ORIGINS_RAW:
            return []
        return [
            origin.strip()
            for origin in self.CORS_ALLOWED_ORIGINS_RAW.split(",")
            if origin.strip()
        ]

    def validate(self) -> None:
        """Validate configuration rules. Subclasses override for environment-specific checks."""
        if self.MAX_CONTENT_LENGTH_BYTES <= 0:
            raise ConfigurationError("MAX_CONTENT_LENGTH_BYTES must be a positive integer.")
        if self.EXTERNAL_TIMEOUT_SECONDS <= 0:
            raise ConfigurationError("EXTERNAL_TIMEOUT_SECONDS must be positive.")
        if self.AI_TIMEOUT_SECONDS <= 0:
            raise ConfigurationError("AI_TIMEOUT_SECONDS must be positive.")


@dataclass
class DevelopmentConfig(BaseConfig):
    """Configuration for local development."""

    ENV: str = "development"
    DEBUG: bool = True
    TESTING: bool = False
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "DEBUG")


@dataclass
class TestingConfig(BaseConfig):
    """Configuration for automated test execution."""

    ENV: str = "testing"
    DEBUG: bool = False
    TESTING: bool = True
    LOG_LEVEL: str = "WARNING"
    SECRET_KEY: str = "test-secret-key-life-goals-ai-testing"
    CORS_ALLOWED_ORIGINS_RAW: str = "http://localhost:5173,http://testclient.local"
    HEALTH_REQUIRE_FIREBASE: bool = False
    AI_PROVIDER: str = "mock"
    JOB_SECRET_KEY: str = "test-job-secret-key-life-goals"
    NOTIFICATION_PROVIDER: str = "mock"


@dataclass
class ProductionConfig(BaseConfig):
    """Configuration for production deployment with strict security enforcement."""

    ENV: str = "production"
    DEBUG: bool = False
    TESTING: bool = False
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    JSON_LOGS: bool = True

    def validate(self) -> None:
        super().validate()

        # Enforce strong secret key in production
        if not self.SECRET_KEY or self.SECRET_KEY in INSECURE_SECRET_KEYS:
            raise ConfigurationError(
                "Insecure or default SECRET_KEY detected in production. A strong, random key is required."
            )
        if len(self.SECRET_KEY) < 32:
            raise ConfigurationError(
                "SECRET_KEY must be at least 32 characters in production."
            )

        # Disallow wildcard CORS origin when credentials are enabled or in production
        origins = self.cors_allowed_origins
        if not origins:
            raise ConfigurationError(
                "CORS_ALLOWED_ORIGINS must be explicitly configured in production."
            )
        if "*" in origins:
            if self.CORS_SUPPORTS_CREDENTIALS:
                raise ConfigurationError(
                    "Wildcard CORS origin ('*') is strictly forbidden when CORS_SUPPORTS_CREDENTIALS is True."
                )
            raise ConfigurationError(
                "Wildcard CORS origin ('*') is not permitted in production."
            )


CONFIG_MAP: Dict[str, Type[BaseConfig]] = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(env_name: str | None = None) -> BaseConfig:
    """Resolve, instantiate, and validate configuration based on environment name or FLASK_ENV."""
    if not env_name:
        env_name = os.getenv("FLASK_ENV", "development").lower()

    config_class = CONFIG_MAP.get(env_name, DevelopmentConfig)
    config = config_class()
    config.validate()
    return config
