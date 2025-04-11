from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, List
import re

class InvitationRequest(BaseModel):
    invited_name: str = Field(..., description="Name of the person being invited", min_length=2, max_length=100)
    
    @field_validator('invited_name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z\s\'-]+$', v):
            raise ValueError('Name can only contain letters, spaces, hyphens and apostrophes')
        return v.strip()

    model_config = ConfigDict(title="Invitation Request")

class InvitationResponse(BaseModel):
    code: str = Field(..., pattern=r'^[A-Z0-9]{6}$')
    pin: str = Field(..., pattern=r'^\d{4}$')
    invited_name: str
    status: str = Field(..., pattern=r'^(pending|used|approved)$')
    
    model_config = ConfigDict(title="Invitation Response")

class ValidateInvitationRequest(BaseModel):
    code: str = Field(..., pattern=r'^[A-Z0-9]{6}$')
    pin: str = Field(..., pattern=r'^\d{4}$')
    
    model_config = ConfigDict(title="Validate Invitation Request")

class ValidateInvitationResponse(BaseModel):
    valid: bool
    invitation: Optional[Dict] = None
    
    model_config = ConfigDict(title="Validate Invitation Response")

class OnboardingRequest(BaseModel):
    code: str = Field(..., pattern=r'^[A-Z0-9]{6}$')
    voice_consent: bool
    responses: str = Field(..., min_length=1, max_length=10000)
    
    model_config = ConfigDict(title="Onboarding Request")

class OnboardingResponse(BaseModel):
    success: bool
    message: str
    
    model_config = ConfigDict(title="Onboarding Response")

class ApproveMembershipRequest(BaseModel):
    invitation_code: str = Field(..., pattern=r'^[A-Z0-9]{6}$')
    
    model_config = ConfigDict(title="Approve Membership Request")

class ApproveMembershipResponse(BaseModel):
    success: bool
    message: str
    membership_key: Optional[str] = Field(None, pattern=r'^[A-Za-z0-9]{24}$')
    
    model_config = ConfigDict(title="Approve Membership Response")

class ValidateKeyRequest(BaseModel):
    key: str = Field(..., min_length=24, max_length=24, pattern=r'^[A-Za-z0-9]{24}$')
    
    model_config = ConfigDict(title="Validate Key Request")

class ValidateKeyResponse(BaseModel):
    valid: bool
    user_name: Optional[str] = None
    error: Optional[str] = None
    
    model_config = ConfigDict(title="Validate Key Response")

class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r'^(user|assistant)$')
    content: str = Field(..., min_length=1, max_length=4096)
    
    model_config = ConfigDict(title="Chat Message")

class ChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4096)
    history: Optional[List[ChatMessage]] = Field(default_factory=list, max_length=50)
    
    model_config = ConfigDict(title="Chat Request")

class ChatResponse(BaseModel):
    response: str = Field(..., min_length=1, max_length=4096)
    
    model_config = ConfigDict(title="Chat Response")