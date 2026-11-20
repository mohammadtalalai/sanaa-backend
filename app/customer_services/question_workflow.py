from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.ai.language import normalize, to_western_digits
from app.customer_services.costing import Catalog

# Questions are asked in this order; "dimensions" fills width/depth/height together.
FIELDS = ["product_type", "dimensions", "wood", "finish", "color", "quantity", "city", "customer_name",
          "customer_phone"]
OPTION_FIELDS = ("product_type", "wood", "finish", "color", "city")

_NUMBER = r"(\d+(?:\.\d+)?)"
_SEP = r"\s*(?:x|×|\*|في|ف)\s*"
_DIMENSION_TRIPLE = re.compile(_NUMBER + _SEP + _NUMBER + _SEP + _NUMBER)
_LABELS = {
    "width_cm": r"(?:العرض|عرض|الطول|طول|width|length)",
    "depth_cm": r"(?:العمق|عمق|depth)",
    "height_cm": r"(?:الارتفاع|ارتفاع|height)",
}
_PHONE = re.compile(r"(?:\+?20|0)?(1[0125]\d{8})")
_COUNT_BEFORE_WORD = re.compile(r"(\d+)\s*(?:قطعه|قطع|حته|حتت|وحده|وحدات|pieces?|pcs|units?|items?)\b")
_COUNT_AFTER_WORD = re.compile(r"(?:العدد|عدد|الكميه|كميه|quantity|qty)\s*:?\s*(\d+)\b")
_WORD_NUMBERS = {
    "واحد": 1, "واحده": 1, "اتنين": 2, "اثنين": 2, "اثنان": 2, "تلاته": 3, "ثلاثه": 3, "اربعه": 4, "خمسه": 5,
    "سته": 6, "سبعه": 7, "تمانيه": 8, "ثمانيه": 8, "تسعه": 9, "عشره": 10,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}
_DEFAULT_WORDS = ("مقاس عادي", "المقاس العادي", "مقاس قياسي", "القياسي", "standard", "default", "عادي")
YES_WORDS = ("نعم", "ايوه", "أيوه", "اه", "آه", "تمام", "موافق", "اكيد", "أكيد", "ماشي", "اوك", "yes", "yeah", "ok",
             "okay", "sure", "confirm", "approve", "approved", "agree")
NO_WORDS = ("لا", "مش موافق", "no", "nope", "cancel", "change", "غير", "تعديل", "عدل")
_NAME_PREFIX = re.compile(r"^(?:اسمي|انا اسمي|أنا اسمي|انا|أنا|الاسم|my name is|i am|i'm|name)\s*:?\s*", re.IGNORECASE)


@dataclass
class ParseResult:
    values: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


def _to_cm(value: float) -> float:
    """Values under 10 are metres (e.g. 2.2 -> 220 cm)."""
    return round(value * 100, 1) if value < 10 else round(value, 1)


def parse_dimensions(text: str, catalog: Catalog | None = None, product_type: str | None = None) -> ParseResult:
    clean = normalize(text)
    if catalog and product_type and any(normalize(w) in clean for w in _DEFAULT_WORDS):
        w, d, h = catalog.product(product_type)["default_dims"]
        return ParseResult({"width_cm": float(w), "depth_cm": float(d), "height_cm": float(h)})
    match = _DIMENSION_TRIPLE.search(clean)
    if match:
        w, d, h = (float(v) for v in match.groups())
        return ParseResult({"width_cm": _to_cm(w), "depth_cm": _to_cm(d), "height_cm": _to_cm(h)})
    values: dict[str, float] = {}
    for key, label in _LABELS.items():
        found = re.search(label + r"\s*:?\s*(?:=\s*)?" + _NUMBER, clean)
        if found:
            values[key] = _to_cm(float(found.group(1)))
    return ParseResult(values)


def parse_quantity(text: str, bare_number: bool = False) -> ParseResult:
    clean = normalize(text)
    for pattern in (_COUNT_BEFORE_WORD, _COUNT_AFTER_WORD):
        match = pattern.search(clean)
        if match:
            return ParseResult({"quantity": int(match.group(1))})
    if bare_number:
        match = re.fullmatch(r"\s*(\d+)\s*", clean)
        if match:
            return ParseResult({"quantity": int(match.group(1))})
        for word, value in _WORD_NUMBERS.items():
            if re.search(rf"(?:^|\s){word}(?:$|\s)", clean):
                return ParseResult({"quantity": value})
    return ParseResult()


def parse_phone(text: str) -> ParseResult:
    match = _PHONE.search(to_western_digits(text).replace(" ", "").replace("-", ""))
    return ParseResult({"customer_phone": "0" + match.group(1)}) if match else ParseResult({})


def parse_name(text: str) -> ParseResult:
    name = _NAME_PREFIX.sub("", text.strip()).strip(" .،,")
    if 2 <= len(name) <= 60 and not re.search(r"\d", name):
        return ParseResult({"customer_name": name})
    return ParseResult()


def is_yes(text: str) -> bool:
    clean = normalize(text)
    return any(re.search(rf"(?:^|\s){re.escape(normalize(w))}(?:$|\s|[.!،,])", clean) for w in YES_WORDS)


def is_no(text: str) -> bool:
    clean = normalize(text)
    return any(re.search(rf"(?:^|\s){re.escape(normalize(w))}(?:$|\s|[.!،,])", clean) for w in NO_WORDS)


def extract_mentions(text: str, catalog: Catalog, awaiting: str | None = None,
                     product_type: str | None = None) -> dict[str, Any]:
    """Every order detail found in a free-text message."""
    values: dict[str, Any] = {}
    matches = {f: catalog.find(f, text) for f in OPTION_FIELDS}
    for field_name, match in matches.items():
        if match is None:
            continue
        shared = [other for other, m in matches.items()
                  if other != field_name and m is not None and normalize(m.synonym) == normalize(match.synonym)]
        if shared and awaiting != field_name:
            continue  # e.g. "natural" is both a finish and a colour: only use it for the asked question
        values[field_name] = match.key
    values.update(parse_dimensions(text, catalog, product_type or values.get("product_type")).values)
    values.update(parse_quantity(text, bare_number=awaiting == "quantity").values)
    product_match = matches.get("product_type")
    if "quantity" not in values and product_match is not None:  # "عايز 2 دولاب" / "2 wardrobes"
        count = re.search(r"(\d+)\s*" + re.escape(normalize(product_match.synonym)), normalize(text))
        if count and int(count.group(1)) <= 50:
            values["quantity"] = int(count.group(1))
    values.update(parse_phone(text).values)
    if awaiting == "customer_name" and "customer_phone" not in values:
        values.update(parse_name(text).values)
    return values


def missing_fields(data: dict[str, Any]) -> list[str]:
    missing = []
    for name in FIELDS:
        if name == "dimensions":
            if not all(data.get(k) for k in ("width_cm", "depth_cm", "height_cm")):
                missing.append(name)
        elif not data.get(name):
            missing.append(name)
    return missing


def validate(data: dict[str, Any], catalog: Catalog) -> dict[str, str]:
    """Problems with already collected values, keyed by field."""
    problems: dict[str, str] = {}
    product = data.get("product_type")
    if product and all(data.get(k) for k in ("width_cm", "depth_cm", "height_cm")):
        info = catalog.product(product)
        for index, key in enumerate(("width_cm", "depth_cm", "height_cm")):
            low, high = info["min_dims"][index], info["max_dims"][index]
            if not low <= float(data[key]) <= high:
                problems["dimensions"] = f"{key}:{low}-{high}"
                break
    quantity = data.get("quantity")
    if quantity is not None and not 1 <= int(quantity) <= 50:
        problems["quantity"] = "1-50"
    return problems
