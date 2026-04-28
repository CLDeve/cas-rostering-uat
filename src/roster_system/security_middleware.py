from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from roster_system.api.security import resolve_identity_from_token
from roster_system.config import settings
from roster_system.db import SessionLocal
from roster_system.models import AuditEvent


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-XSS-Protection", "0")
        response.headers.setdefault("Referrer-Policy", settings.security_referrer_policy)
        response.headers.setdefault("Permissions-Policy", settings.security_permissions_policy)
        response.headers.setdefault("Content-Security-Policy", settings.security_csp)
        if settings.security_hsts_enabled:
            response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        return response


@dataclass
class RateWindow:
    hits: deque[float]


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._windows: dict[str, RateWindow] = defaultdict(lambda: RateWindow(hits=deque()))
        self._lock = Lock()

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith(settings.api_prefix):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - 60.0

        with self._lock:
            window = self._windows[client_ip]
            while window.hits and window.hits[0] < window_start:
                window.hits.popleft()
            if len(window.hits) >= settings.rate_limit_per_minute:
                return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
            window.hits.append(now)

        return await call_next(request)


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if not request.url.path.startswith(settings.api_prefix):
            return response
        if request.method.upper() in {"GET", "HEAD", "OPTIONS"}:
            return response

        actor_subject = "anonymous"
        actor_role = "UNKNOWN"
        auth_header = request.headers.get("authorization")
        token: str | None = None
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()

        if token:
            try:
                identity = resolve_identity_from_token(token)
                actor_subject = identity.subject
                actor_role = identity.role.value
            except Exception:
                actor_subject = "invalid-token"
                actor_role = "UNKNOWN"

        event = AuditEvent(
            event_type="API_WRITE",
            method=request.method.upper(),
            path=request.url.path,
            actor_subject=actor_subject,
            actor_role=actor_role,
            client_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            status_code=response.status_code,
            success=200 <= response.status_code < 300,
            metadata_json=json.dumps({"query": str(request.url.query or "")}),
        )

        session = SessionLocal()
        try:
            session.add(event)
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()

        return response
