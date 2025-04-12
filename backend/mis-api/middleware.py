from fastapi import Request, Response, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Dict, List, Optional, Tuple, Union
import time
import asyncio
from datetime import datetime, timedelta
import re
import json
import uuid
import logging
from utils.logging import log_api_request

class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Set individual CSP directives with proper permissions for documentation
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'self'; "
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
        # Store request ID in state
        request.state.request_id = str(uuid.uuid4())
        
        try:
            # Validate request body if it exists
            if request.method in ["POST", "PUT", "PATCH"]:
                try:
                    await request.json()
                except JSONDecodeError:
                    raise HTTPException(status_code=400, detail="Invalid JSON")
            
            response = await call_next(request)
            
            # Add headers to response
            response.headers["X-Request-ID"] = request.state.request_id
            return response
            
        except Exception as e:
            logger.error(f"Request validation error: {str(e)}")
            raise

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

    async def _cleanup_old_requests(self):
        while True:
            current_time = time.time()
            for ip in list(self.requests.keys()):
                self.requests[ip] = [
                    (t, path) for t, path in self.requests[ip]
                    if current_time - t < self.window_size
                ]
                if not self.requests[ip]:
                    del self.requests[ip]
            await asyncio.sleep(self.window_size)

    def _check_burst_limit(self, requests: List[Tuple[float, str]], current_time: float) -> bool:
        # Count requests in last second
        recent_requests = len([
            t for t, _ in requests 
            if current_time - t <= 1
        ])
        return recent_requests < self.burst_limit

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host
        current_time = time.time()
        path = request.url.path

        # Initialize requests list for new IPs
        if client_ip not in self.requests:
            self.requests[client_ip] = []

        # Remove requests older than window size
        self.requests[client_ip] = [
            (t, p) for t, p in self.requests[client_ip]
            if current_time - t < self.window_size
        ]

        # Check rate limits
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Too many requests",
                    "retry_after": self.window_size - (current_time - self.requests[client_ip][0][0])
                }
            )

        # Check burst limit
        if not self._check_burst_limit(self.requests[client_ip], current_time):
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Request burst limit exceeded",
                    "retry_after": 1
                }
            )

        # Add current request
        self.requests[client_ip].append((current_time, path))

        # Add security headers
        response = await call_next(request)
        response.headers.update({
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'",
            "X-Rate-Limit-Limit": str(self.requests_per_minute),
            "X-Rate-Limit-Remaining": str(self.requests_per_minute - len(self.requests[client_ip])),
            "X-Rate-Limit-Reset": str(int(self.window_size - (current_time - self.requests[client_ip][0][0])))
        })

        return response

class CacheMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.cache: Dict[str, Tuple[any, float]] = {}
        self.cache_ttl = 300  # 5 minutes default TTL
        self.cacheable_paths = {
            '/health': 60,  # 1 minute TTL
            '/gpt-chat': 3600  # 1 hour TTL for chat responses
        }
        self._cleanup_task = asyncio.create_task(self._cleanup_expired())

    async def _cleanup_expired(self):
        while True:
            current_time = time.time()
            for key in list(self.cache.keys()):
                if current_time > self.cache[key][1]:
                    del self.cache[key]
            await asyncio.sleep(60)  # Cleanup every minute

    def _get_cache_key(self, request: Request) -> str:
        """Generate cache key from request"""
        return f"{request.method}:{request.url.path}:{request.query_params}"

    async def dispatch(self, request: Request, call_next):
        # Only cache GET requests
        if request.method != "GET":
            return await call_next(request)

        # Check if path is cacheable
        ttl = self.cacheable_paths.get(request.url.path)
        if not ttl:
            return await call_next(request)

        cache_key = self._get_cache_key(request)
        current_time = time.time()

        # Return cached response if valid
        if cache_key in self.cache:
            response, expiry = self.cache[cache_key]
            if current_time < expiry:
                return response

        # Get fresh response
        response = await call_next(request)
        
        # Cache successful responses
        if response.status_code == 200:
            self.cache[cache_key] = (response, current_time + ttl)

        return response

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response