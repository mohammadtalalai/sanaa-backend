from __future__ import annotations

import datetime as dt
import secrets
import time
from collections import defaultdict, deque

import jwt
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.exceptions import TooManyRequestsError, UnauthorizedError

_bearer = HTTPBearer(auto_error=False)
JWT_ALGORITHM = "HS256"


async def require_internal_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Internal (management) routes need X-API-Key. Without a configured key, only non-production is open."""
    expected = settings.internal_api_key
    if not expected:
        if settings.is_production:
            raise UnauthorizedError("INTERNAL_API_KEY is not configured on the server")
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise UnauthorizedError("Invalid or missing X-API-Key")


def create_customer_token(customer_id: int, *, extra: dict | None = None) -> tuple[str, int]:
    expires_in = settings.jwt_expire_minutes * 60
    now = dt.datetime.now(dt.timezone.utc)
    payload = {"sub": str(customer_id), "role": "customer", "iat": now,
               "exp": now + dt.timedelta(seconds=expires_in), **(extra or {})}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM), expires_in


def decode_customer_token(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Session expired, please log in again") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid token") from exc
    if payload.get("role") != "customer":
        raise UnauthorizedError("Invalid token")
    return int(payload["sub"])


async def require_customer(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> int:
    if credentials is None:
        raise UnauthorizedError("Login required")
    return decode_customer_token(credentials.credentials)


class RateLimiter:
    """In-memory sliding-window limiter (one server process)."""

    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window = window_seconds
        self._calls: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        calls = self._calls[key]
        while calls and now - calls[0] > self.window:
            calls.popleft()
        if len(calls) >= self.max_calls:
            raise TooManyRequestsError("Too many attempts, try again in a few minutes")
        calls.append(now)

    def reset(self) -> None:
        self._calls.clear()


login_limiter = RateLimiter(max_calls=10, window_seconds=300)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
