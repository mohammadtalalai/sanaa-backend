from __future__ import annotations

import datetime as dt
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.ai.language import normalize
from app.core.config import BASE_DIR

CATALOG_PATH = BASE_DIR / "knowledge_base" / "product_catalog.json"
KINDS = {"product_type": "product_types", "wood": "woods", "finish": "finishes", "color": "colors"}


@dataclass(frozen=True)
class Match:
    key: str
    synonym: str


class Catalog:
    def __init__(self, data: dict[str, Any]):
        self.data = data
        self.currency = data.get("currency", "EGP")
        self.vat_pct = float(data.get("vat_pct", 14))
        self.cities = data["delivery"]["cities"]

    def options(self, field: str) -> dict[str, dict[str, Any]]:
        return self.cities if field == "city" else self.data[KINDS[field]]

    def find(self, field: str, text: str) -> Match | None:
        """Best option whose name or synonym appears in the text (longest match wins)."""
        clean = f" {normalize(text)} "
        best: Match | None = None
        for key, option in self.options(field).items():
            names = [key, option.get("name_en", ""), option.get("name_ar", ""), *option.get("synonyms", [])]
            for name in filter(None, names):
                word = normalize(name)
                if not word:
                    continue
                found = (word in clean) if len(word) > 3 else bool(
                    re.search(rf"(?<!\w)(?:ال|بال|وال|لل|ب)?{re.escape(word)}(?!\w)", clean))
                if found and (best is None or len(word) > len(normalize(best.synonym))):
                    best = Match(key, name)
        return best

    def label(self, field: str, key: str, language: str) -> str:
        option = self.options(field).get(key, {})
        if field == "city":
            return option.get("name_ar", key) if language == "ar" else key
        return option.get(f"name_{language}") or option.get("name_en") or key

    def choices(self, field: str, language: str) -> list[str]:
        return [self.label(field, key, language) for key in self.options(field)]

    def product(self, key: str) -> dict[str, Any]:
        return self.data["product_types"][key]

    def delivery(self, city: str | None) -> dict[str, Any]:
        return self.cities.get(city or "", self.data["delivery"]["other"])


@lru_cache
def get_catalog() -> Catalog:
    return Catalog(json.loads(CATALOG_PATH.read_text(encoding="utf-8")))


def _round(value: float) -> float:
    return round(value, 2)


class CostCalculator:
    """unit price = base x size factor x wood x finish + colour extra (all values from the catalogue)."""

    def __init__(self, catalog: Catalog | None = None):
        self.catalog = catalog or get_catalog()

    def size_factor(self, product_key: str, width: float, depth: float, height: float) -> float:
        dw, dd, dh = self.catalog.product(product_key)["default_dims"]
        ratio = (width * depth * height) / (dw * dd * dh)
        return round(0.35 + 0.65 * ratio, 4)

    def quote(self, spec: dict[str, Any], today: dt.date | None = None) -> dict[str, Any]:
        catalog = self.catalog
        product = catalog.product(spec["product_type"])
        wood = catalog.options("wood")[spec["wood"]]
        finish = catalog.options("finish")[spec["finish"]]
        color = catalog.options("color")[spec["color"]]
        quantity = int(spec["quantity"])
        size = self.size_factor(spec["product_type"], spec["width_cm"], spec["depth_cm"], spec["height_cm"])

        base = float(product["base_price"])
        unit_price = _round(base * size * wood["multiplier"] * finish["multiplier"] + color["extra"])
        subtotal = _round(unit_price * quantity)
        delivery = catalog.delivery(spec.get("city"))
        delivery_cost = _round(delivery["base"] + delivery["per_extra_unit"] * (quantity - 1))
        vat = _round((subtotal + delivery_cost) * catalog.vat_pct / 100)
        total = _round(subtotal + delivery_cost + vat)

        today = today or dt.date.today()
        production_days = int(product["production_days"]) + max(0, quantity - 1) * 2
        delivery_days = int(delivery["days"])
        return {
            "currency": catalog.currency,
            "breakdown": {
                "base_price": base, "size_factor": size, "wood_multiplier": wood["multiplier"],
                "finish_multiplier": finish["multiplier"], "color_extra": color["extra"],
            },
            "unit_price": unit_price,
            "quantity": quantity,
            "subtotal": subtotal,
            "delivery_cost": delivery_cost,
            "vat_pct": catalog.vat_pct,
            "vat_amount": vat,
            "total": total,
            "production_days": production_days,
            "delivery_days": delivery_days,
            "estimated_delivery_date": (today + dt.timedelta(days=production_days + delivery_days)).isoformat(),
        }
