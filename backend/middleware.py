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
from json.decoder import JSONDecodeError

# Initialize logger
logging.basicConfig(level=logging.INFO)
_logger = logging.getLogger(__name__)

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
        self._cleanup_task = asyncio.create_task(self._cleanup_old_requests())
        self._lock = asyncio.Lock()

    async def _cleanup_old_requests(self):
        while True:
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

    def _check_burst_limit(self, requests: List[Tuple[float, str]], current_time: float) -> bool:
        recent_requests = len([
            t for t, _ in requests 
            if current_time - t <= 1
        ])
        return recent_requests < self.burst_limit

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host
        current_time = time.time()

        async with self._lock:
            if client_ip not in self.requests:
                self.requests[client_ip] = []

            self.requests[client_ip] = [
                (t, p) for t, p in self.requests[client_ip]
                if current_time - t < self.window_size
            ]

            if len(self.requests[client_ip]) >= self.requests_per_minute:
                retry_after = self.window_size - (current_time - self.requests[client_ip][0][0])
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Too many requests",
                        "retry_after": retry_after
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
            remaining = self.requests_per_minute - len(self.requests[client_ip])

        response = await call_next(request)
        response.headers.update({
            "X-RateLimit-Limit": str(self.requests_per_minute),
            "X-RateLimit-Remaining": str(remaining),
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
        self._logger = _logger.getChild('request_validation')

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        try:
            if request.method in ["POST", "PUT", "PATCH"]:
                try:
                    body = await request.body()
                    if body:
                        try:
                            json.loads(body)
                        except JSONDecodeError:
                            self._logger.warning(f"Invalid JSON in request to {request.url.path}")
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
            self._logger.error(f"Request validation error: {str(e)}")
            return JSONResponse(
                status_code=400,
                content={"detail": str(e)},
                headers={"X-Request-ID": request_id}
            )

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.update({
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        })
        return response

class CacheMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, ttl: int = 300, maxsize: int = 1000):
        super().__init__(app)
        self.cache = TTLCache(maxsize=maxsize, ttl=ttl)
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

        # Get fresh response if not in cache
        response = await call_next(request)
        
        if response.status_code == 200:
            try:
                content = await self._get_json_content(response)
                if content is not None:
                    # Store in cache
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
            except:
                pass
        
        return response

    async def _get_json_content(self, response):
        try:
            body = await response.body()
            return json.loads(body)
        except (json.JSONDecodeError, RuntimeError, ValueError, TypeError):
            return None