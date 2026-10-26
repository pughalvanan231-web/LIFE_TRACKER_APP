from flask import Flask
from app.api.health import health_bp
from app.api.v1 import api_v1_bp


def register_api_routes(app: Flask) -> None:
    """Register all API route blueprints."""
    # Register unversioned infrastructure health endpoints
    app.register_blueprint(health_bp)

    # Register versioned API blueprints
    app.register_blueprint(api_v1_bp)
