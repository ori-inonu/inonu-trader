"""Small statistics helpers on plain lists. Spec section 6."""

from __future__ import annotations

import math
from typing import Optional, Sequence


def log_returns(prices: Sequence[float]) -> list[float]:
    out: list[float] = []
    for i in range(1, len(prices)):
        if prices[i] <= 0 or prices[i - 1] <= 0:
            raise ValueError("prices must be positive")
        out.append(math.log(prices[i] / prices[i - 1]))
    return out


def mean(x: Sequence[float]) -> float:
    if not x:
        raise ValueError("empty")
    return math.fsum(x) / len(x)


def stdev(x: Sequence[float]) -> float:
    """Sample standard deviation (divisor n-1)."""
    if len(x) < 2:
        raise ValueError("need at least two values")
    m = mean(x)
    return math.sqrt(math.fsum((v - m) ** 2 for v in x) / (len(x) - 1))


def zscore(value: float, history: Sequence[float]) -> Optional[float]:
    """(value - mean) / sample std of the history, None for a constant history."""
    sd = stdev(history)
    if sd == 0:
        return None
    return (value - mean(history)) / sd


def rank(value: float, history: Sequence[float]) -> float:
    """Share of history values that are <= value, in (0, 1]. The history includes the value itself when it belongs."""
    if not history:
        raise ValueError("empty")
    return sum(1 for v in history if v <= value) / len(history)


def corr(a: Sequence[float], b: Sequence[float]) -> Optional[float]:
    if len(a) != len(b) or len(a) < 2:
        raise ValueError("series must have the same length of at least 2")
    ma, mb = mean(a), mean(b)
    cov = math.fsum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = math.fsum((x - ma) ** 2 for x in a)
    vb = math.fsum((y - mb) ** 2 for y in b)
    if va == 0 or vb == 0:
        return None
    return cov / math.sqrt(va * vb)


def beta(asset: Sequence[float], market: Sequence[float]) -> Optional[float]:
    """cov(asset, market) / var(market), sample estimators (the n-1 cancels)."""
    if len(asset) != len(market) or len(asset) < 2:
        raise ValueError("series must have the same length of at least 2")
    ma, mm = mean(asset), mean(market)
    cov = math.fsum((x - ma) * (y - mm) for x, y in zip(asset, market))
    var = math.fsum((y - mm) ** 2 for y in market)
    if var == 0:
        return None
    return cov / var


def efficiency_ratio(closes: Sequence[float], n: int) -> Optional[float]:
    """Kaufman: |c[-1] - c[-1-n]| / sum(|dc|) over the last n changes, in [0, 1]. None when flat."""
    if len(closes) < n + 1:
        raise ValueError("need n+1 closes")
    window = closes[-(n + 1):]
    path = math.fsum(abs(window[i] - window[i - 1]) for i in range(1, len(window)))
    if path == 0:
        return None
    return abs(window[-1] - window[0]) / path


def rolling_stdev(x: Sequence[float], n: int) -> list[float]:
    """Sample std of every full window of n values, oldest first."""
    return [stdev(x[i - n + 1:i + 1]) for i in range(n - 1, len(x))]
