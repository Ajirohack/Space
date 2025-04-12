import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
import os
import json

# Set test environment variables
os.environ['SUPABASE_SERVICE_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.valid-service-key'
os.environ['SUPABASE_KEY'] = 'sbp_a6838c854cf1a7382a5781f084fc1ea3c316d861'
os.environ['SUPABASE_URL'] = 'https://test-project.supabase.co'
os.environ['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters'
os.environ['ADMIN_USERNAME'] = 'test_admin'
os.environ['ADMIN_PASSWORD'] = 'TestPassword1234!'

from main import app

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

    def test_redoc_documentation(self):
        """Test ReDoc documentation endpoint with CSP headers"""
        response = client.get("/docs")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        
        # Verify CSP headers
        csp = response.headers["Content-Security-Policy"]
        assert "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net" in csp
        assert "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net" in csp
        assert "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.jsdelivr.net" in csp
        assert "font-src 'self' https://fonts.gstatic.com" in csp
        
        # Verify ReDoc-specific content
        content = response.text
        assert "redoc.standalone.js" in content
        assert "fonts.googleapis.com" in content
        assert "cdn.jsdelivr.net" in content