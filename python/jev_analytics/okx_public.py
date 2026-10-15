"""Keyless client of the public OKX v5 API. The transport is injected, so tests never touch the network.

Only GET on https://www.okx.com, only the routes below, every number parsed strictly. A budget counts calls per
route and a limiter spaces them (market and public routes 150 ms apart, rubik routes 500 ms apart: rubik allows
5 requests per 2 seconds per IP).
"""

from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from typing import Any, Callable, Optional

BASE_URL = "https://www.okx.com"
MAX_BODY_BYTES = 6_000_000
TIMEOUT_S = 8.0

Fetch = Callable[[str], bytes]

# The limiter group of each route and the minimum spacing of a group, in seconds.
GROUP_SPACING_S = {"market": 0.15, "rubik": 0.5}
ROUTE_GROUP = {
    "market/candles": "market",
    "market/tickers": "market",
    "public/funding-rate": "market",
    "public/funding-rate-history": "market",
    "rubik/stat/trading-data/support-coin": "rubik",
    "rubik/stat/contracts/open-interest-volume": "rubik",
    "rubik/stat/contracts/long-short-account-ratio": "rubik",
    "rubik/stat/taker-volume": "rubik",
}
BARS = {"5m", "15m", "1H", "4H"}


class OkxError(Exception):
    """Carries a short, fixed code: network, timeout, http_<status>, bad_json, too_large, api_<code>, schema."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def error_code(exc: Exception) -> str:
    return exc.code if isinstance(exc, OkxError) else "fetch_failed"


def default_fetch(url: str) -> bytes:
    if not url.startswith(BASE_URL + "/api/v5/"):
        raise OkxError("schema")
    request = urllib.request.Request(url, headers={"User-Agent": "jev-analytics/1.0", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:  # noqa: S310 - fixed https host
            body = response.read(MAX_BODY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise OkxError(f"http_{exc.code}") from None
    except TimeoutError:
        raise OkxError("timeout") from None
    except (urllib.error.URLError, OSError):
        raise OkxError("network") from None
    if len(body) > MAX_BODY_BYTES:
        raise OkxError("too_large")
    return body


class Budget:
    def __init__(self, clock: Callable[[], float], window_s: int = 60) -> None:
        self._clock = clock
        self._window_s = window_s
        self._calls: deque[tuple[float, str]] = deque()

    def record(self, route: str) -> None:
        self._calls.append((self._clock(), route))

    def snapshot(self) -> dict[str, Any]:
        cutoff = self._clock() - self._window_s
        while self._calls and self._calls[0][0] < cutoff:
            self._calls.popleft()
        by_route: dict[str, int] = {}
        for _, route in self._calls:
            by_route[route] = by_route.get(route, 0) + 1
        return {"windowSec": self._window_s, "calls": len(self._calls), "byEndpoint": dict(sorted(by_route.items()))}


def _num(value: Any, *, positive: bool = False, allow_empty: bool = False) -> Optional[float]:
    if allow_empty and (value is None or value == ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise OkxError("schema") from None
    if not math.isfinite(number) or (positive and number <= 0):
        raise OkxError("schema")
    return number


def _ts(value: Any) -> int:
    try:
        stamp = int(value)
    except (TypeError, ValueError):
        raise OkxError("schema") from None
    if stamp <= 0:
        raise OkxError("schema")
    return stamp


class OkxPublic:
    def __init__(
        self,
        fetch: Fetch = default_fetch,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
        budget: Optional[Budget] = None,
    ) -> None:
        self._fetch = fetch
        self._clock = clock
        self._sleep = sleep
        self.budget = budget or Budget(clock)
        self._last_call: dict[str, float] = {}

    def _get(self, route: str, params: dict[str, Any]) -> list[Any]:
        data = self._get_any(route, params)
        if not isinstance(data, list):
            raise OkxError("schema")
        return data

    def _get_any(self, route: str, params: dict[str, Any]) -> Any:
        group = ROUTE_GROUP[route]
        wait = self._last_call.get(group, -1e18) + GROUP_SPACING_S[group] - self._clock()
        if wait > 0:
            self._sleep(wait)
        self._last_call[group] = self._clock()
        self.budget.record(route)
        query = urllib.parse.urlencode(params)
        body = self._fetch(f"{BASE_URL}/api/v5/{route}" + (f"?{query}" if query else ""))
        try:
            envelope = json.loads(body)
        except (ValueError, TypeError):
            raise OkxError("bad_json") from None
        if not isinstance(envelope, dict) or "code" not in envelope:
            raise OkxError("schema")
        if str(envelope["code"]) != "0":
            raise OkxError(f"api_{str(envelope['code'])[:8]}")
        return envelope.get("data")

    # Market data ------------------------------------------------------------------------------------------

    def candles(self, inst_id: str, bar: str, limit: int) -> list[dict[str, Any]]:
        """Oldest first. `confirmed` is False for the bar still forming."""
        if bar not in BARS or not 1 <= limit <= 300:
            raise OkxError("schema")
        rows = self._get("market/candles", {"instId": inst_id, "bar": bar, "limit": limit})
        out: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 9:
                raise OkxError("schema")
            candle = {
                "ts": _ts(row[0]),
                "open": _num(row[1], positive=True),
                "high": _num(row[2], positive=True),
                "low": _num(row[3], positive=True),
                "close": _num(row[4], positive=True),
                "volume": _num(row[5]),
                "confirmed": str(row[8]) == "1",
            }
            if candle["high"] < max(candle["open"], candle["close"], candle["low"]) or candle["low"] > min(candle["open"], candle["close"]):
                raise OkxError("schema")
            out.append(candle)
        out.reverse()
        if any(out[i]["ts"] <= out[i - 1]["ts"] for i in range(1, len(out))):
            raise OkxError("schema")
        return out

    def tickers_spot(self) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        for row in self._get("market/tickers", {"instType": "SPOT"}):
            if not isinstance(row, dict) or not isinstance(row.get("instId"), str):
                continue
            try:
                out[row["instId"]] = {
                    "last": _num(row.get("last"), positive=True),
                    "bid": _num(row.get("bidPx"), positive=True, allow_empty=True),
                    "ask": _num(row.get("askPx"), positive=True, allow_empty=True),
                    "open24h": _num(row.get("open24h"), positive=True, allow_empty=True),
                    "ts": _ts(row.get("ts")),
                }
            except OkxError:
                continue  # one malformed row must not hide the others
        return out

    def funding_rate(self, swap_id: str) -> Optional[float]:
        """The current funding rate, None when the perpetual does not exist (API code 51001)."""
        try:
            rows = self._get("public/funding-rate", {"instId": swap_id})
        except OkxError as exc:
            if exc.code == "api_51001":
                return None
            raise
        if len(rows) != 1 or not isinstance(rows[0], dict):
            raise OkxError("schema")
        return _num(rows[0].get("fundingRate"))

    def funding_history(self, swap_id: str, limit: int = 100) -> Optional[list[float]]:
        """Settled funding rates, oldest first. None when the perpetual does not exist."""
        try:
            rows = self._get("public/funding-rate-history", {"instId": swap_id, "limit": limit})
        except OkxError as exc:
            if exc.code == "api_51001":
                return None
            raise
        out: list[tuple[int, float]] = []
        for row in rows:
            if not isinstance(row, dict):
                raise OkxError("schema")
            rate = _num(row.get("realizedRate") if row.get("realizedRate") not in (None, "") else row.get("fundingRate"))
            out.append((_ts(row.get("fundingTime")), rate))  # type: ignore[arg-type]
        out.sort()
        return [rate for _, rate in out]

    # Trading statistics (rubik) -----------------------------------------------------------------------------

    def support_coins(self) -> dict[str, set[str]]:
        # Live, `data` is one object; the public mirror of the docs shows a list holding that object. Accept both.
        data = self._get_any("rubik/stat/trading-data/support-coin", {})
        if isinstance(data, list) and len(data) == 1:
            data = data[0]
        if not isinstance(data, dict):
            raise OkxError("schema")
        out: dict[str, set[str]] = {}
        for key in ("contract", "spot"):
            values = data.get(key)
            out[key] = {v for v in values if isinstance(v, str)} if isinstance(values, list) else set()
        return out

    def _series(self, route: str, params: dict[str, Any], width: int) -> list[tuple[Any, ...]]:
        rows = self._get(route, params)
        out: list[tuple[Any, ...]] = []
        for row in rows:
            if not isinstance(row, list) or len(row) < width:
                raise OkxError("schema")
            out.append((_ts(row[0]), *(_num(v, positive=False) for v in row[1:width])))
        out.sort(key=lambda r: r[0])
        return out

    def rubik_open_interest(self, ccy: str) -> list[tuple[int, float, float]]:
        """[(ts, open interest USD, volume USD)] oldest first, 5 minute granularity."""
        return self._series("rubik/stat/contracts/open-interest-volume", {"ccy": ccy, "period": "5m"}, 3)  # type: ignore[return-value]

    def rubik_long_short(self, ccy: str) -> list[tuple[int, float]]:
        return self._series("rubik/stat/contracts/long-short-account-ratio", {"ccy": ccy, "period": "5m"}, 2)  # type: ignore[return-value]

    def rubik_taker(self, ccy: str) -> list[tuple[int, float, float]]:
        """[(ts, sell volume, buy volume)] oldest first (the API order is ts, sellVol, buyVol)."""
        return self._series("rubik/stat/taker-volume", {"ccy": ccy, "instType": "SPOT", "period": "5m"}, 3)  # type: ignore[return-value]
