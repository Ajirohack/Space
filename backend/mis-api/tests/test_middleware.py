from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
import pytest
import json
from datetime import datetime, timedelta
import time
import asyncio
from middleware import (
    TimingMiddleware,
    RateLimitMiddleware,
    RequestValidationMiddleware,
    SecurityMiddleware,
    CacheMiddleware
)
from httpx import ASGITransport

@pytest.fixture
def app():
    app = FastAPI()
    return app

@pytest.fixture
def client(app):
    return TestClient(app, transport=ASGITransport(app=app))

def test_timing_middleware(app, client):
    app.add_middleware(TimingMiddleware)
    
    @app.get("/test")
    async def test_endpoint():
        return {"message": "test"}
    
    response = client.get("/test")
    assert response.status_code == 200
    assert "X-Process-Time" in response.headers
    process_time = float(response.headers["X-Process-Time"])
    assert process_time >= 0

def test_rate_limit_middleware(app, client):
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=2,
        burst_limit=2,
        window_size=60
    )
    
    @app.get("/test")
    async def test_endpoint():
        return {"message": "test"}
    
    # First request should succeed
    response1 = client.get("/test")
    assert response1.status_code == 200
    assert "X-RateLimit-Remaining" in response1.headers
    
    # Second request should succeed
    response2 = client.get("/test")
    assert response2.status_code == 200
    
    # Third request should fail with rate limit error
    response3 = client.get("/test")
    assert response3.status_code == 429
    assert "error" in response3.json()
    assert "retry_after" in response3.json()

def test_request_validation_middleware(app, client):
    app.add_middleware(RequestValidationMiddleware)
    
    @app.post("/test")
    async def test_endpoint(data: dict):
        return data
    
    # Test valid JSON request
    response = client.post("/test", json={"key": "value"})
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    
    # Test invalid JSON request
    response = client.post("/test", data="invalid json")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"

def test_security_middleware(app, client):
    app.add_middleware(SecurityMiddleware)
    
    @app.get("/test")
    async def test_endpoint():
        return {"message": "test"}
    
    response = client.get("/test")
    assert response.status_code == 200
    
    # Check security headers
    headers = response.headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["X-XSS-Protection"] == "1; mode=block"
    assert headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"
    
    # Check Content-Security-Policy
    csp = headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net" in csp
    assert "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net" in csp
    assert "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.jsdelivr.net" in csp
    assert "font-src 'self' https://fonts.gstatic.com" in csp
    assert "connect-src 'self' ws: wss:" in csp
    assert "frame-ancestors 'self'" in csp
    assert "base-uri 'self'" in csp
    assert "object-src 'none'" in csp
    
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

def test_cache_middleware(app, client):
    app.add_middleware(CacheMiddleware, ttl=5)
    
    request_count = 0
    
    @app.get("/test")
    async def test_endpoint():
        nonlocal request_count
        request_count += 1
        return Response(
            content=json.dumps({"count": request_count}),
            media_type="application/json"
        )
    
    # First request should increment counter
    response1 = client.get("/test")
    assert response1.status_code == 200
    assert response1.json()["count"] == 1
    
    # Second request should return cached result
    response2 = client.get("/test")
    assert response2.status_code == 200
    assert response2.json()["count"] == 1  # Should be cached value

def test_cache_middleware_different_paths(app, client):
    app.add_middleware(CacheMiddleware, ttl=5)
    
    request_count = 0
    
    @app.get("/test1")
    async def test_endpoint1():
        nonlocal request_count
        request_count += 1
        return Response(
            content=json.dumps({"count": request_count}),
            media_type="application/json"
        )
        
    @app.get("/test2")
    async def test_endpoint2():
        nonlocal request_count
        request_count += 1
        return Response(
            content=json.dumps({"count": request_count}),
            media_type="application/json"
        )
    
    # Test first path
    response1 = client.get("/test1")
    assert response1.status_code == 200
    assert response1.json()["count"] == 1
    
    # Test second path
    response2 = client.get("/test2")
    assert response2.status_code == 200
    assert response2.json()["count"] == 2
    
    # Cached responses should maintain their values
    response3 = client.get("/test1")
    assert response3.json()["count"] == 1  # From cache
    
    response4 = client.get("/test2")
    assert response4.json()["count"] == 2  # From cache