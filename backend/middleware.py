import logging
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse, Response
import time
import asyncio
import uuid
import json
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from cachetools import TTLCache

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

            remaining = self.requests_per_minute - len(self.requests[client_ip])

            if remaining <= 0:
                retry_after = self.window_size - (current_time - self.requests[client_ip][0][0])
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Too many requests",
                        "retry_after": int(retry_after)
                    },
                    headers={
                        "X-RateLimit-Limit": str(self.requests_per_minute),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int(retry_after))
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
        response.headers.update({
            "X-RateLimit-Limit": str(self.requests_per_minute),
            "X-RateLimit-Remaining": str(remaining - 1),
            "X-RateLimit-Reset": str(self.window_size)
        })
        return response

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response

class RequestValidationMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.logger = logger.getChild('request_validation')

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        try:
            if request.method in ["POST", "PUT", "PATCH"]:
                content_type = request.headers.get("content-type", "")
                if "application/json" in content_type.lower():
                    try:
                        body = await request.body()
                        if body:
                            try:
                                json.loads(body)
                            except json.JSONDecodeError:
                                self.logger.warning(f"Invalid JSON in request to {request.url.path}")
                                return JSONResponse(
                                    status_code=400,
                                    content={"detail": "Invalid JSON"},
                                    headers={"X-Request-ID": request_id}
                                )
                    except RuntimeError:
                        pass
            
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
            
        except Exception as e:
            self.logger.error(f"Request validation error: {str(e)}")
            return JSONResponse(
                status_code=400,
                content={"detail": str(e)},
                headers={"X-Request-ID": request_id}
            )

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        csp_directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
            "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.jsdelivr.net",
            "font-src 'self' https://fonts.gstatic.com",
            "connect-src 'self' ws: wss:",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "object-src 'none'"
        ]
        
        response.headers.update({
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "; ".join(csp_directives),
            "Referrer-Policy": "strict-origin-when-cross-origin"
        })
        return response

class CacheMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, ttl: int = 300):
        super().__init__(app)
        self.cache = TTLCache(maxsize=1000, ttl=ttl)
        self._lock = asyncio.Lock()

    async def dispatch(self, request: Request, call_next):
        if request.method != "GET":
            return await call_next(request)

        cache_key = str(request.url)

        # Try to get from cache first
        cached_response = self.cache.get(cache_key)
        if cached_response is not None:
            # Return cached response
            return JSONResponse(
                content=cached_response["content"],
                headers=cached_response["headers"]
            )

        # Get fresh response
        response = await call_next(request)
        
        if response.status_code == 200:
            try:
                # Store in cache if it's a JSON response
                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type.lower():
                    body = b""
                    async for chunk in response.body_iterator:
                        body += chunk
                    
                    content = json.loads(body)
                    async with self._lock:
                        self.cache[cache_key] = {
                            "content": content,
                            "headers": dict(response.headers)
                        }
                    
                    # Return fresh JSONResponse
                    return JSONResponse(
                        content=content,
                        headers=dict(response.headers)
                    )
            except Exception as e:
                logger.error(f"Error caching response: {e}")
        
        return response