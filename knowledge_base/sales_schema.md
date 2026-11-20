
# Sales Domain

Primary views:
- analytics.v_sales_lines
- analytics.v_orders
- analytics.v_monthly_sales
- analytics.v_product_performance

Use v_sales_lines for:
- Product sales.
- Category sales.
- Wood and finish analysis.
- Units sold.
- Revenue and COGS.
- Gross profit.

Use v_orders for:
- Quotations.
- Sales conversion.
- Discounts.
- Sales representatives.
- Delivery lateness.

Use v_monthly_sales for monthly branch sales.

Use v_product_performance for lifetime product performance.

Remember:
- v_orders includes quotations.
- Filter is_sale = TRUE for actual sales.
- v_sales_lines already contains confirmed non-cancelled sold lines.
- Revenue excludes VAT.
