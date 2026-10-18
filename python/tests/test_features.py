import copy
import math
import random
import unittest

from jev_analytics import features as F
from jev_analytics import pack as P

from .kit import STEP_MS, T0, candles_from_closes, full_inputs, uptrend, walk


def trending(direction: int) -> dict:
    inputs = full_inputs(seed=3)
    sign = 1 if direction > 0 else -1
    base = 400.0 if direction < 0 else 100.0
    series = [base + sign * 0.35 * i + 0.4 * math.sin(i / 2.0) for i in range(300)]
    inputs["candles"]["15m"] = candles_from_closes(series, STEP_MS["15m"])
    inputs["candles"]["1H"] = candles_from_closes(series[:200], STEP_MS["1H"])
    inputs["candles"]["4H"] = candles_from_closes(series[:120], STEP_MS["4H"])
    inputs["last"] = series[-1]
    return inputs


class TrendTests(unittest.TestCase):
    def test_a_clean_uptrend_reads_up_with_a_bullish_stack_and_positive_extension(self):
        block = F.compute_features(trending(+1))["features"]["trend"]
        self.assertEqual(block["regime"], "up")
        self.assertEqual((block["emaStack15m"], block["emaStack1h"], block["emaStack4h"]), (1, 1, 1))
        self.assertGreaterEqual(block["adx15m"], 25)
        self.assertGreater(block["efficiency15m"], 0.8)
        self.assertGreater(block["extensionAtr15m"], 0)

    def test_a_clean_downtrend_reads_down_with_a_bearish_stack(self):
        block = F.compute_features(trending(-1))["features"]["trend"]
        self.assertEqual(block["regime"], "down")
        self.assertEqual((block["emaStack15m"], block["emaStack1h"], block["emaStack4h"]), (-1, -1, -1))
        self.assertLess(block["extensionAtr15m"], 0)

    def test_an_alternating_series_is_a_range(self):
        inputs = full_inputs(seed=4)
        rng = random.Random(4)
        flat = [100.0 + rng.gauss(0.0, 0.5) for _ in range(300)]
        inputs["candles"]["15m"] = candles_from_closes(flat, STEP_MS["15m"])
        inputs["last"] = 100.0
        block = F.compute_features(inputs)["features"]["trend"]
        self.assertEqual(block["regime"], "range")
        self.assertLess(block["adx15m"], 25)
        self.assertLess(block["efficiency15m"], 0.1)

    def test_emastack_is_zero_when_the_order_is_mixed(self):
        closes = uptrend(80) + [uptrend(80)[-1] - 15.0]
        self.assertEqual(F.ema_stack(closes), 0)


class ClosedBarsAndAvailabilityTests(unittest.TestCase):
    def test_a_forming_bar_never_changes_a_feature(self):
        base = full_inputs(seed=5)
        with_forming = copy.deepcopy(base)
        for tf, step in STEP_MS.items():
            series = with_forming["candles"][tf]
            wild = candles_from_closes([series[-1]["close"] * 3.0], step, forming_last=True, start_ms=series[-1]["ts"] + step)
            series.extend(wild)
        self.assertEqual(F.compute_features(with_forming), F.compute_features(base))

    def test_short_series_name_the_missing_input_and_lower_completeness(self):
        inputs = full_inputs(seed=6)
        inputs["candles"]["15m"] = inputs["candles"]["15m"][:50]
        out = F.compute_features(inputs)
        self.assertIsNone(out["features"]["trend"])
        self.assertEqual(out["unavailable"]["trend"], "candles_short_15m")
        self.assertIsNone(out["features"]["volatility"])
        self.assertLess(out["completeness"], 1.0)

    def test_collector_reasons_win_over_local_guesses(self):
        inputs = full_inputs(seed=7)
        inputs["candles"]["15m"] = None
        inputs["reasons"] = {"candles.15m": "http_500"}
        out = F.compute_features(inputs)
        self.assertEqual(out["unavailable"]["trend"], "http_500")

    def test_without_a_ticker_price_relative_sections_are_unavailable_but_candle_sections_stay(self):
        inputs = full_inputs(seed=8)
        inputs["last"] = None
        out = F.compute_features(inputs)
        self.assertEqual(out["unavailable"]["trend"], "ticker_missing")
        self.assertEqual(out["unavailable"]["structure"], "ticker_missing")
        self.assertIsNotNone(out["features"]["momentum"])
        self.assertIsNotNone(out["features"]["volatility"])

    def test_onchain_is_always_null_with_a_reason(self):
        out = F.compute_features(full_inputs(seed=9))
        self.assertIsNone(out["features"]["onchain"])
        self.assertEqual(out["unavailable"]["onchain"], "no_credentials")

    def test_a_complete_input_is_complete(self):
        out = F.compute_features(full_inputs(seed=10))
        self.assertEqual(out["completeness"], 1.0)
        for name in F.SECTIONS:
            self.assertIsNotNone(out["features"][name], name)


class MomentumVolatilityTests(unittest.TestCase):
    def test_rsi_of_a_rising_series_is_high_and_in_range(self):
        out = F.compute_features(trending(+1))["features"]["momentum"]
        for key in ("rsi5m", "rsi15m", "rsi1h"):
            self.assertTrue(0 <= out[key] <= 100)
        self.assertGreater(out["rsi15m"], 70)

    def test_expected_move_matches_the_closed_form_for_an_alternating_series(self):
        inputs = full_inputs(seed=11)
        r = math.log(1.001)
        closes, price = [], 100.0
        for i in range(300):
            price *= math.exp(r if i % 2 else -r)
            closes.append(price)
        inputs["candles"]["5m"] = candles_from_closes(closes, STEP_MS["5m"])
        out = F.compute_features(inputs)["features"]
        # 48 returns of +-r around a mean of exactly 0 or +-r/48: use the sample formula on the real returns.
        returns = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - 47, len(closes))]
        m = sum(returns) / len(returns)
        sd = math.sqrt(sum((x - m) ** 2 for x in returns) / (len(returns) - 1))
        want = sd * 1e4 * math.sqrt(2 / math.pi)
        self.assertAlmostEqual(out["volatility"]["expectedAbsMove5mBps"], want, places=1)
        self.assertAlmostEqual(out["cost"]["moveToCost"], want / (F.ASSUMED_ROUND_TRIP_FEE_BPS + 1.5), places=2)
        self.assertEqual(out["cost"]["assumedRoundTripFeeBps"], 20.0)

    def test_ranks_are_shares_between_zero_and_one(self):
        v = F.compute_features(full_inputs(seed=12))["features"]["volatility"]
        self.assertTrue(0 < v["volRank24h"] <= 1)
        self.assertTrue(0 < v["bbWidthRank15m"] <= 1)
        self.assertGreater(v["atrBps15m"], 0)
        self.assertGreater(v["atrBps1h"], 0)

    def test_cost_needs_a_spread_and_a_volatility(self):
        inputs = full_inputs(seed=13)
        inputs["spreadBps"] = None
        self.assertEqual(F.compute_features(inputs)["unavailable"]["cost"], "spread_missing")


class StructureTests(unittest.TestCase):
    def wavy(self):
        inputs = full_inputs(seed=14)
        closes = [100.0 + 5.0 * math.sin(2 * math.pi * i / 40.0) for i in range(300)]
        inputs["candles"]["15m"] = candles_from_closes(closes, STEP_MS["15m"], wiggle=0.001)
        inputs["candles"]["1H"] = candles_from_closes(closes[:200], STEP_MS["1H"], wiggle=0.001)
        inputs["last"] = 101.0
        return inputs

    def test_levels_sit_on_the_correct_side_of_price_and_are_sorted_by_distance(self):
        block = F.compute_features(self.wavy())["features"]["structure"]
        supports = [lv for lv in block["levels"] if lv["kind"] == "support"]
        resistances = [lv for lv in block["levels"] if lv["kind"] == "resistance"]
        self.assertTrue(supports and resistances)
        self.assertLessEqual(len(supports), 3)
        self.assertLessEqual(len(resistances), 3)
        self.assertTrue(all(lv["px"] < 101.0 for lv in supports))
        self.assertTrue(all(lv["px"] > 101.0 for lv in resistances))
        self.assertEqual([lv["px"] for lv in supports], sorted((lv["px"] for lv in supports), reverse=True))
        self.assertAlmostEqual(block["supportBps"], (101.0 - supports[0]["px"]) / 101.0 * 1e4, delta=0.1)
        self.assertAlmostEqual(block["resistanceBps"], (resistances[0]["px"] - 101.0) / 101.0 * 1e4, delta=0.1)
        self.assertGreaterEqual(block["supportTouches"], 2)
        self.assertTrue({lv["tf"] for lv in block["levels"]} <= {"15m", "1h"})

    def test_donchian_position_is_where_price_sits_in_the_24_bar_range(self):
        inputs = full_inputs(seed=15)
        highs_lows = candles_from_closes([100.0] * 30, STEP_MS["1H"], wiggle=0.0)
        for i, c in enumerate(highs_lows[-24:]):
            c["high"], c["low"] = (110.0, 90.0) if i == 0 else (100.0, 100.0)
        inputs["candles"]["1H"] = highs_lows
        inputs["last"] = 95.0
        block = F.compute_features(inputs)["features"]["structure"]
        self.assertAlmostEqual(block["donchianPos1h"], 0.25, places=3)

    def test_renko_run_counts_the_trailing_bricks(self):
        block = F.compute_features(trending(+1))["features"]["structure"]
        self.assertGreater(block["renkoRun15m"], 3)
        down = F.compute_features(trending(-1))["features"]["structure"]
        self.assertLess(down["renkoRun15m"], -3)


class CrossAssetTests(unittest.TestCase):
    def test_a_scaled_copy_of_btc_has_corr_1_beta_1_and_zero_relative_strength(self):
        inputs = full_inputs(seed=16)
        btc = inputs["btc"]["1H"]
        inputs["candles"]["1H"] = [dict(c, open=c["open"] / 800, high=c["high"] / 800, low=c["low"] / 800, close=c["close"] / 800) for c in btc]
        inputs["last"], inputs["open24h"] = 81000.0 / 800, 80000.0 / 800
        block = F.compute_features(inputs)["features"]["crossAsset"]
        self.assertAlmostEqual(block["corrBtc48h"], 1.0, places=6)
        self.assertAlmostEqual(block["betaBtc48h"], 1.0, places=6)
        self.assertAlmostEqual(block["relStrengthVsBtc24hBps"], 0.0, places=1)

    def test_relative_strength_is_the_difference_of_24h_changes_in_bps(self):
        inputs = full_inputs(seed=17)
        inputs["last"], inputs["open24h"] = 110.0, 100.0  # +10 percent
        inputs["btc"]["last"], inputs["btc"]["open24h"] = 81000.0, 80000.0  # +1.25 percent
        block = F.compute_features(inputs)["features"]["crossAsset"]
        self.assertAlmostEqual(block["relStrengthVsBtc24hBps"], (0.10 - 0.0125) * 1e4, places=1)

    def test_the_reference_asset_has_no_cross_section_and_is_still_complete(self):
        out = F.compute_features(full_inputs(seed=18, reference=True))
        self.assertIsNone(out["features"]["crossAsset"])
        self.assertEqual(out["unavailable"]["crossAsset"], "is_reference")
        self.assertEqual(out["completeness"], 1.0)

    def test_misaligned_hours_are_refused(self):
        inputs = full_inputs(seed=19)
        inputs["btc"]["1H"] = candles_from_closes(walk(200, 5, start=80000.0), STEP_MS["1H"], start_ms=T0 + 1_800_000)
        out = F.compute_features(inputs)
        self.assertIsNone(out["features"]["crossAsset"])
        self.assertEqual(out["unavailable"]["crossAsset"], "misaligned_or_short")


class DerivativesTests(unittest.TestCase):
    CLOSES_UP = [100.0 + i * 0.1 for i in range(20)]
    CLOSES_DOWN = [100.0 - i * 0.1 for i in range(20)]

    def oi(self, pct):
        base = 1_000_000.0
        series = [(T0 + i * 300_000, base, 1.0) for i in range(12)] + [(T0 + 12 * 300_000, base * (1 + pct / 100), 1.0)]
        return series

    def test_the_four_quadrants_and_the_dead_band(self):
        cases = [
            (0.5, self.CLOSES_UP, "long_buildup"),
            (0.5, self.CLOSES_DOWN, "short_buildup"),
            (-0.5, self.CLOSES_UP, "short_covering"),
            (-0.5, self.CLOSES_DOWN, "long_unwind"),
            (0.05, self.CLOSES_UP, "mixed"),
            (0.5, [100.0] * 20, "mixed"),
        ]
        for pct, closes, want in cases:
            out, _ = F.derivatives_fields(None, None, self.oi(pct), None, None, closes)
            self.assertEqual(out["oiPriceRegime"], want, (pct, want))
            self.assertAlmostEqual(out["oiChange1hPct"], pct, places=3)

    def test_funding_z_and_percentile_against_a_hand_computed_case(self):
        history = [0.0001] * 10 + [0.0003] * 10
        out, why = F.derivatives_fields(0.0003, history, None, None, None, [])
        self.assertAlmostEqual(out["fundingZ"], math.sqrt(19 / 20), places=2)
        self.assertEqual(out["fundingPctile"], 1.0)
        self.assertNotIn("fundingZ", why)

    def test_a_short_funding_history_is_refused_with_a_reason(self):
        out, why = F.derivatives_fields(0.0003, [0.0001] * 19, None, None, None, [])
        self.assertIsNone(out["fundingZ"])
        self.assertEqual(why["fundingZ"], "funding_history_short")
        self.assertEqual(why["fundingPctile"], "funding_history_short")

    def test_taker_share_uses_the_last_twelve_samples(self):
        taker = [(i, 500.0, 0.0) for i in range(30)] + [(30 + i, 100.0, 120.0) for i in range(12)]
        out, _ = F.derivatives_fields(None, None, None, None, taker, [])
        self.assertAlmostEqual(out["takerBuyShare1h"], 120 / 220, places=3)

    def test_long_short_ratio_and_z(self):
        series = [(i, 1.0 + 0.01 * (i % 3)) for i in range(60)] + [(60, 1.5)]
        out, why = F.derivatives_fields(None, None, None, series, None, [])
        self.assertEqual(out["longShortRatio"], 1.5)
        self.assertGreater(out["longShortZ"], 3)
        flat, why = F.derivatives_fields(None, None, None, [(i, 1.2) for i in range(40)], None, [])
        self.assertIsNone(flat["longShortZ"])
        self.assertEqual(why["longShortZ"], "flat_series")

    def test_nothing_known_means_a_null_section_with_a_reason(self):
        inputs = full_inputs(seed=20)
        inputs["funding"] = {"current": None, "history": None}
        inputs["rubik"] = {"oi": None, "longShort": None, "taker": None}
        inputs["reasons"] = {"funding": "no_perpetual", "rubik.oi": "unsupported_coin", "rubik.longShort": "unsupported_coin", "rubik.taker": "unsupported_coin"}
        out = F.compute_features(inputs)
        self.assertIsNone(out["features"]["derivatives"])
        self.assertIn(out["unavailable"]["derivatives"], {"no_perpetual", "unsupported_coin"})

    def test_a_partial_section_keeps_what_is_known_and_explains_the_rest(self):
        inputs = full_inputs(seed=21)
        inputs["rubik"] = {"oi": None, "longShort": None, "taker": inputs["rubik"]["taker"]}
        inputs["reasons"] = {"rubik.oi": "unsupported_coin", "rubik.longShort": "unsupported_coin"}
        out = F.compute_features(inputs)
        self.assertIsNotNone(out["features"]["derivatives"]["takerBuyShare1h"])
        self.assertIsNone(out["features"]["derivatives"]["oiChange1hPct"])
        self.assertEqual(out["unavailable"]["derivatives.oiChange1hPct"], "unsupported_coin")
        # 4 of the 7 derivative fields are unknown, so completeness drops by exactly 4 of the 32 counted fields.
        self.assertEqual(sum(len(v) for v in F.SECTION_FIELDS.values()), 32)
        self.assertAlmostEqual(out["completeness"], 1 - 4 / 32, places=3)


class PureOutputTests(unittest.TestCase):
    def test_output_has_no_verdict_keys_and_only_finite_numbers(self):
        out = F.compute_features(full_inputs(seed=22))
        wrapped = {"schemaVersion": 1, "kind": "jev-analytics", "generatedAtMs": 1, "instruments": {"ETH-USDT": {"instId": "ETH-USDT", **out}}}
        self.assertEqual(P.validate_pack(wrapped), [])

    def test_inputs_are_not_mutated(self):
        inputs = full_inputs(seed=23)
        before = copy.deepcopy(inputs)
        F.compute_features(inputs)
        self.assertEqual(inputs, before)


if __name__ == "__main__":
    unittest.main()
