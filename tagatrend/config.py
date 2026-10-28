"""Paths and fixed settings shared by the notebooks, scripts and the Flask server."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"            # every Google response, gitignored
PULL_DIR = RAW_DIR / "pulls"          # archived pulls by date, averaged when stitching
PROCESSED_DIR = DATA_DIR / "processed"  # stitched series, committed
SEARCH_DIR = DATA_DIR / "search"      # live searches from the website, gitignored
MODEL_DIR = DATA_DIR / "models"       # trained global forecasters, committed

GEO = "PH"
END_DATE = "2026-10-27"  # Last complete day for this build.
BACKBONE_START = "2004-01-01"  # Google Trends' earliest date.

# Google returns daily rows up to 269 days and weekly rows up to about five years.
WINDOW_DAYS = {"daily": 260, "weekly": 4 * 365}
OVERLAP_DAYS = {"daily": 60, "weekly": 365}
DROPOUT_FLOOR = 10  # A zero after a trailing 7-row median at or above this is a dropout.

for directory in (RAW_DIR, PULL_DIR, PROCESSED_DIR, SEARCH_DIR, MODEL_DIR):
    directory.mkdir(parents=True, exist_ok=True)
