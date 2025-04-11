import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from backend.mis_api.database import SupabaseClient

# File: backend/mis-api/test_database.py

@pytest.mark.asyncio
async def test_validate_key_valid():
    """Test validate_key with a valid and active membership key."""
    client = SupabaseClient()
    mock_query = AsyncMock()
    mock_query.side_effect = [
        [{"invitation_id": "123", "status": "active"}],  # Membership query
        [{"invited_name": "Test User"}]  # Invitation query
    ]
    with patch.object(client, 'query', mock_query):
        result = await client.validate_key("valid-key")
        assert result == {"valid": True, "user_name": "Test User"}

@pytest.mark.asyncio
async def test_validate_key_not_found():
    """Test validate_key with a key that is not found."""
    client = SupabaseClient()
    mock_query = AsyncMock(return_value=[])
    with patch.object(client, 'query', mock_query):
        result = await client.validate_key("invalid-key")
        assert result == {"valid": False, "reason": "Membership key not found."}

@pytest.mark.asyncio
async def test_validate_key_inactive_membership():
    """Test validate_key with an inactive membership."""
    client = SupabaseClient()
    mock_query = AsyncMock(return_value=[{"invitation_id": "123", "status": "inactive"}])
    with patch.object(client, 'query', mock_query):
        result = await client.validate_key("inactive-key")
        assert result == {"valid": False, "reason": "Membership status is 'inactive'."}

@pytest.mark.asyncio
async def test_validate_key_data_inconsistency():
    """Test validate_key with missing invitation (data inconsistency)."""
    client = SupabaseClient()
    mock_query = AsyncMock(side_effect=[
        [{"invitation_id": "123", "status": "active"}],  # Membership query
        []  # Invitation query
    ])
    with patch.object(client, 'query', mock_query):
        result = await client.validate_key("key-with-missing-invitation")
        assert result == {"valid": False, "reason": "Associated invitation not found."}

@pytest.mark.asyncio
async def test_validate_key_exception_handling():
    """Test validate_key with an unexpected exception."""
    client = SupabaseClient()
    mock_query = AsyncMock(side_effect=Exception("Unexpected error"))
    with patch.object(client, 'query', mock_query):
        result = await client.validate_key("key-causing-exception")
        assert result == {"valid": False, "reason": "Internal validation error."}