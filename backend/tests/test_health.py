from flask.testing import FlaskClient
from pydantic import BaseModel, Field


def test_liveness_probe(client: FlaskClient):
    """GET /health/live returns HTTP 200 with standard alive status and request ID."""
    response = client.get("/health/live")

    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["message"] == "Service is alive"
    assert data["data"]["status"] == "alive"

    # Header and meta tracing checks
    assert "X-Request-ID" in response.headers
    assert data["meta"]["request_id"] == response.headers["X-Request-ID"]
    assert "timestamp" in data["meta"]


def test_readiness_probe_without_firebase(client: FlaskClient):
    """GET /health/ready returns 200 and does NOT leak internal credentials or fail without Firebase."""
    response = client.get("/health/ready")

    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["data"]["status"] == "ready"
    assert data["data"]["checks"]["app"] == "ok"
    assert data["data"]["checks"]["firebase"] in ("not_configured", "configured")

    # Security check: verify no secrets or internal credential paths are exposed
    json_str = str(data).lower()
    for sensitive_keyword in ["private_key", "client_secret", "service_account", "password", "token"]:
        assert sensitive_keyword not in json_str


def test_request_id_tracing_custom_header(client: FlaskClient):
    """Verify incoming X-Request-ID is preserved across request lifecycle and headers."""
    custom_id = "test-custom-tracing-uuid-98765"
    response = client.get("/health/live", headers={"X-Request-ID": custom_id})

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == custom_id
    data = response.get_json()
    assert data["meta"]["request_id"] == custom_id


def test_api_v1_info_endpoint(client: FlaskClient):
    """GET /api/v1/info returns versioned API info in consistent JSON envelope."""
    response = client.get("/api/v1/info")

    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["data"]["version"] == "v1"
    assert data["data"]["api"] == "Life Goals AI API"


def test_centralized_not_found_error(client: FlaskClient):
    """Verify 404 responses follow standardized JSON error schema with request ID."""
    response = client.get("/api/v1/non-existent-endpoint")

    assert response.status_code == 404
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "NOT_FOUND"
    assert "X-Request-ID" in response.headers
    assert data["meta"]["request_id"] == response.headers["X-Request-ID"]


def test_pydantic_validation_error_handling(app, client: FlaskClient):
    """Verify Pydantic validation failures return structured 422 errors."""

    class SamplePayload(BaseModel):
        title: str
        target_score: int = Field(ge=1, le=100)

    @app.route("/test/validate", methods=["POST"])
    def validate_endpoint():
        from flask import request
        # Trigger Pydantic validation
        SamplePayload.model_validate(request.get_json() or {})
        return {"ok": True}

    # Missing fields & invalid score
    response = client.post("/test/validate", json={"target_score": 150})
    assert response.status_code == 422
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert isinstance(data["error"]["details"], list)
    assert len(data["error"]["details"]) > 0
