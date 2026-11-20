import datetime as dt

import pytest

from app.core.exceptions import NotFoundError, UnauthorizedError
from app.core.security import decode_customer_token
from app.customer_services.order_tracking import OrderTrackingService, payment_status

ORDERS = [
    {"order_id": 1, "order_no": "SO-1001", "customer_id": 7, "branch_id": 1, "status": "in_production",
     "status_label_ar": "قيد التصنيع", "status_label_en": "In production", "status_seq": 3,
     "created_at": "2026-10-20T10:00:00", "confirmed_at": "2026-10-21T10:00:00", "promised_date": "2026-11-30",
     "delivered_at": None, "last_update_at": "2026-11-15T09:00:00", "total_steps": 8, "completed_steps": 4,
     "total_amount": 50000.0, "paid_amount": 20000.0, "balance_due": 30000.0},
    {"order_id": 2, "order_no": "SO-1002", "customer_id": 7, "branch_id": 1, "status": "delivered",
     "status_label_ar": "تم التسليم", "status_label_en": "Delivered", "status_seq": 6,
     "created_at": "2026-08-01T10:00:00", "confirmed_at": "2026-08-02T10:00:00", "promised_date": "2026-09-01",
     "delivered_at": "2026-08-29T15:00:00", "last_update_at": "2026-08-29T15:00:00", "total_steps": 8,
     "completed_steps": 8, "total_amount": 30000.0, "paid_amount": 30000.0, "balance_due": 0.0},
    {"order_id": 3, "order_no": "SO-2001", "customer_id": 8, "branch_id": 2, "status": "confirmed",
     "status_label_ar": "مؤكد", "status_label_en": "Confirmed", "status_seq": 2, "created_at": "2026-11-01T10:00:00",
     "confirmed_at": "2026-11-02T10:00:00", "promised_date": "2026-11-10", "delivered_at": None,
     "last_update_at": "2026-11-02T10:00:00", "total_steps": 8, "completed_steps": 0, "total_amount": 10000.0,
     "paid_amount": 0.0, "balance_due": 10000.0},
]
PRODUCTION = [{"po_no": "PO-1", "order_no": "SO-1001", "sku": "WRD-01", "product_name_en": "Wardrobe",
               "product_name_ar": "دولاب", "status": "in_progress", "quantity": 1, "planned_end": "2026-11-25",
               "actual_end": None, "total_steps": 8, "completed_steps": 4, "current_stage_en": "Finishing",
               "is_late": False}]


async def fake_query(sql, params):
    """Behaves like the real SQL: filters by order_no AND customer_id."""
    if "v_production_status" in sql:
        return [p for p in PRODUCTION if p["order_no"] == params["order_no"]]
    rows = [o for o in ORDERS if o["customer_id"] == params["customer_id"]]
    if "order_no" in params:
        rows = [o for o in rows if o["order_no"] == params["order_no"]]
    return rows


async def ref_date():
    return dt.date(2026, 11, 16)


service = OrderTrackingService(query=fake_query, reference_date_provider=ref_date)


async def test_login_needs_matching_customer_and_order():
    token = await service.login(7, "SO-1001")
    assert decode_customer_token(token["access_token"]) == 7
    with pytest.raises(UnauthorizedError):
        await service.login(7, "SO-2001")          # order of another customer
    with pytest.raises(UnauthorizedError):
        await service.login(7, "SO-9999")


async def test_tracking_in_arabic():
    result = await service.track(7, "SO-1001", "ar")
    assert result["production"]["progress_pct"] == 50.0
    assert result["production"]["current_stage"] == "الدهان والتشطيب"
    assert result["payment"]["status"] == "partially_paid" and result["payment"]["balance_due"] == 30000
    assert result["delivery"]["expected_date"] == "2026-11-30" and not result["delivery"]["is_late"]
    assert "قيد التصنيع" in result["message"] and "50%" in result["message"] and "30,000" in result["message"]


async def test_tracking_in_english_delivered_order():
    result = await service.track(7, "SO-1002", "en")
    assert result["delivery"]["shipment_status"] == "delivered" and result["payment"]["status"] == "paid"
    assert result["message"].startswith("Your order SO-1002 is: Delivered") and "2026-08-29" in result["message"]


async def test_late_order_is_flagged():
    result = await service.track(8, "SO-2001", "en")
    assert result["delivery"]["is_late"] and "late" in result["message"]


async def test_cannot_see_other_customers_order():
    with pytest.raises(NotFoundError):
        await service.track(7, "SO-2001")


async def test_my_orders():
    orders = await service.my_orders(7, "en")
    assert [o["order_no"] for o in orders] == ["SO-1001", "SO-1002"]
    assert orders[0]["status_label"] == "In production"


def test_payment_status():
    assert payment_status(100, 0, 100, "confirmed") == "unpaid"
    assert payment_status(100, 100, 0, "delivered") == "paid"
    assert payment_status(100, 0, 0, "cancelled") == "cancelled"
