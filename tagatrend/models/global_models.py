"""Global forecasters trained on every term at once, on the GPU.

One model learns the shape of rise, peak and decay from all lifecycles, so a new term with a
few weeks of history borrows what the others did. Both output q10/q50/q90 for every horizon.
"""
import copy
import json

import numpy as np
import torch
import xgboost as xgb

from ..features import QUANTILES


# Train and predict in log space: spikes are multiplicative, and quantiles survive any monotone
# transform, so the back-transformed median is still the median.
def to_log(values):
    return np.log1p(100 * np.asarray(values, dtype=np.float32))


def from_log(values):
    return np.expm1(values) / 100


# Return the GPU, or stop: CPU training is disabled, as in the notebooks.
def require_cuda():
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; the global models train on the GPU only.")
    return torch.device("cuda:0")


class GlobalXGB:
    """XGBoost quantile regression with the horizon as a feature (one tree ensemble for all h)."""

    name = "XGBoost"

    def __init__(self, horizon, seed=42, rounds=3000):
        self.horizon, self.seed, self.rounds = horizon, seed, rounds
        self.booster = None

    # One row per (origin, horizon): the origin's features plus h / horizon.
    def _rows(self, x):
        h = np.repeat(np.arange(1, self.horizon + 1, dtype=np.float32)[None, :], len(x), axis=0)
        stacked = np.repeat(x[:, None, :], self.horizon, axis=1)
        return np.concatenate([stacked, h[..., None] / self.horizon], axis=2).reshape(-1, x.shape[1] + 1)

    def _matrix(self, x, y=None):
        rows = self._rows(x)
        if y is None:
            return xgb.DMatrix(rows)
        target = to_log(y).reshape(-1)
        keep = np.isfinite(target)
        return xgb.DMatrix(rows[keep], label=target[keep])

    def fit(self, x_train, y_train, x_val, y_val):
        params = {"objective": "reg:quantileerror", "quantile_alpha": np.array(QUANTILES),
                  "device": "cuda", "tree_method": "hist", "learning_rate": 0.03, "max_depth": 6,
                  "subsample": 0.8, "colsample_bynode": 0.8, "min_child_weight": 5,
                  "seed": self.seed}
        train, val = self._matrix(x_train, y_train), self._matrix(x_val, y_val)
        self.booster = xgb.train(params, train, self.rounds, evals=[(val, "val")],
                                 early_stopping_rounds=150, verbose_eval=False)
        device = json.loads(self.booster.save_config())["learner"]["generic_param"]["device"]
        if not device.startswith("cuda"):
            raise RuntimeError("XGBoost did not train on the GPU.")
        return self

    def predict(self, x):
        rounds = (0, self.booster.best_iteration + 1)
        out = self.booster.predict(self._matrix(x), iteration_range=rounds)
        out = np.sort(out.reshape(len(x), self.horizon, len(QUANTILES)), axis=2)
        return np.clip(from_log(out), 0, None)

    def save(self, path):
        self.booster.save_model(str(path))

    @classmethod
    def load(cls, path, horizon):
        model = cls(horizon)
        model.booster = xgb.Booster()
        model.booster.load_model(str(path))
        model.booster.set_param({"device": "cpu"})  # Inference on a single row is faster on CPU.
        if not hasattr(model.booster, "best_iteration") or model.booster.best_iteration is None:
            model.booster.best_iteration = model.booster.num_boosted_rounds() - 1
        return model


class _QuantileNet(torch.nn.Module):
    def __init__(self, inputs, horizon, width=64, dropout=0.2):
        super().__init__()
        self.horizon = horizon
        self.body = torch.nn.Sequential(
            torch.nn.Linear(inputs, width), torch.nn.GELU(), torch.nn.Dropout(dropout),
            torch.nn.Linear(width, width), torch.nn.GELU(), torch.nn.Dropout(dropout),
            torch.nn.Linear(width, horizon * len(QUANTILES)))

    def forward(self, x):
        # Softplus keeps forecasts non-negative; sorting keeps quantiles from crossing.
        out = torch.nn.functional.softplus(self.body(x)).view(-1, self.horizon, len(QUANTILES))
        return torch.sort(out, dim=2).values


# Pinball loss over every finite target; NaN targets (dropouts, past the end) are skipped.
def _pinball(pred, target, quantiles):
    mask = torch.isfinite(target)
    target = torch.nan_to_num(target)[..., None]
    error = target - pred
    loss = torch.maximum(quantiles * error, (quantiles - 1) * error)
    return (loss * mask[..., None]).sum() / (mask.sum() * len(QUANTILES)).clamp(min=1)


class GlobalMLP:
    """A seed ensemble of small quantile MLPs, trained full-batch on the GPU."""

    name = "MLP"

    def __init__(self, horizon, lookback, seeds=(0, 1, 2, 3, 4), epochs=1500, patience=100):
        self.horizon, self.lookback, self.seeds = horizon, lookback, seeds
        self.epochs, self.patience = epochs, patience
        self.nets, self.inputs = [], None

    # Lags and level summaries go to log space; the other extras are already scale-free.
    def _inputs(self, x):
        x = np.array(x, dtype=np.float32)
        levels = self.lookback + 3  # lags, window max, mean of last 7, mean of previous 7
        x[:, :levels] = to_log(x[:, :levels]) / np.log1p(100)
        return x

    def fit(self, x_train, y_train, x_val, y_val):
        device = require_cuda()
        q = torch.tensor(QUANTILES, device=device)
        xt, xv = (torch.as_tensor(self._inputs(x), device=device) for x in (x_train, x_val))
        yt, yv = (torch.as_tensor(to_log(y), device=device) for y in (y_train, y_val))
        self.inputs = x_train.shape[1]
        self.nets = []
        for seed in self.seeds:
            torch.manual_seed(seed)
            net = _QuantileNet(self.inputs, self.horizon).to(device)
            optimizer = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-2)
            best, best_state, stale = float("inf"), None, 0
            for _ in range(self.epochs):
                net.train()
                optimizer.zero_grad(set_to_none=True)
                noisy = xt + 0.02 * torch.randn_like(xt)  # Input noise: a cheap regularizer.
                _pinball(net(noisy), yt, q).backward()
                optimizer.step()
                net.eval()
                with torch.no_grad():
                    val = _pinball(net(xv), yv, q).item()
                if val < best - 1e-6:
                    best, best_state, stale = val, copy.deepcopy(net.state_dict()), 0
                else:
                    stale += 1
                    if stale >= self.patience:
                        break
            net.load_state_dict(best_state)
            net.eval()
            self.nets.append(net)
        return self

    def predict(self, x):
        device = next(self.nets[0].parameters()).device
        with torch.no_grad():
            xs = torch.as_tensor(self._inputs(x), device=device)
            out = torch.stack([net(xs) for net in self.nets]).median(dim=0).values
        return np.clip(from_log(out.cpu().numpy()), 0, None)

    def save(self, path):
        torch.save({"inputs": self.inputs, "horizon": self.horizon, "lookback": self.lookback,
                    "states": [net.state_dict() for net in self.nets]}, path)

    @classmethod
    def load(cls, path, device="cpu"):
        saved = torch.load(path, map_location=device)
        model = cls(saved["horizon"], saved["lookback"])
        model.inputs = saved["inputs"]
        for state in saved["states"]:
            net = _QuantileNet(model.inputs, model.horizon).to(device)
            net.load_state_dict(state)
            net.eval()
            model.nets.append(net)
        return model
