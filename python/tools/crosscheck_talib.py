"""Cross-checks jev_analytics against independent implementations. NOT part of the unit tests (needs numpy and TA-Lib).

    python -m venv /tmp/ref && /tmp/ref/bin/pip install numpy pandas TA-Lib
    /tmp/ref/bin/python python/tools/crosscheck_talib.py

Prints, per indicator, the largest absolute and relative difference over every index where both sides are defined,
and exits non zero when one exceeds the tolerance. Supertrend, Renko, Heikin Ashi, pivots, correlation, beta and the
efficiency ratio have no TA-Lib function, so they are compared with a second, differently written implementation.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import talib

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from jev_analytics import indicators as ind  # noqa: E402
from jev_analytics import stats, structure, transforms  # noqa: E402

TOL_REL = 1e-9  # on |a - b| / max(1, |b|)
failures: list[str] = []


def compare(name: str, mine, ref, start: int = 0) -> None:
    worst_abs = worst_rel = 0.0
    compared = 0
    mismatch_defined = 0
    for i, (a, b) in enumerate(zip(mine, ref)):
        if i < start:
            continue
        b_nan = b is None or (isinstance(b, float) and math.isnan(b))
        if (a is None) != b_nan:
            mismatch_defined += 1
            continue
        if a is None:
            continue
        d = abs(a - b)
        worst_abs = max(worst_abs, d)
        worst_rel = max(worst_rel, d / max(1.0, abs(b)))
        compared += 1
    ok = mismatch_defined == 0 and compared > 0 and worst_rel <= TOL_REL
    print(f"{'ok  ' if ok else 'FAIL'} {name:28s} compared={compared:4d} defined_mismatch={mismatch_defined} max_abs={worst_abs:.3e} max_rel={worst_rel:.3e}")
    if not ok:
        failures.append(name)


def main() -> int:
    data = json.loads((ROOT / "python" / "tests" / "vectors" / "chart-vectors.v1.json").read_text(encoding="utf8"))
    s = data["candles"]
    o, h, l, c = (np.array(s[k], dtype=float) for k in ("open", "high", "low", "close"))
    ts = s["ts"]

    for n in (5, 20):
        compare(f"sma{n}", ind.sma(list(c), n), talib.SMA(c, n))
    for n in (9, 21, 50, 200):
        compare(f"ema{n}", ind.ema(list(c), n), talib.EMA(c, n))
    compare("rsi14", ind.rsi(list(c), 14), talib.RSI(c, 14))
    compare("atr14", ind.atr(list(h), list(l), list(c), 14), talib.ATR(h, l, c, 14))

    bb = ind.bollinger(list(c), 20, 2.0)
    up, mid, lo = talib.BBANDS(c, 20, 2, 2, 0)
    compare("bollinger.upper", bb["upper"], up)
    compare("bollinger.mid", bb["mid"], mid)
    compare("bollinger.lower", bb["lower"], lo)
    compare("bollinger.percentB", bb["percentB"], (c - lo) / (up - lo))
    compare("bollinger.width", bb["width"], (up - lo) / mid)

    a = ind.adx(list(h), list(l), list(c), 14)
    compare("adx14", a["adx"], talib.ADX(h, l, c, 14))
    compare("plusDi14", a["plusDi"], talib.PLUS_DI(h, l, c, 14))
    compare("minusDi14", a["minusDi"], talib.MINUS_DI(h, l, c, 14))

    m = ind.macd(list(c), 12, 26, 9)
    t_line, t_sig, t_hist = talib.MACD(c, 12, 26, 9)
    # TA-Lib seeds EMA12 at the EMA26 start, mine seeds each EMA at its own start: they converge, so compare the settled part.
    for name, mine, ref in (("macd.line", m["macd"], t_line), ("macd.signal", m["signal"], t_sig), ("macd.hist", m["hist"], t_hist)):
        first_close = next(i for i in range(len(c)) if mine[i] is not None and not np.isnan(ref[i]) and abs(mine[i] - ref[i]) <= 1e-9)
        print(f"info macd transient before index {first_close} for {name}")
        compare(name + f" (from {first_close})", mine, ref, start=first_close)

    # Independent re-implementations ---------------------------------------------------------------------------
    df = pd.DataFrame({"o": o, "h": h, "l": l, "c": c})

    ha_c = (df.o + df.h + df.l + df.c) / 4
    ha_o = pd.Series(index=df.index, dtype=float)
    ha_o.iloc[0] = (df.o.iloc[0] + df.c.iloc[0]) / 2
    for i in range(1, len(df)):
        ha_o.iloc[i] = (ha_o.iloc[i - 1] + ha_c.iloc[i - 1]) / 2
    ha = transforms.heikin_ashi(list(o), list(h), list(l), list(c))
    compare("heikin.open", [x["open"] for x in ha], ha_o.to_numpy())
    compare("heikin.close", [x["close"] for x in ha], ha_c.to_numpy())
    compare("heikin.high", [x["high"] for x in ha], np.maximum.reduce([h, ha_o.to_numpy(), ha_c.to_numpy()]))
    compare("heikin.low", [x["low"] for x in ha], np.minimum.reduce([l, ha_o.to_numpy(), ha_c.to_numpy()]))

    # Supertrend (pandas rolling style, Pine like state machine, same ATR and the same initial direction).
    atr_ref = talib.ATR(h, l, c, 10)
    hl2 = (h + l) / 2
    st_line = [float("nan")] * len(c)
    st_dir = [float("nan")] * len(c)
    fu = fl = 0.0
    d = 1
    for i in range(10, len(c)):
        bu, bl = hl2[i] + 3 * atr_ref[i], hl2[i] - 3 * atr_ref[i]
        if i == 10:
            fu, fl = bu, bl
        else:
            fu = bu if (bu < fu or c[i - 1] > fu) else fu
            fl = bl if (bl > fl or c[i - 1] < fl) else fl
            if d == 1 and c[i] < fl:
                d = -1
            elif d == -1 and c[i] > fu:
                d = 1
        st_dir[i] = d
        st_line[i] = fl if d == 1 else fu
    st = ind.supertrend(list(h), list(l), list(c), 10, 3.0)
    compare("supertrend.line", st["line"], st_line)
    compare("supertrend.dir", st["dir"], st_dir)

    # Renko with float price levels, classic textbook loop, to compare with the integer level implementation.
    for size in (1.0, 2.5):
        bricks = []
        lo_b = hi_b = math.floor(c[0] / size) * size
        direction = 0
        for i, price in enumerate(c):
            progressed = True
            while progressed:
                progressed = False
                if direction == 0:
                    if price >= hi_b + size:
                        bricks.append((hi_b, hi_b + size, 1)); lo_b, hi_b = hi_b, hi_b + size; direction = 1; progressed = True
                    elif price <= lo_b - size:
                        bricks.append((lo_b, lo_b - size, -1)); hi_b, lo_b = lo_b, lo_b - size; direction = -1; progressed = True
                elif direction == 1:
                    if price >= hi_b + size:
                        bricks.append((hi_b, hi_b + size, 1)); lo_b, hi_b = hi_b, hi_b + size; progressed = True
                    elif price <= lo_b - size:
                        bricks.append((lo_b, lo_b - size, -1)); hi_b, lo_b = lo_b, lo_b - size; direction = -1; progressed = True
                else:
                    if price <= lo_b - size:
                        bricks.append((lo_b, lo_b - size, -1)); hi_b, lo_b = lo_b, lo_b - size; progressed = True
                    elif price >= hi_b + size:
                        bricks.append((hi_b, hi_b + size, 1)); lo_b, hi_b = hi_b, hi_b + size; direction = 1; progressed = True
        mine = transforms.renko(list(c), ts, size)
        same = len(mine) == len(bricks) and all(
            math.isclose(b["open"], r[0], abs_tol=1e-9) and math.isclose(b["close"], r[1], abs_tol=1e-9) and int(b["dir"]) == r[2]
            for b, r in zip(mine, bricks)
        )
        print(f"{'ok  ' if same else 'FAIL'} renko size={size} bricks={len(mine)} (independent float implementation: {len(bricks)})")
        if not same:
            failures.append(f"renko{size}")

    # Pivots, correlation, beta, efficiency ratio via numpy / pandas.
    k = 3
    ref_pivots = []
    for i in range(k, len(h) - k):
        if h[i] > h[i - k:i].max() and h[i] >= h[i + 1:i + k + 1].max():
            ref_pivots.append((i, h[i], 1))
        if l[i] < l[i - k:i].min() and l[i] <= l[i + 1:i + k + 1].min():
            ref_pivots.append((i, l[i], -1))
    mine_p = [(int(p["index"]), p["price"], int(p["kind"])) for p in structure.pivots(list(h), list(l), k)]
    print(f"{'ok  ' if mine_p == ref_pivots else 'FAIL'} pivots k=3 count={len(mine_p)}")
    if mine_p != ref_pivots:
        failures.append("pivots")

    r1 = np.diff(np.log(c))
    r2 = np.diff(np.log(o + (h - l)))
    r1, r2 = r1[-48:], r2[-48:]
    corr_ref = float(np.corrcoef(r1, r2)[0, 1])
    beta_ref = float(np.polyfit(r2, r1, 1)[0])
    for name, got, want in (("corr", stats.corr(list(r1), list(r2)), corr_ref), ("beta", stats.beta(list(r1), list(r2)), beta_ref)):
        ok = abs(got - want) < 1e-12
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {got:.12f} vs {want:.12f}")
        if not ok:
            failures.append(name)

    er_ref = float(abs(c[-1] - c[-21]) / pd.Series(c).diff().abs().iloc[-20:].sum())
    er = stats.efficiency_ratio(list(c), 20)
    ok = abs(er - er_ref) < 1e-12
    print(f"{'ok  ' if ok else 'FAIL'} efficiency_ratio: {er:.12f} vs {er_ref:.12f}")
    if not ok:
        failures.append("efficiency_ratio")

    sd_ref = float(pd.Series(r1).std(ddof=1))
    ok = abs(stats.stdev(list(r1)) - sd_ref) < 1e-15
    print(f"{'ok  ' if ok else 'FAIL'} stdev(ddof=1)")
    if not ok:
        failures.append("stdev")

    print("FAILED: " + ", ".join(failures) if failures else "ALL CROSS-CHECKS PASSED")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
