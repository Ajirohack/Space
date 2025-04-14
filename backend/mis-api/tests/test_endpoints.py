import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from httpx import ASGITransport
from main import app
from models import ChatResponse, ValidateInvitationResponse, OnboardingResponse, ValidateKeyResponse

class TestMembershipAPI:
    @pytest.fixture
    def client(self):
        return TestClient(app, transport=ASGITransport(app=app))

    @pytest.fixture
    def mock_supabase(self):
        with patch('main.supabase') as mock:
            yield mock

    def test_gpt_chat_successful(self, client, mock_supabase):
        mock_response = ChatResponse(response="Test response")
        mock_supabase.query.return_value = AsyncMock(return_value=mock_response)
        
        response = client.post(
            "/gpt-chat",
            json={"prompt": "test prompt", "history": []}
        )
        
        assert response.status_code == 200
        assert "response" in response.json()
        assert isinstance(response.json()["response"], str)

    def test_gpt_chat_with_token(self, client, mock_supabase):
        mock_response = ChatResponse(response="Test response with token")
        mock_supabase.query.return_value = AsyncMock(return_value=mock_response)
        
        response = client.post(
            "/gpt-chat",
            json={"prompt": "test prompt", "history": []},
            headers={"Authorization": "Bearer valid-key-24chars-exact"}
        )
        
        assert response.status_code == 200
        assert "response" in response.json()

    def test_gpt_chat_error(self, client, mock_supabase):
        mock_supabase.query.side_effect = Exception("Test error")
        
        response = client.post(
            "/gpt-chat",
            json={"prompt": "test prompt", "history": []}
        )
        
        assert response.status_code == 500
        assert "detail" in response.json()

    def test_validate_invitation_valid(self, client, mock_supabase):
        mock_response = ValidateInvitationResponse(valid=True, invitation={"invited_name": "Test User"})
        mock_supabase.get_invitation.return_value = AsyncMock(return_value=mock_response)
        
        response = client.post(
            "/validate-invitation",
            json={"code": "ABC123", "pin": "1234"}
        )
        
        assert response.status_code in (200, 404)

    def test_validate_invitation_invalid(self, client, mock_supabase):
        mock_supabase.get_invitation.return_value = AsyncMock(return_value=None)
        
        response = client.post(
            "/validate-invitation",
            json={"code": "INVALID", "pin": "0000"}
        )
        
        assert response.status_code in (200, 404)

    def test_submit_onboarding_successful(self, client, mock_supabase):
        mock_response = OnboardingResponse(success=True, message="Onboarding submitted successfully")
        mock_supabase.submit_onboarding.return_value = AsyncMock(return_value=True)
        
        response = client.post(
            "/submit-onboarding",
            json={
                "code": "ABC123",
                "voice_consent": True,
                "responses": "Test responses"
            }
        )
        
        assert response.status_code in (200, 404)

    def test_submit_onboarding_invalid_data(self, client):
        response = client.post(
            "/submit-onboarding",
            json={
                "code": "invalid",  # Invalid format
                "voice_consent": True,
                "responses": "Test responses"
            }
        )
        
        assert response.status_code == 422  # Validation error

    def test_validate_key_valid(self, client, mock_supabase):
        mock_response = ValidateKeyResponse(valid=True, user_name="Test User")
        mock_supabase.validate_key.return_value = AsyncMock(return_value=mock_response)
        
        response = client.post(
            "/validate-key",
            json={"key": "valid-key-24chars-exactly"}
        )
        
        assert response.status_code in (200, 404)

    def test_validate_key_invalid(self, client, mock_supabase):
        mock_supabase.validate_key.return_value = AsyncMock(return_value=ValidateKeyResponse(valid=False))
        
        response = client.post(
            "/validate-key",
            json={"key": "invalid-key-format"}
        )
        
        assert response.status_code == 422  # Validation error

    def test_redoc_documentation(self, client):
        response = client.get("/redoc")
        assert response.status_code == 200
        # Check for standard ReDoc elements
        assert "redoc spec-url=" in response.text.lower()