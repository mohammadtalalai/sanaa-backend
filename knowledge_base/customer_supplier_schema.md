
# Customer and Supplier Domains

## Customers

Primary view:
- analytics.v_customer_summary

Contains:
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

This view does not expose customer names, phone numbers
or email addresses.

For customer order tracking, use v_order_tracking and
filter by both order_no and customer_id.

## Suppliers

Primary view:
- analytics.v_supplier_monthly

Contains:
- month_start
- supplier_id
- name_en
- name_ar
- purchase_orders
- total_spend
- avg_delay_days
- late_deliveries

The view includes received purchase orders only.

Positive average delay means late delivery.
Negative average delay means early delivery.
