"""Descriptive analysis of one term: peaks, before/peak/after weeks, lifecycle shape and phase.

Sections 3-6 of google_trends.ipynb, extended with lifecycle metrics. Scores are Google's
relative 0-100 index; compare a term with itself, not across terms.
"""
import numpy as np
import pandas as pd
from scipy.signal import find_peaks


# Monday-Sunday before / peak / after weeks around the highest day, with complete-week means.
def peak_weeks(daily):
    valid = daily.dropna()
    if valid.empty or valid.max() <= 0:
        return []
    peak_day = valid.idxmax()
    monday = peak_day - pd.Timedelta(days=peak_day.weekday())
    rows = []
    for label, start in [("Before", monday - pd.Timedelta(days=7)), ("Peak week", monday),
                         ("After", monday + pd.Timedelta(days=7))]:
        end = start + pd.Timedelta(days=6)
        week = daily.reindex(pd.date_range(start, end, freq="D"))
        days = int(week.notna().sum())
        rows.append({"label": label, "start": f"{start:%Y-%m-%d}", "end": f"{end:%Y-%m-%d}",
                     "days": days, "mean": float(week.mean()) if days == 7 else None})
    return rows


# Shape of the main spike on a daily (or weekly) series, using a centred 7-day mean.
# onset: last time before the peak the smoothed level was under 10% of the peak;
# half-life / fade: first time after the peak it fell under 50% / 10%.
def lifecycle(series, freq):
    step = 1 if freq == "daily" else 7
    window = 7 if freq == "daily" else 1
    smooth = series.interpolate(limit_area="inside").rolling(window, center=True, min_periods=1).mean()
    if smooth.dropna().empty or smooth.max() <= 0:
        return None
    peak_date = smooth.idxmax()
    peak_level = smooth.max()
    before, after = smooth.loc[:peak_date], smooth.loc[peak_date:]

    below = before.loc[before < 0.1 * peak_level]
    onset = below.index[-1] if len(below) else None
    half = after.loc[after < 0.5 * peak_level]
    fade = after.loc[after < 0.1 * peak_level]

    def days_between(a, b):
        return None if a is None or b is None else int((b - a).days)

    retention = None
    later = peak_date + pd.Timedelta(days=28)
    if later <= smooth.index.max():
        retention = float(100 * smooth.loc[later:later + pd.Timedelta(days=6)].mean() / peak_level)

    total = series.fillna(0).sum()
    near = series.loc[peak_date - pd.Timedelta(days=30):peak_date + pd.Timedelta(days=30)].fillna(0).sum()
    return {
        "resolution": freq,
        "peak_date": f"{series.loc[peak_date - pd.Timedelta(days=step * 3):peak_date + pd.Timedelta(days=step * 3)].idxmax():%Y-%m-%d}",
        "onset_date": None if onset is None else f"{onset:%Y-%m-%d}",
        "rise_days": days_between(onset, peak_date),
        "half_life_days": days_between(peak_date, half.index[0] if len(half) else None),
        "fade_days": days_between(peak_date, fade.index[0] if len(fade) else None),
        "retention_4w_pct": retention,
        "spike_share_pct": float(100 * near / total) if total > 0 else None,
    }


# Secondary waves on the monthly backbone: peaks with prominence >= 15 index points.
def resurgences(monthly):
    values = monthly.fillna(0).to_numpy()
    peaks, props = find_peaks(values, prominence=15, distance=6)
    return [{"date": f"{monthly.index[i]:%Y-%m-%d}", "level": float(values[i]),
             "prominence": float(p)} for i, p in zip(peaks, props["prominences"])]


# Where the term is now. Uses the finest series that reaches the end of the data (daily, then
# weekly, then monthly), so a spike that peaked and died within one month is not called rising.
# Each value is relative to that series' all-time peak (smoothed), compared over two windows.
def phase(series_by_freq, end):
    end = pd.Timestamp(end)
    window = {"daily": 28, "weekly": 4, "monthly": 3}
    chosen = None
    for freq in ("daily", "weekly", "monthly"):
        series = series_by_freq.get(freq)
        if series is None or series.dropna().empty:
            continue
        reach = series.index.max() + (pd.offsets.MonthEnd(0) if freq == "monthly" else pd.Timedelta(0))
        if (end - reach).days <= 45:
            chosen = freq
            break
    if chosen is None:
        return {"phase": "No signal", "detail": "Google has too little recent data for this term."}
    series = series_by_freq[chosen].interpolate(limit_area="inside")
    smooth = series.rolling(7, min_periods=1).mean() if chosen == "daily" else series
    peak = smooth.max()
    if not peak > 0:
        return {"phase": "No signal", "detail": "Google has too little data for this term."}
    n = window[chosen]
    recent = series.iloc[-n:].mean() / peak
    previous = series.iloc[-2 * n:-n].mean() / peak if len(series) >= 2 * n else recent
    peak_date = smooth.idxmax()
    days_since = int((series.index.max() - peak_date).days)
    monthly = series_by_freq.get("monthly")
    long_run = monthly.iloc[-24:].median() / monthly.max() if monthly is not None and monthly.max() > 0 else 0

    if days_since <= 21 and recent >= 0.4:
        label, detail = "Peaking", "At or just past its all-time high."
    elif recent >= 0.15 and recent > 1.3 * max(previous, 0.01):
        label, detail = "Rising", "Interest grew against the previous period."
    elif long_run >= 0.25:
        label, detail = "Evergreen", "Sustained interest for two years or more."
    elif recent < 0.08:
        label, detail = "Dormant", "Under 8% of its peak recently."
    else:
        label, detail = "Fading", "Past its peak and declining."
    return {"phase": label, "detail": detail, "recent_vs_peak_pct": float(100 * recent),
            "days_since_peak": days_since, "basis": chosen}


# Plain-language shape class from the half-life.
def shape(cycle):
    if not cycle or cycle.get("half_life_days") is None:
        return "Unresolved"
    half = cycle["half_life_days"]
    if half <= 7:
        return "Flash"
    if half <= 45:
        return "Wave"
    return "Slow burn"


# Everything the dashboard shows for one term, from its processed series.
def summarize(series_by_freq, end):
    monthly = series_by_freq.get("monthly")
    daily = series_by_freq.get("daily")
    weekly = series_by_freq.get("weekly")
    detail = series_by_freq.get("daily") if daily is not None else weekly
    cycle = lifecycle(detail, "daily" if daily is not None else "weekly") if detail is not None else None
    summary = {
        "phase": phase(series_by_freq, end),
        "lifecycle": cycle,
        "shape": shape(cycle),
        "weeks": peak_weeks(daily) if daily is not None else [],
        "resurgences": resurgences(monthly) if monthly is not None else [],
    }
    if monthly is not None and monthly.max() > 0:
        summary["peak_month"] = f"{monthly.idxmax():%Y-%m}"
        summary["latest_month"] = {"date": f"{monthly.index[-1]:%Y-%m}",
                                   "value": float(np.nan_to_num(monthly.iloc[-1]))}
    return summary
