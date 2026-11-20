from __future__ import annotations

import datetime as dt
from typing import Any

import pandas as pd

from app.internal_services.recommendations.feature_engineering import (
    last_complete_month,
    monthly_series,
    pct_change,
    recent_vs_previous,
)
from app.internal_services.recommendations.forecasting import Forecaster
from app.internal_services.recommendations.models import Finding, Recommendation, RecommendationReport

TEXT = {
    "ar": {
        "sales_title": "اتجاه المبيعات",
        "sales_detail": "صافي إيرادات {month}: {value} جنيه ({mom} مقارنة بالشهر السابق، {yoy} مقارنة بنفس الشهر من العام الماضي).",
        "grow_action": "زيادة إنتاج ومخزون {name}",
        "grow_reason": "مبيعات آخر 3 شهور زادت {growth}% عن الثلاثة السابقة ({recent} وحدة)، والمتوقع الشهر القادم {forecast} وحدة.",
        "decline_action": "تقليل إنتاج {name} ومراجعة تسعيره وعرضه",
        "decline_reason": "مبيعات آخر 3 شهور انخفضت {growth}% عن الثلاثة السابقة.",
        "branch_action": "مراجعة مصروفات وأداء فرع {name}",
        "branch_reason": "صافي الربح سالب في {months} من آخر 3 شهور (الإجمالي {total} جنيه).",
        "branches_title": "أداء الفروع",
        "branch_best": "أفضل فرع في آخر 3 شهور: {name} بصافي ربح {total} جنيه.",
        "reorder_action": "إعادة طلب {name} ({qty} {unit})",
        "reorder_reason": "المخزون {stock} {unit} أقل من أو يساوي حد الطلب {level}، ومدة التوريد {lead} يوم من {supplier}.",
        "late_action": "متابعة أوامر الإنتاج المتأخرة",
        "late_reason": "{late} من {total} أمر إنتاج مفتوح متأخر ({pct}%).",
        "cost_action": "مراجعة تكلفة إنتاج {name}",
        "cost_reason": "التكلفة الفعلية أعلى من المعيارية بنسبة {pct}%.",
        "forecast_title": "توقع الإيرادات",
        "forecast_detail": "الإيراد المتوقع للشهور القادمة: {values}.",
        "na": "غير متاح",
    },
    "en": {
        "sales_title": "Sales trend",
        "sales_detail": "Net revenue in {month}: EGP {value} ({mom} vs previous month, {yoy} vs same month last year).",
        "grow_action": "Increase production and stock of {name}",
        "grow_reason": "Last 3 months sales grew {growth}% vs the previous 3 ({recent} units); next month forecast {forecast} units.",
        "decline_action": "Reduce production of {name} and review its price and display",
        "decline_reason": "Last 3 months sales fell {growth}% vs the previous 3.",
        "branch_action": "Review expenses and performance of {name}",
        "branch_reason": "Net profit was negative in {months} of the last 3 months (total EGP {total}).",
        "branches_title": "Branch performance",
        "branch_best": "Best branch in the last 3 months: {name} with net profit EGP {total}.",
        "reorder_action": "Reorder {name} ({qty} {unit})",
        "reorder_reason": "Stock {stock} {unit} is at or below the reorder level {level}; lead time {lead} days from {supplier}.",
        "late_action": "Follow up late production orders",
        "late_reason": "{late} of {total} open production orders are late ({pct}%).",
        "cost_action": "Review production cost of {name}",
        "cost_reason": "Actual cost is {pct}% above the standard cost.",
        "forecast_title": "Revenue forecast",
        "forecast_detail": "Expected revenue for the next months: {values}.",
        "na": "n/a",
    },
}


def _money(value: float) -> str:
    return f"{value:,.0f}"


def _pct(value: float | None, na: str) -> str:
    return na if value is None else f"{value:+.1f}%"


class Recommender:
    def __init__(self, forecaster: Forecaster | None = None, top_products: int = 5):
        self.forecaster = forecaster or Forecaster()
        self.top_products = top_products

    def build(self, data: dict[str, pd.DataFrame], reference_date: dt.date, language: str = "ar") -> RecommendationReport:
        t = TEXT[language]
        name_col = "product_name_ar" if language == "ar" else "product_name_en"
        branch_col = "branch_name_ar" if language == "ar" else "branch_name_en"
        material_col = "name_ar" if language == "ar" else "name_en"
        supplier_col = "supplier_name_ar" if language == "ar" else "supplier_name_en"
        until = last_complete_month(reference_date)
        findings: list[Finding] = []
        recs: list[Recommendation] = []
        forecasts = []

        # 1. Sales trend + revenue forecast (complete months only)
        revenue = monthly_series(data["monthly_sales"], "sale_month", "net_revenue", until)
        if len(revenue):
            current = float(revenue.iloc[-1])
            previous = float(revenue.iloc[-2]) if len(revenue) > 1 else None
            last_year = float(revenue.iloc[-13]) if len(revenue) > 12 else None
            mom, yoy = pct_change(current, previous), pct_change(current, last_year)
            findings.append(Finding("sales", t["sales_title"], t["sales_detail"].format(
                month=until.strftime("%Y-%m"), value=_money(current), mom=_pct(mom, t["na"]), yoy=_pct(yoy, t["na"])),
                "warning" if (mom or 0) < -10 else "info",
                {"month": until.strftime("%Y-%m"), "net_revenue": current, "mom_pct": mom, "yoy_pct": yoy}))
            revenue_forecast = self.forecaster.forecast(revenue, "company_net_revenue")
            forecasts.append(revenue_forecast)
            findings.append(Finding("sales", t["forecast_title"], t["forecast_detail"].format(
                values=", ".join(f"{p['month'][:7]}: {_money(p['value'])}" for p in revenue_forecast.forecast)),
                "info", {"forecast": revenue_forecast.forecast}))

        # 2. Products: growth / decline + unit forecasts for the best sellers
        products = data["product_monthly"]
        if not products.empty:
            trend = recent_vs_previous(products, "sku", "units", until)
            names = products.drop_duplicates("sku").set_index("sku")[name_col]
            top = trend.sort_values("recent", ascending=False).head(self.top_products)
            for _, row in top.iterrows():
                units = monthly_series(products[products["sku"] == row["sku"]], "sale_month", "units", until)
                result = self.forecaster.forecast(units, f"units_{row['sku']}")
                forecasts.append(result)
                growth = row["growth_pct"]
                if growth is not None and growth >= 10:
                    recs.append(Recommendation("production", t["grow_action"].format(name=names[row["sku"]]),
                                               t["grow_reason"].format(growth=f"{growth:.1f}", recent=int(row["recent"]),
                                                                       forecast=int(round(result.forecast[0]["value"]))),
                                               1, {"sku": row["sku"], "recent_units": row["recent"],
                                                   "previous_units": row["previous"], "growth_pct": growth,
                                                   "forecast_next_month": result.forecast[0]["value"]}))
            decliners = trend[(trend["previous"] >= 5) & trend["growth_pct"].notna()]
            decliners = decliners[decliners["growth_pct"].astype(float) <= -25].sort_values("growth_pct").head(3)
            for _, row in decliners.iterrows():
                recs.append(Recommendation("production", t["decline_action"].format(name=names[row["sku"]]),
                                           t["decline_reason"].format(growth=f"{abs(row['growth_pct']):.1f}"), 2,
                                           {"sku": row["sku"], "recent_units": row["recent"],
                                            "previous_units": row["previous"], "growth_pct": row["growth_pct"]}))

        # 3. Branches (sales branches only: factory rows carry central costs)
        branches = data["branch_pnl"]
        if not branches.empty:
            start = until - pd.offsets.MonthBegin(2)
            window = branches[(branches["month_start"] >= start) & (branches["month_start"] <= until)
                              & (branches["branch_type"].str.lower() != "factory")]
            summary = window.groupby(branch_col).agg(total=("net_profit", "sum"),
                                                     loss_months=("net_profit", lambda s: int((s < 0).sum())))
            if not summary.empty:
                best = summary["total"].idxmax()
                findings.append(Finding("branches", t["branches_title"],
                                        t["branch_best"].format(name=best, total=_money(summary.loc[best, "total"])),
                                        "info", {"branch": best, "net_profit_3m": summary.loc[best, "total"]}))
                for name, row in summary[summary["loss_months"] >= 2].iterrows():
                    recs.append(Recommendation("branches", t["branch_action"].format(name=name),
                                               t["branch_reason"].format(months=row["loss_months"], total=_money(row["total"])),
                                               1, {"branch": name, "loss_months": row["loss_months"],
                                                   "net_profit_3m": row["total"]}))

        # 4. Inventory
        inventory = data["inventory"]
        if not inventory.empty:
            low = inventory[inventory["stock_status"].str.upper() == "LOW"].sort_values("lead_time_days", ascending=False)
            for _, row in low.head(8).iterrows():
                quantity = max(float(row["reorder_level"]) * 2 - float(row["stock_qty"]), 0)
                recs.append(Recommendation("inventory", t["reorder_action"].format(
                    name=row[material_col], qty=f"{quantity:,.0f}", unit=row["unit"]),
                    t["reorder_reason"].format(stock=f"{float(row['stock_qty']):,.0f}", unit=row["unit"],
                                               level=f"{float(row['reorder_level']):,.0f}", lead=int(row["lead_time_days"] or 0),
                                               supplier=row[supplier_col]),
                    1 if (row["lead_time_days"] or 0) >= 14 else 2,
                    {"sku": row["sku"], "stock_qty": row["stock_qty"], "reorder_level": row["reorder_level"],
                     "suggested_qty": quantity}))

        # 5. Production
        production = data["production"]
        if not production.empty:
            open_orders = production[~production["status"].str.lower().isin(["completed", "cancelled"])]
            if len(open_orders):
                late = int(open_orders["is_late"].astype(bool).sum())
                pct = round(late / len(open_orders) * 100, 1)
                if late:
                    recs.append(Recommendation("production", t["late_action"],
                                               t["late_reason"].format(late=late, total=len(open_orders), pct=pct),
                                               1 if pct >= 20 else 2, {"late": late, "open": len(open_orders), "late_pct": pct}))
            done = production[production["status"].str.lower() == "completed"].copy()
            if len(done):
                done["actual"] = done["material_cost"].astype(float) + done["labor_cost"].astype(float)
                by_product = done.groupby(name_col).agg(actual=("actual", "sum"), standard=("standard_cost", "sum"))
                by_product["overrun_pct"] = (by_product["actual"] / by_product["standard"].replace(0, pd.NA) - 1) * 100
                for name, row in by_product[by_product["overrun_pct"] > 10].sort_values("overrun_pct", ascending=False).head(3).iterrows():
                    recs.append(Recommendation("production", t["cost_action"].format(name=name),
                                               t["cost_reason"].format(pct=f"{row['overrun_pct']:.1f}"), 2,
                                               {"product": name, "overrun_pct": round(float(row["overrun_pct"]), 2)}))

        recs.sort(key=lambda r: r.priority)
        report = RecommendationReport(language, reference_date.isoformat(), until.strftime("%Y-%m"),
                                      findings, forecasts, recs)
        report.evaluation = evaluate_report(report, data, until)
        return report


def evaluate_report(report: RecommendationReport, data: dict[str, pd.DataFrame], until: pd.Timestamp) -> dict[str, Any]:
    """Compare the recommendations and the models with the history they came from."""
    checks: list[dict[str, Any]] = []
    products = data["product_monthly"]
    trend = recent_vs_previous(products, "sku", "units", until).set_index("sku") if not products.empty else pd.DataFrame()

    for rec in report.recommendations:
        sku = rec.evidence.get("sku")
        if rec.area == "production" and sku and sku in trend.index:
            history = trend.loc[sku]
            growth = rec.evidence.get("growth_pct")
            consistent = (growth > 0 and history["recent"] > history["previous"]) or \
                         (growth < 0 and history["recent"] < history["previous"])
            checks.append({"check": f"trend matches history ({sku})", "passed": bool(consistent),
                           "detail": {"recent": history["recent"], "previous": history["previous"]}})
        if rec.area == "inventory":
            checks.append({"check": f"low stock confirmed ({rec.evidence.get('sku')})",
                           "passed": float(rec.evidence["stock_qty"]) <= float(rec.evidence["reorder_level"]),
                           "detail": rec.evidence})

    if "branch_type" in data["branch_pnl"]:
        factory_flagged = any(r.area == "branches" and "factory" in str(r.evidence.get("branch", "")).lower()
                              for r in report.recommendations)
        checks.append({"check": "factory not flagged as a losing sales branch", "passed": not factory_flagged})
    checks.append({"check": "partial reference month excluded",
                   "passed": report.last_complete_month < report.reference_date[:7]})

    tested = [f for f in report.forecasts if f.beats_naive is not None]
    wins = sum(1 for f in tested if f.beats_naive)
    return {
        "checks": checks,
        "checks_passed": all(c["passed"] for c in checks),
        "models_tested": len(tested),
        "model_win_rate_vs_naive": round(wins / len(tested) * 100, 1) if tested else None,
        "backtest": [{"target": f.target, "model_mae": f.backtest_mae, "naive_mae": f.naive_mae} for f in tested],
    }
