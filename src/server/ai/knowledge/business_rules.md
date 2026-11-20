
# SANAA Business Rules

## 1. Sales

A sale is a confirmed order that is not cancelled.

The v_sales_lines view contains only:
- Confirmed orders.
- Non-cancelled orders.
- Sold order lines.

Quotations must not be counted as completed sales.

Use v_orders.is_sale = TRUE when analysing actual sales
from the orders view.

## 2. Revenue

Net revenue excludes VAT.

The net revenue for a sales line is calculated by allocating
the order's net amount proportionally across its lines.

Conceptually:

line_net_revenue =
line_total * order_net_amount / order_subtotal

Order discounts are allocated proportionally.

Do not add VAT to net revenue.

## 3. Cost of Goods Sold

COGS is calculated using:

COGS = unit_cost * quantity

Gross profit:

gross_profit = net_revenue - cogs

Gross margin:

gross_margin_pct =
gross_profit / net_revenue * 100

Use the values provided by analytics views.
Do not recalculate these values from operational tables.

## 4. Orders and Quotations

v_orders includes quotations and orders.

is_sale is true when:
- confirmed_at is not null
- status is not cancelled

Discount percentage:

discount_pct =
discount_amount / subtotal * 100

Delivery lateness compares delivered date with promised_date.

days_to_deliver is the difference between delivery date
and confirmation date.

## 5. Branch Profit and Loss

v_branch_monthly_pnl provides monthly branch P&L.

Revenue and COGS come from v_sales_lines.

Delivery cost comes from shipments of sold orders and is
attributed to the order month.

Operating expenses come from branch expenses.

Factory rows have no revenue and carry central costs.

Net profit:

net_profit =
revenue - cogs - delivery_cost - operating_expenses

## 6. Company Profit and Loss

v_company_monthly_pnl aggregates branch P&L across all branches.

Net margin:

net_margin_pct =
net_profit / revenue * 100

Use this view for company-wide monthly profitability.

## 7. Order Tracking

v_order_tracking contains:
- Current order status.
- Production progress.
- Total amount.
- Paid amount.
- Remaining balance.

paid_amount includes payments and refunds.

balance_due:

total_amount - paid_amount

Cancelled orders have zero balance_due.

Customer-facing order lookups must always filter by:
- order_no
- customer_id

Never disclose an order using order number alone.

## 8. Inventory

v_inventory_status contains raw material stock information.

stock_status is:
- LOW when stock_qty is at or below reorder_level.
- OK otherwise.

stock_value:

stock_qty * latest unit_cost

Use supplier and lead_time_days when discussing replenishment.

## 9. Production

v_production_status contains production progress and costs.

is_late:
- Completed orders compare actual_end with planned_end.
- Open orders compare the dataset reference date with planned_end.

Production cost comparison:

actual_cost = material_cost + labor_cost

Compare actual_cost with standard_cost.

Do not treat cancelled orders as active production work.

## 10. Customers

v_customer_summary contains customer-level activity without
personal contact information.

It counts confirmed, non-cancelled orders.

Use:
- orders_count
- lifetime_net_revenue
- first_order_at
- last_order_at

Do not infer customer names, phone numbers or emails.

## 11. Suppliers

v_supplier_monthly includes received purchase orders only.

Delivery delay:

delay_days = received_date - expected_date

Interpretation:
- Positive: late delivery.
- Zero: on time.
- Negative: early delivery.

avg_delay_days is an average, not an individual delivery date.

## 12. Data Completeness

The dataset reference date is stored in v_as_of (today's date).

Views that depend on today's date use this reference date.

Operating expenses for a month are booked after the month ends,
so the current month has no operating expenses yet.

The current month is partial and must not be described as a
complete month. Its net profit is not final.
