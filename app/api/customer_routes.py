from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import FileResponse

from app.api.schemas import ChatRequest, ChatResponse, DesignDecision, DesignRequest, LoginRequest, TokenResponse
from app.core.exceptions import NotFoundError, UnauthorizedError
from app.core.security import client_ip, login_limiter, require_customer
from app.customer_services.chatbot import chatbot
from app.customer_services.design_generator import DesignService
from app.customer_services.order_tracking import order_tracking
from app.customer_services.repository import get_repository

router = APIRouter(prefix="/customer", tags=["customer"])
designs = DesignService()
MEDIA_TYPES = {"model.glb": "model/gltf-binary", "preview.png": "image/png", "viewer.html": "text/html",
               "spec.json": "application/json"}


def _session(x_session_id: str | None) -> str:
    if not x_session_id:
        raise UnauthorizedError("X-Session-ID header is required")
    return x_session_id


# ---------- Phase 3: chatbot + quotation ----------
@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    return await chatbot.handle(body.message, body.session_id, body.language)


@router.get("/chat/{session_id}")
async def chat_history(session_id: str):
    return await chatbot.history(session_id)


@router.get("/quotations/{quotation_no}")
async def get_quotation(quotation_no: str, x_session_id: str | None = Header(None)):
    quotation = await get_repository().get_quotation(quotation_no)
    if quotation is None:
        raise NotFoundError("Quotation not found")
    if quotation["session_id"] != _session(x_session_id):
        raise UnauthorizedError("This quotation belongs to another chat session")
    return quotation


# ---------- Phase 4: 3D design ----------
@router.post("/designs")
async def create_design(body: DesignRequest, x_session_id: str | None = Header(None)):
    return await designs.create(body.quotation_no, _session(x_session_id))


@router.get("/designs/{design_id}")
async def get_design(design_id: str, x_session_id: str | None = Header(None)):
    return await designs.get(design_id, _session(x_session_id))


@router.post("/designs/{design_id}/decision")
async def decide_design(design_id: str, body: DesignDecision, x_session_id: str | None = Header(None)):
    return await designs.decide(design_id, _session(x_session_id), body.approved, body.feedback)


@router.get("/designs/{design_id}/files/{name}")
async def design_file(design_id: str, name: str):
    """Public by unguessable design id so the 3D viewer link works in any browser."""
    return FileResponse(designs.file_path(design_id, name), media_type=MEDIA_TYPES.get(name))


# ---------- Phase 5: order tracking ----------
@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request):
    login_limiter.check(client_ip(request))
    return await order_tracking.login(body.customer_id, body.order_no)


@router.get("/orders")
async def my_orders(language: str = Query("ar", pattern="^(ar|en)$"), customer_id: int = Depends(require_customer)):
    return {"customer_id": customer_id, "orders": await order_tracking.my_orders(customer_id, language)}


@router.get("/orders/{order_no}")
async def track_order(order_no: str, language: str = Query("ar", pattern="^(ar|en)$"),
                      customer_id: int = Depends(require_customer)):
    return await order_tracking.track(customer_id, order_no, language)
