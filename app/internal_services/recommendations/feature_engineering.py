from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd


def month_start(value: dt.date) -> pd.Timestamp:
    return pd.Timestamp(value.year, value.month, 1)


def last_complete_month(reference_date: dt.date) -> pd.Timestamp:
    """The reference month is partial, so the last complete month is the one before it."""
    return month_start(reference_date) - pd.offsets.MonthBegin(1)


def monthly_series(frame: pd.DataFrame, date_column: str, value_column: str,
                   until: pd.Timestamp | None = None) -> pd.Series:
    """Continuous monthly series (missing months = 0), optionally cut at `until` (inclusive)."""
    if frame.empty:
        return pd.Series(dtype=float)
    series = frame.groupby(date_column)[value_column].sum().astype(float).sort_index()
    series.index = pd.to_datetime(series.index).to_period("M").to_timestamp()
    series = series.groupby(level=0).sum()
    end = until if until is not None else series.index.max()
    full = pd.date_range(series.index.min(), end, freq="MS")
    return series.reindex(full, fill_value=0.0)[:end]


def pct_change(current: float, previous: float) -> float | None:
    if previous in (0, None) or pd.isna(previous):
        return None
    return round((current - previous) / abs(previous) * 100, 2)


def build_features(series: pd.Series) -> pd.DataFrame:
    """Lags, rolling mean, seasonality and trend for each month of the series."""
    frame = pd.DataFrame({"y": series.values}, index=series.index)
    for lag in (1, 2, 3):
        frame[f"lag_{lag}"] = frame["y"].shift(lag)
    frame["rolling_3"] = frame["y"].shift(1).rolling(3).mean()
    months = frame.index.month
    frame["month_sin"] = np.sin(2 * np.pi * months / 12)
    frame["month_cos"] = np.cos(2 * np.pi * months / 12)
    frame["t"] = np.arange(len(frame))
    return frame


FEATURE_COLUMNS = ["lag_1", "lag_2", "lag_3", "rolling_3", "month_sin", "month_cos", "t"]


def recent_vs_previous(frame: pd.DataFrame, key: str, value: str, until: pd.Timestamp,
                       months: int = 3) -> pd.DataFrame:
    """Sum of `value` in the last `months` complete months vs the `months` before, per `key`."""
    if frame.empty:
        return pd.DataFrame(columns=[key, "recent", "previous", "growth_pct"])
    recent_start = until - pd.offsets.MonthBegin(months - 1)
    previous_start = recent_start - pd.offsets.MonthBegin(months)
    dates = frame["sale_month"] if "sale_month" in frame else frame["month_start"]
    recent = frame[(dates >= recent_start) & (dates <= until)].groupby(key)[value].sum()
    previous = frame[(dates >= previous_start) & (dates < recent_start)].groupby(key)[value].sum()
    result = pd.DataFrame({"recent": recent, "previous": previous}).fillna(0.0)
    result["growth_pct"] = [pct_change(r, p) for r, p in zip(result["recent"], result["previous"])]
    return result.reset_index().rename(columns={"index": key})
