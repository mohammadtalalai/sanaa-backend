from __future__ import annotations

import logging
import time
import uuid
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_FORMAT = "%(asctime)s | %(levelname)-7s | %(request_id)s | %(name)s | %(message)s"


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def setup_logging() -> None:
    root = logging.getLogger()
    if getattr(root, "_sanaa_configured", False):
        return
    root.setLevel(settings.log_level.upper())
    formatter = logging.Formatter(_FORMAT)
    request_filter = _RequestIdFilter()

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    console.addFilter(request_filter)
    root.addHandler(console)

    log_dir = settings.path(settings.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(log_dir / "sanaa.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.addFilter(request_filter)
    root.addHandler(file_handler)

    for noisy in ("httpx", "httpcore", "faster_whisper", "matplotlib", "apscheduler.executors"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    root._sanaa_configured = True  # type: ignore[attr-defined]


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


access_logger = logging.getLogger("app.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        elapsed = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        access_logger.info("%s %s -> %s (%.1f ms) [%s]", request.method, request.url.path,
                           response.status_code, elapsed, request_id)
        return response
