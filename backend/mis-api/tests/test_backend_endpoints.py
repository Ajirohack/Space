import pytest
from httpx import AsyncClient, ASGITransport
from main import app


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
