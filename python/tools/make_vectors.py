"""Generates the golden vectors consumed by the Python tests and by the TypeScript chart library.

    python python/tools/make_vectors.py            writes both copies
    python python/tools/make_vectors.py --check    fails when a copy is out of date

The inputs are a seeded synthetic random walk (labelled synthetic). The expected values come from the reference
implementation in jev_analytics, which python/tools/crosscheck_talib.py compares with TA-Lib outside the repository.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from jev_analytics import indicators, transforms  # noqa: E402

TARGETS = [
    ROOT / "python" / "tests" / "vectors" / "chart-vectors.v1.json",
    ROOT / "web" / "src" / "lib" / "desk" / "chart" / "vectors" / "chart-vectors.v1.json",
]
BARS = 300
BAR_MS = 900_000
START_MS = 1_700_000_000_000


def synthetic_candles() -> dict[str, list]:
    rng = random.Random(20261012)
    o, h, l, c, v, ts = [], [], [], [], [], []
    price = 100.0
    drift = 0.0
    for i in range(BARS):
        if i % 60 == 0:
            drift = rng.choice([-0.0012, 0.0, 0.0015, 0.0025])
        ret = rng.gauss(drift, 0.004)
        op = price
        cl = op * (1.0 + ret)
        hi = max(op, cl) * (1.0 + abs(rng.gauss(0.0, 0.0015)))
        lo = min(op, cl) * (1.0 - abs(rng.gauss(0.0, 0.0015)))
        o.append(round(op, 6))
        h.append(round(hi, 6))
        l.append(round(lo, 6))
        c.append(round(cl, 6))
        v.append(round(100.0 + abs(rng.gauss(0.0, 50.0)), 6))
        ts.append(START_MS + i * BAR_MS)
        price = c[-1]
    return {"ts": ts, "open": o, "high": h, "low": l, "close": c, "volume": v}


def build() -> dict:
    s = synthetic_candles()
    o, h, l, c, ts = s["open"], s["high"], s["low"], s["close"], s["ts"]
    cases: list[dict] = []

    def case(name: str, fn: str, params: dict, expected) -> None:
        cases.append({"name": name, "fn": fn, "params": params, "expected": expected})

    for n in (5, 20):
        case(f"sma{n}", "sma", {"n": n}, indicators.sma(c, n))
    for n in (9, 21, 50, 200):
        case(f"ema{n}", "ema", {"n": n}, indicators.ema(c, n))
    case("rsi14", "rsi", {"n": 14}, indicators.rsi(c, 14))
    case("macd12_26_9", "macd", {"fast": 12, "slow": 26, "signal": 9}, indicators.macd(c, 12, 26, 9))
    case("atr14", "atr", {"n": 14}, indicators.atr(h, l, c, 14))
    case("bollinger20_2", "bollinger", {"n": 20, "k": 2}, indicators.bollinger(c, 20, 2.0))
    case("supertrend10_3", "supertrend", {"n": 10, "mult": 3}, indicators.supertrend(h, l, c, 10, 3.0))
    case("heikinAshi", "heikinAshi", {}, transforms.heikin_ashi(o, h, l, c))
    for size in (1.0, 2.5):
        bricks = transforms.renko(c, ts, size)
        case(f"renko_{size}", "renko", {"size": size}, bricks)

    steps = [0.0123, 0.5, 1.0, 1.4, 1.5, 3.4, 3.6, 7.2, 14.0, 0.00071, 82945.1, 2.5]
    case("niceStep", "niceStep", {"values": steps}, [transforms.nice_step(x) for x in steps])

    confirmed_all = [True] * BARS
    confirmed_last_open = [True] * (BARS - 1) + [False]
    atr_all = indicators.atr(h, l, c, 14)
    atr_open = indicators.atr(h[:-1], l[:-1], c[:-1], 14)
    case("renkoBrickSize_atr_allConfirmed", "renkoBrickSize", {"mode": "atr", "pct": 0.25, "confirmed": confirmed_all},
         transforms.nice_step(atr_all[-1]))
    case("renkoBrickSize_atr_lastForming", "renkoBrickSize", {"mode": "atr", "pct": 0.25, "confirmed": confirmed_last_open},
         transforms.nice_step(atr_open[-1]))
    case("renkoBrickSize_pct_lastForming", "renkoBrickSize", {"mode": "pct", "pct": 0.25, "confirmed": confirmed_last_open},
         transforms.nice_step(0.25 / 100.0 * c[-2]))

    return {
        "version": 1,
        "origin": "synthetic_fixture",
        "generatedBy": "python/tools/make_vectors.py (reference: python/jev_analytics, checked against TA-Lib)",
        "tolerance": {"abs": 1e-9, "rel": 1e-9},
        "notes": {
            "null": "window not complete",
            "macd": "each EMA is seeded at its own start; TA-Lib seeds EMA12 at the EMA26 start, so the two agree only after the transient",
            "renkoBrickSize": "uses the last CONFIRMED bar; bars with confirmed=false are ignored",
        },
        "candles": s,
        "cases": cases,
    }


def render(data: dict) -> str:
    return json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n"


def main() -> int:
    text = render(build())
    check = "--check" in sys.argv
    stale = []
    for target in TARGETS:
        if check:
            if not target.exists() or target.read_text(encoding="utf8") != text:
                stale.append(str(target))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf8", newline="\n")
    if stale:
        print("out of date: " + ", ".join(stale))
        return 1
    print("ok" if check else "written: " + ", ".join(str(t) for t in TARGETS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
