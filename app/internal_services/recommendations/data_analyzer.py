from __future__ import annotations

import datetime as dt
from typing import Any

import pandas as pd

from app.core.database import fetch_all, get_reference_date

QUERIES: dict[str, str] = {
    "monthly_sales": """
        SELECT sale_month, SUM(orders) AS orders, SUM(units) AS units, SUM(net_revenue) AS net_revenue,
               SUM(gross_profit) AS gross_profit
        FROM analytics.v_monthly_sales GROUP BY sale_month ORDER BY sale_month""",
    "branch_pnl": """
        SELECT month_start, branch_id, branch_name_en, branch_name_ar, branch_type, revenue, cogs,
               delivery_cost, operating_expenses, net_profit
        FROM analytics.v_branch_monthly_pnl ORDER BY month_start, branch_id""",
    "company_pnl": """
        SELECT month_start, revenue, gross_profit, operating_expenses, net_profit, net_margin_pct
        FROM analytics.v_company_monthly_pnl ORDER BY month_start""",
    "product_monthly": """
        SELECT sale_month, sku, product_name_en, product_name_ar, category_name_en, category_name_ar,
               SUM(quantity) AS units, SUM(net_revenue) AS net_revenue, SUM(gross_profit) AS gross_profit
        FROM analytics.v_sales_lines
        GROUP BY sale_month, sku, product_name_en, product_name_ar, category_name_en, category_name_ar
        ORDER BY sale_month, sku""",
    "inventory": """
        SELECT sku, name_en, name_ar, material_type, unit, stock_qty, reorder_level, stock_value, stock_status,
               supplier_name_en, supplier_name_ar, lead_time_days
        FROM analytics.v_inventory_status""",
    "production": """
        SELECT po_no, sku, product_name_en, product_name_ar, status, quantity, planned_end, is_late,
               material_cost, labor_cost, standard_cost, current_stage_en
        FROM analytics.v_production_status""",
}

DATE_COLUMNS = {"sale_month", "month_start", "planned_end"}


def to_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    for column in frame.columns:
        if column in DATE_COLUMNS:
            frame[column] = pd.to_datetime(frame[column]).dt.tz_localize(None) if len(frame) else frame[column]
    return frame


class HistoricalDataLoader:
    async def load(self) -> tuple[dict[str, pd.DataFrame], dt.date]:
        data = {name: to_frame(await fetch_all(sql)) for name, sql in QUERIES.items()}
        return data, await get_reference_date()
