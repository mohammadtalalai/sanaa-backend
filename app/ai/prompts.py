from __future__ import annotations

import json
from functools import lru_cache

from app.core.config import BASE_DIR

PROMPTS_DIR = BASE_DIR / "app" / "prompts"
LANGUAGE_NAMES = {"ar": "Arabic (Egyptian-friendly Modern Standard Arabic)", "en": "English"}


@lru_cache
def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8").strip()


def render(name: str, **values: str) -> str:
    text = load_prompt(name)
    for key, value in values.items():
        text = text.replace("{" + key + "}", value)
    return text


def sql_system_prompt(max_rows: int) -> str:
    return render("analysis_prompt", max_rows=str(max_rows))


def report_system_prompt(language: str) -> str:
    return render("report_prompt", language=LANGUAGE_NAMES.get(language, "English"))


def recommendation_system_prompt(language: str) -> str:
    return render("recommendation_prompt", language=LANGUAGE_NAMES.get(language, "English"))


def build_sql_prompt(question: str, context: str, views: list[str], reference_date: str | None,
                     previous_error: str | None = None, previous_sql: str | None = None) -> str:
    parts = [
        f"DATASET REFERENCE DATE (analytics.v_as_of): {reference_date or 'unknown'}",
        "ALLOWED VIEWS: " + ", ".join(f"analytics.{v}" for v in views),
        f"KNOWLEDGE:\n{context}",
        f"QUESTION:\n{question}",
    ]
    if previous_error:
        parts.append(f"YOUR PREVIOUS SQL FAILED.\nSQL:\n{previous_sql}\nERROR:\n{previous_error}\n"
                     "Fix the SQL and answer again with the same JSON format.")
    return "\n\n".join(parts)


def build_report_prompt(question: str, sql: str, rows: list[dict], reference_date: str | None,
                        truncated: bool, notes: list[str] | None = None,
                        comparison: dict | None = None) -> str:
    data = json.dumps(rows, ensure_ascii=False, default=str)
    shown = "\n(Only the first rows are shown.)" if truncated else ""
    data_notes = "".join(f"\n- {note}" for note in notes or [])
    important = (f"\nIMPORTANT DATA NOTES (mention them and do not draw trend conclusions that ignore them):{data_notes}"
                 if data_notes else "")
    computed = (f"\nCOMPUTED COMPARISON (exact - use these percentages, do not recalculate):\n"
                f"{json.dumps(comparison, ensure_ascii=False, default=str)}" if comparison else "")
    return (
        f"DATASET REFERENCE DATE: {reference_date or 'unknown'}{important}{computed}\n\n"
        f"QUESTION:\n{question}\n\nSQL USED:\n{sql}\n\nROWS ({len(rows)}):\n{data}{shown}"
    )


def build_recommendation_prompt(findings: list[dict], forecasts: list[dict], recommendations: list[dict],
                                period: str) -> str:
    return (
        f"PERIOD ANALYSED: {period}\n\n"
        f"FINDINGS:\n{json.dumps(findings, ensure_ascii=False, default=str)}\n\n"
        f"FORECASTS:\n{json.dumps(forecasts, ensure_ascii=False, default=str)}\n\n"
        f"RULE-BASED RECOMMENDATIONS:\n{json.dumps(recommendations, ensure_ascii=False, default=str)}"
    )
