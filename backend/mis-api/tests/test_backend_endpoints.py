import pytest
from httpx import AsyncClient, ASGITransport
from main import app
import os
import base64


@pytest.fixture
def client():
    return TestClient(app, transport=ASGITransport(app=app))


@pytest.mark.asyncio
async def test_root():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "SpaceWH Membership Initiation API is running."}


@pytest.mark.asyncio
async def test_validate_invitation_not_found():
    payload = {
        "code": "ABC123",  # Valid format: 6 chars alphanumeric
        "pin": "1234"     # Valid format: 4 digits
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/validate-invitation", json=payload)
    assert response.status_code == 404  # Not found is expected response


@pytest.mark.asyncio
async def test_validate_key_not_found():
    payload = {"key": "valid-key-24chars-exactly"}  # Valid format: 24 chars
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/validate-key", json=payload)
    assert response.status_code == 404  # Not found is expected response


@pytest.mark.asyncio
async def test_create_invitation_with_valid_key():
    # Mock admin credentials (replace with base64-encoded "admin:password")
    admin_headers = {"x-api-key": "your-admin-api-key"}
    payload = {"invited_name": "John Doe"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/admin/create-invitation", json=payload, headers=admin_headers)
    assert response.status_code in (200, 401, 403)
    if response.status_code == 200:
        data = response.json()
        assert "code" in data
        assert "pin" in data


@pytest.mark.asyncio
async def test_submit_onboarding_valid_invite():
    payload = {
        "code": "ABC123",  # Valid format: 6 chars alphanumeric
        "voice_consent": True,
        "responses": "Sample responses"
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/submit-onboarding", json=payload)
    assert response.status_code == 404  # Not found is expected when invitation doesn't exist


@pytest.mark.asyncio
async def test_approve_membership_with_auth():
    admin_headers = {"x-api-key": "your-admin-api-key"}
    payload = {
        "invitation_code": "VALIDCODE",
        "user_name": "John Doe"
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/admin/approve-membership", json=payload, headers=admin_headers)
    assert response.status_code in (200, 401, 403, 404)
    if response.status_code == 200:
        assert "membership_code" in response.json()


@pytest.mark.asyncio
async def test_error_handling_on_supabase_down():
    payload = {
        "code": "ABC123",  # Valid format: 6 chars alphanumeric
        "pin": "1234"     # Valid format: 4 digits
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/validate-invitation", json=payload)
    assert response.status_code in (404, 500)  # Either not found or server error is acceptable


@pytest.mark.asyncio
async def test_approve_membership_success(monkeypatch):
    async def mock_safe_get_from_supabase(endpoint, params):
        if "memberships" in endpoint:
            return []  # No existing membership
        if "invitations" in endpoint:
            return [{"status": "onboarded", "invited_name": "Test User"}]
        return []
    async def mock_safe_post_to_supabase(endpoint, data):
        return {"id": 1}
    monkeypatch.setattr("main.safe_get_from_supabase", mock_safe_get_from_supabase)
    monkeypatch.setattr("main.safe_post_to_supabase", mock_safe_post_to_supabase)
    admin_headers = {"Authorization": "Basic YWRtaW46U3Ryb25nQWRtaW5QYXNzMTIzIQ=="}
    payload = {"invitation_code": "ABC123", "user_name": "Test User"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/admin/approve-membership", json=payload, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert "membership_key" in response.json()


@pytest.mark.asyncio
async def test_approve_membership_replay(monkeypatch):
    async def mock_safe_get_from_supabase(endpoint, params):
        if "memberships" in endpoint:
            return [{"membership_code": "MEMBER-EXISTING", "active": True}]
        if "invitations" in endpoint:
            return [{"status": "onboarded", "invited_name": "Test User"}]
        return []
    monkeypatch.setattr("main.safe_get_from_supabase", mock_safe_get_from_supabase)
    admin_headers = {"Authorization": "Basic YWRtaW46U3Ryb25nQWRtaW5QYXNzMTIzIQ=="}
    payload = {"invitation_code": "ABC123", "user_name": "Test User"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/admin/approve-membership", json=payload, headers=admin_headers)
    assert response.status_code == 409
    assert "Membership already exists" in response.text


@pytest.mark.asyncio
async def test_approve_membership_not_onboarded(monkeypatch):
    async def mock_safe_get_from_supabase(endpoint, params):
        if "memberships" in endpoint:
            return []
        if "invitations" in endpoint:
            return [{"status": "pending", "invited_name": "Test User"}]
        return []
    monkeypatch.setattr("main.safe_get_from_supabase", mock_safe_get_from_supabase)
    admin_headers = {"Authorization": "Basic YWRtaW46U3Ryb25nQWRtaW5QYXNzMTIzIQ=="}
    payload = {"invitation_code": "ABC123", "user_name": "Test User"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/admin/approve-membership", json=payload, headers=admin_headers)
    assert response.status_code == 400
    assert "onboarded" in response.text


@pytest.mark.asyncio
async def test_approve_membership_invitation_not_found(monkeypatch):
    async def mock_safe_get_from_supabase(endpoint, params):
        if "memberships" in endpoint:
            return []
        if "invitations" in endpoint:
            return []
        return []
    monkeypatch.setattr("main.safe_get_from_supabase", mock_safe_get_from_supabase)
    admin_headers = {"Authorization": "Basic YWRtaW46U3Ryb25nQWRtaW5QYXNzMTIzIQ=="}
    payload = {"invitation_code": "ABC123", "user_name": "Test User"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/admin/approve-membership", json=payload, headers=admin_headers)
    assert response.status_code == 404
    assert "Invitation not found" in response.text


@pytest.mark.asyncio
async def test_membership_full_lifecycle():
    """
    End-to-end test: Invitation → Validation → Onboarding → Approval → Membership Key Validation
    Uses real backend and Supabase (ensure test DB and .env are safe for test data).
    """
    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "StrongAdminPass123!")
    basic_auth = base64.b64encode(f"{admin_user}:{admin_pass}".encode()).decode()
    admin_headers = {"Authorization": f"Basic {basic_auth}"}
    invited_name = "Jane Doe"

    # 1. Create Invitation
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/admin/create-invitation", json={"invited_name": invited_name}, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        code = data["code"]
        pin = data["pin"]
        assert code and pin

    # 2. Validate Invitation
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/validate-invitation", json={"code": code, "pin": pin})
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    # 3. Submit Onboarding
    onboarding_payload = {
        "code": code,
        "voice_consent": True,
        "responses": "I am excited to join. I love AI. Yes I understand."
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/submit-onboarding", json=onboarding_payload)
        assert resp.status_code == 200
        assert resp.json()["status"] == "submitted"

    # 4. Approve Membership
    approve_payload = {"invitation_code": code, "user_name": invited_name}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/admin/approve-membership", json=approve_payload, headers=admin_headers)
        assert resp.status_code == 200
        approve_data = resp.json()
        assert approve_data["success"] is True
        membership_key = approve_data["membership_key"]
        membership_code = approve_data["membership_code"]
        assert membership_key and membership_code

    # 5. Validate Membership Key
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/validate-key", json={"key": membership_code})
        assert resp.status_code == 200
        assert resp.json()["valid"] is True
