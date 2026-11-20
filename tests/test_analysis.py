import datetime as dt

import pytest

from app.ai.language import detect_language, normalize, to_western_digits
from app.ai.llm import LLMError, extract_json
from app.ai.prompts import build_report_prompt
from app.ai.rag import KnowledgeRetriever, detect_domains
from app.internal_services.analysis.analyzer import Analyzer
from app.internal_services.analysis.report_generator import (
    ReportGenerator,
    comparison_notes,
    data_notes,
    period_comparison,
    summarize_columns,
)
from app.internal_services.analysis.sql_executor import SQLExecutionError
from app.internal_services.analysis.sql_generator import SQLGenerator, parse_plan

PNL_SQL = ("SELECT month_start, net_profit FROM analytics.v_company_monthly_pnl "
           "WHERE month_start = DATE_TRUNC('month', (SELECT as_of FROM analytics.v_as_of))")
ROWS = [{"month_start": "2026-11-01", "revenue": 5_244_000.0, "net_profit": 1_871_159.25, "net_margin_pct": 35.68}]


async def _ref_date():
    return dt.date(2026, 11, 16)


def _analyzer(fake, executor):
    return Analyzer(generator=SQLGenerator(fake), reporter=ReportGenerator(fake), knowledge=KnowledgeRetriever(),
                    executor=executor, reference_date_provider=_ref_date)


def test_language_detection_and_normalisation():
    assert detect_language("ايه أكتر منتج بيحقق أرباح؟") == "ar"
    assert detect_language("What are our profits this month?") == "en"
    assert to_western_digits("٢٠٠×٦٠") == "200×60"
    assert normalize("أرباح الشهر") == normalize("ارباح الشهر")


@pytest.mark.parametrize("question, expected", [
    ("What are our profits this month?", "finance"),
    ("ايه أكتر منتج بيحقق أرباح؟", "sales"),
    ("Which branch has the highest losses?", "branches"),
    ("قارن مبيعات الشهر ده بالشهر اللي فات", "sales"),
    ("Which materials are low in stock?", "inventory"),
])
def test_domains_for_the_phase_questions(question, expected):
    assert expected in detect_domains(question)


async def test_retrieval_contains_views_and_completeness_rule():
    knowledge = await KnowledgeRetriever().retrieve("Which branch has the highest losses?")
    assert "v_branch_monthly_pnl" in knowledge["views"]
    assert "Data Completeness" in knowledge["rules"]
    assert "Factory rows have no revenue" in knowledge["context"]
    assert "v_order_tracking" not in knowledge["views"]


def test_extract_json_handles_think_blocks_and_fences():
    assert extract_json('<think>hmm</think>```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Sure! {"sql": "SELECT 1", "x": {"y": "}"}} done') == {"sql": "SELECT 1", "x": {"y": "}"}}
    with pytest.raises(LLMError):
        extract_json("no json here")


def test_parse_plan_variants():
    assert parse_plan('{"answerable": true, "sql": "SELECT 1", "reason": "r"}').sql == "SELECT 1"
    assert parse_plan("```sql\nSELECT sku FROM analytics.v_product_performance\n```").answerable
    assert not parse_plan('{"answerable": false, "sql": "", "reason": "no data"}').answerable


async def test_full_pipeline_with_fake_model(fake_llm):
    fake = fake_llm([
        {"answerable": True, "sql": PNL_SQL, "reason": "Company P&L for the reference month"},
        {"answer": "Net profit is EGP 1,871,159.", "highlights": ["EGP 1,871,159"], "recommendations": ["Watch costs"]},
    ])
    executed = []

    async def executor(sql, max_rows):
        executed.append(sql)
        return {"rows": ROWS, "row_count": 1, "truncated": False, "columns": list(ROWS[0])}

    result = await _analyzer(fake, executor).ask("What are our profits this month?")
    assert result["language"] == "en" and result["domain"] == "finance"
    assert result["sql"].endswith("LIMIT 100") and executed == [result["sql"]]
    assert result["report"]["answer"].startswith("Net profit")
    assert result["report"]["statistics"]["net_profit"]["sum"] == 1_871_159.25
    assert "2026-11-16" in fake.calls[0][1]["content"]              # reference date given to the model
    assert "English" in fake.calls[1][0]["content"]                  # report language
    assert "2026-11 is not complete" in result["report"]["notes"][0]  # partial-month warning
    assert "IMPORTANT DATA NOTES" in fake.calls[1][1]["content"]     # ...and the model is told about it


async def test_invalid_sql_is_retried_with_the_error(fake_llm):
    fake = fake_llm([
        {"answerable": True, "sql": "SELECT * FROM erp.orders", "reason": "bad"},
        {"answerable": True, "sql": PNL_SQL, "reason": "fixed"},
        {"answer": "ok"},
    ])

    async def executor(sql, max_rows):
        return {"rows": ROWS, "row_count": 1, "truncated": False, "columns": list(ROWS[0])}

    result = await _analyzer(fake, executor).ask("ايه صافي الربح الشهر ده؟")
    assert result["attempts"] == 2 and result["language"] == "ar"
    assert "YOUR PREVIOUS SQL FAILED" in fake.calls[1][1]["content"]
    assert result["errors"][0].startswith("validation")


async def test_database_error_is_retried(fake_llm):
    fake = fake_llm([
        {"answerable": True, "sql": PNL_SQL, "reason": "a"},
        {"answerable": True, "sql": PNL_SQL, "reason": "b"},
        {"answer": "ok"},
    ])
    calls = {"n": 0}

    async def executor(sql, max_rows):
        calls["n"] += 1
        if calls["n"] == 1:
            raise SQLExecutionError('column "x" does not exist')
        return {"rows": ROWS, "row_count": 1, "truncated": False, "columns": list(ROWS[0])}

    result = await _analyzer(fake, executor).ask("profit this month")
    assert result["attempts"] == 2 and 'column "x"' in fake.calls[1][1]["content"]


async def test_unanswerable_question(fake_llm):
    fake = fake_llm([{"answerable": False, "sql": "", "reason": "No weather data"}])

    async def executor(sql, max_rows):
        raise AssertionError("must not run")

    result = await _analyzer(fake, executor).ask("What will the weather be?")
    assert result["sql"] is None and "No weather data" in result["report"]["answer"]


async def test_report_falls_back_when_model_is_down(fake_llm):
    fake = fake_llm([LLMError("down")])
    report = await ReportGenerator(fake).generate("q", "SELECT 1", ROWS, "ar", "2026-11-16")
    assert report["answer"].startswith("نتيجة الاستعلام") and "1871159.25" in report["answer"]


def test_data_notes_flag_factory_and_partial_month():
    rows = [{"branch_name_en": "Factory", "branch_type": "factory", "total_net_profit": -5.0}]
    assert "مصنع" in data_notes(rows, "ar", "2026-11-16")[0]
    assert data_notes([{"month_start": "2026-10-01"}], "en", "2026-11-16") == []


def test_column_statistics():
    stats = summarize_columns([{"a": 1, "b": "x"}, {"a": 3, "b": "y"}])
    assert stats == {"a": {"min": 1, "max": 3, "sum": 4, "avg": 2.0}}


def test_report_prompt_without_notes_has_no_warning():
    assert "IMPORTANT" not in build_report_prompt("q", "SELECT 1", ROWS, "2026-11-16", False)


MONTHS = [{"sale_month": "2026-10-01", "orders": 101.0, "net_revenue": 6_917_705.0, "gross_margin_pct": 38.8},
          {"sale_month": "2026-11-01", "orders": 53.0, "net_revenue": 3_993_496.0, "gross_margin_pct": 39.5}]


def test_period_comparison_is_exact_and_estimates_the_partial_month():
    comparison = period_comparison(MONTHS, "2026-11-16")
    revenue = comparison["changes"]["net_revenue"]
    assert comparison["current_is_partial"] and comparison["days_elapsed"] == 16 and comparison["days_in_month"] == 30
    assert revenue["change_pct"] == -42.27                        # (3,993,496 - 6,917,705) / 6,917,705
    assert revenue["full_month_estimate"] == 7_487_805.0          # 3,993,496 / 16 x 30
    assert revenue["estimated_change_pct"] == 8.24
    assert "full_month_estimate" not in comparison["changes"]["gross_margin_pct"]   # ratios are not scaled
    assert "+8.2%" in comparison_notes(comparison, "en")[0]


def test_no_comparison_for_rankings_or_complete_months():
    assert period_comparison([{"sku": "A", "units": 1}, {"sku": "B", "units": 2}], "2026-11-16") is None
    complete = period_comparison([{**MONTHS[0], "sale_month": "2026-09-01"}, MONTHS[0]], "2026-11-16")
    assert not complete["current_is_partial"] and comparison_notes(complete, "ar") == []


async def test_comparison_is_given_to_the_model(fake_llm):
    fake = fake_llm([{"answer": "ok"}])
    report = await ReportGenerator(fake).generate("compare", "SELECT 1", MONTHS, "ar", "2026-11-16")
    assert "COMPUTED COMPARISON" in fake.calls[0][1]["content"]
    assert any("7,487,805" in note for note in report["notes"])
