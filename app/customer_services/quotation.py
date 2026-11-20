from __future__ import annotations

import datetime as dt
import secrets
from typing import Any

from app.core.config import settings
from app.customer_services.costing import Catalog, CostCalculator, get_catalog
from app.customer_services.repository import Repository, get_repository


def new_quotation_no(today: dt.date | None = None) -> str:
    today = today or dt.date.today()
    return f"Q-AI-{today:%Y%m%d}-{secrets.token_hex(3).upper()}"


def item_from_data(data: dict[str, Any]) -> dict[str, Any]:
    keys = ("product_type", "width_cm", "depth_cm", "height_cm", "wood", "finish", "color", "quantity", "city")
    item = {k: data.get(k) for k in keys}
    for k in ("width_cm", "depth_cm", "height_cm"):
        item[k] = float(item[k])
    item["quantity"] = int(item["quantity"])
    return item


def _money(value: float) -> str:
    return f"{value:,.0f}"


def format_quotation(quotation: dict[str, Any], catalog: Catalog, language: str) -> str:
    item, p = quotation["item"], quotation["pricing"]
    label = lambda field: catalog.label(field, item[field], language)  # noqa: E731
    dims = f"{item['width_cm']:g}×{item['depth_cm']:g}×{item['height_cm']:g}"
    if language == "ar":
        return "\n".join([
            f"عرض السعر رقم {quotation['quotation_no']}",
            f"- المنتج: {label('product_type')} ({dims} سم) × {item['quantity']}",
            f"- الخشب: {label('wood')} | التشطيب: {label('finish')} | اللون: {label('color')}",
            f"- سعر القطعة: {_money(p['unit_price'])} جنيه",
            f"- الإجمالي قبل الضريبة: {_money(p['subtotal'])} جنيه",
            f"- التوصيل ({label('city')}): {_money(p['delivery_cost'])} جنيه",
            f"- ضريبة القيمة المضافة {p['vat_pct']:g}%: {_money(p['vat_amount'])} جنيه",
            f"- الإجمالي: {_money(p['total'])} جنيه",
            f"- التسليم المتوقع: {p['estimated_delivery_date']} (تصنيع {p['production_days']} يوم + توصيل {p['delivery_days']} يوم)",
            f"- العرض ساري حتى {quotation['valid_until']}",
        ])
    return "\n".join([
        f"Quotation {quotation['quotation_no']}",
        f"- Product: {label('product_type')} ({dims} cm) x {item['quantity']}",
        f"- Wood: {label('wood')} | Finish: {label('finish')} | Colour: {label('color')}",
        f"- Unit price: EGP {_money(p['unit_price'])}",
        f"- Subtotal: EGP {_money(p['subtotal'])}",
        f"- Delivery ({label('city')}): EGP {_money(p['delivery_cost'])}",
        f"- VAT {p['vat_pct']:g}%: EGP {_money(p['vat_amount'])}",
        f"- Total: EGP {_money(p['total'])}",
        f"- Expected delivery: {p['estimated_delivery_date']} (production {p['production_days']} days + delivery {p['delivery_days']} days)",
        f"- Valid until {quotation['valid_until']}",
    ])


class QuotationService:
    def __init__(self, repository: Repository | None = None, calculator: CostCalculator | None = None):
        self._repository = repository
        self.calculator = calculator or CostCalculator()

    @property
    def repository(self) -> Repository:
        return self._repository or get_repository()

    async def create(self, data: dict[str, Any], session_id: str, language: str) -> dict[str, Any]:
        today = dt.date.today()
        item = item_from_data(data)
        pricing = self.calculator.quote(item, today)
        quotation = {
            "quotation_no": new_quotation_no(today),
            "session_id": session_id,
            "customer_name": data.get("customer_name"),
            "customer_phone": data.get("customer_phone"),
            "language": language,
            "item": item,
            "pricing": pricing,
            "currency": pricing["currency"],
            "total": pricing["total"],
            "valid_until": (today + dt.timedelta(days=settings.quotation_valid_days)).isoformat(),
            "status": "draft",
            "design_id": None,
            "created_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "accepted_at": None,
        }
        await self.repository.save_quotation(quotation)
        return quotation

    def describe(self, quotation: dict[str, Any], language: str) -> str:
        return format_quotation(quotation, self.calculator.catalog, language)
