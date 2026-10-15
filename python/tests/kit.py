"""Shared builders for the tests. Everything here is synthetic."""

from __future__ import annotations

import json
import math
import random
import urllib.parse
from collections import Counter
from typing import Any, Optional

from jev_analytics import okx_public as okx

STEP_MS = {"5m": 300_000, "15m": 900_000, "1H": 3_600_000, "4H": 14_400_000}
T0 = 1_700_000_000_000


def candles_from_closes(closes: list[float], step_ms: int, forming_last: bool = False, start_ms: int = T0, wiggle: float = 0.002) -> list[dict[str, Any]]:
    out = []
    prev = closes[0]
    for i, c in enumerate(closes):
        o = prev
        out.append({
            "ts": start_ms + i * step_ms,
            "open": o,
            "high": max(o, c) * (1 + wiggle),
            "low": min(o, c) * (1 - wiggle),
            "close": c,
            "volume": 10.0 + (i % 5),
            "confirmed": not (forming_last and i == len(closes) - 1),
        })
        prev = c
    return out


def walk(n: int, seed: int, start: float = 100.0, drift: float = 0.0, sigma: float = 0.004) -> list[float]:
    rng = random.Random(seed)
    price, out = start, []
    for _ in range(n):
        price *= 1 + rng.gauss(drift, sigma)
        out.append(round(price, 6))
    return out


def uptrend(n: int, start: float = 100.0, step: float = 0.35, wobble: float = 0.4) -> list[float]:
    return [start + step * i + wobble * math.sin(i / 2.0) for i in range(n)]


def okx_candle_rows(candles: list[dict[str, Any]]) -> list[list[str]]:
    """The OKX wire format: newest first, nine string fields."""
    rows = [[str(c["ts"]), str(c["open"]), str(c["high"]), str(c["low"]), str(c["close"]), str(c["volume"]), "0", "0", "1" if c["confirmed"] else "0"] for c in candles]
    rows.reverse()
    return rows


def envelope(data: Any, code: str = "0", msg: str = "") -> bytes:
    return json.dumps({"code": code, "msg": msg, "data": data}).encode()


class FakeClock:
    def __init__(self, start: float = 1_700_000_000.0) -> None:
        self.now = start
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds

    def advance(self, seconds: float) -> None:
        self.now += seconds


def full_inputs(seed: int = 1, reference: bool = False, last: Optional[float] = None) -> dict[str, Any]:
    """A complete synthetic input block: enough bars everywhere, a perpetual and rubik series."""
    c5 = candles_from_closes(walk(300, seed), STEP_MS["5m"])
    c15 = candles_from_closes(walk(300, seed + 1), STEP_MS["15m"])
    c1h = candles_from_closes(walk(200, seed + 2), STEP_MS["1H"])
    c4h = candles_from_closes(walk(120, seed + 3), STEP_MS["4H"])
    btc = candles_from_closes(walk(200, seed + 9, start=80000.0), STEP_MS["1H"])
    px = last if last is not None else c15[-1]["close"]
    return {
        "instId": "ETH-USDT",
        "last": px,
        "spreadBps": 1.5,
        "open24h": px * 0.99,
        "candles": {"5m": c5, "15m": c15, "1H": c1h, "4H": c4h},
        "isReference": reference,
        "btc": None if reference else {"1H": btc, "last": 81000.0, "open24h": 80000.0},
        "funding": {"current": 0.0001, "history": [0.00005 + 0.00001 * ((i * 7) % 11) for i in range(100)]},
        "rubik": {
            "oi": [(T0 + i * 300_000, 1_000_000.0 + 1000.0 * i, 5e5) for i in range(60)],
            "longShort": [(T0 + i * 300_000, 1.2 + 0.01 * ((i * 5) % 9)) for i in range(120)],
            "taker": [(T0 + i * 300_000, 100.0, 120.0) for i in range(60)],
        },
        "reasons": {},
    }


SIZES = {"5m": 300, "15m": 300, "1H": 200, "4H": 120}


class FakeOkx:
    """Routes the public API by path. Counts calls and can fail a route on demand."""

    def __init__(self):
        self.calls = Counter()
        self.urls = []
        self.fail = {}  # route -> error code string raised as OkxError
        self.no_perp = set()
        self.contract_coins = {"BTC", "ETH", "SOL"}
        self.spot_coins = {"BTC", "ETH"}
        self.known = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "OKB-USDT", "MON-USDT"]

    def series(self, inst, bar):
        seed = sum(map(ord, inst)) + len(bar)
        start = 80000.0 if inst.startswith("BTC") else 100.0
        return candles_from_closes(walk(SIZES[bar], seed, start=start), STEP_MS[bar], forming_last=True)

    def __call__(self, url):
        parsed = urllib.parse.urlparse(url)
        route = parsed.path.replace("/api/v5/", "")
        q = dict(urllib.parse.parse_qsl(parsed.query))
        self.calls[route] += 1
        self.urls.append(url)
        if route in self.fail:
            raise okx.OkxError(self.fail[route])
        if route == "market/candles":
            return envelope(okx_candle_rows(self.series(q["instId"], q["bar"])))
        if route == "market/tickers":
            rows = []
            for inst in self.known:
                last = self.series(inst, "5m")[-2]["close"]  # the last confirmed 5m close: the ticker agrees with the candles
                rows.append({"instId": inst, "last": str(last), "bidPx": str(last * 0.99998), "askPx": str(last * 1.00002), "open24h": str(last * 0.99), "ts": "1700000000000"})
            rows.append({"instId": "ABC-EUR", "last": "10", "bidPx": "9.99", "askPx": "10.01", "open24h": "10", "ts": "1700000000000"})
            return envelope(rows)
        if route == "public/funding-rate":
            return envelope([], code="51001") if q["instId"] in self.no_perp else envelope([{"fundingRate": "0.0001"}])
        if route == "public/funding-rate-history":
            if q["instId"] in self.no_perp:
                return envelope([], code="51001")
            return envelope([{"fundingTime": str(1_700_000_000_000 + i * 28_800_000), "realizedRate": str(0.00005 + 0.00001 * ((i * 7) % 11))} for i in range(100)])
        if route == "rubik/stat/trading-data/support-coin":
            return envelope({"contract": sorted(self.contract_coins), "spot": sorted(self.spot_coins), "option": []})
        if route == "rubik/stat/contracts/open-interest-volume":
            return envelope([[str(1_700_000_000_000 + i * 300_000), str(1e6 + 1000 * i), "5e5"] for i in range(100)][::-1])
        if route == "rubik/stat/contracts/long-short-account-ratio":
            return envelope([[str(1_700_000_000_000 + i * 300_000), str(1.2 + 0.01 * ((i * 5) % 9))] for i in range(100)][::-1])
        if route == "rubik/stat/taker-volume":
            return envelope([[str(1_700_000_000_000 + i * 300_000), "100", "120"] for i in range(100)][::-1])
        raise AssertionError("unexpected route " + route)
