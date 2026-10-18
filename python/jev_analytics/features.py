"""Turns raw series into the compact feature block of one instrument. Pure: no clock, no network, no files.

The block describes the market. It never carries an action, a vote or a signal; every field is a measurement or a
closed vocabulary state. All candle features use CLOSED bars only; values relative to price use the ticker `last`.
A section that cannot be computed is None and the reason is recorded in `unavailable`: nothing is ever filled in.
"""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence

from . import indicators as ind
from . import smc, stats, structure, transforms

ASSUMED_ROUND_TRIP_FEE_BPS = 20.0
ADX_TREND_MIN = 25.0
OI_DEADBAND_PCT = 0.10
PRICE_DEADBAND_BPS = 5.0
SECTIONS = ("trend", "momentum", "volatility", "structure", "derivatives", "crossAsset", "cost")
# The leaf fields counted by `completeness`. Support and resistance are left out on purpose: no level on one side of
# the price is a legitimate answer, not a missing input.
SECTION_FIELDS = {
    "trend": ("regime", "adx15m", "efficiency15m", "emaStack15m", "emaStack1h", "emaStack4h", "extensionAtr15m"),
    "momentum": ("rsi5m", "rsi15m", "rsi1h", "macdHistAtr15m"),
    "volatility": ("atrBps15m", "atrBps1h", "volRank24h", "bbWidthRank15m", "bbPercentB15m", "expectedAbsMove5mBps"),
    "structure": ("donchianPos1h", "renkoRun15m"),
    "derivatives": ("fundingZ", "fundingPctile", "oiChange1hPct", "oiPriceRegime", "longShortRatio", "longShortZ", "takerBuyShare1h"),
    "crossAsset": ("corrBtc48h", "betaBtc48h", "relStrengthVsBtc24hBps"),
    "cost": ("assumedRoundTripFeeBps", "spreadBps", "moveToCost"),
}

Candles = Sequence[dict[str, Any]]
Section = tuple[Optional[dict[str, Any]], Optional[str]]


def _sig(value: float, digits: int = 8) -> float:
    return float(f"{value:.{digits}g}")


def _r(value: float, places: int) -> float:
    return round(value, places)


def closed(candles: Optional[Candles]) -> list[dict[str, Any]]:
    return [c for c in (candles or []) if c.get("confirmed")]


def _cols(candles: Sequence[dict[str, Any]]) -> tuple[list[float], list[float], list[float]]:
    return [c["high"] for c in candles], [c["low"] for c in candles], [c["close"] for c in candles]


def _last(series: Sequence[Optional[float]]) -> Optional[float]:
    return series[-1] if series else None


def ema_stack(closes: Sequence[float]) -> int:
    """+1 when close > EMA20 > EMA50, -1 when close < EMA20 < EMA50, else 0. Descriptive, not a vote."""
    e20, e50 = _last(ind.ema(closes, 20)), _last(ind.ema(closes, 50))
    if e20 is None or e50 is None:
        raise ValueError("series too short")
    if closes[-1] > e20 > e50:
        return 1
    if closes[-1] < e20 < e50:
        return -1
    return 0


def trend_section(c15: Candles, c1h: Candles, c4h: Candles, last: Optional[float]) -> Section:
    if last is None:
        return None, "ticker_missing"
    if len(c15) < 120:
        return None, "candles_short_15m"
    if len(c1h) < 60:
        return None, "candles_short_1h"
    if len(c4h) < 60:
        return None, "candles_short_4h"
    h, l, c = _cols(c15)
    a = ind.adx(h, l, c, 14)
    adx_v, pdi, mdi = _last(a["adx"]), _last(a["plusDi"]), _last(a["minusDi"])
    atr_v = _last(ind.atr(h, l, c, 14))
    efficiency = stats.efficiency_ratio(c, 20)
    e50 = _last(ind.ema(c, 50))
    if None in (adx_v, pdi, mdi, atr_v, e50) or efficiency is None or atr_v == 0:
        return None, "flat_series"
    if adx_v >= ADX_TREND_MIN and pdi > mdi:  # type: ignore[operator]
        regime = "up"
    elif adx_v >= ADX_TREND_MIN and mdi > pdi:  # type: ignore[operator]
        regime = "down"
    else:
        regime = "range"
    return {
        "regime": regime,
        "adx15m": _r(adx_v, 2),  # type: ignore[arg-type]
        "efficiency15m": _r(efficiency, 3),
        "emaStack15m": ema_stack(c),
        "emaStack1h": ema_stack([x["close"] for x in c1h]),
        "emaStack4h": ema_stack([x["close"] for x in c4h]),
        "extensionAtr15m": _r((last - e50) / atr_v, 2),  # type: ignore[operator]
    }, None


def momentum_section(c5: Candles, c15: Candles, c1h: Candles) -> Section:
    if len(c5) < 30:
        return None, "candles_short_5m"
    if len(c15) < 60:
        return None, "candles_short_15m"
    if len(c1h) < 30:
        return None, "candles_short_1h"
    h, l, c = _cols(c15)
    atr_v = _last(ind.atr(h, l, c, 14))
    hist = _last(ind.macd(c, 12, 26, 9)["hist"])
    rsis = [_last(ind.rsi([x["close"] for x in series], 14)) for series in (c5, c15, c1h)]
    if None in rsis or hist is None or not atr_v:
        return None, "flat_series"
    return {
        "rsi5m": _r(rsis[0], 1),  # type: ignore[arg-type]
        "rsi15m": _r(rsis[1], 1),  # type: ignore[arg-type]
        "rsi1h": _r(rsis[2], 1),  # type: ignore[arg-type]
        "macdHistAtr15m": _r(hist / atr_v, 3),
    }, None


def volatility_section(c5: Candles, c15: Candles, c1h: Candles) -> Section:
    if len(c5) < 60:
        return None, "candles_short_5m"
    if len(c15) < 120:
        return None, "candles_short_15m"
    if len(c1h) < 30:
        return None, "candles_short_1h"
    h15, l15, cl15 = _cols(c15)
    h1, l1, cl1 = _cols(c1h)
    atr15, atr1 = _last(ind.atr(h15, l15, cl15, 14)), _last(ind.atr(h1, l1, cl1, 14))
    closes5 = [x["close"] for x in c5][-289:]
    returns5 = stats.log_returns(closes5)
    windows = stats.rolling_stdev(returns5, 12)
    if len(windows) < 40:
        return None, "candles_short_5m"
    bb = ind.bollinger(cl15, 20, 2.0)
    widths = [w for w in bb["width"] if w is not None][-100:]
    pct_b = _last(bb["percentB"])
    if len(widths) < 40 or pct_b is None or atr15 is None or atr1 is None:
        return None, "flat_series"
    expected = stats.stdev(returns5[-48:]) * 10_000 * math.sqrt(2 / math.pi)
    return {
        "atrBps15m": _r(atr15 / cl15[-1] * 10_000, 1),
        "atrBps1h": _r(atr1 / cl1[-1] * 10_000, 1),
        "volRank24h": _r(stats.rank(windows[-1], windows), 3),
        "bbWidthRank15m": _r(stats.rank(widths[-1], widths), 3),
        "bbPercentB15m": _r(pct_b, 3),
        "expectedAbsMove5mBps": _r(expected, 2),
    }, None


def _levels(candles: Candles, tf: str) -> list[dict[str, Any]]:
    h, l, c = _cols(candles)
    atr_v = _last(ind.atr(h, l, c, 14))
    if not atr_v:
        return []
    prices = [p["price"] for p in structure.pivots(h, l, 3)]
    return [{"px": lv["px"], "touches": int(lv["touches"]), "tf": tf} for lv in structure.cluster_levels(prices, 0.5 * atr_v)]


SMC_MIN_BARS = 40
SMC_PIVOT_STRENGTH = 3


def _smc_digest(candles: Candles, last: float) -> Optional[dict[str, Any]]:
    if len(candles) < SMC_MIN_BARS or not last > 0:
        return None
    o, h, l, c = ([x[k] for x in candles] for k in ("open", "high", "low", "close"))
    return smc.summarize(smc.analyze(o, h, l, c, SMC_PIVOT_STRENGTH, last), last)


def structure_section(c15: Candles, c1h: Candles, last: Optional[float]) -> Section:
    if last is None:
        return None, "ticker_missing"
    if len(c15) < 120:
        return None, "candles_short_15m"
    if len(c1h) < 30:
        return None, "candles_short_1h"
    window = c1h[-24:]
    hi, lo = max(x["high"] for x in window), min(x["low"] for x in window)
    if not hi > lo:
        return None, "flat_series"
    levels = _levels(c15, "15m") + _levels(c1h, "1h")
    supports = sorted((lv for lv in levels if lv["px"] < last), key=lambda lv: last - lv["px"])[:3]
    resistances = sorted((lv for lv in levels if lv["px"] > last), key=lambda lv: lv["px"] - last)[:3]
    h, l, c = _cols(c15)
    atr_v = _last(ind.atr(h, l, c, 14))
    if not atr_v:
        return None, "flat_series"
    try:
        bricks = transforms.renko(c, [x["ts"] for x in c15], transforms.nice_step(atr_v))
    except ValueError:
        return None, "renko_unavailable"
    out_levels = [
        {"px": _sig(lv["px"]), "kind": kind, "touches": lv["touches"], "tf": lv["tf"]}
        for kind, group in (("support", supports), ("resistance", resistances))
        for lv in group
    ]
    return {
        "donchianPos1h": _r((last - lo) / (hi - lo), 3),
        "supportBps": _r((last - supports[0]["px"]) / last * 10_000, 1) if supports else None,
        "supportTouches": supports[0]["touches"] if supports else None,
        "resistanceBps": _r((resistances[0]["px"] - last) / last * 10_000, 1) if resistances else None,
        "resistanceTouches": resistances[0]["touches"] if resistances else None,
        "renkoRun15m": transforms.renko_run(bricks),
        "levels": out_levels,
        "smc15m": _smc_digest(c15, last),
        "smc1h": _smc_digest(c1h, last),
    }, None


def derivatives_fields(
    funding_current: Optional[float],
    funding_history: Optional[Sequence[float]],
    oi: Optional[Sequence[tuple[int, float, float]]],
    long_short: Optional[Sequence[tuple[int, float]]],
    taker: Optional[Sequence[tuple[int, float, float]]],
    closes5: Sequence[float],
) -> tuple[dict[str, Any], dict[str, str]]:
    """Returns every field (None when it cannot be computed) and a reason per None field."""
    out: dict[str, Any] = {k: None for k in ("fundingZ", "fundingPctile", "oiChange1hPct", "oiPriceRegime", "longShortRatio", "longShortZ", "takerBuyShare1h")}
    why: dict[str, str] = {}

    if funding_current is None or funding_history is None:
        for key in ("fundingZ", "fundingPctile"):
            why[key] = "no_funding"
    elif len(funding_history) < 20:
        for key in ("fundingZ", "fundingPctile"):
            why[key] = "funding_history_short"
    else:
        hist = list(funding_history)[-90:]
        z = stats.zscore(funding_current, hist)
        if z is None:
            why["fundingZ"] = "flat_series"
        else:
            out["fundingZ"] = _r(z, 2)
        out["fundingPctile"] = _r(stats.rank(funding_current, hist), 3)

    if oi is None:
        why["oiChange1hPct"] = why["oiPriceRegime"] = "no_open_interest"
    elif len(oi) < 13 or oi[-13][1] <= 0:
        why["oiChange1hPct"] = why["oiPriceRegime"] = "open_interest_short"
    else:
        change = (oi[-1][1] / oi[-13][1] - 1.0) * 100.0
        out["oiChange1hPct"] = _r(change, 3)
        if len(closes5) < 13:
            why["oiPriceRegime"] = "candles_short_5m"
        else:
            price_bps = (closes5[-1] / closes5[-13] - 1.0) * 10_000
            up_oi, down_oi = change >= OI_DEADBAND_PCT, change <= -OI_DEADBAND_PCT
            up_px, down_px = price_bps >= PRICE_DEADBAND_BPS, price_bps <= -PRICE_DEADBAND_BPS
            if up_oi and up_px:
                out["oiPriceRegime"] = "long_buildup"
            elif up_oi and down_px:
                out["oiPriceRegime"] = "short_buildup"
            elif down_oi and up_px:
                out["oiPriceRegime"] = "short_covering"
            elif down_oi and down_px:
                out["oiPriceRegime"] = "long_unwind"
            else:
                out["oiPriceRegime"] = "mixed"

    if long_short is None:
        why["longShortRatio"] = why["longShortZ"] = "no_long_short"
    elif len(long_short) < 30:
        why["longShortRatio"] = why["longShortZ"] = "long_short_short"
    else:
        series = [r for _, r in long_short][-288:]
        out["longShortRatio"] = _r(series[-1], 3)
        z = stats.zscore(series[-1], series)
        if z is None:
            why["longShortZ"] = "flat_series"
        else:
            out["longShortZ"] = _r(z, 2)

    if taker is None:
        why["takerBuyShare1h"] = "no_taker_volume"
    elif len(taker) < 12:
        why["takerBuyShare1h"] = "taker_volume_short"
    else:
        window = taker[-12:]
        total = math.fsum(sell + buy for _, sell, buy in window)
        if total > 0:
            out["takerBuyShare1h"] = _r(math.fsum(buy for _, _, buy in window) / total, 3)
        else:
            why["takerBuyShare1h"] = "no_taker_volume"
    return out, why


def cross_asset_section(c1h: Candles, btc_1h: Optional[Candles], last: Optional[float], open24h: Optional[float], btc_last: Optional[float], btc_open24h: Optional[float]) -> Section:
    if btc_1h is None:
        return None, "btc_candles_missing"
    if last is None or open24h is None or btc_last is None or btc_open24h is None:
        return None, "ticker_missing"
    mine = {x["ts"]: x["close"] for x in c1h}
    ref = {x["ts"]: x["close"] for x in btc_1h}
    common = sorted(set(mine) & set(ref))[-49:]
    if len(common) < 49 or any(common[i] - common[i - 1] != 3_600_000 for i in range(1, len(common))):
        return None, "misaligned_or_short"
    r_a = stats.log_returns([mine[t] for t in common])
    r_b = stats.log_returns([ref[t] for t in common])
    rho, b = stats.corr(r_a, r_b), stats.beta(r_a, r_b)
    if rho is None or b is None:
        return None, "flat_series"
    rel = ((last / open24h - 1.0) - (btc_last / btc_open24h - 1.0)) * 10_000
    return {"corrBtc48h": _r(rho, 3), "betaBtc48h": _r(b, 3), "relStrengthVsBtc24hBps": _r(rel, 1)}, None


def cost_section(spread_bps: Optional[float], expected_move_bps: Optional[float]) -> Section:
    if spread_bps is None:
        return None, "spread_missing"
    if expected_move_bps is None:
        return None, "volatility_unavailable"
    return {
        "assumedRoundTripFeeBps": ASSUMED_ROUND_TRIP_FEE_BPS,
        "spreadBps": _r(spread_bps, 2),
        "moveToCost": _r(expected_move_bps / (ASSUMED_ROUND_TRIP_FEE_BPS + spread_bps), 3),
    }, None


def compute_features(inputs: dict[str, Any]) -> dict[str, Any]:
    """inputs keys: last, spreadBps, open24h, candles{5m,15m,1H,4H}, isReference, btc{1H,last,open24h},
    funding{current,history}, rubik{oi,longShort,taker}, reasons{source: code} from the collector."""
    candles = inputs.get("candles") or {}
    c5, c15, c1h, c4h = (closed(candles.get(k)) for k in ("5m", "15m", "1H", "4H"))
    last = inputs.get("last")
    reasons: dict[str, str] = dict(inputs.get("reasons") or {})
    unavailable: dict[str, str] = {}
    features: dict[str, Any] = {name: None for name in SECTIONS}

    def take(name: str, result: Section, upstream: Optional[str] = None) -> None:
        section, reason = result
        features[name] = section
        if section is None:
            unavailable[name] = upstream or reason or "unavailable"

    def need(*sources: str) -> Optional[str]:
        for source in sources:
            if source in reasons:
                return reasons[source]
        return None

    take("trend", trend_section(c15, c1h, c4h, last), need("candles.15m", "candles.1H", "candles.4H"))
    take("momentum", momentum_section(c5, c15, c1h), need("candles.5m", "candles.15m", "candles.1H"))
    take("volatility", volatility_section(c5, c15, c1h), need("candles.5m", "candles.15m", "candles.1H"))
    take("structure", structure_section(c15, c1h, last), need("candles.15m", "candles.1H"))

    funding = inputs.get("funding") or {}
    rubik = inputs.get("rubik") or {}
    fields, why = derivatives_fields(
        funding.get("current"), funding.get("history"), rubik.get("oi"), rubik.get("longShort"), rubik.get("taker"), [x["close"] for x in c5]
    )
    for key, reason in why.items():
        source = {"fundingZ": "funding", "fundingPctile": "funding", "oiChange1hPct": "rubik.oi", "oiPriceRegime": "rubik.oi", "longShortRatio": "rubik.longShort", "longShortZ": "rubik.longShort", "takerBuyShare1h": "rubik.taker"}[key]
        why[key] = reasons.get(source, reason)
    if all(v is None for v in fields.values()):
        features["derivatives"] = None
        unavailable["derivatives"] = next(iter(why.values()), "unavailable")
    else:
        features["derivatives"] = fields
        for key, reason in why.items():
            unavailable[f"derivatives.{key}"] = reason

    if inputs.get("isReference"):
        unavailable["crossAsset"] = "is_reference"
    else:
        btc = inputs.get("btc") or {}
        btc_1h = closed(btc.get("1H")) if btc.get("1H") is not None else None
        take("crossAsset", cross_asset_section(c1h, btc_1h, last, inputs.get("open24h"), btc.get("last"), btc.get("open24h")), need("candles.1H", "candles.btc.1H"))

    volatility = features["volatility"]
    take("cost", cost_section(inputs.get("spreadBps"), volatility["expectedAbsMove5mBps"] if volatility else None))
    unavailable["onchain"] = "no_credentials"
    features["onchain"] = None

    expected = [n for n in SECTIONS if not (n == "crossAsset" and inputs.get("isReference"))]
    total = sum(len(SECTION_FIELDS[n]) for n in expected)
    known = sum(1 for n in expected if features[n] is not None for f in SECTION_FIELDS[n] if features[n][f] is not None)
    return {"features": features, "unavailable": unavailable, "completeness": _r(known / total, 3)}
