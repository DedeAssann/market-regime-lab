#!/usr/bin/env python3
"""Fetch EUR/USD H4 candles and compute an interpretable market regime.

Only completed candles are included. With --demo, a deterministic synthetic
series is generated so the dashboard can be developed without credentials.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import statistics
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "market.json"


def fetch_twelve_data(api_key: str, symbol: str = "EUR/USD", outputsize: int = 2200) -> list[dict]:
    query = urllib.parse.urlencode({
        "symbol": symbol,
        "interval": "4h",
        "outputsize": outputsize,
        "timezone": "UTC",
        "apikey": api_key,
        "format": "JSON",
    })
    request = urllib.request.Request(
        f"https://api.twelvedata.com/time_series?{query}",
        headers={"User-Agent": "market-regime-lab/0.1"},
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        payload = json.load(response)
    if payload.get("status") == "error" or "values" not in payload:
        raise RuntimeError(payload.get("message", "Réponse Twelve Data invalide"))
    rows = []
    for item in reversed(payload["values"]):
        rows.append({
            "time": datetime.fromisoformat(item["datetime"]).replace(tzinfo=timezone.utc),
            "open": float(item["open"]), "high": float(item["high"]),
            "low": float(item["low"]), "close": float(item["close"]),
        })
    # Twelve Data can return the currently forming candle: exclude it.
    now = datetime.now(timezone.utc)
    return [row for row in rows if row["time"] + timedelta(hours=4) <= now]


def demo_candles(count: int = 2200) -> list[dict]:
    rng = random.Random(20260924)
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=4 * count)
    price = 1.082
    rows = []
    regimes = [(420, .000055, .00075), (300, -.00004, .0009), (360, .000005, .00042), (500, .000075, .00078), (300, -.00009, .00105), (320, .000035, .00062)]
    parameters = []
    for duration, drift, vol in regimes:
        parameters.extend([(drift, vol)] * duration)
    parameters = (parameters * math.ceil(count / len(parameters)))[:count]
    for i, (drift, vol) in enumerate(parameters):
        open_ = price
        shock = rng.gauss(drift, vol)
        close = max(.85, open_ + shock)
        wick = abs(rng.gauss(0, vol * .42))
        rows.append({"time": start + timedelta(hours=4 * i), "open": open_, "high": max(open_, close) + wick, "low": min(open_, close) - wick * .85, "close": close})
        price = close
    return rows


def ema(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < period: return out
    current = statistics.fmean(values[:period]); out[period - 1] = current
    alpha = 2 / (period + 1)
    for i in range(period, len(values)):
        current = alpha * values[i] + (1 - alpha) * current; out[i] = current
    return out


def wilder(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < period: return out
    current = statistics.fmean(values[:period]); out[period - 1] = current
    for i in range(period, len(values)):
        current = (current * (period - 1) + values[i]) / period; out[i] = current
    return out


def percentile_rank(history: list[float], value: float) -> float:
    return 100 * sum(v <= value for v in history) / len(history)


def classify(close: float, ema50: float, slope: float, rsi: float, atr_pct: float) -> tuple[str, float]:
    above = close > ema50
    strength = min(abs(slope) / .09, 1)
    if slope > .035 and above:
        name = "Hausse volatile" if atr_pct >= 75 else ("Repli haussier" if rsi < 48 else "Hausse stable")
        agreement = .55 + .18 * strength + (.12 if rsi >= 42 else 0) + (.08 if above else 0)
    elif slope < -.035 and not above:
        name = "Choc baissier" if atr_pct >= 75 else ("Rebond baissier" if rsi > 52 else "Baisse stable")
        agreement = .55 + .18 * strength + (.12 if rsi <= 58 else 0) + (.08 if not above else 0)
    elif abs(slope) <= .025 and atr_pct < 55:
        name = "Range calme"; agreement = .58 + min((.025 - abs(slope)) / .025, 1) * .22
    else:
        name = "Indéterminé"; agreement = .48 + min(abs(slope) / .08, 1) * .12
    return name, round(min(agreement, .91) * 100, 1)


def enrich(rows: list[dict]) -> list[dict]:
    closes = [r["close"] for r in rows]
    ema50 = ema(closes, 50)
    true_ranges = []
    gains, losses = [], []
    for i, row in enumerate(rows):
        previous = closes[i - 1] if i else row["open"]
        true_ranges.append(max(row["high"] - row["low"], abs(row["high"] - previous), abs(row["low"] - previous)))
        change = closes[i] - previous; gains.append(max(change, 0)); losses.append(max(-change, 0))
    atr = wilder(true_ranges, 14)
    avg_gain, avg_loss = wilder(gains, 14), wilder(losses, 14)
    output = []
    for i, row in enumerate(rows):
        if i < 105 or ema50[i] is None or atr[i] in (None, 0) or avg_gain[i] is None or avg_loss[i] is None: continue
        rs = avg_gain[i] / avg_loss[i] if avg_loss[i] else 999
        rsi = 100 - 100 / (1 + rs)
        lookback = [v for v in atr[max(13, i - 252):i + 1] if v is not None]
        atr_pct = percentile_rank(lookback, atr[i])
        slope = (ema50[i] - ema50[i - 6]) / (6 * atr[i])
        regime, confidence = classify(row["close"], ema50[i], slope, rsi, atr_pct)
        output.append({
            "time": row["time"].isoformat().replace("+00:00", "Z"),
            **{k: round(row[k], 6) for k in ("open", "high", "low", "close")},
            "ema50": round(ema50[i], 6), "atr": round(atr[i], 6), "rsi": round(rsi, 2),
            "atr_percentile": round(atr_pct, 1), "slope_atr": round(slope, 5),
            "regime": regime, "confidence": confidence,
        })
    return output


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--demo", action="store_true"); args = parser.parse_args()
    api_key = os.getenv("TWELVE_DATA_API_KEY", "")
    demo = args.demo or not api_key
    rows = demo_candles() if demo else fetch_twelve_data(api_key)
    candles = enrich(rows)
    if len(candles) < 100: raise RuntimeError("Historique insuffisant après calcul des indicateurs")
    payload = {"symbol": "EUR/USD", "interval": "4h", "source": "synthetic-demo" if demo else "Twelve Data", "demo": demo, "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "candles": candles}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(candles)} completed candles to {OUTPUT}")


if __name__ == "__main__": main()
