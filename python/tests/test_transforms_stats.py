import math
import unittest

from jev_analytics import stats, structure, transforms


class HeikinAshiTests(unittest.TestCase):
    def test_hand_computed(self):
        out = transforms.heikin_ashi([10, 11], [12, 13], [9, 10], [11, 12])
        self.assertAlmostEqual(out[0]["close"], (10 + 12 + 9 + 11) / 4)
        self.assertAlmostEqual(out[0]["open"], (10 + 11) / 2)
        self.assertAlmostEqual(out[0]["high"], 12)
        self.assertAlmostEqual(out[1]["open"], (out[0]["open"] + out[0]["close"]) / 2)
        self.assertAlmostEqual(out[1]["close"], (11 + 13 + 10 + 12) / 4)
        self.assertGreaterEqual(out[1]["high"], max(out[1]["open"], out[1]["close"]))
        self.assertLessEqual(out[1]["low"], min(out[1]["open"], out[1]["close"]))


class NiceStepTests(unittest.TestCase):
    def test_nearest_in_log_scale(self):
        expected = {1.4: 1.0, 1.5: 2.0, 3.4: 2.5, 3.6: 5.0, 7.2: 10.0, 0.5: 0.5, 14.0: 10.0, 0.00071: 0.001}
        for value, want in expected.items():
            self.assertAlmostEqual(transforms.nice_step(value), want, msg=str(value))

    def test_rejects_non_positive(self):
        for bad in (0, -1, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                transforms.nice_step(bad)


class RenkoTests(unittest.TestCase):
    def test_up_bricks_then_a_reversal_that_opens_at_the_last_brick_open(self):
        bricks = transforms.renko([10, 10.4, 12, 12.1, 9.9], [1, 2, 3, 4, 5], 1.0)
        got = [(b["open"], b["close"], int(b["tsMs"])) for b in bricks]
        self.assertEqual(got, [(10.0, 11.0, 3), (11.0, 12.0, 3), (11.0, 10.0, 5)])
        self.assertEqual([b["dir"] for b in bricks], [1.0, 1.0, -1.0])

    def test_a_small_wiggle_makes_no_brick(self):
        self.assertEqual(transforms.renko([10, 10.9, 10.1, 10.5], [1, 2, 3, 4], 1.0), [])

    def test_down_first_then_up_reversal(self):
        bricks = transforms.renko([10, 8.5, 9.0, 11.2], [1, 2, 3, 4], 1.0)
        got = [(b["open"], b["close"]) for b in bricks]
        # ref=10: 8.5 gives down 10->9 ; 9.0 stays (needs <= 8 for another down, >= 11 for reversal);
        # 11.2 reverses up from the down brick open 10: 10->11
        self.assertEqual(got, [(10.0, 9.0), (10.0, 11.0)])

    def test_levels_are_exact_multiples_with_a_fractional_size(self):
        bricks = transforms.renko([1.0, 1.35, 1.6], [1, 2, 3], 0.1)
        for b in bricks:
            self.assertEqual(b["close"], round(b["close"] / 0.1) * 0.1)

    def test_run_length(self):
        bricks = transforms.renko([10, 12.5, 12.6, 9.9], [1, 2, 3, 4], 1.0)
        self.assertEqual(transforms.renko_run(bricks), -1)
        up = transforms.renko([10, 14], [1, 2], 1.0)
        self.assertEqual(transforms.renko_run(up), 4)
        self.assertEqual(transforms.renko_run([]), 0)

    def test_guards(self):
        with self.assertRaises(ValueError):
            transforms.renko([1.0], [1], 0)
        with self.assertRaises(ValueError):
            transforms.renko([1.0, 2.0], [1], 1.0)
        self.assertEqual(transforms.renko([], [], 1.0), [])


class StatsTests(unittest.TestCase):
    def test_log_returns(self):
        self.assertAlmostEqual(stats.log_returns([100, 110])[0], math.log(1.1))
        with self.assertRaises(ValueError):
            stats.log_returns([100, 0])

    def test_stdev_is_sample(self):
        self.assertAlmostEqual(stats.stdev([1, 2, 3, 4, 5]), math.sqrt(2.5))

    def test_zscore_and_constant_history(self):
        self.assertAlmostEqual(stats.zscore(6, [1, 2, 3, 4, 5]), (6 - 3) / math.sqrt(2.5))
        self.assertIsNone(stats.zscore(1, [2, 2, 2]))

    def test_rank_is_inclusive_share(self):
        self.assertAlmostEqual(stats.rank(3, [1, 2, 3, 4]), 0.75)
        self.assertAlmostEqual(stats.rank(0, [1, 2]), 0.0)

    def test_corr_and_beta(self):
        a = [1.0, 2.0, 3.0, 4.0, 5.5]
        self.assertAlmostEqual(stats.corr(a, a), 1.0)
        self.assertAlmostEqual(stats.corr(a, [-v for v in a]), -1.0)
        self.assertAlmostEqual(stats.beta([2 * v for v in a], a), 2.0)
        self.assertIsNone(stats.corr(a, [1.0] * 5))
        self.assertIsNone(stats.beta(a, [1.0] * 5))

    def test_efficiency_ratio(self):
        self.assertAlmostEqual(stats.efficiency_ratio([1, 2, 3, 4, 5], 4), 1.0)
        self.assertAlmostEqual(stats.efficiency_ratio([1, 2, 1, 2, 1], 4), 0.0)
        self.assertIsNone(stats.efficiency_ratio([3, 3, 3, 3, 3], 4))

    def test_rolling_stdev(self):
        out = stats.rolling_stdev([1, 2, 3, 4], 2)
        self.assertEqual(len(out), 3)
        self.assertAlmostEqual(out[0], math.sqrt(0.5))


class StructureTests(unittest.TestCase):
    def test_strict_pivots_and_edges(self):
        h = [1, 2, 3, 9, 3, 2, 1, 2, 3]
        l = [0, 1, 2, 8, 2, 1, 0, 1, 2]
        found = structure.pivots(h, l, 2)
        highs = [(int(p["index"]), p["price"]) for p in found if p["kind"] > 0]
        lows = [(int(p["index"]), p["price"]) for p in found if p["kind"] < 0]
        self.assertEqual(highs, [(3, 9)])
        self.assertEqual(lows, [(6, 0)])

    def test_a_flat_top_yields_exactly_one_pivot_at_its_first_bar(self):
        found = structure.pivots([1, 3, 3, 1, 0], [9, 9, 9, 9, 9], 1)
        self.assertEqual([(int(p["index"]), p["price"], p["kind"]) for p in found if p["kind"] > 0], [(1, 3, 1.0)])

    def test_a_tie_on_the_left_is_not_a_pivot(self):
        self.assertEqual([p for p in structure.pivots([3, 3, 1, 0, 0], [9] * 5, 1) if p["kind"] > 0], [])

    def test_newest_bars_are_never_pivots(self):
        h = [1, 2, 3, 4, 5, 6, 7]
        self.assertEqual([p for p in structure.pivots(h, [0] * 7, 3) if p["kind"] > 0], [])

    def test_cluster_levels(self):
        levels = structure.cluster_levels([100.0, 100.4, 100.45, 105.0, 110.0, 110.2], 0.5)
        self.assertEqual([round(v["px"], 4) for v in levels], [100.2833, 105.0, 110.1])
        self.assertEqual([v["touches"] for v in levels], [3.0, 1.0, 2.0])

    def test_cluster_span_is_measured_from_the_group_start(self):
        levels = structure.cluster_levels([100.0, 100.4, 100.8], 0.5)
        self.assertEqual([v["touches"] for v in levels], [2.0, 1.0])

    def test_empty(self):
        self.assertEqual(structure.cluster_levels([], 1.0), [])


if __name__ == "__main__":
    unittest.main()
