import pytest

from app.internal_services.analysis.sql_validator import SQLValidator, validate_readonly_sql

validator = SQLValidator(max_rows=100)


def test_valid_select_gets_a_limit():
    result = validator.validate("SELECT month_start, net_profit FROM analytics.v_company_monthly_pnl")
    assert result.valid, result.error
    assert result.sql.upper().endswith("LIMIT 100")
    assert result.tables == ["analytics.v_company_monthly_pnl"]


def test_large_limit_is_capped():
    result = validator.validate("SELECT sku FROM analytics.v_product_performance LIMIT 100000")
    assert result.valid and "LIMIT 100" in result.sql and "100000" not in result.sql


def test_small_limit_is_kept():
    assert "LIMIT 5" in validator.validate("SELECT sku FROM analytics.v_product_performance LIMIT 5").sql


def test_cte_and_subquery_are_allowed():
    sql = """WITH ref AS (SELECT as_of FROM analytics.v_as_of)
             SELECT month_start, net_profit FROM analytics.v_company_monthly_pnl
             WHERE month_start = DATE_TRUNC('month', (SELECT as_of FROM ref))"""
    result = validator.validate(sql)
    assert result.valid, result.error


def test_union_is_allowed():
    sql = "SELECT sku FROM analytics.v_product_performance UNION SELECT sku FROM analytics.v_inventory_status"
    assert validator.validate(sql).valid


@pytest.mark.parametrize("sql", [
    "SELECT * FROM erp.orders",
    "SELECT * FROM orders",
    "SELECT * FROM public.users",
    "SELECT * FROM analytics.v_not_documented",
    "SELECT * FROM pg_catalog.pg_user",
])
def test_only_documented_analytics_views(sql):
    assert not validator.validate(sql).valid


def test_customer_tracking_view_is_blocked_for_analysis():
    result = validator.validate("SELECT * FROM analytics.v_order_tracking")
    assert not result.valid and "customer" in result.error


@pytest.mark.parametrize("sql", [
    "DELETE FROM analytics.v_orders",
    "UPDATE analytics.v_orders SET status = 'x'",
    "INSERT INTO analytics.v_orders (order_id) VALUES (1)",
    "DROP VIEW analytics.v_orders",
    "TRUNCATE analytics.v_orders",
    "SELECT 1 FROM analytics.v_as_of; DROP TABLE erp.orders",
    "SELECT * INTO new_table FROM analytics.v_orders",
    "SELECT * FROM analytics.v_orders FOR UPDATE",
    "SELECT pg_sleep(10) FROM analytics.v_as_of",
    "SELECT pg_read_file('/etc/passwd') FROM analytics.v_as_of",
    "",
    "SELEC broken",
])
def test_dangerous_or_invalid_sql_is_rejected(sql):
    assert not validator.validate(sql).valid


def test_cte_named_like_a_view_cannot_hide_erp():
    sql = "WITH x AS (SELECT * FROM erp.customers) SELECT * FROM x"
    assert not validator.validate(sql).valid


def test_helper_function():
    assert validate_readonly_sql("SELECT as_of FROM analytics.v_as_of").valid
