
# Furniture Business Knowledge

## Business Overview

The platform supports furniture manufacturers that sell through
showrooms and produce products in a factory.

The main business processes include:

1. Product catalogue management.
2. Bill of Materials (BOM).
3. Customer quotations and orders.
4. Custom furniture measurements.
5. Order confirmation and deposits.
6. Production planning.
7. Material consumption and inventory.
8. Quality inspection.
9. Shipping and delivery.
10. Payments and final balances.
11. Sales and financial analysis.

## Product and Catalogue

Products can have:
- Product categories.
- SKU.
- Wood type.
- Finish.
- Dimensions.
- Bill of Materials.
- Production routing.

## Custom Orders

A custom order can have dimensions, wood or finish different
from the catalogue configuration.

Custom work may require a site measurement before confirmation.

Do not assume that all products have the same dimensions
or material requirements.

## Bill of Materials

BOM describes the materials and quantities required to
manufacture one unit of a product at its base size.

Important concepts:
- qty_per_unit
- is_main_wood
- scales_with_size
- waste_pct

The main-wood BOM line is replaced by the wood type selected
for the order.

Some materials scale with product size; others, such as
hardware and packaging, may not scale.

Expected waste is added to material requirements.

## Production Routing

Production routes consist of ordered steps through factory
work centres.

Examples of work centres:
- Cutting
- Edge banding
- Assembly
- Sanding
- Finishing
- Upholstery
- Quality control
- Packaging

Production progress is represented by completed steps
compared with total steps.

## Inventory

Inventory movements represent stock receipts, production issues,
opening balances and adjustments.

The AI should use v_inventory_status for stock analysis.

Do not estimate available stock from purchase totals.

## Financial Analysis

Use the analytical views for:
- Net revenue.
- Cost of goods sold.
- Gross profit.
- Delivery cost.
- Operating expenses.
- Net profit.
- Gross margin.
- Net margin.

Never invent missing costs or financial values.

## Management Recommendations

Good recommendations should:
- Refer to observed data.
- Explain why an issue matters.
- Suggest an actionable next step.
- Identify missing evidence.
- Avoid claiming that an action guarantees a result.
