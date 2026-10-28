"""TimesFM 2.5 (Google, Apache-2.0 weights): a pretrained zero-shot forecaster, run on the GPU.

It never trains on our terms, so it doubles as a check that the global models learned something
about Filipino trend lifecycles beyond generic time-series behaviour.
"""
import numpy as np

CHECKPOINT = "google/timesfm-2.5-200m-pytorch"
REVISION = "1d952420fba87f3c6dee4f240de0f1a0fbc790e3"
_model = None


# Load once per process; the first call downloads about 0.9 GB to the Hugging Face cache.
def _load(max_context=512, max_horizon=64):
    global _model
    if _model is None:
        import timesfm
        model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(CHECKPOINT, revision=REVISION,
                                                               torch_compile=False)
        model.compile(timesfm.ForecastConfig(
            max_context=max_context, max_horizon=max_horizon, per_core_batch_size=64,
            normalize_inputs=True, use_continuous_quantile_head=True,
            force_flip_invariance=True, infer_is_positive=True, fix_quantile_crossing=True))
        _model = model
    return _model


class TimesFM:
    name = "TimesFM"

    # histories: list of 1-D arrays in peak-so-far units (missing values already filled).
    # Returns (n, horizon, 3) q10/q50/q90, clipped at zero.
    def predict_histories(self, histories, horizon, batch=256):
        model = _load()
        outputs = []
        for start in range(0, len(histories), batch):
            chunk = [np.asarray(h[-512:], dtype=np.float32) for h in histories[start:start + batch]]
            _, quantiles = model.forecast(horizon=horizon, inputs=list(chunk))
            outputs.append(quantiles[:, :horizon, [1, 5, 9]])
        out = np.concatenate(outputs)
        if not np.isfinite(out).all():
            raise RuntimeError("TimesFM returned non-finite forecasts.")
        return np.clip(np.sort(out, axis=2), 0, None)
