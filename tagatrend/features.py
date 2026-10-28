"""Supervised forecasting windows that never see the future.

Each stitched series is scaled so its eventual maximum is 100, so the raw level leaks whether
the peak has already happened (a value of 100 means it has). Every window here is therefore
divided by the highest value seen *up to the forecast origin* ("peak so far"). Models learn the
shape of a lifecycle relative to what is known at the time, and predictions are scaled back.
"""
import numpy as np
import pandas as pd

# Context length and horizon per resolution.
SETTINGS = {
    "daily": {"lookback": 42, "horizon": 28, "step_days": 1, "censor_days": 28},
    "weekly": {"lookback": 26, "horizon": 12, "step_days": 7, "censor_days": 0},
}
CENSOR_FLOOR = 5  # google_trends_ml.ipynb: a 0 after steady nonzero days is below Google's threshold.
QUANTILES = (0.1, 0.5, 0.9)
EXTRA_FEATURES = ["window_max", "mean_7", "mean_prev_7", "growth", "slope", "since_peak",
                  "since_window_max", "age", "dow_sin", "dow_cos"]


# A 0 right after a run of clearly nonzero days is a below-threshold day, not zero interest.
# Looks only at the previous `days` values (google_trends_ml.ipynb, change 1).
def mask_censored_zeros(series, days=28, floor=CENSOR_FLOOR):
    if days <= 0:
        return series
    smallest = series.where(series > 0).shift(1).rolling(days, min_periods=1).min()
    return series.mask((series == 0) & (smallest >= floor))


# Inputs for one origin: the last `lookback` values and scale-free summaries, all divided by
# the peak so far. `history` holds observed values up to and including the origin.
def origin_features(history, origin_date, lookback, step_days):
    filled = np.nan_to_num(pd.Series(history).ffill().to_numpy(dtype=float), nan=0.0)
    scale = max(filled.max(), 1.0)
    window = filled[-lookback:] / scale
    if len(window) < lookback:
        window = np.concatenate([np.zeros(lookback - len(window)), window])
    recent = window[-7:].mean()
    previous = window[-14:-7].mean()
    tail = np.log1p(window[-14:] * 100)
    slope = np.polyfit(np.arange(len(tail)), tail, 1)[0]
    nonzero = np.flatnonzero(filled > 0)
    age = (len(filled) - nonzero[0]) if len(nonzero) else 0
    dow = origin_date.dayofweek if step_days == 1 else 0
    extras = [window.max(), recent, previous, (recent + 0.01) / (previous + 0.01), slope,
              min(len(filled) - 1 - int(filled.argmax()), 365 // step_days) * step_days / 365,
              (lookback - 1 - int(window.argmax())) / lookback, min(age * step_days / 365, 5),
              np.sin(2 * np.pi * dow / 7), np.cos(2 * np.pi * dow / 7)]
    return np.concatenate([window, extras]).astype(np.float32), scale


# Every origin of a series as (features, scaled targets, scale, dates). Targets may be NaN
# (dropouts, or past the end of the series); losses and scores skip them.
def make_origins(series, freq, min_scale=3.0, stride=1):
    cfg = SETTINGS[freq]
    lookback, horizon = cfg["lookback"], cfg["horizon"]
    series = mask_censored_zeros(series.sort_index(), cfg["censor_days"])
    values = series.to_numpy(dtype=float)
    rows, targets, scales, dates, positions = [], [], [], [], []
    for origin in range(lookback - 1, len(values) - 1, stride):
        history = values[:origin + 1]
        if np.nanmax(np.nan_to_num(history)) < min_scale:
            continue  # Nothing has happened yet; there is no lifecycle to forecast.
        x, scale = origin_features(history, series.index[origin], lookback, cfg["step_days"])
        future = values[origin + 1:origin + 1 + horizon]
        future = np.concatenate([future, np.full(horizon - len(future), np.nan)])
        if np.isnan(future).all():
            continue
        rows.append(x)
        targets.append(future / scale)
        scales.append(scale)
        dates.append(series.index[origin])
        positions.append(origin)
    if not rows:
        return None
    return {"x": np.stack(rows), "y": np.stack(targets).astype(np.float32),
            "scale": np.asarray(scales, dtype=np.float32), "dates": pd.DatetimeIndex(dates), "positions": np.asarray(positions),
            "clean": series}


# Histories for a zero-shot model: observed values up to each origin, filled forward and
# divided by that origin's peak so far.
def origin_histories(origins):
    filled = origins["clean"].ffill().fillna(0).to_numpy(dtype=np.float32)
    return [filled[:p + 1] / s for p, s in zip(origins["positions"], origins["scale"])]


# Features for a single forecast from the end of `series` (used by the website).
def latest_features(series, freq):
    cfg = SETTINGS[freq]
    series = mask_censored_zeros(series.sort_index(), cfg["censor_days"])
    return origin_features(series.to_numpy(dtype=float), series.index[-1], cfg["lookback"],
                           cfg["step_days"])
