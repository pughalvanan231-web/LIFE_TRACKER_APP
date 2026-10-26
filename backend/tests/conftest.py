import pytest
from flask import Flask
from flask.testing import FlaskClient

from app import create_app


@pytest.fixture
def app() -> Flask:
    """Create and configure an application instance for testing."""
    test_app = create_app("testing")
    return test_app


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    """A test client for making HTTP requests to the app."""
    return app.test_client()


@pytest.fixture
def runner(app: Flask):
    """A test runner for the app's Click commands."""
    return app.test_cli_runner()
