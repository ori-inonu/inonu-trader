"""Smart money structure on closed bars: swing pivots, break of structure, order blocks, fair value gaps and liquidity
pools. Spec docs/sdd/config-onchain-smartmoney/spec.md section 3.4 (SMC-1 to SMC-6).

Everything here describes where price has been and which zones are still untouched. Nothing returns an action, a vote
or a signal. The TypeScript chart library reproduces this module bar for bar against golden vectors.
"""

from __future__ import annotations

from typing import Any, Optional, Sequence

from . import indicators as ind
from . import structure

FVG_MIN_ATR = 0.1
POOL_TOLERANCE_ATR = 0.1
ATR_PERIOD = 14


def _clamp01(value: float) -> float:
    return min(1.0, max(0.0, value))


def _swings(h: Sequence[float], l: Sequence[float], n: int) -> tuple[dict[int, float], dict[int, float]]:
    highs: dict[int, float] = {}
    lows: dict[int, float] = {}
    for p in structure.pivots(h, l, n):
        (highs if p["kind"] > 0 else lows)[int(p["index"])] = p["price"]
    return highs, lows


def _structure(o: Sequence[float], h: Sequence[float], l: Sequence[float], c: Sequence[float], n: int) -> dict[str, Any]:
    size = len(c)
    highs, lows = _swings(h, l, n)
    swings: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    top: Optional[dict[str, Any]] = None
    bottom: Optional[dict[str, Any]] = None
    direction = 0
    for k in range(size):
        i = k - n
        if i in highs:
            top = {"index": i, "price": highs[i], "broken": False}
            swings.append({"index": i, "price": highs[i], "kind": "high", "confirmedAt": k})
        if i in lows:
            bottom = {"index": i, "price": lows[i], "broken": False}
            swings.append({"index": i, "price": lows[i], "kind": "low", "confirmedAt": k})
        if top is not None and not top["broken"] and c[k] > top["price"]:
            events.append({"index": k, "type": "CHoCH" if direction < 0 else "BOS", "dir": "up", "level": top["price"], "swingIndex": top["index"]})
            top["broken"] = True
            direction = 1
            if bottom is not None:
                bars = [j for j in range(bottom["index"], k) if c[j] < o[j]]
                if bars:
                    j = min(bars, key=lambda x: (l[x], -x))
                    if not any(b["index"] == j and b["dir"] == "up" for b in blocks):
                        blocks.append({"index": j, "dir": "up", "low": l[j], "high": h[j], "formedAt": k, "mitigatedAt": None})
        elif bottom is not None and not bottom["broken"] and c[k] < bottom["price"]:
            events.append({"index": k, "type": "CHoCH" if direction > 0 else "BOS", "dir": "down", "level": bottom["price"], "swingIndex": bottom["index"]})
            bottom["broken"] = True
            direction = -1
            if top is not None:
                bars = [j for j in range(top["index"], k) if c[j] > o[j]]
                if bars:
                    j = max(bars, key=lambda x: (h[x], x))
                    if not any(b["index"] == j and b["dir"] == "down" for b in blocks):
                        blocks.append({"index": j, "dir": "down", "low": l[j], "high": h[j], "formedAt": k, "mitigatedAt": None})
    for block in blocks:
        for m in range(block["formedAt"] + 1, size):
            if (block["dir"] == "up" and c[m] < block["low"]) or (block["dir"] == "down" and c[m] > block["high"]):
                block["mitigatedAt"] = m
                break
    return {"swings": swings, "events": events, "orderBlocks": blocks, "direction": direction, "top": top, "bottom": bottom}


def _gaps(h: Sequence[float], l: Sequence[float], atr: Sequence[Optional[float]]) -> list[dict[str, Any]]:
    size = len(h)
    out: list[dict[str, Any]] = []
    for i in range(2, size):
        a = atr[i]
        if a is None:
            continue
        if l[i] > h[i - 2] and l[i] - h[i - 2] >= FVG_MIN_ATR * a:
            lo, hi, up = h[i - 2], l[i], True
        elif h[i] < l[i - 2] and l[i - 2] - h[i] >= FVG_MIN_ATR * a:
            lo, hi, up = h[i], l[i - 2], False
        else:
            continue
        span = hi - lo
        fill, filled_at = 0.0, None
        for m in range(i + 1, size):
            reach = (hi - l[m]) if up else (h[m] - lo)
            fill = max(fill, _clamp01(reach / span))
            if filled_at is None and ((up and l[m] <= lo) or (not up and h[m] >= hi)):
                filled_at = m
        out.append({"index": i, "dir": "up" if up else "down", "low": lo, "high": hi, "fill": fill, "filledAt": filled_at})
    return out


def _pools(h: Sequence[float], l: Sequence[float], c: Sequence[float], highs: dict[int, float], lows: dict[int, float], atr_last: Optional[float]) -> list[dict[str, Any]]:
    if atr_last is None:
        return []
    tolerance = POOL_TOLERANCE_ATR * atr_last
    out: list[dict[str, Any]] = []
    size = len(c)
    for kind, pivots in (("eqh", highs), ("eql", lows)):
        ordered = sorted(pivots.items(), key=lambda item: (item[1], item[0]))
        groups: list[list[tuple[int, float]]] = []
        for index, price in ordered:
            if groups and price - groups[-1][0][1] <= tolerance:
                groups[-1].append((index, price))
            else:
                groups.append([(index, price)])
        for group in groups:
            if len(group) < 2:
                continue
            indices = sorted(i for i, _ in group)
            level = max(p for _, p in group) if kind == "eqh" else min(p for _, p in group)
            swept_at, taken_at = None, None
            for m in range(indices[0] + 1, size):
                if kind == "eqh" and h[m] > level:
                    swept_at, taken_at = (m, None) if c[m] < level else (None, m)
                    break
                if kind == "eql" and l[m] < level:
                    swept_at, taken_at = (m, None) if c[m] > level else (None, m)
                    break
            out.append({"kind": kind, "price": level, "indices": indices, "sweptAt": swept_at, "takenAt": taken_at})
    return out


def analyze(o: Sequence[float], h: Sequence[float], l: Sequence[float], c: Sequence[float], n: int = 3, price: Optional[float] = None) -> dict[str, Any]:
    """Smart money reading of closed bars (oldest first). `price` is the current price for the premium and discount
    position; it defaults to the last close."""
    size = len(c)
    if not (len(o) == len(h) == len(l) == size):
        raise ValueError("series must have the same length")
    if n < 1:
        raise ValueError("n must be positive")
    atr = ind.atr(h, l, c, ATR_PERIOD)
    highs, lows = _swings(h, l, n)
    built = _structure(o, h, l, c, n)
    top, bottom = built["top"], built["bottom"]
    rng: Optional[dict[str, Any]] = None
    position: Optional[float] = None
    state: Optional[str] = None
    now = price if price is not None else (c[-1] if size else None)
    if top is not None and bottom is not None and top["price"] > bottom["price"] and now is not None:
        rng = {"low": bottom["price"], "high": top["price"], "lowIndex": bottom["index"], "highIndex": top["index"]}
        raw = (now - bottom["price"]) / (top["price"] - bottom["price"])
        state = "above" if raw > 1 else "below" if raw < 0 else "inside"
        position = _clamp01(raw)
    return {
        "n": n,
        "bars": size,
        "trend": {1: "up", -1: "down"}.get(built["direction"]),
        "swings": built["swings"],
        "events": built["events"],
        "orderBlocks": built["orderBlocks"],
        "fvgs": _gaps(h, l, atr),
        "pools": _pools(h, l, c, highs, lows, atr[-1] if size else None),
        "range": rng,
        "position": position,
        "rangeState": state,
    }


def _edge_distance_bps(last: float, lo: float, hi: float) -> float:
    gap = lo - last if last < lo else last - hi if last > hi else 0.0
    return gap / last * 10_000.0


def summarize(result: dict[str, Any], last: float) -> dict[str, Any]:
    """The compact, descriptive digest the Jev receives for one timeframe. Every field is None when it cannot be known."""
    bars = result["bars"]
    live_blocks = [b for b in result["orderBlocks"] if b["mitigatedAt"] is None]
    demand = [b for b in live_blocks if b["dir"] == "up" and b["low"] <= last]
    supply = [b for b in live_blocks if b["dir"] == "down" and b["high"] >= last]
    live_gaps = [g for g in result["fvgs"] if g["fill"] < 1.0]
    live_pools = [p for p in result["pools"] if p["sweptAt"] is None and p["takenAt"] is None]
    sweeps = [(p["sweptAt"], p["kind"]) for p in result["pools"] if p["sweptAt"] is not None]
    above = [p["price"] for p in live_pools if p["kind"] == "eqh" and p["price"] >= last]
    below = [p["price"] for p in live_pools if p["kind"] == "eql" and p["price"] <= last]
    last_break = result["events"][-1] if result["events"] else None
    last_sweep = max(sweeps) if sweeps else None
    return {
        "demandBlockBps": round(max(0.0, (last - max(b["high"] for b in demand)) / last * 10_000.0), 1) if demand else None,
        "supplyBlockBps": round(max(0.0, (min(b["low"] for b in supply) - last) / last * 10_000.0), 1) if supply else None,
        "gapsUp": sum(1 for g in live_gaps if g["dir"] == "up"),
        "gapsDown": sum(1 for g in live_gaps if g["dir"] == "down"),
        "gapNearestBps": round(min(_edge_distance_bps(last, g["low"], g["high"]) for g in live_gaps), 1) if live_gaps else None,
        "lastBreak": {"kind": last_break["type"], "dir": last_break["dir"], "ageBars": bars - 1 - last_break["index"]} if last_break else None,
        "rangePos": round(result["position"], 3) if result["position"] is not None else None,
        "rangeState": result["rangeState"],
        "poolAboveBps": round((min(above) - last) / last * 10_000.0, 1) if above else None,
        "poolBelowBps": round((last - max(below)) / last * 10_000.0, 1) if below else None,
        "lastSweep": {"kind": "highs" if last_sweep[1] == "eqh" else "lows", "ageBars": bars - 1 - last_sweep[0]} if last_sweep else None,
    }
