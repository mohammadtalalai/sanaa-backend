from __future__ import annotations

import datetime as dt
import decimal
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.config import settings

logger = logging.getLogger(__name__)

# Views documented in knowledge_base/database_schema.md -> expected columns
EXPECTED_VIEWS: dict[str, list[str]] = {
    "v_as_of": ["as_of"],
    "v_sales_lines": ["line_id", "order_id", "order_no", "sale_date", "sale_month", "branch_id", "branch_name_en",
                      "branch_name_ar", "order_type", "channel", "order_status", "delivery_city", "product_id", "sku",
                      "product_name_en", "product_name_ar", "category_code", "category_name_en", "category_name_ar",
                      "wood_en", "wood_ar", "finish_en", "finish_ar", "width_cm", "depth_cm", "height_cm",
                      "quantity", "net_revenue", "cogs", "gross_profit"],
    "v_orders": ["order_id", "order_no", "customer_id", "branch_id", "branch_name_en", "branch_name_ar",
                 "sales_rep_id", "sales_rep_en", "sales_rep_ar", "order_type", "channel", "status", "created_at",
                 "confirmed_at", "sale_month", "promised_date", "delivered_at", "is_sale", "subtotal",
                 "discount_amount", "discount_pct", "net_amount", "vat_amount", "total_amount", "delivered_late",
                 "days_to_deliver", "delivery_city", "cancel_reason"],
    "v_monthly_sales": ["sale_month", "branch_id", "branch_name_en", "branch_name_ar", "orders", "units",
                        "net_revenue", "cogs", "gross_profit", "gross_margin_pct"],
    "v_product_performance": ["product_id", "sku", "product_name_en", "product_name_ar", "category_code",
                              "category_name_en", "category_name_ar", "units", "orders", "net_revenue", "cogs",
                              "gross_profit", "gross_margin_pct", "first_sale", "last_sale"],
    "v_branch_monthly_pnl": ["month_start", "branch_id", "branch_code", "branch_name_en", "branch_name_ar",
                             "branch_type", "revenue", "cogs", "delivery_cost", "gross_profit",
                             "operating_expenses", "net_profit"],
    "v_company_monthly_pnl": ["month_start", "revenue", "cogs", "delivery_cost", "gross_profit",
                              "operating_expenses", "net_profit", "net_margin_pct"],
    "v_order_tracking": ["order_id", "order_no", "customer_id", "branch_id", "status", "status_label_ar",
                         "status_label_en", "status_seq", "created_at", "confirmed_at", "promised_date",
                         "delivered_at", "last_update_at", "total_steps", "completed_steps", "total_amount",
                         "paid_amount", "balance_due"],
    "v_inventory_status": ["material_id", "sku", "name_en", "name_ar", "material_type", "unit", "stock_qty",
                           "reorder_level", "stock_value", "stock_status", "supplier_name_en", "supplier_name_ar",
                           "lead_time_days"],
    "v_production_status": ["production_order_id", "po_no", "order_no", "sales_branch_id", "sku",
                            "product_name_en", "product_name_ar", "status", "quantity", "planned_start",
                            "planned_end", "actual_start", "actual_end", "total_steps", "completed_steps",
                            "current_stage_en", "is_late", "material_cost", "labor_cost", "standard_cost"],
    "v_customer_summary": ["customer_id", "city", "city_ar", "customer_type", "source", "preferred_language",
                           "created_at", "orders_count", "lifetime_net_revenue", "first_order_at",
                           "last_order_at"],
    "v_supplier_monthly": ["month_start", "supplier_id", "name_en", "name_ar", "purchase_orders", "total_spend",
                           "avg_delay_days", "late_deliveries"],
}

_read_engine: AsyncEngine | None = None
_app_engine: AsyncEngine | None = None


def _make_engine(url: str, *, read_only: bool) -> AsyncEngine:
    server_settings = {
        "application_name": "sanaa_ai",
        "statement_timeout": str(settings.db_statement_timeout_ms),
        "timezone": settings.timezone,
    }
    if read_only:
        server_settings["default_transaction_read_only"] = "on"
    return create_async_engine(
        url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args={"server_settings": server_settings, "timeout": 10},
    )


def get_read_engine() -> AsyncEngine:
    global _read_engine
    if _read_engine is None:
        _read_engine = _make_engine(settings.database_url, read_only=True)
    return _read_engine


def get_app_engine() -> AsyncEngine:
    global _app_engine
    if _app_engine is None:
        _app_engine = _make_engine(settings.app_database_url, read_only=False)
    return _app_engine


@asynccontextmanager
async def get_db() -> AsyncIterator[AsyncConnection]:
    """Read-only connection (analytics views)."""
    async with get_read_engine().connect() as conn:
        yield conn


@asynccontextmanager
async def app_session() -> AsyncIterator[AsyncConnection]:
    """Transactional connection for schema sanaa_ai (commits on success)."""
    async with get_app_engine().begin() as conn:
        yield conn


async def dispose_database() -> None:
    global _read_engine, _app_engine
    for engine in (_read_engine, _app_engine):
        if engine is not None:
            await engine.dispose()
    _read_engine = _app_engine = None


def to_jsonable(value: Any) -> Any:
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value).hex()
    return value


async def fetch_all(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    async with get_db() as conn:
        result = await conn.execute(text(sql), params or {})
        return [{k: to_jsonable(v) for k, v in row.items()} for row in result.mappings().all()]


async def check_database() -> dict[str, Any]:
    async with get_db() as conn:
        row = (await conn.execute(text(
            "SELECT current_database() AS database, current_user AS db_user, version() AS version, "
            "current_setting('transaction_read_only') AS read_only"
        ))).mappings().one()
    return {"database": row["database"], "user": row["db_user"], "read_only": row["read_only"] == "on",
            "version": row["version"].split(",")[0]}


async def inspect_views() -> dict[str, Any]:
    """Check every documented view: columns match the docs and one row can be read."""
    report: dict[str, Any] = {}
    async with get_db() as conn:
        rows = (await conn.execute(text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = 'analytics' ORDER BY table_name, ordinal_position"
        ))).all()
        actual: dict[str, list[str]] = {}
        for table_name, column_name in rows:
            actual.setdefault(table_name, []).append(column_name)
        for view, expected in EXPECTED_VIEWS.items():
            columns = actual.get(view)
            if columns is None:
                report[view] = {"exists": False}
                continue
            entry: dict[str, Any] = {
                "exists": True,
                "missing_columns": [c for c in expected if c not in columns],
                "extra_columns": [c for c in columns if c not in expected],
            }
            try:
                await conn.execute(text(f"SELECT * FROM analytics.{view} LIMIT 1"))
                entry["readable"] = True
            except Exception as exc:  # noqa: BLE001 - reported to the caller
                entry["readable"] = False
                entry["error"] = str(exc).splitlines()[0]
                await conn.rollback()
            report[view] = entry
    ok = all(v.get("exists") and v.get("readable") and not v.get("missing_columns") for v in report.values())
    return {"ok": ok, "views": report}


async def get_reference_date() -> dt.date:
    """The dataset reference date (analytics.v_as_of), falling back to today."""
    try:
        async with get_db() as conn:
            value = (await conn.execute(text("SELECT as_of FROM analytics.v_as_of"))).scalar_one_or_none()
        if isinstance(value, dt.datetime):
            return value.date()
        if isinstance(value, dt.date):
            return value
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not read analytics.v_as_of: %s", exc)
    return dt.date.today()
