import datetime as dt
import json

import numpy as np
import pandas as pd

from app.internal_services.recommendations.feature_engineering import (
    last_complete_month,
    monthly_series,
    pct_change,
    recent_vs_previous,
)
from app.internal_services.recommendations.forecasting import Forecaster
from app.internal_services.recommendations.monthly_report import MonthlyReportService
from app.internal_services.recommendations.recommender import Recommender

REF = dt.date(2026, 11, 16)


def test_last_complete_month_skips_partial_reference_month():
    assert last_complete_month(REF) == pd.Timestamp("2026-10-01")


def test_monthly_series_fills_missing_months_and_cuts():
    frame = pd.DataFrame({"m": pd.to_datetime(["2026-01-01", "2026-03-01", "2026-04-01"]), "v": [1.0, 3.0, 4.0]})
    series = monthly_series(frame, "m", "v", pd.Timestamp("2026-03-01"))
    assert list(series.index.strftime("%Y-%m")) == ["2026-01", "2026-02", "2026-03"]
    assert list(series.values) == [1.0, 0.0, 3.0]


def test_pct_change():
    assert pct_change(110, 100) == 10.0 and pct_change(5, 0) is None


def test_recent_vs_previous(historical_data):
    trend = recent_vs_previous(historical_data["product_monthly"], "sku", "units", pd.Timestamp("2026-10-01"))
    rows = trend.set_index("sku")
    assert rows.loc["WRD-01", "growth_pct"] > 0 > rows.loc["TBL-03", "growth_pct"]


def test_ridge_beats_naive_on_seasonal_series():
    months = pd.date_range("2023-01-01", periods=36, freq="MS")
    values = 1000 + 300 * np.sin(2 * np.pi * months.month / 12) + np.arange(36) * 10
    result = Forecaster(save_models=False).forecast(pd.Series(values, index=months), "test", horizon=3)
    assert result.model == "ridge_lag_seasonal" and len(result.forecast) == 3
    assert result.forecast[0]["month"] == "2026-01-01"
    assert result.beats_naive


def test_noisy_series_falls_back_to_moving_average():
    months = pd.date_range("2024-01-01", periods=24, freq="MS")
    values = [40, 10, 70, 15, 65, 20, 60, 12, 72, 18, 66, 14, 41, 69, 11, 64, 22, 58, 16, 71, 13, 67, 19, 40]
    result = Forecaster(save_models=False).forecast(pd.Series(values, index=months, dtype=float), "noisy")
    assert result.model in ("moving_average_3", "ridge_lag_seasonal") and result.backtest_mae is not None
    if result.model == "moving_average_3":
        assert result.forecast[0]["value"] == round(sum(values[-3:]) / 3, 2)


def test_short_history_uses_moving_average():
    months = pd.date_range("2026-01-01", periods=5, freq="MS")
    result = Forecaster(save_models=False).forecast(pd.Series([10, 20, 30, 40, 50], index=months, dtype=float), "s")
    assert result.model == "moving_average_3" and result.forecast[0]["value"] == 40.0


def test_recommendations_follow_history(historical_data):
    report = Recommender(Forecaster(save_models=False)).build(historical_data, REF, "en")
    assert report.last_complete_month == "2026-10"
    actions = [r.action for r in report.recommendations]
    assert any("Increase production" in a and "Wardrobe Classic" in a for a in actions)
    assert any("Reduce production" in a and "Dining Table" in a for a in actions)
    assert any("Oak board" in a for a in actions)                       # LOW stock
    assert not any("Glue" in a for a in actions)                        # OK stock
    assert any("Giza Outlet" in a for a in actions)                     # losing sales branch
    assert not any("Factory" in a for a in actions)                     # factory carries central costs
    assert any(r.evidence.get("late") == 2 for r in report.recommendations)
    assert report.evaluation["checks_passed"]
    assert report.evaluation["models_tested"] >= 1
    json.dumps(report.to_dict(), ensure_ascii=False)                    # JSON-serialisable (no numpy types)


def test_arabic_report(historical_data):
    report = Recommender(Forecaster(save_models=False)).build(historical_data, REF, "ar")
    assert any("دولاب كلاسيك" in r.action for r in report.recommendations)


class _Loader:
    def __init__(self, data):
        self.data = data

    async def load(self):
        return self.data, REF


async def test_monthly_report_saves_files_without_llm(historical_data, llm_offline, tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "monthly_report_enabled", False)
    service = MonthlyReportService(loader=_Loader(historical_data), recommender=Recommender(Forecaster(save_models=False)))
    result = await service.generate("ar", use_llm=True, save=False)
    assert result["summary"] and result["priorities"]
    paths = service.save(result, tmp_path)
    assert paths[0].name == "monthly_2026-10_ar.json" and paths[1].read_text(encoding="utf-8").startswith("# SANAA")
