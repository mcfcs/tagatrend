"""Grouped leave-one-trend-out backtests: can we forecast a term we have never trained on?

For each held-out group, the global models train on every other term and forecast every origin
of the held-out term. That mirrors the real use: a new term appears, and only other terms'
lifecycles are available to learn from. Terms from the same wave are held out together so a
sibling (Lodi and Petmalu, Sana All and Naol) cannot leak the answer.
"""
import numpy as np
import pandas as pd

from .catalog import TRENDS
from .features import SETTINGS, make_origins, origin_histories
from .models import BASELINES, GlobalMLP, GlobalXGB
from .series import read_series

WAVES = [{"lodi", "petmalu", "werpa"}, {"sana_all", "naol"}]
ACTIVE_FLOOR = 0.1  # An origin is scored if its window or its future reaches 10% of the peak so far.


# Which terms are held out together with `slug`.
def group_of(slug):
    for wave in WAVES:
        if slug in wave:
            return frozenset(wave)
    return frozenset([slug])


# Every catalog term that has a processed series at this resolution, as origins.
def load_origins(freq, slugs=None):
    data = {}
    for entry in TRENDS:
        if slugs and entry["slug"] not in slugs:
            continue
        series = read_series(entry["slug"], freq)
        if series is None:
            continue
        origins = make_origins(series, freq)
        if origins is not None and len(origins["dates"]) >= 10:
            origins["series"] = series
            data[entry["slug"]] = origins
    return data


# Chronological train/validation split within each training term (last 20% validates).
def pooled_split(data, slugs):
    parts = {"xt": [], "yt": [], "xv": [], "yv": []}
    for slug in slugs:
        x, y = data[slug]["x"], data[slug]["y"]
        cut = int(len(x) * 0.8)
        parts["xt"].append(x[:cut]); parts["yt"].append(y[:cut])
        parts["xv"].append(x[cut:]); parts["yv"].append(y[cut:])
    return [np.concatenate(parts[key]) for key in ("xt", "yt", "xv", "yv")]


# Lifecycle phase of each origin relative to the term's eventual peak (scoring labels only).
def phase_labels(dates, series, freq):
    peak = series.idxmax()
    days = (dates - peak).days
    labels = np.where(days < 0, "Rise", np.where(days <= 14, "Peak", "Decay"))
    return labels


# Out-of-fold quantile forecasts for every model, plus TimesFM zero-shot if requested.
def backtest(freq, use_timesfm=True, log=print):
    cfg = SETTINGS[freq]
    lookback, horizon = cfg["lookback"], cfg["horizon"]
    data = load_origins(freq)
    predictions = {slug: {} for slug in data}

    for slug, origins in data.items():
        for name, baseline in BASELINES.items():
            predictions[slug][name] = baseline(origins["x"], lookback, horizon)

    groups = sorted({group_of(slug) & set(data) for slug in data}, key=lambda g: sorted(g))
    for group in groups:
        train = [slug for slug in data if slug not in group]
        xt, yt, xv, yv = pooled_split(data, train)
        log(f"[{freq}] holding out {', '.join(sorted(group))}: {len(xt)} train origins")
        for model in (GlobalXGB(horizon), GlobalMLP(horizon, lookback)):
            model.fit(xt, yt, xv, yv)
            for slug in group:
                predictions[slug][model.name] = model.predict(data[slug]["x"])

    if use_timesfm:
        from .models.foundation import TimesFM
        foundation = TimesFM()
        for slug, origins in data.items():
            predictions[slug]["TimesFM"] = foundation.predict_histories(origin_histories(origins), horizon)
        log(f"[{freq}] TimesFM zero-shot done")

    learned = [name for name in ("XGBoost", "MLP", "TimesFM") if name in next(iter(predictions.values()))]
    for slug in data:
        predictions[slug]["Ensemble"] = np.mean([predictions[slug][name] for name in learned], axis=0)
    return data, predictions


# Long table of absolute errors: one row per (term, origin, horizon, model).
# `error_pts` is in points of the peak so far; `error_index` is on the term's 0-100 scale.
def score(data, predictions, freq):
    frames = []
    horizon = SETTINGS[freq]["horizon"]
    for slug, origins in data.items():
        y, scale = origins["y"], origins["scale"]
        window_max = origins["x"][:, :SETTINGS[freq]["lookback"]].max(axis=1)
        active = (window_max >= ACTIVE_FLOOR) | (np.nanmax(np.nan_to_num(y), axis=1) >= ACTIVE_FLOOR)
        phases = phase_labels(origins["dates"], origins["series"], freq)
        for name, q in predictions[slug].items():
            error = np.abs(q[..., 1] - y)
            covered = (y >= q[..., 0]) & (y <= q[..., 2])
            for h in range(horizon):
                finite = np.isfinite(y[:, h]) & active
                frames.append(pd.DataFrame({
                    "trend": slug, "model": name, "h": h + 1, "phase": phases[finite],
                    "origin": origins["dates"][finite],
                    "error_pts": 100 * error[finite, h],
                    "error_index": error[finite, h] * scale[finite],
                    "covered": covered[finite, h]}))
    return pd.concat(frames, ignore_index=True)


# Mean absolute error and skill against Naive, overall and by any grouping column.
# Skill uses index points (the term's own 0-100 scale), the unit the notebooks report;
# points of the peak so far over-weight early origins, where the scale is still tiny.
def summary(scores, by=()):
    by = list(by)
    table = scores.groupby(["model", *by]).agg(
        mae_index=("error_index", "mean"), mae_pts=("error_pts", "mean"),
        coverage_80=("covered", "mean"), n=("error_index", "size")).reset_index()
    naive = table.loc[table["model"] == "Naive", [*by, "mae_index"]].rename(columns={"mae_index": "naive"})
    table = table.merge(naive, on=by) if by else table.assign(naive=float(naive["naive"].iloc[0]))
    table["skill_pct"] = 100 * (1 - table["mae_index"] / table.pop("naive"))
    return table
