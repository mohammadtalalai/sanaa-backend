"""Integration tests against a real PostgreSQL. Run with: RUN_INTEGRATION=1 pytest -m integration"""
import os

import pytest

pytestmark = [pytest.mark.integration,
              pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1")]


async def test_connection_is_read_only():
    from app.core.database import check_database, dispose_database

    info = await check_database()
    await dispose_database()
    assert info["read_only"] is True


async def test_documented_views_exist_and_are_readable():
    from app.core.database import dispose_database, inspect_views

    report = await inspect_views()
    await dispose_database()
    problems = {k: v for k, v in report["views"].items() if not (v.get("exists") and v.get("readable"))
                or v.get("missing_columns")}
    assert report["ok"], problems


async def test_reference_date_and_query():
    from app.core.database import dispose_database, get_reference_date
    from app.internal_services.analysis.sql_executor import execute_readonly_query
    from app.internal_services.analysis.sql_validator import SQLValidator

    reference = await get_reference_date()
    check = SQLValidator().validate("SELECT month_start, net_profit FROM analytics.v_company_monthly_pnl ORDER BY month_start")
    result = await execute_readonly_query(check.sql, 100)
    await dispose_database()
    assert reference.year >= 2020 and result["row_count"] > 0


async def test_writes_are_refused():
    from app.core.database import dispose_database
    from app.internal_services.analysis.sql_executor import SQLExecutionError, execute_readonly_query

    with pytest.raises(SQLExecutionError):
        await execute_readonly_query("CREATE TABLE analytics.hack (id int)", 1)
    await dispose_database()
