from __future__ import annotations

import logging
import re

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.core.config import settings
from app.internal_services.recommendations.feature_engineering import FEATURE_COLUMNS, build_features
from app.internal_services.recommendations.models import ForecastResult

logger = logging.getLogger(__name__)
MIN_MONTHS_FOR_MODEL = 12
BACKTEST_MONTHS = 3


def _model():
    return make_pipeline(StandardScaler(), Ridge(alpha=1.0))


def _next_features(history: pd.Series, next_month: pd.Timestamp) -> pd.DataFrame:
    extended = pd.concat([history, pd.Series([np.nan], index=[next_month])])
    return build_features(extended).iloc[[-1]][FEATURE_COLUMNS]


def _fit(series: pd.Series):
    features = build_features(series).dropna()
    model = _model()
    model.fit(features[FEATURE_COLUMNS], features["y"])
    return model


def _recursive_forecast(model, history: pd.Series, horizon: int) -> list[tuple[pd.Timestamp, float]]:
    values = history.copy()
    output = []
    for _ in range(horizon):
        next_month = values.index[-1] + pd.offsets.MonthBegin(1)
        prediction = max(0.0, float(model.predict(_next_features(values, next_month))[0]))
        output.append((next_month, prediction))
        values = pd.concat([values, pd.Series([prediction], index=[next_month])])
    return output


class Forecaster:
    def __init__(self, save_models: bool = True):
        self.save_models = save_models

    def forecast(self, series: pd.Series, target: str, horizon: int | None = None) -> ForecastResult:
        horizon = horizon or settings.forecast_horizon_months
        series = series.astype(float)
        if len(series) < MIN_MONTHS_FOR_MODEL:
            level = float(series.tail(3).mean()) if len(series) else 0.0
            start = series.index[-1] if len(series) else pd.Timestamp.today().normalize()
            months = [start + pd.offsets.MonthBegin(i) for i in range(1, horizon + 1)]
            return ForecastResult(target, "moving_average_3", len(series),
                                  [{"month": m.date().isoformat(), "value": round(level, 2)} for m in months])

        # Backtest: one-step-ahead on the last months, trained only on earlier data.
        # Ridge is kept only if it beats the 3-month moving average; both are compared with the naive forecast.
        errors, naive_errors, average_errors = [], [], []
        for cut in range(len(series) - BACKTEST_MONTHS, len(series)):
            train = series.iloc[:cut]
            model = _fit(train)
            predicted = max(0.0, float(model.predict(_next_features(train, series.index[cut]))[0]))
            actual = float(series.iloc[cut])
            errors.append(abs(predicted - actual))
            naive_errors.append(abs(float(train.iloc[-1]) - actual))
            average_errors.append(abs(float(train.tail(3).mean()) - actual))

        naive_mae = round(float(np.mean(naive_errors)), 2)
        if np.mean(average_errors) < np.mean(errors):
            level = round(float(series.tail(3).mean()), 2)
            months = [series.index[-1] + pd.offsets.MonthBegin(i) for i in range(1, horizon + 1)]
            return ForecastResult(target, "moving_average_3", len(series),
                                  [{"month": m.date().isoformat(), "value": level} for m in months],
                                  backtest_mae=round(float(np.mean(average_errors)), 2), naive_mae=naive_mae)

        model = _fit(series)
        if self.save_models:
            folder = settings.path("ml_models")
            folder.mkdir(parents=True, exist_ok=True)
            joblib.dump(model, folder / f"forecast_{re.sub(r'[^a-z0-9]+', '_', target.lower())}.joblib")
        points = _recursive_forecast(model, series, horizon)
        return ForecastResult(target, "ridge_lag_seasonal", len(series),
                              [{"month": m.date().isoformat(), "value": round(v, 2)} for m, v in points],
                              backtest_mae=round(float(np.mean(errors)), 2), naive_mae=naive_mae)
