from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np


def to_native(value: Any) -> Any:
    """Convert numpy / pandas scalars inside nested structures to plain Python (JSON-safe)."""
    if isinstance(value, dict):
        return {str(k): to_native(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_native(v) for v in value]
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return None if np.isnan(value) else round(float(value), 4)
    if isinstance(value, float):
        return None if value != value else round(value, 4)
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if hasattr(value, "isoformat") and callable(value.isoformat):  # pandas Timestamp
        return value.isoformat()
    return value


@dataclass
class Finding:
    area: str            # sales | products | branches | inventory | production
    title: str
    detail: str
    severity: str = "info"   # info | warning | critical
    metrics: dict[str, Any] = field(default_factory=dict)


@dataclass
class Recommendation:
    area: str
    action: str
    reason: str
    priority: int = 2        # 1 = high, 3 = low
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass
class ForecastResult:
    target: str
    model: str
    history_months: int
    forecast: list[dict[str, Any]]
    backtest_mae: float | None = None
    naive_mae: float | None = None

    @property
    def beats_naive(self) -> bool | None:
        if self.backtest_mae is None or self.naive_mae is None:
            return None
        return self.backtest_mae <= self.naive_mae


@dataclass
class RecommendationReport:
    language: str
    reference_date: str
    last_complete_month: str
    findings: list[Finding]
    forecasts: list[ForecastResult]
    recommendations: list[Recommendation]
    evaluation: dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    priorities: list[str] = field(default_factory=list)
    generated_at: str = field(default_factory=lambda: dt.datetime.now().isoformat(timespec="seconds"))

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["forecasts"] = [{**asdict(f), "beats_naive": f.beats_naive} for f in self.forecasts]
        return to_native(data)
