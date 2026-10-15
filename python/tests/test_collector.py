import unittest

from jev_analytics import okx_public as okx
from jev_analytics import pack as P
from jev_analytics.collector import Collector, parse_inst_ids

from .kit import FakeClock, FakeOkx

def make(insts=("BTC-USDT", "ETH-USDT")):
    clock = FakeClock()
    fake = FakeOkx()
    collector = Collector(okx.OkxPublic(fetch=fake, clock=clock, sleep=clock.sleep), clock)
    return collector, fake, clock, list(insts)


class CycleTests(unittest.TestCase):
    def test_one_cycle_builds_a_valid_pack_with_complete_known_instruments(self):
        collector, fake, clock, insts = make()
        pack = collector.cycle(insts)
        self.assertEqual(P.validate_pack(pack), [])
        self.assertEqual(sorted(pack["instruments"]), ["BTC-USDT", "ETH-USDT"])
        self.assertEqual(pack["source"], "okx-public-v5")
        self.assertEqual(pack["generatedAtMs"], int(clock() * 1000))
        self.assertEqual(pack["instruments"]["BTC-USDT"]["completeness"], 1.0)
        self.assertEqual(pack["instruments"]["ETH-USDT"]["completeness"], 1.0)
        self.assertIsNone(pack["instruments"]["BTC-USDT"]["features"]["crossAsset"])
        self.assertIsNotNone(pack["instruments"]["ETH-USDT"]["features"]["crossAsset"])
        self.assertEqual(pack["budget"]["calls"], sum(fake.calls.values()))

    def test_the_first_cycle_makes_the_expected_number_of_calls(self):
        collector, fake, _, insts = make()
        collector.cycle(insts)
        self.assertEqual(fake.calls["market/tickers"], 1)
        self.assertEqual(fake.calls["rubik/stat/trading-data/support-coin"], 1)
        # BTC and ETH, four bars each; the BTC 1H reference is the same cache entry as BTC's own 1H.
        self.assertEqual(fake.calls["market/candles"], 8)
        self.assertEqual(fake.calls["public/funding-rate"], 2)
        self.assertEqual(fake.calls["public/funding-rate-history"], 2)
        self.assertEqual(fake.calls["rubik/stat/contracts/open-interest-volume"], 2)
        self.assertEqual(fake.calls["rubik/stat/taker-volume"], 2)

    def test_the_btc_reference_is_fetched_once_even_when_btc_is_not_requested(self):
        collector, fake, _, _ = make()
        collector.cycle(["ETH-USDT", "SOL-USDT", "MON-USDT"])
        btc_calls = [u for u in fake.urls if "market/candles" in u and "instId=BTC-USDT" in u]
        self.assertEqual(len(btc_calls), 1)

    def test_a_second_cycle_inside_every_ttl_makes_no_call_at_all(self):
        collector, fake, clock, insts = make()
        collector.cycle(insts)
        before = sum(fake.calls.values())
        clock.advance(5)
        collector.cycle(insts)
        self.assertEqual(sum(fake.calls.values()), before)

    def test_only_expired_sources_refresh(self):
        collector, fake, clock, insts = make()
        collector.cycle(insts)
        fake.calls.clear()
        clock.advance(61)
        collector.cycle(insts)
        self.assertEqual(fake.calls["market/tickers"], 1)
        self.assertEqual(fake.calls["market/candles"], 2)  # the two 5m series only (TTL 60 s)
        self.assertEqual(fake.calls["public/funding-rate"], 2)
        self.assertEqual(fake.calls["public/funding-rate-history"], 0)
        self.assertEqual(fake.calls["rubik/stat/taker-volume"], 0)
        fake.calls.clear()
        clock.advance(600)
        collector.cycle(insts)
        # 5m (refetched 600 s ago), 15m and 1H of both pairs (BTC 1H shared): 2 + 2 + 2; the 4H series are still fresh.
        self.assertEqual(fake.calls["market/candles"], 6)
        self.assertEqual(fake.calls["rubik/stat/taker-volume"], 2)
        self.assertEqual(fake.calls["rubik/stat/contracts/open-interest-volume"], 2)
        self.assertEqual(fake.calls["public/funding-rate-history"], 0)

    def test_per_minute_budget_stays_far_below_the_rate_limits_in_steady_state(self):
        collector, fake, clock, _ = make()
        insts = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "MON-USDT", "OKB-USDT"]
        collector.cycle(insts)
        clock.advance(1000)
        window_start = sum(fake.calls.values())
        for _ in range(10):
            clock.advance(30)
            collector.cycle(insts)
        per_minute = (sum(fake.calls.values()) - window_start) / (10 * 30 / 60)
        self.assertLess(per_minute, 40)

    def test_a_failing_source_serves_stale_then_becomes_unavailable_with_its_code(self):
        collector, fake, clock, insts = make(["ETH-USDT"])
        collector.cycle(insts)
        fake.fail["market/candles"] = "http_500"
        clock.advance(70)  # 5m expired, 15m not yet
        pack = collector.cycle(insts)
        self.assertIsNotNone(pack["instruments"]["ETH-USDT"]["features"]["momentum"])  # stale 5m is allowed (<= 2 x TTL)
        clock.advance(200)  # 5m beyond 2 x TTL; 15m beyond its TTL as well
        pack = collector.cycle(insts)
        entry = pack["instruments"]["ETH-USDT"]
        self.assertIsNone(entry["features"]["volatility"])
        self.assertEqual(entry["unavailable"]["volatility"], "http_500")
        self.assertLess(entry["completeness"], 1.0)

    def test_failures_back_off_between_cycles(self):
        collector, fake, clock, insts = make(["ETH-USDT"])
        fake.fail["market/candles"] = "http_500"
        collector.cycle(insts)
        first = fake.calls["market/candles"]
        clock.advance(2)
        collector.cycle(insts)
        self.assertEqual(fake.calls["market/candles"], first)

    def test_an_unsupported_coin_and_a_missing_perpetual_are_explained_not_zeroed(self):
        collector, fake, _, _ = make()
        fake.no_perp.add("MON-USDT-SWAP")
        pack = collector.cycle(["MON-USDT"])
        entry = pack["instruments"]["MON-USDT"]
        self.assertIsNone(entry["features"]["derivatives"])
        self.assertIn(entry["unavailable"]["derivatives"], {"no_perpetual", "unsupported_coin"})
        self.assertEqual(fake.calls["rubik/stat/contracts/open-interest-volume"], 0)
        self.assertEqual(fake.calls["rubik/stat/taker-volume"], 0)

    def test_a_non_usdt_pair_has_no_funding_section(self):
        collector, fake, _, _ = make()
        pack = collector.cycle(["ABC-EUR"])
        self.assertEqual(fake.calls["public/funding-rate"], 0)
        self.assertIsNone(pack["instruments"]["ABC-EUR"]["features"]["derivatives"])

    def test_without_the_support_list_rubik_is_not_called_and_says_why(self):
        collector, fake, _, _ = make()
        fake.fail["rubik/stat/trading-data/support-coin"] = "http_503"
        pack = collector.cycle(["ETH-USDT"])
        self.assertEqual(fake.calls["rubik/stat/taker-volume"], 0)
        why = pack["instruments"]["ETH-USDT"]["unavailable"]
        self.assertEqual(why["derivatives.takerBuyShare1h"], "support_list_unavailable")
        self.assertIsNotNone(pack["instruments"]["ETH-USDT"]["features"]["derivatives"]["fundingZ"])

    def test_calls_respect_the_group_spacing(self):
        collector, fake, clock, insts = make()
        collector.cycle(insts)
        self.assertTrue(clock.slept)
        self.assertTrue(all(s >= 0.0 for s in clock.slept))
        self.assertGreaterEqual(max(clock.slept), 0.15)

    def test_the_pack_has_no_verdict_and_no_credentials_anywhere(self):
        collector, fake, _, insts = make()
        text = str(collector.cycle(insts)).lower()
        for word in ("apikey", "secret", "passphrase", "authorization", "'action'", "'signal'"):
            self.assertNotIn(word, text)
        for url in fake.urls:
            self.assertTrue(url.startswith("https://www.okx.com/api/v5/"))


class InstArgumentTests(unittest.TestCase):
    def test_valid_and_invalid_lists(self):
        self.assertEqual(parse_inst_ids("BTC-USDT, ETH-USDT"), ["BTC-USDT", "ETH-USDT"])
        for bad in ("", "BTC", "BTC-USDT,BTC-USDT", "btc-usdt", "BTC-USDT-SWAP", ",".join(f"A{i}-USDT" for i in range(13))):
            with self.assertRaises(ValueError):
                parse_inst_ids(bad)


if __name__ == "__main__":
    unittest.main()
