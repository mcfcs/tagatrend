# Tagatrend

How Filipino viral terms rise, peak and fade in Google searches, and how well their next weeks can be forecast.

- **Dashboard.** The four set trends (Sana All, Pabebe Girls, Never Grow Old, Fox Silica), a library of Filipino viral terms, live search for any new term, and a forecast replay for each term.
- **Pipeline.** Stitched daily and weekly Google Trends series for the Philippines, lifecycle measures (rise, half-life, fade, phase), and GPU forecasters scored on terms they never trained on.
- **Notebooks.** `google_trends.ipynb` (peaks and the weeks around them), `google_trends_ml.ipynb` (per-term model comparison) and `google_trends_forecasting.ipynb` (shared lifecycles, decay fits, the leave-one-term-out backtest and SHAP).

The design and the model pipeline are written up in [docs/PIPELINE.md](docs/PIPELINE.md), which the site also serves at `/docs`.

## Run it

```bash
# Python 3.12 with CUDA PyTorch (RTX 50-series needs a CUDA 12.8+ wheel)
uv venv --python 3.12 .venv
uv pip install --python .venv torch --index-url https://download.pytorch.org/whl/cu130
uv pip install --python .venv -r requirements.txt

# The website: Flask API + React build on http://127.0.0.1:5000
cd web && npm install && npm run build && cd ..
.venv/Scripts/python server/app.py
```

The processed data and trained models are committed, so the site works on a fresh clone. To rebuild them:

```bash
.venv/Scripts/python scripts/build_dataset.py   # pull and stitch (Google rate-limits; cached pulls are reused)
.venv/Scripts/python scripts/train_models.py    # backtest and train on the GPU
.venv/Scripts/python scripts/make_forecasting_notebook.py
```

For frontend work, run `npm run dev` in `web/` (Vite on port 5173, proxying `/api` to Flask on 5000).

## Deploy on your tailnet

```bat
deploy.bat          :: build the frontend, serve with waitress on 127.0.0.1:8050, publish via Tailscale Serve
deploy.bat direct   :: no Tailscale Serve: bind the Tailscale IP, firewall open to 100.64.0.0/10 only
deploy.bat stop     :: remove the Tailscale Serve proxy
```

With Tailscale Serve the site is at `https://<machine>.<tailnet>.ts.net/` for devices on your tailnet only; it is not exposed to the LAN or the internet. Keep the window open while it serves; Ctrl+C stops it.

## Layout

| Path | What it is |
|---|---|
| `tagatrend/` | The pipeline: fetch, stitch, analysis, features, models, evaluation, the service layer for the site |
| `scripts/` | Build the dataset, train the models, generate the forecasting notebook |
| `server/app.py` | Flask API, which also serves the built frontend |
| `web/` | React, Vite and Tailwind CSS dashboard |
| `data/processed/`, `data/models/` | Stitched series, regions, backtest metrics, replays, production models |
| `docs/PIPELINE.md` | The high-level design and the model pipeline |
