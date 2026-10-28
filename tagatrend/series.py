"""Build one term's monthly backbone, stitched weekly and daily series, and regional snapshots.

The stitching logic is section 8 of google_trends.ipynb, unchanged: overlapping windows short
enough for weekly or daily rows, aligned on their shared nonzero overlap, then rescaled to 100.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .config import (BACKBONE_START, DROPOUT_FLOOR, END_DATE, GEO, OVERLAP_DAYS, PROCESSED_DIR,
                     PULL_DIR, RAW_DIR, WINDOW_DAYS)
from .fetch import TrendsError, archived_pulls, load_trends

FREQ_DAYS = {"daily": 1, "weekly": 7}


# Split a long date range into overlapping request windows short enough for daily or weekly rows.
# The last window keeps full length so Google keeps returning the same row frequency.
def plan_windows(start, end, freq):
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    length = pd.Timedelta(days=WINDOW_DAYS[freq] - 1)
    step = pd.Timedelta(days=WINDOW_DAYS[freq] - OVERLAP_DAYS[freq])
    windows = []
    window_start = start
    while window_start + length < end:
        windows.append((window_start, window_start + length))
        window_start += step
    windows.append((max(start, end - length), end))
    return windows


# Turn one saved request into a numeric series. Drops unfinished rows and marks zero dropouts
# (a 0 right after a busy week) as missing, using past values only.
def clean_pull(frame, mask_dropouts=True):
    frame = frame.copy()
    frame.index = pd.to_datetime(frame.index)
    frame = frame.sort_index()
    if "isPartial" in frame.columns:
        partial = frame.pop("isPartial").astype(str).str.lower() == "true"
        frame = frame.loc[~partial]
    series = pd.to_numeric(frame.iloc[:, 0].astype(str).str.replace("<1", "0.5"), errors="coerce")
    series = series.where(series.between(0, 100))
    if not mask_dropouts:
        return series, 0
    trailing = series.shift(1).rolling(7, min_periods=4).median()
    dropout = (series == 0) & (trailing >= DROPOUT_FLOOR)
    return series.mask(dropout), int(dropout.sum())


# Join overlapping windows onto one scale: rescale each new window to match the overlap so far,
# average the overlapping days, then rescale the whole series so its maximum is 100.
def stitch(pieces):
    combined = pieces[0]
    for piece in pieces[1:]:
        overlap = combined.index.intersection(piece.index)
        shared = overlap[(combined[overlap] > 0) & (piece[overlap] > 0)]
        if len(shared) < 4:
            raise ValueError("too little nonzero overlap to align windows")
        piece = piece * combined[shared].sum() / piece[shared].sum()
        combined = pd.concat([combined, piece], axis=1, sort=True).mean(axis=1)
    peak = combined.max()
    if not peak > 0:
        raise ValueError("series is all zeros")
    return 100 * combined / peak


# Fetch (or reuse) every window of a plan, average archived pulls per window, and stitch.
# If the tail windows are all zeros and cannot be aligned, drop them and stitch what remains.
def build_stitched(slug, query, start, end, freq, raw_dir=RAW_DIR, pull_dir=PULL_DIR):
    windows = plan_windows(start, end, freq)
    pieces, pulls, dropouts = [], [], 0
    for window_start, window_end in windows:
        a, b = f"{window_start:%Y-%m-%d}", f"{window_end:%Y-%m-%d}"
        load_trends(slug, query, a, b, raw_dir=raw_dir, pull_dir=pull_dir)
        frames = archived_pulls(slug, a, b, raw_dir=raw_dir, pull_dir=pull_dir)
        cleaned = [clean_pull(frame) for frame in frames]
        dropouts += sum(masked for _, masked in cleaned)
        piece = pd.concat([series for series, _ in cleaned], axis=1, sort=True).mean(axis=1)
        if piece.index.to_series().diff().dt.days.median() != FREQ_DAYS[freq]:
            raise TrendsError(f"{query}: Google returned a different row frequency for {freq}")
        pieces.append(piece)
        pulls.append(len(frames))

    while pieces:
        try:
            combined = stitch(pieces)
            break
        except ValueError:
            if len(pieces) == 1:
                raise
            pieces, windows, pulls = pieces[:-1], windows[:-1], pulls[:-1]
    combined = combined.asfreq(f"{FREQ_DAYS[freq]}D")
    metadata = {
        "query": query, "geo": GEO, "kind": "time", "freq": freq,
        "window": f"{windows[0][0]:%Y-%m-%d} {windows[-1][1]:%Y-%m-%d}",
        "request_windows": [f"{a:%Y-%m-%d} {b:%Y-%m-%d}" for a, b in windows],
        "pulls_per_window": pulls, "dropouts_masked": dropouts,
    }
    return combined, metadata


# One full-history request: Google returns monthly rows. Used to find the peak month.
def build_monthly(slug, query, end=END_DATE, raw_dir=RAW_DIR, pull_dir=PULL_DIR):
    frame = load_trends(slug, query, BACKBONE_START, end, raw_dir=raw_dir, pull_dir=pull_dir)
    series, _ = clean_pull(frame, mask_dropouts=False)
    end_ts = pd.Timestamp(end)
    # A month row describes the whole month; keep only months that ended by END_DATE.
    series = series.loc[series.index + pd.offsets.MonthEnd(0) <= end_ts]
    if not series.max() > 0:
        raise TrendsError(f"{query}: Google has no interest data for this term in {GEO}")
    metadata = {"query": query, "geo": GEO, "kind": "time", "freq": "monthly",
                "window": f"{BACKBONE_START} {end}", "request_windows": [f"{BACKBONE_START} {end}"],
                "pulls_per_window": [1], "dropouts_masked": 0}
    return series.asfreq("MS"), metadata


# Default spans around the monthly peak, clipped to [BACKBONE_START, end].
def auto_spans(peak_month, end=END_DATE):
    end_ts, floor = pd.Timestamp(end), pd.Timestamp(BACKBONE_START)
    weekly = (max(floor, peak_month - pd.Timedelta(days=730)),
              min(end_ts, peak_month + pd.Timedelta(days=4 * 365)))
    daily_start = peak_month - pd.Timedelta(days=75)
    daily_end = daily_start + pd.Timedelta(days=WINDOW_DAYS["daily"] - 1)
    if daily_end > end_ts:
        daily_end = end_ts
        daily_start = end_ts - pd.Timedelta(days=WINDOW_DAYS["daily"] - 1)
    return {"weekly": weekly, "daily": (max(floor, daily_start), daily_end)}


# Regional interest for one window, as {region: score}, top regions first.
def build_regions(slug, query, start, end, raw_dir=RAW_DIR, pull_dir=PULL_DIR):
    frame = load_trends(slug, query, f"{start:%Y-%m-%d}", f"{end:%Y-%m-%d}", kind="region",
                        raw_dir=raw_dir, pull_dir=pull_dir)
    scores = pd.to_numeric(frame.iloc[:, 0], errors="coerce").dropna()
    scores = scores.loc[scores > 0].sort_values(ascending=False)
    return {str(region): float(score) for region, score in scores.items()}


# Write a series and its metadata as <slug>_<freq>.csv/.json.
def save_series(series, metadata, slug, out_dir=PROCESSED_DIR):
    out_dir = Path(out_dir)
    frame = pd.DataFrame({"interest": series.round(3)})
    frame.index.name = "date"
    frame.to_csv(out_dir / f"{slug}_{metadata['freq']}.csv")
    metadata = {**metadata, "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    (out_dir / f"{slug}_{metadata['freq']}.json").write_text(json.dumps(metadata, indent=2),
                                                            encoding="utf-8")


# Read a processed series back (None if it was never built).
def read_series(slug, freq, out_dir=PROCESSED_DIR):
    path = Path(out_dir) / f"{slug}_{freq}.csv"
    if not path.exists():
        return None
    return pd.read_csv(path, index_col=0, parse_dates=True)["interest"].rename(slug)


# Build monthly, weekly, daily and regional data for one term and write them to out_dir.
# `entry` is a catalog row; its optional `weekly`/`daily` (start, end) override the auto spans.
def build_term(entry, end=END_DATE, out_dir=PROCESSED_DIR, raw_dir=RAW_DIR, pull_dir=PULL_DIR,
               on_step=None):
    slug, query = entry["slug"], entry["query"]
    step = on_step or (lambda message: print(f"{query}: {message}"))
    built = {}

    step("monthly history")
    monthly, meta = build_monthly(slug, query, end, raw_dir, pull_dir)
    save_series(monthly, meta, slug, out_dir)
    built["monthly"] = monthly
    spans = auto_spans(monthly.idxmax(), end)

    for freq in ("weekly", "daily"):
        override = entry.get(freq, "auto")
        if override is None:
            continue
        start, stop = spans[freq] if override == "auto" else (
            pd.Timestamp(override[0]), pd.Timestamp(override[1] or end))
        step(f"{freq} {start:%Y-%m-%d} to {stop:%Y-%m-%d}")
        try:
            series, meta = build_stitched(slug, query, start, stop, freq, raw_dir, pull_dir)
        except (TrendsError, ValueError) as error:
            step(f"{freq} skipped ({error})")
            continue
        save_series(series, meta, slug, out_dir)
        built[freq] = series

    step("regions")
    regions = {}
    daily = built.get("daily")
    if daily is not None and daily.max() > 0:
        peak_day = daily.idxmax()
        monday = peak_day - pd.Timedelta(days=peak_day.weekday())
        windows = [("Peak week", monday, monday + pd.Timedelta(days=6))]
    else:
        peak_month = monthly.idxmax()
        windows = [("Peak month", peak_month, peak_month + pd.offsets.MonthEnd(0))]
    end_ts = pd.Timestamp(end)
    windows.append(("Last 30 days", end_ts - pd.Timedelta(days=29), end_ts))
    for label, start, stop in windows:
        if stop > end_ts:
            continue
        try:
            scores = build_regions(slug, query, start, stop, raw_dir, pull_dir)
        except TrendsError as error:
            step(f"regions {label} skipped ({error})")
            scores = {}
        regions[label] = {"start": f"{start:%Y-%m-%d}", "end": f"{stop:%Y-%m-%d}", "scores": scores}
    (Path(out_dir) / f"{slug}_regions.json").write_text(json.dumps(regions, indent=2),
                                                       encoding="utf-8")
    built["regions"] = regions
    return built
