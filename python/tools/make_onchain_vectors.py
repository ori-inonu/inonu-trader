"""Generates the golden vectors of the on-chain digest (fase-2 SPEC F2-DIG-8), consumed by the TypeScript tests.

    python python/tools/make_onchain_vectors.py            writes the file
    python python/tools/make_onchain_vectors.py --check    fails when the file is out of date

The TypeScript runtime lives in src/intel/onchain-*.ts and trail.ts (the installed app has no Python). This file is the
independent reference: every formula below is written here from the definitions of docs/sdd/inonu-desktop-v1/flow-engine.md
section 4 and docs/sdd/config-onchain-smartmoney/fase-2/SPEC.md table 4.1, with no import from the TypeScript side and no
third party package. Inputs are labelled synthetic: a few cases worked out by hand plus seeded random ones. The TypeScript
test reproduces every expected value with a tolerance of 1e-9.
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "python" / "tests" / "vectors" / "onchain-vectors.v1.json"

WEIGHTS = {
    "compra": 1.5,
    "carteiras": 1.0,
    "naoVendida": 1.0,
    "qualidade": 1.0,
    "concentracao": 1.0,
    "risco": 1.5,
    "liquidez": 0.8,
    "fluxo": 0.8,
    "sentimento": 0.4,
}
COMPONENTS = list(WEIGHTS)
CLUSTER = {"low": 1.0, "medium": 0.5, "high": 0.0}


def percentile(values: list[float], p: int) -> float | None:
    """Nearest rank: rank = ceil(p * n / 100), at least 1."""
    if not values:
        return None
    rank = max(1, -((-p * len(values)) // 100))
    return sorted(values)[rank - 1]


def liquidity(value: float | None, reference_set: list[float]) -> float | None:
    if value is None or value < 0:
        return None
    ref = percentile([v for v in reference_set if v >= 0], 75)
    if ref is None or not ref > 0:
        return None
    return min(1.0, value / ref)


def bought(net_unsold_usd: float, reference_set: list[float]) -> float | None:
    ref = percentile(reference_set, 95)
    if ref is None or not ref > 0 or not net_unsold_usd >= 0:
        return None
    return min(1.0, math.log1p(net_unsold_usd) / math.log1p(ref))


def flow(buy_usd: float, sell_usd: float) -> float | None:
    total = buy_usd + sell_usd
    return buy_usd / total if total > 0 else None


def risk(level: int | None) -> float | None:
    if level is None or level < 1 or level > 5:
        return None
    return (5 - level) / 5


def concentration(label: str | None, top10_pct: float | None) -> float | None:
    if label is not None and label.strip().lower() in CLUSTER:
        return CLUSTER[label.strip().lower()]
    if top10_pct is not None:
        return min(1.0, max(0.0, 1 - top10_pct / 100))
    return None


def trail(components: dict[str, float | None], honeypot: bool) -> dict:
    weighted = 0.0
    total = 0.0
    absent = []
    for name in COMPONENTS:
        value = components[name]
        if value is None:
            absent.append(name)
            continue
        weighted += WEIGHTS[name] * value
        total += WEIGHTS[name]
    nota = 0.0 if honeypot else (None if total == 0 else 100 * weighted / total)
    return {"nota": nota, "ausentes": absent}


def build() -> dict:
    rng = random.Random(20261013)
    ten = [float(v) for v in range(1, 11)]

    percentiles = [{"values": v, "p": p, "expected": percentile(v, p)} for v in (ten, [10.0, 20.0, 30.0, 40.0], [5.0], [3.0, 1.0, 2.0]) for p in (75, 90, 95, 100)]
    percentiles.append({"values": [], "p": 75, "expected": None})

    liquidity_cases = [{"value": v, "set": ten, "expected": liquidity(v, ten)} for v in (0.0, 4.0, 8.0, 20.0)]
    liquidity_cases += [{"value": None, "set": ten, "expected": None}, {"value": 5.0, "set": [], "expected": None}, {"value": 5.0, "set": [0.0, 0.0], "expected": None}]
    for _ in range(40):
        ref_set = [round(rng.uniform(1e3, 5e8), 2) for _ in range(rng.randint(3, 30))]
        value = round(rng.uniform(0, 6e8), 2)
        liquidity_cases.append({"value": value, "set": ref_set, "expected": liquidity(value, ref_set)})

    bought_cases = []
    for _ in range(40):
        ref_set = [round(rng.uniform(10, 5e4), 2) for _ in range(rng.randint(3, 30))]
        net = round(rng.uniform(0, 8e4), 2)
        bought_cases.append({"net": net, "set": ref_set, "expected": bought(net, ref_set)})
    bought_cases += [{"net": 0.0, "set": [100.0, 200.0, 300.0], "expected": bought(0.0, [100.0, 200.0, 300.0])}, {"net": 5.0, "set": [], "expected": None}]

    flow_cases = [{"buy": b, "sell": s, "expected": flow(b, s)} for b, s in ((600.0, 400.0), (0.0, 10.0), (10.0, 0.0), (0.0, 0.0), (1234.5, 678.9))]

    risk_cases = [{"level": lv, "expected": risk(lv)} for lv in (1, 2, 3, 4, 5, 0, None, 6, -1)]

    concentration_cases = [
        {"label": "Low", "top10": 74.0083, "expected": concentration("Low", 74.0083)},
        {"label": "Medium", "top10": 74.0, "expected": concentration("Medium", 74.0)},
        {"label": "High", "top10": 5.0, "expected": concentration("High", 5.0)},
        {"label": None, "top10": 74.0083, "expected": concentration(None, 74.0083)},
        {"label": "Odd", "top10": 20.0, "expected": concentration("Odd", 20.0)},
        {"label": None, "top10": 140.0, "expected": concentration(None, 140.0)},
        {"label": None, "top10": None, "expected": None},
    ]

    trail_cases = []
    v_trail_1 = {"compra": 0.8, "carteiras": 0.6, "naoVendida": 0.6, "qualidade": None, "concentracao": 0.5, "risco": 1.0, "liquidez": 0.4, "fluxo": 0.7, "sentimento": None}
    trail_cases.append({"name": "V-TRAIL-1", "components": v_trail_1, "honeypot": False, "expected": trail(v_trail_1, False)})
    trail_cases.append({"name": "V-TRAIL-1 honeypot", "components": v_trail_1, "honeypot": True, "expected": trail(v_trail_1, True)})
    none = {name: None for name in COMPONENTS}
    trail_cases.append({"name": "nothing present", "components": none, "honeypot": False, "expected": trail(none, False)})
    for i in range(60):
        comps = {name: (None if rng.random() < 0.3 else round(rng.random(), 6)) for name in COMPONENTS}
        honeypot = rng.random() < 0.1
        trail_cases.append({"name": f"random {i}", "components": comps, "honeypot": honeypot, "expected": trail(comps, honeypot)})

    return {
        "origin": "synthetic_fixture",
        "version": 1,
        "weights": WEIGHTS,
        "percentile": percentiles,
        "liquidity": liquidity_cases,
        "bought": bought_cases,
        "flow": flow_cases,
        "risk": risk_cases,
        "concentration": concentration_cases,
        "trail": trail_cases,
    }


def render(data: dict) -> str:
    return json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n"


def main() -> int:
    text = render(build())
    if "--check" in sys.argv:
        if not TARGET.exists() or TARGET.read_text(encoding="utf8") != text:
            print(f"out of date: {TARGET}")
            return 1
        print("ok")
        return 0
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(text, encoding="utf8", newline="\n")
    print(f"written: {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
