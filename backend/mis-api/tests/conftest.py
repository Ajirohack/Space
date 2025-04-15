import os
import sys
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

# Add the parent directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app

# Update the base URL for tests to point to the correct backend URL
BASE_URL = "http://localhost:3000"

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def test_app():
    return app

@pytest.fixture
def mock_supabase():
    mock = AsyncMock()
    return mock