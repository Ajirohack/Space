import os
import httpx
from typing import Dict, Any, Optional, List
from fastapi import HTTPException
import asyncio
from contextlib import asynccontextmanager

class SupabaseClient:
    def __init__(self, url: str = None, key: str = None, pool_size: int = 10):
        self.url = url or os.getenv("SUPABASE_URL", "http://localhost:8000")
        self.key = key or os.getenv("SUPABASE_KEY", "your-default-supabase-key")
        self._client_pool: List[httpx.AsyncClient] = []
        self._pool_lock = asyncio.Lock()
        self._pool_size = pool_size
        self._pool_semaphore = asyncio.Semaphore(pool_size)
        self._shutdown_event = asyncio.Event()
        
    async def _init_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json"
            },
            timeout=httpx.Timeout(30.0),
            http2=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)
        )

    @asynccontextmanager
    async def _get_client(self):
        if self._shutdown_event.is_set():
            raise RuntimeError("Client pool is shutting down")
            
        async with self._pool_semaphore:
            async with self._pool_lock:
                if not self._client_pool:
                    client = await self._init_client()
                else:
                    client = self._client_pool.pop()
            
            try:
                yield client
            finally:
                if not client.is_closed:
                    async with self._pool_lock:
                        if not self._shutdown_event.is_set():
                            self._client_pool.append(client)
                        else:
                            await client.aclose()

    async def startup(self):
        """Initialize the client pool"""
        async with self._pool_lock:
            for _ in range(self._pool_size):
                client = await self._init_client()
                self._client_pool.append(client)

    async def shutdown(self):
        """Gracefully shutdown the client pool"""
        self._shutdown_event.set()
        await self.close()

    async def close(self):
        """Close all clients in the pool"""
        async with self._pool_lock:
            for client in self._client_pool:
                await client.aclose()
            self._client_pool.clear()

    async def query(
        self, 
        table: str, 
        method: str = "GET",
        query_params: Dict[str, Any] = None,
        body: Dict[str, Any] = None,
        retry_count: int = 3
    ) -> Dict[str, Any]:
        """Execute a query against Supabase REST API with retries"""
        url = f"{self.url}/rest/v1/{table}"
        params = query_params or {}
        last_error = None
        
        for attempt in range(retry_count):
            try:
                async with self._get_client() as client:
                    if method == "GET":
                        response = await client.get(url, params=params)
                    elif method == "POST":
                        response = await client.post(url, params=params, json=body)
                    elif method == "PUT":
                        response = await client.put(url, params=params, json=body)
                    elif method == "DELETE":
                        response = await client.delete(url, params=params)
                    elif method == "PATCH":
                        response = await client.patch(url, params=params, json=body)
                    else:
                        raise ValueError(f"Unsupported HTTP method: {method}")

                    response.raise_for_status()
                    return response.json()

            except httpx.HTTPStatusError as e:
                last_error = HTTPException(
                    status_code=e.response.status_code,
                    detail={
                        "message": f"Database error: {e.response.text}",
                        "method": method,
                        "table": table
                    }
                )
                if e.response.status_code not in (429, 503, 504):  # Don't retry client errors
                    raise last_error
                
            except (httpx.RequestError, httpx.TimeoutException) as e:
                last_error = HTTPException(
                    status_code=503,
                    detail={
                        "message": f"Connection error: {str(e)}",
                        "method": method,
                        "table": table,
                        "attempt": attempt + 1
                    }
                )

            # Exponential backoff
            if attempt < retry_count - 1:
                await asyncio.sleep(2 ** attempt)

        raise last_error or HTTPException(status_code=503, detail="Max retries exceeded")

    async def get_invitation(self, code: str, pin: Optional[str] = None) -> Optional[Dict]:
        """Get invitation by code and optionally pin"""
        query = {"code": f"eq.{code}"}
        result = await self.query("invitations", "GET", query)
        
        if not result:
            return None
        
        invitation = result[0]
        if pin and invitation["pin"] != pin:
            return None
        
        return invitation
    
    async def create_invitation(self, invited_name: str) -> Dict:
        """Create a new invitation"""
        import random
        import string
        
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        pin = ''.join(random.choices(string.digits, k=4))
        
        invitation_data = {
            "code": code,
            "pin": pin,
            "invited_name": invited_name,
            "status": "pending"
        }
        
        await self.query("invitations", "POST", body=invitation_data)
        return invitation_data
    
    async def submit_onboarding(self, code: str, voice_consent: bool, responses: str) -> bool:
        """Submit onboarding information"""
        invitation = await self.get_invitation(code)
        if not invitation:
            return False
        
        # Update invitation status
        await self.query(
            "invitations",
            "PATCH",
            {"id": f"eq.{invitation['id']}"},
            {"status": "used"}
        )
        
        # Create onboarding record
        onboarding_data = {
            "invitation_id": invitation["id"],
            "voice_consent": voice_consent,
            "responses": responses
        }
        
        await self.query("onboarding", "POST", body=onboarding_data)
        return True
    
    async def approve_membership(self, invitation_code: str) -> Optional[str]:
        """Approve membership and generate key"""
        invitation = await self.get_invitation(invitation_code)
        if not invitation or invitation["status"] != "used":
            return None
        
        # Generate membership key
        import random
        import string
        membership_key = ''.join(random.choices(string.ascii_letters + string.digits, k=24))
        
        # Create membership record
        membership_data = {
            "invitation_id": invitation["id"],
            "key": membership_key,
            "status": "active"
        }
        
        await self.query("memberships", "POST", body=membership_data)
        
        # Update invitation status
        await self.query(
            "invitations",
            "PATCH",
            {"id": f"eq.{invitation['id']}"},
            {"status": "approved"}
        )
        
        return membership_key
    
    async def validate_key(self, key: str) -> Optional[Dict]:
        """Validate membership key"""
        try:
            result = await self.query("memberships", "GET", {"key": f"eq.{key}", "limit": "1"})
            if not result:
                return {"valid": False, "reason": "Membership key not found."}

            membership = result[0]
            if membership["status"] != "active":
                return {"valid": False, "reason": f"Membership status is '{membership['status']}'."}

            # Get user information
            invitation_id = membership["invitation_id"]
            invitation_result = await self.query("invitations", "GET", {"id": f"eq.{invitation_id}", "limit": "1"})

            if not invitation_result:
                 # This case indicates data inconsistency
                 return {"valid": False, "reason": "Associated invitation not found."}

            return {
                "valid": True,
                "user_name": invitation_result[0]["invited_name"]
            }
        except HTTPException as e:
             # Propagate HTTP exceptions (like connection errors)
             raise e
        except Exception as e:
             # Log unexpected errors and return a generic failure
             # logger.error(f"Unexpected error during key validation: {e}") # Assuming logger is available
             print(f"Unexpected error during key validation: {e}") # Placeholder if logger not set up here
             return {"valid": False, "reason": "Internal validation error."}

# Create a client instance
supabase = SupabaseClient()