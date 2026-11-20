
# Finance Domain

Primary views:
- analytics.v_branch_monthly_pnl
- analytics.v_company_monthly_pnl
- analytics.v_sales_lines

Use v_company_monthly_pnl for company-wide:
- Revenue.
- COGS.
- Delivery cost.
- Gross profit.
- Operating expenses.
- Net profit.
- Net margin.

Use v_branch_monthly_pnl for the same measures by branch.

Net profit:
revenue - cogs - delivery_cost - operating_expenses

Factory branches carry central costs and have no revenue.

Do not treat gross profit as net profit.

The documented sample operating expenses are available
through October 2026. November 2026 is partial.
