"""Writes a deterministic sample pack, built by the real collector over the synthetic fake API of the tests.

    python python/tools/make_pack_sample.py            writes both copies
    python python/tools/make_pack_sample.py --check    fails when a copy is out of date

The sample is the contract between the Python producer and the TypeScript reader: the TypeScript parser must accept
every section of it, and the Python test suite proves the file is what the producer really emits. It is synthetic
(origin: synthetic_fixture) and says nothing about any market.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from jev_analytics import okx_public  # noqa: E402
from jev_analytics.collector import Collector  # noqa: E402
from tests.kit import FakeClock, FakeOkx  # noqa: E402

TARGETS = [
    ROOT / "python" / "tests" / "vectors" / "pack-sample.v1.json",
    ROOT / "src" / "jev-read" / "fixtures" / "analytics-pack.sample.json",
]
INSTS = ["BTC-USDT", "ETH-USDT", "MON-USDT"]


def build() -> dict:
    clock = FakeClock(1_700_000_000.0)
    fake = FakeOkx()
    pack = Collector(okx_public.OkxPublic(fetch=fake, clock=clock, sleep=clock.sleep), clock).cycle(INSTS)
    return {"origin": "synthetic_fixture", "pack": pack}


def render(data: dict) -> str:
    return json.dumps(data, separators=(",", ":"), allow_nan=False, sort_keys=True) + "\n"


def main() -> int:
    text = render(build())
    stale = []
    for target in TARGETS:
        if "--check" in sys.argv:
            if not target.exists() or target.read_text(encoding="utf8") != text:
                stale.append(str(target))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf8", newline="\n")
    if stale:
        print("out of date: " + ", ".join(stale))
        return 1
    print("ok" if "--check" in sys.argv else "written: " + ", ".join(str(t) for t in TARGETS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
