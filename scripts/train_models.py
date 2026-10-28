"""Backtest every forecaster, then train the production global models on all terms.

    python scripts/train_models.py              # daily and weekly, with TimesFM
    python scripts/train_models.py --no-timesfm

Writes data/models/<freq>/: metrics.json, backtest/<slug>.json (replay forecasts for the
website), xgb.json and mlp.pt (trained on every term) and meta.json.
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tagatrend.config import MODEL_DIR  # noqa: E402
from tagatrend.evaluate import backtest, pooled_split, score, summary  # noqa: E402
from tagatrend.features import EXTRA_FEATURES, QUANTILES, SETTINGS  # noqa: E402
from tagatrend.models import GlobalMLP, GlobalXGB, require_cuda  # noqa: E402

REPLAY_STRIDE = {"daily": 7, "weekly": 2}
REPLAY_MODELS = ["Ensemble", "XGBoost", "MLP", "TimesFM", "Naive"]


def records(table):
    return json.loads(table.round(3).to_json(orient="records"))


# Horizon buckets that read well on a dashboard.
def bucket(h, freq):
    if freq == "daily":
        return "1-7 days" if h <= 7 else "8-14 days" if h <= 14 else "15-28 days"
    return "1-4 weeks" if h <= 4 else "5-8 weeks" if h <= 8 else "9-12 weeks"


def run(freq, use_timesfm):
    out = MODEL_DIR / freq
    (out / "backtest").mkdir(parents=True, exist_ok=True)
    cfg = SETTINGS[freq]
    started = time.time()
    data, predictions = backtest(freq, use_timesfm=use_timesfm)
    scores = score(data, predictions, freq)
    scores["bucket"] = [bucket(h, freq) for h in scores["h"]]

    metrics = {
        "freq": freq, "lookback": cfg["lookback"], "horizon": cfg["horizon"],
        "trends": sorted(data), "origins": int(sum(len(d["dates"]) for d in data.values())),
        "overall": records(summary(scores)),
        "by_bucket": records(summary(scores, ["bucket"])),
        "by_horizon": records(summary(scores, ["h"])),
        "by_phase": records(summary(scores, ["phase"])),
        "by_trend": records(summary(scores, ["trend"])),
    }
    (out / "metrics.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")

    # Out-of-fold forecasts from a subset of origins, for the website's replay slider.
    for slug, origins in data.items():
        keep = np.arange(0, len(origins["dates"]), REPLAY_STRIDE[freq])
        replay = {"freq": freq, "origins": []}
        for i in keep:
            scale = float(origins["scale"][i])
            entry = {"date": f"{origins['dates'][i]:%Y-%m-%d}", "models": {}}
            for name in REPLAY_MODELS:
                if name in predictions[slug]:
                    q = predictions[slug][name][i] * scale
                    entry["models"][name] = np.round(q.T, 2).tolist()  # [q10[], q50[], q90[]]
            replay["origins"].append(entry)
        (out / "backtest" / f"{slug}.json").write_text(json.dumps(replay), encoding="utf-8")

    # Production models: every term, chronological 80/20 split for early stopping.
    xt, yt, xv, yv = pooled_split(data, list(data))
    xgb_model = GlobalXGB(cfg["horizon"]).fit(xt, yt, xv, yv)
    xgb_model.save(out / "xgb.json")
    mlp_model = GlobalMLP(cfg["horizon"], cfg["lookback"]).fit(xt, yt, xv, yv)
    mlp_model.save(out / "mlp.pt")
    meta = {"freq": freq, "lookback": cfg["lookback"], "horizon": cfg["horizon"],
            "quantiles": list(QUANTILES), "features": [f"lag_{i}" for i in range(cfg["lookback"], 0, -1)] + EXTRA_FEATURES,
            "trained_on": sorted(data), "train_origins": int(len(xt)), "val_origins": int(len(xv)),
            "xgb_best_iteration": int(xgb_model.booster.best_iteration),
            "timesfm": use_timesfm, "gpu": torch.cuda.get_device_name(0),
            "seconds": round(time.time() - started, 1)}
    (out / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    overall = summary(scores).set_index("model")[["mae_index", "skill_pct", "coverage_80"]].round(2)
    print(f"\n[{freq}] {metrics['origins']} origins, {len(data)} terms\n{overall}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-timesfm", action="store_true")
    parser.add_argument("--freq", choices=["daily", "weekly"], nargs="*", default=["daily", "weekly"])
    args = parser.parse_args()
    require_cuda()
    for freq in args.freq:
        run(freq, not args.no_timesfm)
