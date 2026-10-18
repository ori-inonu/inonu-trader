import json
import subprocess
import sys
import unittest
from pathlib import Path

from jev_analytics import pack
from jev_analytics import smc

from .kit import walk

ROOT = Path(__file__).resolve().parents[2]
VECTORS = ROOT / "python" / "tests" / "vectors" / "smc-vectors.v1.json"


def bars_from_closes(closes, wick=0.5):
    """o = previous close, wicks of `wick` beyond the body. Easy to verify by hand."""
    o = [closes[0]] + list(closes[:-1])
    h = [max(a, b) + wick for a, b in zip(o, closes)]
    l = [min(a, b) - wick for a, b in zip(o, closes)]
    return o, h, l, list(closes)


def flat(count, price=100.0, half=0.5):
    return [(price, price + half, price - half, price)] * count


def columns(rows):
    return [r[0] for r in rows], [r[1] for r in rows], [r[2] for r in rows], [r[3] for r in rows]


def mirror(rows, axis=200.0):
    return [(axis - o, axis - l, axis - h, axis - c) for o, h, l, c in rows]


CLOSES = [10, 12, 11, 13, 12, 15, 14, 13, 11, 12, 9, 10]


class StructureTests(unittest.TestCase):
    def setUp(self):
        self.r = smc.analyze(*bars_from_closes(CLOSES), n=1)

    def test_pivots_are_confirmed_n_bars_later(self):
        got = [(s["kind"], s["index"], s["price"], s["confirmedAt"]) for s in self.r["swings"]]
        self.assertEqual(got, [("high", 1, 12.5, 2), ("high", 3, 13.5, 4), ("high", 5, 15.5, 6), ("low", 8, 10.5, 9), ("low", 10, 8.5, 11)])

    def test_breaks_are_bos_while_the_direction_holds_and_choch_when_it_flips(self):
        got = [(e["type"], e["dir"], e["index"], e["level"], e["swingIndex"]) for e in self.r["events"]]
        self.assertEqual(got, [("BOS", "up", 3, 12.5, 1), ("BOS", "up", 5, 13.5, 3), ("CHoCH", "down", 10, 10.5, 8)])
        self.assertEqual(self.r["trend"], "down")

    def test_a_supply_block_is_the_highest_bullish_bar_of_the_leg(self):
        self.assertEqual(self.r["orderBlocks"], [{"index": 5, "dir": "down", "low": 11.5, "high": 15.5, "formedAt": 10, "mitigatedAt": None}])

    def test_range_and_position_use_the_latest_pivots(self):
        self.assertEqual(self.r["range"], {"low": 8.5, "high": 15.5, "lowIndex": 10, "highIndex": 5})
        self.assertAlmostEqual(self.r["position"], (10 - 8.5) / 7.0, places=12)
        self.assertEqual(self.r["rangeState"], "inside")

    def test_price_outside_the_range_is_clamped_and_named(self):
        above = smc.analyze(*bars_from_closes(CLOSES), n=1, price=20.0)
        below = smc.analyze(*bars_from_closes(CLOSES), n=1, price=1.0)
        self.assertEqual((above["position"], above["rangeState"]), (1.0, "above"))
        self.assertEqual((below["position"], below["rangeState"]), (0.0, "below"))

    def test_a_close_through_the_block_mitigates_it_and_flips_into_a_demand_block(self):
        r = smc.analyze(*bars_from_closes(CLOSES + [16]), n=1)
        supply = [b for b in r["orderBlocks"] if b["dir"] == "down"][0]
        self.assertEqual(supply["mitigatedAt"], 12)
        self.assertEqual(r["events"][-1], {"index": 12, "type": "CHoCH", "dir": "up", "level": 15.5, "swingIndex": 5})
        demand = [b for b in r["orderBlocks"] if b["dir"] == "up"]
        self.assertEqual(demand, [{"index": 10, "dir": "up", "low": 8.5, "high": 12.5, "formedAt": 12, "mitigatedAt": None}])

    def test_a_wick_through_a_swing_does_not_break_it(self):
        o, h, l, c = bars_from_closes(CLOSES[:5])
        h = list(h)
        h[4] = 99.0
        r = smc.analyze(o, h, l, c, n=1)
        self.assertEqual([e["index"] for e in r["events"]], [3])

    def test_one_bar_never_produces_two_breaks(self):
        r = smc.analyze(*bars_from_closes(walk(300, 5, start=100.0, sigma=0.02)), n=2)
        indices = [e["index"] for e in r["events"]]
        self.assertEqual(len(indices), len(set(indices)))

    def test_ties_on_the_right_keep_the_first_bar(self):
        o, h, l, c = bars_from_closes([10, 12, 12, 11, 10, 9])
        r = smc.analyze(o, h, l, c, n=1)
        self.assertEqual([s["index"] for s in r["swings"] if s["kind"] == "high"], [1])


class NoRepaintTests(unittest.TestCase):
    def test_what_is_known_at_bar_k_never_changes_when_later_bars_arrive(self):
        series = bars_from_closes(walk(260, 11, start=100.0, sigma=0.01))
        full = smc.analyze(*series, n=3)
        for cut in (60, 111, 180, 259):
            part = smc.analyze(*[x[:cut] for x in series], n=3)
            self.assertEqual(part["swings"], [s for s in full["swings"] if s["confirmedAt"] < cut])
            self.assertEqual(part["events"], [e for e in full["events"] if e["index"] < cut])
            keep = lambda blocks: [(b["index"], b["dir"], b["low"], b["high"], b["formedAt"]) for b in blocks if b["formedAt"] < cut]
            self.assertEqual(keep(part["orderBlocks"]), keep(full["orderBlocks"]))


class GapTests(unittest.TestCase):
    base = flat(15) + [(100.0, 102.7, 99.9, 102.5), (102.5, 103.4, 101.8, 103.0)]

    def test_a_bullish_gap_is_the_space_between_the_first_high_and_the_third_low(self):
        r = smc.analyze(*columns(self.base + [(103.0, 103.2, 101.0, 102.0)]), n=3)
        self.assertEqual(len(r["fvgs"]), 1)
        g = r["fvgs"][0]
        self.assertEqual((g["index"], g["dir"], g["low"], g["high"], g["filledAt"]), (16, "up", 100.5, 101.8, None))
        self.assertAlmostEqual(g["fill"], (101.8 - 101.0) / 1.3, places=12)

    def test_a_gap_is_filled_when_the_low_reaches_its_far_edge(self):
        r = smc.analyze(*columns(self.base + [(103.0, 103.2, 101.0, 102.0), (102.0, 102.1, 100.0, 100.2)]), n=3)
        g = r["fvgs"][0]
        self.assertEqual((g["fill"], g["filledAt"]), (1.0, 18))

    def test_the_bearish_gap_is_the_mirror_image(self):
        rows = mirror(self.base + [(103.0, 103.2, 101.0, 102.0)])
        g = smc.analyze(*columns(rows), n=3)["fvgs"][0]
        self.assertEqual((g["index"], g["dir"]), (16, "down"))
        self.assertAlmostEqual(g["low"], 98.2, places=9)
        self.assertAlmostEqual(g["high"], 99.5, places=9)
        self.assertAlmostEqual(g["fill"], (101.0 - 101.0 + 0.8) / 1.3, places=9)

    def test_a_gap_smaller_than_a_tenth_of_the_atr_is_ignored(self):
        rows = flat(15) + [(100.0, 100.9, 99.9, 100.8), (100.8, 101.0, 100.52, 100.9)]
        self.assertEqual(smc.analyze(*columns(rows), n=3)["fvgs"], [])

    def test_no_atr_no_gaps(self):
        rows = flat(5) + [(100.0, 102.7, 99.9, 102.5), (102.5, 103.4, 101.8, 103.0)]
        self.assertEqual(smc.analyze(*columns(rows), n=1)["fvgs"], [])


class PoolTests(unittest.TestCase):
    prefix = flat(15) + [
        (100.0, 100.8, 100.0, 100.6),
        (100.6, 100.7, 100.1, 100.2),
        (100.2, 100.82, 100.1, 100.6),
        (100.6, 100.6, 100.0, 100.1),
    ]

    def test_two_highs_within_a_tenth_of_the_atr_form_one_pool_at_the_higher(self):
        r = smc.analyze(*columns(self.prefix), n=1)
        self.assertEqual(r["pools"], [{"kind": "eqh", "price": 100.82, "indices": [15, 17], "sweptAt": None, "takenAt": None}])

    def test_a_wick_above_that_closes_back_below_is_a_sweep(self):
        rows = self.prefix + [(100.1, 101.5, 100.0, 100.5)]
        pool = smc.analyze(*columns(rows), n=1)["pools"][0]
        self.assertEqual((pool["sweptAt"], pool["takenAt"]), (19, None))

    def test_a_close_above_the_level_consumes_the_pool_without_a_sweep(self):
        rows = self.prefix + [(100.1, 101.5, 100.0, 101.3)]
        pool = smc.analyze(*columns(rows), n=1)["pools"][0]
        self.assertEqual((pool["sweptAt"], pool["takenAt"]), (None, 19))

    def test_highs_farther_apart_than_the_tolerance_do_not_group(self):
        rows = list(self.prefix)
        rows[17] = (100.2, 101.4, 100.1, 100.6)
        self.assertEqual(smc.analyze(*columns(rows), n=1)["pools"], [])

    def test_equal_lows_mirror_equal_highs(self):
        pool = smc.analyze(*columns(mirror(self.prefix)), n=1)["pools"][0]
        self.assertEqual((pool["kind"], pool["indices"]), ("eql", [15, 17]))
        self.assertAlmostEqual(pool["price"], 200.0 - 100.82, places=9)


class EdgeTests(unittest.TestCase):
    def test_short_and_empty_series_have_nothing_and_no_position(self):
        for size in (0, 1, 2, 6):
            r = smc.analyze(*bars_from_closes([100.0 + i for i in range(size)]) if size else ([], [], [], []), n=3)
            self.assertEqual((r["swings"], r["events"], r["orderBlocks"], r["fvgs"], r["pools"], r["range"], r["position"], r["trend"]), ([], [], [], [], [], None, None, None))

    def test_bad_input_is_refused(self):
        with self.assertRaises(ValueError):
            smc.analyze([1.0], [1.0, 2.0], [1.0], [1.0], 3)
        with self.assertRaises(ValueError):
            smc.analyze([1.0], [1.0], [1.0], [1.0], 0)

    def test_the_result_is_plain_json_data(self):
        import json
        json.dumps(smc.analyze(*bars_from_closes(walk(200, 3, start=100.0, sigma=0.01)), n=3), allow_nan=False)


class SummaryTests(unittest.TestCase):
    def test_the_digest_measures_distances_from_the_price_to_active_zones(self):
        series = bars_from_closes(walk(300, 21, start=100.0, sigma=0.008))
        r = smc.analyze(*series, n=3)
        last = series[3][-1]
        s = smc.summarize(r, last)
        for key in ("demandBlockBps", "supplyBlockBps", "gapNearestBps", "poolAboveBps", "poolBelowBps"):
            self.assertTrue(s[key] is None or s[key] >= 0.0, key)
        self.assertEqual(s["gapsUp"] + s["gapsDown"], sum(1 for g in r["fvgs"] if g["fill"] < 1.0))
        if r["events"]:
            e = r["events"][-1]
            self.assertEqual(s["lastBreak"], {"kind": e["type"], "dir": e["dir"], "ageBars": 299 - e["index"]})
        self.assertIn(s["rangeState"], ("inside", "above", "below", None))

    def test_the_digest_of_nothing_is_all_unknown(self):
        s = smc.summarize(smc.analyze([], [], [], [], n=3), 100.0)
        self.assertEqual([k for k, v in s.items() if v not in (None, 0)], [])

    def test_the_digest_never_carries_a_verdict_key(self):
        s = smc.summarize(smc.analyze(*bars_from_closes(walk(300, 4, start=100.0, sigma=0.01)), n=3), 100.0)
        self.assertEqual(pack.FORBIDDEN_KEYS.intersection(pack._keys(s)), set())

    def test_block_distance_is_zero_when_the_price_sits_inside_the_zone(self):
        r = {"bars": 10, "orderBlocks": [{"index": 3, "dir": "up", "low": 99.0, "high": 101.0, "formedAt": 5, "mitigatedAt": None}], "fvgs": [], "pools": [], "events": [], "position": None, "rangeState": None}
        self.assertEqual(smc.summarize(r, 100.0)["demandBlockBps"], 0.0)
        self.assertEqual(smc.summarize(r, 103.0)["demandBlockBps"], round(2.0 / 103.0 * 10_000.0, 1))


class VectorFileTests(unittest.TestCase):
    def test_the_vector_copies_are_what_the_generator_emits(self):
        done = subprocess.run([sys.executable, str(ROOT / "python" / "tools" / "make_smc_vectors.py"), "--check"], capture_output=True, text=True, cwd=ROOT / "python")
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)

    def test_the_reference_replays_every_case(self):
        data = json.loads(VECTORS.read_text(encoding="utf8"))
        self.assertEqual(data["origin"], "synthetic_fixture")
        self.assertGreater(len(data["cases"]), 20)
        for case in data["cases"]:
            s = data["series"][case["series"]]
            got = smc.analyze(s["open"], s["high"], s["low"], s["close"], case["n"], case["price"])
            self.assertEqual(got, case["expected"], case["name"])


if __name__ == "__main__":
    unittest.main()
