import json
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict
from urllib.parse import parse_qs, urlencode, urlparse

from flask import Flask, g, has_request_context, request

SENSITIVE_KEYS = {
    "authorization",
    "password",
    "secret",
    "api_key",
    "apikey",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "private_key",
    "credentials",
    "service_account",
    "client_secret",
}


def sanitize_value(key: str, value: Any) -> Any:
    """Redact sensitive keys or values containing auth tokens."""
    if any(sensitive in key.lower() for sensitive in SENSITIVE_KEYS):
        return "[REDACTED]"
    if isinstance(value, dict):
        return sanitize_dict(value)
    if isinstance(value, list):
        return [sanitize_value(key, item) for item in value]
    if isinstance(value, str) and (value.lower().startswith("bearer ") or "eyj" in value.lower()):
        return "[REDACTED]"
    return value


def sanitize_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively redact sensitive key-value pairs from dictionaries."""
    sanitized = {}
    for k, v in data.items():
        if any(sensitive in k.lower() for sensitive in SENSITIVE_KEYS):
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_dict(v)
        elif isinstance(v, list):
            sanitized[k] = [sanitize_dict(item) if isinstance(item, dict) else item for item in v]
        else:
            sanitized[k] = v
    return sanitized


def sanitize_url(raw_url: str) -> str:
    """Sanitize sensitive parameters from URL query strings."""
    parsed = urlparse(raw_url)
    if not parsed.query:
        return parsed.path

    query_params = parse_qs(parsed.query, keep_blank_values=True)
    sanitized_params = {}
    for param_name, param_values in query_params.items():
        if any(sensitive in param_name.lower() for sensitive in SENSITIVE_KEYS):
            sanitized_params[param_name] = ["[REDACTED]"]
        else:
            sanitized_params[param_name] = param_values

    sanitized_query = urlencode(sanitized_params, doseq=True)
    return f"{parsed.path}?{sanitized_query}"


class StructuredJsonFormatter(logging.Formatter):
    """JSON formatter for structured application logging with sensitive data redaction."""

    def format(self, record: logging.LogRecord) -> str:
        log_payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }

        # Attach request tracing context if within Flask request lifecycle
        if has_request_context():
            request_id = getattr(g, "request_id", None)
            if request_id:
                log_payload["request_id"] = request_id
            log_payload["path"] = sanitize_url(request.full_path if request.query_string else request.path)
            log_payload["method"] = request.method

        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)

        # Sanitize any extra dictionary fields attached to the log record
        extra_fields = {
            k: v
            for k, v in record.__dict__.items()
            if k not in logging.LogRecord.__dict__ and not k.startswith("_")
        }
        if extra_fields:
            log_payload["extra"] = sanitize_dict(extra_fields)

        return json.dumps(log_payload, default=str)


def configure_logging(app: Flask) -> None:
    """Configure structured logging with strict sensitive data redaction."""
    log_level = getattr(logging, app.config.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    if app.config.get("JSON_LOGS", False):
        handler.setFormatter(StructuredJsonFormatter())
    else:
        plain_format = "%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
        handler.setFormatter(logging.Formatter(plain_format))

    root_logger.addHandler(handler)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)

    access_logger = logging.getLogger("app.access")

    @app.before_request
    def record_request_start():
        g.request_start_time = time.perf_counter()

    @app.after_request
    def log_request_completion(response):
        # Skip noisy polling for health checks in production if successful
        is_health = request.path.startswith("/health")
        if is_health and response.status_code < 400 and app.config.get("ENV") == "production":
            return response

        start_time = getattr(g, "request_start_time", None)
        duration_ms = None
        if start_time is not None:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        safe_path = sanitize_url(request.full_path if request.query_string else request.path)
        access_logger.info(
            "%s %s %s (%sms)",
            request.method,
            safe_path,
            response.status_code,
            duration_ms if duration_ms is not None else 0.0,
        )
        return response
