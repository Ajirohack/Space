from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, HTTPBasic, HTTPBasicCredentials
import os
import logging
import secrets
from typing import Optional, Dict, Set, List
from datetime import datetime
from dotenv import load_dotenv
from pydantic import AnyHttpUrl, SecretStr, validator, conint
from pydantic_settings import BaseSettings
import weakref
import json
import asyncio
import uuid
from utils.logging import setup_logging

# Initialize logging
setup_logging()
logger = logging.getLogger("api")

class Settings(BaseSettings):
    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: conint(gt=0, lt=65536) = 3000
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
    SMTP_PORT: conint(gt=0, lt=65536) = 587
    SMTP_USER: str
    SMTP_PASS: SecretStr
    
    # Site Configuration
    SITE_URL: AnyHttpUrl = "http://localhost:3000"
    
    # Authentication
    OPERATOR_TOKEN: SecretStr
    
    # Rate limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: conint(gt=0) = 100
    RATE_LIMIT_BURST: conint(gt=0) = 20
    RATE_LIMIT_WINDOW: conint(gt=0) = 60
    
    # WebSocket settings
    WS_MAX_CONNECTIONS: conint(gt=0) = 1000
    WS_PING_INTERVAL: conint(gt=0) = 30
    
    # Cache settings
    CACHE_TTL: conint(gt=0) = 300
    CACHE_MAX_ITEMS: conint(gt=0) = 1000

    # HTTP Client settings
    HTTP_POOL_MAX_SIZE: conint(gt=0) = 100
    HTTP_KEEPALIVE_EXPIRY: conint(gt=0) = 300
    
    @validator('ADMIN_USERNAME')
    def username_must_be_valid(cls, v):
        if len(v) < 3:
            raise ValueError('Admin username must be at least 3 characters')
        return v
    
    @validator('ADMIN_PASSWORD')
    def password_must_be_strong(cls, v: SecretStr):
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
    
    @validator('JWT_SECRET')
    def jwt_secret_must_be_strong(cls, v: SecretStr):
        secret = v.get_secret_value()
        if len(secret) < 32:
            raise ValueError('JWT secret must be at least 32 characters')
        return v

    @validator('SUPABASE_KEY', 'SUPABASE_SERVICE_KEY')
    def validate_supabase_keys(cls, v: SecretStr):
        key = v.get_secret_value()
        if not key or key == 'your-supabase-key' or key == 'your-supabase-service-key':
            raise ValueError('Invalid Supabase key. Please set actual Supabase keys.')
        return v
    
    @validator('ALLOWED_ORIGINS')
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            try:
                origins = json.loads(v)
                if not isinstance(origins, list):
                    raise ValueError
                return origins
            except:
                raise ValueError('ALLOWED_ORIGINS must be a valid JSON array of URLs')
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True

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

# Security scheme
security = HTTPBearer(auto_error=False)

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Validate membership key in Authorization header"""
    if not credentials:
        return None
    
    key = credentials.credentials
    user_data = await supabase.validate_key(key)
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

@app.post("/admin/create-invitation", response_model=InvitationResponse)
async def create_invitation(request: InvitationRequest, admin_user: str = Depends(verify_admin)):
    """Create a new invitation code and PIN (Admin only)"""
    logger.info(f"Admin '{admin_user}' creating invitation for {request.invited_name}")
    try:
        invitation = await supabase.create_invitation(request.invited_name)
        logger.info(f"Invitation created: {invitation['code']}")
        return invitation
    except Exception as e:
        logger.error(f"Error creating invitation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create invitation: {str(e)}")

@app.post("/validate-invitation", response_model=ValidateInvitationResponse)
async def validate_invitation(request: ValidateInvitationRequest):
    """Validate invitation code and PIN"""
    logger.info(f"Validating invitation code: {request.code}")
    try:
        invitation = await supabase.get_invitation(request.code, request.pin)
        if invitation:
            logger.info(f"Invitation validated: {request.code}")
            return {
                "valid": True,
                "invitation": {
                    "code": invitation["code"],
                    "invited_name": invitation["invited_name"]
                }
            }
        else:
            logger.warning(f"Invalid invitation attempt: {request.code}")
            return {"valid": False}
    except Exception as e:
        logger.error(f"Error validating invitation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to validate invitation: {str(e)}")

@app.post("/submit-onboarding", response_model=OnboardingResponse)
async def submit_onboarding(request: OnboardingRequest):
    """Submit user onboarding information"""
    logger.info(f"Submitting onboarding for code: {request.code}")
    try:
        success = await supabase.submit_onboarding(
            request.code,
            request.voice_consent,
            request.responses
        )
        
        if success:
            logger.info(f"Onboarding submitted successfully for {request.code}")
            return {
                "success": True,
                "message": "Onboarding submitted successfully"
            }
        else:
            logger.warning(f"Onboarding submission failed for {request.code}")
            return {
                "success": False,
                "message": "Failed to submit onboarding. Invalid invitation code."
            }
    except Exception as e:
        logger.error(f"Error submitting onboarding: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to submit onboarding: {str(e)}")

@app.post("/admin/approve-membership", response_model=ApproveMembershipResponse)
async def approve_membership(request: ApproveMembershipRequest, admin_user: str = Depends(verify_admin)):
    """Approve a membership application (Admin only)"""
    logger.info(f"Admin '{admin_user}' approving membership for code: {request.invitation_code}")
    try:
        membership_key = await supabase.approve_membership(request.invitation_code)
        if membership_key:
            logger.info(f"Membership approved for {request.invitation_code}")
            return {
                "success": True,
                "message": "Membership approved",
                "membership_key": membership_key
            }
        else:
            logger.warning(f"Membership approval failed for {request.invitation_code}")
            invitation = await supabase.get_invitation(request.invitation_code)
            reason = "Invalid invitation code or status not 'used'."
            if invitation and invitation.get("status") == "approved":
                reason = "Membership already approved for this invitation."
            elif invitation and invitation.get("status") == "pending":
                reason = "Onboarding not yet submitted for this invitation."

            return {
                "success": False,
                "message": f"Failed to approve membership. {reason}"
            }
    except Exception as e:
        logger.error(f"Error approving membership: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to approve membership: {str(e)}")

@app.post("/validate-key", response_model=ValidateKeyResponse)
async def validate_key(request: ValidateKeyRequest):
    """Validate a membership key"""
    logger.info("Validating membership key")
    try:
        user_data = await supabase.validate_key(request.key)
        if user_data and user_data.get("valid"):
            logger.info("Membership key validated successfully")
            return ValidateKeyResponse(
                valid=True,
                user_name=user_data["user_name"]
            )
        else:
            logger.warning(f"Invalid or inactive membership key provided: {request.key[:4]}...")
            reason = user_data.get("reason", "Invalid or inactive key.") if user_data else "Invalid key."
            return ValidateKeyResponse(
                valid=False,
                user_name=None,
                error=reason
            )
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error validating key: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to validate key due to an internal error.",
                "error": str(e)
            }
        )

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
