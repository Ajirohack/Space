FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/health || exit 1

# Development (default)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]

# Production (override in compose or deployment)
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--workers", "4", "--proxy-headers"]