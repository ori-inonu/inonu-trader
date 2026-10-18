"""Command line: python -m jev_analytics once|loop|selftest [--insts ...] [--out PATH] [--interval S] [--max-cycles N]

Read only against the public OKX API (no key). It writes data/jev-analytics/latest.json atomically. It never signs,
sends or places anything and never calls a model.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from .collector import Collector, parse_inst_ids
from .okx_public import OkxPublic
from .pack import validate_pack, write_atomic

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INSTS = "BTC-USDT,ETH-USDT,SOL-USDT,OKB-USDT,MON-USDT"


def default_out() -> Path:
    return Path(os.environ.get("JEV_ANALYTICS_PATH") or ROOT / "data" / "jev-analytics" / "latest.json")


def run_cycle(collector: Collector, inst_ids: list[str], out: Path) -> dict:
    pack = collector.cycle(inst_ids)
    write_atomic(out, pack)
    parts = [f"{i} {e['completeness']:.2f}" for i, e in pack["instruments"].items()]
    print(f"jev_analytics: pacote escrito em {out} ({pack['budget']['calls']} chamadas em {pack['budget']['windowSec']} s; completude {', '.join(parts)})", file=sys.stderr, flush=True)
    return pack


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="jev_analytics", description=__doc__)
    parser.add_argument("mode", choices=["once", "loop", "selftest"])
    parser.add_argument("--insts", default=DEFAULT_INSTS)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--interval", type=int, default=30, help="seconds between cycles in loop mode, 10 to 3600")
    parser.add_argument("--max-cycles", type=int, default=0, help="stop after N cycles in loop mode, 0 means never")
    args = parser.parse_args(argv)

    if args.mode == "selftest":
        import unittest
        suite = unittest.defaultTestLoader.discover(str(ROOT / "python" / "tests"), top_level_dir=str(ROOT / "python"))
        return 0 if unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful() else 1

    if not 10 <= args.interval <= 3600:
        parser.error("--interval must be between 10 and 3600")
    try:
        inst_ids = parse_inst_ids(args.insts)
    except ValueError as exc:
        parser.error(str(exc))
    out = args.out or default_out()
    collector = Collector(OkxPublic(), time.time)

    if args.mode == "once":
        pack = run_cycle(collector, inst_ids, out)
        return 0 if not validate_pack(pack) else 1

    cycles = 0
    try:
        while True:
            started = time.monotonic()
            try:
                run_cycle(collector, inst_ids, out)
            except Exception as exc:  # noqa: BLE001 - a failed cycle must never stop the producer
                print(f"jev_analytics: ciclo falhou ({type(exc).__name__})", file=sys.stderr, flush=True)
            cycles += 1
            if args.max_cycles and cycles >= args.max_cycles:
                return 0
            time.sleep(max(1.0, args.interval - (time.monotonic() - started)))
    except KeyboardInterrupt:
        print("jev_analytics: encerrado", file=sys.stderr)
        return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
