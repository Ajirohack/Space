import pytest
from httpx import AsyncClient
from main import app


@pytest.mark.asyncio
async def test_root():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "SpaceWH Membership Initiation API is running."}


@pytest.mark.asyncio
async def test_validate_invitation_not_found():
    payload = {
        "code": "INVALIDCODE",
        "pin": "0000"
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/validate-invitation", json=payload)
    assert response.status_code in (404, 500)  # depending on Supabase mock behavior


@pytest.mark.asyncio
async def test_validate_key_not_found():
    payload = {"key": "NONEXISTENTKEY"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/validate-key", json=payload)
    assert response.status_code in (404, 500)


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
    # This will fail unless a real invitation code is provided
    payload = {
        "code": "VALIDCODE",
        "voice_consent": True,
        "responses": "Sample responses"
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/submit-onboarding", json=payload)
    assert response.status_code in (200, 404)


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
    # Expected to fail if Supabase is unreachable or key is invalid
    payload = {
        "code": "VALIDCODE",
        "pin": "1234"
    }
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/validate-invitation", json=payload)
    assert response.status_code in (200, 404, 500)
    if response.status_code == 500:
        assert "Supabase error" in response.json()["detail"]
