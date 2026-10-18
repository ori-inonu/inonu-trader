"""Chart transforms: Heikin Ashi and close based Renko. Spec section 6."""

from __future__ import annotations

import math
from typing import Sequence

MAX_BRICKS = 100_000


def heikin_ashi(o: Sequence[float], h: Sequence[float], l: Sequence[float], c: Sequence[float]) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    for i in range(len(c)):
        ha_close = (o[i] + h[i] + l[i] + c[i]) / 4.0
        ha_open = (o[0] + c[0]) / 2.0 if i == 0 else (out[-1]["open"] + out[-1]["close"]) / 2.0
        out.append({
            "open": ha_open,
            "high": max(h[i], ha_open, ha_close),
            "low": min(l[i], ha_open, ha_close),
            "close": ha_close,
        })
    return out


def nice_step(value: float) -> float:
    """Nearest value, on a log scale, of {1, 2, 2.5, 5, 10} * 10^k. Ties go to the smaller candidate."""
    if not (value > 0) or not math.isfinite(value):
        raise ValueError("value must be positive and finite")
    k = math.floor(math.log10(value))
    base = 10.0 ** k
    best = None
    best_distance = math.inf
    for factor in (1.0, 2.0, 2.5, 5.0, 10.0):
        candidate = factor * base
        distance = abs(math.log(value) - math.log(candidate))
        if distance < best_distance:
            best, best_distance = candidate, distance
    assert best is not None
    return float(f"{best:.12g}")


def renko(closes: Sequence[float], ts: Sequence[int], size: float) -> list[dict[str, float]]:
    """Close based Renko. Bricks sit on integer levels (level * size), so repeated bricks never drift.

    Without a brick: up when close >= (ref+1)*size, down when close <= (ref-1)*size, where ref = floor(c0/size).
    After an up brick (open level o, close level o+1): another up when close >= (o+2)*size, reversal down when
    close <= (o-1)*size. Symmetric after a down brick. Each brick carries the timestamp and index of the bar that
    completed it.
    """
    if not (size > 0) or not math.isfinite(size):
        raise ValueError("brick size must be positive and finite")
    if len(closes) != len(ts):
        raise ValueError("closes and ts must have the same length")
    bricks: list[dict[str, float]] = []
    if not closes:
        return bricks
    ref = math.floor(closes[0] / size)
    direction = 0
    open_level = close_level = ref

    def add(new_open: int, new_close: int, index: int) -> None:
        nonlocal direction, open_level, close_level
        if len(bricks) >= MAX_BRICKS:
            raise ValueError("too many bricks: brick size is too small for this series")
        direction = 1 if new_close > new_open else -1
        open_level, close_level = new_open, new_close
        bricks.append({
            "open": new_open * size,
            "close": new_close * size,
            "dir": float(direction),
            "tsMs": float(ts[index]),
            "sourceIndex": float(index),
        })

    for i, c in enumerate(closes):
        while True:
            if direction == 0:
                if c >= (ref + 1) * size:
                    add(ref, ref + 1, i)
                elif c <= (ref - 1) * size:
                    add(ref, ref - 1, i)
                else:
                    break
            elif direction == 1:
                if c >= (close_level + 1) * size:
                    add(close_level, close_level + 1, i)
                elif c <= (open_level - 1) * size:
                    add(open_level, open_level - 1, i)
                else:
                    break
            else:
                if c <= (close_level - 1) * size:
                    add(close_level, close_level - 1, i)
                elif c >= (open_level + 1) * size:
                    add(open_level, open_level + 1, i)
                else:
                    break
    return bricks


def renko_run(bricks: Sequence[dict[str, float]]) -> int:
    """Signed length of the trailing run of same direction bricks: +n up, -n down, 0 without bricks."""
    if not bricks:
        return 0
    last = bricks[-1]["dir"]
    n = 0
    for brick in reversed(bricks):
        if brick["dir"] != last:
            break
        n += 1
    return int(last) * n
