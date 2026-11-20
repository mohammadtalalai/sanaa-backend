import { describe, expect, it } from "vitest";
import { SQLValidator, validateReadonlySql } from "@/server/analysis/sql-validator";

const validator = new SQLValidator(undefined, 100);

describe("analytics SQL validator", () => {
  it("adds a 100-row limit to a valid SELECT", () => {
    const r = validator.validate("SELECT month_start, net_profit FROM analytics.v_company_monthly_pnl");
    expect(r.valid).toBe(true);
    expect(r.sql.toUpperCase().endsWith("LIMIT 100")).toBe(true);
    expect(r.tables).toEqual(["analytics.v_company_monthly_pnl"]);
  });

  it("caps a large limit at 100 and keeps a small one", () => {
    const big = validator.validate("SELECT sku FROM analytics.v_product_performance LIMIT 100000");
    expect(big.valid && big.sql.includes("LIMIT 100") && !big.sql.includes("100000")).toBe(true);
    expect(validator.validate("SELECT sku FROM analytics.v_product_performance LIMIT 5").sql).toContain("LIMIT 5");
  });

  it("allows CTEs, subqueries and UNION over analytics views", () => {
    expect(validator.validate(`WITH ref AS (SELECT as_of FROM analytics.v_as_of)
      SELECT month_start, net_profit FROM analytics.v_company_monthly_pnl
      WHERE month_start = DATE_TRUNC('month', (SELECT as_of FROM ref))`).valid).toBe(true);
    expect(validator.validate("SELECT sku FROM analytics.v_product_performance UNION SELECT sku FROM analytics.v_inventory_status").valid).toBe(true);
  });

  it.each([
    "SELECT * FROM erp.orders",
    "SELECT * FROM orders",
    "SELECT * FROM public.users",
    "SELECT * FROM analytics.v_not_documented",
    "SELECT * FROM pg_catalog.pg_user",
  ])("only allows documented analytics views: %s", (sql) => {
    expect(validator.validate(sql).valid).toBe(false);
  });

  it("blocks the customer tracking view from analysis", () => {
    const r = validator.validate("SELECT * FROM analytics.v_order_tracking");
    expect(r.valid).toBe(false);
    expect(r.error).toContain("customer");
  });

  it.each([
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
  ])("rejects dangerous or invalid SQL: %s", (sql) => {
    expect(validator.validate(sql).valid).toBe(false);
  });

  it("does not let a CTE hide ERP tables", () => {
    expect(validator.validate("WITH x AS (SELECT * FROM erp.customers) SELECT * FROM x").valid).toBe(false);
  });

  it("helper validates a read-only query", () => {
    expect(validateReadonlySql("SELECT as_of FROM analytics.v_as_of").valid).toBe(true);
  });
});
