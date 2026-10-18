import json
import subprocess
import sys
import unittest
from pathlib import Path

from jev_analytics import indicators, transforms

ROOT = Path(__file__).resolve().parents[2]
VECTORS = ROOT / "python" / "tests" / "vectors" / "chart-vectors.v1.json"


def close(a, b, tol):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= tol["abs"] + tol["rel"] * abs(b)


def flatten(value):
    if isinstance(value, dict):
        for key in sorted(value):
            yield from flatten(value[key])
    elif isinstance(value, list):
        for item in value:
            yield from flatten(item)
    else:
        yield value


class GoldenVectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(VECTORS.read_text(encoding="utf8"))
        cls.s = cls.data["candles"]

    def test_the_vector_files_are_in_sync_with_the_generator(self):
        done = subprocess.run([sys.executable, str(ROOT / "python" / "tools" / "make_vectors.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)

    def test_inputs_are_labelled_synthetic_and_well_formed(self):
        self.assertEqual(self.data["origin"], "synthetic_fixture")
        n = len(self.s["close"])
        for key in ("ts", "open", "high", "low", "close", "volume"):
            self.assertEqual(len(self.s[key]), n)
        for i in range(n):
            self.assertGreaterEqual(self.s["high"][i], max(self.s["open"][i], self.s["close"][i]))
            self.assertLessEqual(self.s["low"][i], min(self.s["open"][i], self.s["close"][i]))

    def test_every_case_reproduces_from_the_implementation(self):
        o, h, l, c, ts = (self.s[k] for k in ("open", "high", "low", "close", "ts"))
        tol = self.data["tolerance"]
        for case in self.data["cases"]:
            fn, p = case["fn"], case["params"]
            if fn == "sma":
                got = indicators.sma(c, p["n"])
            elif fn == "ema":
                got = indicators.ema(c, p["n"])
            elif fn == "rsi":
                got = indicators.rsi(c, p["n"])
            elif fn == "macd":
                got = indicators.macd(c, p["fast"], p["slow"], p["signal"])
            elif fn == "atr":
                got = indicators.atr(h, l, c, p["n"])
            elif fn == "bollinger":
                got = indicators.bollinger(c, p["n"], p["k"])
            elif fn == "supertrend":
                got = indicators.supertrend(h, l, c, p["n"], p["mult"])
            elif fn == "heikinAshi":
                got = transforms.heikin_ashi(o, h, l, c)
            elif fn == "renko":
                got = transforms.renko(c, ts, p["size"])
            elif fn == "niceStep":
                got = [transforms.nice_step(v) for v in p["values"]]
            elif fn == "renkoBrickSize":
                last = max(i for i, ok in enumerate(p["confirmed"]) if ok)
                if p["mode"] == "atr":
                    got = transforms.nice_step(indicators.atr(h[:last + 1], l[:last + 1], c[:last + 1], 14)[-1])
                else:
                    got = transforms.nice_step(p["pct"] / 100.0 * c[last])
            else:
                self.fail(f"unknown fn {fn}")
            want = case["expected"]
            a, b = list(flatten(got)), list(flatten(want))
            self.assertEqual(len(a), len(b), case["name"])
            for x, y in zip(a, b):
                self.assertTrue(close(x, y, tol), f"{case['name']}: {x} vs {y}")

    def test_windows_start_where_the_spec_says(self):
        by = {c["name"]: c["expected"] for c in self.data["cases"]}
        self.assertEqual(by["sma20"].index(next(v for v in by["sma20"] if v is not None)), 19)
        self.assertEqual(next(i for i, v in enumerate(by["rsi14"]) if v is not None), 14)
        self.assertEqual(next(i for i, v in enumerate(by["atr14"]) if v is not None), 14)
        self.assertEqual(next(i for i, v in enumerate(by["macd12_26_9"]["signal"]) if v is not None), 33)
        self.assertEqual(next(i for i, v in enumerate(by["supertrend10_3"]["dir"]) if v is not None), 10)
        self.assertEqual(next(i for i, v in enumerate(by["ema200"]) if v is not None), 199)

    def test_the_series_exercises_both_renko_directions_and_supertrend_flips(self):
        by = {c["name"]: c["expected"] for c in self.data["cases"]}
        self.assertGreater(len(by["renko_1.0"]), 10)
        self.assertEqual({b["dir"] for b in by["renko_1.0"]}, {1.0, -1.0})
        self.assertEqual({d for d in by["supertrend10_3"]["dir"] if d is not None}, {1.0, -1.0})


if __name__ == "__main__":
    unittest.main()
