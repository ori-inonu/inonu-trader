import json
import subprocess
import sys
import unittest
from pathlib import Path

from jev_analytics import pack as P

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "python" / "tests" / "vectors" / "pack-sample.v1.json"


class PackSampleTests(unittest.TestCase):
    def test_the_sample_files_are_exactly_what_the_producer_emits(self):
        done = subprocess.run([sys.executable, str(ROOT / "python" / "tools" / "make_pack_sample.py"), "--check"], capture_output=True, text=True, cwd=ROOT / "python")
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)

    def test_the_sample_is_a_valid_complete_pack(self):
        data = json.loads(SAMPLE.read_text(encoding="utf8"))
        self.assertEqual(data["origin"], "synthetic_fixture")
        pack = data["pack"]
        self.assertEqual(P.validate_pack(pack), [])
        self.assertEqual(sorted(pack["instruments"]), ["BTC-USDT", "ETH-USDT", "MON-USDT"])
        self.assertEqual(pack["instruments"]["BTC-USDT"]["completeness"], 1.0)
        self.assertEqual(pack["instruments"]["ETH-USDT"]["completeness"], 1.0)
        mon = pack["instruments"]["MON-USDT"]
        self.assertLess(mon["completeness"], 1.0)  # not a rubik coin in the fake API: nulls with reasons are part of the contract
        self.assertEqual(mon["unavailable"]["derivatives.oiChange1hPct"], "unsupported_coin")
        self.assertIsNone(mon["features"]["derivatives"]["oiChange1hPct"])
        self.assertIsNotNone(mon["features"]["derivatives"]["fundingZ"])
        self.assertIsNone(pack["instruments"]["BTC-USDT"]["features"]["crossAsset"])
        self.assertIsNotNone(pack["instruments"]["ETH-USDT"]["features"]["crossAsset"])


if __name__ == "__main__":
    unittest.main()
