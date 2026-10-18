"""Generates the golden vectors of the smart money functions, consumed by the Python tests and by the TypeScript chart library.

    python python/tools/make_smc_vectors.py            writes both copies
    python python/tools/make_smc_vectors.py --check    fails when a copy is out of date

Inputs are labelled synthetic: a few bar series worked out by hand (their expected values are asserted independently
in python/tests/test_smc.py) and seeded random walks with regime changes. Expected values come from the reference
implementation in jev_analytics.smc.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from jev_analytics import smc  # noqa: E402

TARGETS = [
    ROOT / "python" / "tests" / "vectors" / "smc-vectors.v1.json",
    ROOT / "web" / "src" / "lib" / "desk" / "chart" / "vectors" / "smc-vectors.v1.json",
]
BARS = 300


def columns(rows):
    return {"open": [r[0] for r in rows], "high": [r[1] for r in rows], "low": [r[2] for r in rows], "close": [r[3] for r in rows]}


def from_closes(closes, wick=0.5):
    o = [closes[0]] + list(closes[:-1])
    return columns([(a, max(a, b) + wick, min(a, b) - wick, b) for a, b in zip(o, closes)])


def flat(count, price=100.0, half=0.5):
    return [(price, price + half, price - half, price)] * count


def mirror(rows, axis=200.0):
    return [(axis - o, axis - l, axis - h, axis - c) for o, h, l, c in rows]


def regime_walk(seed, sigma):
    rng = random.Random(seed)
    price, drift, rows = 100.0, 0.0, []
    for i in range(BARS):
        if i % 50 == 0:
            drift = rng.choice([-0.002, 0.0, 0.0015, 0.003])
        op = price
        cl = op * (1.0 + rng.gauss(drift, sigma))
        hi = max(op, cl) * (1.0 + abs(rng.gauss(0.0, sigma / 3)))
        lo = min(op, cl) * (1.0 - abs(rng.gauss(0.0, sigma / 3)))
        rows.append((round(op, 6), round(hi, 6), round(lo, 6), round(cl, 6)))
        price = rows[-1][3]
    return rows


GAP_BASE = flat(15) + [(100.0, 102.7, 99.9, 102.5), (102.5, 103.4, 101.8, 103.0)]
POOL_BASE = flat(15) + [(100.0, 100.8, 100.0, 100.6), (100.6, 100.7, 100.1, 100.2), (100.2, 100.82, 100.1, 100.6), (100.6, 100.6, 100.0, 100.1)]
HAND_CLOSES = [10, 12, 11, 13, 12, 15, 14, 13, 11, 12, 9, 10]


def series() -> dict:
    out = {
        "hand_structure": from_closes(HAND_CLOSES),
        "hand_structure_flip": from_closes(HAND_CLOSES + [16]),
        "hand_gap_open": columns(GAP_BASE + [(103.0, 103.2, 101.0, 102.0)]),
        "hand_gap_filled": columns(GAP_BASE + [(103.0, 103.2, 101.0, 102.0), (102.0, 102.1, 100.0, 100.2)]),
        "hand_gap_bearish": columns(mirror(GAP_BASE + [(103.0, 103.2, 101.0, 102.0)])),
        "hand_pool_active": columns(POOL_BASE),
        "hand_pool_swept": columns(POOL_BASE + [(100.1, 101.5, 100.0, 100.5)]),
        "hand_pool_taken": columns(POOL_BASE + [(100.1, 101.5, 100.0, 101.3)]),
        "hand_pool_lows": columns(mirror(POOL_BASE)),
    }
    for seed, sigma in ((101, 0.004), (202, 0.01), (303, 0.006), (404, 0.015)):
        out[f"walk_{seed}"] = columns(regime_walk(seed, sigma))
    return out


def build() -> dict:
    data = series()
    cases = []

    def case(name: str, key: str, n: int, price=None) -> None:
        s = data[key]
        result = smc.analyze(s["open"], s["high"], s["low"], s["close"], n, price)
        cases.append({"name": name, "series": key, "n": n, "price": price, "expected": result})

    for key in data:
        if key.startswith("hand_"):
            case(key + "_n1", key, 1)
    case("hand_structure_price_above", "hand_structure", 1, 20.0)
    case("hand_structure_price_below", "hand_structure", 1, 1.0)
    for key in data:
        if key.startswith("walk_"):
            for n in (2, 3, 5):
                case(f"{key}_n{n}", key, n)
    case("walk_101_n3_price", "walk_101", 3, data["walk_101"]["close"][-1] * 1.01)
    return {
        "version": 1,
        "origin": "synthetic_fixture",
        "generatedBy": "python/tools/make_smc_vectors.py (reference: python/jev_analytics/smc.py)",
        "tolerance": {"abs": 1e-9, "rel": 1e-9},
        "series": data,
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
