import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from main import app
import json

client = TestClient(app)

class TestMembershipAPI:
    @patch('main.gpt_chat')
    def test_gpt_chat_successful(self, mock_chat):
        """Test successful chat request"""
        mock_chat.return_value = ChatResponse(response="Test response")
        
        response = client.post(
            "/gpt-chat",
            json={"prompt": "Hello"}
        )
        
        assert response.status_code == 200
        assert response.json() == {"response": "Test response"}

    @patch('main.gpt_chat')
    def test_gpt_chat_with_token(self, mock_chat):
        """Test chat request with auth token"""
        mock_chat.return_value = ChatResponse(response="Authenticated response")
        
        response = client.post(
            "/gpt-chat",
            headers={"Authorization": "Bearer test-token"},
            json={"prompt": "Hello"}
        )
        
        assert response.status_code == 200
        assert response.json() == {"response": "Authenticated response"}

    @patch('main.gpt_chat')
    def test_gpt_chat_error(self, mock_chat):
        """Test chat request with error"""
        mock_chat.side_effect = Exception("Test error")
        
        response = client.post(
            "/gpt-chat",
            json={"prompt": "Hello"}
        )
        
        assert response.status_code == 500
        assert "error" in response.json()["detail"]

    @patch('main.validate_invitation')
    def test_validate_invitation_valid(self, mock_validate):
        """Test validation of valid invitation code and PIN"""
        mock_validate.return_value = {
            "valid": True,
            "invitation": {
                "code": "INV123",
                "invited_name": "Test User"
            }
        }
        
        response = client.post(
            "/validate-invitation",
            json={"code": "INV123", "pin": "1234"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == True
        assert data["invitation"]["invited_name"] == "Test User"

    @patch('main.validate_invitation')
    def test_validate_invitation_invalid(self, mock_validate):
        """Test validation of invalid invitation code and PIN"""
        mock_validate.return_value = {"valid": False}
        
        response = client.post(
            "/validate-invitation",
            json={"code": "INV123", "pin": "9999"}
        )
        
        assert response.status_code == 200
        assert response.json()["valid"] == False

    @patch('main.submit_onboarding')
    def test_submit_onboarding_successful(self, mock_submit):
        """Test successful onboarding submission"""
        mock_submit.return_value = {
            "success": True,
            "message": "Onboarding submitted successfully"
        }
        
        response = client.post(
            "/submit-onboarding",
            json={
                "code": "INV123",
                "voice_consent": True,
                "responses": "Test responses"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True

    @patch('main.submit_onboarding')
    def test_submit_onboarding_invalid_data(self, mock_submit):
        """Test onboarding submission with invalid data"""
        mock_submit.return_value = {"success": False, "message": "Invalid code"}
        
        response = client.post(
            "/submit-onboarding",
            json={
                "code": "INVALID",
                "voice_consent": True,
                "responses": "Test responses"
            }
        )
        
        assert response.status_code == 200
        assert response.json()["success"] == False

    @patch('main.submit_onboarding')
    def test_submit_onboarding_error(self, mock_submit):
        """Test onboarding submission with error"""
        mock_submit.side_effect = Exception("Test error")
        
        response = client.post(
            "/submit-onboarding",
            json={
                "code": "INV123",
                "voice_consent": True,
                "responses": "Test responses"
            }
        )
        
        assert response.status_code == 500
        assert "error" in response.json()["detail"]

    @patch('main.validate_key')
    def test_validate_key_valid(self, mock_validate):
        """Test validation of valid membership key"""
        mock_validate.return_value = {"valid": True, "user_name": "Test User"}
        
        response = client.post(
            "/validate-key",
            json={"key": "valid-key"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == True
        assert data["user_name"] == "Test User"

    @patch('main.validate_key')
    def test_validate_key_invalid(self, mock_validate):
        """Test validation of invalid membership key"""
        mock_validate.return_value = {"valid": False, "error": "Invalid key"}
        
        response = client.post(
            "/validate-key",
            json={"key": "invalid-key"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == False
        assert "error" in data