from __future__ import annotations

import datetime as dt
from typing import Any

from app.core.database import fetch_all, get_reference_date
from app.core.exceptions import NotFoundError, UnauthorizedError
from app.core.security import create_customer_token

STAGES_AR = {
    "cutting": "القص", "edge banding": "تركيب الشريط (الحواف)", "assembly": "التجميع", "sanding": "الصنفرة",
    "finishing": "الدهان والتشطيب", "upholstery": "التنجيد", "quality control": "مراجعة الجودة",
    "packaging": "التغليف",
}
DELIVERY_STATUSES = {"shipped", "out_for_delivery", "in_transit", "dispatched"}

TRACKING_SQL = """
    SELECT order_id, order_no, customer_id, branch_id, status, status_label_ar, status_label_en, status_seq,
           created_at, confirmed_at, promised_date, delivered_at, last_update_at, total_steps, completed_steps,
           total_amount, paid_amount, balance_due
    FROM analytics.v_order_tracking
    WHERE order_no = :order_no AND customer_id = :customer_id
    LIMIT 1"""
MY_ORDERS_SQL = """
    SELECT order_no, status, status_label_ar, status_label_en, created_at, promised_date, delivered_at,
           total_amount, balance_due
    FROM analytics.v_order_tracking
    WHERE customer_id = :customer_id
    ORDER BY created_at DESC
    LIMIT 50"""
PRODUCTION_SQL = """
    SELECT po_no, sku, product_name_en, product_name_ar, status, quantity, planned_end, actual_end, total_steps,
           completed_steps, current_stage_en, is_late
    FROM analytics.v_production_status
    WHERE order_no = :order_no
    ORDER BY po_no"""


def payment_status(total: float, paid: float, balance: float, status: str) -> str:
    if status == "cancelled":
        return "cancelled"
    if total <= 0 or balance <= 0:
        return "paid"
    return "partially_paid" if paid > 0 else "unpaid"


PAYMENT_LABELS = {
    "paid": ("مدفوع بالكامل", "Fully paid"), "partially_paid": ("مدفوع جزئياً", "Partially paid"),
    "unpaid": ("لم يتم الدفع", "Not paid yet"), "cancelled": ("ملغي", "Cancelled"),
}


def _percent(done: Any, total: Any) -> float | None:
    try:
        return round(float(done) / float(total) * 100, 1) if total else None
    except (TypeError, ValueError):
        return None


def _money(value: float) -> str:
    return f"{value:,.0f}"


class OrderTrackingService:
    def __init__(self, query=fetch_all, reference_date_provider=get_reference_date):
        self.query = query
        self.reference_date_provider = reference_date_provider

    async def login(self, customer_id: int, order_no: str) -> dict[str, Any]:
        rows = await self.query(TRACKING_SQL, {"order_no": order_no.strip(), "customer_id": customer_id})
        if not rows:
            raise UnauthorizedError("Customer number and order number do not match")
        token, expires_in = create_customer_token(customer_id)
        return {"access_token": token, "token_type": "bearer", "expires_in": expires_in, "customer_id": customer_id}

    async def my_orders(self, customer_id: int, language: str = "ar") -> list[dict[str, Any]]:
        rows = await self.query(MY_ORDERS_SQL, {"customer_id": customer_id})
        label = "status_label_ar" if language == "ar" else "status_label_en"
        return [{**row, "status_label": row.get(label) or row["status"]} for row in rows]

    async def track(self, customer_id: int, order_no: str, language: str = "ar") -> dict[str, Any]:
        rows = await self.query(TRACKING_SQL, {"order_no": order_no.strip(), "customer_id": customer_id})
        if not rows:
            raise NotFoundError("Order not found")  # same answer whether it doesn't exist or isn't yours
        order = rows[0]
        production = await self.query(PRODUCTION_SQL, {"order_no": order["order_no"]})
        reference = await self.reference_date_provider()
        return self.build(order, production, language, reference)

    def build(self, order: dict[str, Any], production: list[dict[str, Any]], language: str,
              reference: dt.date) -> dict[str, Any]:
        status = str(order["status"]).lower()
        total, paid, balance = (float(order.get(k) or 0) for k in ("total_amount", "paid_amount", "balance_due"))
        pay = payment_status(total, paid, balance, status)

        active = [p for p in production if str(p.get("status", "")).lower() != "cancelled"]
        current = next((p for p in active if str(p.get("status", "")).lower() not in ("completed", "done")), None)
        stage_en = (current or {}).get("current_stage_en")
        stage = STAGES_AR.get(str(stage_en or "").lower(), stage_en) if language == "ar" else stage_en
        progress = _percent(order.get("completed_steps"), order.get("total_steps"))

        promised = order.get("promised_date")
        delivered = order.get("delivered_at")
        late = bool(promised and not delivered and str(promised)[:10] < reference.isoformat())
        if delivered:
            shipment = "delivered"
        elif status in DELIVERY_STATUSES:
            shipment = "on_the_way"
        elif status in ("ready", "ready_for_delivery", "packed"):
            shipment = "ready_for_dispatch"
        elif status == "cancelled":
            shipment = "cancelled"
        else:
            shipment = "not_shipped"

        result = {
            "order_no": order["order_no"],
            "status": status,
            "status_label": order.get("status_label_ar" if language == "ar" else "status_label_en") or status,
            "status_seq": order.get("status_seq"),
            "created_at": order.get("created_at"),
            "confirmed_at": order.get("confirmed_at"),
            "production": {
                "progress_pct": progress,
                "completed_steps": order.get("completed_steps"),
                "total_steps": order.get("total_steps"),
                "current_stage": stage,
                "items": [{"po_no": p["po_no"], "product": p.get("product_name_ar" if language == "ar" else "product_name_en"),
                           "status": p.get("status"), "quantity": p.get("quantity"),
                           "progress_pct": _percent(p.get("completed_steps"), p.get("total_steps")),
                           "current_stage": (STAGES_AR.get(str(p.get("current_stage_en") or "").lower(), p.get("current_stage_en"))
                                             if language == "ar" else p.get("current_stage_en")),
                           "is_late": bool(p.get("is_late"))} for p in active],
            },
            "payment": {"status": pay, "label": PAYMENT_LABELS[pay][0 if language == "ar" else 1],
                        "total_amount": total, "paid_amount": paid, "balance_due": balance, "currency": "EGP"},
            "delivery": {"expected_date": promised, "delivered_at": delivered, "shipment_status": shipment,
                         "is_late": late},
            "last_update_at": order.get("last_update_at"),
        }
        result["message"] = self.message(result, language)
        return result

    @staticmethod
    def message(r: dict[str, Any], language: str) -> str:
        p, pay, dlv = r["production"], r["payment"], r["delivery"]
        if language == "ar":
            parts = [f"طلبك رقم {r['order_no']} حالته: {r['status_label']}."]
            if dlv["delivered_at"]:
                parts.append(f"تم التسليم بتاريخ {str(dlv['delivered_at'])[:10]}.")
            else:
                if p["progress_pct"] is not None and r["status"] != "cancelled":
                    stage = f" — المرحلة الحالية: {p['current_stage']}" if p["current_stage"] else ""
                    parts.append(f"نسبة التصنيع {p['progress_pct']:g}%{stage}.")
                if dlv["shipment_status"] == "on_the_way":
                    parts.append("الطلب في الطريق إليك.")
                if dlv["expected_date"] and r["status"] != "cancelled":
                    parts.append(f"موعد التسليم المتوقع: {str(dlv['expected_date'])[:10]}"
                                 + (" (متأخر، فريقنا هيتواصل معاك)." if dlv["is_late"] else "."))
            if r["status"] != "cancelled":
                parts.append(f"الدفع: {pay['label']} — المدفوع {_money(pay['paid_amount'])} من {_money(pay['total_amount'])} جنيه"
                             + (f"، المتبقي {_money(pay['balance_due'])} جنيه." if pay["balance_due"] > 0 else "."))
            return " ".join(parts)
        parts = [f"Your order {r['order_no']} is: {r['status_label']}."]
        if dlv["delivered_at"]:
            parts.append(f"Delivered on {str(dlv['delivered_at'])[:10]}.")
        else:
            if p["progress_pct"] is not None and r["status"] != "cancelled":
                stage = f" - current stage: {p['current_stage']}" if p["current_stage"] else ""
                parts.append(f"Production is {p['progress_pct']:g}% complete{stage}.")
            if dlv["shipment_status"] == "on_the_way":
                parts.append("Your order is on the way.")
            if dlv["expected_date"] and r["status"] != "cancelled":
                parts.append(f"Expected delivery: {str(dlv['expected_date'])[:10]}"
                             + (" (late - our team will contact you)." if dlv["is_late"] else "."))
        if r["status"] != "cancelled":
            parts.append(f"Payment: {pay['label']} - paid EGP {_money(pay['paid_amount'])} of {_money(pay['total_amount'])}"
                         + (f", balance EGP {_money(pay['balance_due'])}." if pay["balance_due"] > 0 else "."))
        return " ".join(parts)


order_tracking = OrderTrackingService()
