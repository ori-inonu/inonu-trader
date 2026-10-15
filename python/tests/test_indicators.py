import math
import unittest

from jev_analytics import indicators as ind

# Wilder's RSI(14) worked example (closes and the published RSI values, two decimals).
RSI_CLOSES = [
    44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931,
    46.0328, 45.6140, 46.2820, 46.2820, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521,
    45.7137, 46.4515, 45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314,
]
RSI_PUBLISHED = [
    70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46,
    41.87, 45.46, 37.30, 33.08, 37.77,
]


class SmaEmaTests(unittest.TestCase):
    def test_sma_hand_computed(self):
        self.assertEqual(ind.sma([1, 2, 3, 4, 5], 3), [None, None, 2.0, 3.0, 4.0])

    def test_sma_short_input_is_all_none(self):
        self.assertEqual(ind.sma([1, 2], 3), [None, None])

    def test_ema_is_seeded_with_the_sma_and_then_recursive(self):
        out = ind.ema([1, 2, 3, 4, 5, 6], 3)
        self.assertEqual(out[:2], [None, None])
        self.assertAlmostEqual(out[2], 2.0)
        self.assertAlmostEqual(out[3], 0.5 * 4 + 0.5 * 2.0)
        self.assertAlmostEqual(out[5], 5.0)

    def test_ema_skips_leading_none(self):
        out = ind.ema([None, None, 1, 2, 3, 4], 2)
        self.assertEqual(out[:3], [None, None, None])
        self.assertAlmostEqual(out[3], 1.5)

    def test_period_must_be_positive(self):
        with self.assertRaises(ValueError):
            ind.sma([1, 2, 3], 0)


class RsiTests(unittest.TestCase):
    def test_matches_the_published_wilder_example(self):
        out = ind.rsi(RSI_CLOSES, 14)
        self.assertTrue(all(v is None for v in out[:14]))
        for got, want in zip(out[14:], RSI_PUBLISHED):
            self.assertAlmostEqual(got, want, delta=0.01)

    def test_all_gains_is_100_and_flat_is_50(self):
        self.assertEqual(ind.rsi(list(range(1, 20)), 14)[-1], 100.0)
        self.assertEqual(ind.rsi([5.0] * 20, 14)[-1], 50.0)

    def test_all_losses_is_0(self):
        self.assertAlmostEqual(ind.rsi(list(range(20, 1, -1)), 14)[-1], 0.0)


class MacdTests(unittest.TestCase):
    def test_line_signal_hist_start_where_the_windows_complete(self):
        x = [float(i % 7) + i * 0.1 for i in range(80)]
        out = ind.macd(x, 12, 26, 9)
        self.assertIsNone(out["macd"][24])
        self.assertIsNotNone(out["macd"][25])
        self.assertIsNone(out["signal"][32])
        self.assertIsNotNone(out["signal"][33])
        self.assertAlmostEqual(out["hist"][40], out["macd"][40] - out["signal"][40])

    def test_fast_must_be_shorter(self):
        with self.assertRaises(ValueError):
            ind.macd([1.0] * 50, 26, 12, 9)


class AtrBollingerTests(unittest.TestCase):
    def test_atr_constant_range(self):
        h = [11.0] * 30
        l = [9.0] * 30
        c = [10.0] * 30
        out = ind.atr(h, l, c, 14)
        self.assertIsNone(out[13])
        self.assertAlmostEqual(out[14], 2.0)
        self.assertAlmostEqual(out[29], 2.0)

    def test_atr_uses_the_gap_to_the_previous_close(self):
        out = ind.atr([10, 20, 20], [9, 19, 19], [9.5, 19.5, 19.5], 2)
        # TR[1] = max(1, |20-9.5|, |19-9.5|) = 10.5 ; TR[2] = 1 ; ATR[2] = mean(10.5, 1)
        self.assertAlmostEqual(out[2], 5.75)

    def test_bollinger_uses_population_deviation(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        out = ind.bollinger(x, 5, 2.0)
        sd = math.sqrt(2.0)  # population variance of 1..5 is 2
        self.assertAlmostEqual(out["mid"][4], 3.0)
        self.assertAlmostEqual(out["upper"][4], 3.0 + 2 * sd)
        self.assertAlmostEqual(out["lower"][4], 3.0 - 2 * sd)
        self.assertAlmostEqual(out["percentB"][4], (5.0 - (3.0 - 2 * sd)) / (4 * sd))
        self.assertAlmostEqual(out["width"][4], 4 * sd / 3.0)

    def test_bollinger_flat_series_has_no_percent_b(self):
        out = ind.bollinger([2.0] * 25, 20, 2.0)
        self.assertIsNone(out["percentB"][24])
        self.assertAlmostEqual(out["width"][24], 0.0)


class AdxSupertrendTests(unittest.TestCase):
    def test_adx_indexes_and_a_clean_uptrend(self):
        n = 14
        h = [10.0 + i + 0.5 for i in range(60)]
        l = [10.0 + i - 0.5 for i in range(60)]
        c = [10.0 + i for i in range(60)]
        out = ind.adx(h, l, c, n)
        self.assertIsNone(out["plusDi"][n - 1])
        self.assertIsNotNone(out["plusDi"][n])
        self.assertIsNone(out["adx"][2 * n - 2])
        self.assertIsNotNone(out["adx"][2 * n - 1])
        self.assertAlmostEqual(out["adx"][59], 100.0, places=6)
        self.assertGreater(out["plusDi"][59], out["minusDi"][59])
        self.assertAlmostEqual(out["minusDi"][59], 0.0)

    def test_adx_short_input(self):
        out = ind.adx([1.0] * 10, [0.5] * 10, [0.8] * 10, 14)
        self.assertTrue(all(v is None for v in out["adx"]))

    def test_supertrend_starts_up_flips_down_on_a_collapse_and_back_up(self):
        n = 10
        c = [100.0] * 20 + [100.0 - 5 * i for i in range(1, 8)] + [65.0 + 10 * i for i in range(1, 12)]
        h = [v + 0.5 for v in c]
        l = [v - 0.5 for v in c]
        out = ind.supertrend(h, l, c, n, 3.0)
        self.assertIsNone(out["dir"][n - 1])
        self.assertEqual(out["dir"][n], 1.0)
        self.assertIn(-1.0, out["dir"])
        self.assertEqual(out["dir"][-1], 1.0)
        for i in range(n, len(c)):
            if out["dir"][i] == 1.0:
                self.assertLess(out["line"][i], h[i])
            else:
                self.assertGreater(out["line"][i], l[i])

    def test_donchian(self):
        out = ind.donchian([1, 5, 3, 4], [0, 2, 1, 3], 3)
        self.assertEqual(out["upper"][2], 5)
        self.assertEqual(out["lower"][3], 1)
        self.assertIsNone(out["upper"][1])


if __name__ == "__main__":
    unittest.main()
