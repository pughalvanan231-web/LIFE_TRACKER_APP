from dotenv import load_dotenv
from flask import Flask

from app.api import register_api_routes
from app.config import get_config
from app.extensions import firebase
from app.middleware import (
    configure_logging,
    register_cors_middleware,
    register_error_handlers,
    register_request_id_middleware,
    register_request_validation_middleware,
    register_security_headers_middleware,
)


def create_app(config_name: str | None = None) -> Flask:
    """
    Application factory for Life Goals AI Flask backend.

    Initializes:
    - Environment-based typed configuration & security validation
    - Structured, sensitive-data-redacted application logging
    - Request correlation ID tracing
    - Security headers (HSTS, CSP, Frame Options, Cache Control)
    - Origin-allowlist CORS enforcement
    - Request payload size limits & content-type validation
    - Centralized error handlers with safe 500 masking in production
    - Firebase Admin & Firestore integration
    - Versioned API & health probe blueprints
    """
    load_dotenv()

    app = Flask(__name__)

    # Load and apply configuration
    config = get_config(config_name)
    app.config.from_object(config)

    # Set Flask's internal max content length enforcement
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH_BYTES

    # 1. Observability: Structured & sanitized logging
    configure_logging(app)

    # 2. Distributed Tracing: Correlation IDs
    register_request_id_middleware(app)

    # 3. Security: HTTP security headers
    register_security_headers_middleware(app)

    # 4. Security: Environment-based CORS allowlist
    register_cors_middleware(app)

    # 5. Security: Request payload size limits & JSON integrity
    register_request_validation_middleware(app)

    # 6. Error Handling: Centralized error responses
    register_error_handlers(app)

    # 7. Cloud Extensions: Firebase / Firestore
    firebase.init_app(app)

    # 8. Routes & Blueprints
    register_api_routes(app)

    app.logger.info(
        "Life Goals AI backend initialized [Environment: %s, Debug: %s, MaxPayload: %sB]",
        app.config.get("ENV"),
        app.config.get("DEBUG"),
        app.config.get("MAX_CONTENT_LENGTH"),
    )

    return app
