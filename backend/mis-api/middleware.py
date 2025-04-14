import logging
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Dict, List, Tuple
import time
import asyncio
import uuid
from json.decoder import JSONDecodeError

# Configure logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Set individual CSP directives with proper permissions for documentation
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'self'; "
            "base-uri 'self'; "
            "object-src 'none';"
        )
        
        # Security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        # Permissions Policy
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        
        return response

class RequestValidationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())

        try:
            if request.method in ["POST", "PUT", "PATCH"]:
                try:
                    await request.json()
                except JSONDecodeError:
                    raise HTTPException(status_code=400, detail="Invalid JSON")

            response = await call_next(request)
            response.headers["X-Request-ID"] = request.state.request_id
            return response

        except Exception as e:
            logger.error(f"Request validation error: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={"error": "Internal Server Error"}
            )

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        requests_per_minute: int = 60,
        burst_limit: int = 10,
        window_size: int = 60
    ):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.burst_limit = burst_limit
        self.window_size = window_size
        self.requests: Dict[str, List[Tuple[float, str]]] = {}
        self._cleanup_task = None
        self._lock = asyncio.Lock()

    async def _cleanup_old_requests(self):
        while True:
            try:
                current_time = time.time()
                async with self._lock:
                    for ip in list(self.requests.keys()):
                        self.requests[ip] = [
                            (t, path) for t, path in self.requests[ip]
                            if current_time - t < self.window_size
                        ]
                        if not self.requests[ip]:
                            del self.requests[ip]
                await asyncio.sleep(self.window_size)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")
                await asyncio.sleep(1)

    def _check_burst_limit(self, requests: List[Tuple[float, str]], current_time: float) -> bool:
        recent_requests = len([
            t for t, _ in requests 
            if current_time - t <= 1
        ])
        return recent_requests < self.burst_limit

    async def dispatch(self, request: Request, call_next):
        if not self._cleanup_task:
            self._cleanup_task = asyncio.create_task(self._cleanup_old_requests())

        client_ip = request.client.host
        current_time = time.time()

        async with self._lock:
            if client_ip not in self.requests:
                self.requests[client_ip] = []

            # Clean old requests for this IP
            self.requests[client_ip] = [
                (t, p) for t, p in self.requests[client_ip]
                if current_time - t < self.window_size
            ]

            requests_count = len(self.requests[client_ip])
            remaining = max(0, self.requests_per_minute - requests_count)

            if remaining <= 0:
                retry_after = int(self.window_size - (current_time - self.requests[client_ip][0][0]))
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Too many requests",
                        "retry_after": retry_after
                    },
                    headers={
                        "X-RateLimit-Limit": str(self.requests_per_minute),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(retry_after)
                    }
                )

            if not self._check_burst_limit(self.requests[client_ip], current_time):
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Request burst limit exceeded",
                        "retry_after": 1
                    }
                )

            self.requests[client_ip].append((current_time, request.url.path))

        response = await call_next(request)
        
        # Set rate limit headers
        reset_time = int(self.window_size - (current_time - self.requests[client_ip][0][0])) if self.requests[client_ip] else self.window_size
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining - 1)
        response.headers["X-RateLimit-Reset"] = str(reset_time)
        
        return response

class CacheMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, ttl: int = 300, maxsize: int = 1000):
        super().__init__(app)
        self.cache: Dict[str, Tuple[Response, float]] = {}
        self.ttl = ttl
        self.maxsize = maxsize
        self._cleanup_task = None

    async def _cleanup_expired(self):
        while True:
            current_time = time.time()
            expired = [key for key, (_, exp_time) in self.cache.items() if current_time > exp_time]
            for key in expired:
                del self.cache[key]
            await asyncio.sleep(60)

    def _get_cache_key(self, request: Request) -> str:
        return f"{request.method}:{request.url.path}:{request.query_params}"

    async def dispatch(self, request: Request, call_next):
        if request.method != "GET":
            return await call_next(request)

        cache_key = self._get_cache_key(request)
        current_time = time.time()

        # Return cached response if valid
        if cache_key in self.cache:
            response, expiry = self.cache[cache_key]
            if current_time < expiry:
                return Response(
                    content=response.body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type
                )

        # Get fresh response
        response = await call_next(request)

        # Cache successful JSON responses
        if response.status_code == 200 and "application/json" in response.headers.get("content-type", ""):
            # Store response body
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            
            # Create new response with the body
            cached_response = Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
            
            # Store in cache
            self.cache[cache_key] = (cached_response, current_time + self.ttl)
            
            # Start cleanup task if not running
            if not self._cleanup_task:
                self._cleanup_task = asyncio.create_task(self._cleanup_expired())

            # Return new response with the same body
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )

        return response

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response