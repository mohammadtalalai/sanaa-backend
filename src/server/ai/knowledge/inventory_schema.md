
# Inventory Domain

Primary view:
- analytics.v_inventory_status

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

LOW means stock_qty is at or below reorder_level.

Use supplier_name and lead_time_days to discuss replenishment.

Do not invent stock quantities or supplier information.
