"""Shared fixtures. Unit tests need no database, Ollama or internet."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="sanaa_tests_"))
os.environ.update({
    "APP_ENV": "test",
    "LOG_DIR": str(_TMP / "logs"),
    "DESIGN_OUTPUT_DIR": str(_TMP / "designs"),
    "MONTHLY_REPORT_ENABLED": "false",
    "INTERNAL_API_KEY": "",
    "DB_APP_PASSWORD": "",
    "OLLAMA_BASE_URL": "http://127.0.0.1:9",   # nothing listens here
    "OLLAMA_TIMEOUT_SECONDS": "2",
    "JWT_SECRET": "test-secret-that-is-long-enough-for-hs256-signing",
    "PUBLIC_BASE_URL": "http://testserver",
})

import datetime as dt  # noqa: E402
import json  # noqa: E402

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pytest  # noqa: E402

from app.ai.llm import LLMError, extract_json, llm  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.customer_services.repository import InMemoryRepository, set_repository  # noqa: E402

REFERENCE_DATE = dt.date(2026, 11, 16)


@pytest.fixture
def tmp_output(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "design_output_dir", str(tmp_path / "designs"))
    return tmp_path


@pytest.fixture
def memory_repository():
    repository = InMemoryRepository()
    set_repository(repository)
    yield repository
    set_repository(None)


@pytest.fixture
def llm_offline(monkeypatch):
    async def fail(*_, **__):
        raise LLMError("offline")
    monkeypatch.setattr(llm, "chat", fail)
    return llm


class FakeLLM:
    """Returns queued answers (str or dict) and records the messages it received."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls: list[list[dict]] = []

    async def chat(self, messages, **_):
        self.calls.append(messages)
        if not self.answers:
            raise LLMError("no more fake answers")
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False)

    async def chat_json(self, messages, **kwargs):
        return extract_json(await self.chat(messages, **kwargs))


@pytest.fixture
def fake_llm():
    return FakeLLM


@pytest.fixture
def historical_data() -> dict[str, pd.DataFrame]:
    """24 months of synthetic history up to the partial reference month (2026-11)."""
    rng = np.random.default_rng(7)
    months = pd.date_range("2024-12-01", "2026-11-01", freq="MS")
    season = 1 + 0.15 * np.sin(2 * np.pi * (months.month - 3) / 12)
    trend = np.linspace(1.0, 1.3, len(months))

    monthly = pd.DataFrame({"sale_month": months, "orders": (120 * season * trend).round(),
                            "units": (300 * season * trend).round(),
                            "net_revenue": 3_000_000 * season * trend + rng.normal(0, 40_000, len(months)),
                            "gross_profit": 1_200_000 * season * trend})
    monthly.loc[monthly.index[-1], ["orders", "units", "net_revenue", "gross_profit"]] *= 0.5  # partial month

    products = []
    catalogue = [("WRD-01", "Wardrobe Classic", "دولاب كلاسيك", "rising"),
                 ("BED-02", "King Bed", "سرير كينج", "flat"),
                 ("TBL-03", "Dining Table", "ترابيزة سفرة", "falling"),
                 ("SOF-04", "Sofa Comfort", "كنبة كومفورت", "flat")]
    for i, month in enumerate(months):
        for sku, en, ar, shape in catalogue:
            base = 40.0
            if shape == "rising":
                base = 20 + 2.5 * i
            elif shape == "falling":
                base = 70 - 2.8 * i
            units = max(base, 1)
            products.append({"sale_month": month, "sku": sku, "product_name_en": en, "product_name_ar": ar,
                             "category_name_en": "Furniture", "category_name_ar": "أثاث", "units": round(units),
                             "net_revenue": units * 15000, "gross_profit": units * 6000})
    branches = []
    for month in months:
        for bid, en, ar, kind, profit in [(1, "Cairo Showroom", "معرض القاهرة", "showroom", 400_000),
                                          (2, "Alexandria", "الإسكندرية", "showroom", 250_000),
                                          (3, "Giza Outlet", "منفذ الجيزة", "showroom", -60_000),
                                          (9, "Factory - 10th of Ramadan", "المصنع", "factory", -300_000)]:
            branches.append({"month_start": month, "branch_id": bid, "branch_name_en": en, "branch_name_ar": ar,
                             "branch_type": kind, "revenue": 0 if kind == "factory" else 1_000_000, "cogs": 0,
                             "delivery_cost": 0, "operating_expenses": 0, "net_profit": profit})
    company = pd.DataFrame({"month_start": months, "revenue": monthly["net_revenue"],
                            "gross_profit": monthly["gross_profit"], "operating_expenses": 500_000,
                            "net_profit": monthly["gross_profit"] - 500_000, "net_margin_pct": 20.0})
    inventory = pd.DataFrame([
        {"sku": "MAT-OAK", "name_en": "Oak board", "name_ar": "لوح أرو", "material_type": "wood", "unit": "m2",
         "stock_qty": 40, "reorder_level": 100, "stock_value": 40_000, "stock_status": "LOW",
         "supplier_name_en": "Nile Timber", "supplier_name_ar": "نايل للأخشاب", "lead_time_days": 21},
        {"sku": "MAT-GLUE", "name_en": "Glue", "name_ar": "غراء", "material_type": "consumable", "unit": "kg",
         "stock_qty": 500, "reorder_level": 100, "stock_value": 20_000, "stock_status": "OK",
         "supplier_name_en": "ChemCo", "supplier_name_ar": "كيم كو", "lead_time_days": 5},
    ])
    production = pd.DataFrame([
        {"po_no": f"PO-{i}", "sku": "WRD-01", "product_name_en": "Wardrobe Classic", "product_name_ar": "دولاب كلاسيك",
         "status": status, "quantity": 1, "planned_end": pd.Timestamp("2026-11-01"), "is_late": late,
         "material_cost": mat, "labor_cost": 2000, "standard_cost": 10000, "current_stage_en": "Assembly"}
        for i, (status, late, mat) in enumerate([("in_progress", True, 0), ("in_progress", True, 0),
                                                 ("in_progress", False, 0), ("completed", False, 10500),
                                                 ("completed", False, 10200)])
    ])
    return {"monthly_sales": monthly, "product_monthly": pd.DataFrame(products), "branch_pnl": pd.DataFrame(branches),
            "company_pnl": company, "inventory": inventory, "production": production}
