"""Flask API for the Tagatrend dashboard, and the built React app in production.

    python server/app.py            # http://127.0.0.1:5000 (serves web/dist if it is built)
    cd web && npm run dev           # Vite on :5173, proxies /api to Flask
"""
import sys
from functools import lru_cache
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tagatrend import service  # noqa: E402
from tagatrend.config import MODEL_DIR, PROCESSED_DIR  # noqa: E402

DIST = ROOT / "web" / "dist"
DOC = ROOT / "docs" / "PIPELINE.md"
app = Flask(__name__, static_folder=None)
app.json.sort_keys = False  # Regions and models arrive ranked; keep that order.


# Recompute the library only when a processed file changes.
def _stamp():
    files = list(PROCESSED_DIR.glob("*.csv"))
    return max((f.stat().st_mtime for f in files), default=0), len(files)


@lru_cache(maxsize=4)
def _library(stamp):
    return service.library()


@app.get("/api/trends")
def trends():
    return jsonify({"trends": _library(_stamp()), "searched": service.searched_terms()})


@app.get("/api/trends/<slug>")
def trend(slug):
    payload = service.term_payload(slug)
    if payload is None:
        abort(404, description=f"No data for {slug}.")
    return jsonify(payload)


@app.get("/api/trends/<slug>/replay/<freq>")
def replay(slug, freq):
    if freq not in ("daily", "weekly"):
        abort(404)
    data = service.read_json(MODEL_DIR / freq / "backtest" / f"{slug}.json")
    if data is None:
        abort(404, description="No out-of-fold replay for this term.")
    return jsonify(data)


@app.get("/api/trends/<slug>/forecast/<freq>")
def forecast(slug, freq):
    if freq not in ("daily", "weekly"):
        abort(404)
    directory, _ = service.locate(slug)
    series = None if directory is None else service.read_series(slug, freq, directory)
    if series is None:
        abort(404, description=f"No {freq} series for {slug}.")
    try:
        result = service.FORECASTER.forecast(series, freq, origin=request.args.get("origin"),
                                             use_timesfm=request.args.get("timesfm", "1") != "0")
    except (ValueError, FileNotFoundError) as error:
        abort(422, description=str(error))
    return jsonify(result)


@app.get("/api/models")
def models():
    return jsonify(service.model_report())


@app.post("/api/search")
def search():
    query = (request.get_json(silent=True) or {}).get("query", "")
    try:
        return jsonify(service.SEARCHES.start(query))
    except ValueError as error:
        abort(400, description=str(error))


@app.get("/api/search/<job_id>")
def search_status(job_id):
    job = service.SEARCHES.get(job_id)
    if job is None:
        abort(404, description="Unknown search.")
    return jsonify(job)


@app.get("/api/docs")
def docs():
    return jsonify({"markdown": DOC.read_text(encoding="utf-8") if DOC.exists() else ""})


@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(422)
def error(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": err.description}), err.code
    return err


# Production: serve the built app, with client-side routes falling back to index.html.
@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path):
    if not DIST.exists():
        return "Build the frontend first: cd web && npm install && npm run build", 503
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Serve the Tagatrend API and built frontend.")
    parser.add_argument("--host", action="append", help="Address to bind; repeat for several (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--prod", action="store_true", help="Serve with waitress instead of Flask's dev server")
    args = parser.parse_args()
    hosts = args.host or ["127.0.0.1"]
    if args.prod:
        from waitress import serve

        print("Tagatrend on " + ", ".join(f"http://{h}:{args.port}" for h in hosts), flush=True)
        serve(app, listen=" ".join(f"{h}:{args.port}" for h in hosts), threads=8, channel_timeout=120)
    else:
        app.run(host=hosts[0], port=args.port, threaded=True)
