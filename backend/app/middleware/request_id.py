import uuid

from flask import Flask, g, request


def register_request_id_middleware(app: Flask) -> None:
    """Register request ID and correlation ID tracing hooks onto the Flask application."""

    @app.before_request
    def set_request_and_correlation_id() -> None:
        """Extract existing X-Request-ID or X-Correlation-ID header, or generate a new UUID4."""
        incoming_id = request.headers.get("X-Request-ID") or request.headers.get(
            "X-Correlation-ID"
        )
        if incoming_id and incoming_id.strip():
            cid = incoming_id.strip()
        else:
            cid = str(uuid.uuid4())

        g.request_id = cid
        g.correlation_id = cid

    @app.after_request
    def attach_tracing_headers(response):
        """Append X-Request-ID and X-Correlation-ID to outgoing response headers."""
        request_id = getattr(g, "request_id", None)
        if request_id:
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Correlation-ID"] = request_id
        return response
