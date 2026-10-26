import pytest
from flask import Flask
from flask.testing import FlaskClient

from app.config import ConfigurationError, ProductionConfig
from app.middleware.logging import sanitize_dict, sanitize_url
from app.services.rate_limiter import rate_limiter


def test_production_config_rejects_insecure_secret_key():
    """ProductionConfig must reject default or short secret keys."""
    config = ProductionConfig()
    config.SECRET_KEY = "development-secret-key-life-goals-ai-change-in-prod"
    config.CORS_ALLOWED_ORIGINS_RAW = "https://app.lifegoals.ai"

    with pytest.raises(ConfigurationError, match="Insecure or default SECRET_KEY"):
        config.validate()

    # Short secret key
    config.SECRET_KEY = "too-short-key"
    with pytest.raises(ConfigurationError, match="at least 32 characters"):
        config.validate()

    # Valid secret key (>= 32 chars)
    config.SECRET_KEY = "a-very-long-and-cryptographically-secure-random-production-key-32chars"
    config.validate()  # Passes without raising


def test_production_config_rejects_wildcard_cors():
    """ProductionConfig must forbid wildcard origins when credentials are enabled."""
    config = ProductionConfig()
    config.SECRET_KEY = "a-very-long-and-cryptographically-secure-random-production-key-32chars"
    config.CORS_ALLOWED_ORIGINS_RAW = "*"
    config.CORS_SUPPORTS_CREDENTIALS = True

    with pytest.raises(ConfigurationError, match="strictly forbidden"):
        config.validate()


def test_cors_preflight_allowed_origin(client: FlaskClient):
    """OPTIONS preflight with allowed origin returns HTTP 204 with full CORS headers."""
    response = client.open(
        "/api/v1/info",
        method="OPTIONS",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 204
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
    assert response.headers.get("Access-Control-Allow-Credentials") == "true"
    assert "GET" in response.headers.get("Access-Control-Allow-Methods", "")
    assert "Authorization" in response.headers.get("Access-Control-Allow-Headers", "")


def test_cors_preflight_disallowed_origin(client: FlaskClient):
    """OPTIONS preflight with disallowed origin returns HTTP 403 Forbidden with standard error."""
    response = client.open(
        "/api/v1/info",
        method="OPTIONS",
        headers={"Origin": "https://malicious-attacker-website.com"},
    )

    assert response.status_code == 403
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "CORS_FORBIDDEN"
    assert "Access-Control-Allow-Origin" not in response.headers


def test_cors_actual_request_allowed_origin(client: FlaskClient):
    """Actual GET request from allowed origin attaches Access-Control-Allow-Origin."""
    response = client.get("/api/v1/info", headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 200
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
    assert response.headers.get("Access-Control-Allow-Credentials") == "true"


def test_cors_actual_request_disallowed_origin(client: FlaskClient):
    """Actual GET request from disallowed origin does not receive Access-Control headers."""
    response = client.get(
        "/api/v1/info", headers={"Origin": "https://malicious-attacker-website.com"}
    )

    assert response.status_code == 200
    assert "Access-Control-Allow-Origin" not in response.headers


def test_security_headers_present(client: FlaskClient):
    """Responses must include mandatory security headers for JSON APIs."""
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "default-src 'none'" in response.headers.get("Content-Security-Policy", "")
    assert response.headers.get("X-XSS-Protection") == "0"
    assert "strict-origin" in response.headers.get("Referrer-Policy", "")
    assert "no-store" in response.headers.get("Cache-Control", "")
    assert "camera=()" in response.headers.get("Permissions-Policy", "")


def test_oversized_payload_rejected(client: FlaskClient):
    """Payloads exceeding maximum content length return HTTP 413 with consistent error JSON."""
    # Create payload exceeding 1MB (1048576 bytes)
    oversized_data = '{"data": "' + ("A" * (1024 * 1024 + 50)) + '"}'
    response = client.post(
        "/api/v1/ai/quota-check",
        data=oversized_data,
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "REQUEST_TOO_LARGE"


def test_malformed_json_syntax(client: FlaskClient):
    """Invalid JSON syntax returns HTTP 400 MALFORMED_JSON."""
    response = client.post(
        "/api/v1/ai/quota-check",
        data="{malformed_json_payload: not_valid,",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "MALFORMED_JSON"


def test_unsupported_media_type(client: FlaskClient):
    """POSTing non-JSON data to a JSON endpoint returns HTTP 415 UNSUPPORTED_MEDIA_TYPE."""
    response = client.post(
        "/api/v1/ai/quota-check",
        data="plain text data",
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 415
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_correlation_id_propagation(client: FlaskClient):
    """Incoming X-Correlation-ID is extracted, bound to context, and echoed back."""
    test_cid = "corr-id-test-trace-9999"
    response = client.get("/health/live", headers={"X-Correlation-ID": test_cid})

    assert response.status_code == 200
    assert response.headers.get("X-Correlation-ID") == test_cid
    assert response.headers.get("X-Request-ID") == test_cid
    data = response.get_json()
    assert data["meta"]["request_id"] == test_cid


def test_safe_logging_data_redaction():
    """Sensitive keys in dictionaries and tokens in URLs must be redacted."""
    sensitive_payload = {
        "user_email": "user@example.com",
        "password": "SuperSecretPassword123",
        "api_key": "ai-key-live-12345",
        "authorization": "Bearer eyJhbGciOi...",
        "profile": {
            "token": "refresh-token-xyz",
            "service_account": {"private_key": "-----BEGIN KEY-----"},
        },
    }

    sanitized = sanitize_dict(sensitive_payload)

    assert sanitized["user_email"] == "user@example.com"
    assert sanitized["password"] == "[REDACTED]"
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["authorization"] == "[REDACTED]"
    assert sanitized["profile"]["token"] == "[REDACTED]"
    assert sanitized["profile"]["service_account"] == "[REDACTED]"

    # URL query parameter redaction
    url = "/api/v1/test?token=secret123&apiKey=key456&page=2"
    sanitized_url = sanitize_url(url)
    assert "token=%5BREDACTED%5D" in sanitized_url or "token=%5B" in sanitized_url
    assert "apiKey=%5BREDACTED%5D" in sanitized_url or "apiKey=%5B" in sanitized_url
    assert "page=2" in sanitized_url


def test_ai_quota_rate_limiting(client: FlaskClient):
    """Repeated calls to rate-limited AI endpoints trigger HTTP 429 with Retry-After header."""
    rate_limiter.reset()

    # Limit is 10 per minute on /api/v1/ai/quota-check
    for _ in range(10):
        res = client.post(
            "/api/v1/ai/quota-check",
            json={"goal": "Learn Python"},
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 200

    # 11th request should exceed quota
    blocked_res = client.post(
        "/api/v1/ai/quota-check",
        json={"goal": "Learn Python"},
        headers={"Content-Type": "application/json"},
    )
    assert blocked_res.status_code == 429
    blocked_data = blocked_res.get_json()
    assert blocked_data["success"] is False
    assert blocked_data["error"]["code"] == "TOO_MANY_REQUESTS"
    assert "Retry-After" in blocked_res.headers
    assert int(blocked_res.headers["Retry-After"]) >= 1


def test_configurable_readiness_probe(app: Flask, client: FlaskClient):
    """Readiness probe behavior can be configured to require or not require Firebase."""
    # When HEALTH_REQUIRE_FIREBASE is False (default) -> 200 Ready
    app.config["HEALTH_REQUIRE_FIREBASE"] = False
    res_ready = client.get("/health/ready")
    assert res_ready.status_code == 200
    assert res_ready.get_json()["data"]["status"] == "ready"

    # When HEALTH_REQUIRE_FIREBASE is True -> 503 Service Degraded if unconfigured
    app.config["HEALTH_REQUIRE_FIREBASE"] = True
    res_degraded = client.get("/health/ready")
    assert res_degraded.status_code == 503
    degraded_data = res_degraded.get_json()
    assert degraded_data["success"] is False
    assert degraded_data["error"]["code"] == "SERVICE_DEGRADED"

    # Reset
    app.config["HEALTH_REQUIRE_FIREBASE"] = False
