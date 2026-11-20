from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api import customer_routes, health_routes, internal_routes
from app.core.config import settings
from app.core.database import dispose_database
from app.core.exceptions import register_exception_handlers
from app.core.logger import RequestContextMiddleware, setup_logging
from app.internal_services.recommendations.monthly_report import monthly_reports

VERSION = "2.0.0"
setup_logging()
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting %s v%s (%s) | model=%s", settings.app_name, VERSION, settings.app_env, settings.ollama_model)
    if settings.is_production and settings.jwt_secret.startswith("CHANGE_ME"):
        raise RuntimeError("Set JWT_SECRET before running in production")
    monthly_reports.start_scheduler()
    yield
    monthly_reports.stop_scheduler()
    await dispose_database()
    logger.info("Stopped")


app = FastAPI(title=settings.app_name, version=VERSION, lifespan=lifespan, default_response_class=ORJSONResponse,
              docs_url=None if settings.is_production else "/docs", redoc_url=None)
app.add_middleware(RequestContextMiddleware)
if settings.cors_origin_list:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
register_exception_handlers(app)

for module in (health_routes, internal_routes, customer_routes):
    app.include_router(module.router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
async def root():
    return {"service": settings.app_name, "version": VERSION, "docs": "/docs", "health": f"{settings.api_prefix}/health"}
