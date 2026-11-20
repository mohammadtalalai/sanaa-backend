
# Production Domain

Primary view:
- analytics.v_production_status

Use it for:
- Production order status.
- Product information.
- Planned and actual dates.
- Production progress.
- Current production stage.
- Late production orders.
- Material cost.
- Labour cost.
- Standard cost.

is_late is calculated using the dataset reference date
for open production orders and actual_end for completed orders.

Actual production cost:
material_cost + labor_cost

Compare this with standard_cost.

Do not treat cancelled orders as active work.
