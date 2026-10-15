import json
import os
import tempfile
import unittest
from pathlib import Path

from jev_analytics import okx_public as okx
from jev_analytics import pack as P
from jev_analytics.cache import STALE_FACTOR, TtlCache

from .kit import FakeClock, envelope, okx_candle_rows, candles_from_closes, walk


def client(responder, clock=None):
    clock = clock or FakeClock()
    return okx.OkxPublic(fetch=responder, clock=clock, sleep=clock.sleep), clock


class CandleParsingTests(unittest.TestCase):
    def test_rows_are_reversed_to_oldest_first_and_flag_the_forming_bar(self):
        candles = candles_from_closes(walk(5, 1), 300_000, forming_last=True)
        c, _ = client(lambda url: envelope(okx_candle_rows(candles)))
        got = c.candles("BTC-USDT", "5m", 5)
        self.assertEqual([x["ts"] for x in got], [x["ts"] for x in candles])
        self.assertEqual([x["confirmed"] for x in got], [True] * 4 + [False])

    def test_a_malformed_row_is_a_schema_error_not_a_partial_result(self):
        rows = okx_candle_rows(candles_from_closes(walk(3, 2), 300_000))
        rows[1][4] = "abc"
        c, _ = client(lambda url: envelope(rows))
        with self.assertRaises(okx.OkxError) as ctx:
            c.candles("BTC-USDT", "5m", 3)
        self.assertEqual(ctx.exception.code, "schema")

    def test_an_inconsistent_candle_is_refused(self):
        rows = okx_candle_rows(candles_from_closes(walk(3, 3), 300_000))
        rows[0][2] = "0.0001"  # high below the close
        c, _ = client(lambda url: envelope(rows))
        with self.assertRaises(okx.OkxError):
            c.candles("BTC-USDT", "5m", 3)

    def test_unsupported_bar_and_limit_never_reach_the_network(self):
        calls = []
        c, _ = client(lambda url: calls.append(url) or envelope([]))
        for bad in (("BTC-USDT", "1m", 10), ("BTC-USDT", "5m", 0), ("BTC-USDT", "5m", 301)):
            with self.assertRaises(okx.OkxError):
                c.candles(*bad)
        self.assertEqual(calls, [])

    def test_api_errors_bad_json_and_envelope_shapes_become_codes(self):
        cases = [(envelope([], code="51001"), "api_51001"), (b"not json", "bad_json"), (b"[]", "schema"), (json.dumps({"code": "0", "data": {}}).encode(), "schema")]
        for body, want in cases:
            c, _ = client(lambda url, body=body: body)
            with self.assertRaises(okx.OkxError) as ctx:
                c.candles("BTC-USDT", "5m", 1)
            self.assertEqual(ctx.exception.code, want)

    def test_default_fetch_only_talks_to_the_okx_api_host(self):
        with self.assertRaises(okx.OkxError):
            okx.default_fetch("https://example.com/api/v5/market/candles")
        with self.assertRaises(okx.OkxError):
            okx.default_fetch("http://www.okx.com/api/v5/market/candles")


class OtherRoutesTests(unittest.TestCase):
    def test_tickers_skip_a_malformed_row_and_keep_the_rest(self):
        rows = [
            {"instId": "BTC-USDT", "last": "82945.1", "bidPx": "82945", "askPx": "82945.2", "open24h": "83000", "ts": "1791815337572"},
            {"instId": "BAD-USDT", "last": "oops", "ts": "1"},
            {"instId": "NOQ-USDT", "last": "1.5", "bidPx": "", "askPx": "", "open24h": "", "ts": "5"},
        ]
        c, _ = client(lambda url: envelope(rows))
        got = c.tickers_spot()
        self.assertEqual(sorted(got), ["BTC-USDT", "NOQ-USDT"])
        self.assertIsNone(got["NOQ-USDT"]["bid"])

    def test_funding_of_a_missing_perpetual_is_none_and_other_errors_propagate(self):
        c, _ = client(lambda url: envelope([], code="51001"))
        self.assertIsNone(c.funding_rate("XYZ-USDT-SWAP"))
        self.assertIsNone(c.funding_history("XYZ-USDT-SWAP"))
        c, _ = client(lambda url: envelope([], code="50011"))
        with self.assertRaises(okx.OkxError):
            c.funding_rate("BTC-USDT-SWAP")

    def test_funding_history_is_oldest_first_using_the_realized_rate(self):
        rows = [
            {"fundingTime": "300", "realizedRate": "0.0003", "fundingRate": "9"},
            {"fundingTime": "100", "realizedRate": "0.0001", "fundingRate": "9"},
            {"fundingTime": "200", "realizedRate": "", "fundingRate": "0.0002"},
        ]
        c, _ = client(lambda url: envelope(rows))
        self.assertEqual(c.funding_history("BTC-USDT-SWAP"), [0.0001, 0.0002, 0.0003])

    def test_taker_volume_keeps_the_api_order_ts_sell_buy(self):
        c, _ = client(lambda url: envelope([["200", "7", "9"], ["100", "5", "6"]]))
        self.assertEqual(c.rubik_taker("BTC"), [(100, 5.0, 6.0), (200, 7.0, 9.0)])

    def test_support_coins_accepts_the_live_object_and_the_documented_list(self):
        body = {"contract": ["BTC", "ETH"], "spot": ["BTC"], "option": ["BTC"]}
        for data in (body, [body]):
            c, _ = client(lambda url, data=data: envelope(data))
            self.assertEqual(c.support_coins(), {"contract": {"BTC", "ETH"}, "spot": {"BTC"}})
        c, _ = client(lambda url: envelope("nope"))
        with self.assertRaises(okx.OkxError):
            c.support_coins()


class LimiterAndBudgetTests(unittest.TestCase):
    def test_calls_are_spaced_per_group_and_counted_per_route(self):
        c, clock = client(lambda url: envelope([{"contract": [], "spot": []}]) if "support-coin" in url else envelope([]))
        c.support_coins()
        c.support_coins()
        self.assertEqual(len(clock.slept), 1)
        self.assertAlmostEqual(clock.slept[0], 0.5, places=6)
        c.tickers_spot()
        c.tickers_spot()
        self.assertAlmostEqual(clock.slept[1], 0.15, places=6)
        snap = c.budget.snapshot()
        self.assertEqual(snap["calls"], 4)
        self.assertEqual(snap["byEndpoint"], {"market/tickers": 2, "rubik/stat/trading-data/support-coin": 2})

    def test_the_budget_forgets_calls_older_than_the_window(self):
        c, clock = client(lambda url: envelope([]))
        c.tickers_spot()
        clock.advance(61)
        self.assertEqual(c.budget.snapshot()["calls"], 0)


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.cache = TtlCache(self.clock)
        self.calls = 0

    def good(self):
        self.calls += 1
        return {"n": self.calls}

    def bad(self):
        self.calls += 1
        raise okx.OkxError("http_500")

    def get(self, fetch, ttl=60):
        return self.cache.get("k", ttl, fetch, okx.error_code)

    def test_serves_from_cache_inside_the_ttl_and_refetches_after(self):
        self.assertEqual(self.get(self.good).status, "fetched")
        self.clock.advance(59)
        self.assertEqual(self.get(self.good).status, "fresh")
        self.assertEqual(self.calls, 1)
        self.clock.advance(2)
        self.assertEqual(self.get(self.good).value, {"n": 2})

    def test_a_failed_refresh_serves_the_old_value_until_twice_the_ttl(self):
        self.get(self.good)
        self.clock.advance(61)
        r = self.get(self.bad)
        self.assertEqual((r.status, r.value, r.error), ("stale", {"n": 1}, "http_500"))
        self.clock.advance(60 * STALE_FACTOR)
        r = self.get(self.bad)
        self.assertEqual((r.status, r.value), ("missing", None))

    def test_failures_back_off_instead_of_hammering(self):
        self.get(self.bad)
        self.assertEqual(self.calls, 1)
        self.clock.advance(4)
        self.get(self.bad)
        self.assertEqual(self.calls, 1)
        self.clock.advance(2)
        self.get(self.bad)
        self.assertEqual(self.calls, 2)
        self.clock.advance(9)
        self.get(self.bad)
        self.assertEqual(self.calls, 2)
        self.clock.advance(2)
        self.get(self.bad)
        self.assertEqual(self.calls, 3)

    def test_success_resets_the_backoff_and_none_is_a_valid_cached_value(self):
        self.get(self.bad)
        self.clock.advance(6)
        r = self.get(lambda: None)
        self.assertEqual((r.status, r.value), ("fetched", None))
        self.assertEqual(self.get(self.good).status, "fresh")

    def test_a_missing_value_reports_a_code(self):
        r = self.get(self.bad)
        self.assertEqual((r.status, r.value, r.error), ("missing", None, "http_500"))


def minimal_pack():
    return {
        "schemaVersion": 1, "kind": "jev-analytics", "generatedAtMs": 1_700_000_000_000,
        "instruments": {"BTC-USDT": {"instId": "BTC-USDT", "features": {"trend": None, "derivatives": None, "onchain": None}}},
    }


class PackTests(unittest.TestCase):
    def test_a_minimal_pack_is_valid(self):
        self.assertEqual(P.validate_pack(minimal_pack()), [])

    def test_verdict_keys_are_refused_at_any_depth(self):
        for key in ("action", "signal", "buy", "sell", "hold", "recommendation", "vote", "side"):
            pack = minimal_pack()
            pack["instruments"]["BTC-USDT"]["features"]["trend"] = {"deep": [{key: 1}]}
            self.assertTrue(any("forbidden" in p for p in P.validate_pack(pack)), key)

    def test_names_that_merely_contain_a_verdict_word_are_allowed(self):
        pack = minimal_pack()
        pack["instruments"]["BTC-USDT"]["features"]["structure"] = {"takerBuyShare1h": 0.5, "holdings": 1}
        self.assertEqual(P.validate_pack(pack), [])

    def test_non_finite_numbers_and_wrong_headers_are_refused(self):
        pack = minimal_pack()
        pack["instruments"]["BTC-USDT"]["features"]["trend"] = {"x": float("nan")}
        self.assertIn("non finite number", P.validate_pack(pack))
        pack = minimal_pack()
        pack["schemaVersion"] = 2
        self.assertIn("schema", P.validate_pack(pack))
        pack = minimal_pack()
        pack["instruments"]["BTC-USDT"]["features"]["onchain"] = {"x": 1}
        self.assertTrue(any("onchain" in p for p in P.validate_pack(pack)))

    def test_vocabulary_is_closed(self):
        pack = minimal_pack()
        pack["instruments"]["BTC-USDT"]["features"]["trend"] = {"regime": "moon"}
        self.assertTrue(any("regime" in p for p in P.validate_pack(pack)))
        pack = minimal_pack()
        pack["instruments"]["BTC-USDT"]["features"]["derivatives"] = {"oiPriceRegime": "buy_it"}
        self.assertTrue(any("oiPriceRegime" in p for p in P.validate_pack(pack)))

    def test_write_is_atomic_valid_json_without_leftovers_and_an_invalid_pack_never_clobbers(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "sub" / "latest.json"
            P.write_atomic(target, minimal_pack())
            self.assertEqual(json.loads(target.read_text(encoding="utf8"))["kind"], "jev-analytics")
            self.assertEqual(os.listdir(target.parent), ["latest.json"])
            before = target.read_text(encoding="utf8")
            bad = minimal_pack()
            bad["instruments"]["BTC-USDT"]["features"]["trend"] = {"action": 1}
            with self.assertRaises(ValueError):
                P.write_atomic(target, bad)
            self.assertEqual(target.read_text(encoding="utf8"), before)
            self.assertEqual(os.listdir(target.parent), ["latest.json"])


if __name__ == "__main__":
    unittest.main()
