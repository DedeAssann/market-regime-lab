import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from update_data import classify, demo_candles, enrich  # noqa: E402


class RegimeEngineTests(unittest.TestCase):
    def test_demo_pipeline_produces_finite_indicators(self):
        candles = enrich(demo_candles(500))
        self.assertGreater(len(candles), 350)
        for row in candles:
            for key in ("ema50", "atr", "rsi", "atr_percentile", "slope_atr", "confidence"):
                self.assertTrue(math.isfinite(row[key]), key)
            self.assertGreaterEqual(row["rsi"], 0)
            self.assertLessEqual(row["rsi"], 100)

    def test_clear_uptrend_is_classified_as_bullish(self):
        regime, confidence = classify(1.11, 1.10, .09, 61, 50)
        self.assertEqual(regime, "Hausse stable")
        self.assertGreaterEqual(confidence, 70)

    def test_clear_downtrend_is_classified_as_bearish(self):
        regime, confidence = classify(1.09, 1.10, -.09, 39, 50)
        self.assertEqual(regime, "Baisse stable")
        self.assertGreaterEqual(confidence, 70)

    def test_flat_quiet_market_is_range(self):
        regime, _ = classify(1.1001, 1.10, .005, 51, 25)
        self.assertEqual(regime, "Range calme")


if __name__ == "__main__":
    unittest.main()
