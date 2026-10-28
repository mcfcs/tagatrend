"""Forecasters. Every model maps feature rows to (rows, horizon, 3) quantiles (q10, q50, q90)
in peak-so-far units; multiply by the row's scale for the 0-100 index."""
from .baselines import BASELINES
from .global_models import GlobalMLP, GlobalXGB, require_cuda

__all__ = ["BASELINES", "GlobalMLP", "GlobalXGB", "require_cuda"]
