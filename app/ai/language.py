from __future__ import annotations

import re

_ARABIC = re.compile(r"[\u0600-\u06FF]")
_LATIN = re.compile(r"[A-Za-z]")
_DIACRITICS = re.compile(r"[\u064B-\u065F\u0670\u0640]")
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def is_arabic(text: str) -> bool:
    return bool(_ARABIC.search(text or ""))


def detect_language(text: str) -> str:
    """'ar' if Arabic letters dominate, else 'en'."""
    arabic = len(_ARABIC.findall(text or ""))
    latin = len(_LATIN.findall(text or ""))
    return "ar" if arabic and arabic >= latin * 0.3 else "en"


def to_western_digits(text: str) -> str:
    return (text or "").translate(_DIGITS).replace("٫", ".").replace("،", ",")


def normalize(text: str) -> str:
    """Lower-case, Western digits, unified Arabic letters, no diacritics."""
    value = to_western_digits(text).lower()
    value = _DIACRITICS.sub("", value)
    value = re.sub("[إأآا]", "ا", value)
    value = value.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value).strip()


def contains_any(text: str, words) -> bool:
    clean = normalize(text)
    return any(normalize(word) in clean for word in words)
