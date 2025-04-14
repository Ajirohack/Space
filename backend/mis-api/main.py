from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, HTTPBasic, HTTPBasicCredentials
from fastapi.responses import Response
import os
import logging
import secrets
from typing import Optional, Dict, Set, List, Union
from datetime import datetime
from dotenv import load_dotenv
from pydantic import AnyHttpUrl, SecretStr, Field, ConfigDict, field_validator
from pydantic_settings import BaseSettings
import weakref
import json
import asyncio
import uuid
import random
import string
import httpx
from utils.logging import setup_logging

# Initialize logging
setup_logging()
logger = logging.getLogger("api")

class Settings(BaseSettings):
    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = Field(default=3000, gt=0, lt=65536)
    DEBUG: bool = False
    
    # Security
    ADMIN_USERNAME: str
    ADMIN_PASSWORD: SecretStr
    JWT_SECRET: SecretStr
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # Database
    POSTGRES_PASSWORD: SecretStr
    SUPABASE_URL: AnyHttpUrl
    SUPABASE_KEY: SecretStr
    SUPABASE_SERVICE_KEY: SecretStr
    
    # Email Configuration
    SMTP_HOST: str
    SMTP_PORT: int = Field(default=587, gt=0, lt=65536)
    SMTP_USER: str
    SMTP_PASS: SecretStr
    
    # Site Configuration
    SITE_URL: AnyHttpUrl = Field(default="http://localhost:3000")
    
    # Authentication
    OPERATOR_TOKEN: SecretStr
    
    # Rate limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = Field(default=100, gt=0)
    RATE_LIMIT_BURST: int = Field(default=20, gt=0)
    RATE_LIMIT_WINDOW: int = Field(default=60, gt=0)
    
    # WebSocket settings
    WS_MAX_CONNECTIONS: int = Field(default=1000, gt=0)
    WS_PING_INTERVAL: int = Field(default=30, gt=0)
    
    # Cache settings
    CACHE_TTL: int = Field(default=300, gt=0)
    CACHE_MAX_ITEMS: int = Field(default=1000, gt=0)
    
    # HTTP Client settings
    HTTP_POOL_MAX_SIZE: int = Field(default=100, gt=0)
    HTTP_KEEPALIVE_EXPIRY: int = Field(default=300, gt=0)
    
    @field_validator('ADMIN_USERNAME')
    @classmethod
    def username_must_be_valid(cls, v: str) -> str:
        if len(v) < 3:
            raise ValueError('Admin username must be at least 3 characters')
        return v
    
    @field_validator('ADMIN_PASSWORD')
    @classmethod
    def password_must_be_strong(cls, v: SecretStr) -> SecretStr:
        password = v.get_secret_value()
        if len(password) < 12:
            raise ValueError('Admin password must be at least 12 characters')
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(not c.isalnum() for c in password)
        if not (has_upper and has_lower and has_digit and has_special):
            raise ValueError('Password must contain uppercase, lowercase, digit and special characters')
        return v
    
    @field_validator('JWT_SECRET')
    @classmethod
    def jwt_secret_must_be_strong(cls, v: SecretStr) -> SecretStr:
        secret = v.get_secret_value()
        if len(secret) < 32:
            raise ValueError('JWT secret must be at least 32 characters')
        return v

    @field_validator('SUPABASE_KEY', 'SUPABASE_SERVICE_KEY')
    @classmethod
    def validate_supabase_keys(cls, v: SecretStr) -> SecretStr:
        key = v.get_secret_value()
        if not key or key == 'your-supabase-key' or key == 'your-supabase-service-key':
            raise ValueError('Invalid Supabase key. Please set actual Supabase keys.')
        return v
    
    @field_validator('ALLOWED_ORIGINS')
    @classmethod
    def parse_allowed_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            try:
                origins = json.loads(v)
                if not isinstance(origins, list):
                    raise ValueError
                return origins
            except:
                raise ValueError('ALLOWED_ORIGINS must be a valid JSON array of URLs')
        return v

    model_config = ConfigDict(
        case_sensitive=True,
        env_file=".env"
    )

# Initialize settings with validation
load_dotenv()
try:
    settings = Settings()
except Exception as e:
    logger = logging.getLogger("startup")
    logger.critical("Failed to load settings: %s", str(e))
    raise SystemExit(1)

# Import our modules
from database import supabase
from models import (
    InvitationRequest, InvitationResponse,
    ValidateInvitationRequest, ValidateInvitationResponse,
    OnboardingRequest, OnboardingResponse,
    ApproveMembershipRequest, ApproveMembershipResponse,
    ValidateKeyRequest, ValidateKeyResponse,
    ChatRequest, ChatResponse
)
from middleware import TimingMiddleware, RateLimitMiddleware, RequestValidationMiddleware, SecurityMiddleware, CacheMiddleware

# Initialize FastAPI with settings and Lifespan
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup
    setup_logging()
    logger.info("Starting up MIS API")
    await supabase.startup()  # Initialize the Supabase client pool
    
    yield
    
    # Cleanup
    logger.info("Shutting down MIS API")
    await supabase.shutdown()  # Gracefully shutdown the Supabase client pool

app = FastAPI(
    title="SpaceWH Membership Initiation System API",
    debug=settings.DEBUG,
    lifespan=lifespan
)

# Add security middleware first (important for headers)
app.add_middleware(SecurityMiddleware)

# Configure CORS with validated origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request validation middleware
app.add_middleware(RequestValidationMiddleware)

# Add timing middleware
app.add_middleware(TimingMiddleware)

# Add rate limiting middleware (adjust limits as needed)
app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.RATE_LIMIT_REQUESTS_PER_MINUTE, burst_limit=settings.RATE_LIMIT_BURST)

# Add caching middleware
app.add_middleware(CacheMiddleware)

@app.middleware("http")
async def csp_headers(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; worker-src blob:;"
    )
    return response

# Security scheme
security = HTTPBearer(auto_error=False)

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Validate membership key in Authorization header"""
    if not credentials:
        return None
    
    key = credentials.credentials
    try:
        user_data = await supabase.validate_key(key)
    except Exception as e:
        logger.error(f"Supabase error: {str(e)}")
        raise HTTPException(status_code=500, detail="Supabase validation failed")
    if not user_data:
        return None
        
    return user_data

# Basic Auth for Admin endpoints (replace with a more robust system in production)
security_admin = HTTPBasic()
ADMIN_USERNAME = settings.ADMIN_USERNAME
ADMIN_PASSWORD = settings.ADMIN_PASSWORD.get_secret_value()

def verify_admin(credentials: HTTPBasicCredentials = Depends(security_admin)):
    correct_username = secrets.compare_digest(credentials.username, ADMIN_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, ADMIN_PASSWORD)
    if not (correct_username and correct_password):
        logger.warning("Unauthorized attempt to access admin endpoint.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    logger.info(f"Admin user '{credentials.username}' authenticated.")
    return credentials.username

@app.get("/")
async def root():
    """Root endpoint - API welcome message"""
    logger.info("Root endpoint accessed")
    return {"message": "SpaceWH Membership Initiation API is running."}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.info("Health check endpoint accessed")
    try:
        # Simple DB connection check
        await supabase.query("memberships", "GET", {"limit": "1"})
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "database": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }
        )

# Add safe_post_to_supabase and safe_get_from_supabase functions for error handling
async def safe_post_to_supabase(endpoint: str, data: dict):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.SUPABASE_URL}/{endpoint}",
                headers={
                    "apikey": settings.SUPABASE_KEY.get_secret_value(),
                    "Authorization": f"Bearer {settings.SUPABASE_KEY.get_secret_value()}",
                    "Content-Type": "application/json"
                },
                json=data
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        logger.error(f"Supabase POST error: {str(exc)}")
        raise HTTPException(status_code=500, detail=f"Supabase error: {str(exc)}")

async def safe_get_from_supabase(endpoint: str, params: dict):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.SUPABASE_URL}/{endpoint}",
                headers={
                    "apikey": settings.SUPABASE_KEY.get_secret_value(),
                    "Authorization": f"Bearer {settings.SUPABASE_KEY.get_secret_value()}"
                },
                params=params
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        logger.error(f"Supabase GET error: {str(exc)}")
        raise HTTPException(status_code=500, detail=f"Supabase error: {str(exc)}")

@app.post("/admin/create-invitation", response_model=InvitationResponse)
async def create_invitation(request: InvitationRequest, admin_user: str = Depends(verify_admin)):
    logger.info(f"Admin '{admin_user}' creating invitation for {request.invited_name}")
    code = ''.join(random.choices(string.ascii_letters + string.digits, k=18))
    pin = ''.join(random.choices(string.digits, k=4))
    data = {
        "code": code,
        "pin": pin,
        "invited_name": request.invited_name,
        "status": "pending"
    }
    await safe_post_to_supabase("rest/v1/invitations", data)
    return {"code": code, "pin": pin, "invited_name": request.invited_name}

@app.post("/validate-invitation", response_model=ValidateInvitationResponse)
async def validate_invitation(request: ValidateInvitationRequest):
    logger.info(f"Validating invitation code: {request.code}")
    params = {
        "code": f"eq.{request.code}",
        "pin": f"eq.{request.pin}",
        "status": "eq.pending"
    }
    results = await safe_get_from_supabase("rest/v1/invitations", params)
    if not results:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    return {"valid": True, "code": request.code}

@app.post("/submit-onboarding", response_model=OnboardingResponse)
async def submit_onboarding(request: OnboardingRequest):
    logger.info(f"Submitting onboarding for code: {request.code}")
    invitation = await safe_get_from_supabase("rest/v1/invitations", {"code": f"eq.{request.code}"})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    onboarding_data = {
        "invitation_code": request.code,
        "voice_consent": request.voice_consent,
        "responses": request.responses
    }
    await safe_post_to_supabase("rest/v1/onboarding", onboarding_data)
    return {"status": "submitted", "code": request.code}

@app.post("/admin/approve-membership", response_model=ApproveMembershipResponse)
async def approve_membership(request: ApproveMembershipRequest, admin_user: str = Depends(verify_admin)):
    logger.info(f"Admin '{admin_user}' approving membership for code: {request.invitation_code}")
    # 1. Fetch invitation and check onboarding status
    invitation = await safe_get_from_supabase(
        "rest/v1/invitations",
        {"code": f"eq.{request.invitation_code}", "select": "*"}
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    inv = invitation[0]
    if inv.get("status") != "onboarded":
        raise HTTPException(status_code=400, detail="Invitation not onboarded yet.")
    user_name = getattr(request, "user_name", inv.get("invited_name", ""))
    # 2. Generate secure membership code and key
    import secrets
    from datetime import datetime
    membership_code = f"MEMBER-{secrets.token_hex(3).upper()}"
    timestamp = int(datetime.utcnow().timestamp())
    membership_key = f"{membership_code}-{timestamp}"
    # 3. Insert membership record
    payload = {
        "invitation_code": request.invitation_code,
        "membership_code": membership_code,
        "membership_key": membership_key,
        "issued_to": user_name,
        "active": True,
        "issued_at": datetime.utcnow().isoformat()
    }
    insert_result = await safe_post_to_supabase(
        "rest/v1/memberships",
        payload
    )
    if not insert_result:
        raise HTTPException(status_code=500, detail="Error saving membership record.")
    return {
        "success": True,
        "message": "Membership approved.",
        "membership_key": membership_key,
        "membership_code": membership_code
    }

@app.post("/validate-key", response_model=ValidateKeyResponse)
async def validate_key(request: ValidateKeyRequest):
    logger.info("Validating membership key")
    params = {
        "membership_code": f"eq.{request.key}",
        "status": "eq.active"
    }
    results = await safe_get_from_supabase("rest/v1/memberships", params)
    if not results:
        raise HTTPException(status_code=404, detail="Invalid membership key")
    return {"valid": True, "key": request.key}

@app.post("/gpt-chat", response_model=ChatResponse)
async def gpt_chat(
    request: ChatRequest,
    user_data: Optional[dict] = Depends(get_current_user)
):
    """Send a chat message to the AI assistant"""
    logger.info("Received chat request")
    try:
        import random
        
        if user_data:
            user_name = user_data["user_name"]
            logger.info(f"Authenticated chat request from {user_name}")
            responses = [
                f"Hello {user_name}, I'm SpaceWH AI. How can I assist you today?",
                f"Thanks for your question, {user_name}. Let me think about it...",
                f"Based on my knowledge, {user_name}, I would recommend the following approach...",
                f"I'd need more information to answer that fully, {user_name}. Can you provide more details?",
                f"That's an interesting query, {user_name}, but it's beyond my current capabilities."
            ]
        else:
            logger.info("Unauthenticated chat request")
            responses = [
                "I'm SpaceWH AI. How can I assist you today?",
                "That's an interesting question. Let me think about it...",
                "Based on my knowledge, I would recommend the following approach...",
                "I don't have enough information to answer that fully. Can you provide more details?",
                "That's beyond my current capabilities, but I'm constantly learning."
            ]
        
        response = random.choice(responses)
        logger.info("Chat response generated")
        return {"response": response}
    except Exception as e:
        logger.error(f"Error generating chat response: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate chat response: {str(e)}")

@app.get("/admin/invitations", dependencies=[Depends(verify_admin)])
async def get_invitations(admin_user: str = Depends(verify_admin)):
    """Get all invitations (Admin only)"""
    logger.info(f"Admin '{admin_user}' getting all invitations")
    try:
        invitations = await supabase.query("invitations", "GET")
        return {"success": True, "data": invitations}
    except Exception as e:
        logger.error(f"Error getting invitations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get invitations: {str(e)}")

@app.get("/admin/memberships", dependencies=[Depends(verify_admin)])
async def get_memberships(admin_user: str = Depends(verify_admin)):
    """Get all memberships (Admin only)"""
    logger.info(f"Admin '{admin_user}' getting all memberships")
    try:
        memberships = await supabase.query("memberships", "GET")
        return {"success": True, "data": memberships}
    except Exception as e:
        logger.error(f"Error getting memberships: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get memberships: {str(e)}")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        # Use weak references for automatic cleanup
        self.active_connections: Dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()
        
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        async with self._lock:
            self.active_connections[client_id] = websocket
        logger.info(f"WebSocket client {client_id} connected. Active connections: {len(self.active_connections)}")
        
    async def disconnect(self, client_id: str):
        async with self._lock:
            if client_id in self.active_connections:
                del self.active_connections[client_id]
                logger.info(f"WebSocket client {client_id} disconnected. Active connections: {len(self.active_connections)}")
        
    async def send_personal_message(self, message: str, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(message)
            except Exception as e:
                logger.error(f"Error sending message to client {client_id}: {str(e)}")
                await self.disconnect(client_id)
                
    async def broadcast(self, message: str, exclude: Optional[str] = None):
        # Remove stale connections and send message
        async with self._lock:
            for client_id, connection in list(self.active_connections.items()):
                if client_id != exclude:
                    try:
                        await connection.send_text(message)
                    except Exception as e:
                        logger.error(f"Error broadcasting to client {client_id}: {str(e)}")
                        await self.disconnect(client_id)

manager = ConnectionManager()

# Add WebSocket endpoint for real-time updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_id = str(uuid.uuid4())
    auth_token = None
    
    try:
        await manager.connect(websocket, client_id)
        
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Handle authentication
                if message.get("type") == "auth":
                    token = message.get("payload", {}).get("token")
                    if token:
                        user_data = await supabase.validate_key(token)
                        if user_data and user_data.get("valid"):
                            auth_token = token
                            await manager.send_personal_message(
                                json.dumps({
                                    "type": "auth_success",
                                    "payload": {
                                        "user_name": user_data["user_name"]
                                    }
                                }),
                                client_id
                            )
                            continue
                    
                    # Auth failed
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "auth_failed",
                            "payload": {
                                "error": "Invalid authentication token"
                            }
                        }),
                        client_id
                    )
                    continue
                
                # Handle chat messages (requires auth)
                if message.get("type") == "chat_message":
                    if not auth_token:
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "error",
                                "payload": {
                                    "error": "Authentication required"
                                }
                            }),
                            client_id
                        )
                        continue
                    
                    content = message.get("payload", {}).get("content")
                    if content:
                        # Process chat message
                        response = await process_chat_message(content, auth_token)
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "chat_response",
                                "payload": response
                            }),
                            client_id
                        )
                
                # Log any other message types
                else:
                    logger.debug(f"Received WebSocket message from {client_id}: {data}")
                
            except json.JSONDecodeError:
                await manager.send_personal_message(
                    json.dumps({
                        "type": "error",
                        "payload": {
                            "error": "Invalid message format"
                        }
                    }),
                    client_id
                )
                
    except WebSocketDisconnect:
        await manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {str(e)}")
        await manager.disconnect(client_id)

async def process_chat_message(content: str, auth_token: str) -> dict:
    """Process a chat message and return the response"""
    try:
        user_data = await supabase.validate_key(auth_token)
        if not user_data or not user_data.get("valid"):
            return {
                "error": "Invalid authentication token"
            }
        
        # Use the existing chat endpoint logic
        chat_request = ChatRequest(prompt=content)
        response = await gpt_chat(chat_request, user_data)
        return {
            "content": response.response
        }
        
    except Exception as e:
        logger.error(f"Error processing chat message: {str(e)}")
        return {
            "error": "Failed to process message"
        }
