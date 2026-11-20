import pytest
from fastapi.testclient import TestClient

from app.api import internal_routes
from app.core.config import settings
from app.core.security import login_limiter
from app.customer_services import order_tracking as tracking_module
from app.main import app

from tests.test_tracking import fake_query, ref_date


@pytest.fixture
def client(memory_repository, tmp_output):
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200 and response.json()["status"] == "ok"
    assert response.headers["X-Request-ID"]


def test_ollama_down_gives_503_with_error_format(client):
    response = client.get("/api/health/ollama")
    assert response.status_code == 503
    body = response.json()
    assert body["success"] is False and body["error"]["code"] == "service_unavailable"


def test_validation_error_format(client):
    response = client.post("/api/internal/ask", json={"question": ""})
    assert response.status_code == 422 and response.json()["error"]["code"] == "validation_failed"


def test_ask_route(client, monkeypatch):
    async def fake_ask(question, language=None):
        return {"question": question, "language": "en", "domain": "finance", "domains": ["finance"],
                "reference_date": "2026-11-16", "sql": "SELECT 1", "reason": "r", "rows": [{"x": 1}],
                "row_count": 1, "truncated": False, "attempts": 1, "errors": [],
                "report": {"answer": "ok", "highlights": [], "recommendations": [], "statistics": {},
                           "columns": ["x"], "notes": []}, "elapsed_ms": 1.0}

    monkeypatch.setattr(internal_routes.analyzer, "ask", fake_ask)
    response = client.post("/api/internal/ask", json={"question": "What are our profits this month?"})
    assert response.status_code == 200, response.text
    assert response.json()["success"] is True and response.json()["report"]["answer"] == "ok"
    assert client.post("/api/internal/internal/ask", json={"question": "x y"}).status_code == 404  # old bug


def test_internal_routes_need_the_api_key_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "secret-key")
    body = {"sql": "SELECT as_of FROM analytics.v_as_of"}
    assert client.post("/api/internal/sql/validate", json=body).status_code == 401
    assert client.post("/api/internal/sql/validate", json=body, headers={"X-API-Key": "wrong"}).status_code == 401
    response = client.post("/api/internal/sql/validate", json=body, headers={"X-API-Key": "secret-key"})
    assert response.status_code == 200 and response.json()["valid"]


def test_chat_quotation_and_design_over_http(client):
    r = client.post("/api/customer/chat", json={
        "message": "I want a dining table 200x100x75, walnut, matte, brown, 1 piece, Cairo"}).json()
    sid = r["session_id"]
    for text in ("Mona Adel", "01234567890", "yes"):
        r = client.post("/api/customer/chat", json={"message": text, "session_id": sid}).json()
    assert r["status"] == "quoted", r["reply"]
    no = r["quotation"]["quotation_no"]

    assert client.get(f"/api/customer/quotations/{no}").status_code == 401
    assert client.get(f"/api/customer/quotations/{no}", headers={"X-Session-ID": "other"}).status_code == 401
    assert client.get(f"/api/customer/quotations/{no}", headers={"X-Session-ID": sid}).json()["total"] > 0

    design = client.post("/api/customer/designs", json={"quotation_no": no}, headers={"X-Session-ID": sid}).json()
    assert design["dimension_check"]["passed"]
    model = client.get(f"/api/customer/designs/{design['design_id']}/files/model.glb")
    assert model.status_code == 200 and model.content[:4] == b"glTF"
    assert client.get(f"/api/customer/designs/{design['design_id']}/files/secret.txt").status_code == 404
    decision = client.post(f"/api/customer/designs/{design['design_id']}/decision", json={"approved": True},
                           headers={"X-Session-ID": sid})
    assert decision.json()["status"] == "approved"


def test_unknown_session_is_404(client):
    response = client.post("/api/customer/chat", json={"message": "hi", "session_id": "does-not-exist"})
    assert response.status_code == 404


def test_order_tracking_over_http(client, monkeypatch):
    monkeypatch.setattr(tracking_module.order_tracking, "query", fake_query)
    monkeypatch.setattr(tracking_module.order_tracking, "reference_date_provider", ref_date)
    login_limiter.reset()
    assert client.get("/api/customer/orders/SO-1001").status_code == 401
    assert client.post("/api/customer/auth/login", json={"customer_id": 7, "order_no": "SO-2001"}).status_code == 401
    token = client.post("/api/customer/auth/login", json={"customer_id": 7, "order_no": "SO-1001"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    tracked = client.get("/api/customer/orders/SO-1001?language=en", headers=headers).json()
    assert tracked["production"]["progress_pct"] == 50.0
    assert client.get("/api/customer/orders/SO-2001", headers=headers).status_code == 404
    assert len(client.get("/api/customer/orders", headers=headers).json()["orders"]) == 2
    assert client.get("/api/customer/orders/SO-1001", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_login_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(tracking_module.order_tracking, "query", fake_query)
    login_limiter.reset()
    codes = [client.post("/api/customer/auth/login", json={"customer_id": 7, "order_no": "nope"}).status_code
             for _ in range(11)]
    assert codes[-1] == 429
    login_limiter.reset()
