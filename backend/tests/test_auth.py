from unittest.mock import patch
from flask.testing import FlaskClient
from firebase_admin import auth as firebase_auth


def test_missing_auth_header_returns_401(client: FlaskClient):
    """GET /api/v1/me without Authorization header returns HTTP 401 UNAUTHORIZED."""
    response = client.get("/api/v1/me")

    assert response.status_code == 401
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert "Authorization header is required" in data["error"]["message"]


def test_malformed_auth_header_returns_401(client: FlaskClient):
    """Authorization header without Bearer prefix returns HTTP 401 UNAUTHORIZED."""
    # Missing 'Bearer' prefix
    response = client.get("/api/v1/me", headers={"Authorization": "Token some-token-abc"})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "UNAUTHORIZED"

    # Empty token after Bearer
    response_empty = client.get("/api/v1/me", headers={"Authorization": "Bearer "})
    assert response_empty.status_code == 401
    assert response_empty.get_json()["error"]["code"] == "UNAUTHORIZED"


def test_invalid_token_returns_401(client: FlaskClient):
    """Token failing cryptographic verification returns HTTP 401 UNAUTHORIZED."""
    with patch("firebase_admin.auth.verify_id_token") as mock_verify:
        mock_verify.side_effect = firebase_auth.InvalidIdTokenError("Signature mismatch")

        response = client.get("/api/v1/me", headers={"Authorization": "Bearer invalid.mock.jwt"})
        assert response.status_code == 401
        data = response.get_json()
        assert data["success"] is False
        assert data["error"]["code"] == "UNAUTHORIZED"
        assert "invalid" in data["error"]["message"].lower()


def test_expired_token_returns_401(client: FlaskClient):
    """Expired token returns HTTP 401 UNAUTHORIZED with clear refresh message."""
    with patch("firebase_admin.auth.verify_id_token") as mock_verify:
        mock_verify.side_effect = firebase_auth.ExpiredIdTokenError("Token expired", cause=None)

        response = client.get("/api/v1/me", headers={"Authorization": "Bearer expired.mock.jwt"})
        assert response.status_code == 401
        data = response.get_json()
        assert data["success"] is False
        assert data["error"]["code"] == "UNAUTHORIZED"
        assert "expired" in data["error"]["message"].lower()


def test_revoked_token_returns_401(client: FlaskClient):
    """Revoked token returns HTTP 401 UNAUTHORIZED."""
    with patch("firebase_admin.auth.verify_id_token") as mock_verify:
        mock_verify.side_effect = firebase_auth.RevokedIdTokenError("Token has been revoked")

        response = client.get("/api/v1/me", headers={"Authorization": "Bearer revoked.mock.jwt"})
        assert response.status_code == 401
        data = response.get_json()
        assert data["success"] is False
        assert data["error"]["code"] == "UNAUTHORIZED"
        assert "revoked" in data["error"]["message"].lower()


def test_valid_token_returns_safe_user_profile(client: FlaskClient):
    """Valid Firebase token authenticates user and returns safe profile on GET /api/v1/me."""
    mock_claims = {
        "uid": "firebase_user_abc123",
        "email": "user@lifegoals.ai",
        "email_verified": True,
        "name": "Jane Goalsetter",
        "picture": "https://storage.googleapis.com/profile/jane.png",
        "auth_time": 1700000000,
        "internal_server_secret": "do_not_expose_this",
    }

    with patch("firebase_admin.auth.verify_id_token", return_value=mock_claims):
        response = client.get(
            "/api/v1/me",
            headers={"Authorization": "Bearer valid.mock.id_token"},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True

        user_data = data["data"]
        assert user_data["uid"] == "firebase_user_abc123"
        assert user_data["email"] == "user@lifegoals.ai"
        assert user_data["email_verified"] is True
        assert user_data["display_name"] == "Jane Goalsetter"
        assert user_data["photo_url"] == "https://storage.googleapis.com/profile/jane.png"

        # Security check: internal claims are omitted from safe profile
        assert "internal_server_secret" not in user_data


def test_uid_spoofing_in_query_or_body_is_ignored(client: FlaskClient):
    """Security rule: Attempting to pass a spoofed uid in query or body is strictly ignored."""
    mock_claims = {
        "uid": "real_verified_user_777",
        "email": "real@example.com",
    }

    with patch("firebase_admin.auth.verify_id_token", return_value=mock_claims):
        # Attacker attempts to claim uid 'victim_999' via query parameter
        response = client.get(
            "/api/v1/me?uid=victim_999",
            headers={"Authorization": "Bearer valid.mock.id_token"},
        )

        assert response.status_code == 200
        data = response.get_json()
        # Must derive strictly from verified token, not query param
        assert data["data"]["uid"] == "real_verified_user_777"
        assert data["data"]["uid"] != "victim_999"


def test_authorization_separation_prevents_cross_user_access(client: FlaskClient):
    """A valid token for User A must NOT grant access to User B's resource (403 Forbidden)."""
    user_a_claims = {
        "uid": "user_a_123",
        "email": "usera@example.com",
    }

    with patch("firebase_admin.auth.verify_id_token", return_value=user_a_claims):
        headers = {"Authorization": "Bearer user_a.mock.token"}

        # 1. User A accessing User A's data -> 200 OK
        resp_own = client.get("/api/v1/users/user_a_123/data", headers=headers)
        assert resp_own.status_code == 200
        assert resp_own.get_json()["success"] is True

        # 2. User A accessing User B's data -> 403 Forbidden
        resp_other = client.get("/api/v1/users/user_b_victim_456/data", headers=headers)
        assert resp_other.status_code == 403
        data_other = resp_other.get_json()
        assert data_other["success"] is False
        assert data_other["error"]["code"] == "FORBIDDEN"
        assert "another user" in data_other["error"]["message"].lower()
