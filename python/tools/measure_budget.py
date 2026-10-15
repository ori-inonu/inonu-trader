"""Measures the real request budget of the collector against the live public API (read only, no key).

    python python/tools/measure_budget.py [--minutes 10] [--insts BTC-USDT,ETH-USDT,...] [--interval 30]

Counts every HTTP request that leaves the process (a wrapper around the real transport), so the number does not
depend on the collector's own bookkeeping. Prints the cold start burst, the steady state per minute and the highest
rate seen in any 2 second window against the documented limits. Does not write the pack.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jev_analytics import okx_public  # noqa: E402
from jev_analytics.collector import Collector, parse_inst_ids  # noqa: E402

DEFAULT_INSTS = "BTC-USDT,ETH-USDT,SOL-USDT,OKB-USDT,MON-USDT"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--minutes", type=float, default=10.0)
    parser.add_argument("--insts", default=DEFAULT_INSTS)
    parser.add_argument("--interval", type=int, default=30)
    args = parser.parse_args()
    insts = parse_inst_ids(args.insts)

    stamps: list[tuple[float, str]] = []

    def counting_fetch(url: str) -> bytes:
        route = url.split("/api/v5/", 1)[1].split("?", 1)[0]
        stamps.append((time.monotonic(), route))
        return okx_public.default_fetch(url)

    collector = Collector(okx_public.OkxPublic(fetch=counting_fetch), time.time)
    start = time.monotonic()
    cold_end = None
    while time.monotonic() - start < args.minutes * 60:
        began = time.monotonic()
        collector.cycle(insts)
        if cold_end is None:
            cold_end = len(stamps)
        time.sleep(max(1.0, args.interval - (time.monotonic() - began)))
    elapsed = time.monotonic() - start

    total = len(stamps)
    steady = total - (cold_end or 0)
    cold_s = (stamps[(cold_end or 1) - 1][0] - stamps[0][0]) if stamps else 0.0
    steady_minutes = max(1e-9, (elapsed - cold_s) / 60)
    worst_2s = max((sum(1 for t, _ in stamps if t0 <= t < t0 + 2.0) for t0, _ in stamps), default=0)
    worst_rubik_2s = max((sum(1 for t, r in stamps if r.startswith("rubik") and t0 <= t < t0 + 2.0) for t0, r in stamps if r.startswith("rubik")), default=0)
    by_route = Counter(r for _, r in stamps)
    print(f"instruments={len(insts)} elapsed={elapsed / 60:.1f} min total_requests={total}")
    print(f"cold start burst={cold_end} requests in {cold_s:.1f} s")
    print(f"steady state: {steady} requests in {steady_minutes:.1f} min = {steady / steady_minutes:.1f} per minute")
    print(f"highest count in any 2 s window: {worst_2s} (rubik: {worst_rubik_2s}, documented rubik limit 5 per 2 s)")
    for route, n in sorted(by_route.items()):
        print(f"  {route}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
