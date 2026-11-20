
# SANAA Database Schema

## Database
- Database name: furniture_erp
- Database engine: PostgreSQL
- Main schemas: erp, analytics

## Architecture

The database has two schemas:

### erp
Operational system of record.
Contains the original business tables.
The AI must NEVER query this schema.

### analytics
Curated read-only analytical layer.
The AI can query documented views from this schema only.

All AI SQL queries must use:
analytics.view_name

## Analytics Views

### 1. v_as_of
Grain: One row.

Purpose:
Returns the reference date used by the dataset.

Columns:
- as_of

### 2. v_sales_lines
Grain: One row per sold order line.

Purpose:
Main sales fact view. Used for product, category, wood, finish,
branch, channel, city and monthly sales analysis.

Columns:
- line_id
- order_id
- order_no
- sale_date
- sale_month
- branch_id
- branch_name_en
- branch_name_ar
- order_type
- channel
- order_status
- delivery_city
- product_id
- sku
- product_name_en
- product_name_ar
- category_code
- category_name_en
- category_name_ar
- wood_en
- wood_ar
- finish_en
- finish_ar
- width_cm
- depth_cm
- height_cm
- quantity
- net_revenue
- cogs
- gross_profit

### 3. v_orders
Grain: One row per quotation or order.

Purpose:
Sales funnel, discounts, sales representatives and delivery analysis.

Columns:
- order_id
- order_no
- customer_id
- branch_id
- branch_name_en
- branch_name_ar
- sales_rep_id
- sales_rep_en
- sales_rep_ar
- order_type
- channel
- status
- created_at
- confirmed_at
- sale_month
- promised_date
- delivered_at
- is_sale
- subtotal
- discount_amount
- discount_pct
- net_amount
- vat_amount
- total_amount
- delivered_late
- days_to_deliver
- delivery_city
- cancel_reason

### 4. v_monthly_sales
Grain: One row per month and branch.

Purpose:
Monthly sales, units, revenue, cost and gross margin by branch.

Columns:
- sale_month
- branch_id
- branch_name_en
- branch_name_ar
- orders
- units
- net_revenue
- cogs
- gross_profit
- gross_margin_pct

### 5. v_product_performance
Grain: One row per product.

Purpose:
Lifetime product sales, revenue, cost, margin and first/last sale.

Columns:
- product_id
- sku
- product_name_en
- product_name_ar
- category_code
- category_name_en
- category_name_ar
- units
- orders
- net_revenue
- cogs
- gross_profit
- gross_margin_pct
- first_sale
- last_sale

### 6. v_branch_monthly_pnl
Grain: One row per month and branch.

Purpose:
Monthly branch profit and loss.

Columns:
- month_start
- branch_id
- branch_code
- branch_name_en
- branch_name_ar
- branch_type
- revenue
- cogs
- delivery_cost
- gross_profit
- operating_expenses
- net_profit

### 7. v_company_monthly_pnl
Grain: One row per month.

Purpose:
Company-wide monthly profit and loss.

Columns:
- month_start
- revenue
- cogs
- delivery_cost
- gross_profit
- operating_expenses
- net_profit
- net_margin_pct

### 8. v_order_tracking
Grain: One row per order.

Purpose:
Customer order status, production progress and remaining balance.

Columns:
- order_id
- order_no
- customer_id
- branch_id
- status
- status_label_ar
- status_label_en
- status_seq
- created_at
- confirmed_at
- promised_date
- delivered_at
- last_update_at
- total_steps
- completed_steps
- total_amount
- paid_amount
- balance_due

Important:
Customer-facing order lookup must filter using BOTH order_no
and customer_id.

### 9. v_inventory_status
Grain: One row per material.

Purpose:
Raw material stock, stock value, reorder alert, supplier and lead time.

Columns:
- material_id
- sku
- name_en
- name_ar
- material_type
- unit
- stock_qty
- reorder_level
- stock_value
- stock_status
- supplier_name_en
- supplier_name_ar
- lead_time_days

### 10. v_production_status
Grain: One row per production order.

Purpose:
Production progress, current stage, lateness and actual versus
standard production cost.

Columns:
- production_order_id
- po_no
- order_no
- sales_branch_id
- sku
- product_name_en
- product_name_ar
- status
- quantity
- planned_start
- planned_end
- actual_start
- actual_end
- total_steps
- completed_steps
- current_stage_en
- is_late
- material_cost
- labor_cost
- standard_cost

### 11. v_customer_summary
Grain: One row per customer.

Purpose:
Customer activity and lifetime value without personal information.

Columns:
- customer_id
- city
- city_ar
- customer_type
- source
- preferred_language
- created_at
- orders_count
- lifetime_net_revenue
- first_order_at
- last_order_at

### 12. v_supplier_monthly
Grain: One row per supplier and month.

Purpose:
Supplier purchases, spend and delivery delay.

Columns:
- month_start
- supplier_id
- name_en
- name_ar
- purchase_orders
- total_spend
- avg_delay_days
- late_deliveries

## SQL Rules

- Use analytics views only.
- Never query erp tables.
- Never assume undocumented columns.
- Prefer the view whose grain matches the question.
- Use explicit column names.
- Use LIMIT for detailed lists.
- Use v_company_monthly_pnl for company-wide P&L.
- Use v_branch_monthly_pnl for branch P&L.
- Use v_sales_lines for detailed sales analysis.
- Use v_orders for quotations and sales funnel analysis.
