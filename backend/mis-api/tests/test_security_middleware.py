from fastapi import FastAPI
from fastapi.testclient import TestClient
from middleware import SecurityMiddleware

def test_security_middleware():
    app = FastAPI()
    app.add_middleware(SecurityMiddleware)
    
    @app.get("/test")
    async def test_endpoint():
        return {"message": "test"}
    
    client = TestClient(app)
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
