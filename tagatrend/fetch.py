"""Google Trends requests with a disk cache, a dated pull archive and polite rate limiting.

Ported from section 2 and 8 of google_trends.ipynb. File names are unchanged
(`<slug>_<kind>_<start>_<end>.csv` plus a `.json` metadata sidecar), so earlier
pulls in data/raw are reused.
"""
import json
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .config import GEO, PULL_DIR, RAW_DIR

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False

MIN_GAP_SECONDS = 12.0  # Between any two Google requests, across threads.
BACKOFF_SECONDS = [60, 120, 240, 480, 900]  # Google's 429s last minutes, not seconds.
_lock = threading.Lock()
_last_request = 0.0
_client = None


class TrendsError(RuntimeError):
    """Google returned nothing usable, or kept rate-limiting."""


# Wait so consecutive requests are at least MIN_GAP_SECONDS apart (plus jitter).
def _throttle():
    global _last_request
    with _lock:
        wait = _last_request + MIN_GAP_SECONDS + random.uniform(0, 2) - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()


# One pytrends session, reused: a fresh client per request costs an extra cookie request.
# Dropped after a 429 so the retry starts a clean session.
def _session():
    global _client
    if _client is None:
        _client = TrendReq(hl="en-PH", tz=-480, timeout=(10, 30))
    return _client


# Ask Google Trends for one query and window. kind="time" is interest over time,
# kind="region" is interest by subregion. Backs off on HTTP 429.
def request_trends(query, window, kind, retries=len(BACKOFF_SECONDS) + 1):
    global _client
    if not PYTRENDS_AVAILABLE:
        raise TrendsError("pytrends is not installed")
    for attempt in range(retries):
        _throttle()
        try:
            client = _session()
            client.build_payload([query], timeframe=window, geo=GEO)
            if kind == "time":
                frame = client.interest_over_time()
            else:
                frame = client.interest_by_region(resolution="REGION", inc_low_vol=True,
                                                  inc_geo_code=False)
            if frame.empty:
                raise TrendsError("Google returned no data")
            return frame
        except TrendsError:
            raise
        except Exception as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status == 429 and attempt < retries - 1:
                _client = None
                delay = BACKOFF_SECONDS[attempt]
                print(f"  rate limited; retrying in {delay}s")
                time.sleep(delay)
                continue
            raise TrendsError(f"{query} {window} {kind}: {error}") from error
    raise TrendsError(f"{query} {window}: still rate limited")


# Get one query/window/kind from the cache when its metadata matches, else from Google.
# Saves the response with metadata, and archives each pull by date for averaging later.
def load_trends(slug, query, start, end, kind="time", refresh=False, raw_dir=RAW_DIR,
                pull_dir=PULL_DIR, quiet=False):
    raw_dir, pull_dir = Path(raw_dir), Path(pull_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    pull_dir.mkdir(parents=True, exist_ok=True)
    window = f"{start} {end}"
    name = f"{slug}_{kind}_{start}_{end}"
    csv_path, json_path = raw_dir / f"{name}.csv", raw_dir / f"{name}.json"
    expected = {"query": query, "geo": GEO, "window": window, "kind": kind}
    if pd.Timestamp(start) > pd.Timestamp(end):
        raise ValueError("Start date must be on or before the end date.")

    if csv_path.exists() and json_path.exists() and not refresh:
        saved = json.loads(json_path.read_text(encoding="utf-8"))
        if all(saved.get(key) == value for key, value in expected.items()):
            return pd.read_csv(csv_path, index_col=0)

    frame = request_trends(query, window, kind)
    saved = {**expected, "source": "pytrends",
             "extracted_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    frame.to_csv(csv_path)
    json_path.write_text(json.dumps(saved, indent=2), encoding="utf-8")
    if kind == "time":
        archived = pull_dir / f"{name}__{saved['extracted_utc'][:10]}.csv"
        if not archived.exists():
            archived.write_bytes(csv_path.read_bytes())
    if not quiet:
        print(f"  {query}: {kind} {window} -> {len(frame)} rows")
    return frame


# Every archived pull of one time window (at least the current cached one).
def archived_pulls(slug, start, end, raw_dir=RAW_DIR, pull_dir=PULL_DIR):
    name = f"{slug}_time_{start}_{end}"
    paths = sorted(Path(pull_dir).glob(f"{name}__*.csv"))
    if not paths:
        cached = Path(raw_dir) / f"{name}.csv"
        paths = [cached] if cached.exists() else []
    return [pd.read_csv(path, index_col=0) for path in paths]
