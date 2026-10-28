"""Read-side of the pipeline for the website: term payloads, forecasts and live searches.

Catalog terms are read from data/processed. A searched term is built on demand with the same
pipeline into data/search, then served exactly like a catalog term.
"""
import json
import threading
import time
import uuid
from pathlib import Path

import numpy as np
import pandas as pd

from . import analysis
from .catalog import BY_SLUG, TRENDS, slugify
from .config import END_DATE, MODEL_DIR, PROCESSED_DIR, SEARCH_DIR
from .features import QUANTILES, SETTINGS, mask_censored_zeros, origin_features
from .fetch import TrendsError
from .evaluate import weighted
from .series import build_term, read_series

FREQS = ("monthly", "weekly", "daily")
SEARCH_PROCESSED = SEARCH_DIR / "processed"
SEARCH_RAW = SEARCH_DIR / "raw"
for directory in (SEARCH_PROCESSED, SEARCH_RAW, SEARCH_RAW / "pulls"):
    directory.mkdir(parents=True, exist_ok=True)


# Where a slug's files live, and its catalog entry (searched terms get a minimal one).
def locate(slug):
    if slug in BY_SLUG:
        return PROCESSED_DIR, BY_SLUG[slug]
    meta = SEARCH_PROCESSED / f"{slug}_search.json"
    if meta.exists():
        return SEARCH_PROCESSED, json.loads(meta.read_text(encoding="utf-8"))
    return None, None


def _points(series, digits=2):
    if series is None:
        return []
    return [[f"{date:%Y-%m-%d}", None if pd.isna(value) else round(float(value), digits)]
            for date, value in series.items()]


def load_series_set(slug, directory):
    return {freq: read_series(slug, freq, directory) for freq in FREQS}


# One line per term for the library list and the lifecycle ladder.
def library():
    rows = []
    for entry in TRENDS:
        series = load_series_set(entry["slug"], PROCESSED_DIR)
        if series["monthly"] is None:
            continue
        summary = analysis.summarize(series, END_DATE)
        monthly = series["monthly"]
        rows.append({
            "slug": entry["slug"], "query": entry["query"], "group": entry["group"],
            "year": entry["year"], "blurb": entry["blurb"],
            "phase": summary["phase"], "shape": summary["shape"], "lifecycle": summary["lifecycle"],
            "peak_month": summary.get("peak_month"), "resolutions": [f for f in FREQS if series[f] is not None],
            # Yearly means of the monthly backbone: enough for a small overview strip.
            "yearly": _points(monthly.resample("YS").mean(), 1),
        })
    return rows


# Everything the term page needs, in one response.
def term_payload(slug):
    directory, entry = locate(slug)
    if directory is None:
        return None
    series = load_series_set(slug, directory)
    if series["monthly"] is None:
        return None
    regions_path = directory / f"{slug}_regions.json"
    regions = json.loads(regions_path.read_text(encoding="utf-8")) if regions_path.exists() else {}
    meta = {}
    for freq in FREQS:
        path = directory / f"{slug}_{freq}.json"
        if path.exists():
            meta[freq] = json.loads(path.read_text(encoding="utf-8"))
    return {
        "slug": slug, "query": entry["query"], "group": entry.get("group", "search"),
        "year": entry.get("year"), "blurb": entry.get("blurb"),
        "series": {freq: _points(s) for freq, s in series.items() if s is not None},
        "summary": analysis.summarize(series, END_DATE), "regions": regions, "meta": meta,
        "replay": {freq: (MODEL_DIR / freq / "backtest" / f"{slug}.json").exists()
                   for freq in ("daily", "weekly")},
        "end_date": END_DATE,
    }


# ---------------------------------------------------------------- forecasting

class Forecaster:
    """Production global models (trained on every catalog term) plus optional TimesFM."""

    def __init__(self):
        self._models = {}
        self._weights = {}
        self._lock = threading.Lock()
        self.timesfm_error = None

    def _load(self, freq):
        with self._lock:
            if freq not in self._models:
                import torch
                from .models.global_models import GlobalMLP, GlobalXGB
                folder = MODEL_DIR / freq
                if not (folder / "xgb.ubj").exists():
                    raise FileNotFoundError(f"No trained {freq} models. Run scripts/train_models.py.")
                device = "cuda" if torch.cuda.is_available() else "cpu"
                self._models[freq] = {
                    "XGBoost": GlobalXGB.load(folder / "xgb.ubj", SETTINGS[freq]["horizon"]),
                    "MLP": GlobalMLP.load(folder / "mlp.pt", device=device),
                }
                meta = read_json(folder / "meta.json") or {}
                self._weights[freq] = meta.get("ensemble_weights") or {"XGBoost": 1, "MLP": 1, "TimesFM": 1}
            return self._models[freq]

    # Forecast the next horizon from the last observed value on or before `origin`.
    def forecast(self, series, freq, origin=None, use_timesfm=True):
        cfg = SETTINGS[freq]
        clean = mask_censored_zeros(series.sort_index(), cfg["censor_days"])
        if origin is not None:
            clean = clean.loc[:pd.Timestamp(origin)]
        if len(clean) < cfg["lookback"] or np.nanmax(np.nan_to_num(clean.to_numpy())) <= 0:
            raise ValueError("Not enough history before this date to forecast.")
        x, scale = origin_features(clean.to_numpy(dtype=float), clean.index[-1], cfg["lookback"],
                                   cfg["step_days"])
        models = self._load(freq)
        outputs = {name: model.predict(x[None, :])[0] for name, model in models.items()}
        if use_timesfm:
            try:
                from .models.foundation import TimesFM
                history = clean.ffill().fillna(0).to_numpy(dtype=np.float32) / scale
                outputs["TimesFM"] = TimesFM().predict_histories([history], cfg["horizon"])[0]
            except Exception as error:  # TimesFM is optional at serve time.
                self.timesfm_error = str(error)
        outputs["Ensemble"] = weighted(outputs, self._weights[freq])
        step = pd.Timedelta(days=cfg["step_days"])
        dates = [f"{clean.index[-1] + step * (h + 1):%Y-%m-%d}" for h in range(cfg["horizon"])]
        return {
            "freq": freq, "origin": f"{clean.index[-1]:%Y-%m-%d}", "dates": dates,
            "quantiles": list(QUANTILES),
            "models": {name: np.round(q.T * scale, 2).tolist() for name, q in outputs.items()},
        }


FORECASTER = Forecaster()


def read_json(path):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def model_report():
    report = {}
    for freq in ("daily", "weekly"):
        metrics, meta = read_json(MODEL_DIR / freq / "metrics.json"), read_json(MODEL_DIR / freq / "meta.json")
        if metrics:
            report[freq] = {"metrics": metrics, "meta": meta}
    return report


# ---------------------------------------------------------------- live search

class SearchJobs:
    """Builds a searched term in a background thread; the website polls its progress."""

    def __init__(self):
        self.jobs = {}
        self._lock = threading.Lock()

    def start(self, query):
        query = " ".join(query.split())[:80]
        if not query:
            raise ValueError("Type a search term.")
        catalog = next((e for e in TRENDS if e["query"].lower() == query.lower()), None)
        if catalog:
            return {"id": None, "status": "done", "slug": catalog["slug"], "query": catalog["query"]}
        slug = f"q-{slugify(query)}"
        if (SEARCH_PROCESSED / f"{slug}_search.json").exists():
            return {"id": None, "status": "done", "slug": slug, "query": query}
        with self._lock:
            for job in self.jobs.values():
                if job["slug"] == slug and job["status"] == "running":
                    return job
            job = {"id": uuid.uuid4().hex[:10], "status": "running", "slug": slug, "query": query,
                   "steps": [], "error": None, "started": time.time()}
            self.jobs[job["id"]] = job
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return job

    def _run(self, job):
        entry = {"slug": job["slug"], "query": job["query"], "group": "search", "year": None,
                 "blurb": None}
        try:
            build_term(entry, out_dir=SEARCH_PROCESSED, raw_dir=SEARCH_RAW,
                       pull_dir=SEARCH_RAW / "pulls", on_step=lambda m: job["steps"].append(m))
            (SEARCH_PROCESSED / f"{job['slug']}_search.json").write_text(
                json.dumps(entry, indent=2), encoding="utf-8")
            job["status"] = "done"
        except TrendsError as error:
            message = str(error)
            if "429" in message or "rate" in message.lower():
                message = "Google Trends is rate-limiting requests. Try again in a few minutes."
            job.update(status="error", error=message)
        except Exception as error:
            job.update(status="error", error=f"{type(error).__name__}: {error}")

    def get(self, job_id):
        return self.jobs.get(job_id)


SEARCHES = SearchJobs()


def searched_terms():
    rows = []
    for path in sorted(SEARCH_PROCESSED.glob("*_search.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        entry = json.loads(path.read_text(encoding="utf-8"))
        rows.append({"slug": entry["slug"], "query": entry["query"]})
    return rows
