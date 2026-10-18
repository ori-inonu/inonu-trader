"""Technical indicators on plain lists, oldest first. `None` marks a value whose window is not complete.

Definitions follow docs/sdd/grafico-jev/spec.md section 6 and agree with TA-Lib (cross-checked outside the repo).
Every function is pure and never mutates its inputs.
"""

from __future__ import annotations

import math
from typing import Optional, Sequence

Num = Optional[float]


def _need(n: int) -> None:
    if not isinstance(n, int) or n < 1:
        raise ValueError("period must be a positive integer")


def sma(x: Sequence[float], n: int) -> list[Num]:
    _need(n)
    out: list[Num] = [None] * len(x)
    if len(x) < n:
        return out
    total = math.fsum(x[:n])
    out[n - 1] = total / n
    for i in range(n, len(x)):
        total += x[i] - x[i - n]
        out[i] = total / n
    return out


def _first_value(x: Sequence[Num]) -> int:
    for i, v in enumerate(x):
        if v is not None:
            return i
    return len(x)


def ema(x: Sequence[Num], n: int) -> list[Num]:
    """EMA seeded with the SMA of the first n defined values. Leading None are skipped."""
    _need(n)
    out: list[Num] = [None] * len(x)
    start = _first_value(x)
    if len(x) - start < n:
        return out
    alpha = 2.0 / (n + 1)
    e = math.fsum(x[start:start + n]) / n  # type: ignore[arg-type]
    out[start + n - 1] = e
    for i in range(start + n, len(x)):
        e = alpha * x[i] + (1.0 - alpha) * e  # type: ignore[operator]
        out[i] = e
    return out


def rsi(x: Sequence[float], n: int = 14) -> list[Num]:
    """Wilder RSI. First value at index n. A flat window (no gain and no loss) is 50."""
    _need(n)
    out: list[Num] = [None] * len(x)
    if len(x) <= n:
        return out
    gains = [max(x[i] - x[i - 1], 0.0) for i in range(1, len(x))]
    losses = [max(x[i - 1] - x[i], 0.0) for i in range(1, len(x))]
    avg_gain = math.fsum(gains[:n]) / n
    avg_loss = math.fsum(losses[:n]) / n

    def value(g: float, l: float) -> float:
        if l == 0.0:
            return 50.0 if g == 0.0 else 100.0
        return 100.0 - 100.0 / (1.0 + g / l)

    out[n] = value(avg_gain, avg_loss)
    for i in range(n, len(gains)):
        avg_gain = (avg_gain * (n - 1) + gains[i]) / n
        avg_loss = (avg_loss * (n - 1) + losses[i]) / n
        out[i + 1] = value(avg_gain, avg_loss)
    return out


def macd(x: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9) -> dict[str, list[Num]]:
    """MACD with each EMA seeded at its own start. line from index slow-1, signal from slow-1+signal-1."""
    if fast >= slow:
        raise ValueError("fast must be shorter than slow")
    fast_ema = ema(x, fast)
    slow_ema = ema(x, slow)
    line: list[Num] = [
        (f - s) if f is not None and s is not None else None for f, s in zip(fast_ema, slow_ema)
    ]
    sig = ema(line, signal)
    hist: list[Num] = [(m - s) if m is not None and s is not None else None for m, s in zip(line, sig)]
    return {"macd": line, "signal": sig, "hist": hist}


def true_range(h: Sequence[float], l: Sequence[float], c: Sequence[float]) -> list[Num]:
    """TR from index 1 (needs the previous close), as TA-Lib does."""
    out: list[Num] = [None] * len(c)
    for i in range(1, len(c)):
        out[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    return out


def atr(h: Sequence[float], l: Sequence[float], c: Sequence[float], n: int = 14) -> list[Num]:
    """Wilder ATR. First value at index n: the mean of TR[1..n]."""
    _need(n)
    size = len(c)
    out: list[Num] = [None] * size
    if size <= n:
        return out
    tr = true_range(h, l, c)
    value = math.fsum(tr[1:n + 1]) / n  # type: ignore[arg-type]
    out[n] = value
    for i in range(n + 1, size):
        value = (value * (n - 1) + tr[i]) / n  # type: ignore[operator]
        out[i] = value
    return out


def bollinger(x: Sequence[float], n: int = 20, k: float = 2.0) -> dict[str, list[Num]]:
    """Bollinger bands with the population standard deviation (divisor n)."""
    _need(n)
    size = len(x)
    mid = sma(x, n)
    upper: list[Num] = [None] * size
    lower: list[Num] = [None] * size
    pct_b: list[Num] = [None] * size
    width: list[Num] = [None] * size
    for i in range(n - 1, size):
        window = x[i - n + 1:i + 1]
        m = mid[i]
        assert m is not None
        sd = math.sqrt(math.fsum((v - m) ** 2 for v in window) / n)
        up, lo = m + k * sd, m - k * sd
        upper[i], lower[i] = up, lo
        pct_b[i] = (x[i] - lo) / (up - lo) if up != lo else None
        width[i] = (up - lo) / m if m != 0 else None
    return {"mid": mid, "upper": upper, "lower": lower, "percentB": pct_b, "width": width}


def adx(h: Sequence[float], l: Sequence[float], c: Sequence[float], n: int = 14) -> dict[str, list[Num]]:
    """Wilder ADX with +DI and -DI. DI from index n, ADX from index 2n-1.

    Seeding follows TA-Lib: the smoothed sums start as the sum of the first n-1 values (indices 1..n-1) and the
    first smoothing step already consumes index n. Wilder's book seeds with the sum of n values instead; the two
    differ only in the transient and agree with each other to within 1e-9 only after many bars.
    """
    _need(n)
    size = len(c)
    plus_di: list[Num] = [None] * size
    minus_di: list[Num] = [None] * size
    out_adx: list[Num] = [None] * size
    if size < 2 * n:
        return {"adx": out_adx, "plusDi": plus_di, "minusDi": minus_di}
    tr = true_range(h, l, c)
    pdm = [0.0] * size
    mdm = [0.0] * size
    for i in range(1, size):
        up, down = h[i] - h[i - 1], l[i - 1] - l[i]
        pdm[i] = up if up > down and up > 0 else 0.0
        mdm[i] = down if down > up and down > 0 else 0.0
    s_tr = math.fsum(tr[1:n])  # type: ignore[arg-type]
    s_p = math.fsum(pdm[1:n])
    s_m = math.fsum(mdm[1:n])
    dx: list[float] = []

    def record(index: int) -> None:
        if s_tr == 0:
            p_val = m_val = 0.0
        else:
            p_val, m_val = 100.0 * s_p / s_tr, 100.0 * s_m / s_tr
        plus_di[index], minus_di[index] = p_val, m_val
        total = p_val + m_val
        dx.append(100.0 * abs(p_val - m_val) / total if total != 0 else 0.0)

    for i in range(n, size):
        s_tr = s_tr - s_tr / n + tr[i]  # type: ignore[operator]
        s_p = s_p - s_p / n + pdm[i]
        s_m = s_m - s_m / n + mdm[i]
        record(i)
    # dx[j] belongs to index n + j. First ADX at index 2n-1 = mean of the first n DX values.
    value = math.fsum(dx[:n]) / n
    out_adx[2 * n - 1] = value
    for j in range(n, len(dx)):
        value = (value * (n - 1) + dx[j]) / n
        out_adx[n + j] = value
    return {"adx": out_adx, "plusDi": plus_di, "minusDi": minus_di}


def supertrend(h: Sequence[float], l: Sequence[float], c: Sequence[float], n: int = 10, mult: float = 3.0) -> dict[str, list[Num]]:
    """Supertrend. `dir` is +1 (up, line is the lower band) or -1 (down, line is the upper band). Starts at +1."""
    size = len(c)
    line: list[Num] = [None] * size
    direction: list[Num] = [None] * size
    a = atr(h, l, c, n)
    if size <= n:
        return {"line": line, "dir": direction}
    final_up = final_lo = 0.0
    d = 1
    for i in range(n, size):
        hl2 = (h[i] + l[i]) / 2.0
        basic_up = hl2 + mult * a[i]  # type: ignore[operator]
        basic_lo = hl2 - mult * a[i]  # type: ignore[operator]
        if i == n:
            final_up, final_lo = basic_up, basic_lo
        else:
            prev_close = c[i - 1]
            final_up = basic_up if (basic_up < final_up or prev_close > final_up) else final_up
            final_lo = basic_lo if (basic_lo > final_lo or prev_close < final_lo) else final_lo
            if d == 1 and c[i] < final_lo:
                d = -1
            elif d == -1 and c[i] > final_up:
                d = 1
        direction[i] = float(d)
        line[i] = final_lo if d == 1 else final_up
    return {"line": line, "dir": direction}


def donchian(h: Sequence[float], l: Sequence[float], n: int = 20) -> dict[str, list[Num]]:
    _need(n)
    size = len(h)
    upper: list[Num] = [None] * size
    lower: list[Num] = [None] * size
    for i in range(n - 1, size):
        upper[i] = max(h[i - n + 1:i + 1])
        lower[i] = min(l[i - n + 1:i + 1])
    return {"upper": upper, "lower": lower}
