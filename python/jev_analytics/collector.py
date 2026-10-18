"""Collects public OKX data with a tiered cache and builds the pack. All time and network access is injected."""

from __future__ import annotations

import re
from typing import Any, Callable, Optional

from . import ENGINE_NAME, ENGINE_VERSION, PACK_KIND, PACK_SCHEMA_VERSION
from .cache import TtlCache
from .features import closed, compute_features
from .okx_public import OkxPublic, error_code

REFERENCE = "BTC-USDT"
INST_ID = re.compile(r"^[A-Z0-9]{1,12}-[A-Z0-9]{1,12}$")

# Seconds. Spec section 7.3.
TTL = {
    "tickers": 30,
    "candles.5m": 60,
    "candles.15m": 120,
    "candles.1H": 300,
    "candles.4H": 900,
    "funding.current": 60,
    "funding.history": 3600,
    "rubik": 300,
    "support": 86_400,
}
LIMIT = {"5m": 300, "15m": 300, "1H": 200, "4H": 120}


def parse_inst_ids(text: str) -> list[str]:
    ids = [part.strip() for part in text.split(",") if part.strip()]
    if not ids or len(ids) > 12 or len(set(ids)) != len(ids) or any(not INST_ID.match(i) for i in ids):
        raise ValueError("--insts must be 1 to 12 distinct spot ids like BTC-USDT")
    return ids


class Collector:
    def __init__(self, client: OkxPublic, clock: Callable[[], float]) -> None:
        self._client = client
        self._clock = clock
        self._cache = TtlCache(clock)

    def _cached(self, key: str, ttl: int, fetch: Callable[[], Any]):
        return self._cache.get(key, ttl, fetch, error_code)

    def _candles(self, inst_id: str, bar: str):
        return self._cached(f"candles|{inst_id}|{bar}", TTL[f"candles.{bar}"], lambda: self._client.candles(inst_id, bar, LIMIT[bar]))

    def instrument_inputs(self, inst_id: str, tickers: Optional[dict[str, dict[str, Any]]], support: Optional[dict[str, set[str]]], btc_1h: Any, btc_reason: Optional[str]) -> dict[str, Any]:
        reasons: dict[str, str] = {}
        base, _, quote = inst_id.partition("-")
        ticker = (tickers or {}).get(inst_id)
        spread = None
        if ticker and ticker["bid"] and ticker["ask"] and ticker["ask"] >= ticker["bid"]:
            mid = (ticker["bid"] + ticker["ask"]) / 2
            spread = (ticker["ask"] - ticker["bid"]) / mid * 10_000
        if tickers is None:
            reasons["tickers"] = "fetch_failed"
        elif ticker is None:
            reasons["tickers"] = "unknown_instrument"

        candles: dict[str, Any] = {}
        for bar in ("5m", "15m", "1H", "4H"):
            result = self._candles(inst_id, bar)
            candles[bar] = result.value
            if result.value is None:
                reasons[f"candles.{bar}"] = result.error or "fetch_failed"

        inputs: dict[str, Any] = {
            "instId": inst_id,
            "last": ticker["last"] if ticker else None,
            "spreadBps": spread,
            "open24h": ticker["open24h"] if ticker else None,
            "candles": candles,
            "isReference": inst_id == REFERENCE,
            "btc": None,
            "funding": {"current": None, "history": None},
            "rubik": {"oi": None, "longShort": None, "taker": None},
            "reasons": reasons,
        }
        if inst_id != REFERENCE:
            btc_ticker = (tickers or {}).get(REFERENCE)
            inputs["btc"] = {"1H": btc_1h, "last": btc_ticker["last"] if btc_ticker else None, "open24h": btc_ticker["open24h"] if btc_ticker else None}
            if btc_1h is None:
                reasons["candles.btc.1H"] = btc_reason or "fetch_failed"

        if quote == "USDT":
            swap = f"{base}-USDT-SWAP"
            current = self._cached(f"funding|{swap}", TTL["funding.current"], lambda: self._client.funding_rate(swap))
            history = self._cached(f"funding-history|{swap}", TTL["funding.history"], lambda: self._client.funding_history(swap))
            inputs["funding"] = {"current": current.value, "history": history.value}
            failed = next((r for r in (current, history) if r.status == "missing"), None)
            if failed is not None:
                reasons["funding"] = failed.error or "fetch_failed"
            elif current.value is None or history.value is None:
                reasons["funding"] = "no_perpetual"
        else:
            reasons["funding"] = "quote_not_usdt"

        if support is None:
            for source in ("rubik.oi", "rubik.longShort", "rubik.taker"):
                reasons[source] = "support_list_unavailable"
        else:
            if base in support["contract"]:
                for source, fetch in (("oi", lambda: self._client.rubik_open_interest(base)), ("longShort", lambda: self._client.rubik_long_short(base))):
                    result = self._cached(f"rubik|{source}|{base}", TTL["rubik"], fetch)
                    inputs["rubik"][source] = result.value
                    if result.value is None:
                        reasons[f"rubik.{source}"] = result.error or "fetch_failed"
            else:
                reasons["rubik.oi"] = reasons["rubik.longShort"] = "unsupported_coin"
            if base in support["spot"]:
                result = self._cached(f"rubik|taker|{base}", TTL["rubik"], lambda: self._client.rubik_taker(base))
                inputs["rubik"]["taker"] = result.value
                if result.value is None:
                    reasons["rubik.taker"] = result.error or "fetch_failed"
            else:
                reasons["rubik.taker"] = "unsupported_coin"
        return inputs

    def cycle(self, inst_ids: list[str]) -> dict[str, Any]:
        tickers_result = self._cached("tickers|SPOT", TTL["tickers"], self._client.tickers_spot)
        support_result = self._cached("support-coin", TTL["support"], self._client.support_coins)
        btc = self._candles(REFERENCE, "1H")
        instruments: dict[str, Any] = {}
        for inst_id in inst_ids:
            inputs = self.instrument_inputs(inst_id, tickers_result.value, support_result.value, btc.value, btc.error)
            block = compute_features(inputs)
            c5 = closed(inputs["candles"].get("5m"))
            ticker = (tickers_result.value or {}).get(inst_id)
            as_of = max([x for x in (c5[-1]["ts"] if c5 else None, ticker["ts"] if ticker else None) if x is not None], default=None)
            instruments[inst_id] = {
                "instId": inst_id,
                "asOfMs": as_of,
                "completeness": block["completeness"],
                "features": block["features"],
                "unavailable": block["unavailable"],
            }
        return {
            "schemaVersion": PACK_SCHEMA_VERSION,
            "kind": PACK_KIND,
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "generatedAtMs": int(self._clock() * 1000),
            "source": "okx-public-v5",
            "budget": self._client.budget.snapshot(),
            "instruments": instruments,
        }
