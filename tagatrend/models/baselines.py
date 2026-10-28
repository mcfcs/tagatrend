"""Reference forecasts that need no training. A learned model is only worth showing if it beats these."""
import numpy as np


# Repeat the last observed value (the notebooks' last-value baseline).
def naive(x, lookback, horizon):
    point = np.repeat(x[:, lookback - 1:lookback], horizon, axis=1)
    return np.repeat(point[..., None], 3, axis=2)


# Repeat the mean of the last seven periods; smooths weekday noise and dropouts.
def mean_7(x, lookback, horizon):
    point = np.repeat(x[:, lookback - 7:lookback].mean(axis=1, keepdims=True), horizon, axis=1)
    return np.repeat(point[..., None], 3, axis=2)


# Exponential drift: extend the last two weeks' log-slope, capped so a spike cannot explode.
def drift(x, lookback, horizon):
    window = np.log1p(x[:, lookback - 14:lookback] * 100)
    t = np.arange(14)
    slope = ((t - t.mean()) * (window - window.mean(axis=1, keepdims=True))).sum(axis=1) / ((t - t.mean()) ** 2).sum()
    slope = np.clip(slope, -0.15, 0.05)
    start = window[:, -7:].mean(axis=1)
    steps = np.arange(1, horizon + 1)
    point = np.expm1(start[:, None] + slope[:, None] * (steps[None, :] + 3)) / 100
    point = np.clip(point, 0, 3)
    return np.repeat(point[..., None], 3, axis=2)


BASELINES = {"Naive": naive, "Mean of last 7": mean_7, "Drift": drift}
