from __future__ import annotations

import calendar
import datetime as dt
import logging
from pathlib import Path
from typing import Any

from app.ai.llm import LLMError, OllamaClient, llm
from app.ai.prompts import build_report_prompt, report_system_prompt
from app.core.config import settings

logger = logging.getLogger(__name__)
MAX_ROWS_FOR_MODEL = 40

PARTIAL_MONTH_NOTE = {
    "ar": "تنبيه: شهر {month} لم يكتمل بعد (تاريخ البيانات {date})، والمصروفات التشغيلية قد لا تكون مسجلة، لذلك صافي الربح لهذا الشهر غير نهائي.",
    "en": "Note: {month} is not complete yet (data as of {date}) and operating expenses may not be recorded, so its net profit is not final.",
}
FACTORY_NOTE = {
    "ar": "ملاحظة: صفوف المصنع ليس لها إيرادات وتتحمل التكاليف المركزية، لذلك تظهر بخسارة؛ قارن فروع البيع فيما بينها.",
    "en": "Note: factory rows have no revenue and carry central costs, so they show a loss; compare the sales branches among themselves.",
}
PERIOD_COLUMNS = ("month_start", "sale_month", "sale_date")

RUN_RATE_NOTE = {
    "ar": "بمعدل البيع الحالي ({days} من {month_days} يوم)، المتوقع لشهر {month} كامل: {column} {estimate} ({change} مقارنة بـ {previous_period}).",
    "en": "At the current pace ({days} of {month_days} days), the full month {month} would reach {column} {estimate} ({change} vs {previous_period}).",
}
METRIC_LABELS = {
    "ar": {"net_revenue": "صافي الإيرادات", "revenue": "الإيرادات", "units": "عدد القطع", "orders": "عدد الطلبات",
           "net_profit": "صافي الربح", "gross_profit": "مجمل الربح"},
    "en": {"net_revenue": "net revenue", "revenue": "revenue", "units": "units", "orders": "orders",
           "net_profit": "net profit", "gross_profit": "gross profit"},
}
NON_ADDITIVE = ("pct", "margin", "avg", "rate", "_id", "price")

NO_DATA = {
    "ar": "لا توجد بيانات تطابق هذا السؤال في الفترة المتاحة.",
    "en": "No data matches this question in the available period.",
}
FALLBACK_INTRO = {"ar": "نتيجة الاستعلام:", "en": "Query result:"}


def summarize_columns(rows: list[dict]) -> dict[str, dict[str, float]]:
    """min / max / sum / avg for every numeric column (exact, computed in Python)."""
    stats: dict[str, dict[str, float]] = {}
    if not rows:
        return stats
    for column in rows[0]:
        values = [r[column] for r in rows if isinstance(r.get(column), (int, float)) and not isinstance(r.get(column), bool)]
        if values and len(values) == sum(1 for r in rows if r.get(column) is not None):
            stats[column] = {"min": round(min(values), 2), "max": round(max(values), 2),
                             "sum": round(sum(values), 2), "avg": round(sum(values) / len(values), 2)}
    return stats


def data_notes(rows: list[dict], language: str, reference_date: str | None) -> list[str]:
    """Deterministic data-quality notes: partial current month, factory central costs."""
    notes: list[str] = []
    if not rows:
        return notes
    if reference_date:
        current_month = reference_date[:7]
        if any(str(row.get(column) or "")[:7] == current_month for row in rows for column in PERIOD_COLUMNS):
            notes.append(PARTIAL_MONTH_NOTE[language].format(month=current_month, date=reference_date))
    if any(str(row.get("branch_type") or "").lower() == "factory" for row in rows):
        notes.append(FACTORY_NOTE[language])
    return notes


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def period_comparison(rows: list[dict], reference_date: str | None) -> dict[str, Any] | None:
    """Exact change between the last two periods; full-month estimate when the last one is the partial month."""
    if len(rows) < 2:
        return None
    column = next((c for c in PERIOD_COLUMNS if c in rows[0]), None)
    if column is None:
        return None
    by_period: dict[str, dict] = {}
    for row in rows:
        by_period.setdefault(str(row.get(column))[:10], row)
    if len(by_period) != len(rows):  # several rows per period (e.g. per branch): not a simple comparison
        return None
    (previous_period, previous), (current_period, current) = sorted(by_period.items())[-2:]
    partial = bool(reference_date) and current_period[:7] == reference_date[:7] and column != "sale_date"
    days = month_days = None
    if partial:
        ref = dt.date.fromisoformat(reference_date[:10])
        days, month_days = ref.day, calendar.monthrange(ref.year, ref.month)[1]
    changes: dict[str, dict[str, Any]] = {}
    for key, value in current.items():
        if key == column or not _number(value) or not _number(previous.get(key)):
            continue
        before = float(previous[key])
        entry: dict[str, Any] = {"previous": before, "current": float(value),
                                 "change_pct": round((value - before) / abs(before) * 100, 2) if before else None}
        if partial and not any(word in key.lower() for word in NON_ADDITIVE):
            estimate = round(float(value) / days * month_days, 2)
            entry["full_month_estimate"] = estimate
            entry["estimated_change_pct"] = round((estimate - before) / abs(before) * 100, 2) if before else None
        changes[key] = entry
    if not changes:
        return None
    return {"period_column": column, "previous_period": previous_period, "current_period": current_period,
            "current_is_partial": partial, "days_elapsed": days, "days_in_month": month_days, "changes": changes}


def comparison_notes(comparison: dict[str, Any] | None, language: str) -> list[str]:
    if not comparison or not comparison["current_is_partial"]:
        return []
    preferred = ("net_revenue", "revenue", "units", "orders", "net_profit", "gross_profit")
    key = next((k for k in preferred if k in comparison["changes"] and "full_month_estimate" in comparison["changes"][k]), None)
    if key is None:
        return []
    entry = comparison["changes"][key]
    change = entry["estimated_change_pct"]
    return [RUN_RATE_NOTE[language].format(
        days=comparison["days_elapsed"], month_days=comparison["days_in_month"],
        month=comparison["current_period"][:7], column=METRIC_LABELS[language][key], estimate=f"{entry['full_month_estimate']:,.0f}",
        change="n/a" if change is None else f"{change:+.1f}%", previous_period=comparison["previous_period"][:7])]


def _fallback_answer(rows: list[dict], language: str) -> str:
    preview = rows[:5]
    lines = [", ".join(f"{k}: {v}" for k, v in row.items()) for row in preview]
    return FALLBACK_INTRO[language] + "\n" + "\n".join(lines)


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


class ReportGenerator:
    def __init__(self, client: OllamaClient | None = None):
        self.client = client or llm

    async def generate(self, question: str, sql: str, rows: list[dict], language: str,
                       reference_date: str | None, truncated: bool = False) -> dict[str, Any]:
        report: dict[str, Any] = {
            "answer": "",
            "highlights": [],
            "recommendations": [],
            "statistics": summarize_columns(rows),
            "columns": list(rows[0].keys()) if rows else [],
            "notes": data_notes(rows, language, reference_date),
            "comparison": period_comparison(rows, reference_date),
        }
        report["notes"] += comparison_notes(report["comparison"], language)
        if not rows:
            report["answer"] = NO_DATA[language]
            return report
        prompt = build_report_prompt(
            question, sql, rows[:MAX_ROWS_FOR_MODEL], reference_date, len(rows) > MAX_ROWS_FOR_MODEL,
            notes=report["notes"], comparison=report["comparison"],
        )
        try:
            data = await self.client.chat_json([
                {"role": "system", "content": report_system_prompt(language)},
                {"role": "user", "content": prompt},
            ])
            report["answer"] = str(data.get("answer") or "").strip() or _fallback_answer(rows, language)
            report["highlights"] = _as_list(data.get("highlights"))[:4]
            report["recommendations"] = _as_list(data.get("recommendations"))[:3]
        except LLMError as exc:
            logger.warning("Report generation failed, using plain result: %s", exc)
            report["answer"] = _fallback_answer(rows, language)
        return report


def save_markdown(result: dict[str, Any], directory: Path | None = None) -> Path:
    """Save an analysis result as Markdown under reports/."""
    folder = directory or settings.path("reports")
    folder.mkdir(parents=True, exist_ok=True)
    report = result["report"]
    lines = [f"# {result['question']}", "", report["answer"], "", *[f"> {n}" for n in report["notes"]], ""]
    if report["highlights"]:
        lines += ["## Highlights", *[f"- {h}" for h in report["highlights"]], ""]
    if report["recommendations"]:
        lines += ["## Recommendations", *[f"- {r}" for r in report["recommendations"]], ""]
    lines += ["## SQL", "```sql", result.get("sql") or "", "```"]
    path = folder / f"analysis_{dt.datetime.now():%Y%m%d_%H%M%S}.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
