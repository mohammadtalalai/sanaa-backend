from __future__ import annotations

from fastapi import APIRouter, Depends

from app.ai.llm import llm
from app.core.config import settings
from app.core.database import check_database, get_reference_date, inspect_views
from app.core.exceptions import ServiceUnavailableError
from app.core.security import require_internal_api_key

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health():
    return {"status": "ok", "service": settings.app_name, "environment": settings.app_env}


@router.get("/database")
async def database_health():
    try:
        info = await check_database()
        info["reference_date"] = (await get_reference_date()).isoformat()
    except Exception as exc:  # noqa: BLE001
        raise ServiceUnavailableError(f"Database is not reachable: {str(exc).splitlines()[0]}") from exc
    return {"status": "ok", **info}


@router.get("/views", dependencies=[Depends(require_internal_api_key)])
async def views_health():
    try:
        return await inspect_views()
    except Exception as exc:  # noqa: BLE001
        raise ServiceUnavailableError(f"Database is not reachable: {str(exc).splitlines()[0]}") from exc


@router.get("/ollama")
async def ollama_health():
    info = await llm.health()
    if not info["reachable"]:
        raise ServiceUnavailableError("Ollama is not reachable", details=info)
    return {"status": "ok" if info["model_installed"] else "model_missing", **info}
